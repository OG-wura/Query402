# Sponsorship Threat Model & Operational Controls

This document describes the security model for Query402's **bounded sponsorship** path (`POST /api/paid/run`). It replaces the previous open server-side faucet where the API paid on behalf of any caller using `DEMO_CLIENT_SECRET_KEY` with no wallet proof, budget, or replay protection.

Related: [Issue #9](https://github.com/emrekayat/Query402/issues/9)

---

## Summary

Sponsored queries require:

1. **Wallet ownership proof** — SEP-53 message signature via Freighter (`POST /api/sponsorship/challenge` → `POST /api/sponsorship/grants`)
2. **Short-lived signed grant** — HMAC-bound policy object (`X-Sponsorship-Grant`)
3. **Atomic enforcement** — SQLite budget + nonce + idempotency before settlement
4. **Fail-closed defaults** — sponsorship off and storage errors deny service

---

## Threat Model

### Assets

| Asset                        | Risk if compromised                           |
| ---------------------------- | --------------------------------------------- |
| `DEMO_CLIENT_SECRET_KEY`     | Unlimited x402 settlement from sponsor wallet |
| `SPONSORSHIP_SIGNING_SECRET` | Forged grants bypassing policy                |
| SQLite sponsorship DB        | Budget/nonce/idempotency bypass               |
| Grant + nonce                | Single-use spend authorization                |

### Threats & Mitigations

| Threat              | Description                                    | Mitigation                                                                       |
| ------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| **Public faucet**   | Anyone triggers server-paid queries            | `SPONSORSHIP_ENABLED` gate; grant required; wallet challenge                     |
| **Replay**          | Reuse grant or idempotency key to double-spend | Single-use nonce (atomic INSERT); idempotency lock + cache                       |
| **Budget drain**    | Attacker exhausts sponsor funds                | Per-wallet + global daily USD caps; grant `maxAmountUsd`; price check vs catalog |
| **Wrong wallet**    | Spend grant issued to wallet A from wallet B   | Grant `wallet` must match request body                                           |
| **Wrong network**   | Testnet grant used on pubnet config            | Grant `network` must match `STELLAR_NETWORK`                                     |
| **Provider abuse**  | Expensive provider under cheap grant           | Optional grant `mode` / `providerId`; `getProviderById` price ceiling            |
| **Expired grant**   | Stale authorization                            | `expiresAt` enforced in policy                                                   |
| **Concurrent race** | Parallel requests bypass budget                | `BEGIN IMMEDIATE` budget reservation; idempotency `INSERT OR IGNORE` lock        |
| **Storage outage**  | Silent allow on DB failure                     | Fail closed → `503 sponsorship_storage_unavailable`                              |

### Out of Scope (by design)

- Unlimited public faucet
- Production mainnet deployment
- On-chain per-query wallet settlement (wallet-paid path uses x402 directly)

---

## Trust Boundaries

```
┌─────────────┐     SEP-53 sign      ┌──────────────┐
│ User wallet │ ───────────────────► │   Freighter  │
│  (G... key) │                      │  (client)    │
└─────────────┘                      └──────┬───────┘
                                          │
                    challenge + signature │
                                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Query402 API                          │
│  ┌─────────────────┐    HMAC     ┌──────────────────────┐  │
│  │ Grant issuer    │ ◄────────── │ SPONSORSHIP_SIGNING_ │  │
│  │ (short-lived)   │             │ SECRET (server only) │  │
│  └────────┬────────┘             └──────────────────────┘  │
│           │ signed grant                                     │
│           ▼                                                  │
│  ┌─────────────────┐    atomic    ┌──────────────────────┐  │
│  │ Policy engine   │ ───────────► │ sponsorship.db       │  │
│  └────────┬────────┘              │ (budget/nonce/idemp) │  │
│           │ allow                  └──────────────────────┘  │
│           ▼                                                  │
│  ┌─────────────────┐    x402      ┌──────────────────────┐  │
│  │ runPaidRequest  │ ───────────► │ DEMO_CLIENT_SECRET_  │  │
│  │ (settlement)    │              │ KEY (sponsor wallet) │  │
│  └─────────────────┘              └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

| Role                  | Key / artifact                           | Trust                                                 |
| --------------------- | ---------------------------------------- | ----------------------------------------------------- |
| **User wallet**       | Stellar public key + Freighter signature | Proves control of `G...` at grant time (SEP-53)       |
| **Grant signer**      | `SPONSORSHIP_SIGNING_SECRET`             | Server-only; binds grant fields; never sent to client |
| **Sponsor / settler** | `DEMO_CLIENT_SECRET_KEY`                 | Pays x402 invoices; separate from user wallet         |
| **Verifier**          | Policy + SQLite                          | Enforces bounds before sponsor key is used            |

**Payment evidence** records `sponsorshipGrantId`, `policyDecision`, `paymentSource: "sponsored"`, and `sponsorPublicKey` (from `DEMO_CLIENT_PUBLIC_KEY`). Secrets and grant signatures are **never** persisted.

---

## Request Flow

```
1. POST /api/sponsorship/challenge   { wallet }
2. Client: Freighter signMessage(challenge.message)   [SEP-53]
3. POST /api/sponsorship/grants      { wallet, challengeId, signature }
4. POST /api/paid/run
     Headers: X-Sponsorship-Grant (base64 JSON), Idempotency-Key (optional)
     Body:    { mode, provider, wallet, query | url }
```

Policy order (fail fast):

1. `SPONSORSHIP_ENABLED` → else `503`
2. Storage available → else `503`
3. Verify grant HMAC + schema
4. Wallet, network, provider/mode, price ≤ `maxAmountUsd`, expiry
5. Idempotency cache hit → return cached `200`
6. Budget read check → else `429`
7. Idempotency lock acquire → else `409` if in progress
8. Atomic `checkAndReserveBudget` (nonce + spend)
9. `runPaidRequest` (x402 settlement)
10. On failure: `releaseBudget` + `releaseIdempotencyLock`
11. On success: cache idempotency, persist payment evidence

---

## Environment Variables

| Variable                                  | Default                        | Purpose                                    |
| ----------------------------------------- | ------------------------------ | ------------------------------------------ |
| `SPONSORSHIP_ENABLED`                     | `false`                        | Kill switch (fail closed)                  |
| `SPONSORSHIP_SIGNING_SECRET`              | —                              | HMAC grant signing (required when enabled) |
| `SPONSORSHIP_GLOBAL_DAILY_BUDGET_USD`     | `10`                           | Global daily spend cap                     |
| `SPONSORSHIP_PER_WALLET_DAILY_BUDGET_USD` | `1`                            | Per-wallet daily cap                       |
| `SPONSORSHIP_RATE_LIMIT_PER_MINUTE`       | `10`                           | Reserved for future rate limiting          |
| `SPONSORSHIP_GRANT_TTL_SECONDS`           | `300`                          | Grant lifetime                             |
| `SPONSORSHIP_CHALLENGE_TTL_SECONDS`       | `60`                           | Challenge lifetime                         |
| `SPONSORSHIP_DB_PATH`                     | `apps/api/data/sponsorship.db` | SQLite path                                |
| `DEMO_CLIENT_SECRET_KEY`                  | —                              | Sponsor settlement key                     |
| `DEMO_CLIENT_PUBLIC_KEY`                  | —                              | Recorded in evidence as `sponsorPublicKey` |

`/health` exposes `sponsorshipEnabled` for the web UI to disable the Sponsored button.

---

## Funding Limits

- **Grant ceiling**: `maxAmountUsd` defaults to `SPONSORSHIP_PER_WALLET_DAILY_BUDGET_USD` at issuance.
- **Per-query check**: Catalog price must be ≤ grant `maxAmountUsd`.
- **Daily windows**: UTC date (`YYYY-MM-DD`) in `sponsorship_budgets`.
- **Atomic reservation**: Spend is reserved before x402 payment; rolled back on payment failure.

Tune testnet/demo limits conservatively. Monitor `/api/analytics` for `paymentSource: "sponsored"` entries.

---

## Operational Kill Switch

**Disable sponsorship immediately:**

```env
SPONSORSHIP_ENABLED=false
```

Restart API (or redeploy). Effect:

- `POST /api/paid/run` → `503 { error: "sponsorship_disabled" }`
- `POST /api/sponsorship/challenge` and `/grants` → `503`
- `runPaidRequest` is not called
- Wallet-paid x402 path (`/x402/*` from client) is unaffected

No code deploy required if env is injected at runtime.

---

## Fail-Closed Behavior

| Condition                            | HTTP  | `decision` / `error`          |
| ------------------------------------ | ----- | ----------------------------- |
| Sponsorship disabled                 | `503` | `denied_sponsorship_disabled` |
| SQLite unavailable                   | `503` | `denied_storage_unavailable`  |
| Invalid / tampered grant             | `403` | `denied_invalid_grant`        |
| Wallet / network / provider mismatch | `403` | `denied_wrong_*`              |
| Grant expired                        | `403` | `denied_expired`              |
| Price > grant max                    | `403` | `denied_price_exceeded`       |
| Nonce replay                         | `409` | `nonce_replay`                |
| Budget exceeded                      | `429` | `*_budget_exceeded`           |
| Idempotency in progress              | `409` | `idempotency_in_progress`     |
| Idempotency cache hit                | `200` | cached body (no second spend) |

Default for new deployments: **`SPONSORSHIP_ENABLED=false`** until secrets and limits are configured.

---

## Key Rotation

### `SPONSORSHIP_SIGNING_SECRET`

1. Set `SPONSORSHIP_ENABLED=false` (stop new grants).
2. Wait for existing grants to expire (`SPONSORSHIP_GRANT_TTL_SECONDS`, max 300s default).
3. Update `SPONSORSHIP_SIGNING_SECRET` to a new random value (≥ 32 bytes entropy).
4. Re-enable sponsorship.
5. Old grants fail HMAC verification → `403 invalid_grant`.

No DB migration required; grants are short-lived.

### `DEMO_CLIENT_SECRET_KEY` (sponsor settlement)

1. Fund and configure a new Stellar keypair.
2. Update `DEMO_CLIENT_SECRET_KEY` and `DEMO_CLIENT_PUBLIC_KEY`.
3. Update `X402_PAY_TO_ADDRESS` if payee changes.
4. Restart API.
5. In-flight grants remain valid until expiry; settlement uses the new key after restart.

Rotate sponsor keys on its own schedule (compromise, employee offboarding, testnet reset). Grant signing secret and sponsor secret **must remain independent**.

---

## Storage

SQLite tables (see `apps/api/src/lib/sponsorship/store.ts`):

- `sponsorship_budgets` — daily spend by scope (`global` / `wallet`)
- `sponsorship_nonces` — one row per consumed grant nonce
- `idempotency_keys` — `Idempotency-Key` → cached response

Analytics usage is stored in `ANALYTICS_DB_PATH` (SQLite). Sponsorship enforcement uses a separate SQLite file at `SPONSORSHIP_DB_PATH`. See [analytics-storage.md](./analytics-storage.md) for backup and restore.

**Backup**: Copy `SPONSORSHIP_DB_PATH` for audit; loss forces fail-closed `503` until restored or file recreated (budget counters reset).

---

## Verification

Run sponsorship tests:

```bash
npm test --workspace @query402/api
```

Covers valid path, all rejection codes, budget aggregation, idempotency single-spend, kill switch, and storage-down behavior.

---

## References

- [SEP-53](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md) — message signing (Freighter `signMessage`)
- [Issue #9](https://github.com/emrekayat/Query402/issues/9) — secure sponsored payment mode
- Handoff implementation guide: `docs/ISSUE-9-AGENT-HANDOFF.md` (local, gitignored)
