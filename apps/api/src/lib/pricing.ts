import type { ProviderDefinition, SlaBadges } from "@query402/shared";

function deriveSlaBadges(providerData: {
  sourceType: ProviderDefinition["sourceType"];
  latencyEstimateMs: number;
}): SlaBadges {
  const latencyBand =
    providerData.latencyEstimateMs <= 800
      ? "fast"
      : providerData.latencyEstimateMs <= 1500
        ? "standard"
        : "slow";

  const latencyLabels: Record<string, string> = {
    fast: "Fast response",
    standard: "Standard latency",
    slow: "Higher latency"
  };

  const reliabilityBand =
    providerData.sourceType === "live"
      ? "live"
      : providerData.sourceType === "deterministic-fallback"
        ? "fallback"
        : "demo";

  const reliabilityLabels: Record<string, string> = {
    live: "Live results",
    fallback: "Fallback cached",
    demo: "Demo reliability"
  };

  return {
    latencyBand,
    latencyLabel: latencyLabels[latencyBand],
    reliabilityBand,
    reliabilityLabel: reliabilityLabels[reliabilityBand],
    paymentMode: "x402",
    paymentLabel: "Pay-per-query (x402)"
  };
}

export const providers: ProviderDefinition[] = [
  {
    id: "search.live",
    name: "Live Web Search",
    category: "search",
    priceUsd: 0.05,
    description: "Live real-time search with actual web data.",
    latencyEstimateMs: 1500,
    qualityScore: 99,
    sourceType: "live",
    enabled: true,
    slaBadges: deriveSlaBadges({ sourceType: "live", latencyEstimateMs: 1500 })
  },
  {
    id: "search.basic",
    name: "Basic Search",
    category: "search",
    priceUsd: 0.01,
    description: "Fast, broad web signal retrieval for general prompts.",
    latencyEstimateMs: 700,
    qualityScore: 75,
    sourceType: "deterministic-fallback",
    enabled: true,
    slaBadges: deriveSlaBadges({ sourceType: "deterministic-fallback", latencyEstimateMs: 700 })
  },
  {
    id: "search.pro",
    name: "Pro Search",
    category: "search",
    priceUsd: 0.02,
    description: "Higher quality ranking with richer snippets.",
    latencyEstimateMs: 1100,
    qualityScore: 90,
    sourceType: "deterministic-fallback",
    enabled: true,
    slaBadges: deriveSlaBadges({ sourceType: "deterministic-fallback", latencyEstimateMs: 1100 })
  },
  {
    id: "news.fast",
    name: "Fast News",
    category: "news",
    priceUsd: 0.015,
    description: "Latest headlines with low latency.",
    latencyEstimateMs: 800,
    qualityScore: 72,
    sourceType: "deterministic-fallback",
    enabled: true,
    slaBadges: deriveSlaBadges({ sourceType: "deterministic-fallback", latencyEstimateMs: 800 })
  },
  {
    id: "news.deep",
    name: "Deep News",
    category: "news",
    priceUsd: 0.03,
    description: "Clustered and contextualized stories.",
    latencyEstimateMs: 1400,
    qualityScore: 93,
    sourceType: "deterministic-fallback",
    enabled: true,
    slaBadges: deriveSlaBadges({ sourceType: "deterministic-fallback", latencyEstimateMs: 1400 })
  },
  {
    id: "scrape.page",
    name: "Page Scrape",
    category: "scrape",
    priceUsd: 0.02,
    description: "Raw page extraction with quick metadata.",
    latencyEstimateMs: 1000,
    qualityScore: 70,
    sourceType: "deterministic-fallback",
    enabled: true,
    slaBadges: deriveSlaBadges({ sourceType: "deterministic-fallback", latencyEstimateMs: 1000 })
  },
  {
    id: "scrape.extract",
    name: "Structured Extract",
    category: "scrape",
    priceUsd: 0.04,
    description: "Structured entities and concise extraction.",
    latencyEstimateMs: 1700,
    qualityScore: 95,
    sourceType: "deterministic-fallback",
    enabled: true,
    slaBadges: deriveSlaBadges({ sourceType: "deterministic-fallback", latencyEstimateMs: 1700 })
  }
];

export const protectedRouteBasePrices: Record<string, string> = {
  "GET /x402/search": "$0.01",
  "GET /x402/news": "$0.015",
  "GET /x402/scrape": "$0.02"
};

export function getProviderById(providerId: string) {
  return providers.find((provider) => provider.id === providerId && provider.enabled);
}

export function getProvidersByCategory(category: ProviderDefinition["category"]) {
  return providers.filter((provider) => provider.category === category && provider.enabled);
}
