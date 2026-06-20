// Renders the hex map to a PNG so the layout can be reviewed without a browser.
// Usage: node tools/preview.mjs [outfile.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { hexCorners, hexToPixel, clusterCentroid, hexesBounds } from '../src/hex.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const hexmap = JSON.parse(readFileSync(join(root, 'data/hexmap.json'), 'utf8'));
const out = process.argv[2] || join(root, 'preview.png');

const T = territories.territories;
const C = territories.continents;
const H = hexmap.territories;
const SIZE = 26;          // hex radius in px
const PAD = 40;

// Pixel-space center for each territory (label / graph node anchor).
const centers = {};
for (const id of Object.keys(H)) centers[id] = clusterCentroid(H[id], SIZE);

const allHexes = Object.values(H).flat();
const b = hexesBounds(allHexes, SIZE);
const W = Math.ceil(b.width) + PAD * 2;
const Hpx = Math.ceil(b.height) + PAD * 2;
const ox = PAD - b.minX;
const oy = PAD - b.minY;

const canvas = createCanvas(W, Hpx);
const ctx = canvas.getContext('2d');

// Ocean background.
ctx.fillStyle = '#13314f';
ctx.fillRect(0, 0, W, Hpx);

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const bl = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${g},${bl})`;
}

// Draw hexes, continent-coloured.
for (const id of Object.keys(H)) {
  const cont = C[T[id].continent];
  ctx.fillStyle = cont.color;
  ctx.strokeStyle = lighten(cont.color, 30);
  ctx.lineWidth = 2;
  for (const [col, row] of H[id]) {
    const cs = hexCorners(col, row, SIZE);
    ctx.beginPath();
    cs.forEach((c, i) => i ? ctx.lineTo(c.x + ox, c.y + oy) : ctx.moveTo(c.x + ox, c.y + oy));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// Adjacency edges (the graph overlay).
ctx.strokeStyle = 'rgba(255,255,255,0.35)';
ctx.lineWidth = 1.5;
for (const id of Object.keys(T)) {
  for (const other of T[id].adjacent) {
    if (id >= other) continue;
    const a = centers[id], z = centers[other];
    // Skip the longest sea routes in the 2D preview so lines don't cross the whole map.
    const dist = Math.hypot(a.x - z.x, a.y - z.y);
    if (dist > SIZE * 14) continue;
    ctx.beginPath();
    ctx.moveTo(a.x + ox, a.y + oy);
    ctx.lineTo(z.x + ox, z.y + oy);
    ctx.stroke();
  }
}

// Graph nodes + labels.
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
for (const id of Object.keys(T)) {
  const c = centers[id];
  ctx.beginPath();
  ctx.arc(c.x + ox, c.y + oy, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '11px sans-serif';
  const label = T[id].name;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(label, c.x + ox, c.y + oy - 13);
  ctx.fillStyle = '#f5f0e0';
  ctx.fillText(label, c.x + ox, c.y + oy - 14);
}

writeFileSync(out, canvas.encode ? await canvas.encode('png') : canvas.toBuffer('image/png'));
console.log(`Wrote ${out} (${W}x${Hpx})`);
