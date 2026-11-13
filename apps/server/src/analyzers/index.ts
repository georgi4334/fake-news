import { linguisticAnalyzer } from "./linguistic.js";
import { notYetAvailable } from "./pending.js";
import { presentationAnalyzer } from "./presentation.js";
import { publisherAnalyzer } from "./publisher.js";
import { timingAnalyzer } from "./timing.js";
import type { Analyzer } from "./types.js";

export const ANALYZERS: Analyzer[] = [
  linguisticAnalyzer,
  publisherAnalyzer,
  timingAnalyzer,
  presentationAnalyzer,
  notYetAvailable("factcheck", "Claim-by-claim fact checking"),
  notYetAvailable("images", "Image forensics (AI-generation and editing detection)"),
];
