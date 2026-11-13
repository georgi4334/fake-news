import type { SignalId } from "@veritas/shared";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  /** Claude is optional: without a key, analyzers fall back to local heuristics. */
  llmEnabled: Boolean(process.env.ANTHROPIC_API_KEY) && process.env.DISABLE_LLM !== "1",
  googleFactCheckKey: process.env.GOOGLE_FACTCHECK_API_KEY || undefined,
  factcheck: {
    maxClaims: Number(process.env.FACTCHECK_MAX_CLAIMS ?? 6),
    /** Web searches are billed per search, so this caps the cost of checking one article. */
    maxSearches: Number(process.env.FACTCHECK_MAX_SEARCHES ?? 8),
  },
  fetchTimeoutMs: 15_000,
  maxHtmlBytes: 5 * 1024 * 1024,
};

/** Relative weight of each signal in the overall score. */
export const SIGNAL_WEIGHTS: Record<SignalId, number> = {
  factcheck: 0.3,
  linguistic: 0.2,
  publisher: 0.2,
  images: 0.1,
  timing: 0.1,
  presentation: 0.1,
};
