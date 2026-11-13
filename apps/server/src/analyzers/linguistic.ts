import type { Finding } from "@veritas/shared";
import { LlmUnavailableError } from "../llm/claude.js";
import { getStyleReview } from "./styleReview.js";
import { textStats } from "./textStats.js";
import { clamp, type Analyzer } from "./types.js";

const SEVERITY_PENALTY = { low: 4, medium: 9, high: 16 } as const;

export const linguisticAnalyzer: Analyzer = {
  id: "linguistic",
  async analyze(ctx) {
    const s = textStats(ctx.text);
    const per1k = (n: number) => (n / s.words) * 1000;
    const findings: Finding[] = [];
    let score = 85;

    if (per1k(s.exclamations) > 3) {
      score -= 12;
      findings.push({ severity: "medium", message: `Heavy use of exclamation marks (${s.exclamations})` });
    }
    if (per1k(s.allCapsWords.length) > 4) {
      score -= 10;
      findings.push({ severity: "medium", message: "Shouting in ALL CAPS", evidence: s.allCapsWords.slice(0, 6).join(", ") });
    }
    if (s.sensational.total) {
      score -= Math.min(20, s.sensational.total * 5);
      findings.push({ severity: s.sensational.total > 2 ? "high" : "medium", message: "Sensational vocabulary", evidence: s.sensational.hits.join(", ") });
    }
    if (per1k(s.absolutist.total) > 4) {
      score -= 6;
      findings.push({ severity: "low", message: "Many absolute/generalizing terms", evidence: s.absolutist.hits.join(", ") });
    }
    if (s.vagueAttribution.total > s.namedAttributions / 2 && s.vagueAttribution.total > 0) {
      score -= 10;
      findings.push({ severity: "medium", message: "Claims attributed to unnamed sources", evidence: s.vagueAttribution.hits.join(", ") });
    }
    if (s.words > 300 && s.namedAttributions === 0 && s.quotes === 0) {
      score -= 12;
      findings.push({ severity: "medium", message: "No quoted or named sources found" });
    } else if (s.namedAttributions >= 3) {
      score += 5;
      findings.push({ severity: "info", message: `Cites named sources (${s.namedAttributions} attributions, ${s.quotes} quotes)` });
    }
    if (per1k(s.secondPerson) > 15) {
      score -= 5;
      findings.push({ severity: "low", message: "Addresses the reader directly a lot (persuasive rather than reporting tone)" });
    }

    const heuristicScore = clamp(score);
    try {
      const review = await getStyleReview(ctx);
      let llmScore = review.writing_quality_score;
      for (const p of review.patterns) {
        if (p.pattern === "satire_markers") continue;
        llmScore -= SEVERITY_PENALTY[p.severity];
        findings.push({ severity: p.severity, message: `${p.pattern.replace(/_/g, " ")}: ${p.explanation}`, evidence: p.quote });
      }
      for (const strength of review.strengths.slice(0, 3)) findings.push({ severity: "info", message: strength });
      if (review.likely_satire) {
        findings.unshift({ severity: "high", message: "This appears to be satire, not factual reporting" });
      }
      return {
        score: 0.35 * heuristicScore + 0.65 * clamp(llmScore),
        confidence: 0.8,
        summary: review.summary,
        findings,
      };
    } catch (err) {
      if (!(err instanceof LlmUnavailableError)) {
        findings.push({ severity: "info", message: `AI review unavailable: ${(err as Error).message}` });
      }
      return {
        score: heuristicScore,
        confidence: s.words < 150 ? 0.25 : 0.45,
        summary: "Heuristic analysis of tone, sourcing and sensational language.",
        findings,
      };
    }
  },
};
