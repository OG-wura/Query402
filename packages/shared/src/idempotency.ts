import type { QueryMode } from "./types.js";

export interface PaidRequestFingerprintInput {
  method: "GET" | "POST";
  route: string;
  mode: QueryMode;
  provider: string;
  query?: string;
  url?: string;
  payer: string;
  network: string;
  quotedAmountUsd: number;
}

export interface PaidRequestFingerprint {
  method: "GET" | "POST";
  route: string;
  provider: string;
  input: {
    q?: string;
    url?: string;
  };
  payer: string;
  network: string;
  quotedAmountUsd: number;
}

function normalizeQueryInput(mode: QueryMode, query?: string, url?: string) {
  if (mode === "scrape") {
    return { url: url?.trim() };
  }

  return { q: query?.trim() };
}

export function buildPaidRequestFingerprint(
  input: PaidRequestFingerprintInput
): PaidRequestFingerprint {
  return {
    method: input.method,
    route: input.route,
    provider: input.provider,
    input: normalizeQueryInput(input.mode, input.query, input.url),
    payer: input.payer,
    network: input.network,
    quotedAmountUsd: Number(input.quotedAmountUsd.toFixed(6))
  };
}

export function hashPaidRequestFingerprint(fingerprint: PaidRequestFingerprint): string {
  return JSON.stringify(fingerprint);
}
