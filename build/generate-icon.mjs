/**
 * Génère build/icon.png (512×512) sans dépendance graphique.
 * electron-builder dérive les formats .ico et .icns de ce fichier.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const S = 512;
const BG = [0x16, 0x18, 0x1d];
const CARD = [0x1e, 0x21, 0x28];
const ACCENT = [0x4f, 0x8c, 0xff];
const LIGHT = [0xe7, 0xe9, 0xee];

const pixels = new Uint8Array(S * S * 4);

function set(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

function roundedRect(x0, y0, w, h, radius, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(x0 + radius - x, x - (x0 + w - 1 - radius), 0);
      const dy = Math.max(y0 + radius - y, y - (y0 + h - 1 - radius), 0);
      if (dx * dx + dy * dy <= radius * radius) set(x, y, color);
    }
  }
}

function outline(x0, y0, w, h, radius, thickness, color) {
  roundedRect(x0, y0, w, h, radius, color);
  roundedRect(
    x0 + thickness,
    y0 + thickness,
    w - thickness * 2,
    h - thickness * 2,
    Math.max(radius - thickness, 0),
    CARD,
  );
}

// Fond.
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) set(x, y, BG);
roundedRect(24, 24, S - 48, S - 48, 88, CARD);

// Écran de bureau.
outline(96, 132, 240, 176, 18, 12, ACCENT);
roundedRect(186, 308, 60, 16, 6, ACCENT);
roundedRect(150, 324, 132, 14, 7, ACCENT);

// Téléphone au premier plan.
outline(296, 196, 128, 208, 24, 12, LIGHT);
roundedRect(340, 214, 40, 8, 4, LIGHT);

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

let table = null;
function crc32(buf) {
  if (table === null) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  Buffer.from(pixels.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // profondeur
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), 'icon.png');
writeFileSync(out, png);
console.log(`icône écrite : ${out} (${png.length} octets)`);
