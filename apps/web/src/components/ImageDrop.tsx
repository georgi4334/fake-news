import { useEffect, useId, useState, type DragEvent } from "react";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif,image/tiff,image/heic,image/heif";

/** File picker with drag-and-drop and a preview. Format is re-checked on the server from the bytes. */
export function ImageDrop({ file, onChange, maxBytes }: { file: File | null; onChange: (f: File | null) => void; maxBytes: number }) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function accept(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Please choose an image file.");
    if (f.size > maxBytes) return setError(`That image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    onChange(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files[0]);
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`block cursor-pointer rounded-sm border border-dashed bg-card p-6 text-center transition-colors ${dragging ? "border-accent bg-accent/5" : "border-rule hover:border-ink/40"}`}
      >
        {preview ? (
          <span className="flex flex-col items-center gap-3">
            <img src={preview} alt="Selected image preview" className="max-h-64 max-w-full rounded-sm object-contain" />
            <span className="text-sm text-muted break-all">
              {file?.name} · {((file?.size ?? 0) / 1024 / 1024).toFixed(1)} MB · <span className="underline">choose another</span>
            </span>
          </span>
        ) : (
          <span className="block py-6">
            <span className="block font-display text-lg">Drop an image here</span>
            <span className="block text-sm text-muted mt-1">or click to choose · JPEG, PNG, WebP, GIF, AVIF · up to {Math.round(maxBytes / 1024 / 1024)} MB</span>
          </span>
        )}
      </label>
      <input id={inputId} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => accept(e.target.files?.[0])} />
      {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
      <p className="mt-2 text-xs text-muted">We keep a small preview with the report and delete the original file after analysis.</p>
    </div>
  );
}
