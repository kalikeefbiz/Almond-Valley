// Grid pathfinding (Dijkstra, 8-way, multi-goal). Small grid, so no heuristic needed.
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

let dist = null, prev = null, heap = null;

export function findPath(n, blocked, road, sx, sz, goal, maxNodes = 5000) {
  const size = n * n;
  if (!dist || dist.length !== size) {
    dist = new Float32Array(size); prev = new Int32Array(size); heap = [];
  }
  dist.fill(Infinity); heap.length = 0;
  const start = sz * n + sx;
  if (goal[start]) return [];
  dist[start] = 0; prev[start] = -1;
  push(start, 0);
  let found = -1, visited = 0;
  while (heap.length) {
    const cur = pop();
    const ci = cur[0];
    if (cur[1] > dist[ci]) continue;
    if (goal[ci]) { found = ci; break; }
    if (++visited > maxNodes) break;
    const cx = ci % n, cz = (ci / n) | 0;
    for (let k = 0; k < 8; k++) {
      const x = cx + DX[k], z = cz + DZ[k];
      if (x < 1 || z < 1 || x >= n - 1 || z >= n - 1) continue;
      const i = z * n + x;
      if (blocked[i] && !goal[i]) continue;
      if (k >= 4 && (blocked[cz * n + x] || blocked[z * n + cx])) continue;
      const step = (road[i] ? 1 : 1.6) * (k >= 4 ? 1.414 : 1);
      const nd = dist[ci] + step;
      if (nd < dist[i]) { dist[i] = nd; prev[i] = ci; push(i, nd); }
    }
  }
  if (found < 0) return null;
  const out = [];
  for (let i = found; i !== start && i >= 0; i = prev[i]) out.push([i % n, (i / n) | 0]);
  out.reverse();
  return out;
}

function push(i, d) {
  heap.push([i, d]);
  let c = heap.length - 1;
  while (c > 0) {
    const p = (c - 1) >> 1;
    if (heap[p][1] <= heap[c][1]) break;
    const t = heap[p]; heap[p] = heap[c]; heap[c] = t; c = p;
  }
}
function pop() {
  const top = heap[0], last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let p = 0;
    for (;;) {
      const l = p * 2 + 1, r = l + 1;
      let m = p;
      if (l < heap.length && heap[l][1] < heap[m][1]) m = l;
      if (r < heap.length && heap[r][1] < heap[m][1]) m = r;
      if (m === p) break;
      const t = heap[p]; heap[p] = heap[m]; heap[m] = t; p = m;
    }
  }
  return top;
}
