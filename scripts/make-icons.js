// 產生 App 圖示（PNG）。執行：node scripts/make-icons.js
// 圖案：青綠底上兩個對話框（白色＝顧客、珊瑚色＝我），右上角一顆金色星芒（教練點評）。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x0b, 0x6f, 0x78];
const BUBBLE = [0xff, 0xff, 0xff];
const ME = [0xe8, 0x66, 0x4a];
const DOT = [0x0b, 0x6f, 0x78];
const STAR = [0xf6, 0xbf, 0x4a];

const roundRect = (x, y, x0, y0, x1, y1, r) => {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  const dx = Math.max(Math.abs(x - cx) - hx, 0), dy = Math.max(Math.abs(y - cy) - hy, 0);
  return Math.hypot(dx, dy) - r;
};
const inRoundRect = (x, y, x0, y0, x1, y1, r) => roundRect(x, y, x0, y0, x1, y1, r) <= 0;
const inStar = (x, y, cx, cy, r) => {
  const u = Math.abs(x - cx) / r, v = Math.abs(y - cy) / r;
  return Math.sqrt(u) + Math.sqrt(v) <= 1;
};
// 對話框尾巴：左下角的三角形
const inTri = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

function render(size, { content = 1, rounded = false } = {}) {
  const S = 4;
  const px = Buffer.alloc(size * size * 4);
  const map = t => 0.5 + (t - 0.5) * content;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sj = 0; sj < S; sj++) for (let si = 0; si < S; si++) {
      const x = (i + (si + 0.5) / S) / size, y = (j + (sj + 0.5) / S) / size;
      if (rounded && !inRoundRect(x, y, 0, 0, 1, 1, 0.22)) continue;
      let c = BG;
      // 顧客對話框（左上）＋尾巴，裡面三個點
      const b1 = inRoundRect(x, y, map(0.14), map(0.2), map(0.64), map(0.56), 0.1 * content) ||
        inTri(x, y, [map(0.22), map(0.5)], [map(0.36), map(0.54)], [map(0.18), map(0.68)]);
      // 我的對話框（右下）＋尾巴
      const b2 = inRoundRect(x, y, map(0.4), map(0.5), map(0.86), map(0.8), 0.1 * content) ||
        inTri(x, y, [map(0.7), map(0.74)], [map(0.82), map(0.74)], [map(0.84), map(0.9)]);
      if (b1) {
        c = BUBBLE;
        for (const dx of [0.28, 0.39, 0.5]) if (Math.hypot(x - map(dx), y - map(0.38)) < 0.035 * content) c = DOT;
      }
      if (b2) c = ME;
      if (inStar(x, y, map(0.8), map(0.22), 0.13 * content)) c = STAR;
      r += c[0]; g += c[1]; b += c[2]; a += 255;
    }
    const n = S * S, o = (j * size + i) * 4;
    const cov = a / n;
    px[o] = cov ? Math.round(r / (a / 255)) : 0;
    px[o + 1] = cov ? Math.round(g / (a / 255)) : 0;
    px[o + 2] = cov ? Math.round(b / (a / 255)) : 0;
    px[o + 3] = Math.round(cov);
  }
  return encodePNG(size, px);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
const write = (name, buf) => { fs.writeFileSync(path.join(out, name), buf); console.log(name, buf.length, 'bytes'); };
write('icon-192.png', render(192, { rounded: true }));
write('icon-512.png', render(512, { rounded: true }));
write('maskable-512.png', render(512, { content: 0.78 }));
write('apple-touch-icon.png', render(180));
write('favicon-32.png', render(32, { rounded: true }));
write('shortcut-practice.png', render(96, { rounded: true }));
