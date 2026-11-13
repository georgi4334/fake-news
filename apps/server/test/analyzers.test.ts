import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { linguisticAnalyzer } from "../src/analyzers/linguistic.js";
import { presentationAnalyzer } from "../src/analyzers/presentation.js";
import { lookalikeBrand } from "../src/analyzers/publisher.js";
import { headlineIssues } from "../src/analyzers/textStats.js";
import { extractFromHtml } from "../src/extract/article.js";
import { isPrivateAddress } from "../src/extract/safeFetch.js";
import type { SignalResult } from "@veritas/shared";
import { computeOverall } from "../src/scoring/score.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const reliable = () => extractFromHtml(fixture("reliable.html"), "https://tribune.example.com/2026/03/02/budget/");
const sensational = () => extractFromHtml(fixture("sensational.html"), "http://health-truth.example/miracle");

describe("extractFromHtml", () => {
  it("pulls metadata, dates and transparency links", () => {
    const ctx = reliable();
    expect(ctx.meta.title).toContain("City council");
    expect(ctx.meta.author).toBe("Maria Ivanova");
    expect(ctx.meta.publisher).toBe("Example Tribune");
    expect(ctx.page?.dateSources.map((d) => d.source)).toContain("URL path");
    expect(ctx.page?.hasAboutLink && ctx.page.hasContactLink && ctx.page.hasCorrectionsLink).toBe(true);
    expect(ctx.text).toContain("120 million euro");
  });

  it("counts ad networks", () => {
    expect(sensational().page?.adScriptCount).toBe(4);
  });
});

describe("linguistic analyzer (heuristics only)", () => {
  it("scores careful reporting well above sensational writing", async () => {
    const good = await linguisticAnalyzer.analyze(reliable());
    const bad = await linguisticAnalyzer.analyze(sensational());
    expect(good.score!).toBeGreaterThanOrEqual(75);
    expect(bad.score!).toBeLessThan(40);
    expect(bad.findings.map((f) => f.message).join(" ")).toMatch(/Sensational/);
  });
});

describe("presentation analyzer", () => {
  it("flags clickbait and ads, rewards primary sources", async () => {
    const good = await presentationAnalyzer.analyze(reliable());
    const bad = await presentationAnalyzer.analyze(sensational());
    expect(good.score!).toBeGreaterThan(bad.score!);
    expect(bad.findings.some((f) => f.message.startsWith("Clickbait headline"))).toBe(true);
  });
});

describe("headlineIssues", () => {
  it("accepts a plain headline", () => {
    expect(headlineIssues("City council approves new budget for public transport")).toEqual([]);
  });
});

describe("lookalikeBrand", () => {
  it.each([
    ["cnn-news.co", "cnn"],
    ["abcnews.com.co", "abcnews"],
    ["bbc-breaking.net", "bbc"],
  ])("flags %s", (domain, brand) => expect(lookalikeBrand(domain)).toBe(brand));
  it.each(["cnn.com", "edition.cnn.com", "foxnews.com", "bbc.co.uk", "example.org"])("does not flag %s", (d) =>
    expect(lookalikeBrand(d)).toBeNull(),
  );
});

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "151.101.1.69", "2606:4700::1111"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("computeOverall", () => {
  const sig = (id: SignalResult["id"], score: number, confidence: number): SignalResult => ({ id, status: "done", score, confidence, findings: [] });

  it("ignores skipped signals and bands the score", () => {
    const r = computeOverall([
      sig("linguistic", 90, 0.8),
      sig("publisher", 80, 0.8),
      { id: "factcheck", status: "skipped", score: null, confidence: 0, findings: [] },
    ]);
    expect(r.score).toBe(85);
    expect(r.band).toBe("likely_reliable");
  });

  it("caps the result when a confident signal fails hard (e.g. satire site)", () => {
    const r = computeOverall([sig("linguistic", 90, 0.8), sig("publisher", 10, 0.95)]);
    expect(r.score).toBeLessThanOrEqual(30);
  });

  it("returns unknown with no usable signals", () => {
    expect(computeOverall([]).band).toBe("unknown");
  });

  it("refuses to score when almost no evidence was available", () => {
    const r = computeOverall([sig("timing", 20, 0.2)]); // 0.1 weight × 0.2 confidence = 2% coverage
    expect(r.score).toBeNull();
    expect(r.band).toBe("unknown");
  });
});
