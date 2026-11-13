import sharp from "sharp";
import type { LoadedImage } from "./load.js";

export interface ElaResult {
  heatmap: Buffer;
}

const MAX_PIXELS = 16_000_000;

/**
 * Error Level Analysis heatmap: re-save at a known JPEG quality and amplify the difference.
 * Regions pasted from another image or retouched after the last save can recompress differently
 * and glow. Edges, text, texture and repeated re-encoding glow too, so the heatmap is shown to
 * people for inspection and does not change the score: in testing, automatic thresholds could
 * not separate synthetic splices from untouched images reliably.
 */
export async function errorLevelAnalysis(img: LoadedImage): Promise<ElaResult | null> {
  if (img.format !== "jpeg" || img.width * img.height > MAX_PIXELS) return null;

  const original = await sharp(img.data).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = original.info;
  const resaved = await sharp(original.data, { raw: { width, height, channels } }).jpeg({ quality: 90 }).toBuffer();
  const again = await sharp(resaved).raw().toBuffer();

  const diff = Buffer.alloc(original.data.length);
  for (let i = 0; i < diff.length; i++) diff[i] = Math.min(255, Math.abs(original.data[i] - again[i]) * 20);

  const heatmap = await sharp(diff, { raw: { width, height, channels } })
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { heatmap };
}
