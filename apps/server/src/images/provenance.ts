import type { LoadedImage } from "./load.js";

/** IPTC digital source types that declare AI generation. */
const AI_SOURCE_TYPES: Record<string, string> = {
  trainedalgorithmicmedia: "created by generative AI",
  compositewithtrainedalgorithmicmedia: "edited or composited with generative AI",
  algorithmicmedia: "created algorithmically (not a photograph)",
  compositesynthetic: "composited with synthetic elements",
};

export const AI_GENERATOR = /dall[·\-\s]?e|openai|chatgpt|midjourney|firefly|stable.?diffusion|sdxl|imagen|gemini|nano.?banana|flux|ideogram|leonardo\.ai|comfyui|automatic1111|invokeai|novelai|bing image creator|copilot designer|grok|aurora|runway|kling|sora/i;

export interface Provenance {
  /** A C2PA manifest is embedded. */
  hasManifest: boolean;
  /** The manifest was parsed and its signature validated. */
  signed: boolean;
  validationState?: string;
  generator?: string;
  /** IPTC digital source type, normalised (lowercase, no URL prefix). */
  sourceType?: string;
  aiDeclaration?: string;
  actions: string[];
}

/** Text scan of XMP/JUMBF bytes: works even when the C2PA library is unavailable. */
export function scanProvenanceBytes(data: Buffer): Omit<Provenance, "signed" | "validationState"> {
  // Metadata lives near the start of the file for every common format; cap the scan for speed.
  const text = data.subarray(0, 4 * 1024 * 1024).toString("latin1");
  const sourceMatch = text.match(/digitalsourcetype[\s\S]{0,200}?newscodes\/digitalsourcetype\/([a-z]+)/i);
  const sourceType = sourceMatch?.[1]?.toLowerCase();
  const hasManifest = /jumb[\s\S]{0,64}c2pa/.test(text) || text.includes("c2pa.claim");
  const genMatch = text.match(/claim_generator[\s\S]{0,8}?([\x20-\x7e]{3,80})/);
  return {
    hasManifest,
    sourceType,
    aiDeclaration: sourceType ? AI_SOURCE_TYPES[sourceType] : undefined,
    generator: genMatch?.[1]?.replace(/[^\w .\-/·()]+/g, "").trim() || undefined,
    actions: [...new Set([...text.matchAll(/c2pa\.(created|edited|cropped|color_adjustments|placed|removed|converted|drawing|filtered|resized)/g)].map((m) => m[1]))],
  };
}

/** Validates the embedded C2PA manifest when the native library is available. */
async function readSignedManifest(img: LoadedImage): Promise<{ json: string; validationState?: string } | null> {
  try {
    const { Reader } = await import("@contentauth/c2pa-node");
    const reader = await Reader.fromAsset({ buffer: img.data, mimeType: img.mime });
    if (!reader) return null;
    const store = reader.json() as unknown as { validation_state?: string; validation_status?: { code: string }[] };
    const json = JSON.stringify(store);
    const failed = store.validation_status?.some((s) => /mismatch|invalid|untrusted|revoked/i.test(s.code));
    return { json, validationState: store.validation_state ?? (failed ? "Invalid" : undefined) };
  } catch {
    return null;
  }
}

export async function checkProvenance(img: LoadedImage): Promise<Provenance> {
  const scan = scanProvenanceBytes(img.data);
  const signed = scan.hasManifest ? await readSignedManifest(img) : null;
  if (!signed) return { ...scan, signed: false };

  const fromManifest = scanProvenanceBytes(Buffer.from(signed.json, "latin1"));
  const generator = signed.json.match(/"claim_generator(?:_info)?"\s*:\s*(?:\[\s*\{\s*"name"\s*:\s*)?"([^"]+)"/)?.[1] ?? scan.generator;
  const sourceType = fromManifest.sourceType ?? scan.sourceType;
  return {
    hasManifest: true,
    signed: !/invalid/i.test(signed.validationState ?? ""),
    validationState: signed.validationState,
    generator,
    sourceType,
    aiDeclaration: sourceType ? AI_SOURCE_TYPES[sourceType] : undefined,
    actions: [...new Set([...scan.actions, ...fromManifest.actions])],
  };
}
