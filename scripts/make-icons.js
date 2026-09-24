// Generates the plugin's PNG icons (three stacked "sheets") without any
// image dependencies. Run with `npm run icons`.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Draws three offset sheet outlines; the front one is filled. */
function drawIcon(size, [r, g, b]) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 23;
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  const rect = (x0, y0, x1, y1, fill) => {
    const [a, c, d, e] = [x0, y0, x1, y1].map((v) => Math.round(v * s));
    const t = Math.max(1, Math.round(s));
    for (let y = c; y < e; y++)
      for (let x = a; x < d; x++)
        if (fill || x < a + t || x >= d - t || y < c + t || y >= e - t) set(x, y);
  };
  rect(8, 2, 21, 15, false);
  rect(5, 5, 18, 18, false);
  rect(2, 8, 15, 21, true);
  return encodePng(size, px);
}

const outDir = path.join(__dirname, "..", "plugin", "icons");
fs.mkdirSync(outDir, { recursive: true });

const variants = [
  { name: "dark", base: 23, color: [0xe6, 0xe6, 0xe6] },
  { name: "light", base: 23, color: [0x32, 0x32, 0x32] },
  { name: "plugin", base: 48, color: [0x31, 0xa8, 0xff] },
];
for (const { name, base, color } of variants) {
  for (const scale of [1, 2]) {
    const file = path.join(outDir, `${name}@${scale}x.png`);
    fs.writeFileSync(file, drawIcon(base * scale, color));
    console.log("wrote", path.relative(process.cwd(), file));
  }
}
