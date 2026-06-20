import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import territories from '../data/territories.json';
import hexmap from '../data/hexmap.json';
import { hexCorners, clusterCentroid, hexesBounds } from './hex.js';
import { bfs, shortestPath, maxDist, diameter } from './graph.js';

const T = territories.territories;
const C = territories.continents;
const H = hexmap.territories;

const SIZE = 1;            // hex radius in world units
const HEIGHT = 0.35;      // extruded thickness
const NODE_Y = 1.1;       // graph overlay sits above the tiles

// ---- center the whole map on the origin ----
const allHexes = Object.values(H).flat();
const b = hexesBounds(allHexes, SIZE);
const cx = b.minX + b.width / 2;
const cy = b.minY + b.height / 2;
// pixel (x,y) -> world (x, z). Negate X so east is screen-right and negate the
// y term so north is screen-up under the south-facing camera (see check-orientation.mjs).
const worldX = (x) => -(x - cx);
const worldZ = (y) => -(y - cy);

const centers = {};
for (const id of Object.keys(H)) {
  const c = clusterCentroid(H[id], SIZE);
  centers[id] = new THREE.Vector3(worldX(c.x), 0, worldZ(c.y));
}

// ---- scene scaffolding ----
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0c2238');

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000);
// View from the south (-Z) and above, so north is up and east is to the right
// (matching a conventional map; viewing from +Z would mirror east/west).
const span = Math.max(b.width, b.height);
camera.position.set(0, span * 0.78, -span * 0.72);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(-40, 80, 40);
scene.add(key);

// Ocean plane.
const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(b.width * 3, b.height * 3),
  new THREE.MeshStandardMaterial({ color: '#0e2a45', roughness: 1 })
);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -0.1;
scene.add(ocean);

// ---- one extruded mesh per territory (merged hexes) ----
function hexPrism(col, row) {
  const cs = hexCorners(col, row, SIZE);
  const shape = new THREE.Shape();
  cs.forEach((c, i) => i ? shape.lineTo(worldX(c.x), -worldZ(c.y)) : shape.moveTo(worldX(c.x), -worldZ(c.y)));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: HEIGHT, bevelEnabled: false });
}

const territoryMeshes = [];
const baseColors = {};
for (const id of Object.keys(H)) {
  const geom = BufferGeometryUtils.mergeGeometries(H[id].map(([c, r]) => hexPrism(c, r)));
  const color = new THREE.Color(C[T[id].continent].color);
  baseColors[id] = color;
  // DoubleSide because negating X in worldX reverses the extruded shape winding.
  const mat = new THREE.MeshStandardMaterial({ color: color.clone(), roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;   // lay the extrusion flat (XY shape -> XZ plane)
  mesh.userData.id = id;
  scene.add(mesh);
  territoryMeshes.push(mesh);
}

// ---- country borders: draw every hex edge not shared within one territory ----
const borderEdges = new Map();
const ek = (px, py) => `${worldX(px).toFixed(2)},${worldZ(py).toFixed(2)}`;
for (const id of Object.keys(H)) {
  for (const [c, r] of H[id]) {
    const cs = hexCorners(c, r, SIZE);
    for (let i = 0; i < 6; i++) {
      const p1 = cs[i], p2 = cs[(i + 1) % 6];
      const key = [ek(p1.x, p1.y), ek(p2.x, p2.y)].sort().join('|');
      const e = borderEdges.get(key) || { p1, p2, n: 0, same: true, first: id };
      e.n++; if (e.first !== id) e.same = false;
      borderEdges.set(key, e);
    }
  }
}
const borderPts = [];
for (const e of borderEdges.values()) {
  if (e.n === 2 && e.same) continue; // interior edge
  borderPts.push(new THREE.Vector3(worldX(e.p1.x), HEIGHT + 0.06, worldZ(e.p1.y)),
                 new THREE.Vector3(worldX(e.p2.x), HEIGHT + 0.06, worldZ(e.p2.y)));
}
const borderLines = new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints(borderPts),
  new THREE.LineBasicMaterial({ color: 0x10100c, transparent: true, opacity: 0.85 })
);
scene.add(borderLines);

// ---- graph overlay: nodes + edges ----
const graphGroup = new THREE.Group();
const nodeGeom = new THREE.SphereGeometry(0.8, 16, 16);
const nodeById = {};
for (const id of Object.keys(T)) {
  const n = new THREE.Mesh(nodeGeom, new THREE.MeshStandardMaterial({ color: '#f5f0e0', emissive: '#222', roughness: 0.4 }));
  n.position.copy(centers[id]).setY(NODE_Y);
  nodeById[id] = n;
  graphGroup.add(n);
}
const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
const straightPts = [];
for (const id of Object.keys(T)) {
  for (const other of T[id].adjacent) {
    if (id >= other) continue;
    const a = centers[id].clone().setY(NODE_Y), z = centers[other].clone().setY(NODE_Y);
    const d = a.distanceTo(z);
    if (d > span * 0.5) {
      // long sea routes (e.g. Alaska–Kamchatka) arc up over the map so they
      // stay visible and don't slice through other territories.
      const mid = a.clone().add(z).multiplyScalar(0.5);
      mid.y = NODE_Y + d * 0.5;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, z);
      graphGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), edgeMat));
    } else {
      straightPts.push(a, z);
    }
  }
}
const edges = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(straightPts), edgeMat);
graphGroup.add(edges);
scene.add(graphGroup);

// ---- labels as sprites ----
function makeLabel(text) {
  const pad = 8, font = 26;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${font}px sans-serif`;
  const w = ctx.measureText(text).width;
  c.width = w + pad * 2; c.height = font + pad * 2;
  ctx.font = `${font}px sans-serif`;
  ctx.fillStyle = 'rgba(12,34,56,0.78)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#f5f0e0';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  spr.scale.set(c.width / c.height * 2.4, 2.4, 1);
  return spr;
}
const labelGroup = new THREE.Group();
for (const id of Object.keys(T)) {
  const spr = makeLabel(T[id].name);
  spr.position.copy(centers[id]).setY(NODE_Y + 1.0);
  labelGroup.add(spr);
}
scene.add(labelGroup);

// ---- hover highlighting ----
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
let hovered = null;
addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(territoryMeshes, false)[0];
  const id = hit ? hit.object.userData.id : null;
  if (id !== hovered && mode === 'map') {
    if (hovered) territoryMeshes.find(m => m.userData.id === hovered)?.material.color.copy(baseColors[hovered]);
    hovered = id;
    if (id) hit.object.material.color.copy(baseColors[id]).offsetHSL(0, 0, 0.18);
  } else if (mode !== 'map') hovered = id;
  if (id) {
    const t = T[id];
    tooltip.style.opacity = '1';
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = e.clientY + 'px';
    tooltip.textContent = `${t.name} · ${C[t.continent].name} (+${C[t.continent].bonus}) · ${t.adjacent.length} borders`;
  } else {
    tooltip.style.opacity = '0';
  }
});

// ---- legend + toggles ----
const legend = document.getElementById('legend');
for (const [, c] of Object.entries(C)) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<span class="sw" style="background:${c.color}"></span>${c.name} <span style="opacity:.6">+${c.bonus}</span>`;
  legend.appendChild(row);
}
document.getElementById('toggle-graph').addEventListener('change', (e) => graphGroup.visible = e.target.checked);
document.getElementById('toggle-labels').addEventListener('change', (e) => labelGroup.visible = e.target.checked);

// ---- light / dark theme ----
const THEMES = {
  dark:  { bg: '#0c2238', ocean: '#0e2a45', edge: 0xffffff, edgeOpacity: 0.40 },
  light: { bg: '#f1ead7', ocean: '#f6f1e4', edge: 0x2b4a63, edgeOpacity: 0.55 },
};
function applyTheme(name) {
  const t = THEMES[name];
  scene.background.set(t.bg);
  ocean.material.color.set(t.ocean);
  edgeMat.color.setHex(t.edge);
  edgeMat.opacity = t.edgeOpacity;
  document.body.classList.toggle('light', name === 'light');
  themeBtn.textContent = name === 'light' ? '◐ Dark' : '◑ Light';
  themeBtn.dataset.mode = name;
}
const themeBtn = document.getElementById('theme');
themeBtn.addEventListener('click', () => applyTheme(themeBtn.dataset.mode === 'light' ? 'dark' : 'light'));
applyTheme('dark');

// ====================================================================
// Graph-theory lab: lesson modules + 3 visualization styles to compare
// ====================================================================
const meshById = {};
territoryMeshes.forEach((m) => (meshById[m.userData.id] = m));
const NAME = (id) => T[id].name;
const graphToggle = document.getElementById('toggle-graph');
const labelToggle = document.getElementById('toggle-labels');
const HEIGHT_ELEV = 26;          // elevation exaggeration for the "terrain" style
const DIM = new THREE.Color('#39414e');
const NONE = new THREE.Color('#2b3340');

// near (0) = warm/red, far (1) = cool/blue — a clear distance ramp.
const ramp = (n) => new THREE.Color().setHSL((0.0 + 0.62 * n), 0.68, 0.5);

// bright path line, lazily shown.
const pathLine = new THREE.Line(new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.95 }));
pathLine.visible = false;
scene.add(pathLine);

// numbered step badges along the path (rebuilt each render).
const stepGroup = new THREE.Group();
scene.add(stepGroup);
function makeBadge(text) {
  const s = 64, c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 5, 0, Math.PI * 2);
  ctx.fillStyle = '#15202e'; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#ffd24a'; ctx.stroke();
  ctx.fillStyle = '#ffd24a';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, s / 2, s / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  spr.scale.set(1.6, 1.6, 1);
  return spr;
}
function clearSteps() {
  for (const s of stepGroup.children) { s.material.map.dispose(); s.material.dispose(); }
  stepGroup.clear();
}

let mode = 'map';          // 'map' | 'paths'
let vizStyle = 'color';    // 'color' | 'elev' | 'graph'
let metric = null;         // { dist, md, source }
let pathIds = null;        // current highlighted path
let pickState = 'source';  // paths-mode click state
const D = diameter();

function styleVisibility() {
  if (mode === 'map') { borderLines.visible = true; graphGroup.visible = graphToggle.checked; labelGroup.visible = labelToggle.checked; return; }
  borderLines.visible = vizStyle === 'color';
  graphGroup.visible = vizStyle === 'graph';
  labelGroup.visible = labelToggle.checked && vizStyle !== 'elev';
}

function renderMetric() {
  if (!metric) return;
  const { dist, md, source } = metric;
  buildDistLegend(md);
  for (const id of Object.keys(meshById)) {
    const m = meshById[id];
    const norm = dist[id] === Infinity ? null : dist[id] / (md || 1);
    if (vizStyle === 'graph') {
      m.material.color.copy(DIM); m.scale.z = 1;
      const n = nodeById[id];
      n.scale.setScalar(0.7 + (norm ?? 0) * 2.4);
      n.material.color.copy(norm === null ? NONE : ramp(norm));
    } else {
      m.material.color.copy(norm === null ? NONE : ramp(norm));
      m.scale.z = vizStyle === 'elev' ? 1 + (norm ?? 0) * HEIGHT_ELEV : 1;
    }
  }
  if (vizStyle === 'graph') { // emphasise the source node
    nodeById[source].scale.setScalar(3.4);
    nodeById[source].material.color.set('#ffffff');
  }
  // path highlight + numbered step badges
  clearSteps();
  if (pathIds && pathIds.length > 1) {
    const y = (vizStyle === 'elev') ? HEIGHT + HEIGHT_ELEV * HEIGHT + 1.2 : NODE_Y;
    // Recreate the geometry rather than reusing it: THREE's setFromPoints keeps
    // the old (larger) buffer and only overwrites the first N vertices, so a
    // shorter path would trail a stale segment to the previous endpoint.
    pathLine.geometry.dispose();
    pathLine.geometry = new THREE.BufferGeometry().setFromPoints(pathIds.map((id) => centers[id].clone().setY(y)));
    pathLine.visible = true;
    // source is step 0 (the start); each hop's destination is numbered 1..n.
    pathIds.forEach((id, i) => {
      if (i === 0) return;
      const b = makeBadge(String(i));
      b.position.copy(centers[id]).setY(y + 0.7);
      stepGroup.add(b);
    });
  } else pathLine.visible = false;
  styleVisibility();
}

function paintFrom(source) {
  const { dist } = bfs(source);
  metric = { dist, md: maxDist(dist), source };
  renderMetric();
}

function restoreMap() {
  metric = null; pathIds = null; pathLine.visible = false; clearSteps();
  for (const id of Object.keys(meshById)) { meshById[id].material.color.copy(baseColors[id]); meshById[id].scale.z = 1; }
  for (const id of Object.keys(nodeById)) { nodeById[id].scale.setScalar(1); nodeById[id].material.color.set('#f5f0e0'); }
  styleVisibility();
}

// ---- panel UI (built in JS, appended to the HUD) ----
const hud = document.getElementById('hud');
const lab = document.createElement('div');
lab.id = 'lab';
lab.innerHTML = `
  <hr/>
  <div class="seg">
    <button data-mode="map" class="on">Map</button>
    <button data-mode="paths">Paths &amp; distance</button>
  </div>
  <div id="viz" hidden>
    <div class="seg sm">
      <button data-viz="color" class="on">Colour</button>
      <button data-viz="elev">Elevation</button>
      <button data-viz="graph">Graph</button>
    </div>
    <div id="dlegend">
      <div class="dl-cells"></div>
      <div class="dl-cap">hops from source</div>
      <div class="dl-keys">
        <span><i class="dl-sw" id="dl-path"></i>shortest path</span>
        <span><i class="dl-sw none" id="dl-none"></i>unreachable</span>
      </div>
    </div>
    <div id="narr" class="hint"></div>
    <div class="seg sm"><button id="tour">▶ Guided tour</button></div>
  </div>`;
hud.appendChild(lab);

const vizBox = lab.querySelector('#viz');
const narr = lab.querySelector('#narr');
const setNarr = (h) => (narr.innerHTML = h);

// distance legend — discrete cells, one per hop value (0..md), built from the
// same ramp() the map uses so the swatches match the painted territories exactly.
const dlCells = lab.querySelector('.dl-cells');
let dlMd = -1;
function buildDistLegend(md) {
  if (md === dlMd) return;          // only rebuild when the hop range changes
  dlMd = md;
  dlCells.innerHTML = '';
  for (let k = 0; k <= md; k++) {
    const cell = document.createElement('div');
    cell.className = 'dl-cell';
    cell.style.background = '#' + ramp(md ? k / md : 0).getHexString();
    cell.textContent = k;
    dlCells.appendChild(cell);
  }
}
lab.querySelector('#dl-path').style.background = '#ffd24a';
lab.querySelector('#dl-none').style.background = '#' + NONE.getHexString();

function setMode(m) {
  mode = m;
  lab.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  vizBox.hidden = m !== 'paths';
  if (m === 'map') { restoreMap(); }
  else { pickState = 'source'; paintFrom(D.a); pathIds = shortestPath(D.a, D.b); renderMetric();
    setNarr(`World <b>diameter</b>: ${D.d} hops, ${NAME(D.a)} → ${NAME(D.b)} (gold). <br>Click a territory for distances, then another for a path.`); }
}
lab.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

function setViz(v) {
  vizStyle = v;
  lab.querySelectorAll('[data-viz]').forEach((b) => b.classList.toggle('on', b.dataset.viz === v));
  // graph style needs uniform node baseline before re-render
  for (const id of Object.keys(nodeById)) { nodeById[id].scale.setScalar(1); nodeById[id].material.color.set('#f5f0e0'); }
  renderMetric();
}
lab.querySelectorAll('[data-viz]').forEach((b) => b.addEventListener('click', () => setViz(b.dataset.viz)));

// keep toggles working alongside the lab
graphToggle.addEventListener('change', styleVisibility);
labelToggle.addEventListener('change', styleVisibility);

// ---- guided tour ----
const TOUR = [
  { t: `Risk <b>is a graph</b>: 42 territories (nodes), 83 borders (edges). <b>Distance</b> = the fewest borders between two territories.` },
  { t: `Distances from <b>Brazil</b> — colour shows how many hops away each territory is.`, run: () => { paintFrom('brazil'); pathIds = null; } },
  { t: `Same data, three ways — try <b>Colour / Elevation / Graph</b> above. Elevation raises far territories into terrain; Graph sizes the nodes.` },
  { t: () => `The world's <b>diameter</b> (longest shortest path) is <b>${D.d} hops</b>: ${NAME(D.a)} → ${NAME(D.b)}.`, run: () => { paintFrom(D.a); pathIds = shortestPath(D.a, D.b); } },
  { t: `Your turn: click any territory for its distances, then a second for the shortest path between them.` },
];
let tourI = -1;
function tourStep(i) {
  tourI = i;
  const s = TOUR[i];
  if (s.run) s.run();
  renderMetric();
  setNarr(`${typeof s.t === 'function' ? s.t() : s.t}<br><span style="opacity:.7">${i + 1}/${TOUR.length}</span>
    <div class="seg sm" style="margin-top:6px">
      ${i > 0 ? '<button id="tprev">‹ Back</button>' : ''}
      ${i < TOUR.length - 1 ? '<button id="tnext">Next ›</button>' : '<button id="tdone">Done</button>'}
    </div>`);
  narr.querySelector('#tnext')?.addEventListener('click', () => tourStep(i + 1));
  narr.querySelector('#tprev')?.addEventListener('click', () => tourStep(i - 1));
  narr.querySelector('#tdone')?.addEventListener('click', () => setMode('paths'));
}
lab.querySelector('#tour').addEventListener('click', () => tourStep(0));

// ---- click-to-pick (distinguish click from orbit drag) ----
let down = null;
addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
addEventListener('pointerup', (e) => {
  if (!down || mode !== 'paths') return;
  if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; // was a drag
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(territoryMeshes, false)[0];
  if (!hit) return;
  const id = hit.object.userData.id;
  if (pickState === 'source') {
    paintFrom(id); pathIds = null; renderMetric();
    setNarr(`Distances from <b>${NAME(id)}</b>. Now click a <b>second</b> territory for the shortest path.`);
    pickState = 'target';
  } else {
    pathIds = shortestPath(metric.source, id); renderMetric();
    const hops = pathIds ? pathIds.length - 1 : '∞';
    setNarr(`<b>${NAME(metric.source)} → ${NAME(id)}</b>: ${hops} hops${pathIds ? ' (gold path)' : ''}. Click again to start over.`);
    pickState = 'source';
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();
