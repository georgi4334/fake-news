import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { ArticleMeta } from "@veritas/shared";

/** Everything the analyzers get to look at. */
export interface ArticleContext {
  inputKind: "url" | "text" | "image";
  /** Set by the job runner so analyzers can store artifacts (image thumbnails, heatmaps). */
  analysisId?: string;
  /** Images the user uploaded directly (image input only). */
  uploadedImages?: Buffer[];
  /** Caption or claim the user submitted with an uploaded image. */
  caption?: string;
  meta: ArticleMeta;
  text: string;
  /** Present only for URL inputs. */
  page?: PageFacts;
}

export interface PageFacts {
  https: boolean;
  redirects: string[];
  links: { href: string; text: string; external: boolean }[];
  /** Dates found in different places, used to cross-check consistency. */
  dateSources: { source: string; value: string }[];
  hasAboutLink: boolean;
  hasContactLink: boolean;
  hasCorrectionsLink: boolean;
  adScriptCount: number;
  iframeCount: number;
  canonicalUrl?: string;
  siteName?: string;
}

const AD_HOSTS = /(doubleclick|googlesyndication|adservice|taboola|outbrain|revcontent|mgid|adnxs|criteo|pubmatic|amazon-adsystem)/i;

function metaContent(doc: Document, ...selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const v = doc.querySelector(sel)?.getAttribute("content")?.trim();
    if (v) return v;
  }
  return undefined;
}

function jsonLdObjects(doc: Document): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(el.textContent ?? "");
      const stack = Array.isArray(parsed) ? parsed : [parsed];
      while (stack.length) {
        const item = stack.pop();
        if (item && typeof item === "object") {
          out.push(item);
          if (Array.isArray(item["@graph"])) stack.push(...item["@graph"]);
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return out;
}

function nameOf(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(nameOf).filter(Boolean).join(", ") || undefined;
  if (typeof v === "object" && "name" in v && typeof (v as { name: unknown }).name === "string") return (v as { name: string }).name;
  return undefined;
}

export function extractFromHtml(html: string, url: string, redirects: string[] = []): ArticleContext {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const pageUrl = new URL(url);

  const ld = jsonLdObjects(doc).find((o) => /Article|NewsArticle|BlogPosting|Report/i.test(String(o["@type"]))) ?? {};

  const dateSources: PageFacts["dateSources"] = [];
  const pushDate = (source: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) dateSources.push({ source, value: value.trim() });
  };
  pushDate("json-ld datePublished", ld["datePublished"]);
  pushDate("meta article:published_time", metaContent(doc, 'meta[property="article:published_time"]'));
  pushDate("meta date", metaContent(doc, 'meta[name="date"]', 'meta[name="pubdate"]', 'meta[itemprop="datePublished"]'));
  pushDate("<time> element", doc.querySelector("article time[datetime], time[datetime]")?.getAttribute("datetime"));
  const urlDate = pageUrl.pathname.match(/\/(20\d{2}|19\d{2})[/-](\d{1,2})[/-](\d{1,2})\//);
  if (urlDate) pushDate("URL path", `${urlDate[1]}-${urlDate[2].padStart(2, "0")}-${urlDate[3].padStart(2, "0")}`);

  const modifiedAt =
    (typeof ld["dateModified"] === "string" ? ld["dateModified"] : undefined) ??
    metaContent(doc, 'meta[property="article:modified_time"]');

  const links = [...doc.querySelectorAll("a[href]")].flatMap((a) => {
    try {
      const href = new URL(a.getAttribute("href")!, pageUrl);
      if (!/^https?:$/.test(href.protocol)) return [];
      return [{ href: href.toString(), text: (a.textContent ?? "").trim().slice(0, 120), external: href.hostname !== pageUrl.hostname }];
    } catch {
      return [];
    }
  });
  const linkMatches = (re: RegExp) => links.some((l) => re.test(l.text) || re.test(new URL(l.href).pathname));

  const scripts = [...doc.querySelectorAll("script[src]")].map((s) => s.getAttribute("src") ?? "");
  const ogImage = metaContent(doc, 'meta[property="og:image"]');
  const siteName = metaContent(doc, 'meta[property="og:site_name"]') ?? nameOf(ld["publisher"]);
  const headline =
    metaContent(doc, 'meta[property="og:title"]') ?? (typeof ld["headline"] === "string" ? ld["headline"] : undefined) ?? doc.title;
  const author = nameOf(ld["author"]) ?? metaContent(doc, 'meta[name="author"]', 'meta[property="article:author"]');

  // Readability mutates the document, so run it last on a clone.
  const article = new Readability(doc.cloneNode(true) as Document).parse();
  const text = (article?.textContent ?? doc.body?.textContent ?? "").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();

  const contentDoc = article?.content ? new JSDOM(article.content, { url }).window.document : doc;
  const imageUrls = [ogImage, ...[...contentDoc.querySelectorAll("img[src]")].map((i) => i.getAttribute("src"))]
    .filter((s): s is string => Boolean(s))
    .map((s) => {
      try {
        return new URL(s, pageUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((s): s is string => Boolean(s));

  return {
    inputKind: "url",
    text,
    meta: {
      url,
      domain: pageUrl.hostname.replace(/^www\./, ""),
      title: (article?.title || headline)?.trim(),
      author: author ?? article?.byline ?? undefined,
      publisher: siteName ?? article?.siteName ?? undefined,
      publishedAt: dateSources[0]?.value,
      modifiedAt,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      imageUrls: [...new Set(imageUrls)].slice(0, 10),
    },
    page: {
      https: pageUrl.protocol === "https:",
      redirects,
      links,
      dateSources,
      hasAboutLink: linkMatches(/about|who we are|our team|за нас/i),
      hasContactLink: linkMatches(/contact|контакт/i),
      hasCorrectionsLink: linkMatches(/correction|editorial (policy|standards)|ethics|fact.?check/i),
      adScriptCount: scripts.filter((s) => AD_HOSTS.test(s)).length,
      iframeCount: doc.querySelectorAll("iframe").length,
      canonicalUrl: doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? undefined,
      siteName,
    },
  };
}

export function contextFromImage(images: Buffer[], caption?: string): ArticleContext {
  return {
    inputKind: "image",
    text: caption?.trim() ?? "",
    caption: caption?.trim() || undefined,
    uploadedImages: images,
    meta: { title: caption?.trim() || undefined, wordCount: 0, imageUrls: [] },
  };
}

export function contextFromText(input: { text: string; title?: string; publisher?: string; publishedAt?: string }): ArticleContext {
  const text = input.text.trim();
  return {
    inputKind: "text",
    text,
    meta: {
      title: input.title,
      publisher: input.publisher,
      publishedAt: input.publishedAt,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      imageUrls: [],
    },
  };
}
