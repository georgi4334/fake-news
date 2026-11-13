import type { Finding } from "@veritas/shared";
import { cached } from "../store/index.js";
import { clamp, type Analyzer } from "./types.js";

const DAY = 86_400_000;

function parseDate(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Earliest Wayback Machine capture of the URL, if archived. */
export async function firstArchivedAt(url: string): Promise<Date | null> {
  return cached(`wayback:${url}`, 24 * 3600, async () => {
    try {
      const api = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=1&fl=timestamp`;
      const res = await fetch(api, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const rows = (await res.json()) as string[][];
      const ts = rows[1]?.[0];
      if (!ts) return null;
      return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:00Z`;
    } catch {
      return null;
    }
  }).then((s) => (s ? new Date(s) : null));
}

export const timingAnalyzer: Analyzer = {
  id: "timing",
  async analyze(ctx) {
    const findings: Finding[] = [];
    const published = parseDate(ctx.meta.publishedAt);
    const now = Date.now();

    if (ctx.inputKind === "text" && !published) {
      return { score: null, confidence: 0, skipped: true, summary: "No publication date provided.", findings };
    }

    let score = 80;
    let confidence = ctx.inputKind === "url" ? 0.6 : 0.2;

    if (!published) {
      score -= 25;
      findings.push({ severity: "medium", message: "No publication date found on the page" });
    } else {
      const ageDays = (now - published.getTime()) / DAY;
      findings.push({ severity: "info", message: `Published ${published.toISOString().slice(0, 10)}` });
      if (ageDays < -1) {
        score -= 40;
        findings.push({ severity: "high", message: "Publication date is in the future", evidence: ctx.meta.publishedAt });
      } else if (ageDays > 365) {
        score -= 10;
        findings.push({
          severity: "medium",
          message: `Article is ${(ageDays / 365).toFixed(1)} years old: old stories are often re-shared as if they were new`,
        });
      }
    }

    // Cross-check every date we found on the page.
    const dates = (ctx.page?.dateSources ?? [])
      .map((d) => ({ ...d, date: parseDate(d.value) }))
      .filter((d): d is typeof d & { date: Date } => d.date !== null);
    if (dates.length >= 2) {
      const times = dates.map((d) => d.date.getTime());
      const spreadDays = (Math.max(...times) - Math.min(...times)) / DAY;
      if (spreadDays > 2) {
        score -= 20;
        findings.push({
          severity: "high",
          message: `Dates on the page disagree by ${Math.round(spreadDays)} days`,
          evidence: dates.map((d) => `${d.source}: ${d.date.toISOString().slice(0, 10)}`).join("; "),
        });
      } else {
        confidence += 0.1;
      }
    }

    const modified = parseDate(ctx.meta.modifiedAt);
    if (published && modified && (modified.getTime() - published.getTime()) / DAY > 30) {
      findings.push({ severity: "info", message: `Updated ${Math.round((modified.getTime() - published.getTime()) / DAY)} days after publication`, evidence: ctx.meta.modifiedAt });
    }

    if (ctx.meta.url && published) {
      const archived = await firstArchivedAt(ctx.meta.url);
      if (archived) {
        confidence += 0.1;
        const gapDays = (published.getTime() - archived.getTime()) / DAY;
        if (gapDays > 2) {
          score -= 30;
          findings.push({
            severity: "high",
            message: `Page was archived ${Math.round(gapDays)} days BEFORE its stated publication date: the date may have been changed to make old content look new`,
            evidence: `First archived ${archived.toISOString().slice(0, 10)}`,
          });
        }
      }
    }

    return { score: clamp(score), confidence: Math.min(confidence, 0.85), summary: "Checks date presence, consistency and archive history.", findings };
  },
};
