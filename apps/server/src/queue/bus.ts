import { EventEmitter } from "node:events";
import { Redis } from "ioredis";
import type { ProgressEvent } from "@veritas/shared";
import { config } from "../config.js";

/** Progress events from the worker to whichever API process is streaming SSE to the browser. */
export interface Bus {
  publish(analysisId: string, event: ProgressEvent): Promise<void>;
  subscribe(analysisId: string, onEvent: (e: ProgressEvent) => void): Promise<() => void>;
}

class LocalBus implements Bus {
  private emitter = new EventEmitter().setMaxListeners(0);
  async publish(id: string, e: ProgressEvent) {
    this.emitter.emit(id, e);
  }
  async subscribe(id: string, fn: (e: ProgressEvent) => void) {
    this.emitter.on(id, fn);
    return () => void this.emitter.off(id, fn);
  }
}

class RedisBus implements Bus {
  private pub = new Redis(config.redisUrl!);
  async publish(id: string, e: ProgressEvent) {
    await this.pub.publish(`analysis:${id}`, JSON.stringify(e));
  }
  async subscribe(id: string, fn: (e: ProgressEvent) => void) {
    const sub = new Redis(config.redisUrl!);
    const channel = `analysis:${id}`;
    sub.on("message", (ch, msg) => ch === channel && fn(JSON.parse(msg)));
    await sub.subscribe(channel);
    return () => void sub.quit();
  }
}

export const bus: Bus = config.redisUrl ? new RedisBus() : new LocalBus();
