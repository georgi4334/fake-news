import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { config } from "../config.js";

/** The subset of the SDK client used here; tests substitute a stub. */
export interface ClaudeClient {
  beta: { messages: Pick<Anthropic["beta"]["messages"], "create" | "parse"> };
}

let client: ClaudeClient | null = null;
function getClient(): ClaudeClient {
  client ??= new Anthropic();
  return client;
}
export function setClaudeClientForTests(c: ClaudeClient | null): void {
  client = c;
}

export class LlmUnavailableError extends Error {}

/**
 * One structured-output call to Claude. The response is validated against `schema`.
 * Server-side fallbacks are enabled so a safety-classifier refusal is retried on
 * an appropriate fallback model instead of failing the analysis.
 */
export async function askStructured<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  assertLlmEnabled();

  const response = await getClient().beta.messages.parse({
    model: config.anthropicModel,
    max_tokens: opts.maxTokens ?? 16_000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to analyze this content");
  if (response.stop_reason === "max_tokens") throw new Error("Claude response was truncated");
  if (response.parsed_output == null) throw new Error("Claude returned output that did not match the schema");
  return response.parsed_output as z.infer<S>;
}

function assertLlmEnabled(): void {
  if (!config.llmEnabled && !client) throw new LlmUnavailableError("Claude is not configured (ANTHROPIC_API_KEY missing)");
}

/** JSON Schema for a strict custom tool, derived from a Zod object schema. */
export function toolInputSchema(schema: z.ZodType): { type: "object"; [k: string]: unknown } {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  return json as { type: "object"; [k: string]: unknown };
}

export interface SearchResult<T> {
  output: T;
  /** Every URL returned by web search during the call; use it to reject invented sources. */
  searchedUrls: Set<string>;
  searches: number;
}

const MAX_CONTINUATIONS = 4;

/**
 * Lets Claude research with server-side web search, then report its findings by calling a strict
 * custom tool. Structured outputs can't be combined with the citations web search produces, so the
 * tool call is the structured channel. Forced tool choice isn't available on this model, so the
 * prompt asks for the call and we nudge once if it is missing.
 */
export async function researchWithWebSearch<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  tool: { name: string; description: string; schema: S };
  maxSearches: number;
  effort?: "low" | "medium" | "high";
}): Promise<SearchResult<z.infer<S>>> {
  assertLlmEnabled();
  const tools: BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: opts.maxSearches },
    {
      name: opts.tool.name,
      description: opts.tool.description,
      strict: true,
      input_schema: toolInputSchema(opts.tool.schema),
    },
  ];
  const messages: BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  const searchedUrls = new Set<string>();
  let searches = 0;
  let nudged = false;

  for (let turn = 0; turn <= MAX_CONTINUATIONS + 1; turn++) {
    const response = (await getClient().beta.messages.create({
      model: config.anthropicModel,
      max_tokens: 32_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "medium" },
      tool_choice: { type: "auto" },
      system: opts.system,
      tools,
      messages,
    })) as BetaMessage;

    if (response.stop_reason === "refusal") throw new Error("Claude declined to fact-check this content");
    collectSearchUrls(response.content, searchedUrls);
    searches += response.content.filter((b) => b.type === "server_tool_use" && b.name === "web_search").length;

    const call = response.content.find((b) => b.type === "tool_use" && b.name === opts.tool.name);
    if (call && call.type === "tool_use") {
      const parsed = opts.tool.schema.safeParse(call.input);
      if (!parsed.success) throw new Error(`Claude returned malformed ${opts.tool.name} input`);
      return { output: parsed.data, searchedUrls, searches };
    }

    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "pause_turn") continue; // server-side search loop paused: resume as-is
    if (response.stop_reason === "max_tokens") throw new Error("Claude response was truncated");
    if (nudged) break;
    nudged = true;
    messages.push({ role: "user", content: `Now call the ${opts.tool.name} tool with your results.` });
  }
  throw new Error(`Claude did not report results via ${opts.tool.name}`);
}

function collectSearchUrls(content: BetaContentBlock[], into: Set<string>): void {
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) into.add(normalizeUrl(r.url));
    }
  }
}

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}
