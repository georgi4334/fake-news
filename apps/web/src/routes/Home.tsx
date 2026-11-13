import { useMutation } from "@tanstack/react-query";
import type { AnalyzeJsonRequest } from "@veritas/shared";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { api, errorMessage } from "../lib/api";

type Tab = "url" | "text" | "image";

const input =
  "w-full bg-card border border-rule rounded-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent";

export function Home() {
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (body: AnalyzeJsonRequest) => api.analyze(body),
    onSuccess: ({ id }) => navigate(`/report/${id}`),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (tab === "url") mutation.mutate({ kind: "url", url: url.trim() });
    if (tab === "text")
      mutation.mutate({
        kind: "text",
        text,
        title: title || undefined,
        publisher: publisher || undefined,
        publishedAt: publishedAt || undefined,
      });
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
      <section>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">
          Is this story worth believing?
        </h1>
        <p className="mt-3 text-muted max-w-prose">
          Paste a link or the article text. Veritas examines how it is written, who published it, when, how it is presented,
          and explains every red flag it finds.
        </p>

        <div className="mt-8 flex gap-1 border-b border-rule" role="tablist">
          {(["url", "text", "image"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t === "url" ? "Article link" : t === "text" ? "Paste text" : "Image"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {tab === "url" && (
            <input className={input} type="url" required placeholder="https://news-site.example/story" value={url} onChange={(e) => setUrl(e.target.value)} />
          )}
          {tab === "text" && (
            <>
              <input className={input} placeholder="Headline (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea className={`${input} min-h-56 font-display text-[17px] leading-relaxed`} required minLength={200} placeholder="Paste the full article text (at least 200 characters)…" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="grid gap-4 sm:grid-cols-2">
                <input className={input} placeholder="Publisher (optional)" value={publisher} onChange={(e) => setPublisher(e.target.value)} />
                <input className={input} type="date" aria-label="Publication date (optional)" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
              </div>
            </>
          )}
          {tab === "image" && (
            <div className="border border-dashed border-rule rounded-sm p-10 text-center text-muted bg-card">
              Image forensics (AI-generation and editing detection) is coming in the next release.
            </div>
          )}

          {mutation.isError && <p className="text-bad text-sm" role="alert">{errorMessage(mutation.error)}</p>}

          {tab !== "image" && (
            <button type="submit" disabled={mutation.isPending} className="bg-ink text-paper px-6 py-2.5 rounded-sm font-medium hover:bg-accent disabled:opacity-60 transition-colors">
              {mutation.isPending ? "Submitting…" : "Check credibility"}
            </button>
          )}
        </form>
      </section>

      <aside className="border-t lg:border-t-0 lg:border-l border-rule pt-6 lg:pt-0 lg:pl-6">
        <h2 className="font-display text-lg font-semibold">What we look at</h2>
        <ul className="mt-3 space-y-3 text-sm text-muted">
          <li><b className="text-ink">Writing style</b>: sensationalism, emotional manipulation, unnamed sources.</li>
          <li><b className="text-ink">Publisher</b>: domain age, look-alike domains, transparency pages, bylines.</li>
          <li><b className="text-ink">Timing</b>: missing or conflicting dates, recycled old stories.</li>
          <li><b className="text-ink">Presentation</b>: clickbait headlines, links to primary sources, ad load.</li>
          <li><b className="text-ink">Fact check</b>: key claims checked against professional fact-checks and current reporting, with sources.</li>
          <li><b className="text-ink">Images</b>: coming soon.</li>
        </ul>
      </aside>
    </div>
  );
}
