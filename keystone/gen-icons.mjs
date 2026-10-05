#!/usr/bin/env node
/**
 * gen-icons.mjs — zero-dep PNG icon generator for the JARVIS Surface PWA.
 * Draws an "arc-reactor" mark (accent ring + inner blue ring + center dot) on
 * the app's dark background. No Pillow / no deps — raw RGBA buffer → zlib → PNG.
 * Run once: `node gen-icons.mjs`  → icon-180.png icon-192.png icon-512.png
 */
import zlib from "node:zlib";
import fs from "node:fs";

const BG = [7, 7, 12];
const ACC = [255, 77, 109];
const ACC2 = [91, 140, 255];

// CRC32 (PNG spec)
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(sz, draw) {
  // RGBA pixel buffer
  const px = Buffer.alloc(sz * sz * 4);
  for (let y = 0; y < sz; y++)
    for (let x = 0; x < sz; x++) {
      const [r, g, b, a] = draw(x, y);
      const o = (y * sz + x) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
    }
  // raw = each scanline prefixed with filter byte 0
  const raw = Buffer.alloc(sz * (sz * 4 + 1));
  for (let y = 0; y < sz; y++) {
    raw[y * (sz * 4 + 1)] = 0;
    px.copy(raw, y * (sz * 4 + 1) + 1, y * sz * 4, (y + 1) * sz * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(sz, 0);
  ihdr.writeUInt32BE(sz, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// soft edge: coverage of a stroked ring/disk, anti-aliased by 1px
function ringAlpha(d, rOuter, rInner) {
  // d = distance from center; 1 inside [rInner,rOuter], feathered 1px at edges
  const aa = (edge, inside) => {
    const t = (edge - d) * (inside ? 1 : -1);
    return Math.max(0, Math.min(1, t + 0.5));
  };
  return Math.min(aa(rOuter, true), aa(rInner, false));
}

function mark(sz) {
  const c = sz / 2;
  const rOut = sz * 0.34, wOut = sz * 0.055;
  const rIn = sz * 0.21, wIn = sz * 0.035;
  const rDot = sz * 0.07;
  return (x, y) => {
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    const d = Math.sqrt(dx * dx + dy * dy);
    let col = [...BG], a = 255;
    // center dot
    const dotA = Math.max(0, Math.min(1, rDot - d + 0.5));
    // inner ring
    const inA = ringAlpha(d, rIn + wIn / 2, rIn - wIn / 2);
    // outer ring
    const outA = ringAlpha(d, rOut + wOut / 2, rOut - wOut / 2);
    const blend = (base, top, t) => base.map((v, i) => Math.round(v + (top[i] - v) * t));
    col = blend(col, ACC2, inA);
    col = blend(col, ACC, outA);
    col = blend(col, ACC, dotA);
    return [col[0], col[1], col[2], a];
  };
}

for (const sz of [180, 192, 512]) {
  fs.writeFileSync(`icon-${sz}.png`, png(sz, mark(sz)));
  console.log(`icon-${sz}.png`);
}
