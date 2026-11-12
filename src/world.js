// Static world: canyon terrain, sky, twin suns, lighting, the High Noon viaduct.
import * as THREE from 'three';
import { N, CELL, NODES } from './data.js';
import { hash, noise, sstep, terrainH, RAIL_X, RAIL_H, RAIL_END, RAIL_FAR } from './terrain.js';
export { terrainH };
import { G, PAL, setSeed, bridgeGeometry, trainGeometry, treeGeometry, rockGeometry, nodeGeometry } from './models.js';
import { makeMaterial, makeTerrainMaterial, glowUniform, U } from './surface.js';

export const HALF = N * CELL / 2;
export const cellToWorld = (c) => (c - N / 2) * CELL;            // cell corner -> world
export const cellCenter = (c) => (c - N / 2 + 0.5) * CELL;
export const worldToCell = (w) => Math.floor(w / CELL + N / 2);

const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3();
const ROCK_TINT = [0xa25a3a, 0xbd7046, 0xa95f3c, 0xcb8a58, 0x96503a, 0xb8744c, 0xc28055];

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

  // One mesh for the whole canyon. Vertices are packed more densely around the settlement, cliff faces are
  // pushed in and out to form buttresses and gullies (visual only: the simulation keeps using terrainH).
  _terrain() {
    const size = 580, seg = 184, half = size / 2;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const P = geo.attributes.position, warp = (v) => { const w = v / half, a = Math.abs(w); return Math.sign(w) * (a * 0.5 + a * a * a * 0.5) * half; };
    for (let i = 0; i < P.count; i++) {
      let x = warp(P.getX(i)), z = warp(P.getZ(i)); const h = terrainH(x, z);
      if (h > 1.5) {
        const gx = terrainH(x + 1.5, z) - terrainH(x - 1.5, z), gz = terrainH(x, z + 1.5) - terrainH(x, z - 1.5), gl = Math.hypot(gx, gz);
        if (gl > 0.25) { const f = (noise(x * 0.17 + 3, z * 0.17) - 0.5) * 2 + (noise(x * 0.5, z * 0.5 + 9) - 0.5) * 0.6, amp = sstep(1.5, 10, h) * 2.6; x -= gx / gl * f * amp; z -= gz / gl * f * amp; }
      }
      P.setXYZ(i, x, Math.max(0, h - 0.35), z);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.terrainMat = makeTerrainMaterial());
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    this.scene.add(mesh); this.terrain = mesh;
  }

  _decor() {
    let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const trees = [], rocks = [];
    for (let i = 0; i < 5200 && trees.length < 520; i++) {
      const x = (rnd() - 0.5) * 520, z = (rnd() - 0.5) * 520, h = terrainH(x, z);
      if (h > 43 && noise(x * 0.03, z * 0.03 + 5) > 0.4) trees.push([x, h - 0.35, z, 1.8 + rnd() * 2.4]);
    }
    // boulders and scree: at the foot of the walls and on the ledges
    for (let i = 0; i < 4200 && rocks.length < 380; i++) {
      const x = (rnd() - 0.5) * 320, z = (rnd() - 0.5) * 320, h = terrainH(x, z);
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if ((h > 0.4 && h < 40) || (edge > 60 && h < 0.3 && rnd() < 0.5)) rocks.push([x, Math.max(0, h - 0.35), z, 0.4 + rnd() * (h > 1 ? 2.8 : 0.8)]);
    }
    for (let i = 0; i < 500; i++) { const x = (rnd() - 0.5) * 150, z = (rnd() - 0.5) * 150; if (Math.max(Math.abs(x), Math.abs(z)) > 62 && terrainH(x, z) < 1) trees.push([x, Math.max(0, terrainH(x, z) - 0.35), z, 0.5 + rnd() * 0.5]); }
    const dummy = new THREE.Object3D();
    const tm = new THREE.InstancedMesh(treeGeometry(), this.mat, trees.length);
    trees.forEach(([x, y, z, sc], i) => { dummy.position.set(x, y - 0.1, z); dummy.scale.set(sc * (0.9 + rnd() * 0.5), sc, sc * (0.9 + rnd() * 0.5)); dummy.rotation.set(0, rnd() * 6, 0); dummy.updateMatrix(); tm.setMatrixAt(i, dummy.matrix); tm.setColorAt(i, _c.setHSL(0.17 + rnd() * 0.08, 0.32 + rnd() * 0.12, 0.36 + rnd() * 0.16)); });
    tm.castShadow = true; this.scene.add(tm);
    const rm = new THREE.InstancedMesh(rockGeometry(), this.mat, rocks.length);
    rocks.forEach(([x, y, z, sc], i) => { dummy.position.set(x, y + sc * 0.15, z); dummy.scale.set(sc, sc * (0.5 + rnd() * 0.6), sc * (0.7 + rnd() * 0.6)); dummy.rotation.set(rnd() * 0.5, rnd() * 6, rnd() * 0.5); dummy.updateMatrix(); rm.setMatrixAt(i, dummy.matrix); rm.setColorAt(i, _c.set(ROCK_TINT[i % ROCK_TINT.length]).multiplyScalar(0.75 + rnd() * 0.3)); });
    rm.castShadow = true; rm.receiveShadow = true; this.scene.add(rm);
  }

  _sky() {
    const scene = this.scene;
    this.skyU = { top: { value: new THREE.Color(0x4a6aa8) }, horizon: { value: new THREE.Color(0xf0b078) }, cloud: { value: new THREE.Color(0xffffff) }, uCloud: { value: 1 }, uDet: U.uDet, uTime: U.uTime };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(880, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `precision highp sampler2DArray; uniform vec3 top; uniform vec3 horizon; uniform vec3 cloud; uniform float uCloud; uniform float uTime; uniform sampler2DArray uDet; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = clamp(d.y * 1.15 + 0.06, 0.0, 1.0); vec3 col = mix(horizon, top, pow(h, 0.5));
          if (uCloud > 0.0 && d.y > 0.01) { vec2 uv = d.xz / (d.y + 0.16) * 0.085 + vec2(uTime * 0.0012, 0.0);
            float n = texture(uDet, vec3(uv, 0.0)).a * 0.62 + texture(uDet, vec3(uv * 2.9 + 0.31, 0.0)).a * 0.38;
            float c = smoothstep(0.50, 0.70, n) * smoothstep(0.01, 0.16, d.y);
            vec3 lit = mix(cloud, horizon * 1.25, 0.55 * (1.0 - smoothstep(0.05, 0.5, d.y)));
            col = mix(col, lit * (0.72 + 0.4 * smoothstep(0.55, 0.8, n)), c * 0.8 * uCloud); }
          gl_FragColor = vec4(col, 1.0); }`,
    }));
    sky.renderOrder = -10; scene.add(sky); this.sky = sky;
    const sp = new Float32Array(900);
    for (let i = 0; i < 300; i++) { const a = hash(i, 1) * 6.283, e = 0.12 + hash(i, 2) * 1.3; sp[i * 3] = Math.cos(a) * Math.cos(e) * 850; sp[i * 3 + 1] = Math.sin(e) * 850; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 850; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff2d8, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);
    // twin suns: a hard disc inside a wide corona
    const mk = (inner, mid, outer) => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 2, 128, 128, 128);
      gr.addColorStop(0, inner); gr.addColorStop(0.15, mid); gr.addColorStop(0.19, outer); gr.addColorStop(0.5, outer.replace(/[\d.]+\)$/, '0.12)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.globalAlpha = 0.1; for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#000' : '#fff'; g.beginPath(); g.arc(128 + (hash(i, 5) - 0.5) * 36, 128 + (hash(i, 6) - 0.5) * 36, 2 + hash(i, 7) * 6, 0, 7); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const sunMat = (tex) => new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.sunA = new THREE.Sprite(sunMat(mk('#ffffff', '#e6efff', 'rgba(160,195,255,0.5)')));
    this.sunB = new THREE.Sprite(sunMat(mk('#fff3d0', '#ffb45a', 'rgba(255,120,40,0.55)')));
    scene.add(this.sunA, this.sunB);
    // key light (the suns), sky/ground ambient, and a warm bounce off the canyon walls to fill the shadow side
    this.hemi = new THREE.HemisphereLight(0xffe2c0, 0x6a4a3a, 0.8); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4); scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0xffb98a, 0.5); scene.add(this.fill, this.fill.target);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera; sc.near = 10; sc.far = 520; this.shadowSize = 0;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.35;
    scene.fog = new THREE.Fog(0xf0b078, 150, 470);
  }
  setShadowQuality(px) { if (this.sun.shadow.mapSize.x === px) return; this.sun.shadow.mapSize.set(px, px); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }

  _rail() {
    // One elevated line: from the buffer stop over the station lift, north across the flats on stone arches,
    // through Noon Butte and on up the canyon toward the outside world.
    const len = RAIL_END - RAIL_FAR, cz = (RAIL_END + RAIL_FAR) / 2;
    const bm = makeMaterial({ transparent: true });
    const deck = new THREE.Mesh(bridgeGeometry(len, RAIL_H), bm);
    deck.position.set(RAIL_X, 0, cz); deck.rotation.y = Math.PI / 2; deck.castShadow = true; deck.receiveShadow = true; deck.matrixAutoUpdate = false; deck.updateMatrix(); this.scene.add(deck);
    this.bridges = [{ mesh: deck, mat: bm }];
    this.railLamps = (deck.geometry.userData.lamps || []).map(([x, y, z]) => [RAIL_X + z, y, cz - x]).filter(p => terrainH(p[0], p[2]) < RAIL_H - 2);
    // buffer stop and tunnel portals where the line enters and leaves the butte
    setSeed(78); const g = new G();
    g.box(0, RAIL_H + 0.2, RAIL_END - 0.4, 3.4, 1.3, 0.8, PAL.yellow); g.hazard(0, RAIL_H + 1.5, RAIL_END - 0.4, 3.4, 0.14, 0.8);
    const face = (from, to, step) => { for (let z = from; step < 0 ? z > to : z < to; z += step) if (terrainH(RAIL_X, z) > RAIL_H + 7 && terrainH(RAIL_X - 4, z) > RAIL_H + 5 && terrainH(RAIL_X + 4, z) > RAIL_H + 5) return z; return null; };
    this.portals = [];
    for (const [z, dir] of [[face(-110, -200, -0.5), 1], [face(-215, -120, 0.5), -1]]) {
      if (z == null) continue; const pz = z + dir * 0.6;
      for (const s of [-1, 1]) g.box(s * 3.4, RAIL_H - 0.5, pz, 1.6, 8.2, 2.6, PAL.stone);
      g.box(0, RAIL_H + 6.6, pz, 8.4, 2.4, 2.6, PAL.stone); g.box(0, RAIL_H + 9.0, pz, 9.4, 0.6, 3.0, PAL.stoneD); g.box(0, RAIL_H + 7.3, pz + dir * 1.32, 1.4, 1.4, 0.1, PAL.brass);
      g.box(0, RAIL_H, pz - dir * 0.2, 5.4, 6.7, 2.2, 0x0b0806, { flat: true, layer: 0 });
      this.portals.push(z);
    }
    const pm = new THREE.Mesh(g.done(), this.mat); pm.position.x = RAIL_X; pm.castShadow = true; this.scene.add(pm);
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
  update(sim, cam, target, camDist = 80) {
    const hour = sim.hour(), doy = sim.doy();
    const dn = Math.max(0, 1 - Math.abs(doy - 25) / 7);      // Double Noon intensity 0..1
    const heat = Math.min(1, sim.h);
    const t = (hour - 5) / 14;                                 // 05:00 -> 19:00
    const el = Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
    const day = sstep(-0.04, 0.2, t) * sstep(1.04, 0.8, t);
    const dusk = Math.max(0, 1 - Math.abs(el - 0.12) / 0.3) * (t > -0.1 && t < 1.1 ? 1 : 0);
    const low = day * (1 - el);                               // long golden light at either end of the day
    // suns
    const place = (spr, tt, zoff, scale) => {
      const e = Math.sin(Math.PI * tt) * (0.95 + dn * 0.25), a = Math.PI * tt;
      spr.position.set(cam.position.x + Math.cos(a) * 560, Math.max(-80, e * 430 - 20), cam.position.z - 520 - zoff);
      spr.scale.setScalar(scale * (1 + dn * 0.55));
      spr.visible = tt > -0.06 && tt < 1.06;
    };
    const sep = 0.085 - dn * 0.035;
    place(this.sunA, t + sep, 0, 230); place(this.sunB, t - sep, 30, 270);
    // sky
    const top = this.skyU.top.value, hor = this.skyU.horizon.value;
    top.set(0x070b1c).lerp(_c.set(0x3f66b5), day).lerp(_c.set(0x86586a), heat * 0.55 * day).lerp(_c.set(0x4a2f72), Math.min(1, dusk * 0.8 + low * 0.25));
    hor.set(0x161226).lerp(_c.set(0xf0c8a0), day).lerp(_c.set(0xf7a45c), Math.min(1, heat * 0.7 + dn * 0.2) * day).lerp(_c.set(0xff7e3e), Math.min(1, dusk * 0.85 + low * 0.3));
    this.skyU.cloud.value.set(0x2a2640).lerp(_c.set(0xfff4e4), day).lerp(_c.set(0xffa878), Math.min(1, dusk + low * 0.4));
    this.scene.fog.color.copy(hor).lerp(top, 0.18);
    this.scene.fog.near = 150 - heat * 40; this.scene.fog.far = 470 - heat * 80;
    this.sky.position.copy(cam.position); this.stars.position.copy(cam.position);
    this.stars.material.opacity = Math.max(0, 0.9 - day * 1.6);
    // key light: comes from the suns' side of the sky (north), sweeping east to west and never straight overhead
    // except in Double Noon, so shadows stay long and fall toward the camera
    const az = Math.cos(Math.PI * Math.max(0.1, Math.min(0.9, t))), sy = (0.3 + 0.55 * el) * (1 + dn * 0.9);
    _v.set(az * 1.0, sy, -0.62 + dn * 0.3).normalize();
    if (day < 0.5) _v.set(-0.35, 0.8, 0.5).normalize();        // moonlight from the south
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(_v, 260);
    this.sun.color.set(0x7f95ff).lerp(_c.set(0xfff0d6), day).lerp(_c.set(0xffb070), Math.min(1, Math.max(dusk * 0.8, low * 0.62, heat * 0.3 * day)));
    this.sun.intensity = 0.75 + day * (1.75 + dn * 0.9);
    this.fill.target.position.copy(target); this.fill.position.set(target.x - _v.x * 120, target.y + 70, target.z - _v.z * 160);
    this.fill.color.set(0x5868b0).lerp(_c.set(0xffb586), day); this.fill.intensity = 0.3 + day * 0.5;
    this.hemi.intensity = 0.8 + day * 0.32 + dn * 0.2;
    this.hemi.color.set(0x6272c8).lerp(_c.set(0xcfe0ff), day).lerp(_c.set(0xffd8b0), Math.min(1, low * 0.7 + heat * 0.5));
    this.hemi.groundColor.set(0x2e2644).lerp(_c.set(0xa86a44), day);
    // shadow frustum follows the zoom so close views get sharp shadows
    const size = Math.max(26, Math.min(100, camDist * 0.8));
    if (Math.abs(size - this.shadowSize) > this.shadowSize * 0.06) { this.shadowSize = size; const sc = this.sun.shadow.camera; sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.updateProjectionMatrix(); }
    // shared surface uniforms
    glowUniform.value = 1.9 - day * 1.5;
    U.uNight.value = 1 - day; U.uWater.value = 0.6 + 0.4 * day;
    U.uHaze.value = 0.3 + heat * 0.22 + low * 0.14 + (1 - day) * 0.1;
    U.uRim.value.copy(hor).multiplyScalar(0.3 + 0.25 * day);
    this.skyU.uCloud.value = this.clouds === false ? 0 : 1 - heat * 0.5;
    // fade the viaduct when it stands between the camera and what the player is looking at
    for (const b of this.bridges) {
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
    return { day, heat, dn, dusk, low };
  }

  setShadows(on) { this.sun.castShadow = on; }
}
