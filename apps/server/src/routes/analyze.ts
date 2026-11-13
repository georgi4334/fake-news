import { AnalyzeJsonRequest, IMAGE_ARTIFACT_KINDS, MAX_UPLOAD_BYTES, type ImageArtifactKind, type ProgressEvent } from "@veritas/shared";
import { Router, type ErrorRequestHandler } from "express";
import multer from "multer";
import { UnsupportedImageError, loadImage } from "../images/load.js";
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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2, fieldSize: 2000 } });

analyzeRouter.post("/analyze/image", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Attach an image in the \"image\" field" });
    try {
      await loadImage(req.file.buffer); // checks the real format from the bytes
    } catch (err) {
      if (err instanceof UnsupportedImageError) return res.status(415).json({ error: err.message });
      throw err;
    }
    const caption = typeof req.body?.caption === "string" ? req.body.caption.trim().slice(0, 1000) || undefined : undefined;
    const input = { kind: "image" as const, caption };
    const rec = await store.create("image", input);
    await store.putArtifact(rec.id, 0, "upload", { mime: req.file.mimetype, data: req.file.buffer });
    await enqueueAnalysis(rec.id, input);
    res.status(202).json({ id: rec.id });
  } catch (err) {
    next(err);
  }
});

const onUploadError: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message = err.code === "LIMIT_FILE_SIZE" ? `Image is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` : err.message;
    return res.status(status).json({ error: message });
  }
  next(err);
};
analyzeRouter.use("/analyze/image", onUploadError);

analyzeRouter.get("/analyses/:id/images/:index/:kind", async (req, res, next) => {
  try {
    const index = Number(req.params.index);
    const kind = req.params.kind as ImageArtifactKind;
    if (!Number.isInteger(index) || index < 0 || !IMAGE_ARTIFACT_KINDS.includes(kind)) return res.status(404).end();
    const artifact = await store.getArtifact(req.params.id, index, kind);
    if (!artifact || !artifact.mime.startsWith("image/")) return res.status(404).end();
    res.set({
      "content-type": artifact.mime,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-site",
    });
    res.send(artifact.data);
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
