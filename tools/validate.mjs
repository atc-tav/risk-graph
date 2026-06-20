// Validates the canonical Risk data: 42 territories, symmetric adjacency,
// continent membership, and that every territory has hexes assigned exactly once.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const hexmap = JSON.parse(readFileSync(join(root, 'data/hexmap.json'), 'utf8'));

const T = territories.territories;
const C = territories.continents;
const H = hexmap.territories;

const errors = [];
const warns = [];
const ids = Object.keys(T);

// 1. Expect exactly 42 territories.
if (ids.length !== 42) errors.push(`Expected 42 territories, found ${ids.length}`);

// 2. Continent references resolve; tally continent sizes.
const expectedSizes = { north_america: 9, south_america: 4, europe: 7, africa: 6, asia: 12, australia: 4 };
const sizes = {};
for (const id of ids) {
  const cont = T[id].continent;
  if (!C[cont]) errors.push(`${id}: unknown continent "${cont}"`);
  sizes[cont] = (sizes[cont] || 0) + 1;
}
for (const [cont, n] of Object.entries(expectedSizes)) {
  if (sizes[cont] !== n) errors.push(`Continent ${cont}: expected ${n} territories, found ${sizes[cont] || 0}`);
}

// 3. Adjacency: targets exist, no self-loops, symmetric.
let edgeCount = 0;
for (const id of ids) {
  const adj = T[id].adjacent || [];
  const seen = new Set();
  for (const other of adj) {
    if (other === id) errors.push(`${id}: adjacent to itself`);
    if (seen.has(other)) errors.push(`${id}: duplicate adjacency "${other}"`);
    seen.add(other);
    if (!T[other]) { errors.push(`${id}: adjacent to unknown "${other}"`); continue; }
    if (!(T[other].adjacent || []).includes(id)) {
      errors.push(`Asymmetric edge: ${id} -> ${other} but not back`);
    }
    if (id < other) edgeCount++;
  }
}

// 4. Hex assignment: every territory has hexes; no hex shared between territories.
const owner = new Map();
for (const id of ids) {
  const hexes = H[id];
  if (!hexes || hexes.length === 0) { errors.push(`${id}: no hexes assigned`); continue; }
  for (const [col, row] of hexes) {
    const key = `${col},${row}`;
    if (owner.has(key)) errors.push(`Hex ${key} shared by ${owner.get(key)} and ${id}`);
    else owner.set(key, id);
  }
}
for (const id of Object.keys(H)) {
  if (!T[id]) errors.push(`hexmap has unknown territory "${id}"`);
}

console.log(`Territories: ${ids.length}/42`);
console.log(`Undirected edges: ${edgeCount}`);
console.log(`Hexes placed: ${owner.size}`);
console.log(`Continent sizes:`, sizes);

if (warns.length) { console.log('\nWarnings:'); warns.forEach(w => console.log('  ! ' + w)); }
if (errors.length) {
  console.error(`\nFAILED with ${errors.length} error(s):`);
  errors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log('\nAll checks passed ✓');
