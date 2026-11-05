/**
 * Renders the site icons in public/ from the mark in src/lib/logo.ts: a
 * favicon pair (.svg and a 32×32 .ico) per section, favicon.* for the start
 * page and favicon-tech.* / favicon-medicine.* for the sections, which
 * Base.astro picks by the page's section; plus apple-touch-icon.png (180×180,
 * square, since iOS rounds it itself) and the manifest's icon-192.png and
 * icon-512.png, which show the site as a whole and so use the start colors.
 * Run after changing the mark:
 *
 *   bun scripts/icons.ts
 */
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { faviconPaths, logoSvg, type LogoVariant } from "../src/lib/logo.ts";

const out = (file: string) => new URL(`../public/${file}`, import.meta.url).pathname;

const png = (size: number, square = false, variant: LogoVariant = "start") =>
  sharp(Buffer.from(logoSvg({ size, square, variant })), { density: 288 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

/** An .ico holding one PNG image, which every current browser reads */
function ico(image: Buffer, size: number) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size % 256, 6);
  header.writeUInt8(size % 256, 7);
  header.writeUInt8(0, 8); // no palette
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(image.length, 14);
  header.writeUInt32LE(22, 18); // image data offset
  return Buffer.concat([header, image]);
}

if (import.meta.main) {
  const files: [string, Buffer | string][] = [];
  for (const variant of ["start", "tech", "medicine"] as const) {
    const { svg, ico: icoPath } = faviconPaths(variant);
    files.push([svg.slice(1), logoSvg({ variant }) + "\n"], [icoPath.slice(1), ico(await png(32, false, variant), 32)]);
  }
  files.push(["apple-touch-icon.png", await png(180, true)], ["icon-192.png", await png(192)], ["icon-512.png", await png(512)]);
  for (const [file, data] of files) {
    await writeFile(out(file), data);
    console.log(`public/${file}`);
  }
}
