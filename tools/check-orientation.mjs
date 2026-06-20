// Projects known territories through the app camera to confirm on-screen
// orientation (no WebGL needed — pure matrix math from three core).
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hexToPixel, clusterCentroid, hexesBounds } from '../src/hex.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const H = JSON.parse(readFileSync(join(root, 'data/hexmap.json'), 'utf8')).territories;

const SIZE = 1;
const all = Object.values(H).flat();
const b = hexesBounds(all, SIZE);
const cx = b.minX + b.width / 2, cy = b.minY + b.height / 2;
const world = (id) => {
  const c = clusterCentroid(H[id], SIZE);
  return new THREE.Vector3(-(c.x - cx), 0, -(c.y - cy)); // worldX east+ (negated), worldZ north+
};

const span = Math.max(b.width, b.height);
const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2000);
cam.position.set(0, span * 0.78, -span * 0.72);   // <- camera under test
cam.lookAt(0, 0, 0);
cam.updateMatrixWorld(true);

const probe = { 'Alaska (W)': 'alaska', 'Kamchatka (E)': 'kamchatka', 'Greenland (N)': 'greenland', 'Argentina (S)': 'argentina' };
for (const [label, id] of Object.entries(probe)) {
  const ndc = world(id).clone().project(cam);
  console.log(`${label.padEnd(14)} screen-x=${ndc.x.toFixed(2).padStart(6)} (${ndc.x < 0 ? 'LEFT' : 'RIGHT'})  screen-y=${ndc.y.toFixed(2).padStart(6)} (${ndc.y < 0 ? 'BOTTOM' : 'TOP'})`);
}
console.log('\nWant: Alaska LEFT, Kamchatka RIGHT, Greenland TOP, Argentina BOTTOM');
