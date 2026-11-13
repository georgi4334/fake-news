import type { Finding, Severity } from "@veritas/shared";

const severityStyle: Record<Severity, { label: string; color: string }> = {
  high: { label: "Red flag", color: "var(--bad)" },
  medium: { label: "Concern", color: "var(--warn)" },
  low: { label: "Minor", color: "var(--mixed)" },
  info: { label: "Note", color: "var(--good)" },
};
const order: Severity[] = ["high", "medium", "low", "info"];

export function FindingList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  const sorted = [...findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return (
    <ul className="space-y-3">
      {sorted.map((f, i) => (
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
  );
}
