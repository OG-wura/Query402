import type { Request, Response } from "express";
import type { PaidRequestFingerprintInput } from "@query402/shared";
import { buildPaidRequestFingerprint, hashPaidRequestFingerprint } from "@query402/shared";
import {
  acquireIdempotencyLock,
  cacheIdempotencyResponse,
  getCachedIdempotencyResponse,
  isIdempotencyStorageAvailable,
  releaseIdempotencyLock
} from "./service.js";

export function readIdempotencyKey(req: Request): string | undefined {
  const key = req.get("Idempotency-Key")?.trim();
  return key ? key : undefined;
}

export function buildRequestHash(input: PaidRequestFingerprintInput): string {
  return hashPaidRequestFingerprint(buildPaidRequestFingerprint(input));
}

export type IdempotencyGateResult =
  | { action: "continue" }
  | { action: "respond"; statusCode: number; body: unknown }
  | { action: "error"; statusCode: number; body: unknown };

export function beginIdempotency(
  req: Request,
  fingerprintInput: PaidRequestFingerprintInput
): IdempotencyGateResult {
  const idempotencyKey = readIdempotencyKey(req);
  if (!idempotencyKey) {
    return { action: "continue" };
  }

  if (!isIdempotencyStorageAvailable()) {
    return {
      action: "error",
      statusCode: 503,
      body: { error: "idempotency_storage_unavailable" }
    };
  }

  const requestHash = buildRequestHash(fingerprintInput);
  const cached = getCachedIdempotencyResponse(idempotencyKey, requestHash);
  if (cached.hit) {
    return { action: "respond", statusCode: cached.statusCode, body: cached.body };
  }

  if (cached.conflict) {
    return {
      action: "error",
      statusCode: 409,
      body: { error: "idempotency_key_conflict" }
    };
  }

  const acquired = acquireIdempotencyLock(idempotencyKey, requestHash);
  if (acquired.state === "cached") {
    return { action: "respond", statusCode: acquired.statusCode, body: acquired.body };
  }

  if (acquired.state === "conflict") {
    return {
      action: "error",
      statusCode: 409,
      body: { error: "idempotency_key_conflict" }
    };
  }

  if (acquired.state === "in_progress") {
    return {
      action: "error",
      statusCode: 409,
      body: { error: "idempotency_in_progress" }
    };
  }

  return { action: "continue" };
}

export function completeIdempotency(
  req: Request,
  fingerprintInput: PaidRequestFingerprintInput,
  statusCode: number,
  body: unknown
): void {
  const idempotencyKey = readIdempotencyKey(req);
  if (!idempotencyKey) {
    return;
  }

  cacheIdempotencyResponse(idempotencyKey, buildRequestHash(fingerprintInput), statusCode, body);
}

export function abortIdempotency(req: Request): void {
  const idempotencyKey = readIdempotencyKey(req);
  if (!idempotencyKey) {
    return;
  }

  releaseIdempotencyLock(idempotencyKey);
}

export function respondIdempotencyGate(res: Response, gate: IdempotencyGateResult) {
  if (gate.action === "continue") {
    return false;
  }

  res.status(gate.statusCode).json(gate.body);
  return true;
}
