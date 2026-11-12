// The Heartwell: Almond Valley's water works, after the approved design sheet.
// Layout (footprint 16 x 16 units, +z is the south entrance):
//   centre  extraction core: drill tower around a glowing aquifer shaft
//   west/east  two power turbines, half-sunk in their own cooling basins
//   north  purification silos on a plinth; steam generators on the north-west / north-east walks
//   ring  reserve pools inside a masonry wall, crossed by four walkways and the south causeway
// Each simulated system is its own mesh, so condition and breakdowns can be shown per component and
// upgrade levels (lv.ext / lv.pur / lv.tur / lv.pool, 1..3) change only the parts they belong to.
import * as THREE from 'three';
import { G, PAL, setSeed } from './models.js';

const R = 7.55, PR = 4.25;            // outer wall radius, platform radius
export const HW_ANCHOR = {             // where each component sits (smoke / sparks when it fails)
  drill: [0, 8, 0], turA: [-5.75, 3.6, 0], turB: [5.75, 3.6, 0], silo: [0, 4.6, -5.75], pump: [3.1, 1.9, 3.1],
};

export function buildHeartwell(lv) {
  const out = {};
  // ------------------------------------------------------------ base: walls, platform, walks, boilers, cisterns
  setSeed(4242);
  let g = new G();
  g.cyl(0, 0, 0, R + 0.05, 0.12, 0x10222a, { seg: 48, flat: true });
  const gap = (a) => { const d = Math.abs(((a + Math.PI * 1.5) % (Math.PI * 2)) - Math.PI); return d > Math.PI - 0.17; };   // south entrance
  g.ring(0, 0, 0, R, 48, 1.03, 1.05, 0.6, PAL.stone, { alt: PAL.stoneD, skip: gap });
  g.ring(0, 1.05, 0, R, 48, 1.03, 0.1, 0.72, PAL.brass, { skip: gap, flat: true });
  g.ring(0, 0, 0, R + 0.32, 12, 0.6, 1.3, 0.55, PAL.stoneD, { off: 0.5 });
  // central platform with hazard edge and railing
  g.cyl(0, 0, 0, PR, 1.25, PAL.stoneD, { seg: 24, layer: 2 });
  g.cyl(0, 1.25, 0, PR - 0.12, 0.1, PAL.alloy, { seg: 24 });
  g.ring(0, 1.35, 0, PR - 0.2, 32, 0.8, 0.05, 0.34, PAL.yellow, { alt: PAL.alloy, flat: true });
  const railGap = (a) => Math.abs(Math.cos(a)) > 0.93 || Math.abs(Math.sin(a)) > 0.93;
  g.ring(0, 1.35, 0, PR - 0.1, 24, 0.07, 0.75, 0.07, PAL.alloy, { skip: railGap, off: 0.5 });
  g.ring(0, 2.05, 0, PR - 0.1, 24, 1.1, 0.07, 0.07, PAL.yellow, { skip: railGap, off: 0.5, flat: true });
  // four diagonal walkways across the reserve ring
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a), mr = (PR + R) / 2;
    g.box(c * mr, 0, s * mr, R - PR, 1.02, 1.0, PAL.stone, { ry: -a }); g.box(c * mr, 1.02, s * mr, R - PR, 0.07, 0.8, PAL.plank, { ry: -a });
  }
  // south causeway and stairs
  g.box(0, 0, (PR + R) / 2 + 0.1, 2.3, 1.05, R - PR + 0.5, PAL.stone); g.box(0, 1.05, (PR + R) / 2, 1.9, 0.06, R - PR, PAL.alloyL);
  for (let i = 0; i < 4; i++) g.box(0, 0, R + 0.35 + i * 0.33, 2.5, 0.84 - i * 0.21, 0.36, PAL.stone);
  for (const s of [-1, 1]) { g.box(s * 1.35, 0, R + 0.45, 0.4, 1.45, 1.5, PAL.stoneD); g.hazard(s * 1.35, 1.45, R + 0.45, 0.4, 0.12, 1.5); g.lamp(s * 1.35, 1.57, R + 0.95, 1.2); }
  // steam generators on the north walks: riveted copper boilers with a furnace door and a stack
  const nb = lv.tur >= 2 ? 2 : 1;
  for (const s of [-1, 1]) {
    const bx = s * 4.25, bz = -4.25;
    g.cyl(bx, 0, bz, 1.5, 1.2, PAL.stoneD, { seg: 10, layer: 2 });
    for (let k = 0; k < nb; k++) {
      const x = bx + (k ? s * 1.0 : -s * 0.15 * (nb - 1)), z = bz + (k ? 0.75 : -0.2), r = k ? 0.6 : 0.92, h = k ? 1.3 : 1.8;
      g.cyl(x, 1.2, z, r, h, PAL.copper, { seg: 12 }); g.sphere(x, 1.2 + h, z, r, PAL.copper, { seg: 12, half: true });
      for (const f of [0.1, 0.55, 0.95]) g.cyl(x, 1.2 + h * f, z, r * 1.04, 0.11, PAL.brass, { seg: 12 });
      g.box(x, 1.45, z + r - 0.02, r * 0.75, 0.55, 0.12, PAL.alloy); g.box(x, 1.52, z + r + 0.05, r * 0.5, 0.36, 0.05, PAL.fire, { glow: 2.4, flat: true });
      g.stack(x - s * 0.1, 1.2 + h + r * 0.75, z - 0.2, (k ? 1.4 : 2.1) + lv.tur * 0.45, k ? 0.19 : 0.27);
    }
    g.pipe(bx - s * 0.9, 2.2, bz + 0.5, s * 2.6, 2.2, -1.9, 0.2, PAL.alloy, { joint: true });
    if (lv.tur >= 3) g.tank(bx + s * 0.2, 1.2, bz - 1.05, 0.42, 1.5, PAL.alloy, true);
  }
  // reserve cisterns on the south walks: they grow with the reserve level
  for (const s of [-1, 1]) {
    const cx = s * 4.3, cz = 4.3, r = 0.62 + 0.12 * lv.pool, h = 0.9 + 0.75 * lv.pool;
    g.cyl(cx, 1.02, cz, r + 0.15, 0.18, PAL.stoneD, { seg: 12, layer: 2 }); g.tank(cx, 1.2, cz, r, h, PAL.alloy, lv.pool >= 2);
    g.box(cx, 1.5, cz + r, 0.16, h * 0.7, 0.08, PAL.cyan, { glow: 1.6, flat: true });
    if (lv.pool >= 3) g.tank(cx + s * 1.1, 1.2, cz + 1.0, 0.5, 1.6, PAL.alloy, true);
  }
  // lanterns on the wall, banners by the gate and on the east and west rims
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.26; if (gap(a)) continue; g.lamp(Math.cos(a) * R, 1.15, Math.sin(a) * R, 1.0); }
  for (const [x, z, ry] of [[-2.3, R + 0.1, 0], [2.3, R + 0.1, 0], [R - 0.1, 3.0, Math.PI / 2], [-R + 0.1, 3.0, Math.PI / 2]]) { g.box(x, 0, z, 0.12, 4.4, 0.12, PAL.alloy); g.banner(x + (ry ? 0 : 0), 2.35, z + (ry ? 0 : 0.12), 0.95, 1.9, ry); g.sphere(x, 4.45, z, 0.12, PAL.brass); }
  out.base = g.done();

  // ------------------------------------------------------------ extraction core
  setSeed(4243); g = new G();
  const th = 10.2 + lv.ext * 1.5;
  g.cyl(0, 1.35, 0, 2.35, 0.5, PAL.alloy, { seg: 8 });
  g.cyl(0, 1.85, 0, 2.05, 1.5, PAL.alloyL, { seg: 8, rt: 1.7 });
  g.ring(0, 3.35, 0, 1.72, 16, 0.7, 0.3, 0.18, PAL.yellow, { alt: PAL.alloy, flat: true });
  g.cyl(0, 3.35, 0, 0.62, th - 6.5, PAL.cyan, { glow: 2.0, seg: 10, flat: true });           // the aquifer shaft
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, b = i * Math.PI / 2;
    g.box(Math.cos(a) * 1.28, 3.35, Math.sin(a) * 1.28, 0.36, th - 6.5, 0.36, PAL.yellow, { ry: -a });
    g.box(Math.cos(b) * 1.12, 3.35, Math.sin(b) * 1.12, 0.16, th - 6.5, 0.16, PAL.alloy, { ry: -b });
  }
  for (let y = 4.5; y < th - 3.6; y += 1.35) g.ring(0, y, 0, 1.3, 8, 1.08, 0.16, 0.2, PAL.alloy, { off: 0.5 });
  // head: armoured machine house
  const hy = th - 3.2;
  g.box(0, hy, 0, 3.2, 1.75, 3.2, PAL.alloy);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.box(Math.cos(a) * 2.18, hy - 0.1, Math.sin(a) * 2.18, 1.15, 2.0, 0.3, PAL.yellow, { ry: -a + Math.PI / 2 }); }
  for (const [dx, dz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
    g.box(dx * 1.62, hy + 0.3, dz * 1.62, 1.5, 1.2, 0.08, PAL.alloyL, { ry });
    g.box(dx * 1.67, hy + 0.05, dz * 1.67, 1.5, 0.16, 0.05, PAL.yellow, { ry, flat: true });
    g._pushEmblem?.();
  }
  g._push(new THREE.PlaneGeometry(1.1, 1.1), 0xffffff, { uv01: true, layer: 8, flat: true, glow: 0.3 }, 0, hy + 0.9, 1.69);   // emblem plate (glow > 0 keeps it rigid)
  g.cyl(0, hy + 1.75, 0, 1.4, 1.2, PAL.yellow, { rt: 0.98, seg: 8 });
  g.cyl(0, hy + 2.95, 0, 0.98, 0.9, PAL.alloy, { rt: 0.62, seg: 8 }); g.cyl(0, hy + 3.8, 0, 0.66, 0.14, PAL.brass, { seg: 8 });
  g.cyl(0, hy + 3.9, 0, 0.09, 2.3, PAL.iron); g.sphere(0, hy + 6.25, 0, 0.17, PAL.glow, { glow: 2.6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.stack(sx * 1.25, hy + 1.75, sz * 1.25, 1.5 + lv.ext * 0.35, 0.2);
  for (const s of [-1, 1]) { g.pipe(s * 1.75, hy, 0.9, s * 2.45, 1.9, 0.9, 0.15, PAL.alloyL); g.pipe(s * 1.75, hy, -0.9, s * 2.45, 1.9, -0.9, 0.15, PAL.alloyL); }
  // feed mains: core to turbines, core to purification
  for (const s of [-1, 1]) { g.pipe(s * 1.7, 2.7, 0, s * 3.35, 2.7, 0, 0.36, PAL.alloy, { joint: true }); g.pipe(s * 3.35, 2.7, 0, s * 3.35, 1.3, 0, 0.36, PAL.alloy); }
  g.pipe(0, 2.5, -1.8, 0, 2.5, -4.75, 0.3, PAL.alloy, { joint: true });
  out.core = g.done();
  // rotating drive crown on top of the head, and the crosshead that rides the shaft
  setSeed(4244); g = new G();
  g.cyl(0, 0, 0, 1.72, 0.26, PAL.alloy, { seg: 14 }); g.ring(0, 0, 0, 1.78, 14, 0.42, 0.26, 0.3, PAL.brass); g.cyl(0, 0.26, 0, 1.5, 0.06, PAL.yellow, { seg: 14 });
  out.crown = g.done(); out.crownY = hy + 1.75;
  g = new G();
  g.cyl(0, 0, 0, 0.86, 0.55, PAL.alloy, { seg: 10 }); g.cyl(0, 0.2, 0, 0.9, 0.14, PAL.yellow, { seg: 10 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.box(Math.cos(a) * 0.98, 0.1, Math.sin(a) * 0.98, 0.3, 0.34, 0.2, PAL.brass, { ry: -a + Math.PI / 2 }); }
  out.shuttle = g.done(); out.shuttleY = [3.7, th - 4.3];

  // ------------------------------------------------------------ turbines (housing per side; the wheel spins separately)
  const turbine = (s) => {
    setSeed(4245 + s); const t = new G(), x0 = s * 5.75, ax = 1.3, WR = 2.15;
    // cooling basin walls
    t.box(x0 - s * 0.1, 0, -1.5, 4.5, 1.1, 0.34, PAL.stoneD); t.box(x0 - s * 0.1, 0, 1.5, 4.5, 1.1, 0.34, PAL.stoneD);
    t.box(x0 - s * 2.2, 0, 0, 0.34, 1.1, 3.0, PAL.stoneD); t.box(x0 + s * 2.05, 0, 0, 0.34, 1.1, 3.0, PAL.stoneD);
    t.box(x0 - s * 0.1, 1.1, -1.5, 4.5, 0.07, 0.42, PAL.brass, { flat: true }); t.box(x0 - s * 0.1, 1.1, 1.5, 4.5, 0.07, 0.42, PAL.brass, { flat: true });
    // cowl over the upper half of the wheel
    const NS = 9;
    for (let i = 0; i < NS; i++) {
      const a = Math.PI * (i + 0.5) / NS, cx = x0 + Math.cos(a) * (WR + 0.32), cy = ax + Math.sin(a) * (WR + 0.32);
      t.box(cx, cy - 0.14, 0, 0.95, 0.28, 1.5, i % 2 ? PAL.alloy : PAL.alloyL, { rz: a + Math.PI / 2 });
      if (i % 2 === 0) for (const z of [-0.78, 0.78]) t.box(cx, cy - 0.2, z, 1.0, 0.4, 0.2, PAL.yellow, { rz: a + Math.PI / 2 });
    }
    for (const z of [-1, 1]) {
      t.box(x0, 0.25, z * 0.98, 1.1, 1.5, 0.5, PAL.alloy); t.cyl(x0, ax, z * 1.28, 0.42, 0.2, PAL.brass, { rx: Math.PI / 2, seg: 10 });
      t.box(x0 - WR - 0.2, 0.9, z * 0.78, 0.5, 0.9, 0.22, PAL.yellow, { rz: 0.25 }); t.box(x0 + WR + 0.2, 0.9, z * 0.78, 0.5, 0.9, 0.22, PAL.yellow, { rz: -0.25 });
    }
    // generator set inboard, level 2 adds a second set and level 3 an exciter coil
    t.box(s * 3.75, 1.35, -1.25, 0.95, 0.95, 0.95, PAL.yellow); t.box(s * 3.75, 1.7, -0.76, 0.5, 0.3, 0.05, PAL.cyan, { glow: 1.8, flat: true }); t.cyl(s * 3.75, 2.3, -1.25, 0.2, 0.5, PAL.alloy);
    if (lv.tur >= 2) { t.box(s * 3.75, 1.35, 1.25, 0.95, 0.95, 0.95, PAL.yellow); t.box(s * 3.75, 1.7, 1.74, 0.5, 0.3, 0.05, PAL.cyan, { glow: 1.8, flat: true }); }
    if (lv.tur >= 3) { t.cyl(x0, ax + WR + 0.55, 0, 0.5, 0.7, PAL.alloy, { seg: 10 }); t.cyl(x0, ax + WR + 0.75, 0, 0.56, 0.24, PAL.cyan, { glow: 1.8, seg: 10, flat: true }); t.cyl(x0, ax + WR + 1.25, 0, 0.3, 0.2, PAL.brass, { seg: 10 }); }
    return t.done();
  };
  out.turA = turbine(-1); out.turB = turbine(1);
  setSeed(4250); g = new G();
  const WR = 2.15;
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; g.box(Math.cos(a) * (WR - 0.14), Math.sin(a) * (WR - 0.14) - 0.14, 0, 0.8, 0.28, 0.9, i % 2 ? PAL.alloy : PAL.alloyL, { rz: a + Math.PI / 2 }); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.box(Math.cos(a) * 1.22, Math.sin(a) * 1.22 - 0.07, 0, 1.55, 0.14, 0.78, i % 2 ? PAL.yellow : PAL.yellowD, { rz: a, rx: 0.35 }); }
  g.cyl(0, 0, 0, 0.6, 1.02, PAL.yellow, { rx: Math.PI / 2, seg: 12 }); g.cyl(0, 0, 0, 1.15, 0.5, PAL.alloy, { rx: Math.PI / 2, seg: 14 });
  for (const z of [-0.53, 0.53]) { g.cyl(0, 0, z, 0.36, 0.06, PAL.cyan, { rx: Math.PI / 2, seg: 10, glow: 2.2, flat: true }); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.box(Math.cos(a) * 1.62, Math.sin(a) * 1.62 - 0.07, z * 0.86, 0.5, 0.14, 0.05, PAL.cyan, { rz: a, glow: 1.6, flat: true }); } }
  out.wheel = g.done(); out.wheelPos = [5.75, 1.3];

  // ------------------------------------------------------------ purification silos
  setSeed(4251); g = new G();
  const n = 2 + lv.pur, sp = 1.26, sz = -5.8;
  g.box(0, 0, sz, n * sp + 0.8, 1.2, 1.9, PAL.stoneD); g.hazard(0, 1.2, sz + 0.9, n * sp + 0.8, 0.1, 0.1);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * sp, h = 3.3 + (i % 2) * 0.5 + (lv.pur - 1) * 0.25, r = 0.54;
    g.cyl(x, 1.2, sz, r, h, PAL.alloy, { seg: 12 }); g.sphere(x, 1.2 + h, sz, r, PAL.alloy, { seg: 12, half: true });
    for (const f of [0.06, 0.5, 0.94]) g.cyl(x, 1.2 + h * f, sz, r * 1.05, 0.12, PAL.brass, { seg: 12 });
    g.cyl(x, 1.2 + h + r * 0.9, sz, 0.14, 0.3, PAL.brass, { seg: 8 });
    for (const a of [Math.PI / 2, Math.PI / 2 - 1.0, Math.PI / 2 + 1.0]) g.box(x + Math.cos(a) * r, 1.6, sz + Math.sin(a) * r, 0.2, h * 0.68, 0.1, PAL.cyan, { glow: 1.9, flat: true, ry: -a + Math.PI / 2 });
    g.pipe(x, 2.1, sz + r, x, 2.1, sz + 1.25, 0.13, PAL.alloyL);
  }
  g.pipe(-(n - 1) / 2 * sp, 2.1, sz + 1.25, (n - 1) / 2 * sp, 2.1, sz + 1.25, 0.2, PAL.alloy);
  g.box(0, 4.3, sz + 0.75, n * sp, 0.07, 0.5, PAL.alloyL); g.box(0, 4.75, sz + 1.0, n * sp, 0.05, 0.05, PAL.yellow, { flat: true });
  for (let i = 0; i <= n; i++) g.box((i - n / 2) * sp, 4.3, sz + 1.0, 0.05, 0.45, 0.05, PAL.alloy);
  for (const s of [-1, 1]) g.box(s * (n * sp / 2 + 0.1), 1.2, sz + 0.75, 0.08, 3.1, 0.3, PAL.alloyL);
  out.silo = g.done();

  // ------------------------------------------------------------ hydraulic pump ring and distribution mains
  setSeed(4252); g = new G();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    g.box(c * 3.3, 1.35, s * 3.3, 0.95, 0.85, 0.75, PAL.yellow, { ry: -a }); g.cyl(c * 3.3, 2.2, s * 3.3, 0.2, 0.55, PAL.alloy); g.cyl(c * 3.3, 2.75, s * 3.3, 0.26, 0.1, PAL.brass);
    g.cyl(c * 2.75, 1.85, s * 2.75, 0.3, 0.06, PAL.brass, { q: null, rx: Math.PI / 2, ry: 0, seg: 10 });
    g.pipe(c * 3.8, 1.55, s * 3.8, c * (R - 0.2), 1.3, s * (R - 0.2), 0.2, PAL.pipe);
    g.box(c * 3.3 + s * 0.38, 1.6, s * 3.3 - c * 0.38, 0.05, 0.3, 0.3, PAL.cyan, { glow: 1.6, flat: true, ry: -a });
  }
  out.pump = g.done();
  out.th = th;
  return out;
}
