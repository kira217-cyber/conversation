import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

/**
 * `npm run icons`
 *
 * Draws the app icons straight to PNG — no image library, no binary
 * assets checked in. A purple-to-pink rounded square with a white heart,
 * which is what shows on the home screen and on every notification.
 */

const OUT = "public";

/** Minimal PNG encoder: RGBA pixels -> a real .png file */
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/** (x² + y² − 1)³ − x²y³ ≤ 0 is the classic heart curve */
function insideHeart(x, y) {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

function drawIcon(size, { rounded = true, heartScale = 0.62, transparent = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // rounded-square mask, anti-aliased at the corners
      let alpha = 255;
      if (rounded) {
        const dx = Math.max(radius - x, x - (size - radius), 0);
        const dy = Math.max(radius - y, y - (size - radius), 0);
        const d = Math.hypot(dx, dy);
        if (d > radius) alpha = 0;
        else if (d > radius - 1.2) alpha = Math.round(255 * (radius - d) / 1.2);
      }

      if (alpha === 0) {
        px[i + 3] = 0;
        continue;
      }

      // diagonal purple -> pink
      const t = (x / size) * 0.5 + (y / size) * 0.5;
      let r = Math.round(139 + (236 - 139) * t);
      let g = Math.round(74 + (72 - 74) * t);
      let b = Math.round(229 + (153 - 229) * t);

      if (transparent) {
        r = g = b = 255;
        alpha = 0;
      }

      // the heart, sampled 2x2 so the edge is not jagged
      const cx = size / 2;
      const cy = size * 0.47;
      const scale = (size * heartScale) / 2;
      let hits = 0;
      for (const oy of [-0.25, 0.25]) {
        for (const ox of [-0.25, 0.25]) {
          const hx = (x + ox - cx) / scale;
          const hy = -((y + oy - cy) / scale) + 0.25;
          if (insideHeart(hx, hy)) hits++;
        }
      }

      if (hits > 0) {
        const cover = hits / 4;
        if (transparent) {
          px[i] = 255;
          px[i + 1] = 255;
          px[i + 2] = 255;
          px[i + 3] = Math.round(255 * cover);
          continue;
        }
        r = Math.round(r + (255 - r) * cover);
        g = Math.round(g + (255 - g) * cover);
        b = Math.round(b + (255 - b) * cover);
      }

      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = alpha;
    }
  }

  return encodePNG(size, size, px);
}

fs.mkdirSync(OUT, { recursive: true });

const files = [
  ["icon-192.png", drawIcon(192)],
  ["icon-512.png", drawIcon(512)],
  ["apple-touch-icon.png", drawIcon(180, { rounded: false })],
  // Android draws the badge as a silhouette, so it must be white-on-transparent
  ["badge-72.png", drawIcon(72, { rounded: false, heartScale: 0.8, transparent: true })],
  // maskable: Android crops to its own shape, so keep the heart inside the safe zone
  ["icon-maskable-512.png", drawIcon(512, { rounded: false, heartScale: 0.44 })],
];

for (const [name, buf] of files) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`  ✓ ${name}  (${(buf.length / 1024).toFixed(1)} KB)`);
}
console.log("\nIcons written to public/\n");
