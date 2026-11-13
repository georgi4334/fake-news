import exifr from "exifr";
import { inflateSync } from "node:zlib";
import type { LoadedImage } from "./load.js";
import { AI_GENERATOR } from "./provenance.js";

const PHOTO_EDITORS = /photoshop|lightroom|gimp|affinity|capture one|pixelmator|snapseed|darktable|luminar|paint\.net|canva|picsart|facetune/i;

export interface ImageMetadata {
  camera?: string;
  software?: string;
  takenAt?: Date;
  /** Generator named in Software tags or PNG text (e.g. Stable Diffusion "parameters"). */
  aiGenerator?: string;
  /** Prompt-like text embedded by a generator. */
  generatorText?: string;
  editor?: string;
  /** True when no EXIF at all was found (typical after social-media or CDN re-encoding). */
  stripped: boolean;
}

/** Reads tEXt / iTXt / zTXt chunks from a PNG. */
export function readPngText(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  if (data.length < 8 || data.readUInt32BE(0) !== 0x89504e47) return out;
  let pos = 8;
  while (pos + 12 <= data.length) {
    const len = data.readUInt32BE(pos);
    const type = data.toString("latin1", pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + len);
    try {
      if (type === "tEXt") {
        const nul = body.indexOf(0);
        out[body.toString("latin1", 0, nul)] = body.toString("latin1", nul + 1);
      } else if (type === "zTXt") {
        const nul = body.indexOf(0);
        out[body.toString("latin1", 0, nul)] = inflateSync(body.subarray(nul + 2)).toString("latin1");
      } else if (type === "iTXt") {
        const nul = body.indexOf(0);
        const key = body.toString("latin1", 0, nul);
        const compressed = body[nul + 1] === 1;
        let rest = body.subarray(nul + 3);
        rest = rest.subarray(rest.indexOf(0) + 1); // language tag
        rest = rest.subarray(rest.indexOf(0) + 1); // translated keyword
        out[key] = (compressed ? inflateSync(rest) : rest).toString("utf8");
      }
    } catch {
      /* skip malformed chunk */
    }
    if (type === "IEND") break;
    pos += 12 + len;
  }
  return out;
}

const GENERATOR_KEYS = /^(parameters|prompt|workflow|negative_prompt|sd-metadata|invokeai_metadata|dream|generation_data)$/i;

export async function readMetadata(img: LoadedImage): Promise<ImageMetadata> {
  let exif: Record<string, unknown> | undefined;
  try {
    exif = await exifr.parse(img.data, { tiff: true, exif: true, ifd0: {}, xmp: false, iptc: false, icc: false, mergeOutput: true });
  } catch {
    exif = undefined;
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const software = str(exif?.Software) ?? str(exif?.CreatorTool) ?? str(exif?.ProcessingSoftware);
  const make = str(exif?.Make);
  const model = str(exif?.Model);
  const takenRaw = exif?.DateTimeOriginal ?? exif?.CreateDate;
  const takenAt = takenRaw instanceof Date && !Number.isNaN(takenRaw.getTime()) ? takenRaw : undefined;

  const result: ImageMetadata = {
    // Many cameras repeat the make in the model ("Canon" + "Canon EOS R5").
    camera: model && make && model.startsWith(make) ? model : [make, model].filter(Boolean).join(" ") || undefined,
    software,
    takenAt,
    stripped: !exif || Object.keys(exif).length === 0,
  };

  if (software && AI_GENERATOR.test(software)) result.aiGenerator = software;
  else if (software && PHOTO_EDITORS.test(software)) result.editor = software;

  if (img.format === "png") {
    const text = readPngText(img.data);
    const key = Object.keys(text).find((k) => GENERATOR_KEYS.test(k));
    if (key) {
      result.aiGenerator ??= /comfy|workflow/i.test(key + text[key].slice(0, 200)) ? "ComfyUI" : "Stable Diffusion-style generator";
      result.generatorText = text[key].slice(0, 300);
      result.stripped = false;
    }
    const sw = text.Software ?? text.software;
    if (sw && AI_GENERATOR.test(sw)) result.aiGenerator ??= sw;
  }
  return result;
}
