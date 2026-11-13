import type { SignalId } from "@veritas/shared";
import type { Analyzer } from "./types.js";

/** Placeholder for analyzers scheduled in later build phases (fact-check: phase 4, images: phase 5). */
export function notYetAvailable(id: SignalId, what: string): Analyzer {
  return {
    id,
    async analyze() {
      return { score: null, confidence: 0, skipped: true, summary: `${what} is coming in a later release.`, findings: [] };
    },
  };
}
