// Static world: canyon terrain, sky, twin suns, lighting, the High Noon railway.
import * as THREE from 'three';
import { N, CELL, NODES } from './data.js';
import { hash, noise, sstep, terrainH, inButte, RAIL_X, RAIL_H, RAIL_END, RAIL_FAR } from './terrain.js';
export { terrainH };
import { makeMaterial, glowUniform, bridgeGeometry, trainGeometry, treeGeometry, rockGeometry, nodeGeometry } from './models.js';

export const HALF = N * CELL / 2;
export const cellToWorld = (c) => (c - N / 2) * CELL;            // cell corner -> world
export const cellCenter = (c) => (c - N / 2 + 0.5) * CELL;
export const worldToCell = (w) => Math.floor(w / CELL + N / 2);

const _c = new THREE.Color(), _c2 = new THREE.Color();
const BANDS = [0xa25a3a, 0xbd7046, 0xa95f3c, 0xcb8a58, 0x96503a, 0xb8744c, 0xc28055];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.mat = makeMaterial();
    this.matFlat = makeMaterial({ flatShading: true });
    this._terrain();
    this._decor();
    this._sky();
    this._rail();
    this._nodes();
  }

  _terrain() {
    const size = 540, seg = 150;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const P = geo.attributes.position, col = new Float32Array(P.count * 3), glow = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), h = terrainH(x, z);
      P.setY(i, h);
      const n = noise(x * 0.15, z * 0.15), n2 = noise(x * 0.04 + 9, z * 0.04);
      if (h < 0.6 || (z < -70 && h < 15.5 && Math.abs(x) < 46 && !inButte(x, z))) { _c.set(0xb98458).lerp(_c2.set(0x9a6a44), n * 0.7 + n2 * 0.3); if (h > 0.05) _c.multiplyScalar(0.9); }
      else if (h > 43) _c.set(0x7f8c46).lerp(_c2.set(0xa98f58), n2 * 0.8 + n * 0.3).multiplyScalar(0.9 + n * 0.2);
      else { const band = Math.floor((h + n * 3) / 5.3); _c.set(BANDS[((band % BANDS.length) + BANDS.length) % BANDS.length]).multiplyScalar(0.82 + n * 0.3); }
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.matFlat);
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    this.scene.add(mesh); this.terrain = mesh;
    // smooth build floor on top so the settlement ground reads clean
    const fg = new THREE.PlaneGeometry(HALF * 2 + 8, HALF * 2 + 8, 48, 48); fg.rotateX(-Math.PI / 2);
    const fp = fg.attributes.position, fc = new Float32Array(fp.count * 3), fgl = new Float32Array(fp.count);
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i), z = fp.getZ(i), n = noise(x * 0.11, z * 0.11), n2 = noise(x * 0.37, z * 0.37);
      _c.set(0xb48054).lerp(_c2.set(0x966642), n * 0.75).multiplyScalar(0.93 + n2 * 0.14);
      fc[i * 3] = _c.r; fc[i * 3 + 1] = _c.g; fc[i * 3 + 2] = _c.b; fp.setY(i, 0.03);
    }
    fg.setAttribute('color', new THREE.BufferAttribute(fc, 3)); fg.setAttribute('glow', new THREE.BufferAttribute(fgl, 1));
    fg.computeVertexNormals();
    const floor = new THREE.Mesh(fg, this.mat); floor.receiveShadow = true; floor.matrixAutoUpdate = false;
    this.scene.add(floor);
  }

  _decor() {
    let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const trees = [], rocks = [];
    for (let i = 0; i < 5200 && trees.length < 620; i++) {
      const x = (rnd() - 0.5) * 520, z = (rnd() - 0.5) * 520, h = terrainH(x, z);
      if (h > 43 && noise(x * 0.03, z * 0.03 + 5) > 0.38) trees.push([x, h, z, 1.6 + rnd() * 2.2]);
    }
    for (let i = 0; i < 2600 && rocks.length < 260; i++) {
      const x = (rnd() - 0.5) * 300, z = (rnd() - 0.5) * 300, h = terrainH(x, z);
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if ((h > 0.02 && h < 40) || (edge > 57 && h < 0.02 && rnd() < 0.5)) rocks.push([x, h, z, 0.5 + rnd() * (h > 1 ? 2.6 : 0.9)]);
    }
    // scrub on the valley floor edges
    for (let i = 0; i < 400; i++) { const x = (rnd() - 0.5) * 140, z = (rnd() - 0.5) * 140; if (Math.max(Math.abs(x), Math.abs(z)) > 59 && terrainH(x, z) < 1) trees.push([x, terrainH(x, z), z, 0.6 + rnd() * 0.5]); }
    const dummy = new THREE.Object3D();
    const tm = new THREE.InstancedMesh(treeGeometry(), this.mat, trees.length);
    trees.forEach(([x, y, z, sc], i) => { dummy.position.set(x, y - 0.1, z); dummy.scale.setScalar(sc); dummy.rotation.set(0, rnd() * 6, 0); dummy.updateMatrix(); tm.setMatrixAt(i, dummy.matrix); tm.setColorAt(i, _c.setHSL(0.22 + rnd() * 0.06, 0.4, 0.42 + rnd() * 0.16)); });
    tm.castShadow = true; this.scene.add(tm);
    const rm = new THREE.InstancedMesh(rockGeometry(), this.matFlat, rocks.length);
    rocks.forEach(([x, y, z, sc], i) => { dummy.position.set(x, y + sc * 0.2, z); dummy.scale.set(sc, sc * (0.5 + rnd() * 0.6), sc * (0.7 + rnd() * 0.6)); dummy.rotation.set(rnd(), rnd() * 6, rnd()); dummy.updateMatrix(); rm.setMatrixAt(i, dummy.matrix); rm.setColorAt(i, _c.set(BANDS[i % BANDS.length]).multiplyScalar(0.7 + rnd() * 0.3)); });
    rm.castShadow = true; this.scene.add(rm);
  }

  _sky() {
    const scene = this.scene;
    this.skyU = { top: { value: new THREE.Color(0x4a6aa8) }, horizon: { value: new THREE.Color(0xf0b078) } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(880, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main(){ float h = clamp(vDir.y * 1.15 + 0.06, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }',
    }));
    sky.renderOrder = -10; scene.add(sky); this.sky = sky;
    // stars
    const sp = new Float32Array(900);
    for (let i = 0; i < 300; i++) { const a = hash(i, 1) * 6.283, e = 0.12 + hash(i, 2) * 1.3; sp[i * 3] = Math.cos(a) * Math.cos(e) * 850; sp[i * 3 + 1] = Math.sin(e) * 850; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 850; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff2d8, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);
    // twin suns
    const mk = (inner, mid, outer) => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, inner); gr.addColorStop(0.28, mid); gr.addColorStop(0.34, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      g.globalAlpha = 0.13; for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#000' : '#fff'; g.beginPath(); g.arc(64 + (hash(i, 5) - 0.5) * 34, 64 + (hash(i, 6) - 0.5) * 34, 2 + hash(i, 7) * 6, 0, 7); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const sunMat = (tex) => new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.sunA = new THREE.Sprite(sunMat(mk('#ffffff', '#dfeaff', 'rgba(150,190,255,0.55)')));
    this.sunB = new THREE.Sprite(sunMat(mk('#fff3d0', '#ffb45a', 'rgba(255,120,40,0.6)')));
    scene.add(this.sunA, this.sunB);
    // lights
    this.hemi = new THREE.HemisphereLight(0xffe2c0, 0x6a4a3a, 0.9); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 1.6); scene.add(this.sun, this.sun.target);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0015; this.sun.shadow.normalBias = 0.5;
    scene.fog = new THREE.Fog(0xf0b078, 150, 470);
  }

  _rail() {
    // One elevated line: from the buffer stop over the station lift, north across the flats, through Noon Butte
    // and on up the canyon toward the outside world.
    const len = RAIL_END - RAIL_FAR, cz = (RAIL_END + RAIL_FAR) / 2;
    const bm = makeMaterial({ transparent: true });
    const deck = new THREE.Mesh(bridgeGeometry(len, RAIL_H), bm);
    deck.position.set(RAIL_X, 0, cz); deck.rotation.y = Math.PI / 2; deck.castShadow = true; deck.matrixAutoUpdate = false; deck.updateMatrix(); this.scene.add(deck);
    this.bridges = [{ mesh: deck, mat: bm }];
    // buffer stop
    const stop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, 0.8), new THREE.MeshLambertMaterial({ color: 0xe0a21e }));
    stop.position.set(RAIL_X, RAIL_H + 1.1, RAIL_END - 0.3); this.scene.add(stop);
    // tunnel portals where the line enters and leaves the butte
    const face = (from, to, step) => { for (let z = from; step < 0 ? z > to : z < to; z += step) if (terrainH(RAIL_X, z) > RAIL_H + 7 && terrainH(RAIL_X - 4, z) > RAIL_H + 5 && terrainH(RAIL_X + 4, z) > RAIL_H + 5) return z; return null; };
    const stoneM = new THREE.MeshLambertMaterial({ color: 0x8a7462 }), darkM = new THREE.MeshBasicMaterial({ color: 0x0d0907 });
    this.portals = [];
    for (const [z, dir] of [[face(-110, -200, -0.5), 1], [face(-215, -120, 0.5), -1]]) {
      if (z == null) continue;
      const g = new THREE.Group(); g.position.set(RAIL_X, RAIL_H, z + dir * 0.6);
      const arch = new THREE.Mesh(new THREE.BoxGeometry(8.4, 9, 2.4), stoneM); arch.position.y = 4; g.add(arch);
      const hole = new THREE.Mesh(new THREE.BoxGeometry(5.4, 6.4, 2.5), darkM); hole.position.set(0, 2.7, dir * 0.05); g.add(hole);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.7, 2.8), new THREE.MeshLambertMaterial({ color: 0xc9951f })); lintel.position.y = 8.6; g.add(lintel);
      this.scene.add(g); this.portals.push(z);
    }
    const t = new THREE.Mesh(trainGeometry(), this.mat); t.castShadow = true; t.visible = false;
    this.scene.add(t); this.train = t;
    this.trainSmoke = new THREE.Vector3();
  }

  _nodes() {
    const geos = {};
    for (const nd of NODES) {
      const g = geos[nd.type] || (geos[nd.type] = nodeGeometry(nd.type));
      const m = new THREE.Mesh(g, this.mat);
      m.position.set(cellToWorld(nd.x + 1), 0, cellToWorld(nd.z + 1));
      m.rotation.y = hash(nd.x, nd.z) * 6; m.scale.setScalar(0.9 + nd.rich * 0.25);
      m.castShadow = true; this.scene.add(m);
      nd._mesh = m;
    }
  }

  // sim: Sim. Returns environment info used by the renderer.
  update(sim, cam, target) {
    const hour = sim.hour(), doy = sim.doy();
    const dn = Math.max(0, 1 - Math.abs(doy - 25) / 7);      // Double Noon intensity 0..1
    const heat = Math.min(1, sim.h);
    const t = (hour - 5) / 14;                                 // 05:00 -> 19:00
    const el = Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
    const day = sstep(-0.04, 0.2, t) * sstep(1.04, 0.8, t);
    const dusk = Math.max(0, 1 - Math.abs(el - 0.12) / 0.3) * (t > -0.1 && t < 1.1 ? 1 : 0);
    // suns
    const place = (spr, tt, zoff, scale) => {
      const e = Math.sin(Math.PI * tt) * (0.95 + dn * 0.25), a = Math.PI * tt;
      spr.position.set(cam.position.x + Math.cos(a) * 560, Math.max(-80, e * 430 - 20), cam.position.z - 520 - zoff);
      spr.scale.setScalar(scale * (1 + dn * 0.55));
      spr.visible = tt > -0.06 && tt < 1.06;
    };
    const sep = 0.085 - dn * 0.035;
    place(this.sunA, t + sep, 0, 120); place(this.sunB, t - sep, 30, 140);
    // sky colours
    const top = this.skyU.top.value, hor = this.skyU.horizon.value;
    top.set(0x0a0f24).lerp(_c.set(0x4f6fae), day).lerp(_c.set(0x8a5a66), heat * 0.55 * day).lerp(_c.set(0x5a3a6a), dusk * 0.55);
    hor.set(0x1a1630).lerp(_c.set(0xecc39a), day).lerp(_c.set(0xf5a25e), Math.min(1, heat * 0.7 + dn * 0.2) * day).lerp(_c.set(0xf07a3c), dusk * 0.75);
    this.scene.fog.color.copy(hor).lerp(top, 0.15);
    this.scene.fog.near = 140 - heat * 40; this.scene.fog.far = 430 - heat * 70;
    this.sky.position.copy(cam.position); this.stars.position.copy(cam.position);
    this.stars.material.opacity = Math.max(0, 0.9 - day * 1.6);
    // lights
    const sx = Math.cos(Math.PI * Math.max(0.12, Math.min(0.88, t))), sy = Math.max(0.42, el);
    this.sun.target.position.copy(target);
    this.sun.position.set(target.x + sx * 120, target.y + sy * 160, target.z - 70 + (day < 0.5 ? 140 : 0));
    this.sun.color.set(0x8fa4ff).lerp(_c.set(0xffe9c8), day).lerp(_c.set(0xffb070), Math.max(dusk * 0.7, heat * 0.35 * day));
    this.sun.intensity = 0.95 + day * (1.25 + dn * 0.45);
    this.hemi.intensity = 1.55 + day * -0.05;
    this.hemi.color.set(0x7888d8).lerp(_c.set(0xffe6c8), day);
    this.hemi.groundColor.set(0x43365a).lerp(_c.set(0x9a6a48), day);
    glowUniform.value = 1.5 - day * 1.15;
    // fade the viaduct when it stands between the camera and what the player is looking at
    for (const b of this.bridges) {
      // only when the line of sight actually passes under/through the deck
      let between = false; const cx = cam.position.x, tx = target.x;
      if ((cx - RAIL_X) * (tx - RAIL_X) < 0) { const t = (RAIL_X - cx) / (tx - cx), zc = cam.position.z + t * (target.z - cam.position.z), yc = cam.position.y + t * (target.y - cam.position.y); between = zc < RAIL_END + 3 && zc > RAIL_FAR && yc < RAIL_H + 9; }
      const want = between ? 0.16 : 1;
      b.mat.opacity += (want - b.mat.opacity) * 0.15; b.mat.depthWrite = b.mat.opacity > 0.9; b.mesh.castShadow = b.mat.opacity > 0.9;
    }
    // train: runs in from the north, stops with its nose at the station lift, then pulls back out the way it came
    // (a locomotive at each end, so it leads both ways). Times are in game hours.
    const S = sim.S, tr = this.train;
    const since = S.time - S.train.at, until = S.train.next - S.time;
    const stopZ = RAIL_END - 4.2;
    let z = null, out = false;
    if (until < 1.2) z = stopZ - 290 * Math.pow(until / 1.2, 1.7);
    else if (since >= 0 && since < 5) z = stopZ;
    else if (since >= 5 && since < 6.4) { z = stopZ - 300 * Math.pow((since - 5) / 1.4, 1.8); out = true; }
    tr.visible = z !== null && z > RAIL_FAR - 10;
    if (z !== null) { tr.position.set(RAIL_X, RAIL_H + 0.5, z); tr.rotation.y = -Math.PI / 2; this.trainSmoke.set(RAIL_X, RAIL_H + 4.6, out ? z - 33.6 : z + 1.6); }
    this.trainMoving = tr.visible && !(since >= 0 && since < 5);
    return { day, heat, dn, dusk };
  }

  setShadows(on) { this.sun.castShadow = on; }
}
