import { crc32 } from "node:zlib";
import sharp from "sharp";

const noise = (w: number, h: number, mean = 120) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#000", noise: { type: "gaussian", mean, sigma: 30 } } }).blur(1.2);

/** A "photo": textured JPEG re-saved a few times, like an image that has travelled the web. */
export async function plainJpeg(w = 640, h = 480): Promise<Buffer> {
  let img = await noise(w, h).jpeg({ quality: 90 }).toBuffer();
  for (let i = 0; i < 3; i++) img = await sharp(img).jpeg({ quality: 90 }).toBuffer();
  return img;
}

/** plainJpeg with a freshly pasted region (different compression history). */
export async function splicedJpeg(): Promise<Buffer> {
  const patch = await noise(160, 160, 140).png().toBuffer();
  return sharp(await plainJpeg()).composite([{ input: patch, left: 400, top: 250 }]).jpeg({ quality: 90 }).toBuffer();
}

const XMP_AI = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></rdf:RDF></x:xmpmeta>`;

export function aiDeclaredJpeg(): Promise<Buffer> {
  return noise(400, 300).withXmp(XMP_AI).jpeg().toBuffer();
}

export function exifJpeg(ifd0: Record<string, string>, takenAt?: string): Promise<Buffer> {
  const exif: Record<string, Record<string, string>> = { IFD0: ifd0 };
  if (takenAt) exif.IFD2 = { DateTimeOriginal: takenAt };
  return noise(400, 300).withExif(exif as never).jpeg().toBuffer();
}

/** PNG with a Stable Diffusion style "parameters" tEXt chunk inserted before IEND. */
export async function stableDiffusionPng(): Promise<Buffer> {
  const png = await noise(512, 512).png().toBuffer();
  const body = Buffer.concat([Buffer.from("parameters\0", "latin1"), Buffer.from("a photo of a politician shaking hands, Steps: 30, Sampler: Euler a, CFG scale: 7", "latin1")]);
  const type = Buffer.from("tEXt", "latin1");
  const chunk = Buffer.alloc(12 + body.length);
  chunk.writeUInt32BE(body.length, 0);
  type.copy(chunk, 4);
  body.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, body])) >>> 0, 8 + body.length);
  const iend = png.length - 12;
  return Buffer.concat([png.subarray(0, iend), chunk, png.subarray(iend)]);
}
