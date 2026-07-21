// Generates the OLD placeholder app-icon.png (1024×1024) — indigo rounded
// square with a three-bar "flow" glyph. Superseded by the real Brawley logo;
// do not run this, it will overwrite app-icon.png with the old placeholder.
// Kept only for reference. Pure Node (zlib PNG encoder), no image deps.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 1024;
const H = 1024;
const px = new Uint8Array(W * H * 4);

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function rrectSDF(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r
  );
}

function capsuleSDF(x, y, x1, x2, cy, r) {
  const qx = Math.min(Math.max(x, x1), x2);
  return Math.hypot(x - qx, y - cy) - r;
}

const top = [122, 126, 249];
const bottom = [76, 79, 216];
const bars = [
  { x1: 348, x2: 706, cy: 380, r: 40 },
  { x1: 348, x2: 616, cy: 512, r: 40 },
  { x1: 348, x2: 524, cy: 644, r: 40 },
];

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const d = rrectSDF(x + 0.5, y + 0.5, 512, 512, 412, 412, 188);
    const bgA = 1 - smooth(-0.8, 0.8, d);
    if (bgA <= 0) continue;
    const t = y / H;
    let r = lerp(top[0], bottom[0], t);
    let g = lerp(top[1], bottom[1], t);
    let b = lerp(top[2], bottom[2], t);
    let glyph = 0;
    for (const bar of bars) {
      glyph = Math.max(
        glyph,
        1 - smooth(-0.8, 0.8, capsuleSDF(x + 0.5, y + 0.5, bar.x1, bar.x2, bar.cy, bar.r)),
      );
    }
    r = lerp(r, 255, glyph);
    g = lerp(g, 255, glyph);
    b = lerp(b, 255, glyph);
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = Math.round(bgA * 255);
  }
}

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA

const raw = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0; // filter: none
  Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(new URL("../app-icon.png", import.meta.url), png);
console.log(`wrote app-icon.png (${png.length} bytes)`);
