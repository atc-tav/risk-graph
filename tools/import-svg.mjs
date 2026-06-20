// Parses the raddrick/risk-map-svg territory + sea outlines (fetched into
// tools/svgsrc/) into polygons and writes data/shapes.json in SVG-coordinate
// space. Bezier curves are flattened to line segments. Source:
// https://github.com/raddrick/risk-map-svg  (adapted from Wikimedia Risk_board.svg)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'tools/svgsrc');

// filename (continent_name) -> canonical territory id
const ID = {
  countries_na_alaska: 'alaska', countries_na_northwest: 'northwest_territory', countries_na_greenland: 'greenland',
  countries_na_alberta: 'alberta', countries_na_ontario: 'ontario', countries_na_quebec: 'quebec',
  countries_na_west: 'western_us', countries_na_east: 'eastern_us', countries_na_central: 'central_america',
  countries_sa_venezuela: 'venezuela', countries_sa_brazil: 'brazil', countries_sa_peru: 'peru', countries_sa_argentina: 'argentina',
  countries_eu_iceland: 'iceland', countries_eu_britian: 'great_britain', countries_eu_scandinavia: 'scandinavia',
  countries_eu_north: 'northern_europe', countries_eu_south: 'southern_europe', countries_eu_west: 'western_europe', countries_eu_ukraine: 'ukraine',
  countries_af_north: 'north_africa', countries_af_egypt: 'egypt', countries_af_east: 'east_africa',
  countries_af_congo: 'congo', countries_af_south: 'south_africa', countries_af_madagascar: 'madagascar',
  countries_as_ural: 'ural', countries_as_siberia: 'siberia', countries_as_yakutsk: 'yakutsk', countries_as_kamchatka: 'kamchatka',
  countries_as_irkutsk: 'irkutsk', countries_as_mongolia: 'mongolia', countries_as_japan: 'japan', countries_as_afganistan: 'afghanistan',
  countries_as_china: 'china', countries_as_middle: 'middle_east', countries_as_india: 'india', countries_as_siam: 'siam',
  countries_au_indonesia: 'indonesia', countries_au_guinea: 'new_guinea', countries_au_papua: 'new_guinea', // Papua merged into New Guinea
  countries_au_west: 'western_australia', countries_au_east: 'eastern_australia',
};

// Flatten an SVG path 'd' string into an array of sub-polygons ([[x,y],...]).
function parsePath(d) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0;
  const num = () => parseFloat(toks[i++]);
  const polys = []; let poly = [];
  let x = 0, y = 0, startX = 0, startY = 0, cmd = '', px = 0, py = 0;
  const cubic = (x1, y1, x2, y2, ex, ey) => {
    const N = 8;
    for (let t = 1; t <= N; t++) {
      const u = t / N, m = 1 - u;
      const bx = m*m*m*x + 3*m*m*u*x1 + 3*m*u*u*x2 + u*u*u*ex;
      const by = m*m*m*y + 3*m*m*u*y1 + 3*m*u*u*y2 + u*u*u*ey;
      poly.push([bx, by]);
    }
    px = x2; py = y2; x = ex; y = ey;
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        let nx = num(), ny = num(); if (rel) { nx += x; ny += y; }
        if (poly.length) polys.push(poly);
        poly = []; x = nx; y = ny; startX = x; startY = y; poly.push([x, y]);
        cmd = rel ? 'l' : 'L'; break;
      }
      case 'L': { let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } x = nx; y = ny; poly.push([x, y]); break; }
      case 'H': { let nx = num(); if (rel) nx += x; x = nx; poly.push([x, y]); break; }
      case 'V': { let ny = num(); if (rel) ny += y; y = ny; poly.push([x, y]); break; }
      case 'C': {
        let x1 = num(), y1 = num(), x2 = num(), y2 = num(), ex = num(), ey = num();
        if (rel) { x1 += x; y1 += y; x2 += x; y2 += y; ex += x; ey += y; }
        cubic(x1, y1, x2, y2, ex, ey); break;
      }
      case 'S': {
        let x2 = num(), y2 = num(), ex = num(), ey = num();
        if (rel) { x2 += x; y2 += y; ex += x; ey += y; }
        const x1 = 2 * x - px, y1 = 2 * y - py; cubic(x1, y1, x2, y2, ex, ey); break;
      }
      case 'Z': { if (poly.length) { polys.push(poly); } poly = []; x = startX; y = startY; poly.push([x, y]); break; }
      default: i++; // skip unsupported
    }
  }
  if (poly.length > 1) polys.push(poly);
  return polys.filter(p => p.length >= 3);
}

const territories = {}; const seas = [];
for (const file of readdirSync(dir)) {
  const txt = readFileSync(join(dir, file), 'utf8');
  const base = file.replace(/\.js$/, '');
  let d;
  const tmpl = txt.match(/d=\{`([^`]*)`\}/);
  if (tmpl && tmpl[1].includes('${')) {
    // path built from a relative-coords useState array: `M sx sy c${coords}z`
    let start = tmpl[1].match(/M\s*(-?[\d.]+)\s+(-?[\d.]+)\s*c/);
    if (!start) start = txt.match(/marks\s*=\s*\[\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/); // start from `marks`
    const arr = JSON.parse((txt.match(/useState\(\s*(\[\[[\s\S]*?\]\])\s*\)/) || [])[1]);
    d = `M${start[1]} ${start[2]}c${arr.map(p => p.join(',')).join(' ')}z`;
  } else if (tmpl) {
    d = tmpl[1];
  } else {
    d = (txt.match(/return\s+'([^']+)'/) || [])[1]; // seas
  }
  if (!d) { console.warn('no path in', file); continue; }
  const polys = parsePath(d);
  if (base.startsWith('seas_')) { seas.push(...polys); continue; }
  const id = ID[base];
  if (!id) { console.warn('unmapped', base); continue; }
  (territories[id] ||= []).push(...polys);
}

const out = { _source: 'github.com/raddrick/risk-map-svg (Wikimedia Risk_board.svg)', _coordspace: 'svg', territories, seas };

// Hand-placed extra inland water (SVG coords): a few hexes each to suggest a gulf.
const EXTRA_SEAS = [
  [[147, 284], [156, 277], [165, 289], [157, 300]], // Gulf of California (Sea of Cortez)
  [[600, 379], [612, 361], [628, 374], [617, 393]], // Persian Gulf
];
seas.push(...EXTRA_SEAS);

writeFileSync(join(root, 'data/shapes.json'), JSON.stringify(out));
console.log(`Imported ${Object.keys(territories).length} territories, ${seas.length} sea polygons`);
const allpts = Object.values(territories).flat(2);
const xs = allpts.map(p => p[0]), ys = allpts.map(p => p[1]);
console.log(`bounds x[${Math.min(...xs).toFixed(0)},${Math.max(...xs).toFixed(0)}] y[${Math.min(...ys).toFixed(0)},${Math.max(...ys).toFixed(0)}]`);
