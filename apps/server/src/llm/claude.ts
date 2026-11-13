import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { config } from "../config.js";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
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
  if (!config.llmEnabled) throw new LlmUnavailableError("Claude is not configured (ANTHROPIC_API_KEY missing)");

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
