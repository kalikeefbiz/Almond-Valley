// Procedural low-poly models. Every building is one merged mesh with vertex colours
// and a per-vertex "glow" channel (lit windows, aether tubes) driven by the night uniform.
import * as THREE from 'three';
import { B, CELL } from './data.js';
import { makeMaterial, glowUniform } from './surface.js';
export { makeMaterial, glowUniform };

export const PAL = {
  timber: 0x8f5d38, timberD: 0x5c3a24, plank: 0xa87748, roof: 0x7a4a36, roofD: 0x553a32, tin: 0x8b8580,
  stone: 0x9a8f80, stoneD: 0x736a5e, alloy: 0x2e2e33, alloyL: 0x4a4b52, yellow: 0xd69a22, yellowD: 0xa87414,
  glow: 0xffc266, cyan: 0x62e8ff, red: 0xa93e33, tan: 0xd9b98b, white: 0xe9e2d2, dirt: 0xa8744a,
  green: 0x6f8a3c, greenD: 0x4c6a2e, water: 0x45c8e8, iron: 0x6a707a, rust: 0x9a4f2c, neon: 0xd060ff, pink: 0xff5fa8,
  brass: 0xb58a3e, copper: 0xa8623a, pipe: 0x3a7fa8, fire: 0xff8a3a,
};
// which detail layer a colour gets unless a primitive says otherwise
const LAYER_OF = new Map([
  [PAL.timber, 1], [PAL.timberD, 1], [PAL.plank, 1],
  [PAL.stone, 2], [PAL.stoneD, 2],
  [PAL.roof, 3], [PAL.roofD, 3], [PAL.tin, 3], [PAL.rust, 3],
  [PAL.alloy, 4], [PAL.alloyL, 4], [PAL.iron, 4], [PAL.yellow, 4], [PAL.yellowD, 4], [PAL.brass, 4], [PAL.copper, 4], [PAL.pipe, 4],
  [PAL.tan, 7], [PAL.red, 7], [PAL.dirt, 5],
]);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
export const setSeed = (s) => { seed = s; };

// Mesh builder: merges primitives into one geometry with vertex colour, glow, detail layer and box-projected UVs.
export class G {
  constructor() { this.p = []; this.n = []; this.c = []; this.g = []; this.l = []; this.uv = []; this.smoke = []; this.lamps = []; }
  _push(geo, color, o, x, y, z) {
    const ng = geo.index ? geo.toNonIndexed() : geo;
    const P = ng.attributes.position.array, Nn = ng.attributes.normal.array, T = ng.attributes.uv ? ng.attributes.uv.array : null;
    const layer = o.layer ?? LAYER_OF.get(color) ?? 0;
    // UVs from the primitive's own box projection (before it is rotated into place), 2 world units per tile
    ng.computeBoundingBox(); const bb = ng.boundingBox, sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
    const swap = o.swap ?? ((layer === 1 || layer === 3) && sy < Math.max(sx, sz) * 0.45);
    const ou = rnd(), ov = rnd(), sc = o.uvs || 0.5;
    for (let i = 0, k = 0; i < P.length; i += 3, k += 2) {
      if (o.uv01 && T) { this.uv.push(T[k], T[k + 1]); continue; }
      const ax = Math.abs(Nn[i]), ay = Math.abs(Nn[i + 1]), az = Math.abs(Nn[i + 2]);
      let u, v;
      if (ay >= ax && ay >= az) { u = P[i]; v = P[i + 2]; } else if (ax >= az) { u = P[i + 2]; v = P[i + 1]; } else { u = P[i]; v = P[i + 1]; }
      if (swap) { const t = u; u = v; v = t; }
      this.uv.push(u * sc + ou, v * sc + ov);
    }
    if (o.q) _q.copy(o.q); else { _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e); }
    _m.compose(_p.set(x, y, z), _q, _s);
    ng.applyMatrix4(_m);
    _c.set(color); const j = o.flat ? 1 : 0.9 + rnd() * 0.2; const gl = o.glow || 0;
    for (let i = 0; i < P.length; i += 3) {
      this.p.push(P[i], P[i + 1], P[i + 2]); this.n.push(Nn[i], Nn[i + 1], Nn[i + 2]);
      this.c.push(_c.r * j, _c.g * j, _c.b * j); this.g.push(gl); this.l.push(layer);
    }
    ng.dispose(); if (ng !== geo) geo.dispose();
    return this;
  }
  box(x, y, z, w, h, d, color, o = {}) { return this._push(new THREE.BoxGeometry(w, h, d), color, o, x, y + h / 2, z); }
  cyl(x, y, z, r, h, color, o = {}) {
    const horiz = o.rx || o.rz || o.q;
    return this._push(new THREE.CylinderGeometry(o.rt ?? r, r, h, o.seg || 10, 1, false, o.a0 || 0, o.arc || Math.PI * 2), color, o, x, horiz ? y : y + h / 2, z);
  }
  cone(x, y, z, r, h, color, o = {}) { return this._push(new THREE.ConeGeometry(r, h, o.seg || 8), color, o, x, y + h / 2, z); }
  sphere(x, y, z, r, color, o = {}) { return this._push(new THREE.SphereGeometry(r, o.seg || 8, 6, 0, Math.PI * 2, 0, o.half ? Math.PI / 2 : Math.PI), color, o, x, y, z); }
  // gable roof, ridge along x (or z with o.z)
  gable(x, y, z, w, h, d, color, o = {}) {
    const hw = w / 2, hd = d / 2;
    const v = [
      -hw, 0, hd, hw, 0, hd, hw, h, 0, -hw, 0, hd, hw, h, 0, -hw, h, 0,
      hw, 0, -hd, -hw, 0, -hd, -hw, h, 0, hw, 0, -hd, -hw, h, 0, hw, h, 0,
      -hw, 0, -hd, -hw, 0, hd, -hw, h, 0, hw, 0, hd, hw, 0, -hd, hw, h, 0,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    const ry = (o.ry || 0) + (o.z ? Math.PI / 2 : 0);
    this._push(geo, color, { ...o, ry, swap: false }, x, y, z);
    // ridge cap and eave boards give the roof an edge
    if (!o.bare) { this.box(x, y + h - 0.03, z, o.z ? 0.2 : w + 0.06, 0.1, o.z ? w + 0.06 : 0.2, PAL.roofD, { layer: 4 }); for (const s of [-1, 1]) this.box(x + (o.z ? s * hd : 0), y - 0.05, z + (o.z ? 0 : s * hd), o.z ? 0.1 : w, 0.1, o.z ? w : 0.1, PAL.timberD); }
    return this;
  }
  // framed, lit window on a wall facing +z (or rotated with ry)
  window(x, y, z, w = 0.5, h = 0.55, o = {}) {
    const ry = o.ry || 0, c = Math.cos(ry), s = Math.sin(ry), at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
    let [px, pz] = at(0, 0); this.box(px, y - h / 2, pz, w, h, 0.05, PAL.glow, { glow: o.glow ?? 1, flat: true, ry });
    [px, pz] = at(0, 0.02); this.box(px, y - h / 2, pz, 0.05, h, 0.05, PAL.timberD, { ry }); this.box(px, y - 0.025, pz, w, 0.05, 0.05, PAL.timberD, { ry });
    for (const sx of [-1, 1]) { [px, pz] = at(sx * (w / 2 + 0.035), 0.02); this.box(px, y - h / 2 - 0.04, pz, 0.07, h + 0.08, 0.07, PAL.timberD, { ry }); }
    [px, pz] = at(0, 0.03); this.box(px, y + h / 2, pz, w + 0.16, 0.07, 0.08, PAL.timberD, { ry }); this.box(px, y - h / 2 - 0.08, pz, w + 0.22, 0.07, 0.14, PAL.timberD, { ry });
    if (o.shutters) for (const sx of [-1, 1]) { [px, pz] = at(sx * (w / 2 + 0.2), 0.02); this.box(px, y - h / 2, pz, 0.24, h, 0.04, o.shutters, { ry }); }
    return this;
  }
  door(x, y, z, w = 0.55, h = 1.05, color = PAL.timberD) {
    this.box(x, y, z, w, h, 0.06, color); this.box(x, y + h, z + 0.01, w + 0.18, 0.09, 0.09, PAL.timberD);
    for (const sx of [-1, 1]) this.box(x + sx * (w / 2 + 0.05), y, z + 0.01, 0.09, h, 0.09, PAL.timberD);
    this.box(x + w * 0.3, y + h * 0.48, z + 0.04, 0.06, 0.06, 0.05, PAL.brass); this.box(x, y, z + 0.22, w + 0.3, 0.1, 0.4, PAL.stoneD);
    return this;
  }
  // timber shed: stone footing, framed walls, gable roof, lit windows and a door on the front (+z)
  shed(x, z, w, d, h, wall, roof, o = {}) {
    const y = o.y || 0;
    this.box(x, y, z, w + 0.14, 0.3, d + 0.14, PAL.stoneD);
    this.box(x, y + 0.3, z, w, h - 0.3, d, wall);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(x + sx * w / 2, y, z + sz * d / 2, 0.16, h, 0.16, PAL.timberD);
    this.box(x, y + h - 0.12, z, w + 0.12, 0.12, d + 0.12, PAL.timberD);
    const along = o.ridgeZ ? d : w, across = o.ridgeZ ? w : d;
    this.gable(x, y + h, z, along + 0.5, o.roofH ?? Math.min(1.35, across * 0.4), across + 0.6, roof, { z: o.ridgeZ });
    const nWin = o.win ?? Math.max(1, Math.round(w / 1.4));
    for (let i = 0; i < nWin; i++) this.window(x - w / 2 + (i + 0.5) * (w / nWin), y + h * 0.62, z + d / 2 + 0.02, 0.46, 0.5);
    if (o.door !== false) this.door(x + (nWin % 2 ? w * 0.28 : 0), y, z + d / 2 + 0.03, 0.5, Math.min(1.05, h * 0.62));
    return this;
  }
  chimney(x, y, z, h, color = PAL.stoneD, r = 0.22) { this.box(x, y, z, r * 2, h, r * 2, color); this.box(x, y + h, z, r * 2 + 0.12, 0.1, r * 2 + 0.12, PAL.stone); this.smoke.push([x, y + h + 0.3, z]); return this; }
  stack(x, y, z, h, r = 0.3, color = PAL.alloy) { this.cyl(x, y, z, r, h, color, { rt: r * 0.78 }); this.cyl(x, y + h - 0.3, z, r * 0.95, 0.16, PAL.brass); this.cyl(x, y + h * 0.45, z, r * 0.98, 0.12, PAL.yellow); this.cyl(x, y + h, z, r * 0.95, 0.12, color, { rt: r * 0.95 }); this.smoke.push([x, y + h + 0.3, z]); return this; }
  crates(x, z, n = 3) { for (let i = 0; i < n; i++) { const cx = x + (i % 2) * 0.55, cy = Math.floor(i / 2) * 0.5, cz = z + ((i * 7) % 3) * 0.2; this.box(cx, cy, cz, 0.5, 0.5, 0.5, i % 2 ? PAL.plank : PAL.timber, { ry: i * 0.4 }); this.box(cx, cy + 0.2, cz, 0.54, 0.08, 0.54, PAL.timberD, { ry: i * 0.4 }); } return this; }
  barrel(x, y, z, r = 0.24, h = 0.62, color = PAL.timber) { this.cyl(x, y, z, r, h, color, { seg: 9 }); for (const f of [0.2, 0.75]) this.cyl(x, y + h * f, z, r * 1.05, 0.05, PAL.iron, { seg: 9 }); return this; }
  hazard(x, y, z, w, h, d) { const n = Math.max(2, Math.round(w / 0.4)); for (let i = 0; i < n; i++) this.box(x - w / 2 + (i + 0.5) * w / n, y, z, w / n, h, d, i % 2 ? PAL.yellow : PAL.alloy, { flat: true }); return this; }
  canopy(x, y, z, w, d, color, post = PAL.timberD) {
    this.box(x, y, z, w, 0.08, d, color, { rx: 0.12 }); this.box(x, y - 0.14, z + d / 2, w, 0.16, 0.03, color, { rx: 0.12 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(x + sx * (w / 2 - 0.1), 0, z + sz * (d / 2 - 0.1), 0.1, y, 0.1, post);
    return this;
  }
  tank(x, y, z, r, h, color = PAL.alloy, glow = false) {
    this.cyl(x, y, z, r, h, color, { seg: 12 }); this.sphere(x, y + h, z, r, color, { seg: 12, half: true });
    for (const f of [0.12, 0.88]) this.cyl(x, y + h * f, z, r * 1.04, 0.1, PAL.brass, { seg: 12 });
    this.cyl(x, y + h + r * 0.92, z, r * 0.25, 0.2, PAL.brass, { seg: 8 });
    if (glow) for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.6; this.box(x + Math.cos(a) * r, y + h * 0.2, z + Math.sin(a) * r, 0.16, h * 0.6, 0.12, PAL.cyan, { glow: 1.7, flat: true, ry: -a + Math.PI / 2 }); }
    return this;
  }
  // n boxes around a circle (walls, rails, collars); alt gives every other box a second colour
  ring(x, y, z, r, n, w, h, d, color, o = {}) {
    for (let i = 0; i < n; i++) { const a = (i + (o.off || 0)) / n * Math.PI * 2; if (o.skip && o.skip(a)) continue; this.box(x + Math.cos(a) * r, y, z + Math.sin(a) * r, w, h, d, o.alt != null && i % 2 ? o.alt : color, { ry: -a + Math.PI / 2, flat: o.flat, glow: o.glow }); }
    return this;
  }
  // pipe between two points with flanges at both ends
  pipe(x1, y1, z1, x2, y2, z2, r, color = PAL.alloy, o = {}) {
    _dir.set(x2 - x1, y2 - y1, z2 - z1); const len = _dir.length(); _dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(_up, _dir), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, mz = (z1 + z2) / 2;
    this._push(new THREE.CylinderGeometry(r, r, len, o.seg || 8), color, { q }, mx, my, mz);
    if (!o.bare) for (const t of [0.04, 0.96]) this._push(new THREE.CylinderGeometry(r * 1.35, r * 1.35, Math.min(0.14, len * 0.08), o.seg || 8), o.flange ?? PAL.brass, { q }, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t);
    if (o.joint) this.sphere(x2, y2, z2, r * 1.15, color, { seg: 8 });
    return this;
  }
  // lantern on a post; registers a light point for the night halos and ground pools
  lamp(x, y, z, h = 1.5, o = {}) {
    this.box(x, y, z, 0.09, h, 0.09, PAL.alloy); this.box(x, y, z, 0.2, 0.14, 0.2, PAL.alloy);
    this.box(x, y + h, z, 0.3, 0.05, 0.3, PAL.alloy); this.box(x, y + h + 0.05, z, 0.2, 0.24, 0.2, o.color ?? PAL.glow, { glow: 2.6, flat: true }); this.box(x, y + h + 0.29, z, 0.32, 0.06, 0.32, PAL.brass);
    this.lamps.push([x, y + h + 0.17, z, o.power ?? 1]);
    return this;
  }
  // hanging banner with the valley emblem (waves in the vertex shader)
  banner(x, y, z, w, h, ry = 0) {
    for (const r of [ry, ry + Math.PI]) this._push(new THREE.PlaneGeometry(w, h), 0xffffff, { uv01: true, layer: 8, ry: r, flat: true }, x, y + h / 2, z);
    this.box(x, y + h, z, w + 0.2, 0.07, 0.07, PAL.brass, { ry });
    return this;
  }
  done() {
    // grime: surfaces darken toward the ground, which seats every building in the dirt
    const P = this.p, C = this.c, Gl = this.g;
    for (let i = 0, k = 0; i < P.length; i += 3, k++) { if (Gl[k] > 0) continue; const y = P[i + 1], f = 0.74 + 0.26 * Math.min(1, Math.max(0, y) / 1.1); C[i] *= f; C[i + 1] *= f * 0.99; C[i + 2] *= f * 0.97; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    geo.setAttribute('glow', new THREE.Float32BufferAttribute(this.g, 1));
    geo.setAttribute('layer', new THREE.Float32BufferAttribute(this.l, 1));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    geo.userData.smoke = this.smoke; geo.userData.lamps = this.lamps;
    return geo;
  }
}

// ------------------------------------------------------------------ buildings
const M = {
  // Tier I: a patched plank lean-to under a tin sheet. No chimney, no glass.
  frontier(g) {
    g.box(0, 0, -0.25, 3.0, 0.16, 2.5, PAL.stoneD);
    g.box(0, 0.16, -0.25, 2.9, 1.35, 2.4, PAL.plank);
    g.box(-1.0, 0.16, -0.25, 0.9, 1.35, 2.44, PAL.timberD); g.box(0.9, 0.9, 0.97, 0.9, 0.6, 0.05, PAL.tin, { swap: false });
    g.box(0, 1.62, -0.25, 3.3, 0.1, 2.9, PAL.tin, { rx: 0.2, swap: false }); g.box(0.7, 1.72, -0.5, 1.2, 0.06, 1.2, PAL.rust, { rx: 0.2, ry: 0.2, swap: false }); g.box(-0.9, 1.68, 0.2, 0.9, 0.08, 0.3, PAL.stoneD, { rx: 0.2 });
    g.box(0, 1.25, 1.55, 2.7, 0.06, 1.3, PAL.tan, { rx: 0.32 });
    for (const sx of [-1.25, 1.25]) g.box(sx, 0, 2.05, 0.1, 1.05, 0.1, PAL.timberD);
    g.box(-0.55, 0.62, 0.97, 0.42, 0.4, 0.05, PAL.glow, { glow: 0.75, flat: true }); g.box(-0.55, 0.56, 0.99, 0.5, 0.06, 0.06, PAL.timberD);
    g.box(0.35, 0.16, 0.97, 0.5, 1.0, 0.05, PAL.timberD);
    g.crates(1.05, 1.45, 2); g.barrel(-1.25, 0, 1.45);
  },
  // Tier II: a framed timber cabin with a porch and a stone chimney.
  settler(g) {
    g.shed(0, -0.2, 3.2, 2.6, 1.8, PAL.timber, PAL.roof, { win: 2 });
    g.box(0, 0, 1.55, 3.3, 0.2, 0.95, PAL.plank); g.box(0, 1.7, 1.6, 3.5, 0.08, 1.15, PAL.roofD, { rx: 0.22, swap: false });
    for (const sx of [-1.5, 0, 1.5]) g.box(sx, 0.2, 1.95, 0.12, 1.4, 0.12, PAL.timberD);
    g.box(0, 0.75, 1.97, 3.1, 0.07, 0.07, PAL.timberD);
    g.chimney(1.0, 1.8, -0.7, 1.7, PAL.stoneD, 0.26);
    g.barrel(-1.35, 0.2, 1.6); for (let i = 0; i < 4; i++) g.cyl(1.75 + (i % 2) * 0.02, 0.14 + Math.floor(i / 2) * 0.24, -0.6 + (i % 2) * 0.26, 0.12, 0.9, PAL.timber, { rx: Math.PI / 2, seg: 6 });
  },
  // Tier III: stone ground floor, timber above, a heavy insulated roof, shutters and a water tank.
  insulated(g) {
    g.box(0, 0, -0.15, 3.5, 1.15, 2.9, PAL.stone);
    g.box(0, 1.15, -0.15, 3.36, 1.05, 2.76, PAL.timber);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 1.7, 0, -0.15 + sz * 1.4, 0.2, 2.2, 0.2, PAL.timberD);
    g.box(0, 1.08, -0.15, 3.56, 0.14, 2.96, PAL.timberD);
    g.box(0, 2.2, -0.15, 3.9, 0.2, 3.3, PAL.tan);
    g.gable(0, 2.4, -0.15, 4.0, 1.3, 3.5, PAL.roofD);
    for (const wx of [-1.05, 0.1, 1.1]) g.window(wx, 1.95, 1.25, 0.44, 0.5, { shutters: PAL.red });
    g.window(0.85, 0.85, 1.32, 0.44, 0.48); g.door(-0.9, 0, 1.33, 0.56, 1.0);
    g.box(-0.9, 1.2, 1.6, 1.3, 0.07, 0.6, PAL.roofD, { rx: 0.25, swap: false });
    g.chimney(1.15, 2.4, -0.75, 1.9, PAL.stoneD, 0.3); g.box(1.15, 4.4, -0.75, 0.5, 0.08, 0.5, PAL.brass);
    g.tank(-2.0, 0.35, -0.6, 0.36, 1.1, PAL.copper); g.box(-2.0, 0, -0.6, 0.8, 0.35, 0.8, PAL.stoneD); g.pipe(-2.0, 1.2, -0.3, -1.75, 1.2, 0.2, 0.07, PAL.pipe);
    g.lamp(-1.75, 0, 1.75, 1.5);
  },
  // Tier IV: two storeys, alloy cladding, a roof radiator and an aether cooling plant glowing at its side.
  climate(g) {
    g.box(0, 0, -0.15, 3.5, 1.25, 2.9, PAL.stone);
    g.box(0, 1.25, -0.15, 3.36, 1.95, 2.76, PAL.timber);
    g.box(0, 1.25, -0.15, 3.42, 0.5, 2.82, PAL.alloyL); g.box(0, 2.95, -0.15, 3.42, 0.25, 2.82, PAL.alloyL);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 1.7, 0, -0.15 + sz * 1.4, 0.2, 3.2, 0.2, PAL.alloy);
    g.gable(0, 3.2, -0.15, 4.0, 1.15, 3.5, PAL.roofD);
    g.box(0.4, 3.75, -0.15, 1.6, 0.5, 1.0, PAL.alloy); for (let i = 0; i < 5; i++) g.box(-0.2 + i * 0.3, 4.25, -0.15, 0.06, 0.3, 0.9, PAL.yellow);
    for (const wx of [-1.05, 0.05, 1.1]) g.window(wx, 2.6, 1.25, 0.46, 0.55, { glow: 1.15 });
    g.window(0.95, 0.9, 1.32, 0.46, 0.5, { glow: 1.15 }); g.door(-0.9, 0, 1.33, 0.56, 1.05, PAL.alloy);
    g.box(0, 1.3, 1.6, 3.4, 0.1, 0.7, PAL.timberD); g.box(0, 1.75, 1.93, 3.4, 0.06, 0.06, PAL.brass); for (let i = 0; i < 6; i++) g.box(-1.65 + i * 0.66, 1.4, 1.93, 0.06, 0.38, 0.06, PAL.alloy);
    for (const sx of [-1.62, 1.62]) g.box(sx, 0, 1.9, 0.1, 1.3, 0.1, PAL.alloy);
    g.tank(-2.05, 0.3, -0.9, 0.42, 2.0, PAL.alloy, true); g.box(-2.05, 0, -0.9, 0.95, 0.3, 0.95, PAL.stoneD);
    g.box(2.0, 0.15, -0.3, 0.55, 1.0, 1.1, PAL.alloyL); g.box(2.29, 0.5, -0.3, 0.05, 0.4, 0.8, PAL.cyan, { glow: 1.7, flat: true }); g.pipe(2.0, 1.15, -0.3, 2.0, 3.0, -0.3, 0.09, PAL.brass);
    g.banner(1.72, 1.9, 1.34, 0.5, 0.95);
    g.chimney(-1.1, 3.2, -0.8, 1.5, PAL.alloy, 0.2); g.lamp(-1.75, 0, 1.9, 1.5, { color: PAL.cyan });
  },
  hunter(g) {
    g.shed(-0.3, -0.3, 2.6, 2.2, 1.6, PAL.timber, PAL.roof, { win: 1 });
    for (const x of [1.3, 1.9]) g.box(x, 0, 1.1, 0.1, 1.4, 0.1, PAL.timberD);
    g.box(1.6, 1.35, 1.1, 0.8, 0.08, 0.08, PAL.timberD);
    for (const x of [1.4, 1.6, 1.8]) g.box(x, 0.7, 1.1, 0.14, 0.6, 0.06, PAL.red);
    g.canopy(1.5, 1.5, -0.6, 1.2, 1.6, PAL.tan);
    g.chimney(-1.0, 1.6, -0.7, 1.2);
  },
  farm(g) {
    for (let i = 0; i < 5; i++) { g.box(-0.9 + (i - 2) * 0, 0, -2.2 + i * 0.95, 3.6, 0.16, 0.5, 0x5a3d28); g.box(-0.9, 0.16, -2.2 + i * 0.95, 3.5, 0.22, 0.3, i % 2 ? PAL.green : PAL.greenD); }
    g.shed(1.9, 1.7, 1.6, 1.6, 1.3, PAL.plank, PAL.roof, { win: 1 });
    g.tank(2.1, 0.9, -1.6, 0.5, 0.7, PAL.timberD); for (const a of [0, 1, 2, 3]) g.box(2.1 + Math.cos(a * 1.57 + 0.78) * 0.4, 0, -1.6 + Math.sin(a * 1.57 + 0.78) * 0.4, 0.08, 0.95, 0.08, PAL.timberD);
    for (let i = 0; i < 7; i++) { g.box(-2.85, 0, -2.6 + i * 0.85, 0.08, 0.5, 0.08, PAL.timberD); g.box(-2.85 + i * 0.85, 0, -2.85, 0.08, 0.5, 0.08, PAL.timberD); }
  },
  smokehouse(g) {
    g.shed(-0.6, 0, 3.2, 2.6, 1.9, PAL.timberD, PAL.roofD, { win: 2 });
    g.chimney(-1.5, 1.9, -0.3, 2.0, PAL.stoneD, 0.28); g.chimney(0.2, 1.9, -0.3, 1.6, PAL.stoneD, 0.24);
    g.canopy(2.1, 1.5, 0.2, 1.4, 2.2, PAL.tan);
    for (const z of [-0.4, 0.2, 0.8]) g.box(2.1, 0.8, z, 0.9, 0.5, 0.08, PAL.red);
  },
  lumber(g) {
    g.canopy(-0.6, 1.9, -0.5, 2.4, 2.2, PAL.roof);
    g.box(-0.6, 0, -0.5, 1.6, 0.6, 0.5, PAL.alloyL); g.cyl(-0.6, 0.95, -0.5, 0.45, 0.06, PAL.tin, { rx: Math.PI / 2, seg: 12 });
    for (let i = 0; i < 5; i++) g.cyl(1.3, 0.22 + Math.floor(i / 3) * 0.4, 0.6 + (i % 3) * 0.45 - (i > 2 ? -0.22 : 0), 0.21, 2.0, i % 2 ? PAL.timber : PAL.plank, { rx: 0, rz: Math.PI / 2, seg: 7 });
    g.box(1.2, 0, -1.4, 0.2, 2.6, 0.2, PAL.yellow); g.box(0.5, 2.5, -1.4, 1.8, 0.16, 0.16, PAL.yellow, { rz: 0.15 }); g.box(-0.2, 1.7, -1.4, 0.05, 0.8, 0.05, PAL.alloy);
  },
  quarry(g) {
    g.box(0, 0, 0, 5.4, 0.12, 5.4, 0x7d6a58);
    g.box(-0.8, 0.12, -0.6, 3.2, 0.05, 3.0, 0x4a3f38);
    for (let i = 0; i < 7; i++) g.box(-2.2 + rnd() * 3.4, 0.1, -2.2 + rnd() * 2.6, 0.5 + rnd() * 0.5, 0.35 + rnd() * 0.4, 0.5 + rnd() * 0.4, i % 2 ? PAL.stone : PAL.stoneD, { ry: rnd() });
    g.box(1.9, 0, -1.9, 0.25, 3.4, 0.25, PAL.yellow); g.box(0.7, 3.2, -1.9, 2.8, 0.2, 0.2, PAL.yellow, { rz: 0.12 }); g.box(-0.5, 2.0, -1.9, 0.05, 1.1, 0.05, PAL.alloy); g.box(-0.5, 1.6, -1.9, 0.6, 0.45, 0.6, PAL.stone);
    g.shed(1.7, 1.7, 1.6, 1.4, 1.2, PAL.plank, PAL.roof, { win: 1 });
    for (let i = 0; i < 4; i++) g.box(-1.9 + i * 0.6, 0.12, 2.0, 0.5, 0.4, 0.5, PAL.stone);
  },
  mine(g) {
    g.box(0, 0, 0, 5.4, 0.12, 5.4, 0x6a5a4c);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.box(-0.9 + x * 0.8, 0, -0.6 + z * 0.8, 0.18, 4.4, 0.18, PAL.timberD, { rz: -x * 0.09, rx: z * 0.09 });
    g.box(-0.9, 3.9, -0.6, 1.5, 0.5, 1.5, PAL.alloyL); g.cyl(-0.9, 4.75, -0.6, 0.6, 0.18, PAL.yellow, { rx: Math.PI / 2, seg: 12 });
    g.box(-0.9, 0.12, -0.6, 1.1, 0.1, 1.1, 0x18140f);
    g.shed(1.5, -1.2, 2.0, 1.8, 1.6, PAL.timber, PAL.roofD, { win: 1 }); g.stack(2.0, 1.6, -1.7, 1.8, 0.22);
    g.box(1.2, 0.15, 1.7, 3.0, 0.08, 0.5, PAL.iron); g.box(0.6, 0.25, 1.7, 0.8, 0.5, 0.6, PAL.rust); g.box(1.7, 0.25, 1.7, 0.8, 0.5, 0.6, PAL.alloyL);
    for (let i = 0; i < 4; i++) g.box(-2.1 + rnd() * 1.0, 0.1, 1.2 + rnd() * 1.2, 0.5, 0.4, 0.5, PAL.rust, { ry: rnd() });
  },
  workshop(g) {
    g.shed(-0.5, -0.1, 3.6, 2.8, 2.0, PAL.timber, PAL.roof, { win: 2 });
    g.stack(-1.6, 2.0, -0.8, 2.0, 0.26);
    g.box(2.3, 0, -1.0, 0.24, 3.0, 0.24, PAL.yellow); g.box(1.4, 2.8, -0.4, 0.2, 0.2, 2.6, PAL.yellow, { rx: -0.2 }); g.box(1.4, 1.9, 0.7, 0.05, 1.1, 0.05, PAL.alloy);
    g.canopy(2.2, 1.5, 1.0, 1.4, 1.4, PAL.tan); g.box(2.2, 0, 1.0, 0.9, 0.6, 0.6, PAL.alloyL);
    g.cyl(-1.2, 1.4, 1.33, 0.4, 0.08, PAL.yellow, { rx: Math.PI / 2, seg: 8 });
  },
  fabrication(g) {
    g.box(-0.8, 0, -0.3, 5.6, 2.6, 4.2, PAL.alloyL);
    g.gable(-0.8, 2.6, -0.3, 6.0, 1.1, 4.6, PAL.roofD);
    g.hazard(-0.8, 0.0, 1.82, 5.6, 0.35, 0.05);
    for (let i = 0; i < 4; i++) g.box(-2.9 + i * 1.4, 1.2, 1.82, 0.7, 0.8, 0.05, PAL.glow, { glow: 1.2, flat: true });
    g.box(-0.8, 0, 1.84, 1.6, 1.0, 0.05, PAL.alloy);
    g.stack(-2.6, 2.6, -1.4, 2.6, 0.34); g.stack(-1.4, 2.6, -1.4, 2.2, 0.3);
    g.tank(2.9, 0, -1.5, 0.75, 2.4, PAL.alloy, true); g.tank(2.9, 0, 0.4, 0.6, 1.8, PAL.yellowD);
    g.box(2.9, 0, 2.1, 1.4, 0.8, 1.2, PAL.yellow); g.box(2.9, 0.8, 2.1, 0.2, 1.6, 0.2, PAL.yellow); g.box(2.3, 2.3, 2.1, 1.4, 0.18, 0.18, PAL.yellow);
    g.cyl(-0.8, 3.0, 1.9, 0.55, 0.1, PAL.yellow, { rx: Math.PI / 2, seg: 8 });
  },
  refinery(g) {
    g.box(0, 0, 0, 7.6, 0.2, 5.6, PAL.stoneD);
    g.shed(-2.2, 0.8, 2.6, 2.6, 2.0, PAL.alloyL, PAL.roofD, { win: 2, y: 0.2 });
    for (const [x, z, h] of [[0.4, -1.2, 3.4], [1.8, -1.2, 4.0], [3.0, -1.0, 3.0]]) { g.tank(x, 0.2, z, 0.6, h, PAL.alloy, true); }
    g.cyl(1.2, 2.2, -1.2, 0.12, 2.8, PAL.yellow, { rz: Math.PI / 2 });
    for (const x of [0.6, 1.8, 3.0]) g.cyl(x, 0.2, 1.3, 0.34, 1.6, PAL.cyan, { glow: 1.3, seg: 8 });
    g.box(1.8, 0.2, 1.3, 3.2, 0.3, 0.9, PAL.alloy); g.box(1.8, 1.8, 1.3, 3.2, 0.2, 0.9, PAL.alloy);
    g.stack(-3.2, 0.2, -1.6, 4.0, 0.3);
    g.hazard(1.8, 0.2, 2.2, 3.4, 0.3, 0.06);
  },
  valve(g) {
    g.box(0, 0, 0, 1.3, 0.15, 1.3, PAL.stoneD);
    g.cyl(0, 0.15, 0, 0.3, 0.9, PAL.alloy); g.cyl(0, 0.6, 0, 0.16, 1.6, 0x3a7fa8, { rz: Math.PI / 2 });
    g.cyl(0, 1.25, 0, 0.36, 0.07, PAL.yellow, { seg: 10 }); g.cyl(0, 1.05, 0, 0.05, 0.25, PAL.alloy);
    g.box(0, 0.5, 0.31, 0.2, 0.2, 0.04, PAL.cyan, { glow: 1.4, flat: true });
  },
  watertower(g) {
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.box(x * 1.0, 0, z * 1.0, 0.18, 3.0, 0.18, PAL.timberD, { rz: -x * 0.08, rx: z * 0.08 });
    g.box(0, 1.4, 0, 2.3, 0.1, 0.1, PAL.timberD, { ry: 0.78 }); g.box(0, 1.4, 0, 2.3, 0.1, 0.1, PAL.timberD, { ry: -0.78 });
    g.cyl(0, 2.9, 0, 1.25, 1.9, PAL.timber, { seg: 12 }); g.cyl(0, 3.3, 0, 1.29, 0.12, PAL.iron, { seg: 12 }); g.cyl(0, 4.2, 0, 1.29, 0.12, PAL.iron, { seg: 12 });
    g.cone(0, 4.8, 0, 1.45, 0.8, PAL.roofD, { seg: 12 });
    g.cyl(0.9, 0, 0.9, 0.09, 3.0, 0x3a7fa8);
    g.box(0, 3.55, 1.27, 0.5, 0.5, 0.04, PAL.yellow, { flat: true });
  },
  pylon(g) {
    g.box(0, 0, 0, 0.22, 4.2, 0.22, PAL.timberD); g.box(0, 3.6, 0, 1.5, 0.12, 0.12, PAL.timberD); g.box(0, 3.1, 0, 1.0, 0.1, 0.1, PAL.timberD);
    for (const x of [-0.65, 0.65]) g.box(x, 3.72, 0, 0.1, 0.22, 0.1, PAL.cyan, { glow: 1.5, flat: true });
    g.box(0, 4.2, 0, 0.16, 0.2, 0.16, PAL.yellow);
  },
  generator(g) {
    g.box(0, 0, 0, 3.6, 0.2, 3.6, PAL.stoneD);
    g.cyl(-0.2, 1.2, 0.2, 0.95, 2.6, PAL.alloy, { rz: Math.PI / 2, seg: 12 });
    g.cyl(-0.2, 1.2, 0.2, 1.0, 0.2, PAL.yellow, { rz: Math.PI / 2, seg: 12 });
    g.box(-0.2, 0.2, 0.2, 2.2, 0.4, 1.4, PAL.alloyL);
    g.box(1.3, 0.6, 0.2, 0.08, 0.6, 0.6, PAL.glow, { glow: 1.6, flat: true });
    g.stack(-1.2, 0.2, -1.2, 4.2, 0.36); g.stack(0.9, 0.2, -1.3, 3.2, 0.26);
    g.hazard(0, 0.2, 1.7, 3.2, 0.25, 0.06);
  },
  warehouse(g) {
    g.shed(-0.3, -0.2, 4.6, 3.0, 1.9, PAL.plank, PAL.tin, { win: 3 });
    g.box(-0.3, 0, 1.33, 1.6, 1.4, 0.05, PAL.timberD);
    g.crates(2.3, 0.4, 5); g.crates(2.3, -1.2, 3);
    for (let i = 0; i < 3; i++) g.cyl(-2.4 + i * 0.5, 0, 1.8, 0.22, 0.6, PAL.timberD, { seg: 8 });
  },
  utility(g) {
    g.shed(-0.8, -0.2, 3.4, 2.8, 1.8, PAL.timber, PAL.roofD, { win: 2 });
    g.tank(1.9, 0, -1.0, 0.7, 1.9, PAL.rust); g.cyl(1.9, 1.0, 0.3, 0.12, 1.8, 0x3a7fa8, { rx: Math.PI / 2 });
    g.box(1.9, 0, 1.1, 1.2, 0.7, 0.9, PAL.yellow); g.hazard(1.9, 0.7, 1.1, 1.2, 0.08, 0.9);
    g.stack(-2.0, 1.8, -0.9, 1.6, 0.2);
  },
  medical(g) {
    g.box(0, 0, -0.2, 3.0, 1.5, 2.4, PAL.white);
    g.gable(0, 1.5, -0.2, 3.4, 1.0, 2.9, PAL.tan);
    g.box(0, 0.75, 1.02, 0.7, 0.22, 0.04, PAL.red, { flat: true }); g.box(0, 0.51, 1.02, 0.22, 0.7, 0.04, PAL.red, { flat: true });
    g.box(-1.0, 0.6, 1.02, 0.4, 0.45, 0.04, PAL.glow, { glow: 0.9, flat: true }); g.box(1.0, 0.6, 1.02, 0.4, 0.45, 0.04, PAL.glow, { glow: 0.9, flat: true });
    g.canopy(0, 1.4, 1.55, 3.0, 0.9, PAL.white);
  },
  shade(g) {
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.box(x * 1.5, 0, z * 1.5, 0.16, 2.2, 0.16, PAL.timberD);
    g.box(0, 2.2, 0, 3.6, 0.1, 3.6, PAL.tan); g.gable(0, 2.3, 0, 3.8, 0.7, 3.8, PAL.red);
    g.cyl(0, 0, 0, 0.9, 0.35, PAL.stone, { seg: 12 }); g.cyl(0, 0.3, 0, 0.75, 0.08, PAL.water, { seg: 12, glow: 0.5 });
    g.box(-1.1, 0, 1.0, 0.9, 0.3, 0.3, PAL.timber); g.box(1.1, 0, -1.0, 0.9, 0.3, 0.3, PAL.timber);
  },
  school(g) {
    g.shed(0.3, -0.2, 4.0, 2.8, 1.9, PAL.timber, PAL.roof, { win: 3 });
    g.box(-2.2, 0, -0.2, 1.2, 3.2, 1.2, PAL.plank); g.gable(-2.2, 3.2, -0.2, 1.5, 0.8, 1.5, PAL.roofD);
    g.box(-2.2, 2.5, 0.42, 0.5, 0.5, 0.04, PAL.yellow, { flat: true });
    g.box(0.3, 2.2, 1.24, 0.6, 0.8, 0.04, PAL.yellow, { flat: true });
  },
  office(g) {
    g.box(0, 0, -0.2, 4.6, 1.0, 2.8, PAL.stone); g.box(0, 1.0, -0.2, 4.5, 1.2, 2.7, PAL.timber);
    g.gable(0, 2.2, -0.2, 5.0, 1.1, 3.3, PAL.roofD);
    for (const x of [-1.6, -0.6, 0.6, 1.6]) g.box(x, 1.2, 1.17, 0.42, 0.55, 0.05, PAL.glow, { glow: 1, flat: true });
    g.box(0, 0, 1.2, 0.7, 1.0, 0.05, PAL.timberD);
    g.box(0, 2.2, -0.2, 0.9, 1.6, 0.9, PAL.plank); g.cone(0, 3.8, -0.2, 0.8, 0.8, PAL.roofD, { seg: 4, ry: 0.78 });
    g.box(0, 2.9, 0.27, 0.45, 0.45, 0.04, PAL.white, { glow: 0.5, flat: true });
    g.box(1.2, 2.0, 1.25, 0.5, 0.9, 0.04, PAL.yellow, { flat: true });
  },
  market(g) {
    const cols = [PAL.red, PAL.tan, PAL.red, PAL.tan, 0xc7882e];
    const spots = [[-1.6, -1.5], [1.5, -1.6], [-1.7, 1.4], [1.6, 1.5], [0, 0]];
    spots.forEach(([x, z], i) => {
      g.canopy(x, 1.5, z, 1.9, 1.7, cols[i]);
      g.box(x, 0, z + 0.3, 1.5, 0.55, 0.5, PAL.plank);
      g.box(x - 0.3, 0.55, z + 0.3, 0.3, 0.2, 0.3, i % 2 ? 0xd98a2b : PAL.green); g.box(x + 0.3, 0.55, z + 0.3, 0.3, 0.2, 0.3, 0xc24a30);
      g.box(x + 0.85, 1.2, z + 0.75, 0.12, 0.16, 0.12, PAL.glow, { glow: 1.5, flat: true });
    });
  },
  betting(g) {
    g.box(0, 0, -0.2, 4.8, 2.2, 2.8, PAL.timberD); g.box(0, 2.2, -0.2, 5.0, 0.6, 3.0, PAL.roofD);
    g.box(0, 2.3, 1.33, 3.4, 0.7, 0.08, 0x1a1024);
    g.box(0, 2.38, 1.39, 3.0, 0.1, 0.04, PAL.neon, { glow: 2.2, flat: true }); g.box(0, 2.82, 1.39, 3.0, 0.1, 0.04, PAL.neon, { glow: 2.2, flat: true });
    for (let i = 0; i < 5; i++) g.box(-1.1 + i * 0.55, 2.6, 1.39, 0.3, 0.22, 0.04, PAL.pink, { glow: 2.2, flat: true });
    for (const x of [-1.7, -0.9, 0.9, 1.7]) g.box(x, 0.9, 1.22, 0.45, 0.7, 0.05, PAL.glow, { glow: 1.2, flat: true });
    g.box(0, 0, 1.24, 0.8, 1.3, 0.05, 0x2a1830);
    g.cyl(2.1, 0, -1.2, 0.5, 3.6, PAL.stoneD, { rt: 0.38 }); g.cone(2.1, 3.6, -1.2, 0.55, 0.7, PAL.roofD);
  },
  depot(g) {
    g.box(0, 0, 0, 5.6, 0.35, 5.6, PAL.timberD);
    g.shed(-1.0, -0.9, 3.2, 2.8, 1.9, PAL.timber, PAL.roof, { win: 2, y: 0.35 });
    g.box(2.1, 0.35, -1.9, 0.26, 3.6, 0.26, PAL.yellow); g.box(1.2, 3.75, -0.7, 0.22, 0.22, 3.2, PAL.yellow, { rx: -0.16 }); g.box(1.2, 2.5, 0.6, 0.05, 1.5, 0.05, PAL.alloy); g.box(1.2, 1.9, 0.6, 0.7, 0.6, 0.7, PAL.plank);
    g.crates(1.6, 1.6, 5); g.crates(-2.2, 1.7, 4);
    g.hazard(0, 0.35, 2.75, 5.4, 0.08, 0.1);
  },
  station(g) {
    g.box(0, 0, 0.6, 7.6, 0.4, 2.6, PAL.stoneD);
    g.shed(-1.4, 0.3, 4.2, 1.9, 1.8, PAL.timber, PAL.roofD, { win: 3, y: 0.4 });
    for (const [x, z] of [[1.7, -0.6], [3.3, -0.6], [1.7, 0.9], [3.3, 0.9]]) g.box(x, 0.4, z, 0.2, 13.4, 0.2, PAL.timberD);
    for (let y = 2.5; y < 13; y += 2.6) { g.box(2.5, y, -0.6, 1.8, 0.14, 0.14, PAL.timberD); g.box(2.5, y, 0.9, 1.8, 0.14, 0.14, PAL.timberD); g.box(1.7, y, 0.15, 0.14, 0.14, 1.6, PAL.timberD); g.box(3.3, y, 0.15, 0.14, 0.14, 1.6, PAL.timberD); }
    g.box(2.5, 5.2, 0.15, 1.3, 1.4, 1.2, PAL.yellow); g.box(2.5, 5.7, 0.77, 0.7, 0.5, 0.04, PAL.glow, { glow: 1.2, flat: true });
    g.box(2.5, 13.6, 0.15, 2.4, 0.2, 2.2, PAL.roofD);
    g.box(-1.4, 2.6, 1.3, 2.6, 0.5, 0.06, PAL.yellow, { flat: true });
  },
};

export function buildingGeometry(type) {
  seed = 1234 + type.length * 97 + type.charCodeAt(0) * 13;
  const g = new G();
  (M[type] || ((gg) => gg.box(0, 0, 0, B[type].w * CELL * 0.8, 1.5, B[type].d * CELL * 0.8, PAL.timber)))(g);
  const def = B[type];
  if (!def.line && !g.lamps.length && !['valve', 'pylon', 'farm', 'frontier', 'settler', 'watertower'].includes(type)) g.lamp(-def.w * CELL / 2 + 0.35, 0, def.d * CELL / 2 - 0.35, 1.7);
  return g.done();
}

// ------------------------------------------------------------------ clickers
export function clickerGeometry(role) {
  seed = 99 + role.length;
  const g = new G(), Y = PAL.yellow, A = PAL.alloy;
  const big = role === 'master' ? 1 : 0.8;
  const L = (role === 'hauler' ? 3.2 : role === 'agriculture' ? 2.6 : 2.6) * big, W = 1.3 * big, H = 0.85 * big, y0 = 1.0 * big;
  g.box(0, y0, 0, W, H, L, Y); g.box(0, y0 - 0.14, 0, W * 0.8, 0.2, L * 0.9, A);
  g.hazard(0, y0 + H * 0.3, L / 2 + 0.01, W, 0.2, 0.04);
  // cab + visor
  g.box(0, y0 + H, L * 0.26, W * 0.8, 0.5 * big, L * 0.3, A); g.box(0, y0 + H + 0.14 * big, L * 0.42, W * 0.62, 0.16 * big, 0.05, PAL.glow, { glow: 2.2, flat: true });
  g.box(0, y0 + 0.2, L / 2 + 0.03, W * 0.5, 0.14, 0.04, PAL.glow, { glow: 2.2, flat: true });
  // back machinery
  g.box(0, y0 + H, -L * 0.2, W * 0.7, 0.4 * big, L * 0.4, PAL.alloyL); g.cyl(W * 0.25, y0 + H + 0.4 * big, -L * 0.3, 0.12 * big, 0.5 * big, A);
  g.box(-W * 0.25, y0 + H + 0.45 * big, -L * 0.15, 0.14, 0.2, 0.14, PAL.cyan, { glow: 2, flat: true });
  g.cyl(0, y0 - 0.05, 0, 0.22 * big, W + 0.5 * big, A, { rz: Math.PI / 2 });
  if (role === 'master' || role === 'construction') {
    g.box(W * 0.3, y0 + H, -L * 0.1, 0.3, 1.5 * big, 0.3, Y); g.box(W * 0.3, y0 + H + 1.5 * big, L * 0.25, 0.26, 0.26, L * 0.9, Y, { rx: -0.25 });
    g.box(W * 0.3, y0 + H + 0.95 * big, L * 0.68, 0.05, 1.0 * big, 0.05, A); g.box(W * 0.3, y0 + H + 0.25 * big, L * 0.68, 0.6 * big, 0.55 * big, 0.6 * big, PAL.plank);
  }
  if (role === 'hauler') { for (let i = 0; i < 5; i++) g.cyl(-0.3 + (i % 3) * 0.3 - (i > 2 ? -0.15 : 0), y0 + H + 0.62 * big + Math.floor(i / 3) * 0.28, -L * 0.18, 0.15, L * 0.55, i % 2 ? PAL.timber : PAL.plank, { rx: Math.PI / 2, seg: 6 }); g.box(0, y0 + H + 0.4 * big, -L * 0.18, W * 0.9, 0.08, L * 0.6, A); }
  if (role === 'excavation') { g.cyl(0, y0 + H * 0.5, L / 2 + 0.5, 0.5, 0.9, A, { rx: Math.PI / 2 }); g.cone(0, y0 + H * 0.5 - 0.6, L / 2 + 1.5, 0.55, 1.2, PAL.iron, { rx: Math.PI / 2 }); }
  if (role === 'harvesting') { for (const s of [-1, 1]) { g.box(s * 0.35, y0 + 0.1, L / 2 + 0.6, 0.14, 0.14, 1.2, Y, { ry: s * -0.25 }); g.box(s * 0.2, y0 - 0.2, L / 2 + 1.2, 0.12, 0.5, 0.12, A); } }
  if (role === 'agriculture') { g.cyl(0, 0.3, L / 2 + 0.5, 0.3, W * 1.6, PAL.iron, { rz: Math.PI / 2, seg: 8 }); for (const s of [-1, 1]) g.box(s * W * 0.6, 0.3, L / 2 + 0.1, 0.1, y0, 0.1, Y, { rx: 0.5 }); g.tank(0, y0 + H, -L * 0.2, 0.3, 0.3, 0xc9862a); }
  if (role === 'maintenance') { g.box(W * 0.3, y0 + H, L * 0.1, 0.2, 0.9, 0.2, Y); g.box(W * 0.3, y0 + H + 0.9, L * 0.45, 0.16, 0.16, 1.0, Y, { rx: 0.3 }); g.sphere(W * 0.3, y0 + H + 0.72, L * 0.95, 0.1, PAL.cyan, { glow: 3 }); }
  const body = g.done();
  // one leg (hip at origin, pointing down/out)
  const l = new G();
  l.box(0, -0.12, 0, 0.3 * big, 0.3 * big, 0.5 * big, A);
  l.box(0.28 * big, -0.5 * big, 0, 0.26 * big, 0.6 * big, 0.3 * big, Y, { rz: 0.5 });
  l.box(0.5 * big, -y0 - 0.02, 0, 0.24 * big, 0.75 * big, 0.26 * big, A);
  l.box(0.5 * big, -y0 - 0.02, 0.05, 0.4 * big, 0.14 * big, 0.5 * big, PAL.alloyL);
  return { body, leg: l.done(), y0, hipX: W / 2, hipZ: L * 0.34 };
}

// ------------------------------------------------------------------ people, trees, rocks, train, bridge
export function personGeometry() {
  const b = new G();
  b.box(0, 0, 0, 0.14, 0.42, 0.16, 0x4a3a2e, { flat: true }); b.box(0, 0.4, 0, 0.3, 0.42, 0.2, 0xffffff, { flat: true });
  const h = new G();
  h.box(0, 0.83, 0, 0.2, 0.2, 0.2, 0xffffff, { flat: true }); h.box(0, 1.02, 0, 0.36, 0.05, 0.36, 0x6a4a30, { flat: true }); h.box(0, 1.05, 0, 0.2, 0.1, 0.2, 0x6a4a30, { flat: true });
  return { body: b.done(), head: h.done() };
}
export function treeGeometry() {
  seed = 5;
  const g = new G();
  g.cyl(0, 0, 0, 0.14, 0.9, PAL.timberD, { seg: 5 });
  g.cone(0, 0.7, 0, 0.85, 1.5, PAL.greenD, { seg: 6 }); g.cone(0, 1.5, 0, 0.6, 1.2, PAL.green, { seg: 6 });
  return g.done();
}
export function rockGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 0.78 + 0.44 * (Math.sin(x * 7.1 + y * 3.3) * Math.cos(z * 5.7 + x * 2.1) * 0.5 + 0.5); P.setXYZ(i, x * k, y * k * 0.8, z * k); }
  geo.computeVertexNormals();
  const n = P.count, c = new Float32Array(n * 3).fill(1), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = P.getX(i) * 0.4 + P.getZ(i) * 0.2; uv[i * 2 + 1] = P.getY(i) * 0.5; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); geo.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute('layer', new THREE.BufferAttribute(new Float32Array(n).fill(6), 1)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
// dry scrub tuft and street lamp for the instanced settlement dressing
export function scrubGeometry() {
  seed = 91; const g = new G();
  for (let i = 0; i < 5; i++) { const a = i * 1.26, r = 0.12 + rnd() * 0.16; g.cone(Math.cos(a) * r, 0, Math.sin(a) * r, 0.16 + rnd() * 0.08, 0.4 + rnd() * 0.35, 0xffffff, { seg: 4, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35, layer: 5 }); }
  return g.done();
}
export function lampGeometry() { seed = 92; const g = new G(); g.lamp(0, 0, 0, 2.1); g.box(0.16, 1.9, 0, 0.3, 0.05, 0.05, PAL.alloy); return g.done(); }
export function pipeGeometry() {
  seed = 93; const g = new G();
  g._push(new THREE.CylinderGeometry(0.15, 0.15, 1, 8), 0xffffff, { rz: Math.PI / 2, layer: 4 }, 0, 0, 0);
  g._push(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 8), 0xd8c8a0, { rz: Math.PI / 2, layer: 4 }, 0, 0, 0);
  const geo = g.done(); const gl = geo.attributes.glow.array; gl.fill(0.2); return geo;
}
export function nodeGeometry(type) {
  seed = 31 + type.length * 7;
  const g = new G();
  if (type === 'forest') { for (let i = 0; i < 9; i++) { const x = -1.8 + rnd() * 3.6, z = -1.8 + rnd() * 3.6, s = 0.9 + rnd() * 0.7; g.cyl(x, 0, z, 0.16 * s, 1.1 * s, PAL.timberD, { seg: 5 }); g.cone(x, 0.8 * s, z, 0.95 * s, 1.7 * s, PAL.greenD, { seg: 6 }); g.cone(x, 1.7 * s, z, 0.65 * s, 1.3 * s, PAL.green, { seg: 6 }); } }
  else if (type === 'rock') { for (let i = 0; i < 8; i++) g.box(-1.5 + rnd() * 3, 0, -1.5 + rnd() * 3, 0.8 + rnd() * 1.2, 0.6 + rnd() * 1.6, 0.8 + rnd() * 1.2, i % 2 ? 0xa59a8a : 0x857a6c, { ry: rnd() * 3, rz: rnd() * 0.2 }); }
  else if (type === 'ore') { for (let i = 0; i < 8; i++) g.box(-1.5 + rnd() * 3, 0, -1.5 + rnd() * 3, 0.8 + rnd() * 1.1, 0.6 + rnd() * 1.5, 0.8 + rnd() * 1.1, i % 3 ? 0x4a4248 : 0xb5562c, { ry: rnd() * 3, rz: rnd() * 0.2 }); for (let i = 0; i < 5; i++) g.box(-1.3 + rnd() * 2.6, 0.5 + rnd(), -1.3 + rnd() * 2.6, 0.25, 0.25, 0.25, 0xd9793a, { glow: 0.4, ry: rnd() }); }
  else if (type === 'vent') { g.cyl(0, 0, 0, 1.8, 0.6, 0x5a4a44, { rt: 1.1, seg: 9 }); g.cyl(0, 0.6, 0, 0.9, 0.08, PAL.cyan, { seg: 9, glow: 2.2, flat: true }); for (let i = 0; i < 6; i++) { const a = rnd() * 6.28; g.box(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6, 0.5, 0.5 + rnd() * 0.8, 0.5, 0x4c4046, { ry: a }); g.box(Math.cos(a) * 1.2, 0.3, Math.sin(a) * 1.2, 0.12, 0.5, 0.12, PAL.cyan, { glow: 2, flat: true }); } g.smoke.push([0, 0.9, 0]); }
  return g.done();
}
// Stone arch viaduct. Local x runs along the track. Each bent is two masonry legs (so roads pass between
// them) joined by a cross arch; spandrel courses step down to form the main arches between bents.
export function bridgeGeometry(len, height) {
  seed = 77;
  const g = new G(), W = 5.4, span = 8, legW = 1.5, rise = 3.3, top = height - 0.1, K = 8;
  g.box(0, top, 0, len, 0.6, W, PAL.stoneD); g.box(0, top + 0.6, 0, len, 0.14, 3.4, PAL.timberD);
  for (const s of [-1, 1]) { g.box(0, top + 0.74, s * 0.8, len, 0.12, 0.14, PAL.iron); g.box(0, top + 0.6, s * (W / 2 - 0.12), len, 0.55, 0.24, PAL.stone); g.box(0, top + 1.15, s * (W / 2 - 0.12), len, 0.08, 0.34, PAL.stoneD); }
  for (let x = -len / 2 + 4; x < len / 2; x += span) {
    for (const s of [-1, 1]) { g.box(x, 0, s * 2.35, legW, top - rise + 0.2, legW, PAL.stone); g.box(x, 0, s * 2.35, legW + 0.3, 0.7, legW + 0.3, PAL.stoneD); g.box(x, top - rise - 0.1, s * 2.35, legW + 0.2, 0.3, legW + 0.2, PAL.stoneD); }
    g.box(x, top - rise + 0.2, 0, legW, rise - 0.2, W, PAL.stone);
    g.box(x, top - rise - 1.4, 0, legW * 0.8, 1.6, 3.4, PAL.stoneD);
    // spandrel courses: the underside follows a semicircle between this bent and the next
    const c = (span - legW) / 2;
    for (let k = 0; k < K; k++) { const u = (k + 0.5) / K * 2 - 1, drop = (1 - Math.sqrt(Math.max(0, 1 - u * u))) * rise, w = (span - legW) / K; g.box(x + legW / 2 + (k + 0.5) * w, top - 0.35 - drop, 0, w + 0.02, 0.35 + drop, W - 0.5, k % 2 ? PAL.stone : PAL.stoneD); }
    if (Math.round(x / span) % 3 === 0) g.lamp(x, top + 1.2, W / 2 - 0.12, 1.3);
  }
  return g.done();
}
export function trainGeometry() {
  seed = 55;
  const g = new G();
  // locomotive at +x, cars trail to -x, a second locomotive at the tail facing the other way
  const loco = (o, f) => {
    g.box(o + f * 0, 0.5, 0, 5.2, 0.5, 2.0, PAL.alloy);
    g.cyl(o + f * 0.9, 1.9, 0, 0.85, 3.2, PAL.alloy, { rz: Math.PI / 2, seg: 12 }); g.cyl(o + f * 2.45, 1.9, 0, 0.9, 0.2, PAL.yellow, { rz: Math.PI / 2, seg: 12 });
    g.box(o - f * 1.6, 1.0, 0, 1.9, 2.2, 2.0, PAL.yellow); g.box(o - f * 1.6, 3.2, 0, 2.2, 0.15, 2.3, PAL.alloy);
    for (const s of [-1, 1]) g.box(o - f * 1.6, 2.2, s * 1.01, 1.2, 0.6, 0.04, PAL.glow, { glow: 2, flat: true });
    g.stack(o + f * 1.6, 2.6, 0, 1.3, 0.3); g.box(o + f * 2.65, 1.0, 0, 0.1, 0.5, 0.5, PAL.glow, { glow: 3, flat: true });
    g.box(o + f * 2.9, 0.4, 0, 0.6, 0.6, 1.9, PAL.yellowD, { rz: -0.5 * f });
  };
  loco(0, 1); loco(-31.4, -1);
  for (let i = 0; i < 4; i++) {
    const x = -6.6 - i * 6.2, cargo = i % 2 === 1;
    g.box(x, 0.5, 0, 5.6, 0.4, 2.0, PAL.alloy);
    if (cargo) { g.box(x, 0.9, 0, 5.2, 1.0, 1.9, PAL.rust); for (let k = 0; k < 4; k++) g.box(x - 1.8 + k * 1.2, 1.9, 0, 0.9, 0.7, 1.5, k % 2 ? PAL.plank : PAL.timber); }
    else { g.box(x, 0.9, 0, 5.4, 2.0, 2.0, i === 0 ? PAL.yellowD : 0x7a4a34); g.box(x, 2.9, 0, 5.6, 0.2, 2.2, PAL.alloy); for (const s of [-1, 1]) for (let k = 0; k < 4; k++) g.box(x - 1.9 + k * 1.25, 1.8, s * 1.01, 0.7, 0.6, 0.04, PAL.glow, { glow: 2, flat: true }); }
  }
  return g.done();
}

