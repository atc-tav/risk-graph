// Pointy-top hex geometry with odd-r offset coordinates.
// Shared by the three.js app and the Node preview renderer.

// Convert an offset hex [col, row] to a 2D center point (y grows downward).
export function hexToPixel(col, row, size) {
  const w = Math.sqrt(3) * size;          // hex width  (flat-to-flat horizontally)
  const x = w * (col + 0.5 * (row & 1));  // odd rows shift half a hex east
  const y = 1.5 * size * row;             // vertical spacing is 3/4 of hex height
  return { x, y };
}

// The six corners of a pointy-top hex, going around the center.
export function hexCorners(col, row, size) {
  const { x, y } = hexToPixel(col, row, size);
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ x: x + size * Math.cos(angle), y: y + size * Math.sin(angle) });
  }
  return corners;
}

// Centroid (in pixel space) of a set of offset hexes — used for labels / graph nodes.
export function clusterCentroid(hexes, size) {
  let sx = 0, sy = 0;
  for (const [col, row] of hexes) {
    const { x, y } = hexToPixel(col, row, size);
    sx += x; sy += y;
  }
  return { x: sx / hexes.length, y: sy / hexes.length };
}

// Bounding box over many hexes, padded by one hex, for sizing a viewport.
export function hexesBounds(allHexes, size) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [col, row] of allHexes) {
    for (const c of hexCorners(col, row, size)) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x > maxX) maxX = c.x;
      if (c.y > maxY) maxY = c.y;
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
