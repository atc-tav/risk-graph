import { createCanvas } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
const s = JSON.parse(readFileSync('data/shapes.json','utf8'));
const cv = createCanvas(1020, 660); const ctx = cv.getContext('2d');
ctx.fillStyle = '#0e2a45'; ctx.fillRect(0,0,1020,660);
const cols = ['#e2c044','#d56b5a','#5b7fb0','#9c6b3f','#7fa05b','#9b59b6','#cc8','#8cc','#c8c'];
let k=0;
for (const [id,polys] of Object.entries(s.territories)) {
  ctx.fillStyle = cols[k%cols.length]; ctx.strokeStyle='#000'; ctx.lineWidth=0.6; k++;
  for (const poly of polys){ ctx.beginPath(); poly.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath(); ctx.fill(); ctx.stroke(); }
}
ctx.fillStyle='rgba(0,80,160,0.6)';
for (const poly of s.seas){ ctx.beginPath(); poly.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath(); ctx.fill(); }
writeFileSync('_shapes.png', cv.toBuffer('image/png'));
console.log('wrote _shapes.png');
