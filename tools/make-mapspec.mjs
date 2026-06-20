// One-off: derive an initial seed position for each territory from the current
// (verified) coarse hexmap centroid, and attach a size weight read off the
// classic board. Writes data/mapspec.json, which gen-map.mjs then grows.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const H = JSON.parse(readFileSync(join(root, 'data/hexmap.json'), 'utf8')).territories;

const F = 2; // scale factor from coarse grid to fine seed grid

// Area relative to the smallest country (=1.0), eyeballed from the classic map.
const SIZE = {
  alaska: 1.6, northwest_territory: 2.2, greenland: 2.6, alberta: 1.5, ontario: 1.6,
  quebec: 1.5, western_us: 1.7, eastern_us: 1.5, central_america: 1.0,
  venezuela: 1.2, brazil: 2.6, peru: 1.4, argentina: 1.9,
  iceland: 1.0, great_britain: 1.1, scandinavia: 1.6, northern_europe: 1.2,
  southern_europe: 1.3, western_europe: 1.2, ukraine: 3.0,
  north_africa: 2.6, egypt: 1.0, east_africa: 2.2, congo: 1.5, south_africa: 1.7, madagascar: 1.0,
  ural: 1.7, siberia: 2.6, yakutsk: 1.8, kamchatka: 2.2, irkutsk: 1.4, mongolia: 1.7,
  japan: 1.0, afghanistan: 1.8, china: 2.3, middle_east: 1.7, india: 1.7, siam: 1.3,
  indonesia: 1.1, new_guinea: 1.1, western_australia: 1.5, eastern_australia: 1.3,
};

const spec = {};
const used = new Set();
for (const [id, cells] of Object.entries(H)) {
  let sc = 0, sr = 0;
  for (const [c, r] of cells) { sc += c; sr += r; }
  let c = Math.round((sc / cells.length) * F);
  let r = Math.round((sr / cells.length) * F);
  while (used.has(`${c},${r}`)) c++;          // nudge off any collision
  used.add(`${c},${r}`);
  spec[id] = { seed: [c, r], size: SIZE[id] ?? 1.0 };
}

writeFileSync(join(root, 'data/mapspec.json'),
  '{\n  "_comment": "seed = fine-grid hex a territory grows from; size = area relative to the smallest (x base in gen-map.mjs). Edit and re-run `node tools/gen-map.mjs`.",\n  "base": 10,\n' +
  Object.entries(spec).map(([id, v]) => `  ${JSON.stringify(id)}: ${JSON.stringify(v)}`).join(',\n') +
  '\n}\n');
console.log(`Wrote data/mapspec.json (${Object.keys(spec).length} territories)`);
