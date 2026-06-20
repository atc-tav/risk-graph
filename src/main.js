import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import territories from '../data/territories.json';
import hexmap from '../data/hexmap.json';
import { hexCorners, clusterCentroid, hexesBounds } from './hex.js';

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
scene.add(new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints(borderPts),
  new THREE.LineBasicMaterial({ color: 0x10100c, transparent: true, opacity: 0.85 })
));

// ---- graph overlay: nodes + edges ----
const graphGroup = new THREE.Group();
const nodeGeom = new THREE.SphereGeometry(0.8, 16, 16);
const nodeMat = new THREE.MeshStandardMaterial({ color: '#f5f0e0', emissive: '#222', roughness: 0.4 });
for (const id of Object.keys(T)) {
  const n = new THREE.Mesh(nodeGeom, nodeMat);
  n.position.copy(centers[id]).setY(NODE_Y);
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
  if (id !== hovered) {
    if (hovered) territoryMeshes.find(m => m.userData.id === hovered)?.material.color.copy(baseColors[hovered]);
    hovered = id;
    if (id) hit.object.material.color.copy(baseColors[id]).offsetHSL(0, 0, 0.18);
  }
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
