import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applySponsorshipTestEnv,
  resetSponsorshipStore
} from "../../test/sponsorship-test-helpers.js";

describe("idempotency service", () => {
  let dbPath: string | undefined;

  afterEach(async () => {
    await resetSponsorshipStore(dbPath);
    dbPath = undefined;
  });

  it("returns conflict when the same key is bound to a different request hash", async () => {
    dbPath = applySponsorshipTestEnv();
    const { acquireIdempotencyLock, cacheIdempotencyResponse, getCachedIdempotencyResponse } =
      await import("./service.js");

    const key = randomUUID();
    const firstHash = "hash-a";
    const secondHash = "hash-b";

    expect(acquireIdempotencyLock(key, firstHash).state).toBe("acquired");
    cacheIdempotencyResponse(key, firstHash, 200, { ok: true });

    expect(getCachedIdempotencyResponse(key, secondHash)).toEqual({
      hit: false,
      conflict: true
    });
    expect(acquireIdempotencyLock(key, secondHash).state).toBe("conflict");
  });

  it("allows a fresh lock after the record expires", async () => {
    dbPath = applySponsorshipTestEnv({ IDEMPOTENCY_TTL_SECONDS: "1" });
    const { acquireIdempotencyLock, cacheIdempotencyResponse, getCachedIdempotencyResponse } =
      await import("./service.js");

    const key = randomUUID();
    const requestHash = "hash-expired";

    expect(acquireIdempotencyLock(key, requestHash, 1).state).toBe("acquired");
    cacheIdempotencyResponse(key, requestHash, 200, { ok: true }, 1);

    const expiredAt = Date.now() + 1_100;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(expiredAt);

    expect(getCachedIdempotencyResponse(key, requestHash)).toEqual({ hit: false });
    expect(acquireIdempotencyLock(key, requestHash, 1).state).toBe("acquired");

    nowSpy.mockRestore();
  });

  it("deduplicates payment proof responses", async () => {
    dbPath = applySponsorshipTestEnv();
    const { getResponseByPaymentProof, savePaymentProofResponse } = await import("./service.js");

    const transactionHash = `tx_${randomUUID()}`;
    const body = { result: { traceId: "trace-proof" } };

    expect(getResponseByPaymentProof(transactionHash)).toBeNull();
    savePaymentProofResponse(transactionHash, body);
    expect(getResponseByPaymentProof(transactionHash)).toEqual(body);
  });
});
