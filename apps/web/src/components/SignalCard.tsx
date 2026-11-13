import { SIGNAL_LABELS, type SignalId, type SignalResult } from "@veritas/shared";
import { FindingList } from "./FindingList";
import { scoreColor } from "../lib/bands";

export function SignalCard({ id, signal }: { id: SignalId; signal?: SignalResult }) {
  const status = signal?.status ?? "running";

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

      <div className="mt-4">
        <FindingList findings={signal?.findings ?? []} />
      </div>
    </article>
  );
}
