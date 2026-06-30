import { describe, expect, it } from "vitest";
import {
  latencyBandSchema,
  newsQuerySchema,
  paymentModeSchema,
  providerCategorySchema,
  providerSchema,
  queryModeSchema,
  reliabilityBandSchema,
  scrapeQuerySchema,
  searchQuerySchema,
  signedGrantSchema,
  slaBadgesSchema,
  sponsorshipChallengeSchema,
  sponsorshipGrantSchema
} from "./schemas.js";

const validProvider = {
  id: "search.basic",
  name: "Basic Search",
  category: "search" as const,
  priceUsd: 0.01,
  description: "Fast search",
  latencyEstimateMs: 700,
  qualityScore: 75,
  sourceType: "deterministic-fallback" as const,
  enabled: true,
  slaBadges: {
    latencyBand: "fast" as const,
    latencyLabel: "Fast response",
    reliabilityBand: "fallback" as const,
    reliabilityLabel: "Fallback cached",
    paymentMode: "x402" as const,
    paymentLabel: "Pay-per-query (x402)"
  }
};

const validGrant = {
  grantId: "550e8400-e29b-41d4-a716-446655440000",
  wallet: `G${"A".repeat(55)}`,
  network: "stellar:testnet",
  maxAmountUsd: 1,
  expiresAt: "2026-12-31T12:00:00.000Z",
  nonce: "650e8400-e29b-41d4-a716-446655440001",
  issuedAt: "2026-06-01T12:00:00.000Z"
};

describe("queryModeSchema", () => {
  it("accepts supported query modes", () => {
    expect(queryModeSchema.parse("search")).toBe("search");
    expect(queryModeSchema.parse("news")).toBe("news");
    expect(queryModeSchema.parse("scrape")).toBe("scrape");
  });

  it("rejects unsupported modes", () => {
    expect(queryModeSchema.safeParse("chat").success).toBe(false);
  });
});

describe("providerCategorySchema", () => {
  it("matches query mode categories", () => {
    expect(providerCategorySchema.parse("search")).toBe("search");
    expect(providerCategorySchema.parse("news")).toBe("news");
    expect(providerCategorySchema.parse("scrape")).toBe("scrape");
  });
});

describe("providerSchema", () => {
  it("accepts a valid provider definition", () => {
    expect(providerSchema.parse(validProvider)).toEqual(validProvider);
  });

  it("rejects invalid category and non-positive pricing", () => {
    expect(providerSchema.safeParse({ ...validProvider, category: "chat" }).success).toBe(false);
    expect(providerSchema.safeParse({ ...validProvider, priceUsd: 0 }).success).toBe(false);
  });
});

describe("latencyBandSchema", () => {
  it("accepts valid latency bands", () => {
    expect(latencyBandSchema.parse("fast")).toBe("fast");
    expect(latencyBandSchema.parse("standard")).toBe("standard");
    expect(latencyBandSchema.parse("slow")).toBe("slow");
  });

  it("rejects invalid latency bands", () => {
    expect(latencyBandSchema.safeParse("ultra").success).toBe(false);
  });
});

describe("reliabilityBandSchema", () => {
  it("accepts valid reliability bands", () => {
    expect(reliabilityBandSchema.parse("demo")).toBe("demo");
    expect(reliabilityBandSchema.parse("fallback")).toBe("fallback");
    expect(reliabilityBandSchema.parse("live")).toBe("live");
  });

  it("rejects invalid reliability bands", () => {
    expect(reliabilityBandSchema.safeParse("unknown").success).toBe(false);
  });
});

describe("paymentModeSchema", () => {
  it("accepts valid payment modes", () => {
    expect(paymentModeSchema.parse("demo")).toBe("demo");
    expect(paymentModeSchema.parse("x402")).toBe("x402");
    expect(paymentModeSchema.parse("sponsored")).toBe("sponsored");
  });

  it("rejects invalid payment modes", () => {
    expect(paymentModeSchema.safeParse("credit").success).toBe(false);
  });
});

describe("slaBadgesSchema", () => {
  it("accepts a complete SLA badges object", () => {
    const badges = {
      latencyBand: "fast",
      latencyLabel: "Fast response",
      reliabilityBand: "live",
      reliabilityLabel: "Live results",
      paymentMode: "x402",
      paymentLabel: "Pay-per-query (x402)"
    };
    expect(slaBadgesSchema.parse(badges)).toEqual(badges);
  });

  it("rejects an SLA badges object with missing fields", () => {
    expect(slaBadgesSchema.safeParse({ latencyBand: "fast" }).success).toBe(false);
  });
});

describe("searchQuerySchema", () => {
  it("requires provider and a query of at least two characters", () => {
    expect(searchQuerySchema.parse({ provider: "search.basic", q: "stellar" })).toEqual({
      provider: "search.basic",
      q: "stellar"
    });
    expect(searchQuerySchema.safeParse({ provider: "search.basic", q: "x" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "stellar" }).success).toBe(false);
  });
});

describe("newsQuerySchema", () => {
  it("requires provider and a query of at least two characters", () => {
    expect(newsQuerySchema.parse({ provider: "news.fast", q: "payments" })).toEqual({
      provider: "news.fast",
      q: "payments"
    });
  });
});

describe("scrapeQuerySchema", () => {
  it("requires provider and a valid URL", () => {
    expect(
      scrapeQuerySchema.parse({ provider: "scrape.page", url: "https://example.com/page" })
    ).toEqual({ provider: "scrape.page", url: "https://example.com/page" });
    expect(scrapeQuerySchema.safeParse({ provider: "scrape.page", url: "not-a-url" }).success).toBe(
      false
    );
  });
});

describe("sponsorshipGrantSchema", () => {
  it("accepts a valid grant payload", () => {
    expect(sponsorshipGrantSchema.parse(validGrant)).toEqual(validGrant);
  });

  it("rejects invalid Stellar public keys", () => {
    expect(
      sponsorshipGrantSchema.safeParse({ ...validGrant, wallet: "invalid-wallet" }).success
    ).toBe(false);
  });
});

describe("signedGrantSchema", () => {
  it("accepts a signed grant envelope", () => {
    expect(signedGrantSchema.parse({ grant: validGrant, signature: "test-signature" })).toEqual({
      grant: validGrant,
      signature: "test-signature"
    });
  });
});

describe("sponsorshipChallengeSchema", () => {
  it("accepts a sponsorship challenge payload", () => {
    expect(
      sponsorshipChallengeSchema.parse({
        challengeId: "750e8400-e29b-41d4-a716-446655440002",
        wallet: validGrant.wallet,
        message: "Sign to request sponsorship",
        expiresAt: "2026-12-31T12:00:00.000Z"
      })
    ).toMatchObject({ message: "Sign to request sponsorship" });
  });
});
