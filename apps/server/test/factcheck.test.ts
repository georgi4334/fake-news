import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  factcheckAnalyzer,
  filterSources,
  ratingToVerdict,
  scoreCheckedClaims,
  type CheckedClaim,
} from "../src/analyzers/factcheck.js";
import { config } from "../src/config.js";
import { contextFromText } from "../src/extract/article.js";
import { parseFactCheckResponse, searchFactChecks } from "../src/factcheck/googleFactCheck.js";
import { setClaudeClientForTests, type ClaudeClient } from "../src/llm/claude.js";

const googleFixture = JSON.parse(readFileSync(new URL("./fixtures/factcheck-google.json", import.meta.url), "utf8"));
const ARTICLE = contextFromText({
  title: "Lemon water cures cancer, study finds",
  text: "A new study published this week shows that drinking lemon water every morning cures cancer in 90% of patients, researchers said. ".repeat(8),
});

const claim = (verdict: CheckedClaim["verdict"], importance: CheckedClaim["importance"] = "supporting", sourced = true): CheckedClaim => ({
  claim: "x",
  importance,
  verdict,
  explanation: "",
  links: sourced ? [{ title: "s", url: "https://s.example" }] : [],
});

describe("scoreCheckedClaims", () => {
  it("scores well-supported articles highly", () => {
    const r = scoreCheckedClaims([claim("supported", "central"), claim("supported"), claim("mostly_supported")]);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.confidence).toBeCloseTo(0.7);
  });
  it("caps the score when a central claim is false", () => {
    const r = scoreCheckedClaims([claim("false", "central"), claim("supported"), claim("supported"), claim("supported")]);
    expect(r.score).toBeLessThanOrEqual(30);
  });
  it("has low confidence when nothing could be verified", () => {
    expect(scoreCheckedClaims([claim("unverifiable", "central", false), claim("unverifiable")]).confidence).toBe(0.2);
  });
});

describe("filterSources", () => {
  it("drops URLs the model never saw and de-duplicates", () => {
    const allowed = new Set(["https://real.example/a"]);
    const out = filterSources(["https://real.example/a#x", "https://invented.example/b", "https://real.example/a"], allowed, new Map());
    expect(out).toEqual([{ title: "real.example", url: "https://real.example/a#x" }]);
  });
});

describe("ratingToVerdict", () => {
  it.each([
    ["False", "false"],
    ["Pants on Fire!", "false"],
    ["Mostly True", "mostly_supported"],
    ["Half True", "disputed"],
    ["Missing context", "misleading"],
    ["True", "supported"],
    ["Satire", "misleading"],
  ])("%s → %s", (rating, verdict) => expect(ratingToVerdict(rating)).toBe(verdict));
});

describe("Google Fact Check client", () => {
  afterEach(() => {
    config.googleFactCheckKey = undefined;
    vi.unstubAllGlobals();
  });

  it("parses reviews and skips incomplete ones", () => {
    const r = parseFactCheckResponse(googleFixture);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ publisher: "Example Fact Check", rating: "False" });
  });

  it("calls the API once per query and caches the result", async () => {
    config.googleFactCheckKey = "test-key";
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(googleFixture)));
    vi.stubGlobal("fetch", fetchMock);
    const a = await searchFactChecks("cache test query", "en");
    const b = await searchFactChecks("cache test query", "en");
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("languageCode=en");
  });

  it("returns [] without a key", async () => {
    expect(await searchFactChecks("anything")).toEqual([]);
  });
});

describe("factcheckAnalyzer", () => {
  afterEach(() => {
    setClaudeClientForTests(null);
    config.googleFactCheckKey = undefined;
    vi.unstubAllGlobals();
  });

  it("skips when no API keys are configured", async () => {
    const r = await factcheckAnalyzer.analyze(ARTICLE);
    expect(r.skipped).toBe(true);
    expect(r.summary).toMatch(/API key/);
  });

  it("falls back to a headline lookup with only a Google key", async () => {
    config.googleFactCheckKey = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(googleFixture))));
    const r = await factcheckAnalyzer.analyze(ARTICLE);
    expect(r.skipped).toBeFalsy();
    expect(r.confidence).toBe(0.25);
    expect(r.findings[0]).toMatchObject({ tag: "False", severity: "high" });
    expect(r.findings[0].links?.[0].url).toBe("https://factcheck.example.org/lemon-water-cancer");
  });

  describe("with Claude", () => {
    let create: ReturnType<typeof vi.fn>;
    const searchResult = {
      type: "web_search_tool_result",
      tool_use_id: "s1",
      content: [{ type: "web_search_result", url: "https://who.example/cancer-myths", title: "Myths", page_age: null, encrypted_content: "" }],
    };
    const verdictCall = {
      type: "tool_use",
      id: "t1",
      name: "record_verdicts",
      input: {
        verdicts: [
          {
            claim_number: 1,
            verdict: "false",
            explanation: "No study shows this; health agencies call it a myth.",
            source_urls: ["https://who.example/cancer-myths", "https://made-up.example/study"],
          },
        ],
      },
    };

    beforeEach(() => {
      create = vi.fn();
      const client: ClaudeClient = {
        beta: {
          messages: {
            parse: vi.fn(async () => ({
              stop_reason: "end_turn",
              parsed_output: {
                language: "en",
                claims: [{ claim: "Lemon water cures 90% of cancer patients", quote: "cures cancer in 90% of patients", importance: "central", search_query: "lemon water cures cancer" }],
              },
            })) as never,
            create: create as never,
          },
        },
      };
      setClaudeClientForTests(client);
    });

    it("resumes after pause_turn, records verdicts and drops invented sources", async () => {
      create
        .mockResolvedValueOnce({ stop_reason: "pause_turn", content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }, searchResult] })
        .mockResolvedValueOnce({ stop_reason: "tool_use", content: [verdictCall] });

      const r = await factcheckAnalyzer.analyze(ARTICLE);
      expect(create).toHaveBeenCalledTimes(2);
      // The resumed request carries the paused assistant turn and no extra user message.
      const second = create.mock.calls[1][0];
      expect(second.messages.at(-1).role).toBe("assistant");
      expect(second.tools.find((t: { name: string }) => t.name === "record_verdicts").strict).toBe(true);
      expect(second.tool_choice).toEqual({ type: "auto" });

      expect(r.score).toBeLessThanOrEqual(30);
      expect(r.findings[0]).toMatchObject({ tag: "False", severity: "high", message: "Lemon water cures 90% of cancer patients" });
      expect(r.findings[0].links).toEqual([{ title: "who.example", url: "https://who.example/cancer-myths" }]);
      expect(r.summary).toMatch(/1 web search/);
    });

    it("nudges once when the model forgets to call the tool", async () => {
      create
        .mockResolvedValueOnce({ stop_reason: "end_turn", content: [searchResult, { type: "text", text: "Here are my findings…" }] })
        .mockResolvedValueOnce({ stop_reason: "tool_use", content: [verdictCall] });
      const r = await factcheckAnalyzer.analyze(ARTICLE);
      expect(create.mock.calls[1][0].messages.at(-1)).toMatchObject({ role: "user" });
      expect(r.findings).toHaveLength(1);
    });

    it("fails when the tool is never called", async () => {
      create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "no" }] });
      await expect(factcheckAnalyzer.analyze(ARTICLE)).rejects.toThrow(/record_verdicts/);
      expect(create).toHaveBeenCalledTimes(2);
    });
  });
});
