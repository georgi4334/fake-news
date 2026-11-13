import type { Finding } from "@veritas/shared";
import { ESTABLISHED_OUTLETS, FACT_CHECKERS, matchesDomain } from "../data/domains.js";
import { LlmUnavailableError } from "../llm/claude.js";
import { getStyleReview } from "./styleReview.js";
import { headlineIssues } from "./textStats.js";
import { clamp, type Analyzer } from "./types.js";

const PRIMARY_SOURCE = /(\.gov(\.[a-z]{2})?|\.edu|\.int|europa\.eu|who\.int|doi\.org|arxiv\.org|pubmed|ncbi\.nlm\.nih\.gov|data\.|statistics|stats\.)/i;

export const presentationAnalyzer: Analyzer = {
  id: "presentation",
  async analyze(ctx) {
    const findings: Finding[] = [];
    let score = 80;
    let confidence = 0.5;

    const headline = ctx.meta.title ?? "";
    if (headline) {
      const issues = headlineIssues(headline);
      if (issues.length) {
        score -= Math.min(30, issues.length * 10);
        findings.push({ severity: issues.length > 1 ? "high" : "medium", message: `Clickbait headline: ${issues.join("; ")}`, evidence: headline });
      }
    }

    if ((ctx.meta.wordCount ?? 0) < 150) {
      score -= 10;
      findings.push({ severity: "low", message: "Very short article: little room for context or sourcing" });
    }

    const page = ctx.page;
    if (page) {
      const external = page.links.filter((l) => l.external);
      const primary = external.filter((l) => PRIMARY_SOURCE.test(l.href));
      const reputable = external.filter((l) => {
        const host = new URL(l.href).hostname.replace(/^www\./, "");
        return matchesDomain(host, ESTABLISHED_OUTLETS) || matchesDomain(host, FACT_CHECKERS);
      });
      if (primary.length + reputable.length > 0) {
        score += 8;
        findings.push({
          severity: "info",
          message: `Links to ${primary.length} primary source(s) and ${reputable.length} established outlet(s)`,
          evidence: [...primary, ...reputable].slice(0, 3).map((l) => l.href).join("\n"),
        });
      } else if ((ctx.meta.wordCount ?? 0) > 300) {
        score -= 10;
        findings.push({ severity: "medium", message: "No links to primary sources or other reputable outlets" });
      }
      if (page.adScriptCount >= 4) {
        score -= 10;
        findings.push({ severity: "medium", message: `Heavy advertising / content-recommendation networks (${page.adScriptCount} ad scripts)` });
      }
      if (page.redirects.length >= 2) {
        score -= 5;
        findings.push({ severity: "low", message: `URL went through ${page.redirects.length} redirects`, evidence: page.redirects.join(" → ") });
      }
    } else {
      confidence = 0.3;
    }

    try {
      const review = await getStyleReview(ctx);
      confidence += 0.2;
      if (!review.headline_matches_body) {
        score -= 20;
        findings.push({ severity: "high", message: "Headline is not supported by the article body", evidence: review.headline_issue || headline });
      }
    } catch (err) {
      if (!(err instanceof LlmUnavailableError)) confidence -= 0.1;
    }

    return { score: clamp(score), confidence, summary: "Headline, sourcing links and page presentation.", findings };
  },
};
