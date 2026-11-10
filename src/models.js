// Procedural low-poly models. Every building is one merged mesh with vertex colours
// and a per-vertex "glow" channel (lit windows, aether tubes) driven by the night uniform.
import * as THREE from 'three';
import { B, CELL, HW } from './data.js';

export const PAL = {
  timber: 0x8f5d38, timberD: 0x603e26, plank: 0xa87748, roof: 0x6e4a3a, roofD: 0x4f3a33, tin: 0x8b8580,
  stone: 0x948a7c, stoneD: 0x6f675c, alloy: 0x2b2b30, alloyL: 0x45464d, yellow: 0xe8a61c, yellowD: 0xb97d10,
  glow: 0xffc266, cyan: 0x62e8ff, red: 0xa93e33, tan: 0xd9b98b, white: 0xe9e2d2, dirt: 0xa8744a,
  green: 0x6f8a3c, greenD: 0x4c6a2e, water: 0x45c8e8, iron: 0x6a707a, rust: 0x9a4f2c, neon: 0xd060ff, pink: 0xff5fa8,
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _c = new THREE.Color();
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

export class G {
  constructor() { this.p = []; this.n = []; this.c = []; this.g = []; this.smoke = []; }
  _push(geo, color, o, x, y, z) {
    const ng = geo.index ? geo.toNonIndexed() : geo;
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s);
    ng.applyMatrix4(_m);
    const P = ng.attributes.position.array, Nn = ng.attributes.normal.array;
    _c.set(color); const j = o.flat ? 1 : 0.92 + rnd() * 0.16; const gl = o.glow || 0;
    for (let i = 0; i < P.length; i += 3) {
      this.p.push(P[i], P[i + 1], P[i + 2]); this.n.push(Nn[i], Nn[i + 1], Nn[i + 2]);
      this.c.push(_c.r * j, _c.g * j, _c.b * j); this.g.push(gl);
    }
    ng.dispose(); if (ng !== geo) geo.dispose();
    return this;
  }
  box(x, y, z, w, h, d, color, o = {}) { return this._push(new THREE.BoxGeometry(w, h, d), color, o, x, y + h / 2, z); }
  cyl(x, y, z, r, h, color, o = {}) {
    const horiz = o.rx || o.rz;
    return this._push(new THREE.CylinderGeometry(o.rt ?? r, r, h, o.seg || 10), color, o, x, horiz ? y : y + h / 2, z);
  }
  cone(x, y, z, r, h, color, o = {}) { return this._push(new THREE.ConeGeometry(r, h, o.seg || 8), color, o, x, y + h / 2, z); }
  sphere(x, y, z, r, color, o = {}) { return this._push(new THREE.SphereGeometry(r, o.seg || 8, 6), color, o, x, y, z); }
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
    return this._push(geo, color, { ...o, ry: (o.ry || 0) + (o.z ? Math.PI / 2 : 0) }, x, y, z);
  }
  // timber shed: walls + gable roof + lit windows on the front (+z)
  shed(x, z, w, d, h, wall, roof, o = {}) {
    const y = o.y || 0;
    this.box(x, y, z, w, h, d, wall);
    const along = o.ridgeZ ? d : w, across = o.ridgeZ ? w : d;
    this.gable(x, y + h, z, along + 0.4, o.roofH ?? Math.min(1.3, across * 0.38), across + 0.5, roof, { z: o.ridgeZ });
    const nWin = o.win ?? Math.max(1, Math.round(w / 1.4));
    for (let i = 0; i < nWin; i++) {
      const wx = x - w / 2 + (i + 0.5) * (w / nWin);
      this.box(wx, y + h * 0.45, z + d / 2 + 0.01, 0.42, 0.5, 0.06, PAL.glow, { glow: 1, flat: true });
    }
    if (o.door !== false) this.box(x + (nWin % 2 ? w * 0.28 : 0), y, z + d / 2 + 0.02, 0.5, Math.min(1, h * 0.7), 0.05, PAL.timberD);
    return this;
  }
  chimney(x, y, z, h, color = PAL.stoneD, r = 0.22) { this.box(x, y, z, r * 2, h, r * 2, color); this.smoke.push([x, y + h + 0.2, z]); return this; }
  stack(x, y, z, h, r = 0.3, color = PAL.alloy) { this.cyl(x, y, z, r, h, color, { rt: r * 0.75 }); this.cyl(x, y + h - 0.25, z, r * 0.95, 0.18, PAL.yellow); this.smoke.push([x, y + h + 0.3, z]); return this; }
  crates(x, z, n = 3) { for (let i = 0; i < n; i++) this.box(x + (i % 2) * 0.55, Math.floor(i / 2) * 0.5, z + ((i * 7) % 3) * 0.2, 0.5, 0.5, 0.5, i % 2 ? PAL.plank : PAL.timber, { ry: i * 0.4 }); return this; }
  hazard(x, y, z, w, h, d) { const n = Math.max(2, Math.round(w / 0.4)); for (let i = 0; i < n; i++) this.box(x - w / 2 + (i + 0.5) * w / n, y, z, w / n, h, d, i % 2 ? PAL.yellow : PAL.alloy, { flat: true }); return this; }
  canopy(x, y, z, w, d, color, post = PAL.timberD) {
    this.box(x, y, z, w, 0.08, d, color, { rx: 0.12 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(x + sx * (w / 2 - 0.1), 0, z + sz * (d / 2 - 0.1), 0.1, y, 0.1, post);
    return this;
  }
  tank(x, y, z, r, h, color = PAL.alloy, glow = false) {
    this.cyl(x, y, z, r, h, color, { seg: 12 }); this.sphere(x, y + h, z, r, color, { seg: 12 });
    if (glow) for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.6; this.box(x + Math.cos(a) * r, y + h * 0.2, z + Math.sin(a) * r, 0.14, h * 0.6, 0.14, PAL.cyan, { glow: 1.6, flat: true, ry: -a }); }
    return this;
  }
  done() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    geo.setAttribute('glow', new THREE.Float32BufferAttribute(this.g, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    geo.userData.smoke = this.smoke;
    return geo;
  }
}

// ------------------------------------------------------------------ buildings
const M = {
  frontier(g) {
    g.box(0, 0, -0.2, 2.7, 1.5, 2.2, PAL.plank);
    g.box(0, 1.5, -0.2, 3.0, 0.12, 2.6, PAL.tin, { rx: 0.16 });
    g.box(0, 1.25, 1.35, 2.6, 0.07, 1.1, PAL.tan, { rx: 0.3 });
    for (const sx of [-1.2, 1.2]) g.box(sx, 0, 1.75, 0.1, 1.1, 0.1, PAL.timberD);
    g.box(-0.6, 0.55, 0.91, 0.4, 0.45, 0.05, PAL.glow, { glow: 0.8, flat: true });
    g.box(0.5, 0, 0.92, 0.5, 1.0, 0.05, PAL.timberD);
    g.crates(1.0, 1.3, 2);
  },
  settler(g) {
    g.shed(0, -0.1, 3.0, 2.5, 1.8, PAL.timber, PAL.roof, { win: 2 });
    g.box(0, 0, 1.5, 3.0, 0.15, 0.8, PAL.timberD);
    for (const sx of [-1.35, 1.35]) g.box(sx, 0, 1.8, 0.12, 1.7, 0.12, PAL.timberD);
    g.box(0, 1.65, 1.6, 3.2, 0.08, 1.0, PAL.roofD, { rx: 0.2 });
    g.chimney(0.9, 1.8, -0.5, 1.5);
  },
  insulated(g) {
    g.box(0, 0, -0.1, 3.3, 1.0, 2.8, PAL.stone);
    g.box(0, 1.0, -0.1, 3.2, 1.1, 2.7, PAL.timber);
    g.gable(0, 2.1, -0.1, 3.7, 1.25, 3.3, PAL.roofD);
    for (const wx of [-1.0, 0, 1.0]) g.box(wx, 1.25, 1.27, 0.42, 0.5, 0.06, PAL.glow, { glow: 1, flat: true });
    g.box(-1.0, 0, 1.31, 0.55, 0.95, 0.05, PAL.timberD);
    g.box(0, 0, 1.75, 2.2, 0.2, 0.7, PAL.stoneD);
    g.chimney(1.0, 2.1, -0.6, 1.7, PAL.stoneD, 0.26);
    g.cyl(-1.75, 0.5, -0.4, 0.09, 1.6, PAL.iron); g.box(-1.75, 0, 0.3, 0.3, 0.5, 0.5, PAL.alloyL);
  },
  climate(g) {
    g.box(0, 0, -0.1, 3.3, 1.2, 2.8, PAL.stone);
    g.box(0, 1.2, -0.1, 3.2, 1.9, 2.7, PAL.timber);
    g.gable(0, 3.1, -0.1, 3.7, 1.2, 3.3, PAL.roofD);
    for (const wy of [0.45, 1.9]) for (const wx of [-1.0, 0, 1.0]) g.box(wx, wy, 1.27, 0.45, 0.55, 0.06, PAL.glow, { glow: 1.1, flat: true });
    g.box(0, 1.25, 1.55, 3.2, 0.1, 0.6, PAL.timberD); g.box(0, 1.35, 1.82, 3.2, 0.4, 0.06, PAL.timberD);
    g.tank(-1.5, 0, -1.3, 0.42, 2.2, PAL.alloy, true);
    g.box(1.75, 0.2, -0.3, 0.5, 0.9, 1.0, PAL.alloyL); g.box(2.02, 0.5, -0.3, 0.05, 0.35, 0.7, PAL.cyan, { glow: 1.6, flat: true });
    g.cyl(1.75, 1.1, -0.3, 0.1, 2.0, PAL.yellow);
    g.box(-0.9, 3.0, 1.33, 0.5, 0.9, 0.04, PAL.yellow, { flat: true });
    g.chimney(1.1, 3.1, -0.7, 1.5, PAL.alloy, 0.2);
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
  return g.done();
}

// ------------------------------------------------------------------ Heartwell
// Returns { static, wheel, poolRing, basin } geometries. Footprint 16x16 units, origin at centre.
export function heartwellGeometry(lv) {
  seed = 4242;
  const g = new G();
  const R = 7.7;
  // outer wall + floor
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; g.box(Math.cos(a) * R, 0, Math.sin(a) * R, 1.25, 1.0, 0.5, i % 5 === 0 ? PAL.yellowD : PAL.stoneD, { ry: -a + Math.PI / 2 }); }
  g.cyl(0, 0, 0, R, 0.12, 0x1d2a30, { seg: 40, flat: true });
  // walkways dividing the reserve ring into four pools
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; g.box(Math.cos(a) * 5.6, 0, Math.sin(a) * 5.6, 4.2, 0.95, 0.7, PAL.stone, { ry: -a }); g.box(Math.cos(a) * 5.6, 0.95, Math.sin(a) * 5.6, 4.2, 0.08, 0.5, PAL.yellowD, { ry: -a }); }
  // central platform
  g.cyl(0, 0, 0, 3.7, 1.15, PAL.stoneD, { seg: 16 }); g.cyl(0, 1.15, 0, 3.4, 0.12, PAL.alloy, { seg: 16 });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.box(Math.cos(a) * 3.55, 1.15, Math.sin(a) * 3.55, 0.5, 0.14, 0.2, i % 2 ? PAL.yellow : PAL.alloy, { ry: -a + Math.PI / 2, flat: true }); }
  // steps to the south
  for (let i = 0; i < 4; i++) g.box(0, 0, 7.9 + i * 0.35 - 0.0, 2.4, 1.0 - i * 0.25, 0.4, PAL.stone);
  g.box(0, 0.95, 5.7, 1.6, 0.1, 4.2, PAL.stone);
  // --- extraction drill tower
  const th = 9.5 + lv.ext * 1.3;
  g.cyl(0, 1.25, 0, 1.7, 1.6, PAL.alloy, { seg: 8 });
  g.cyl(0, 2.85, 0, 1.85, 0.35, PAL.yellow, { seg: 8 });
  g.cyl(0, 3.2, 0, 1.15, th - 6.5, PAL.alloyL, { seg: 8 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.box(Math.cos(a) * 1.18, 3.4, Math.sin(a) * 1.18, 0.22, th - 7, 0.22, PAL.cyan, { glow: 1.8, flat: true, ry: -a }); }
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.box(Math.cos(a) * 1.45, 1.25, Math.sin(a) * 1.45, 0.3, th - 3.4, 0.3, PAL.yellow, { ry: -a, rz: 0 }); }
  g.box(0, th - 3.2, 0, 2.9, 1.5, 2.9, PAL.alloy); g.hazard(0, th - 3.2, 1.47, 2.9, 0.3, 0.05); g.hazard(0, th - 3.2, -1.47, 2.9, 0.3, 0.05);
  g.box(0, th - 2.5, 1.47, 1.0, 0.7, 0.06, PAL.yellow, { flat: true }); g.box(0, th - 2.35, 1.5, 0.3, 0.4, 0.06, PAL.cyan, { glow: 1.6, flat: true });
  g.cyl(0, th - 1.7, 0, 1.2, 1.4, PAL.yellow, { rt: 0.75, seg: 8 });
  g.cyl(0, th - 0.3, 0, 0.6, 1.2, PAL.alloy, { rt: 0.3, seg: 8 }); g.cyl(0, th + 0.9, 0, 0.07, 1.6, PAL.iron);
  g.sphere(0, th + 2.5, 0, 0.16, PAL.glow, { glow: 2 });
  for (const s of [-1, 1]) { g.box(s * 1.9, th - 2.6, 0, 0.9, 0.2, 0.2, PAL.yellow); g.cyl(s * 2.3, th - 3.6, 0, 0.12, 1.2, PAL.alloy); }
  // --- turbine housings (west / east), wheels are separate
  for (const s of [-1, 1]) {
    const x = s * 5.3;
    for (let i = 0; i < 7; i++) { const a = Math.PI * (i + 0.5) / 7; g.box(x + Math.cos(a) * 2.25, 0.9 + Math.sin(a) * 2.25, -0.75, 1.1, 0.3, 0.5, i % 2 ? PAL.yellow : PAL.alloy, { rz: a + Math.PI / 2 }); g.box(x + Math.cos(a) * 2.25, 0.9 + Math.sin(a) * 2.25, 0.75, 1.1, 0.3, 0.5, i % 2 ? PAL.alloy : PAL.yellow, { rz: a + Math.PI / 2 }); }
    g.box(x, 0, -1.25, 5.0, 1.05, 0.35, PAL.stoneD); g.box(x, 0, 1.25, 5.0, 1.05, 0.35, PAL.stoneD);
    g.box(x - 2.4, 0, 0, 0.3, 1.05, 2.4, PAL.stoneD); g.box(x + 2.4, 0, 0, 0.3, 1.05, 2.4, PAL.stoneD);
    g.box(x, 0.6, -1.0, 0.8, 0.9, 0.5, PAL.alloy); g.box(x, 0.6, 1.0, 0.8, 0.9, 0.5, PAL.alloy);
    g.cyl(s * 2.9, 2.0, 0, 0.22, 2.4, PAL.alloyL, { rz: Math.PI / 2 });
  }
  // --- purification silos (north)
  const nSilo = 2 + lv.pur;
  for (let i = 0; i < nSilo; i++) { const x = (i - (nSilo - 1) / 2) * 1.5; g.tank(x, 1.25, -4.9 - Math.abs(x) * 0.12, 0.6, 3.0 + (i % 2) * 0.5, PAL.alloy, true); g.cyl(x, 2.2, -3.6, 0.12, 2.4, PAL.iron, { rx: Math.PI / 2 }); }
  g.box(0, 0, -4.9, nSilo * 1.5 + 0.6, 1.25, 1.7, PAL.stoneD);
  // --- steam generators / boilers (north-west & north-east)
  for (const s of [-1, 1]) {
    const x = s * 3.4, z = -3.4;
    g.box(x, 0, z, 1.9, 1.25, 1.9, PAL.stoneD);
    g.cyl(x, 1.25, z, 0.75, 1.6, PAL.rust, { seg: 10 }); g.sphere(x, 2.85, z, 0.75, PAL.rust, { seg: 10 });
    g.box(x, 1.5, z + 0.76, 0.5, 0.45, 0.06, PAL.glow, { glow: 2, flat: true });
    g.stack(x + s * 0.5, 2.9, z - 0.3, 2.2 + lv.tur * 0.5, 0.24);
  }
  // --- hydraulic pump ring
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.52; if (Math.abs(Math.cos(a)) > 0.95) continue; g.box(Math.cos(a) * 2.9, 1.25, Math.sin(a) * 2.9, 0.7, 0.7, 0.5, PAL.yellow, { ry: -a }); g.cyl(Math.cos(a) * 2.9, 1.95, Math.sin(a) * 2.9, 0.16, 0.5, PAL.alloy); }
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.3; g.cyl(Math.cos(a) * 5.4, 0.75, Math.sin(a) * 5.4, 0.16, 3.6, 0x3a7fa8, { rz: Math.PI / 2, ry: -a }); }
  // lamps
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; g.box(Math.cos(a) * R, 1.0, Math.sin(a) * R, 0.08, 0.9, 0.08, PAL.alloy); g.box(Math.cos(a) * R, 1.9, Math.sin(a) * R, 0.2, 0.2, 0.2, PAL.glow, { glow: 2, flat: true }); }
  const stat = g.done();

  // turbine wheel (axis along z)
  const w = new G();
  w.cyl(0, 0, 0, 1.95, 0.5, PAL.alloy, { rx: Math.PI / 2, seg: 16 });
  w.cyl(0, 0, 0, 0.6, 0.9, PAL.yellow, { rx: Math.PI / 2, seg: 10 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; w.box(Math.cos(a) * 1.1, Math.sin(a) * 1.1 - 0.11, 0, 1.7, 0.22, 0.62, i % 2 ? PAL.yellow : PAL.yellowD, { rz: a }); w.box(Math.cos(a) * 1.95, Math.sin(a) * 1.95 - 0.2, 0, 0.3, 0.4, 0.8, PAL.alloyL, { rz: a }); }
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; w.box(Math.cos(a) * 1.5, Math.sin(a) * 1.5 - 0.09, 0.27, 0.5, 0.18, 0.04, PAL.cyan, { rz: a, glow: 1.5, flat: true }); }
  return { static: stat, wheel: w.done() };
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
  const geo = new THREE.DodecahedronGeometry(1, 0);
  geo.computeVertexNormals();
  const n = geo.attributes.position.count, c = new Float32Array(n * 3).fill(1), gl = new Float32Array(n);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); geo.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
  return geo;
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
export function bridgeGeometry(len, height) {
  seed = 77;
  const g = new G();
  g.box(0, height, 0, len, 0.5, 3.4, PAL.timberD); g.box(0, height + 0.5, -0.8, len, 0.12, 0.14, PAL.iron); g.box(0, height + 0.5, 0.8, len, 0.12, 0.14, PAL.iron);
  g.box(0, height + 0.5, -1.65, len, 0.5, 0.1, PAL.alloy); g.box(0, height + 0.5, 1.65, len, 0.5, 0.1, PAL.alloy);
  for (let x = -len / 2 + 4; x < len / 2; x += 8) {
    for (const s of [-1, 1]) g.box(x, 0, s * 2.35, 0.36, height + 0.3, 0.36, PAL.timberD, { rx: s * -0.045 });
    for (let y = 3; y < height; y += 3.6) g.box(x, y, 0, 0.2, 0.2, 4.6, PAL.timberD);
    g.box(x, height * 0.5, 0, 0.16, 0.16, height * 1.02, PAL.timber, { rx: 1.26 }); g.box(x, height * 0.5, 0, 0.16, 0.16, height * 1.02, PAL.timber, { rx: -1.26 });
    g.box(x + 4, height - 1.3, 0, 8, 0.24, 0.24, PAL.timberD, { rz: 0 });
    if ((x / 8 | 0) % 3 === 0) { g.box(x, height + 0.5, 1.7, 0.1, 1.4, 0.1, PAL.alloy); g.box(x, height + 1.9, 1.7, 0.22, 0.22, 0.22, PAL.glow, { glow: 2, flat: true }); }
  }
  return g.done();
}
export function trainGeometry() {
  seed = 55;
  const g = new G();
  // locomotive at +x, cars trail to -x
  g.box(0, 0.5, 0, 5.2, 0.5, 2.0, PAL.alloy);
  g.cyl(0.9, 1.9, 0, 0.85, 3.2, PAL.alloy, { rz: Math.PI / 2, seg: 12 }); g.cyl(2.45, 1.9, 0, 0.9, 0.2, PAL.yellow, { rz: Math.PI / 2, seg: 12 });
  g.box(-1.6, 1.0, 0, 1.9, 2.2, 2.0, PAL.yellow); g.box(-1.6, 3.2, 0, 2.2, 0.15, 2.3, PAL.alloy);
  for (const s of [-1, 1]) g.box(-1.6, 2.2, s * 1.01, 1.2, 0.6, 0.04, PAL.glow, { glow: 2, flat: true });
  g.stack(1.6, 2.6, 0, 1.3, 0.3); g.box(2.65, 1.0, 0, 0.1, 0.5, 0.5, PAL.glow, { glow: 3, flat: true });
  g.box(2.9, 0.4, 0, 0.6, 0.6, 1.9, PAL.yellowD, { rz: -0.5 });
  for (let i = 0; i < 4; i++) {
    const x = -6.6 - i * 6.2, cargo = i % 2 === 1;
    g.box(x, 0.5, 0, 5.6, 0.4, 2.0, PAL.alloy);
    if (cargo) { g.box(x, 0.9, 0, 5.2, 1.0, 1.9, PAL.rust); for (let k = 0; k < 4; k++) g.box(x - 1.8 + k * 1.2, 1.9, 0, 0.9, 0.7, 1.5, k % 2 ? PAL.plank : PAL.timber); }
    else { g.box(x, 0.9, 0, 5.4, 2.0, 2.0, i === 0 ? PAL.yellowD : 0x7a4a34); g.box(x, 2.9, 0, 5.6, 0.2, 2.2, PAL.alloy); for (const s of [-1, 1]) for (let k = 0; k < 4; k++) g.box(x - 1.9 + k * 1.25, 1.8, s * 1.01, 0.7, 0.6, 0.04, PAL.glow, { glow: 2, flat: true }); }
  }
  return g.done();
}

// ------------------------------------------------------------------ shared material
export const glowUniform = { value: 0.3 };
export function makeMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glowUniform;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;');
  };
  return mat;
}
