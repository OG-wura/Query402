import { config } from "../config.js";
import { getSponsorshipDb } from "../sponsorship/store.js";

const PENDING_STATUS_CODE = 0;

export interface CachedIdempotencyResponse {
  hit: true;
  statusCode: number;
  body: unknown;
}

export interface IdempotencyMiss {
  hit: false;
  conflict?: boolean;
}

export type IdempotencyAcquireResult =
  | { state: "acquired" }
  | { state: "cached"; statusCode: number; body: unknown }
  | { state: "in_progress" }
  | { state: "conflict" };

function ttlSeconds() {
  return config.IDEMPOTENCY_TTL_SECONDS;
}

export function isIdempotencyStorageAvailable(): boolean {
  try {
    getSponsorshipDb();
    return true;
  } catch {
    return false;
  }
}

export function acquireIdempotencyLock(
  key: string,
  requestHash: string,
  ttl = ttlSeconds()
): IdempotencyAcquireResult {
  const database = getSponsorshipDb();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const existing = database
    .prepare(
      `SELECT request_hash, response_json, status_code, expires_at
       FROM idempotency_keys
       WHERE key = ?`
    )
    .get(key) as
    | {
        request_hash: string;
        response_json: string;
        status_code: number;
        expires_at: string;
      }
    | undefined;

  if (existing) {
    if (new Date(existing.expires_at).getTime() <= Date.now()) {
      database.prepare(`DELETE FROM idempotency_keys WHERE key = ?`).run(key);
    } else if (existing.request_hash !== requestHash) {
      return { state: "conflict" };
    } else if (existing.status_code > PENDING_STATUS_CODE) {
      return {
        state: "cached",
        statusCode: existing.status_code,
        body: JSON.parse(existing.response_json) as unknown
      };
    } else {
      return { state: "in_progress" };
    }
  }

  const inserted = database
    .prepare(
      `INSERT OR IGNORE INTO idempotency_keys (key, request_hash, response_json, status_code, expires_at)
       VALUES (?, ?, '{}', ?, ?)`
    )
    .run(key, requestHash, PENDING_STATUS_CODE, expiresAt);

  if (inserted.changes === 1) {
    return { state: "acquired" };
  }

  return { state: "in_progress" };
}

export function releaseIdempotencyLock(key: string): void {
  const database = getSponsorshipDb();
  database
    .prepare(`DELETE FROM idempotency_keys WHERE key = ? AND status_code = ?`)
    .run(key, PENDING_STATUS_CODE);
}

export function getCachedIdempotencyResponse(
  key: string,
  requestHash: string
): CachedIdempotencyResponse | IdempotencyMiss {
  const database = getSponsorshipDb();
  const row = database
    .prepare(
      `SELECT request_hash, response_json, status_code, expires_at
       FROM idempotency_keys
       WHERE key = ?`
    )
    .get(key) as
    | {
        request_hash: string;
        response_json: string;
        status_code: number;
        expires_at: string;
      }
    | undefined;

  if (!row) {
    return { hit: false };
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    database.prepare(`DELETE FROM idempotency_keys WHERE key = ?`).run(key);
    return { hit: false };
  }

  if (row.request_hash !== requestHash) {
    return { hit: false, conflict: true };
  }

  if (row.status_code <= PENDING_STATUS_CODE) {
    return { hit: false };
  }

  return {
    hit: true,
    statusCode: row.status_code,
    body: JSON.parse(row.response_json) as unknown
  };
}

export function cacheIdempotencyResponse(
  key: string,
  requestHash: string,
  statusCode: number,
  body: unknown,
  ttl = ttlSeconds()
): void {
  const database = getSponsorshipDb();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  database
    .prepare(
      `INSERT INTO idempotency_keys (key, request_hash, response_json, status_code, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         request_hash = excluded.request_hash,
         response_json = excluded.response_json,
         status_code = excluded.status_code,
         expires_at = excluded.expires_at`
    )
    .run(key, requestHash, JSON.stringify(body), statusCode, expiresAt);
}

export function getResponseByPaymentProof(transactionHash: string): unknown | null {
  const database = getSponsorshipDb();
  const row = database
    .prepare(`SELECT response_json FROM payment_proofs WHERE transaction_hash = ?`)
    .get(transactionHash) as { response_json: string } | undefined;

  if (!row) {
    return null;
  }

  return JSON.parse(row.response_json) as unknown;
}

export function savePaymentProofResponse(transactionHash: string, body: unknown): void {
  const database = getSponsorshipDb();
  database
    .prepare(
      `INSERT INTO payment_proofs (transaction_hash, response_json, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(transaction_hash) DO NOTHING`
    )
    .run(transactionHash, JSON.stringify(body), new Date().toISOString());
}
