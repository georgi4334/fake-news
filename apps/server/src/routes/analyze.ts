import { AnalyzeJsonRequest, type ProgressEvent } from "@veritas/shared";
import { Router } from "express";
import { UnsafeUrlError, assertPublicUrl } from "../extract/safeFetch.js";
import { enqueueAnalysis } from "../queue/queue.js";
import { bus } from "../queue/bus.js";
import { store, toHistoryItem, toReport } from "../store/index.js";

export const analyzeRouter = Router();

analyzeRouter.post("/analyze", async (req, res, next) => {
  try {
    const parsed = AnalyzeJsonRequest.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
    }
    const input = parsed.data;
    if (input.kind === "url") {
      try {
        await assertPublicUrl(input.url);
      } catch (err) {
        const message = err instanceof UnsafeUrlError ? err.message : "Could not resolve that URL";
        return res.status(400).json({ error: message });
      }
    }
    const rec = await store.create(input.kind, input);
    await enqueueAnalysis(rec.id, input);
    res.status(202).json({ id: rec.id });
  } catch (err) {
    next(err);
  }
});

analyzeRouter.get("/analyses", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json((await store.list(limit)).map(toHistoryItem));
  } catch (err) {
    next(err);
  }
});

analyzeRouter.get("/analyses/:id", async (req, res, next) => {
  try {
    const rec = await store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "Analysis not found" });
    res.json(toReport(rec));
  } catch (err) {
    next(err);
  }
});

/** Server-Sent Events stream of progress for one analysis. */
analyzeRouter.get("/analyses/:id/events", async (req, res, next) => {
  try {
    const send = (e: ProgressEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    // Subscribe before reading state so no event is missed in between.
    const queued: ProgressEvent[] = [];
    let live = false;
    const unsubscribe = await bus.subscribe(req.params.id, (e) => {
      if (!live) return void queued.push(e);
      send(e);
      if (e.type === "done" || e.type === "error") res.end();
    });

    const rec = await store.get(req.params.id);
    if (!rec) {
      unsubscribe();
      return res.status(404).json({ error: "Analysis not found" });
    }

    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    req.on("close", unsubscribe);
    if (rec.status === "done") return send({ type: "done", report: toReport(rec) }), res.end();
    if (rec.status === "error") return send({ type: "error", message: rec.error ?? "Analysis failed" }), res.end();

    if (rec.meta) send({ type: "meta", meta: rec.meta });
    live = true;
    for (const e of queued) send(e);
    if (queued.some((e) => e.type === "done" || e.type === "error")) res.end();
    const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
    req.on("close", () => clearInterval(ping));
  } catch (err) {
    next(err);
  }
});
