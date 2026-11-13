import { config } from "../config.js";
import { cached } from "../store/index.js";

/** One professional fact-check of a claim, from the Google Fact Check Tools API. */
export interface PublishedFactCheck {
  claim: string;
  claimant?: string;
  publisher: string;
  rating: string;
  url: string;
  title?: string;
  reviewedAt?: string;
}

interface ApiResponse {
  claims?: {
    text?: string;
    claimant?: string;
    claimReview?: {
      publisher?: { name?: string; site?: string };
      url?: string;
      title?: string;
      reviewDate?: string;
      textualRating?: string;
    }[];
  }[];
}

export function parseFactCheckResponse(json: ApiResponse): PublishedFactCheck[] {
  return (json.claims ?? []).flatMap((c) =>
    (c.claimReview ?? [])
      .filter((r) => r.url && r.textualRating)
      .map((r) => ({
        claim: c.text ?? "",
        claimant: c.claimant,
        publisher: r.publisher?.name ?? r.publisher?.site ?? new URL(r.url!).hostname,
        rating: r.textualRating!,
        url: r.url!,
        title: r.title,
        reviewedAt: r.reviewDate,
      })),
  );
}

export const googleFactCheckEnabled = () => Boolean(config.googleFactCheckKey);

/** Searches published fact-checks for a claim. Returns [] when the API is not configured or fails. */
export async function searchFactChecks(query: string, languageCode?: string, pageSize = 5): Promise<PublishedFactCheck[]> {
  const key = config.googleFactCheckKey;
  if (!key) return [];
  const q = query.trim().slice(0, 300);
  return cached(`gfc:${languageCode ?? ""}:${q.toLowerCase()}`, 24 * 3600, async () => {
    const params = new URLSearchParams({ query: q, pageSize: String(pageSize), key });
    if (languageCode) params.set("languageCode", languageCode);
    try {
      const res = await fetch(`https://factchecktools.googleapis.com/v1alpha1/claims:search?${params}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      return parseFactCheckResponse((await res.json()) as ApiResponse);
    } catch {
      return [];
    }
  });
}
