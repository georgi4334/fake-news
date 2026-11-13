import { lookup } from "node:dns/promises";
import net from "node:net";
import { config } from "../config.js";

export class UnsafeUrlError extends Error {}

const BLOCKED_V4 = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const;

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return BLOCKED_V4.some(([base, bits]) => {
      const mask = (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("ff");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new UnsafeUrlError("URLs with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError("URL resolves to a private or reserved address");
  }
  return url;
}

export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  redirects: string[];
}

interface RawFetch {
  finalUrl: string;
  status: number;
  contentType: string;
  data: Buffer;
  truncated: boolean;
  redirects: string[];
}

/** GET a public URL: re-validates every redirect hop, caps size and time. */
async function safeFetchRaw(rawUrl: string, accept: string, maxBytes: number, maxRedirects = 5): Promise<RawFetch> {
  let current = rawUrl;
  const redirects: string[] = [];
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
      headers: { "user-agent": "Mozilla/5.0 (compatible; VeritasBot/0.1; credibility-analysis)", accept },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      redirects.push(current);
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const { data, truncated } = await readCapped(res, maxBytes);
    return { finalUrl: url.toString(), status: res.status, contentType, data, truncated, redirects };
  }
  throw new Error("Too many redirects");
}

export async function safeFetchText(rawUrl: string): Promise<FetchedPage> {
  const r = await safeFetchRaw(rawUrl, "text/html,application/xhtml+xml", config.maxHtmlBytes);
  return { finalUrl: r.finalUrl, status: r.status, contentType: r.contentType, body: r.data.toString("utf8"), redirects: r.redirects };
}

export class TooLargeError extends Error {}

/** Downloads an image. Rejects non-image responses and anything over `maxBytes`. */
export async function safeFetchImage(rawUrl: string, maxBytes: number): Promise<{ data: Buffer; finalUrl: string }> {
  const r = await safeFetchRaw(rawUrl, "image/*", maxBytes);
  if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
  if (!/^image\//i.test(r.contentType)) throw new Error(`Not an image (${r.contentType || "unknown type"})`);
  if (r.truncated) throw new TooLargeError("Image is too large");
  return { data: r.data, finalUrl: r.finalUrl };
}

/** Reads at most `maxBytes`; `truncated` tells whether the body was longer. */
async function readCapped(res: Response, maxBytes: number): Promise<{ data: Buffer; truncated: boolean }> {
  if (!res.body) return { data: Buffer.alloc(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { data: Buffer.concat(chunks), truncated: true };
    }
    chunks.push(value);
  }
  return { data: Buffer.concat(chunks), truncated: false };
}
