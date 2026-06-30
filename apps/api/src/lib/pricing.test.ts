import { describe, expect, it } from "vitest";
import {
  getProviderById,
  getProvidersByCategory,
  protectedRouteBasePrices,
  providers
} from "./pricing.js";
import { applySponsorshipTestEnv } from "../test/sponsorship-test-helpers.js";

applySponsorshipTestEnv();

describe("provider pricing", () => {
  it("exposes enabled providers for each category", () => {
    expect(
      getProvidersByCategory("search").every((provider) => provider.category === "search")
    ).toBe(true);
    expect(getProvidersByCategory("news").every((provider) => provider.category === "news")).toBe(
      true
    );
    expect(
      getProvidersByCategory("scrape").every((provider) => provider.category === "scrape")
    ).toBe(true);
    expect(providers.length).toBeGreaterThanOrEqual(7);
  });

  it("returns provider-specific prices for search, news, and scrape", () => {
    expect(getProviderById("search.basic")?.priceUsd).toBe(0.01);
    expect(getProviderById("search.pro")?.priceUsd).toBe(0.02);
    expect(getProviderById("news.fast")?.priceUsd).toBe(0.015);
    expect(getProviderById("news.deep")?.priceUsd).toBe(0.03);
    expect(getProviderById("scrape.page")?.priceUsd).toBe(0.02);
    expect(getProviderById("scrape.extract")?.priceUsd).toBe(0.04);
  });

  it("formats dynamic provider prices consistently", async () => {
    const { formatUsdPrice } = await import("./payment-evidence.js");

    expect(formatUsdPrice(0.01)).toBe("$0.01");
    expect(formatUsdPrice(0.015)).toBe("$0.015");
    expect(formatUsdPrice(0.04)).toBe("$0.04");
  });

  it("defines protected route base prices for each paid mode", () => {
    expect(protectedRouteBasePrices["GET /x402/search"]).toBe("$0.01");
    expect(protectedRouteBasePrices["GET /x402/news"]).toBe("$0.015");
    expect(protectedRouteBasePrices["GET /x402/scrape"]).toBe("$0.02");
  });

  it("rejects unknown or disabled providers", () => {
    expect(getProviderById("missing.provider")).toBeUndefined();
  });
});

describe("provider catalog baseline", () => {
  interface BaselineRow {
    id: string;
    category: string;
    priceUsd: number;
    enabled: boolean;
    sourceType: string;
    slaBadges: {
      latencyBand: string;
      reliabilityBand: string;
      paymentMode: string;
    };
  }

  // These are the canonical baseline providers the demo and SCF pitch depend on.
  // Changing any field here requires intentional review — the test will surface
  // exactly which row and field drifted.
  const baseline: BaselineRow[] = [
    {
      id: "search.basic",
      category: "search",
      priceUsd: 0.01,
      enabled: true,
      sourceType: "deterministic-fallback",
      slaBadges: {
        latencyBand: "fast",
        reliabilityBand: "fallback",
        paymentMode: "x402"
      }
    },
    {
      id: "news.fast",
      category: "news",
      priceUsd: 0.015,
      enabled: true,
      sourceType: "deterministic-fallback",
      slaBadges: {
        latencyBand: "fast",
        reliabilityBand: "fallback",
        paymentMode: "x402"
      }
    },
    {
      id: "scrape.page",
      category: "scrape",
      priceUsd: 0.02,
      enabled: true,
      sourceType: "deterministic-fallback",
      slaBadges: {
        latencyBand: "standard",
        reliabilityBand: "fallback",
        paymentMode: "x402"
      }
    }
  ];

  for (const expected of baseline) {
    it(`baseline provider "${expected.id}" matches expected catalog entry`, () => {
      const actual = providers.find((p) => p.id === expected.id);
      expect(
        actual,
        `Provider "${expected.id}" is missing — was it renamed or removed?`
      ).toBeDefined();

      const rowLabel = `Provider "${expected.id}"`;
      expect(actual!.id, `${rowLabel} id mismatch`).toBe(expected.id);
      expect(actual!.category, `${rowLabel} category mismatch`).toBe(expected.category);
      expect(actual!.priceUsd, `${rowLabel} priceUsd mismatch`).toBe(expected.priceUsd);
      expect(actual!.enabled, `${rowLabel} enabled mismatch`).toBe(expected.enabled);
      expect(actual!.sourceType, `${rowLabel} sourceType mismatch`).toBe(expected.sourceType);
      expect(actual!.slaBadges, `${rowLabel} slaBadges missing`).toBeDefined();
      expect(actual!.slaBadges.latencyBand, `${rowLabel} latencyBand mismatch`).toBe(expected.slaBadges.latencyBand);
      expect(actual!.slaBadges.reliabilityBand, `${rowLabel} reliabilityBand mismatch`).toBe(expected.slaBadges.reliabilityBand);
      expect(actual!.slaBadges.paymentMode, `${rowLabel} paymentMode mismatch`).toBe(expected.slaBadges.paymentMode);
      expect(actual!.slaBadges.latencyLabel, `${rowLabel} latencyLabel missing`).toBeTruthy();
      expect(actual!.slaBadges.reliabilityLabel, `${rowLabel} reliabilityLabel missing`).toBeTruthy();
      expect(actual!.slaBadges.paymentLabel, `${rowLabel} paymentLabel missing`).toBeTruthy();
    });
  }
});

describe("provider SLA badges shape", () => {
  it("every provider has slaBadges with all required fields", () => {
    for (const p of providers) {
      expect(p.slaBadges).toBeDefined();
      expect(["fast", "standard", "slow"]).toContain(p.slaBadges.latencyBand);
      expect(["demo", "fallback", "live"]).toContain(p.slaBadges.reliabilityBand);
      expect(["demo", "x402", "sponsored"]).toContain(p.slaBadges.paymentMode);
      expect(typeof p.slaBadges.latencyLabel).toBe("string");
      expect(p.slaBadges.latencyLabel.length).toBeGreaterThan(0);
      expect(typeof p.slaBadges.reliabilityLabel).toBe("string");
      expect(p.slaBadges.reliabilityLabel.length).toBeGreaterThan(0);
      expect(typeof p.slaBadges.paymentLabel).toBe("string");
      expect(p.slaBadges.paymentLabel.length).toBeGreaterThan(0);
    }
  });

  it("derives correct latencyBand for each provider", () => {
    const expectations: Record<string, string> = {
      "search.live": "standard",
      "search.basic": "fast",
      "search.pro": "standard",
      "news.fast": "fast",
      "news.deep": "standard",
      "scrape.page": "standard",
      "scrape.extract": "slow"
    };

    for (const [id, expectedBand] of Object.entries(expectations)) {
      const provider = providers.find((p) => p.id === id);
      expect(provider, `Provider "${id}" not found`).toBeDefined();
      expect(provider!.slaBadges.latencyBand).toBe(expectedBand);
    }
  });

  it("derives correct reliabilityBand from sourceType", () => {
    for (const p of providers) {
      const expectedBand =
        p.sourceType === "live" ? "live"
        : p.sourceType === "deterministic-fallback" ? "fallback"
        : "demo";
      expect(p.slaBadges.reliabilityBand).toBe(expectedBand);
    }
  });

  it("all providers have paymentMode x402", () => {
    for (const p of providers) {
      expect(p.slaBadges.paymentMode).toBe("x402");
    }
  });
});
