# Veritas: news credibility checker

Veritas estimates how trustworthy a news article is by combining independent signals and explaining every red flag it finds.
It produces a 0–100 score, a band (*Likely reliable → Likely false*), and per-signal evidence. It never gives a bare "fake/real" verdict.

| Signal | Weight | Status | What it checks |
|---|---|---|---|
| Writing style | 20% | ✅ | Sensational/emotional language, ALL CAPS, unnamed sources, absolutist claims, satire markers. Heuristics + a Claude review that must quote evidence |
| Publisher | 20% | ✅ | Domain age (RDAP), look-alike domains (`cnn-news.co`), satire sites, self-publishing hosts, About/Contact/Corrections pages, author byline |
| Timing | 10% | ✅ | Missing/future/conflicting dates, old stories re-shared, dates contradicting the Wayback Machine |
| Presentation | 10% | ✅ | Clickbait headlines, headline not supported by body (Claude), links to primary sources, ad-network load, redirects |
| Fact check | 30% | ✅ | Claude extracts key claims → Google Fact Check Tools API → Claude researches each with web search and records verdicts + sources |
| Images | 10% | ✅ | C2PA Content Credentials / IPTC AI declarations, generator metadata (Stable Diffusion, Midjourney…), camera data and old photos, optional reverse search (Google Vision), Claude visual review incl. caption mismatch, error-level heatmap |

## Stack
- **Web** (`apps/web`): React 19, Vite, TypeScript, React Router, axios, TanStack Query, Tailwind CSS 4
- **API** (`apps/server`): Node 22, Express 5, TypeScript, Prisma/PostgreSQL, BullMQ/Redis, Server-Sent Events, Anthropic SDK (Claude Opus 5.5, structured outputs)
- **Shared** (`packages/shared`): Zod schemas and types used by both sides

## Run it

```bash
npm install
```

Minimal mode (in-memory store, in-process jobs, heuristics only):

```bash
npm run dev
```

Full mode: copy `.env.example` to `.env`, fill in `ANTHROPIC_API_KEY`, then:

```bash
docker compose up -d
```

```bash
npm run db:migrate
```

```bash
npm run dev
```

```bash
npm run worker
```

Open http://localhost:5173. Tests: `npm test`. Typecheck: `npm run typecheck`.

## API
- `POST /api/analyze`: `{ "kind": "url", "url": "…" }` or `{ "kind": "text", "text": "…", "title?", "publisher?", "publishedAt?" }` → `202 { id }`
- `GET /api/analyses/:id`: the report
- `GET /api/analyses/:id/events`: SSE stream of `meta`, `signal`, `done`, `error` events
- `POST /api/analyze/image`: multipart, field `image` (≤ 10 MB) and optional `caption` → `202 { id }`
- `GET /api/analyses/:id/images/:index/{thumb|ela}`: image thumbnail / error-level heatmap
- `GET /api/analyses`: recent analyses

## Fact checking
Needs `ANTHROPIC_API_KEY` (and optionally a free `GOOGLE_FACTCHECK_API_KEY` from the Google Cloud console, "Fact Check Tools API").
1. Claude picks up to `FACTCHECK_MAX_CLAIMS` (6) check-worthy claims.
2. Each claim is looked up in published fact-checks (cached 24h).
3. One Claude call with server-side web search (up to `FACTCHECK_MAX_SEARCHES`, 8) returns a verdict per claim through a strict tool.
   Source links are kept only if they appeared in the search results or the published fact-checks.

With only the Google key, the headline is matched against published fact-checks (low confidence). With neither key, the signal is skipped.
Cost per article is dominated by web searches (billed per search) plus tokens, so the two limits above bound it.

## Image forensics
Runs on up to 4 article images (URL input) or on an uploaded image. Per image:
1. **Provenance**: C2PA Content Credentials (signature validated with `@contentauth/c2pa-node`) and IPTC `DigitalSourceType`
   tags such as `trainedAlgorithmicMedia`. A declared AI origin caps the image at 10.
2. **Metadata**: generator fingerprints (PNG `parameters` chunks, Software tags), camera make/model, photos taken more than
   a year before the article. Photo editors like Photoshop are reported but not penalized.
3. **Reverse search** (with `GOOGLE_VISION_API_KEY`): other pages showing the image; appearing on a fact-check site caps it at 20.
4. **Claude visual review** (with `ANTHROPIC_API_KEY`): generation artifacts, editing signs, caption mismatch. Weak evidence.
5. **Error-level heatmap** for JPEGs, shown for manual inspection only. Automatic thresholds couldn't tell synthetic splices
   from untouched images reliably, so it doesn't affect the score.

Uploaded originals are deleted after analysis; only an 800px thumbnail and the heatmap are kept with the report.

## How scoring works
Each analyzer returns `score` (0–100), `confidence` (0–1) and findings. The overall score is the mean weighted by
`weight × confidence`; signals that couldn't run are excluded (they lower `coverage`, not the score). Below 5% coverage no score is
given. A confident, severe signal (e.g. a known satire domain) caps the score at 30. See `apps/server/src/scoring/score.ts`.

## Security
URL fetching blocks private/reserved IPs on every redirect hop, caps size (5 MB) and time (15 s). Rate limit: 10 analyses/min per IP.
Article text sent to Claude is treated as untrusted input.

## Roadmap
6. Eval script against labelled datasets (LIAR, FakeNewsNet) to tune weights,
browser extension (Chrome MV3), social-post screenshots (OCR), cross-outlet coverage check, multilingual lexicons (incl. Bulgarian).
