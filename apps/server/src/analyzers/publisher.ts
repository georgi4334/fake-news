import type { Finding } from "@veritas/shared";
import { ESTABLISHED_OUTLETS, IMITATED_BRANDS, SATIRE_SITES, USER_GENERATED_HOSTS, matchesDomain } from "../data/domains.js";
import { cached } from "../store/index.js";
import { clamp, type Analyzer } from "./types.js";

interface DomainInfo {
  registeredAt?: string;
}

/** Domain registration date via RDAP (the modern WHOIS). Cached for a week. */
export async function lookupDomainInfo(domain: string): Promise<DomainInfo | null> {
  const registrable = domain.split(".").slice(-2).join(".");
  return cached(`rdap:${registrable}`, 7 * 24 * 3600, async () => {
    try {
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(registrable)}`, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: "application/rdap+json" },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { events?: { eventAction: string; eventDate: string }[] };
      const reg = json.events?.find((e) => e.eventAction === "registration");
      return { registeredAt: reg?.eventDate };
    } catch {
      return null;
    }
  });
}

/** Detects domains like "cnn-news.co" or "abcnews.com.co" that borrow a known brand. */
export function lookalikeBrand(domain: string): string | null {
  const label = domain.split(".").slice(0, -1).join(".");
  for (const [brand, official] of Object.entries(IMITATED_BRANDS)) {
    if (label.includes(brand) && !matchesDomain(domain, official)) return brand;
  }
  return null;
}

export const publisherAnalyzer: Analyzer = {
  id: "publisher",
  async analyze(ctx) {
    const findings: Finding[] = [];
    const domain = ctx.meta.domain;

    if (!domain) {
      // Pasted text: we only know what the user told us.
      if (!ctx.meta.publisher) {
        return { score: null, confidence: 0, skipped: true, summary: "No URL or publisher provided.", findings };
      }
      findings.push({ severity: "info", message: `Publisher given as "${ctx.meta.publisher}" (not verified)` });
      return { score: 60, confidence: 0.1, summary: "Publisher could not be verified without a URL.", findings };
    }

    let score = 60;
    let confidence = 0.6;

    if (matchesDomain(domain, ESTABLISHED_OUTLETS)) {
      score = 88;
      confidence = 0.8;
      findings.push({ severity: "info", message: "Established news organization with a public editorial process", evidence: domain });
    }
    if (matchesDomain(domain, SATIRE_SITES)) {
      score = 10;
      confidence = 0.95;
      findings.push({ severity: "high", message: "Known satire website: content is intentionally fictional", evidence: domain });
    }
    if (matchesDomain(domain, USER_GENERATED_HOSTS)) {
      score -= 15;
      findings.push({ severity: "medium", message: "Hosted on a self-publishing platform (no editorial oversight)", evidence: domain });
    }
    const brand = lookalikeBrand(domain);
    if (brand) {
      score -= 35;
      confidence = Math.max(confidence, 0.75);
      findings.push({ severity: "high", message: `Domain imitates a known outlet ("${brand}")`, evidence: domain });
    }

    const page = ctx.page;
    if (page) {
      if (!page.https) {
        score -= 8;
        findings.push({ severity: "low", message: "Site does not use HTTPS" });
      }
      if (!page.hasAboutLink) {
        score -= 6;
        findings.push({ severity: "low", message: "No 'About us' page linked" });
      }
      if (!page.hasContactLink) {
        score -= 4;
        findings.push({ severity: "low", message: "No contact page linked" });
      }
      if (page.hasCorrectionsLink) {
        score += 6;
        findings.push({ severity: "info", message: "Publishes a corrections / editorial-standards page" });
      }
    }
    if (!ctx.meta.author) {
      score -= 8;
      findings.push({ severity: "medium", message: "No author byline" });
    } else {
      findings.push({ severity: "info", message: "Article has an author byline", evidence: ctx.meta.author });
    }

    const info = await lookupDomainInfo(domain);
    if (info?.registeredAt) {
      const ageDays = (Date.now() - new Date(info.registeredAt).getTime()) / 86_400_000;
      const years = (ageDays / 365).toFixed(1);
      if (ageDays < 180) {
        score -= 25;
        findings.push({ severity: "high", message: `Domain registered very recently (${Math.round(ageDays)} days ago)`, evidence: info.registeredAt });
      } else if (ageDays < 730) {
        score -= 8;
        findings.push({ severity: "low", message: `Domain is relatively new (${years} years old)` });
      } else {
        score += 5;
        findings.push({ severity: "info", message: `Domain registered ${years} years ago` });
      }
    } else {
      confidence -= 0.15;
    }

    return {
      score: clamp(score),
      confidence,
      summary: `Reputation and transparency checks for ${domain}.`,
      findings,
    };
  },
};
