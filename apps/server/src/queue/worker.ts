import { Worker } from "bullmq";
import { config } from "../config.js";
import { QUEUE_NAME, redisConnection } from "./queue.js";
import { runAnalysis, type JobInput } from "./runAnalysis.js";

if (!config.redisUrl) {
  console.error("REDIS_URL is not set: the API runs analyses in-process, no worker needed.");
  process.exit(1);
}

const worker = new Worker<{ id: string; input: JobInput }>(QUEUE_NAME, (job) => runAnalysis(job.data.id, job.data.input), {
  connection: redisConnection(),
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
});
worker.on("failed", (job, err) => console.error(`job ${job?.id} failed:`, err.message));
console.log(`Worker listening on queue "${QUEUE_NAME}" (LLM ${config.llmEnabled ? "enabled" : "disabled"})`);
