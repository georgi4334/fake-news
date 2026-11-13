import type { ImageCheck, SignalId, SignalResult } from "@veritas/shared";
import { ANALYZERS } from "../analyzers/index.js";
import { toSignalResult } from "../analyzers/types.js";
import { contextFromImage, contextFromText, extractFromHtml, type ArticleContext } from "../extract/article.js";
import { safeFetchText } from "../extract/safeFetch.js";
import { computeOverall } from "../scoring/score.js";
import { store, toReport } from "../store/index.js";
import { bus } from "./bus.js";

export type JobInput =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string; title?: string; publisher?: string; publishedAt?: string }
  /** The uploaded file is stored as artifact (index 0, "upload") so it never travels through the queue. */
  | { kind: "image"; caption?: string };

/** Signals that can say anything about each kind of input. */
const APPLICABLE: Record<JobInput["kind"], readonly SignalId[]> = {
  url: ANALYZERS.map((a) => a.id),
  text: ANALYZERS.map((a) => a.id),
  image: ["images"],
};

async function buildContext(id: string, input: JobInput): Promise<ArticleContext> {
  if (input.kind === "text") return contextFromText(input);
  if (input.kind === "image") {
    const upload = await store.getArtifact(id, 0, "upload");
    if (!upload) throw new Error("The uploaded image is no longer available");
    return contextFromImage([upload.data], input.caption);
  }
  const page = await safeFetchText(input.url);
  if (page.status >= 400) throw new Error(`The page returned HTTP ${page.status}`);
  if (!/html/i.test(page.contentType)) throw new Error(`Expected an HTML article, got "${page.contentType || "unknown"}"`);
  const ctx = extractFromHtml(page.body, page.finalUrl, page.redirects);
  if ((ctx.meta.wordCount ?? 0) < 50) throw new Error("Could not find article text on this page (it may require JavaScript or a login)");
  return ctx;
}

/** Runs every analyzer in parallel, streaming each signal as it completes. */
export async function runAnalysis(id: string, input: JobInput): Promise<void> {
  await store.update(id, { status: "running" });
  try {
    const ctx = await buildContext(id, input);
    ctx.analysisId = id;
    const applicable = APPLICABLE[input.kind];
    await store.update(id, { meta: ctx.meta });
    await bus.publish(id, { type: "meta", meta: ctx.meta });

    let images: ImageCheck[] = [];
    const signals: SignalResult[] = await Promise.all(
      ANALYZERS.filter((a) => applicable.includes(a.id)).map(async (a) => {
        let result: SignalResult;
        try {
          const out = await a.analyze(ctx);
          if (out.extra?.images) images = out.extra.images;
          result = toSignalResult(a.id, out);
        } catch (err) {
          result = { id: a.id, status: "error", score: null, confidence: 0, findings: [], error: (err as Error).message };
        }
        await bus.publish(id, { type: "signal", signal: result });
        return result;
      }),
    );

    const overall = computeOverall(signals, applicable);
    await store.update(id, { status: "done", signals, images, score: overall.score, band: overall.band, coverage: overall.coverage, topReasons: overall.topReasons });
  } catch (err) {
    await store.update(id, { status: "error", error: (err as Error).message });
  } finally {
    // Uploaded originals are not kept: only the thumbnail and heatmap stay with the report.
    if (input.kind === "image") await store.deleteArtifact(id, 0, "upload").catch(() => undefined);
  }
  const final = await store.get(id);
  if (final) await bus.publish(id, final.status === "error" ? { type: "error", message: final.error ?? "Analysis failed" } : { type: "done", report: toReport(final) });
}
