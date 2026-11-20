// A tiny PNG writer and pixel-art helpers. No dependencies.
import zlib from 'node:zlib';

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** RGBA bytes (width * height * 4) to a PNG file. */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (colour) => {
  const value = colour.replace('#', '');
  const alpha = value.length === 8 ? parseInt(value.slice(6, 8), 16) : 255;
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), alpha];
};

/** A grid of art pixels. Each cell holds a colour string or null. */
export class Grid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height).fill(null);
  }
  get(x, y) {
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? null : this.cells[y * this.width + x];
  }
  set(x, y, colour) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y * this.width + x] = colour;
  }
  fill(x, y, width, height, colour) {
    for (let j = y; j < y + height; j++) for (let i = x; i < x + width; i++) this.set(i, j, colour);
  }
  clone() {
    const copy = new Grid(this.width, this.height);
    copy.cells = this.cells.slice();
    return copy;
  }
  /** Draws another grid onto this one; empty cells of the source leave this one alone. */
  draw(source, dx = 0, dy = 0) {
    for (let y = 0; y < source.height; y++)
      for (let x = 0; x < source.width; x++) {
        const colour = source.get(x, y);
        if (colour) this.set(x + dx, y + dy, colour);
      }
    return this;
  }
  /** Fills the cells whose middle lies inside a shape given as [x, y] corners. */
  polygon(points, colour) {
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i];
          const [xj, yj] = points[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, colour);
      }
    return this;
  }
  /** Fills the cells whose middle is within half of `width` of the line from a to b. */
  line([ax, ay], [bx, by], colour, width = 1) {
    const length = Math.hypot(bx - ax, by - ay) || 1;
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const px = x + 0.5 - ax;
        const py = y + 0.5 - ay;
        const along = Math.max(0, Math.min(1, (px * (bx - ax) + py * (by - ay)) / (length * length)));
        if (Math.hypot(px - along * (bx - ax), py - along * (by - ay)) <= width / 2) this.set(x, y, colour);
      }
    return this;
  }
  /** Fills an oval. */
  ellipse(cx, cy, rx, ry, colour) {
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(x, y, colour);
    return this;
  }
  /** Puts a line of `colour` around every drawn pixel (4 neighbours). */
  outline(colour) {
    const next = this.cells.slice();
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) next[y * this.width + x] = colour;
      }
    this.cells = next;
    return this;
  }
  flipX() {
    const out = new Grid(this.width, this.height);
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) out.set(this.width - 1 - x, y, this.get(x, y));
    return out;
  }
  /** PNG with each art pixel drawn `scale` screen pixels wide. */
  png(scale = 1, background = null) {
    const width = this.width * scale;
    const height = this.height * scale;
    const rgba = Buffer.alloc(width * height * 4);
    const base = background ? hex(background) : [0, 0, 0, 0];
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const colour = this.get(x, y);
        const [r, g, b, a] = colour ? hex(colour) : base;
        for (let j = 0; j < scale; j++) {
          let offset = ((y * scale + j) * width + x * scale) * 4;
          for (let i = 0; i < scale; i++) {
            rgba[offset++] = r;
            rgba[offset++] = g;
            rgba[offset++] = b;
            rgba[offset++] = a;
          }
        }
      }
    return encodePng(width, height, rgba);
  }
}

/** Rows of characters to a grid, through a palette of character to colour. '.' and ' ' are empty. */
export function fromRows(rows, palette) {
  const width = Math.max(...rows.map((row) => row.length));
  const grid = new Grid(width, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((character, x) => {
      if (character === '.' || character === ' ') return;
      const colour = palette[character];
      if (!colour) throw new Error(`No colour for "${character}" in row ${y}: ${row}`);
      grid.set(x, y, colour);
    });
  });
  return grid;
}

/** A small repeatable random number source. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
