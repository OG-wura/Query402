import { z } from "zod";

export const queryModeSchema = z.enum(["search", "news", "scrape"]);

export const providerCategorySchema = queryModeSchema;

export const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: providerCategorySchema,
  priceUsd: z.number().positive(),
  description: z.string().min(1),
  latencyEstimateMs: z.number().int().positive(),
  qualityScore: z.number().min(1).max(100),
  sourceType: z.enum(["live", "deterministic-fallback", "unavailable"]),
  enabled: z.boolean()
});

export const baseQuerySchema = z.object({
  provider: z.string().min(1)
});

export const searchQuerySchema = baseQuerySchema.extend({
  q: z.string().min(2)
});

export const newsQuerySchema = baseQuerySchema.extend({
  q: z.string().min(2)
});

export const scrapeQuerySchema = baseQuerySchema.extend({
  url: z.string().url()
});

const stellarPublicKeySchema = z.string().regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar public key");

export const sponsorshipGrantSchema = z.object({
  grantId: z.string().uuid(),
  wallet: stellarPublicKeySchema,
  network: z.string().min(1),
  mode: queryModeSchema.optional(),
  providerId: z.string().min(1).optional(),
  maxAmountUsd: z.number().positive(),
  expiresAt: z.string().datetime({ offset: true }),
  nonce: z.string().uuid(),
  issuedAt: z.string().datetime({ offset: true })
});

export const signedGrantSchema = z.object({
  grant: sponsorshipGrantSchema,
  signature: z.string().min(1)
});

export const sponsorshipChallengeSchema = z.object({
  challengeId: z.string().uuid(),
  wallet: stellarPublicKeySchema,
  message: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true })
});
