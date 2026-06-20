// Graph algorithms over the canonical Risk adjacency (data/territories.json).
// Unweighted, undirected. Foundation for every graph-theory lesson.
import territories from '../data/territories.json';

const T = territories.territories;
export const ids = Object.keys(T);
export const adj = (id) => T[id].adjacent;

// BFS from a source: shortest-hop distance to every territory + predecessor tree.
export function bfs(source) {
  const dist = {}, prev = {};
  ids.forEach((i) => (dist[i] = Infinity));
  dist[source] = 0;
  const q = [source];
  while (q.length) {
    const v = q.shift();
    for (const w of adj(v)) if (dist[w] === Infinity) { dist[w] = dist[v] + 1; prev[w] = v; q.push(w); }
  }
  return { dist, prev };
}

// Shortest path (list of ids, inclusive) between two territories, or null.
export function shortestPath(a, b) {
  const { dist, prev } = bfs(a);
  if (dist[b] === Infinity) return null;
  const path = [b];
  let x = b;
  while (x !== a) { x = prev[x]; path.push(x); }
  return path.reverse();
}

// Largest finite distance in a BFS result.
export function maxDist(dist) {
  let m = 0;
  for (const k in dist) if (dist[k] < Infinity && dist[k] > m) m = dist[k];
  return m;
}

// World diameter: the longest shortest path on the whole board.
export function diameter() {
  let best = { d: -1, a: null, b: null };
  for (const s of ids) {
    const { dist } = bfs(s);
    for (const t of ids) if (dist[t] < Infinity && dist[t] > best.d) best = { d: dist[t], a: s, b: t };
  }
  return best;
}
