// Validates the canonical Risk data and its hex reconstruction:
//   - 42 territories, correct continent sizes, symmetric adjacency
//   - every hex belongs to exactly one territory
//   - each territory's hexes are contiguous
//   - every LAND border (graph edge not in SEA_ROUTES) is two touching hexes
// Also prints an ASCII view of the map for a quick visual sanity check.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const hexmap = JSON.parse(readFileSync(join(root, 'data/hexmap.json'), 'utf8'));

const T = territories.territories;
const C = territories.continents;
const H = hexmap.territories;
const ids = Object.keys(T);
const errors = [];

// Borders that cross water (or touch an island) and so need NOT physically touch.
const SEA_ROUTES = new Set([
  'alaska|kamchatka',
  'greenland|iceland', 'great_britain|iceland', 'iceland|scandinavia',
  'great_britain|northern_europe', 'great_britain|western_europe', 'great_britain|scandinavia',
  'brazil|north_africa',
  'north_africa|western_europe', 'north_africa|southern_europe', 'egypt|southern_europe',
  'east_africa|madagascar', 'madagascar|south_africa',
  'japan|kamchatka', 'japan|mongolia',
  'indonesia|siam',
].map(s => s.split('|').sort().join('|')));

// odd-r offset neighbours (pointy-top, odd rows shifted east).
const NEIGHBORS = [
  [[+1, 0], [0, -1], [-1, -1], [-1, 0], [-1, +1], [0, +1]], // even row
  [[+1, 0], [+1, -1], [0, -1], [-1, 0], [0, +1], [+1, +1]], // odd row
];
const nbrs = (c, r) => NEIGHBORS[r & 1].map(([dc, dr]) => [c + dc, r + dr]);
const key = (c, r) => `${c},${r}`;
const pk = (a, b) => [a, b].sort().join('|');

// ---- graph checks ----
if (ids.length !== 42) errors.push(`Expected 42 territories, found ${ids.length}`);
const expected = { north_america: 9, south_america: 4, europe: 7, africa: 6, asia: 12, australia: 4 };
const sizes = {};
for (const id of ids) {
  if (!C[T[id].continent]) errors.push(`${id}: unknown continent "${T[id].continent}"`);
  sizes[T[id].continent] = (sizes[T[id].continent] || 0) + 1;
}
for (const [k, n] of Object.entries(expected)) if (sizes[k] !== n) errors.push(`Continent ${k}: expected ${n}, found ${sizes[k] || 0}`);

let edgeCount = 0;
for (const id of ids) {
  for (const other of T[id].adjacent) {
    if (!T[other]) { errors.push(`${id}: adjacent to unknown "${other}"`); continue; }
    if (!(T[other].adjacent || []).includes(id)) errors.push(`Asymmetric edge: ${id} -> ${other}`);
    if (id < other) edgeCount++;
  }
}

// ---- hex ownership + contiguity ----
const owner = new Map();
for (const id of ids) {
  const cells = H[id];
  if (!cells || !cells.length) { errors.push(`${id}: no hexes`); continue; }
  for (const [c, r] of cells) {
    const k = key(c, r);
    if (owner.has(k)) errors.push(`Hex ${k} shared by ${owner.get(k)} and ${id}`);
    else owner.set(k, id);
  }
  const set = new Set(cells.map(([c, r]) => key(c, r)));
  const seen = new Set([key(cells[0][0], cells[0][1])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [c, r] = stack.pop();
    for (const [nc, nr] of nbrs(c, r)) if (set.has(key(nc, nr)) && !seen.has(key(nc, nr))) { seen.add(key(nc, nr)); stack.push([nc, nr]); }
  }
  if (seen.size !== set.size) errors.push(`${id}: not contiguous (${seen.size}/${set.size} connected)`);
}

// ---- land borders must touch ----
const touching = new Set();
for (const [k, id] of owner) {
  const [c, r] = k.split(',').map(Number);
  for (const [nc, nr] of nbrs(c, r)) {
    const o = owner.get(key(nc, nr));
    if (o && o !== id) touching.add(pk(id, o));
  }
}
const missing = [];
for (const id of ids) for (const other of T[id].adjacent) {
  if (id >= other) continue;
  if (SEA_ROUTES.has(pk(id, other))) continue;
  if (!touching.has(pk(id, other))) missing.push(`${id} <-> ${other}`);
}
if (missing.length) { errors.push(`${missing.length} land border(s) not touching:`); missing.forEach(m => errors.push('    ' + m)); }

// ---- ASCII view ----
let maxC = 0, maxR = 0;
for (const [c, r] of owner.keys() ? [...owner.keys()].map(k => k.split(',').map(Number)) : []) { maxC = Math.max(maxC, c); maxR = Math.max(maxR, r); }
const codeOf = {}; for (const id of ids) codeOf[id] = id.slice(0, 2).toUpperCase();
console.log('\nMap (north up, west left):');
for (let r = 0; r <= maxR; r++) {
  let line = (r & 1) ? ' ' : '';
  for (let c = 0; c <= maxC; c++) {
    const o = owner.get(key(c, r));
    line += o ? codeOf[o] + ' ' : ' . ';
  }
  console.log(line);
}

console.log(`\nTerritories: ${ids.length}/42 · edges: ${edgeCount} · hexes: ${owner.size}`);
if (errors.length) { console.error(`\nFAILED (${errors.length}):`); errors.forEach(e => console.error('  ✗ ' + e)); process.exit(1); }
console.log('All checks passed ✓  (contiguous territories, all land borders touching)');
