import { z } from "zod";

/** The independent signals that feed the credibility score. */
export const SIGNAL_IDS = [
  "linguistic",
  "publisher",
  "timing",
  "presentation",
  "factcheck",
  "images",
] as const;
export const SignalId = z.enum(SIGNAL_IDS);
export type SignalId = z.infer<typeof SignalId>;

export const SIGNAL_LABELS: Record<SignalId, string> = {
  linguistic: "Writing style",
  publisher: "Publisher",
  timing: "Publication timing",
  presentation: "Presentation",
  factcheck: "Fact check",
  images: "Images",
};

export const Severity = z.enum(["info", "low", "medium", "high"]);
export type Severity = z.infer<typeof Severity>;

export const Finding = z.object({
  severity: Severity,
  message: z.string(),
  /** Quoted text, URL or value that supports the finding. */
  evidence: z.string().optional(),
  /** Sources backing the finding (e.g. fact-check articles). */
  links: z.array(z.object({ title: z.string(), url: z.string() })).optional(),
  /** Short label shown as a badge, e.g. a fact-check verdict. */
  tag: z.string().optional(),
});
export type Finding = z.infer<typeof Finding>;

export const SignalStatus = z.enum(["pending", "running", "done", "skipped", "error"]);
export type SignalStatus = z.infer<typeof SignalStatus>;

export const SignalResult = z.object({
  id: SignalId,
  status: SignalStatus,
  /** 0 = very likely misleading, 100 = no red flags. Null when not computed. */
  score: z.number().min(0).max(100).nullable(),
  /** How much the analyzer trusts its own score (0–1). */
  confidence: z.number().min(0).max(1),
  summary: z.string().optional(),
  findings: z.array(Finding),
  error: z.string().optional(),
});
export type SignalResult = z.infer<typeof SignalResult>;

export const Band = z.enum(["likely_reliable", "mixed", "questionable", "likely_false", "unknown"]);
export type Band = z.infer<typeof Band>;

export const BAND_LABELS: Record<Band, string> = {
  likely_reliable: "Likely reliable",
  mixed: "Mixed signals",
  questionable: "Questionable",
  likely_false: "Likely false or misleading",
  unknown: "Not enough data",
};

export const ArticleMeta = z.object({
  url: z.string().optional(),
  domain: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  publishedAt: z.string().optional(),
  modifiedAt: z.string().optional(),
  wordCount: z.number().optional(),
  imageUrls: z.array(z.string()).default([]),
});
export type ArticleMeta = z.infer<typeof ArticleMeta>;

export const AnalysisStatus = z.enum(["queued", "running", "done", "error"]);
export type AnalysisStatus = z.infer<typeof AnalysisStatus>;

export const InputKind = z.enum(["url", "text", "image"]);
export type InputKind = z.infer<typeof InputKind>;

/** Forensic result for one image (article image or upload). */
export const ImageCheck = z.object({
  index: z.number(),
  sourceUrl: z.string().optional(),
  width: z.number(),
  height: z.number(),
  format: z.string(),
  score: z.number(),
  confidence: z.number(),
  /** Thumbnail and error-level heatmap are served from /api/analyses/:id/images/:index/{thumb,ela}. */
  hasThumbnail: z.boolean(),
  hasHeatmap: z.boolean(),
  findings: z.array(Finding),
});
export type ImageCheck = z.infer<typeof ImageCheck>;

export const IMAGE_ARTIFACT_KINDS = ["thumb", "ela"] as const;
export type ImageArtifactKind = (typeof IMAGE_ARTIFACT_KINDS)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const Report = z.object({
  id: z.string(),
  inputKind: InputKind,
  status: AnalysisStatus,
  createdAt: z.string(),
  meta: ArticleMeta.nullable(),
  score: z.number().nullable(),
  band: Band,
  /** Share of the possible evidence that could actually be checked (0–1). */
  coverage: z.number(),
  topReasons: z.array(z.string()),
  signals: z.array(SignalResult),
  images: z.array(ImageCheck).default([]),
  error: z.string().optional(),
});
export type Report = z.infer<typeof Report>;

export const AnalyzeUrlRequest = z.object({
  kind: z.literal("url"),
  url: z.string().url().max(2048),
});
export const AnalyzeTextRequest = z.object({
  kind: z.literal("text"),
  text: z.string().min(200, "Paste at least 200 characters").max(100_000),
  title: z.string().max(500).optional(),
  publisher: z.string().max(200).optional(),
  publishedAt: z.string().max(100).optional(),
});
export const AnalyzeJsonRequest = z.discriminatedUnion("kind", [AnalyzeUrlRequest, AnalyzeTextRequest]);
export type AnalyzeJsonRequest = z.infer<typeof AnalyzeJsonRequest>;

export const AnalyzeResponse = z.object({ id: z.string() });
export type AnalyzeResponse = z.infer<typeof AnalyzeResponse>;

export const HistoryItem = z.object({
  id: z.string(),
  inputKind: InputKind,
  status: AnalysisStatus,
  title: z.string().nullable(),
  domain: z.string().nullable(),
  score: z.number().nullable(),
  band: Band,
  createdAt: z.string(),
});
export type HistoryItem = z.infer<typeof HistoryItem>;

/** Server-sent event payloads streamed while an analysis runs. */
export type ProgressEvent =
  | { type: "signal"; signal: SignalResult }
  | { type: "meta"; meta: ArticleMeta }
  | { type: "done"; report: Report }
  | { type: "error"; message: string };
