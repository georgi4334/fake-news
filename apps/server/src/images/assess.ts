import type { Finding } from "@veritas/shared";
import { FACT_CHECKERS, matchesDomain } from "../data/domains.js";
import type { ImageMetadata } from "./metadata.js";
import type { Provenance } from "./provenance.js";
import type { ReverseSearchResult } from "./reverseSearch.js";
import type { VisionReview } from "./vision.js";

export interface ImageEvidence {
  provenance?: Provenance;
  metadata?: ImageMetadata;
  reverse?: ReverseSearchResult | null;
  vision?: VisionReview;
  /** Article publication date, to spot old photos presented as new. */
  articleDate?: Date;
}

const DAY = 86_400_000;

/**
 * Turns raw forensic evidence into a 0–100 score and findings. Strong, explicit evidence
 * (an AI declaration in Content Credentials or a generator's own metadata) dominates; visual
 * judgments are weak evidence. The error-level heatmap is for people to inspect and is not scored.
 */
export function assessImage(e: ImageEvidence): { score: number; confidence: number; findings: Finding[] } {
  const findings: Finding[] = [];
  let score = 80;
  let ceiling = 100;
  let confidence = 0.35;

  const p = e.provenance;
  if (p?.aiDeclaration) {
    ceiling = e.vision?.is_illustration ? 20 : 10;
    confidence = p.signed ? 0.95 : 0.9;
    findings.push({
      severity: "high",
      tag: "AI-generated",
      message: `${p.signed ? "Signed Content Credentials" : "Embedded metadata"} declare this image was ${p.aiDeclaration}${p.generator ? ` (${p.generator})` : ""}. If it's presented as a real photo without saying so, viewers are being misled.`,
      evidence: `IPTC digital source type: ${p.sourceType}`,
    });
  } else if (p?.hasManifest) {
    if (/invalid/i.test(p.validationState ?? "")) {
      score -= 15;
      findings.push({ severity: "medium", message: "Content Credentials are present but fail validation: the image may have been altered after it was signed", evidence: p.validationState });
    } else {
      score += 5;
      confidence += 0.2;
      findings.push({
        severity: "info",
        message: `Carries Content Credentials${p.generator ? ` from ${p.generator}` : ""}${p.actions.length ? `; recorded edits: ${p.actions.join(", ")}` : ""}`,
      });
    }
  }

  const m = e.metadata;
  if (m?.aiGenerator) {
    ceiling = Math.min(ceiling, 10);
    confidence = Math.max(confidence, 0.9);
    findings.push({ severity: "high", tag: "AI-generated", message: `Metadata was written by an AI image generator (${m.aiGenerator})`, evidence: m.generatorText ?? m.software });
  }
  if (m?.editor) findings.push({ severity: "info", message: `Saved with photo-editing software (${m.editor}); routine for news photos and not by itself a red flag` });
  if (m?.camera) {
    score += 5;
    confidence += 0.1;
    findings.push({ severity: "info", message: `Camera metadata present: ${m.camera}` });
  }
  if (m?.takenAt && e.articleDate) {
    const years = (e.articleDate.getTime() - m.takenAt.getTime()) / (365 * DAY);
    if (years > 1) {
      score -= 20;
      findings.push({
        severity: "medium",
        tag: "Older photo",
        message: `Photo was taken ${years.toFixed(1)} years before the article: check it isn't being presented as new`,
        evidence: `Taken ${m.takenAt.toISOString().slice(0, 10)}`,
      });
    }
  }
  if (m?.stripped && !p?.hasManifest) findings.push({ severity: "info", message: "No camera metadata (common after social-media or website re-encoding)" });

  const r = e.reverse;
  if (r) {
    confidence += 0.1;
    const factChecks = r.pages.filter((pg) => matchesDomain(new URL(pg.url).hostname.replace(/^www\./, ""), FACT_CHECKERS));
    if (factChecks.length) {
      ceiling = Math.min(ceiling, 20);
      confidence = Math.max(confidence, 0.8);
      findings.push({
        severity: "high",
        tag: "Fact-checked",
        message: "This image appears in published fact-checks: it has been used misleadingly before",
        links: factChecks.slice(0, 3).map((pg) => ({ title: pg.title, url: pg.url })),
      });
    }
    if (r.pages.length) {
      findings.push({
        severity: "info",
        message: `Found on ${r.pages.length} other web page${r.pages.length === 1 ? "" : "s"}${r.bestGuess ? ` (described as "${r.bestGuess}")` : ""}: check where it first appeared`,
        links: r.pages.filter((pg) => !factChecks.includes(pg)).slice(0, 3).map((pg) => ({ title: pg.title, url: pg.url })),
      });
    } else if (r.fullMatches + r.partialMatches === 0) {
      findings.push({ severity: "info", message: "No other copies found on the web" });
    }
  }

  const v = e.vision;
  if (v) {
    confidence += 0.15;
    if (v.ai_generated_likelihood === "high" && !v.is_illustration) {
      score -= 35;
      findings.push({ severity: "medium", tag: "Looks AI-made", message: "Visual inspection suggests the image is AI-generated", evidence: v.generation_artifacts.join("; ") || v.summary });
    } else if (v.ai_generated_likelihood === "medium" && !v.is_illustration) {
      score -= 15;
      findings.push({ severity: "low", message: "Some visual features are typical of AI-generated images", evidence: v.generation_artifacts.join("; ") || v.summary });
    }
    if (v.manipulation_signs.length) {
      score -= 15;
      findings.push({ severity: "medium", message: "Possible signs of editing or compositing", evidence: v.manipulation_signs.join("; ") });
    }
    if (v.caption_consistency === "inconsistent") {
      score -= 25;
      findings.push({ severity: "medium", tag: "Out of context", message: "The image doesn't appear to match its caption or headline", evidence: v.caption_issue });
    }
    if (v.is_illustration) findings.push({ severity: "info", message: "This is an illustration or graphic, not a news photograph" });
  }

  return { score: Math.max(0, Math.min(score, ceiling, 100)), confidence: Math.min(confidence, 0.95), findings };
}
