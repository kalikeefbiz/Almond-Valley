// Canyon terrain height field. Pure maths (no rendering) so the simulation and the renderer agree on
// which ground is valley floor and which is canyon rock.
import { N, CELL } from './data.js';

export function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The High Noon line runs north-south along RAIL_X (world units), elevated at RAIL_H, from the station
// out of the valley. North of the settlement it tunnels through Noon Butte, a stepped mesa on the canyon floor.
export const RAIL_X = 2.5, RAIL_H = 14;
export const BUTTE = { x: 2.5, z: -158, rx: 30, rz: 17, h: 36 };
export const RAIL_END = -24.5, RAIL_FAR = -300;    // buffer stop just past the station lift; the line runs on past the map edge
export const RAIL_PIERS = []; for (let z = RAIL_END - 4; z > -300; z -= 8) RAIL_PIERS.push(z);
export function inButte(x, z) { return Math.hypot((x - BUTTE.x) / BUTTE.rx, (z - BUTTE.z) / BUTTE.rz) < 1.35; }

function butteH(x, z, n) {
  const dx = (x - BUTTE.x) / BUTTE.rx, dz = (z - BUTTE.z) / BUTTE.rz, d = Math.hypot(dx, dz) + (n - 0.5) * 0.22;
  if (d >= 1.25) return 0;
  const body = BUTTE.h * sstep(1.25, 0.55, d);
  const s = body / 7.5, f = Math.floor(s), fr = s - f;           // stepped strata like the canyon walls
  return (f + sstep(0.35, 0.95, fr)) * 7.5;
}

export function terrainH(x, z) {
  const n = noise(x * 0.035, z * 0.035), n2 = noise(x * 0.09 + 7, z * 0.09 + 3);
  // the canyon runs north to the horizon; the south end closes into a basin
  const north = Math.max(0, -z - 66);
  const dx = Math.abs(x) - (65 + 5 * Math.sin(z * 0.045 + (x > 0 ? 0 : 2)) + 5 * (n - 0.5) - Math.min(26, north * 0.16));
  const dz = z > 0 ? z - (67 + 5 * Math.sin(x * 0.05 + 1) + 5 * (n - 0.5)) : -40;
  const d = dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
  const rise = north > 8 ? Math.min(14, (north - 8) * 0.07) + n2 * Math.min(1.2, north * 0.03) : 0;
  const butte = z < -120 && z > -200 ? butteH(x, z, n) : 0;
  if (d <= -3) return Math.max(rise, butte);
  if (d <= 0) return Math.max(rise, butte, (d + 3) / 3 * 0.5 * n2);
  let base = 46 * sstep(0, 1, d / 28) + (d > 28 ? Math.min(16, (d - 28) * 0.06) + 7 * (n - 0.5) : 0) + 0.5;
  const s = base / 8, f = Math.floor(s), fr = s - f;
  return Math.max(rise, butte, (f + sstep(0.3, 0.95, fr)) * 8 + n2 * 1.6);
}

// Grid cells holding a railway pier (two per bent).
export const PIER_CELLS = (() => {
  const set = new Set(), c = (w) => Math.floor(w / CELL + N / 2);
  for (const z of RAIL_PIERS) { const cz = c(z); if (cz < 0) break; for (const x of [RAIL_X - 2.35, RAIL_X + 2.35]) set.add(cz * N + c(x)); }
  return set;
})();

// Cells whose ground rises into the canyon wall can never be built on.
export const CANYON = (() => {
  const m = new Uint8Array(N * N), w = (c) => (c - N / 2) * CELL;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    let hi = 0;
    for (const [u, v] of [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) hi = Math.max(hi, terrainH(w(x + u), w(z + v)));
    if (hi > 0.35 || x < 1 || z < 1 || x >= N - 1 || z >= N - 1) m[z * N + x] = 1;
  }
  return m;
})();
