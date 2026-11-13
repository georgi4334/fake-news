import { createApp } from "./app.js";
import { config } from "./config.js";

createApp().listen(config.port, () => {
  console.log(`Veritas API on http://localhost:${config.port}`);
  console.log(`  store: ${config.databaseUrl ? "postgres" : "in-memory"} | queue: ${config.redisUrl ? "bullmq (run npm run worker)" : "in-process"} | Claude: ${config.llmEnabled ? config.anthropicModel : "disabled (heuristics only)"}`);
});
