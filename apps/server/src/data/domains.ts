/**
 * Seed reputation lists. Keep these small and well-sourced; extend from a maintained dataset
 * (e.g. a fact-checking network's list) rather than by hand. Domains are matched with subdomains.
 */
export const ESTABLISHED_OUTLETS = [
  "reuters.com", "apnews.com", "afp.com", "bbc.com", "bbc.co.uk", "npr.org", "pbs.org", "nytimes.com",
  "washingtonpost.com", "wsj.com", "ft.com", "economist.com", "theguardian.com", "bloomberg.com", "cnn.com",
  "nbcnews.com", "cbsnews.com", "abcnews.go.com", "aljazeera.com", "dw.com", "france24.com", "euronews.com",
  "politico.com", "politico.eu", "theatlantic.com", "lemonde.fr", "spiegel.de", "elpais.com", "nature.com",
  "science.org", "bta.bg", "bnr.bg", "bntnews.bg", "dnevnik.bg", "capital.bg", "mediapool.bg", "svobodnaevropa.bg",
];

/** Brand names that fake sites commonly imitate, used for look-alike detection. */
export const IMITATED_BRANDS: Record<string, string[]> = {
  reuters: ["reuters.com"],
  bbc: ["bbc.com", "bbc.co.uk"],
  cnn: ["cnn.com"],
  nytimes: ["nytimes.com"],
  foxnews: ["foxnews.com"],
  abcnews: ["abcnews.go.com", "abc.net.au"],
  nbcnews: ["nbcnews.com"],
  cbsnews: ["cbsnews.com"],
  washingtonpost: ["washingtonpost.com"],
  theguardian: ["theguardian.com"],
  bloomberg: ["bloomberg.com"],
  apnews: ["apnews.com"],
  aljazeera: ["aljazeera.com", "aljazeera.net"],
  euronews: ["euronews.com"],
  spiegel: ["spiegel.de"],
  lemonde: ["lemonde.fr"],
};

export const SATIRE_SITES = [
  "theonion.com", "babylonbee.com", "clickhole.com", "newsthump.com", "thebeaverton.com", "waterfordwhispersnews.com",
  "thedailymash.co.uk", "duffelblog.com", "legorafi.fr", "der-postillon.com", "theshovel.com.au",
];

export const FACT_CHECKERS = [
  "snopes.com", "politifact.com", "factcheck.org", "fullfact.org", "factcheck.afp.com", "leadstories.com",
  "checkyourfact.com", "factcheckbulgaria.bg", "euvsdisinfo.eu", "reuters.com/fact-check",
];

/** Free hosting / blog platforms: content there is not vetted by an editorial team. */
export const USER_GENERATED_HOSTS = ["blogspot.com", "wordpress.com", "medium.com", "substack.com", "wixsite.com", "weebly.com", "tumblr.com", "sites.google.com"];

export const matchesDomain = (domain: string, list: string[]) =>
  list.some((d) => domain === d || domain.endsWith("." + d));
