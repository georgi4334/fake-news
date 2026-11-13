import { useQuery } from "@tanstack/react-query";
import { BAND_LABELS } from "@veritas/shared";
import { Link } from "react-router";
import { api, errorMessage } from "../lib/api";
import { bandColor } from "../lib/bands";

export function History() {
  const { data, isLoading, error } = useQuery({ queryKey: ["history"], queryFn: api.history });
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Recent checks</h1>
      {isLoading && <p className="mt-6 text-muted">Loading…</p>}
      {error && <p className="mt-6 text-bad">{errorMessage(error)}</p>}
      {data?.length === 0 && <p className="mt-6 text-muted">Nothing checked yet. <Link to="/" className="underline">Check an article</Link>.</p>}
      <ul className="mt-6 divide-y divide-rule border-y border-rule">
        {data?.map((h) => (
          <li key={h.id}>
            <Link to={`/report/${h.id}`} className="flex items-center gap-4 py-4 hover:bg-card px-2 -mx-2">
              <span className="w-12 text-right font-display text-2xl font-extrabold tabular-nums" style={{ color: bandColor[h.band] }}>
                {h.score ?? "–"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-semibold truncate">{h.title ?? (h.inputKind === "text" ? "Pasted text" : "Untitled")}</span>
                <span className="block text-xs text-muted">
                  {h.domain ?? h.inputKind} · {new Date(h.createdAt).toLocaleString()} · {h.status === "done" ? BAND_LABELS[h.band] : h.status}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
