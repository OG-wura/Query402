import type { QueryMode, SignedGrant } from "@query402/shared";
import { signedGrantSchema } from "@query402/shared";
import { config } from "../config.js";
import { getProviderById } from "../pricing.js";
import { isNonceConsumed, wouldExceedBudget } from "./budget.js";
import { verifyGrant } from "./grant.js";
import { getCachedIdempotencyResponse } from "./idempotency.js";
import { isSponsorshipStorageAvailable } from "./store.js";

export type PolicyDecision =
  | "allowed"
  | "denied_sponsorship_disabled"
  | "denied_storage_unavailable"
  | "denied_invalid_grant"
  | "denied_wrong_wallet"
  | "denied_wrong_network"
  | "denied_wrong_provider"
  | "denied_price_exceeded"
  | "denied_expired"
  | "denied_nonce_replay"
  | "denied_budget_exceeded"
  | "idempotency_hit";

export interface PolicyResult {
  allowed: boolean;
  statusCode: number;
  decision: PolicyDecision;
  error?: string;
  grantId?: string;
  quotedPriceUsd?: number;
  cachedResponse?: {
    statusCode: number;
    body: unknown;
  };
}

export interface AuthorizeSponsoredRunInput {
  signedGrant: SignedGrant;
  wallet: string;
  mode: QueryMode;
  provider: string;
  idempotencyKey?: string;
}

function deny(
  decision: PolicyDecision,
  statusCode: number,
  error: string,
  extra: Partial<PolicyResult> = {}
): PolicyResult {
  return {
    allowed: false,
    statusCode,
    decision,
    error,
    ...extra
  };
}

/** Re-export for route handlers. */
export { isSponsorshipStorageAvailable } from "./store.js";

function checkNonceNotConsumed(nonce: string, grantId: string): PolicyResult | null {
  try {
    if (isNonceConsumed(nonce)) {
      return deny("denied_nonce_replay", 409, "nonce_replay", { grantId });
    }

    return null;
  } catch {
    return deny("denied_storage_unavailable", 503, "sponsorship_storage_unavailable");
  }
}

function checkBudget(wallet: string, amountUsd: number, grantId: string): PolicyResult | null {
  try {
    const exceeded = wouldExceedBudget(wallet, amountUsd);

    if (exceeded) {
      return deny("denied_budget_exceeded", 429, `${exceeded}_budget_exceeded`, { grantId });
    }

    return null;
  } catch {
    return deny("denied_storage_unavailable", 503, "sponsorship_storage_unavailable");
  }
}

function checkIdempotency(
  idempotencyKey: string | undefined,
  requestHash: string,
  grantId: string
): PolicyResult | null {
  if (!idempotencyKey) {
    return null;
  }

  try {
    const cached = getCachedIdempotencyResponse(idempotencyKey, requestHash);

    if (cached.hit) {
      return {
        allowed: true,
        statusCode: cached.statusCode,
        decision: "idempotency_hit",
        grantId,
        cachedResponse: {
          statusCode: cached.statusCode,
          body: cached.body
        }
      };
    }

    if (cached.conflict) {
      return deny("denied_invalid_grant", 409, "idempotency_key_conflict", { grantId });
    }

    return null;
  } catch {
    return deny("denied_storage_unavailable", 503, "sponsorship_storage_unavailable");
  }
}

function buildRequestHash(input: AuthorizeSponsoredRunInput): string {
  return JSON.stringify({
    wallet: input.wallet,
    mode: input.mode,
    provider: input.provider,
    grantId: input.signedGrant.grant.grantId,
    nonce: input.signedGrant.grant.nonce
  });
}

export function authorizeSponsoredRun(input: AuthorizeSponsoredRunInput): PolicyResult {
  if (!config.sponsorshipEnabled) {
    return deny("denied_sponsorship_disabled", 503, "sponsorship_disabled");
  }

  if (!isSponsorshipStorageAvailable()) {
    return deny("denied_storage_unavailable", 503, "sponsorship_storage_unavailable");
  }

  const parsedGrant = signedGrantSchema.safeParse(input.signedGrant);
  if (!parsedGrant.success || !verifyGrant(parsedGrant.data)) {
    return deny("denied_invalid_grant", 403, "invalid_grant");
  }

  const { grant } = parsedGrant.data;

  if (input.wallet !== grant.wallet) {
    return deny("denied_wrong_wallet", 403, "wrong_wallet", { grantId: grant.grantId });
  }

  if (grant.network !== config.STELLAR_NETWORK) {
    return deny("denied_wrong_network", 403, "wrong_network", { grantId: grant.grantId });
  }

  if (grant.mode && grant.mode !== input.mode) {
    return deny("denied_wrong_provider", 403, "wrong_mode", { grantId: grant.grantId });
  }

  if (grant.providerId && grant.providerId !== input.provider) {
    return deny("denied_wrong_provider", 403, "wrong_provider", { grantId: grant.grantId });
  }

  const provider = getProviderById(input.provider);
  if (!provider || provider.category !== input.mode) {
    return deny("denied_wrong_provider", 403, "unknown_provider", { grantId: grant.grantId });
  }

  if (provider.priceUsd > grant.maxAmountUsd) {
    return deny("denied_price_exceeded", 403, "price_exceeds_grant", {
      grantId: grant.grantId,
      quotedPriceUsd: provider.priceUsd
    });
  }

  if (new Date(grant.expiresAt).getTime() <= Date.now()) {
    return deny("denied_expired", 403, "grant_expired", { grantId: grant.grantId });
  }

  const nonceResult = checkNonceNotConsumed(grant.nonce, grant.grantId);
  if (nonceResult) {
    return nonceResult;
  }

  const budgetResult = checkBudget(grant.wallet, provider.priceUsd, grant.grantId);
  if (budgetResult) {
    return budgetResult;
  }

  const idempotencyResult = checkIdempotency(
    input.idempotencyKey,
    buildRequestHash(input),
    grant.grantId
  );
  if (idempotencyResult) {
    return idempotencyResult;
  }

  return {
    allowed: true,
    statusCode: 200,
    decision: "allowed",
    grantId: grant.grantId,
    quotedPriceUsd: provider.priceUsd
  };
}
