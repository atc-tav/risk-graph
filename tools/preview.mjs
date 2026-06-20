// Renders the hex map to a PNG with clear country borders, so the layout can be
// reviewed without a browser. Usage: node tools/preview.mjs [outfile.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { hexCorners, clusterCentroid, hexesBounds } from '../src/hex.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const hexmap = JSON.parse(readFileSync(join(root, 'data/hexmap.json'), 'utf8'));
const out = process.argv[2] || join(root, 'preview.png');

const T = territories.territories, C = territories.continents, H = hexmap.territories;
const SIZE = 15, PAD = 36;

const centers = {};
for (const id of Object.keys(H)) centers[id] = clusterCentroid(H[id], SIZE);
const all = Object.values(H).flat();
const b = hexesBounds(all, SIZE);
const W = Math.ceil(b.width) + PAD * 2, Hpx = Math.ceil(b.height) + PAD * 2;
const ox = PAD - b.minX, oy = PAD - b.minY;

const canvas = createCanvas(W, Hpx);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#0e2a45';
ctx.fillRect(0, 0, W, Hpx);

// Fill hexes by continent colour.
for (const id of Object.keys(H)) {
  ctx.fillStyle = C[T[id].continent].color;
  for (const [c, r] of H[id]) {
    const cs = hexCorners(c, r, SIZE);
    ctx.beginPath();
    cs.forEach((p, i) => i ? ctx.lineTo(p.x + ox, p.y + oy) : ctx.moveTo(p.x + ox, p.y + oy));
    ctx.closePath();
    ctx.fill();
  }
}

// Collect every hex edge; an edge shared by two hexes of the SAME territory is
// interior, anything else is a border (country boundary or coastline).
const edges = new Map();
const ek = (p) => `${(p.x + ox).toFixed(1)},${(p.y + oy).toFixed(1)}`;
for (const id of Object.keys(H)) {
  for (const [c, r] of H[id]) {
    const cs = hexCorners(c, r, SIZE);
    for (let i = 0; i < 6; i++) {
      const p1 = cs[i], p2 = cs[(i + 1) % 6];
      const key = [ek(p1), ek(p2)].sort().join('|');
      const e = edges.get(key) || { p1, p2, ids: [] };
      e.ids.push(id);
      edges.set(key, e);
    }
  }
}
// Faint interior hex grid first, then bold borders on top.
ctx.lineCap = 'round';
for (const e of edges.values()) {
  const interior = e.ids.length === 2 && e.ids[0] === e.ids[1];
  if (!interior) continue;
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(e.p1.x + ox, e.p1.y + oy); ctx.lineTo(e.p2.x + ox, e.p2.y + oy); ctx.stroke();
}
for (const e of edges.values()) {
  const interior = e.ids.length === 2 && e.ids[0] === e.ids[1];
  if (interior) continue;
  ctx.strokeStyle = 'rgba(20,20,20,0.85)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(e.p1.x + ox, e.p1.y + oy); ctx.lineTo(e.p2.x + ox, e.p2.y + oy); ctx.stroke();
}

// Graph overlay: edges between territory centroids, then nodes + labels.
ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5;
for (const id of Object.keys(T)) for (const o of T[id].adjacent) {
  if (id >= o) continue;
  const a = centers[id], z = centers[o];
  if (Math.hypot(a.x - z.x, a.y - z.y) > SIZE * 22) continue; // skip long sea wraps
  ctx.beginPath(); ctx.moveTo(a.x + ox, a.y + oy); ctx.lineTo(z.x + ox, z.y + oy); ctx.stroke();
}
ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
for (const id of Object.keys(T)) {
  const c = centers[id];
  ctx.beginPath(); ctx.arc(c.x + ox, c.y + oy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = '11px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(T[id].name, c.x + ox, c.y + oy - 12);
  ctx.fillStyle = '#f6f1e2'; ctx.fillText(T[id].name, c.x + ox, c.y + oy - 13);
}

writeFileSync(out, canvas.encode ? await canvas.encode('png') : canvas.toBuffer('image/png'));
console.log(`Wrote ${out} (${W}x${Hpx})`);
