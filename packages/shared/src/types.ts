export type QueryMode = "search" | "news" | "scrape";
export type ProviderCategory = QueryMode;
export type SourceType = "mock" | "real";
export type PaymentSource = "sponsored" | "wallet" | "demo";

export interface ProviderDefinition {
  id: string;
  name: string;
  category: ProviderCategory;
  priceUsd: number;
  description: string;
  latencyEstimateMs: number;
  qualityScore: number;
  sourceType: SourceType;
  enabled: boolean;
}

export interface ProviderResultItem {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

export interface QueryResult {
  mode: QueryMode;
  providerId: string;
  providerName: string;
  priceUsd: number;
  latencyMs: number;
  timestamp: string;
  traceId: string;
  items: ProviderResultItem[];
  raw?: Record<string, unknown>;
}

export interface UsageEvent {
  id: string;
  mode: QueryMode;
  endpoint: string;
  providerId: string;
  queryOrUrl: string;
  priceUsd: number;
  network: string;
  paymentStatus: "paid" | "failed" | "demo-paid";
  paymentTxHash?: string;
  facilitatorUrl?: string;
  payerPublicKey?: string;
  traceId: string;
  createdAt: string;
  latencyMs: number;
  sponsorshipGrantId?: string;
  policyDecision?: string;
  paymentSource?: PaymentSource;
  sponsorPublicKey?: string;
}

export interface PaymentAttempt {
  id: string;
  endpoint: string;
  providerId: string;
  amountUsd: number;
  network: string;
  payerPublicKey?: string;
  payToAddress: string;
  facilitatorUrl: string;
  status: "verified" | "settled" | "failed";
  transactionHash?: string;
  error?: string;
  createdAt: string;
  sponsorshipGrantId?: string;
  policyDecision?: string;
  paymentSource?: PaymentSource;
  sponsorPublicKey?: string;
}

export interface AnalyticsSummary {
  totalQueries: number;
  totalSpendUsd: number;
  spendByCategory: Record<QueryMode, number>;
  recentTransactions: PaymentAttempt[];
  recentUsage: UsageEvent[];
}

export interface SponsorshipGrant {
  grantId: string;
  wallet: string;
  network: string;
  mode?: QueryMode;
  providerId?: string;
  maxAmountUsd: number;
  expiresAt: string;
  nonce: string;
  issuedAt: string;
}

export interface SignedGrant {
  grant: SponsorshipGrant;
  signature: string;
}

export interface SponsorshipChallenge {
  challengeId: string;
  wallet: string;
  message: string;
  expiresAt: string;
}
