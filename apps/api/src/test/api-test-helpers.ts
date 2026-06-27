import { vi } from "vitest";
import { createTempAnalyticsDbPath, resetAnalyticsStore } from "./storage-test-helpers.js";
import {
  applySponsorshipTestEnv,
  resetSponsorshipStore,
  TEST_WALLET
} from "./sponsorship-test-helpers.js";

export { TEST_WALLET } from "./sponsorship-test-helpers.js";

export function applyApiTestEnv(overrides: Record<string, string> = {}) {
  const analyticsDbPath = overrides.ANALYTICS_DB_PATH ?? createTempAnalyticsDbPath();

  const sponsorshipDbPath = applySponsorshipTestEnv({
    NODE_ENV: "test",
    DEMO_MODE: "true",
    ANALYTICS_DB_PATH: analyticsDbPath,
    ANALYTICS_STORAGE: "sqlite",
    API_BASE_URL: "http://localhost:3001",
    ...overrides
  });

  return { analyticsDbPath, sponsorshipDbPath };
}

export async function resetApiTestStorage(analyticsDbPath?: string, sponsorshipDbPath?: string) {
  await resetAnalyticsStore(analyticsDbPath);
  await resetSponsorshipStore(sponsorshipDbPath);
  vi.resetModules();
}

export function fixedNow(isoTimestamp: string) {
  return vi.spyOn(Date, "now").mockReturnValue(new Date(isoTimestamp).getTime());
}
