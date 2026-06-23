import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { AnalyticsSummary, PaymentAttempt, PaymentSource, QueryMode, UsageEvent } from "@query402/shared";
import { config } from "./config.js";

interface PersistedDb {
  usage: UsageEvent[];
  payments: PaymentAttempt[];
}

const dataDir = path.resolve(process.cwd(), "apps/api/data");
const dataFile = path.join(dataDir, "db.json");

function ensureDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    const initial: PersistedDb = { usage: [], payments: [] };
    fs.writeFileSync(dataFile, JSON.stringify(initial, null, 2), "utf-8");
  }
}

function readDb(): PersistedDb {
  ensureDb();
  const raw = fs.readFileSync(dataFile, "utf-8");
  return JSON.parse(raw) as PersistedDb;
}

function writeDb(db: PersistedDb) {
  fs.writeFileSync(dataFile, JSON.stringify(db, null, 2), "utf-8");
}

export function saveUsageEvent(event: UsageEvent) {
  const db = readDb();
  db.usage.unshift(event);
  db.usage = db.usage.slice(0, 500);
  writeDb(db);
}

export function savePaymentAttempt(payment: PaymentAttempt) {
  const db = readDb();
  db.payments.unshift(payment);
  db.payments = db.payments.slice(0, 500);
  writeDb(db);
}

export function getUsageEvents() {
  return readDb().usage;
}

export function getPaymentAttempts() {
  return readDb().payments;
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const db = readDb();
  const spendByCategory: Record<"search" | "news" | "scrape", number> = db.usage.reduce(
    (acc, event) => {
      acc[event.mode] += event.priceUsd;
      return acc;
    },
    { search: 0, news: 0, scrape: 0 }
  );

  const totalSpendUsd = Number((spendByCategory.search + spendByCategory.news + spendByCategory.scrape).toFixed(6));

  return {
    totalQueries: db.usage.length,
    totalSpendUsd,
    spendByCategory,
    recentTransactions: db.payments.slice(0, 10),
    recentUsage: db.usage.slice(0, 10)
  };
}

export function persistSponsoredPayment(input: {
  mode: QueryMode;
  endpoint: string;
  provider: string;
  queryOrUrl: string;
  priceUsd: number;
  latencyMs: number;
  traceId: string;
  paymentResponseHeader: string | null;
  walletPublicKey: string;
  sponsorshipGrantId: string;
  policyDecision: string;
  paymentSource?: PaymentSource;
  sponsorPublicKey?: string;
}) {
  const now = new Date().toISOString();
  const paymentId = `pay_${nanoid(10)}`;
  const paymentSource = input.paymentSource ?? "sponsored";
  const sponsorPublicKey = input.sponsorPublicKey ?? config.DEMO_CLIENT_PUBLIC_KEY;

  savePaymentAttempt({
    id: paymentId,
    endpoint: input.endpoint,
    providerId: input.provider,
    amountUsd: input.priceUsd,
    network: config.STELLAR_NETWORK,
    payerPublicKey: input.walletPublicKey,
    payToAddress: config.X402_PAY_TO_ADDRESS,
    facilitatorUrl: config.X402_FACILITATOR_URL,
    status: "settled",
    transactionHash: input.paymentResponseHeader ?? undefined,
    createdAt: now,
    sponsorshipGrantId: input.sponsorshipGrantId,
    policyDecision: input.policyDecision,
    paymentSource,
    sponsorPublicKey
  });

  saveUsageEvent({
    id: `use_${nanoid(10)}`,
    mode: input.mode,
    endpoint: input.endpoint,
    providerId: input.provider,
    queryOrUrl: input.queryOrUrl,
    priceUsd: input.priceUsd,
    network: config.STELLAR_NETWORK,
    paymentStatus: "paid",
    paymentTxHash: input.paymentResponseHeader ?? undefined,
    facilitatorUrl: config.X402_FACILITATOR_URL,
    payerPublicKey: input.walletPublicKey,
    traceId: input.traceId,
    createdAt: now,
    latencyMs: input.latencyMs,
    sponsorshipGrantId: input.sponsorshipGrantId,
    policyDecision: input.policyDecision,
    paymentSource,
    sponsorPublicKey
  });
}
