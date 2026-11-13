import { SIGNAL_IDS, SIGNAL_LABELS, type Band, type SignalId, type SignalResult } from "@veritas/shared";
import { SIGNAL_WEIGHTS } from "../config.js";

/** Below this share of evidence weight we refuse to give a score at all. */
export const MIN_COVERAGE = 0.05;

const SEVERITY_RANK = { high: 3, medium: 2, low: 1, info: 0 } as const;

export interface OverallScore {
  score: number | null;
  band: Band;
  /** Share of the total possible evidence weight that was actually available (0–1). */
  coverage: number;
  topReasons: string[];
}

export function bandFor(score: number): Band {
  if (score >= 75) return "likely_reliable";
  if (score >= 55) return "mixed";
  if (score >= 35) return "questionable";
  return "likely_false";
}

/**
 * Confidence-weighted mean of the signal scores. Signals that were skipped or failed don't
 * drag the score down; they reduce coverage, and too little coverage yields "unknown".
 */
export function computeOverall(signals: SignalResult[], applicable: readonly SignalId[] = SIGNAL_IDS): OverallScore {
  // Coverage is measured against the signals that make sense for this input (an uploaded image has no publisher).
  const totalWeight = applicable.reduce((a, id) => a + SIGNAL_WEIGHTS[id], 0);
  let weighted = 0;
  let weightSum = 0;
  for (const s of signals) {
    if (s.status !== "done" || s.score === null) continue;
    const w = SIGNAL_WEIGHTS[s.id] * s.confidence;
    weighted += s.score * w;
    weightSum += w;
  }
  const coverage = weightSum / totalWeight;

  // Any single "high" finding with a very low signal score (e.g. satire site) caps the result.
  const hardFail = signals.some((s) => s.status === "done" && s.score !== null && s.score <= 15 && s.confidence >= 0.8);
  let score = weightSum > 0 && coverage >= MIN_COVERAGE ? weighted / weightSum : null;
  if (score !== null && hardFail) score = Math.min(score, 30);

  const topReasons = signals
    .flatMap((s) => s.findings.map((f) => ({ f, label: SIGNAL_LABELS[s.id] })))
    .filter(({ f }) => f.severity === "high" || f.severity === "medium")
    .sort((a, b) => SEVERITY_RANK[b.f.severity] - SEVERITY_RANK[a.f.severity])
    .slice(0, 5)
    .map(({ f, label }) => `${label}: ${f.tag ? `${f.tag}: ` : ""}${f.message}`);

  return {
    score: score === null ? null : Math.round(score),
    band: score === null ? "unknown" : bandFor(score),
    coverage,
    topReasons,
  };
}
