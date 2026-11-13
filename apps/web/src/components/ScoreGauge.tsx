import { BAND_LABELS, type Band } from "@veritas/shared";
import { bandColor } from "../lib/bands";

/** Semicircular gauge from 0 (left) to 100 (right). */
export function ScoreGauge({ score, band, pending }: { score: number | null; band: Band; pending?: boolean }) {
  const r = 80;
  const circumference = Math.PI * r;
  const value = score ?? 0;
  const color = bandColor[band];
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 200 115" className="w-56" role="img" aria-label={score === null ? "No score yet" : `Credibility score ${score} of 100`}>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--rule)" strokeWidth="14" strokeLinecap="round" />
        {score !== null && (
          <path
            d="M20 100 A80 80 0 0 1 180 100"
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
            style={{ transition: "stroke-dasharray 600ms ease" }}
          />
        )}
        <text x="100" y="92" textAnchor="middle" className="font-display" fontSize="40" fontWeight="800" fill="var(--ink)">
          {score ?? (pending ? "…" : "–")}
        </text>
      </svg>
      <figcaption className="font-display text-xl font-semibold -mt-1" style={{ color }}>
        {pending ? "Analyzing…" : BAND_LABELS[band]}
      </figcaption>
    </figure>
  );
}
