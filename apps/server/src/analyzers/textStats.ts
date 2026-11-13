/** Cheap, language-light text metrics used by the heuristic analyzers. */

const SENSATIONAL = [
  "shocking", "you won't believe", "won't believe", "mind-blowing", "unbelievable", "bombshell", "exposed",
  "they don't want you to know", "the truth about", "what happened next", "miracle", "secret", "banned",
  "destroyed", "slams", "epic", "outrage", "horrifying", "terrifying", "cover-up", "cover up", "wake up",
  "mainstream media", "share before", "before it's deleted", "must see", "must-see", "breaking",
];
const ABSOLUTIST = ["always", "never", "everyone", "nobody", "all of them", "completely", "totally", "absolutely", "100%", "undeniable", "proven fact"];
const VAGUE_ATTRIBUTION = [
  "experts say", "experts agree", "scientists say", "sources say", "sources claim", "many people are saying",
  "people are saying", "studies show", "research shows", "it is said", "reportedly", "rumor has it", "insiders",
  "some say", "according to reports",
];
const NAMED_ATTRIBUTION = /\b(according to|said|told|stated|wrote|reported by|in a statement|spokes(?:person|man|woman))\b/gi;

function countPhrases(lower: string, phrases: string[]): { total: number; hits: string[] } {
  const hits: string[] = [];
  let total = 0;
  for (const p of phrases) {
    const re = new RegExp(`(?<![\\w])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "g");
    const n = (lower.match(re) ?? []).length;
    if (n) {
      total += n;
      hits.push(p);
    }
  }
  return { total, hits };
}

export interface TextStats {
  words: number;
  sentences: number;
  avgSentenceLength: number;
  exclamations: number;
  allCapsWords: string[];
  sensational: { total: number; hits: string[] };
  absolutist: { total: number; hits: string[] };
  vagueAttribution: { total: number; hits: string[] };
  namedAttributions: number;
  quotes: number;
  numbers: number;
  secondPerson: number;
}

export function textStats(text: string): TextStats {
  const lower = text.toLowerCase();
  const wordList = text.split(/\s+/).filter(Boolean);
  const words = wordList.length || 1;
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const allCapsWords = wordList.filter((w) => /^[A-ZА-Я]{4,}[!?.,:]*$/.test(w) && !/^(NASA|COVID|NATO|FBI|CIA|USA|UNESCO|UNICEF|HTTP|HTTPS)\W*$/.test(w));
  return {
    words,
    sentences,
    avgSentenceLength: words / sentences,
    exclamations: (text.match(/!/g) ?? []).length,
    allCapsWords,
    sensational: countPhrases(lower, SENSATIONAL),
    absolutist: countPhrases(lower, ABSOLUTIST),
    vagueAttribution: countPhrases(lower, VAGUE_ATTRIBUTION),
    namedAttributions: (text.match(NAMED_ATTRIBUTION) ?? []).length,
    quotes: (text.match(/[“"«„][^”"»“]{15,}[”"»“]/g) ?? []).length,
    numbers: (text.match(/\b\d[\d,.]*%?/g) ?? []).length,
    secondPerson: (lower.match(/\byou(r|'re|rself)?\b/g) ?? []).length,
  };
}

/** Clickbait features of a headline. Returns reasons; empty = no issues. */
export function headlineIssues(headline: string): string[] {
  const issues: string[] = [];
  const words = headline.split(/\s+/).filter(Boolean);
  const caps = words.filter((w) => /^[A-ZА-Я]{3,}\W*$/.test(w));
  if (caps.length >= 2 && caps.length / words.length > 0.25) issues.push("uses ALL-CAPS words");
  if (/!/.test(headline)) issues.push("contains exclamation marks");
  const sens = countPhrases(headline.toLowerCase(), SENSATIONAL);
  if (sens.total) issues.push(`sensational wording (${sens.hits.join(", ")})`);
  if (/\b(this|these|here's|what|why) .*(will|you|happened)\b/i.test(headline) && /\?|\.\.\.|…/.test(headline)) {
    issues.push("curiosity-gap teaser");
  }
  if (/^\d+\s+(reasons|things|ways|facts|signs)\b/i.test(headline)) issues.push("listicle format");
  return issues;
}
