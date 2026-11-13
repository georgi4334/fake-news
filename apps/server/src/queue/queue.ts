import { Queue } from "bullmq";
import { config } from "../config.js";
import { runAnalysis, type JobInput } from "./runAnalysis.js";

export const QUEUE_NAME = "analyses";
export const redisConnection = () => ({ url: config.redisUrl! });

const queue = config.redisUrl ? new Queue(QUEUE_NAME, { connection: redisConnection() }) : null;

/**
 * With REDIS_URL set, jobs go to BullMQ and are processed by `npm run worker` (scales
 * horizontally, survives API restarts). Without it, jobs run in-process: handy for dev and tests.
 */
export async function enqueueAnalysis(id: string, input: JobInput): Promise<void> {
  if (queue) {
    await queue.add("analyze", { id, input }, { jobId: id, attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 });
  } else {
    setImmediate(() => void runAnalysis(id, input));
  }
}
