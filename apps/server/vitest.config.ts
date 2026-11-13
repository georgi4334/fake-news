import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { DISABLE_LLM: "1", DATABASE_URL: "", REDIS_URL: "", RATE_LIMIT_PER_MIN: "1000" },
  },
});
