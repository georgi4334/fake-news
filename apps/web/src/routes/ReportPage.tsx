import { SIGNAL_IDS, type ArticleMeta, type InputKind, type Report, type SignalId, type SignalResult } from "@veritas/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ImageForensicsPanel } from "../components/ImageForensicsPanel";
import { ScoreGauge } from "../components/ScoreGauge";
import { SignalCard } from "../components/SignalCard";
import { api, errorMessage } from "../lib/api";

interface LiveState {
  report: Report | null;
  inputKind: InputKind | null;
  meta: ArticleMeta | null;
  signals: Partial<Record<SignalId, SignalResult>>;
  error: string | null;
}

/** Loads the report, then follows the SSE stream until the analysis finishes. */
function useLiveReport(id: string): LiveState {
  const [state, setState] = useState<LiveState>({ report: null, inputKind: null, meta: null, signals: {}, error: null });

  useEffect(() => {
    let close: (() => void) | undefined;
    let cancelled = false;
    setState({ report: null, inputKind: null, meta: null, signals: {}, error: null });

    api.report(id).then(
      (report) => {
        if (cancelled) return;
        if (report.status === "done" || report.status === "error") {
          return setState({ report, inputKind: report.inputKind, meta: report.meta, signals: Object.fromEntries(report.signals.map((s) => [s.id, s])), error: report.error ?? null });
        }
        setState((s) => ({ ...s, inputKind: report.inputKind, meta: report.meta }));
        close = api.stream(id, (e) => {
          setState((s) => {
            switch (e.type) {
              case "meta":
                return { ...s, meta: e.meta };
              case "signal":
                return { ...s, signals: { ...s.signals, [e.signal.id]: e.signal } };
              case "done":
                return { report: e.report, inputKind: e.report.inputKind, meta: e.report.meta, signals: Object.fromEntries(e.report.signals.map((x) => [x.id, x])), error: null };
              case "error":
                return { ...s, error: e.message };
            }
          });
        });
      },
      (err) => !cancelled && setState((s) => ({ ...s, error: errorMessage(err) })),
    );
    return () => {
      cancelled = true;
      close?.();
    };
  }, [id]);

  return state;
}

export function ReportPage() {
  const { id = "" } = useParams();
  const { report, meta, signals, error, inputKind } = useLiveReport(id);
  const pending = !report && !error;
  const isImage = inputKind === "image";
  const [copied, setCopied] = useState(false);

  if (error && !meta) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-3xl font-semibold">We couldn't analyze this</h1>
        <p className="mt-3 text-bad">{error}</p>
        <Link to="/" className="mt-6 inline-block underline">Try another article</Link>
      </div>
    );
  }

  return (
    <div>
      <section className="grid gap-8 md:grid-cols-[1fr_auto] items-start border-b border-rule pb-8">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted">
            {meta?.publisher ?? meta?.domain ?? (report?.inputKind === "text" ? "Pasted text" : report?.inputKind === "image" ? "Uploaded image" : "Article")}
            {meta?.publishedAt && ` · ${new Date(meta.publishedAt).toLocaleDateString()}`}
          </p>
          <h1 className="mt-2 font-display text-2xl sm:text-3xl font-semibold leading-snug break-words">
            {meta?.title ?? (pending ? "Reading the article…" : "Untitled")}
          </h1>
          {meta?.author && <p className="mt-2 text-sm text-muted">By {meta.author}</p>}
          {meta?.url && (
            <a href={meta.url} target="_blank" rel="noreferrer noopener" className="mt-2 block text-sm text-accent underline break-all">
              {meta.url}
            </a>
          )}

          {report?.topReasons.length ? (
            <div className="mt-6">
              <h2 className="font-display text-lg font-semibold">Why this score</h2>
              <ol className="mt-2 list-decimal list-inside space-y-1 text-sm">
                {report.topReasons.map((r) => <li key={r}>{r}</li>)}
              </ol>
            </div>
          ) : report?.status === "done" ? (
            <p className="mt-6 text-sm text-muted">No significant red flags were found in the signals we could check.</p>
          ) : null}
          {error && <p className="mt-4 text-bad text-sm">{error}</p>}
        </div>

        <div className="flex flex-col items-center gap-3 justify-self-center">
          <ScoreGauge score={report?.score ?? null} band={report?.band ?? "unknown"} pending={pending} />
          {report?.status === "done" && report.coverage < 0.35 && (
            <p className="max-w-56 text-center text-xs text-warn">
              Low confidence: only part of the evidence could be checked
              {report.inputKind === "text" && ". Submitting the article link enables publisher and timing checks"}
              {report.inputKind === "image" && ". Adding a caption, or a Google Vision key for reverse search, gives more to check"}.
            </p>
          )}
          {report && (
            <button
              className="text-xs text-muted underline hover:text-ink"
              onClick={() => navigator.clipboard.writeText(location.href).then(() => setCopied(true))}
            >
              {copied ? "Link copied" : "Copy shareable link"}
            </button>
          )}
        </div>
      </section>

      {!isImage && (
        <section className="mt-8 grid gap-5 md:grid-cols-2 items-start">
          {SIGNAL_IDS.map((sid) => <SignalCard key={sid} id={sid} signal={signals[sid]} />)}
        </section>
      )}
      {isImage && !report && <p className="mt-8 text-muted animate-pulse">Examining the image…</p>}
      {report && <ImageForensicsPanel reportId={report.id} images={report.images ?? []} />}
      {isImage && report?.status === "done" && !report.images?.length && signals.images?.summary && (
        <p className="mt-8 text-muted">{signals.images.summary}</p>
      )}
    </div>
  );
}
