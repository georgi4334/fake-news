import { config } from "../config.js";
import { cached } from "../store/index.js";
import { resizedJpeg, type LoadedImage } from "./load.js";

export interface ReverseSearchResult {
  fullMatches: number;
  partialMatches: number;
  pages: { url: string; title: string }[];
  bestGuess?: string;
}

interface WebDetection {
  fullMatchingImages?: { url: string }[];
  partialMatchingImages?: { url: string }[];
  pagesWithMatchingImages?: { url: string; pageTitle?: string }[];
  bestGuessLabels?: { label: string }[];
}

export function parseWebDetection(w: WebDetection | undefined): ReverseSearchResult {
  return {
    fullMatches: w?.fullMatchingImages?.length ?? 0,
    partialMatches: w?.partialMatchingImages?.length ?? 0,
    pages: (w?.pagesWithMatchingImages ?? [])
      .filter((p) => /^https?:\/\//.test(p.url))
      .map((p) => ({ url: p.url, title: (p.pageTitle ?? "").replace(/<[^>]+>/g, "").trim() || new URL(p.url).hostname })),
    bestGuess: w?.bestGuessLabels?.[0]?.label,
  };
}

export const reverseSearchEnabled = () => Boolean(config.googleVisionKey);

/** Where else this image appears on the web (Google Cloud Vision web detection). Null when unavailable. */
export async function reverseSearch(img: LoadedImage): Promise<ReverseSearchResult | null> {
  const key = config.googleVisionKey;
  if (!key) return null;
  return cached(`vision-web:${img.sha256}`, 7 * 24 * 3600, async () => {
    try {
      const content = (await resizedJpeg(img, 1024)).toString("base64");
      const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: "WEB_DETECTION", maxResults: 15 }] }] }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { responses?: { webDetection?: WebDetection; error?: unknown }[] };
      const r = json.responses?.[0];
      return r?.error ? null : parseWebDetection(r?.webDetection);
    } catch {
      return null;
    }
  });
}
