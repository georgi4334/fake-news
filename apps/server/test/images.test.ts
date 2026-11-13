import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { imagesAnalyzer } from "../src/analyzers/images.js";
import { config } from "../src/config.js";
import { contextFromImage } from "../src/extract/article.js";
import { assessImage } from "../src/images/assess.js";
import { errorLevelAnalysis } from "../src/images/ela.js";
import { UnsupportedImageError, loadImage } from "../src/images/load.js";
import { readMetadata, readPngText } from "../src/images/metadata.js";
import { checkProvenance } from "../src/images/provenance.js";
import { parseWebDetection, reverseSearch } from "../src/images/reverseSearch.js";
import type { VisionReview } from "../src/images/vision.js";
import { setClaudeClientForTests, type ClaudeClient } from "../src/llm/claude.js";
import { store } from "../src/store/index.js";
import { aiDeclaredJpeg, exifJpeg, plainJpeg, splicedJpeg, stableDiffusionPng } from "./imageFixtures.js";

const vision = (over: Partial<VisionReview> = {}): VisionReview => ({
  ai_generated_likelihood: "low",
  generation_artifacts: [],
  manipulation_signs: [],
  is_illustration: false,
  caption_consistency: "unknown",
  caption_issue: "",
  summary: "",
  ...over,
});

describe("loadImage", () => {
  it("detects the real format and rejects non-images", async () => {
    const img = await loadImage(await plainJpeg());
    expect(img).toMatchObject({ format: "jpeg", mime: "image/jpeg", width: 640, height: 480 });
    await expect(loadImage(Buffer.from("definitely not a picture"))).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});

describe("provenance", () => {
  it("finds an IPTC AI declaration in XMP", async () => {
    const p = await checkProvenance(await loadImage(await aiDeclaredJpeg()));
    expect(p.sourceType).toBe("trainedalgorithmicmedia");
    expect(p.aiDeclaration).toMatch(/generative AI/);
    expect(p.signed).toBe(false);
  });
  it("finds nothing in an ordinary photo", async () => {
    const p = await checkProvenance(await loadImage(await plainJpeg()));
    expect(p.aiDeclaration).toBeUndefined();
    expect(p.hasManifest).toBe(false);
  });
});

describe("metadata", () => {
  it("reads Stable Diffusion parameters from PNG text chunks", async () => {
    const png = await stableDiffusionPng();
    expect(readPngText(png).parameters).toMatch(/Sampler/);
    const m = await readMetadata(await loadImage(png));
    expect(m.aiGenerator).toMatch(/Stable Diffusion/);
  });
  it("flags generator software but treats photo editors as normal", async () => {
    expect((await readMetadata(await loadImage(await exifJpeg({ Software: "Midjourney v7" })))).aiGenerator).toBe("Midjourney v7");
    const edited = await readMetadata(await loadImage(await exifJpeg({ Make: "Canon", Model: "Canon EOS R5", Software: "Adobe Photoshop 25.0" }, "2015:06:01 10:00:00")));
    expect(edited).toMatchObject({ camera: "Canon EOS R5", editor: "Adobe Photoshop 25.0" });
    expect(edited.aiGenerator).toBeUndefined();
    expect(edited.takenAt?.getUTCFullYear()).toBe(2015);
  });
});

describe("error level analysis", () => {
  it("produces a bounded heatmap for JPEGs", async () => {
    const r = (await errorLevelAnalysis(await loadImage(await splicedJpeg())))!;
    const meta = await sharp(r.heatmap).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(800);
  });
  it("skips non-JPEG images", async () => {
    expect(await errorLevelAnalysis(await loadImage(await stableDiffusionPng()))).toBeNull();
  });
});

describe("assessImage", () => {
  it("declared AI generation dominates the score", () => {
    const r = assessImage({ provenance: { hasManifest: true, signed: true, sourceType: "trainedalgorithmicmedia", aiDeclaration: "created by generative AI", actions: [] } });
    expect(r.score).toBeLessThanOrEqual(10);
    expect(r.confidence).toBe(0.95);
    expect(r.findings[0]).toMatchObject({ severity: "high", tag: "AI-generated" });
  });
  it("does not penalize photo editing software", () => {
    const r = assessImage({ metadata: { editor: "Adobe Photoshop", camera: "Nikon D850", stripped: false } });
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.findings.every((f) => f.severity === "info")).toBe(true);
  });
  it("flags an old photo presented with a new article", () => {
    const r = assessImage({ metadata: { takenAt: new Date("2016-01-01"), stripped: false }, articleDate: new Date("2026-11-01") });
    expect(r.findings.find((f) => f.tag === "Older photo")?.severity).toBe("medium");
  });
  it("weighs visual review as weak evidence and spares labelled illustrations", () => {
    const looksAi = assessImage({ vision: vision({ ai_generated_likelihood: "high", generation_artifacts: ["six fingers"] }) });
    expect(looksAi.score).toBe(45);
    expect(looksAi.confidence).toBeLessThan(0.6);
    expect(assessImage({ vision: vision({ ai_generated_likelihood: "high", is_illustration: true }) }).score).toBe(80);
  });
  it("caps images found on fact-check sites", () => {
    const r = assessImage({ reverse: { fullMatches: 2, partialMatches: 0, pages: [{ url: "https://www.snopes.com/fact-check/x", title: "Fake photo" }] } });
    expect(r.score).toBeLessThanOrEqual(20);
    expect(r.findings[0].links?.[0].url).toContain("snopes.com");
  });
});

describe("reverse search", () => {
  afterEach(() => {
    config.googleVisionKey = undefined;
    vi.unstubAllGlobals();
  });
  it("parses web detection and strips HTML from titles", () => {
    const r = parseWebDetection({ fullMatchingImages: [{ url: "x" }], pagesWithMatchingImages: [{ url: "https://a.example/p", pageTitle: "<b>Flood</b> in 2015" }], bestGuessLabels: [{ label: "flood" }] });
    expect(r).toEqual({ fullMatches: 1, partialMatches: 0, pages: [{ url: "https://a.example/p", title: "Flood in 2015" }], bestGuess: "flood" });
  });
  it("is skipped without a key and calls Vision with one", async () => {
    const img = await loadImage(await plainJpeg(320, 240));
    expect(await reverseSearch(img)).toBeNull();
    config.googleVisionKey = "k";
    const fetchMock = vi.fn(async (_u: string, _init?: RequestInit) => new Response(JSON.stringify({ responses: [{ webDetection: { pagesWithMatchingImages: [] } }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await reverseSearch(img)).toMatchObject({ pages: [] });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).requests[0].features[0].type).toBe("WEB_DETECTION");
  });
});

describe("imagesAnalyzer", () => {
  afterEach(() => setClaudeClientForTests(null));

  it("analyzes an upload, stores thumbnail + heatmap, and returns per-image detail", async () => {
    const ctx = contextFromImage([await aiDeclaredJpeg()], "Protesters storm the parliament");
    ctx.analysisId = "img-test-1";
    const out = await imagesAnalyzer.analyze(ctx);
    expect(out.score!).toBeLessThanOrEqual(15);
    expect(out.extra?.images?.[0]).toMatchObject({ index: 0, format: "jpeg", hasThumbnail: true, hasHeatmap: true });
    expect(await store.getArtifact("img-test-1", 0, "thumb")).not.toBeNull();
    expect(await store.getArtifact("img-test-1", 0, "ela")).not.toBeNull();
  });

  it("sends the image and caption to Claude when available", async () => {
    const parse = vi.fn(async () => ({ stop_reason: "end_turn", parsed_output: vision({ caption_consistency: "inconsistent", caption_issue: "Snow on the ground, but the caption says July" }) }));
    setClaudeClientForTests({ beta: { messages: { parse: parse as never, create: vi.fn() as never } } } satisfies ClaudeClient);
    const out = await imagesAnalyzer.analyze(contextFromImage([await plainJpeg()], "Heatwave in July"));
    const content = (parse.mock.calls[0] as unknown as [{ messages: { content: { type: string; text?: string }[] }[] }])[0].messages[0].content;
    expect(content[0].type).toBe("image");
    expect(content[1].text).toContain("Heatwave in July");
    expect(out.findings.find((f) => f.tag === "Out of context")?.evidence).toMatch(/Snow/);
  });

  it("skips when there are no images", async () => {
    expect((await imagesAnalyzer.analyze(contextFromImage([]))).skipped).toBe(true);
  });
});
