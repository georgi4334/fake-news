import type { ImageCheck } from "@veritas/shared";
import { useState } from "react";
import { http } from "../lib/api";
import { scoreColor } from "../lib/bands";
import { FindingList } from "./FindingList";

function ImageCard({ reportId, image, label }: { reportId: string; image: ImageCheck; label: string }) {
  const [view, setView] = useState<"thumb" | "ela">("thumb");
  const src = `${http.defaults.baseURL}/analyses/${reportId}/images/${image.index}/${view}`;
  return (
    <article className="bg-card border border-rule rounded-sm overflow-hidden grid md:grid-cols-[minmax(0,320px)_1fr]">
      <div className="bg-ink/5 flex flex-col">
        {image.hasThumbnail ? (
          <img src={src} alt={view === "ela" ? `Error-level heatmap of ${label}` : label} className="w-full h-auto max-h-96 object-contain" loading="lazy" />
        ) : (
          <div className="p-8 text-center text-sm text-muted">Preview unavailable</div>
        )}
        {image.hasHeatmap && (
          <div className="flex text-xs border-t border-rule" role="group" aria-label="Image view">
            {(["thumb", "ela"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`flex-1 py-2 ${view === v ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
              >
                {v === "thumb" ? "Image" : "Error-level heatmap"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="p-5 min-w-0">
        <header className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-lg font-semibold">{label}</h3>
          <span className="font-display text-2xl font-extrabold tabular-nums" style={{ color: scoreColor(image.score) }}>
            {image.score}
          </span>
        </header>
        <p className="text-xs text-muted">
          {image.format.toUpperCase()} · {image.width}×{image.height} · confidence {Math.round(image.confidence * 100)}%
        </p>
        {image.sourceUrl && (
          <a href={image.sourceUrl} target="_blank" rel="noreferrer noopener" className="block mt-1 text-xs text-accent underline break-all">
            {image.sourceUrl}
          </a>
        )}
        {view === "ela" && (
          <p className="mt-3 text-xs text-muted">
            Bright areas recompress differently. Edges, text and fine texture are always bright; a sharply bounded bright patch that doesn't
            follow the picture's content is worth a closer look.
          </p>
        )}
        <div className="mt-4">
          <FindingList findings={image.findings} />
        </div>
      </div>
    </article>
  );
}

export function ImageForensicsPanel({ reportId, images }: { reportId: string; images: ImageCheck[] }) {
  if (!images.length) return null;
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-semibold">Image forensics</h2>
      <p className="mt-1 text-sm text-muted max-w-prose">
        Checks for AI-generation declarations, generator metadata, signs of editing and reuse. Image analysis is probabilistic: treat
        anything short of a declared AI origin as a reason to look closer, not as proof.
      </p>
      <div className="mt-5 space-y-5">
        {images.map((img) => (
          <ImageCard key={img.index} reportId={reportId} image={img} label={images.length > 1 ? `Image ${img.index + 1}` : "Image"} />
        ))}
      </div>
    </section>
  );
}
