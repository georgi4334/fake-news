import type { Finding, SignalId, SignalResult } from "@veritas/shared";
import type { ArticleContext } from "../extract/article.js";

export interface AnalyzerOutput {
  score: number | null;
  confidence: number;
  summary?: string;
  findings: Finding[];
  /** Set when the analyzer could not run for this input (e.g. no images). */
  skipped?: boolean;
}

export interface Analyzer {
  id: SignalId;
  analyze(ctx: ArticleContext): Promise<AnalyzerOutput>;
}

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function toSignalResult(id: SignalId, out: AnalyzerOutput): SignalResult {
  return {
    id,
    status: out.skipped ? "skipped" : "done",
    score: out.skipped || out.score === null ? null : Math.round(clamp(out.score)),
    confidence: Math.max(0, Math.min(1, out.confidence)),
    summary: out.summary,
    findings: out.findings,
  };
}
