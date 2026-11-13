import { factcheckAnalyzer } from "./factcheck.js";
import { imagesAnalyzer } from "./images.js";
import { linguisticAnalyzer } from "./linguistic.js";
import { presentationAnalyzer } from "./presentation.js";
import { publisherAnalyzer } from "./publisher.js";
import { timingAnalyzer } from "./timing.js";
import type { Analyzer } from "./types.js";

export const ANALYZERS: Analyzer[] = [
  linguisticAnalyzer,
  publisherAnalyzer,
  timingAnalyzer,
  presentationAnalyzer,
  factcheckAnalyzer,
  imagesAnalyzer,
];
