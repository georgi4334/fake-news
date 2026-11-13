import type { Finding, ImageCheck } from "@veritas/shared";
import { MAX_UPLOAD_BYTES } from "@veritas/shared";
import { config } from "../config.js";
import type { ArticleContext } from "../extract/article.js";
import { safeFetchImage } from "../extract/safeFetch.js";
import { assessImage, type ImageEvidence } from "../images/assess.js";
import { errorLevelAnalysis } from "../images/ela.js";
import { loadImage, resizedJpeg, type LoadedImage } from "../images/load.js";
import { readMetadata } from "../images/metadata.js";
import { checkProvenance } from "../images/provenance.js";
import { reverseSearch } from "../images/reverseSearch.js";
import { reviewImage } from "../images/vision.js";
import { LlmUnavailableError } from "../llm/claude.js";
import { store } from "../store/index.js";
import type { Analyzer } from "./types.js";

/** Logos, icons and tracking pixels aren't worth analyzing. */
const MIN_SIDE = 200;

async function collectImages(ctx: ArticleContext): Promise<LoadedImage[]> {
  if (ctx.uploadedImages?.length) return Promise.all(ctx.uploadedImages.map((b) => loadImage(b)));
  const urls = ctx.meta.imageUrls.slice(0, config.maxArticleImages * 2);
  const loaded = await Promise.all(
    urls.map(async (url) => {
      try {
        const { data, finalUrl } = await safeFetchImage(url, MAX_UPLOAD_BYTES);
        return await loadImage(data, finalUrl);
      } catch {
        return null;
      }
    }),
  );
  const seen = new Set<string>();
  return loaded
    .filter((i): i is LoadedImage => i !== null && Math.min(i.width, i.height) >= MIN_SIDE)
    .filter((i) => !seen.has(i.sha256) && seen.add(i.sha256))
    .slice(0, config.maxArticleImages);
}

const settled = async <T>(p: Promise<T>): Promise<T | undefined> => {
  try {
    return await p;
  } catch {
    return undefined;
  }
};

async function analyzeOne(img: LoadedImage, index: number, ctx: ArticleContext): Promise<ImageCheck> {
  const published = ctx.meta.publishedAt ? new Date(ctx.meta.publishedAt) : undefined;
  let visionNote: Finding | undefined;
  const [provenance, metadata, ela, reverse, vision, thumb] = await Promise.all([
    settled(checkProvenance(img)),
    settled(readMetadata(img)),
    settled(errorLevelAnalysis(img)),
    settled(reverseSearch(img)),
    reviewImage(img, { caption: ctx.caption, headline: ctx.inputKind === "image" ? undefined : ctx.meta.title }).catch((err) => {
      if (!(err instanceof LlmUnavailableError)) visionNote = { severity: "info", message: `AI visual review unavailable: ${(err as Error).message}` };
      return undefined;
    }),
    settled(resizedJpeg(img, 800)),
  ]);

  const evidence: ImageEvidence = {
    provenance,
    metadata,
    reverse,
    vision,
    articleDate: published && !Number.isNaN(published.getTime()) ? published : undefined,
  };
  const { score, confidence, findings } = assessImage(evidence);
  if (visionNote) findings.push(visionNote);
  if (ela) findings.push({ severity: "info", message: "Error-level heatmap available: bright, sharply bounded patches that don't follow edges or texture may be pasted or retouched areas" });

  if (ctx.analysisId) {
    if (thumb) await store.putArtifact(ctx.analysisId, index, "thumb", { mime: "image/jpeg", data: thumb });
    if (ela) await store.putArtifact(ctx.analysisId, index, "ela", { mime: "image/jpeg", data: ela.heatmap });
  }
  return {
    index,
    sourceUrl: img.sourceUrl,
    width: img.width,
    height: img.height,
    format: img.format,
    score: Math.round(score),
    confidence,
    hasThumbnail: Boolean(thumb && ctx.analysisId),
    hasHeatmap: Boolean(ela && ctx.analysisId),
    findings,
  };
}

export const imagesAnalyzer: Analyzer = {
  id: "images",
  async analyze(ctx) {
    const images = await collectImages(ctx);
    if (!images.length) {
      return { score: null, confidence: 0, skipped: true, summary: ctx.inputKind === "url" ? "No article images to analyze." : "No images provided.", findings: [] };
    }

    const checks = await Promise.all(images.map((img, i) => analyzeOne(img, i, ctx)));
    const scores = checks.map((c) => c.score);
    const worst = Math.min(...scores);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

    const label = (c: ImageCheck) => (checks.length > 1 ? `Image ${c.index + 1}: ` : "");
    const findings: Finding[] = checks.flatMap((c) =>
      c.findings.filter((f) => f.severity !== "info").map((f) => ({ ...f, message: label(c) + f.message })),
    );
    if (!findings.length) findings.push({ severity: "info", message: `No signs of AI generation or manipulation found in ${checks.length} image${checks.length === 1 ? "" : "s"}` });

    return {
      score: 0.6 * worst + 0.4 * mean,
      confidence: Math.max(...checks.map((c) => c.confidence)),
      summary: `Analyzed ${checks.length} image${checks.length === 1 ? "" : "s"}: provenance, metadata, error levels${config.googleVisionKey ? ", reverse search" : ""} and visual review. Image forensics is probabilistic.`,
      findings,
      extra: { images: checks },
    };
  },
};
