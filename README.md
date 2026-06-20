# Risk · Hex Map & Graph

Reconstructing the classic **Risk** board as a tiled hexagon map in **three.js**, with a
**graph overlay** (territories = nodes, borders = edges) as the foundation for exploring the
board through graph theory.

![Hex map preview](preview.png)

## The idea

The board's truly important asset is its **adjacency graph**, not the picture. So the project is
split into two layers:

- **Data layer** — canonical, render-agnostic. Drives both the map and all future analysis.
  - [`data/territories.json`](data/territories.json) — the 42 territories, 6 continents (with
    reinforcement bonuses), and the full adjacency list, including the non-geographic sea routes
    (Alaska↔Kamchatka, Brazil↔North Africa, Western Europe↔North Africa, Siam↔Indonesia, …).
  - [`data/mapspec.json`](data/mapspec.json) — the editable source: each territory's **seed** hex
    and **size** (area relative to the smallest, × `base` = 10). Edit this to reshape the map.
  - [`data/hexmap.json`](data/hexmap.json) — **generated** by `tools/gen-map.mjs`: each territory
    as a contiguous cluster of offset hexagons. A weighted-Voronoi fill assigns every land hex to
    its nearest seed, so countries tile cleanly and bordering ones share edges.
- **View layer** — [`src/main.js`](src/main.js) renders the hexes as extruded prisms in three.js,
  coloured by continent, with the graph drawn above the tiles.

Hex math (offset ↔ pixel, centroids, bounds) lives in [`src/hex.js`](src/hex.js) and is shared by
the browser app and the Node preview tool, so the map and the graph never drift apart.

## Run it

```bash
npm install
npm run dev        # three.js app at http://localhost:5173
```

Drag to orbit, scroll to zoom, hover a territory for its continent/bonus/border count. Toggle the
graph overlay and labels from the HUD.

## Tooling

```bash
node tools/gen-map.mjs [R]   # regenerate hexmap.json from mapspec.json (R = ocean reach)
npm run validate             # graph + hex checks (see below); also prints an ASCII map
npm run map-preview          # render the hex map to preview.png (no browser needed)
node tools/check-orientation.mjs   # confirm on-screen N/S/E/W without WebGL
```

Workflow for reshaping: edit `data/mapspec.json` (seeds / sizes) → `node tools/gen-map.mjs` →
`npm run validate` → `npm run map-preview`. `tools/make-mapspec.mjs` regenerates seeds from a
hand-authored coarse map if you ever want to start the seeds over.

`validate` confirms: **42 territories · 83 undirected edges · 6 continents** (NA 9, SA 4, EU 7,
AF 6, AS 12, AU 4), that **every territory is a contiguous hex blob**, and that **every land
border is realised as two touching hexes**. Genuine water crossings (Alaska↔Kamchatka, the
Mediterranean, islands like Britain/Japan/Madagascar) are listed as `SEA_ROUTES` and allowed to
be gaps.

## Status

- [x] Canonical territory + adjacency data
- [x] Hexagon reconstruction of all 42 territories
- [x] Contiguous continents — land borders touch, water crossings stay gaps
- [x] Size-scaled territories (base 10 × relative area) with clear country borders
- [x] three.js map rendering (north-up / east-right), continent colouring, hover
- [x] Graph overlay (nodes + edges)
- [ ] Refine hex shapes to hug the classic outlines more closely (currently organic blobs)
- [ ] Graph-theory analysis: centrality, chokepoints, continent defensibility, cut vertices

## Roadmap toward graph theory

Once the map feels right, the same `territories.json` feeds questions like:
- **Which territories are most important?** — degree / betweenness centrality.
- **Where are the chokepoints?** — cut vertices and bridges (e.g. Central America, the
  Australia/Asia link at Siam).
- **How defensible is a continent?** — count and location of its border territories.
