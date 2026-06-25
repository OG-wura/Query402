import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
  }

  dotenv.config();
}

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT_API: z.coerce.number().default(3001),
  STELLAR_NETWORK: z.string().default("stellar:testnet"),
  STELLAR_RPC_URL: z.string().url().default("https://soroban-testnet.stellar.org"),
  X402_FACILITATOR_URL: z.string().url().default("https://channels.openzeppelin.com/x402/testnet"),
  X402_FACILITATOR_API_KEY: z.string().optional(),
  X402_PAY_TO_ADDRESS: z.string().min(10, "X402_PAY_TO_ADDRESS is required"),
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
  CORS_ORIGINS: z.string().optional(),
  DEMO_CLIENT_SECRET_KEY: z.string().optional(),
  DEMO_CLIENT_PUBLIC_KEY: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),
  NEWS_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  DEMO_MODE: z.string().optional(),
  SPONSORSHIP_ENABLED: z.string().optional(),
  SPONSORSHIP_SIGNING_SECRET: z.string().optional(),
  SPONSORSHIP_GLOBAL_DAILY_BUDGET_USD: z.coerce.number().positive().default(10),
  SPONSORSHIP_PER_WALLET_DAILY_BUDGET_USD: z.coerce.number().positive().default(1),
  SPONSORSHIP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  SPONSORSHIP_GRANT_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  SPONSORSHIP_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  SPONSORSHIP_DB_PATH: z.string().min(1).default("apps/api/data/sponsorship.db"),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86_400)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const config = {
  ...parsed.data,
  corsOrigins: (parsed.data.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean),
  groqModel: parsed.data.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile",
  demoMode: parsed.data.DEMO_MODE === "true",
  sponsorshipEnabled: parsed.data.SPONSORSHIP_ENABLED === "true",
  sponsorshipDbPath: path.isAbsolute(parsed.data.SPONSORSHIP_DB_PATH)
    ? parsed.data.SPONSORSHIP_DB_PATH
    : path.resolve(process.cwd(), parsed.data.SPONSORSHIP_DB_PATH)
};
