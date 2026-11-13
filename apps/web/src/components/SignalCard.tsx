import { SIGNAL_LABELS, type Severity, type SignalId, type SignalResult } from "@veritas/shared";
import { scoreColor } from "../lib/bands";

const severityStyle: Record<Severity, { label: string; color: string }> = {
  high: { label: "Red flag", color: "var(--bad)" },
  medium: { label: "Concern", color: "var(--warn)" },
  low: { label: "Minor", color: "var(--mixed)" },
  info: { label: "Note", color: "var(--good)" },
};
const order: Severity[] = ["high", "medium", "low", "info"];

export function SignalCard({ id, signal }: { id: SignalId; signal?: SignalResult }) {
  const status = signal?.status ?? "running";
  const findings = [...(signal?.findings ?? [])].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  return (
    <article className="bg-card border border-rule rounded-sm p-5">
      <header className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-lg font-semibold">{SIGNAL_LABELS[id]}</h3>
        {status === "done" && signal?.score !== null && (
          <span className="font-display text-2xl font-extrabold tabular-nums" style={{ color: scoreColor(signal!.score) }}>
            {signal!.score}
          </span>
        )}
        {status === "running" && <span className="text-xs text-muted animate-pulse">Checking…</span>}
        {status === "skipped" && <span className="text-xs text-muted uppercase tracking-wider">Not checked</span>}
        {status === "error" && <span className="text-xs text-bad uppercase tracking-wider">Failed</span>}
      </header>

      {status === "done" && signal?.score !== null && (
        <div className="mt-2 h-1.5 bg-rule rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${signal!.score}%`, background: scoreColor(signal!.score) }} />
        </div>
      )}

      {signal?.summary && <p className="mt-3 text-sm text-muted">{signal.summary}</p>}
      {signal?.error && <p className="mt-3 text-sm text-bad">{signal.error}</p>}
      {status === "done" && (
        <p className="mt-1 text-xs text-muted">Confidence: {Math.round((signal?.confidence ?? 0) * 100)}%</p>
      )}

      {findings.length > 0 && (
        <ul className="mt-4 space-y-3">
          {findings.map((f, i) => (
            <li key={i} className="text-sm flex gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: severityStyle[f.severity].color }} title={severityStyle[f.severity].label} />
              <div className="min-w-0">
                <span className="sr-only">{severityStyle[f.severity].label}: </span>
                {f.tag && (
                  <span
                    className="mr-2 inline-block rounded-sm px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider align-[1px]"
                    style={{ color: severityStyle[f.severity].color, border: `1px solid ${severityStyle[f.severity].color}` }}
                  >
                    {f.tag}
                  </span>
                )}
                {f.message}
                {f.evidence && (
                  <blockquote className="mt-1 border-l-2 border-rule pl-3 font-mono text-xs text-muted whitespace-pre-wrap break-words">
                    {f.evidence}
                  </blockquote>
                )}
                {f.links && f.links.length > 0 && (
                  <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {f.links.map((l) => (
                      <li key={l.url} className="min-w-0">
                        <a href={l.url} target="_blank" rel="noreferrer noopener" className="text-accent underline break-all">
                          {l.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
