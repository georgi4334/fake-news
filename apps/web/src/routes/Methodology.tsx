export function Methodology() {
  return (
    <article className="max-w-prose">
      <h1 className="font-display text-3xl font-semibold">How Veritas scores an article</h1>
      <p className="mt-4">
        No single tell reliably identifies false news, so Veritas combines independent signals. Each produces a score from 0 to 100,
        a confidence, and the evidence behind it. The overall score is a confidence-weighted average; signals that could not be checked
        are left out rather than counted against the article.
      </p>
      <h2 className="mt-8 font-display text-xl font-semibold">Signals and weights</h2>
      <ul className="mt-3 list-disc pl-5 space-y-2">
        <li><b>Fact check (30%)</b>: an AI model picks the article's key factual claims, looks them up in published professional fact-checks (Google Fact Check Tools), then researches each one on the web and gives a verdict: supported, mostly supported, misleading, disputed, false or unverified. Only sources that actually appeared in its searches are shown. A false central claim caps this signal at 30.</li>
        <li><b>Writing style (20%)</b>: sensational or emotional language, unnamed sources, one-sidedness, satire markers. Combines text statistics with an AI review that must quote its evidence.</li>
        <li><b>Publisher (20%)</b>: domain age, look-alike domains imitating real outlets, satire sites, transparency pages, author bylines.</li>
        <li><b>Images (10%)</b>: signed Content Credentials (C2PA) and IPTC tags that declare AI generation; metadata written by image generators (e.g. Stable Diffusion, Midjourney); camera data and photos taken long before the article; optional reverse image search for earlier copies and fact-checks; and an AI visual review for generation artifacts, editing and caption mismatch. An error-level heatmap is shown for your own inspection but is not scored, because it can't reliably tell edits from ordinary edges and re-compression. Declared AI origin caps an image at 10; visual impressions count as weak evidence.</li>
        <li><b>Timing (10%)</b>: missing or conflicting dates, old stories re-shared as new, dates that contradict the web archive.</li>
        <li><b>Presentation (10%)</b>: clickbait headlines, headlines the body doesn't support, links to primary sources, ad load.</li>
      </ul>
      <h2 className="mt-8 font-display text-xl font-semibold">Bands</h2>
      <p className="mt-3">75+ likely reliable · 55–74 mixed · 35–54 questionable · below 35 likely false or misleading. A confident, severe signal (such as a known satire site) caps the score at 30.</p>
      <h2 className="mt-8 font-display text-xl font-semibold">Limits</h2>
      <p className="mt-3">
        A well-written article from an established outlet can still be wrong, and a small independent site can be right. Use the score as a
        prompt to look closer, and read the evidence.
      </p>
    </article>
  );
}
