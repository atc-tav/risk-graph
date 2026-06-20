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
// pixel (x,y) -> world (x, z); y grows "south", so we negate to keep north up.
const worldX = (x) => x - cx;
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
camera.position.set(0, b.width * 0.6, b.height * 0.75);

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
  const mat = new THREE.MeshStandardMaterial({ color: color.clone(), roughness: 0.85, metalness: 0.0 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;   // lay the extrusion flat (XY shape -> XZ plane)
  mesh.userData.id = id;
  scene.add(mesh);
  territoryMeshes.push(mesh);
}

// ---- graph overlay: nodes + edges ----
const graphGroup = new THREE.Group();
const nodeGeom = new THREE.SphereGeometry(0.42, 16, 16);
const nodeMat = new THREE.MeshStandardMaterial({ color: '#f5f0e0', emissive: '#222', roughness: 0.4 });
for (const id of Object.keys(T)) {
  const n = new THREE.Mesh(nodeGeom, nodeMat);
  n.position.copy(centers[id]).setY(NODE_Y);
  graphGroup.add(n);
}
const edgePts = [];
for (const id of Object.keys(T)) {
  for (const other of T[id].adjacent) {
    if (id >= other) continue;
    edgePts.push(centers[id].clone().setY(NODE_Y), centers[other].clone().setY(NODE_Y));
  }
}
const edges = new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints(edgePts),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
);
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
  spr.scale.set(c.width / c.height * 1.6, 1.6, 1);
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
