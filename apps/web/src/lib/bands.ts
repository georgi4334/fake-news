import type { Band } from "@veritas/shared";

export const bandColor: Record<Band, string> = {
  likely_reliable: "var(--good)",
  mixed: "var(--mixed)",
  questionable: "var(--warn)",
  likely_false: "var(--bad)",
  unknown: "var(--muted)",
};

export function scoreColor(score: number | null): string {
  if (score === null) return "var(--muted)";
  if (score >= 75) return "var(--good)";
  if (score >= 55) return "var(--mixed)";
  if (score >= 35) return "var(--warn)";
  return "var(--bad)";
}
