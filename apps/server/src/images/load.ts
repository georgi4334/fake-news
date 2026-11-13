import { createHash } from "node:crypto";
import sharp from "sharp";

export const SUPPORTED_FORMATS = ["jpeg", "png", "webp", "gif", "avif", "tiff", "heif"] as const;
const MIME: Record<string, string> = {
  jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", tiff: "image/tiff", heif: "image/heif",
};

export class UnsupportedImageError extends Error {}

export interface LoadedImage {
  data: Buffer;
  format: string;
  mime: string;
  width: number;
  height: number;
  sha256: string;
  sourceUrl?: string;
}

/** Identifies the real format from the bytes (never trusts file names or MIME headers). */
export async function loadImage(data: Buffer, sourceUrl?: string): Promise<LoadedImage> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(data, { limitInputPixels: 100_000_000 }).metadata();
  } catch {
    throw new UnsupportedImageError("The file is not a readable image");
  }
  const format = meta.format ?? "";
  if (!(SUPPORTED_FORMATS as readonly string[]).includes(format) || !meta.width || !meta.height) {
    throw new UnsupportedImageError(`Unsupported image format${format ? ` (${format})` : ""}`);
  }
  // EXIF orientation 5–8 swaps width/height on display.
  const rotated = (meta.orientation ?? 1) >= 5;
  return {
    data,
    format,
    mime: MIME[format],
    width: rotated ? meta.height : meta.width,
    height: rotated ? meta.width : meta.height,
    sha256: createHash("sha256").update(data).digest("hex"),
    sourceUrl,
  };
}

/** JPEG resized to fit `maxSide`, auto-rotated, first frame only. */
export function resizedJpeg(img: LoadedImage, maxSide: number, quality = 82): Promise<Buffer> {
  return sharp(img.data, { limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality })
    .toBuffer();
}
