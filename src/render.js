// View: turns simulation state into the 3D scene every frame.
import * as THREE from 'three';
import { N, CELL, B, ZONES, NODES, NODE_RANGE, HW, CLICKERS } from './data.js';
import { footprint, cellZone } from './sim.js';
import { World, cellToWorld, HALF, worldToCell, terrainH } from './world.js';
import { makeMaterial, buildingGeometry, heartwellGeometry, clickerGeometry, personGeometry, PAL } from './models.js';

const _v = new THREE.Vector3(), _d = new THREE.Object3D(), _col = new THREE.Color();
const CLOTH = [0xcdb58f, 0x8a5f3c, 0x3d3a4a, 0xd89a22, 0x9c3f32, 0x3f7f86, 0x6f6a5c, 0xb8763c];
const SKIN = [0xe6b98f, 0xc68e5e, 0x9a6540, 0x6f452c, 0xd9a577, 0x855536];
const MAX_AGENTS = 84, MAX_PART = 420;

export class View {
  constructor(canvas, sim) {
    this.sim = sim; this.canvas = canvas;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.mobile = mobile;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 2);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 1900);
    this.cam = { target: new THREE.Vector3(0, 0, 3), yaw: 0.42, pitch: 0.84, dist: 74 };
    this.world = new World(this.scene);
    this.mat = this.world.mat;
    this.geo = {}; this.bm = new Map(); this.cm = new Map();
    this.seenVersion = -1; this.env = { day: 1, heat: 0, dn: 0 };
    this.overlayMode = 'none'; this.placing = null; this.selected = null;
    this.clock = 0; this.overlayTimer = 0; this.statusTimer = 0;
    this._lines(); this._overlay(); this._ghost(); this._selection(); this._people(); this._particles(); this._status(); this._zoneLines();
    this.setShadows(true);
    this.resize();
  }

  // ---------------------------------------------------------------- setup
  setShadows(on) { this.shadows = on; this.renderer.shadowMap.enabled = on; this.world.setShadows(on); this.mat.needsUpdate = true; this.world.matFlat.needsUpdate = true; }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.fov = w < h ? 46 : 38; this.camera.updateProjectionMatrix();
    if (this.pU) this.pU.uScale.value = h * this.pixelRatio * 0.9;
  }
  _lines() {
    const rg = new THREE.BoxGeometry(CELL * 0.995, 0.07, CELL * 0.995);
    const c = new Float32Array(rg.attributes.position.count * 3).fill(1); rg.setAttribute('color', new THREE.BufferAttribute(c, 3)); rg.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(rg.attributes.position.count), 1));
    this.roads = new THREE.InstancedMesh(rg, this.mat, 2600); this.roads.receiveShadow = true; this.roads.count = 0; this.scene.add(this.roads);
    const pg = new THREE.BoxGeometry(1, 0.26, 0.26);
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pg.attributes.position.count * 3).fill(1), 3)); pg.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(pg.attributes.position.count).fill(0.25), 1));
    this.pipes = new THREE.InstancedMesh(pg, this.mat, 3000); this.pipes.count = 0; this.scene.add(this.pipes);
  }
  _overlay() {
    this.ovData = new Uint8Array(N * N * 4);
    this.ovTex = new THREE.DataTexture(this.ovData, N, N, THREE.RGBAFormat); this.ovTex.magFilter = THREE.NearestFilter; this.ovTex.minFilter = THREE.NearestFilter;
    this.ovU = { map: { value: this.ovTex }, grid: { value: 0 } };
    const g = new THREE.PlaneGeometry(HALF * 2, HALF * 2); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.ovU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D map; uniform float grid; varying vec2 vUv;
        void main(){ vec4 c = texture2D(map, vUv); vec2 g = abs(fract(vUv*${N}.0)-0.5); float line = step(0.455, max(g.x,g.y)) * step(0.004, c.a) * grid;
        c.rgb = mix(c.rgb, vec3(1.0,0.86,0.55), line*0.7); c.a = max(c.a, line*0.4); gl_FragColor = c; }`,
    }));
    m.position.y = 0.12; m.renderOrder = 2; m.visible = false; this.scene.add(m); this.ovMesh = m;
  }
  _ghost() {
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.55, depthWrite: false });
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ghostMat); this.ghost.visible = false; this.ghost.renderOrder = 5; this.scene.add(this.ghost);
    this.ghostPad = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.35, depthWrite: false }));
    this.ghostPad.visible = false; this.ghostPad.renderOrder = 4; this.scene.add(this.ghostPad);
    const pts = []; for (let i = 0; i <= 64; i++) pts.push(new THREE.Vector3(Math.cos(i / 64 * 6.2832), 0, Math.sin(i / 64 * 6.2832)));
    this.ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.9 }));
    this.ring.visible = false; this.scene.add(this.ring);
  }
  _selection() {
    const m = new THREE.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.95, depthTest: false });
    this.sel = new THREE.Group(); this.sel.renderOrder = 6;
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), m); b.renderOrder = 6; this.sel.add(b); }
    this.sel.visible = false; this.scene.add(this.sel);
  }
  _zoneLines() {
    this.zoneLines = {};
    const mat = new THREE.LineDashedMaterial({ color: 0xe8c96a, dashSize: 2, gapSize: 1.5, transparent: true, opacity: 0.7 });
    for (const k in ZONES) {
      if (k === 'core') continue;
      const q = ZONES[k], x0 = cellToWorld(q.x0), x1 = cellToWorld(q.x1 + 1), z0 = cellToWorld(q.z0), z1 = cellToWorld(q.z1 + 1);
      const g = new THREE.BufferGeometry().setFromPoints([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].map(([x, z]) => new THREE.Vector3(x, 0.25, z)));
      const l = new THREE.Line(g, mat); l.computeLineDistances(); this.scene.add(l); this.zoneLines[k] = l;
    }
  }
  _people() {
    const pg = personGeometry();
    this.pBody = new THREE.InstancedMesh(pg.body, this.mat, MAX_AGENTS); this.pHead = new THREE.InstancedMesh(pg.head, this.mat, MAX_AGENTS);
    this.pBody.frustumCulled = false; this.pHead.frustumCulled = false; this.pBody.castShadow = true;
    this.scene.add(this.pBody, this.pHead);
    this.agents = [];
    for (let i = 0; i < MAX_AGENTS; i++) {
      this.agents.push({ i, x: 0, z: 0, path: [], dest: null, state: 'none', home: null, job: null, timer: Math.random() * 3, dir: 0, phase: Math.random() * 6, vis: false, carry: false });
      this.pBody.setColorAt(i, _col.set(CLOTH[i % CLOTH.length])); this.pHead.setColorAt(i, _col.set(SKIN[(i * 7) % SKIN.length]));
    }
    this.agentCount = 0; this.agentsDirty = true;
  }
  _particles() {
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PART * 3); this.pCol = new Float32Array(MAX_PART * 4); this.pSize = new Float32Array(MAX_PART);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3)); g.setAttribute('pc', new THREE.BufferAttribute(this.pCol, 4)); g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    this.pU = { uScale: { value: 600 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.pU, transparent: true, depthWrite: false,
      vertexShader: 'attribute float size; attribute vec4 pc; varying vec4 vC; uniform float uScale; void main(){ vC = pc; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.12, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }',
    });
    this.pMesh = new THREE.Points(g, m); this.pMesh.frustumCulled = false; this.pMesh.renderOrder = 3; this.scene.add(this.pMesh);
    this.parts = []; for (let i = 0; i < MAX_PART; i++) this.parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, grow: 0, r: 1, g: 1, b: 1, a: 1 });
    this.pNext = 0;
  }
  _status() {
    const mk = (fill) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.beginPath(); g.moveTo(32, 5); g.lineTo(60, 56); g.lineTo(4, 56); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 4; g.strokeStyle = '#1a1208'; g.stroke(); g.fillStyle = '#1a1208'; g.fillRect(29, 22, 6, 18); g.fillRect(29, 44, 6, 6); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    this.stMat = { warn: new THREE.SpriteMaterial({ map: mk('#ffc83a'), depthTest: false, transparent: true }), crit: new THREE.SpriteMaterial({ map: mk('#ff5a40'), depthTest: false, transparent: true }) };
    this.stSprites = [];
    for (let i = 0; i < 36; i++) { const s = new THREE.Sprite(this.stMat.warn); s.visible = false; s.renderOrder = 8; this.scene.add(s); this.stSprites.push(s); }
  }

  // ---------------------------------------------------------------- sync with sim
  geoFor(type) { return this.geo[type] || (this.geo[type] = buildingGeometry(type)); }
  sync() {
    const sim = this.sim, S = sim.S;
    this.seenVersion = sim.version;
    const seen = new Set();
    for (const b of S.buildings) {
      seen.add(b.id);
      const key = b.type + ':' + b.rot + ':' + b.x + ':' + b.z + (b.type === 'heartwell' ? JSON.stringify(S.hw.lv) : '');
      let e = this.bm.get(b.id);
      if (!e || e.key !== key) { if (e) this._dropB(e); e = this._makeB(b, key); this.bm.set(b.id, e); }
      e.b = b;
      const building = b.progress != null || !!b.upgrade;
      e.scaf.visible = building;
      if (b.progress == null) e.mesh.scale.y = 1;
    }
    for (const [id, e] of this.bm) if (!seen.has(id)) { this._dropB(e); this.bm.delete(id); }
    // roads
    let n = 0;
    for (let i = 0; i < N * N && n < 2600; i++) {
      if (!S.roads[i]) continue;
      const x = i % N, z = (i / N) | 0;
      _d.position.set(cellToWorld(x) + 1, 0.06, cellToWorld(z) + 1); _d.rotation.set(0, 0, 0); _d.scale.set(1, 1, 1); _d.updateMatrix();
      this.roads.setMatrixAt(n, _d.matrix);
      const v = 0.86 + ((x * 31 + z * 17) % 7) * 0.02;
      this.roads.setColorAt(n, _col.setRGB(0.34 * v, 0.27 * v, 0.21 * v)); n++;
    }
    this.roads.count = n; this.roads.instanceMatrix.needsUpdate = true; if (this.roads.instanceColor) this.roads.instanceColor.needsUpdate = true;
    // pipes
    n = 0; const P = S.pipes, occ = sim.C.occ, net = sim.C.pipeNet;
    const hwF = sim.C.hwF;
    const linkTo = (x, z) => P[z * N + x] || (x >= hwF.x && x < hwF.x + hwF.w && z >= hwF.z && z < hwF.z + hwF.d);
    for (let i = 0; i < N * N && n < 2990; i++) {
      if (!P[i] || occ[i] > 0) continue;
      const x = i % N, z = (i / N) | 0, wx = cellToWorld(x) + 1, wz = cellToWorld(z) + 1;
      const on = net[i]; _col.setHex(on ? 0x3f8fc4 : 0x8a6a4a);
      const ex = linkTo(x - 1, z) || linkTo(x + 1, z), ez = linkTo(x, z - 1) || linkTo(x, z + 1);
      const seg = (len, rot, ox, oz) => { _d.position.set(wx + ox, 0.24, wz + oz); _d.rotation.set(0, rot, 0); _d.scale.set(len, 1, 1); _d.updateMatrix(); this.pipes.setMatrixAt(n, _d.matrix); this.pipes.setColorAt(n, _col); n++; };
      if (ex || !ez) { const l = linkTo(x - 1, z), r = linkTo(x + 1, z); const a = l ? -1 : -0.3, b2 = r ? 1 : 0.3; seg((b2 - a), 0, (a + b2) / 2, 0); }
      if (ez) { const u = linkTo(x, z - 1), dn = linkTo(x, z + 1); const a = u ? -1 : -0.3, b2 = dn ? 1 : 0.3; seg((b2 - a), Math.PI / 2, 0, (a + b2) / 2); }
    }
    this.pipes.count = n; this.pipes.instanceMatrix.needsUpdate = true; if (this.pipes.instanceColor) this.pipes.instanceColor.needsUpdate = true;
    for (const k in this.zoneLines) this.zoneLines[k].visible = !S.zones[k];
    this.agentsDirty = true;
    this.fillOverlay();
    this.setSelected(this.selected);
  }
  _makeB(b, key) {
    const f = footprint(b), def = B[b.type];
    const group = new THREE.Group();
    group.position.set(cellToWorld(f.x) + f.w, 0, cellToWorld(f.z) + f.d);
    const e = { key, b, group, smoke: [], hw: null };
    let geo;
    if (b.type === 'heartwell') {
      const hg = heartwellGeometry(this.sim.S.hw.lv);
      geo = hg.static; e.ownGeo = [hg.static, hg.wheel];
      const wheels = [-1, 1].map(s => { const w = new THREE.Mesh(hg.wheel, this.mat); w.position.set(s * 5.3, 0.9, 0); w.castShadow = true; group.add(w); return w; });
      const wm = new THREE.MeshLambertMaterial({ color: 0x48cfee, emissive: 0x145e7c, transparent: true, opacity: 0.9 });
      const mkArc = (a0) => { const g = new THREE.RingGeometry(3.72, 7.5, 28, 1, a0, Math.PI * 0.66); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, wm); group.add(m); return m; };
      const pools = [mkArc(Math.PI * 0.17), mkArc(Math.PI * 1.17)];
      const bm2 = new THREE.MeshLambertMaterial({ color: 0x3aa8c8, emissive: 0x0e4860, transparent: true, opacity: 0.9 });
      const basins = [-1, 1].map(s => { const g = new THREE.PlaneGeometry(4.5, 2.2); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, bm2); m.position.set(s * 5.3, 0.5, 0); group.add(m); return m; });
      e.hw = { wheels, pools, basins, mats: [wm, bm2], spin: [0, 0] };
    } else geo = this.geoFor(b.type);
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.rotation.y = b.rot * Math.PI / 2; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.bid = b.id;
    group.add(mesh); e.mesh = mesh;
    const h = Math.min(8, (geo.boundingBox.max.y || 3));
    const sg = this._scafGeo || (this._scafGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)));
    const scaf = new THREE.LineSegments(sg, this._scafMat || (this._scafMat = new THREE.LineBasicMaterial({ color: 0xe8a61c })));
    scaf.scale.set(f.w * CELL - 0.2, h, f.d * CELL - 0.2); scaf.position.y = h / 2; scaf.visible = false; group.add(scaf); e.scaf = scaf; e.h = h;
    const cs = Math.cos(mesh.rotation.y), sn = Math.sin(mesh.rotation.y);
    for (const [x, y, z] of geo.userData.smoke || []) e.smoke.push([group.position.x + x * cs + z * sn, y, group.position.z - x * sn + z * cs]);
    this.scene.add(group);
    e.cx = group.position.x; e.cz = group.position.z; e.def = def;
    return e;
  }
  _dropB(e) { this.scene.remove(e.group); if (e.ownGeo) e.ownGeo.forEach(g => g.dispose()); if (e.hw) e.hw.mats.forEach(m => m.dispose()); }

  // ---------------------------------------------------------------- overlays
  setOverlay(mode) { this.overlayMode = mode; this.fillOverlay(); }
  fillOverlay() {
    const sim = this.sim, S = sim.S, C = sim.C, D = this.ovData;
    const mode = this.placing ? 'build' : this.overlayMode;
    this.ovMesh.visible = mode !== 'none';
    if (mode === 'none') return;
    D.fill(0);
    const set = (x, z, r, g, b, a) => { const o = ((N - 1 - z) * N + x) * 4; D[o] = r; D[o + 1] = g; D[o + 2] = b; D[o + 3] = a; };
    const pdef = this.placing ? B[this.placing.type] : null;
    this.ovU.grid.value = mode === 'build' ? 1 : 0.35;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const zone = cellZone(x, z); if (!zone) continue;
      const i = z * N + x, claimed = zone === 'bridge' || S.zones[zone];
      const occ = C.occ[i];
      if (mode === 'build') {
        if (!claimed) { set(x, z, 20, 12, 8, 70); continue; }
        if (zone === 'bridge' && !(pdef && pdef.line)) { set(x, z, 20, 12, 8, 40); continue; }
        if (pdef && pdef.wantsWater && C.waterCov[i]) set(x, z, 70, 170, 255, occ ? 20 : 70);
        else if (pdef && pdef.power && C.powerCov[i]) set(x, z, 255, 215, 70, occ ? 20 : 70);
        else set(x, z, 255, 225, 170, occ ? 6 : 26);
      } else if (mode === 'water') {
        if (C.waterCov[i]) set(x, z, 60, 165, 255, 95); else if (claimed) set(x, z, 30, 30, 40, 40);
        if (S.pipes[i]) C.pipeNet[i] ? set(x, z, 120, 240, 255, 230) : set(x, z, 255, 150, 60, 230);
      } else if (mode === 'power') {
        if (C.powerCov[i]) set(x, z, 255, 212, 70, 90); else if (claimed) set(x, z, 30, 30, 40, 40);
      } else if (mode === 'heat') {
        const h = Math.min(1, sim.h); if (claimed) set(x, z, 255, 120 - h * 60, 40, 20 + h * 70);
      } else if (mode === 'resource') {
        if (S.roads[i]) C.linkNet[i] ? set(x, z, 90, 230, 120, 150) : set(x, z, 255, 110, 70, 170);
        else if (claimed) set(x, z, 30, 30, 40, 30);
      }
    }
    if (mode === 'build' && pdef && pdef.node || mode === 'resource') {
      const colr = { forest: [80, 220, 90], rock: [210, 200, 185], ore: [240, 130, 60], vent: [90, 235, 255] };
      for (const nd of NODES) {
        if (mode === 'build' && nd.type !== pdef.node) continue;
        const c = colr[nd.type];
        for (let z = nd.z - NODE_RANGE; z <= nd.z + 1 + NODE_RANGE; z++) for (let x = nd.x - NODE_RANGE; x <= nd.x + 1 + NODE_RANGE; x++) {
          if (x < 0 || z < 0 || x >= N || z >= N || !cellZone(x, z)) continue;
          const edge = x === nd.x - NODE_RANGE || x === nd.x + 1 + NODE_RANGE || z === nd.z - NODE_RANGE || z === nd.z + 1 + NODE_RANGE;
          set(x, z, c[0], c[1], c[2], edge ? 150 : 60);
        }
      }
    }
    if (mode !== 'build') for (const b of S.buildings) {
      const def = B[b.type], f = footprint(b), info = C.info[b.id]; let c = null;
      if (mode === 'water') { if (def.wantsWater) c = info.watered ? [70, 230, 140, 210] : [255, 70, 50, 230]; else if (def.waterRadius) c = C.onNet[b.id] ? [120, 240, 255, 230] : [255, 150, 60, 230]; }
      else if (mode === 'power') { if (def.power) c = info.powered ? [70, 230, 140, 210] : [255, 70, 50, 230]; else if (def.powerRadius || b.type === 'heartwell') c = (b.type !== 'pylon' || C.pylonOn[b.id]) ? [255, 240, 150, 230] : [255, 110, 60, 230]; }
      else if (mode === 'heat') { if (def.housing && b.progress == null) { const p = b.prot || 0; c = [255 * (1 - p), 60 + 190 * p, 60, 230]; } else if (b.type === 'shade') c = [120, 220, 255, 230]; }
      else if (mode === 'resource') { if ((def.out || def.workers) && b.progress == null) { const e = Math.min(1, b.eff || 0); c = [255 * (1 - e), 70 + 170 * e, 60, 220]; } }
      if (c) for (let z = f.z; z < f.z + f.d; z++) for (let x = f.x; x < f.x + f.w; x++) set(x, z, c[0], c[1], c[2], c[3]);
    }
    if (mode === 'heat') for (const b of S.buildings) if (b.type === 'shade' && b.progress == null) { const f = footprint(b), r = B.shade.shadeRadius; for (let z = f.z - r; z < f.z + f.d + r; z++) for (let x = f.x - r; x < f.x + f.w + r; x++) if (x >= 0 && z >= 0 && x < N && z < N && !sim.C.occ[z * N + x] && cellZone(x, z)) set(x, z, 110, 200, 255, 80); }
    this.ovTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- placement ghost & selection
  setGhost(type, x, z, rot, ok) {
    if (!type) { this.ghost.visible = false; this.ghostPad.visible = false; this.ring.visible = false; if (this.placing) { this.placing = null; this.fillOverlay(); } return; }
    const def = B[type], f = footprint({ type, x, z, rot });
    const changed = !this.placing || this.placing.type !== type;
    this.placing = { type };
    if (changed) { this.fillOverlay(); this.ghost.geometry = def.line ? this._tileGeo || (this._tileGeo = new THREE.BoxGeometry(CELL, 0.3, CELL)) : this.geoFor(type); }
    const cx = cellToWorld(f.x) + f.w, cz = cellToWorld(f.z) + f.d;
    this.ghost.position.set(cx, def.line ? 0.2 : 0.02, cz); this.ghost.rotation.y = rot * Math.PI / 2; this.ghost.visible = true;
    const col = ok ? 0x4dff8a : 0xff4a3a; this.ghostMat.color.setHex(col);
    this.ghostPad.position.set(cx, 0.1, cz); this.ghostPad.scale.set(f.w * CELL, 1, f.d * CELL); this.ghostPad.material.color.setHex(col); this.ghostPad.visible = !def.line;
    const rad = def.waterRadius || def.powerRadius || def.shadeRadius;
    this.ring.visible = !!rad;
    if (rad) { const R = (rad + Math.max(f.w, f.d) / 2) * CELL; this.ring.position.set(cx, 0.3, cz); this.ring.scale.set(R, 1, R); }
  }
  setSelected(id) {
    this.selected = id;
    const b = id != null && this.sim.byId(id);
    if (!b) { this.sel.visible = false; return; }
    const f = footprint(b), w = f.w * CELL + 0.3, d = f.d * CELL + 0.3, cx = cellToWorld(f.x) + f.w, cz = cellToWorld(f.z) + f.d, t = 0.22;
    const s = this.sel.children;
    s[0].position.set(cx, 0.2, cz - d / 2); s[0].scale.set(w + t, 1, t); s[1].position.set(cx, 0.2, cz + d / 2); s[1].scale.set(w + t, 1, t);
    s[2].position.set(cx - w / 2, 0.2, cz); s[2].scale.set(t, 1, d + t); s[3].position.set(cx + w / 2, 0.2, cz); s[3].scale.set(t, 1, d + t);
    this.sel.visible = true;
  }

  // ---------------------------------------------------------------- picking
  ray(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    this._ndc = this._ndc || new THREE.Vector2(); this._rc = this._rc || new THREE.Raycaster();
    this._ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._rc.setFromCamera(this._ndc, this.camera);
    return this._rc;
  }
  groundAt(cx, cy) {
    const rc = this.ray(cx, cy), o = rc.ray.origin, d = rc.ray.direction;
    if (d.y >= -1e-4) return null;
    const t = -o.y / d.y;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }
  cellAt(cx, cy) { const g = this.groundAt(cx, cy); if (!g) return null; return { x: worldToCell(g.x), z: worldToCell(g.z) }; }
  pick(cx, cy) {
    const rc = this.ray(cx, cy);
    // clickers first (they are small)
    let best = null, bd = 3.2;
    for (const [id, e] of this.cm) { const d = rc.ray.distanceToPoint(_v.set(e.group.position.x, 1.2, e.group.position.z)); if (d < bd) { bd = d; best = id; } }
    if (best != null) return { clicker: best };
    const meshes = []; for (const e of this.bm.values()) meshes.push(e.mesh);
    const hit = rc.intersectObjects(meshes, false)[0];
    if (hit) return { building: hit.object.userData.bid };
    const c = this.cellAt(cx, cy); if (!c || c.x < 0 || c.z < 0 || c.x >= N || c.z >= N) return {};
    const id = this.sim.C.occ[c.z * N + c.x];
    if (id > 0) return { building: id };
    if (id === -1) return { node: NODES.find(n => c.x >= n.x && c.x <= n.x + 1 && c.z >= n.z && c.z <= n.z + 1) };
    return { cell: c };
  }
  focus(x, z) { this.cam.target.set(x, 0, z); }
  focusBuilding(id) { const e = this.bm.get(id); if (e) this.cam.target.set(e.cx, 0, e.cz + 2); }

  // ---------------------------------------------------------------- particles
  puff(x, y, z, kind) {
    const p = this.parts[this.pNext]; this.pNext = (this.pNext + 1) % MAX_PART;
    p.x = x; p.y = y; p.z = z; p.life = 0;
    const r = Math.random;
    if (kind === 'smoke') { p.max = 2.6 + r() * 1.6; p.vx = 0.5 + r() * 0.4; p.vy = 1.5 + r() * 0.6; p.vz = (r() - 0.5) * 0.4; p.s = 0.7; p.grow = 0.9; const v = 0.55 + r() * 0.25; p.r = v; p.g = v * 0.95; p.b = v * 0.9; p.a = 0.5; }
    else if (kind === 'steam') { p.max = 2.0 + r(); p.vx = 0.3 + r() * 0.3; p.vy = 2.0 + r(); p.vz = (r() - 0.5) * 0.5; p.s = 0.8; p.grow = 1.3; p.r = 0.95; p.g = 0.95; p.b = 0.98; p.a = 0.42; }
    else if (kind === 'dust') { p.max = 0.9 + r() * 0.6; p.vx = (r() - 0.5) * 1.2; p.vy = 0.5 + r() * 0.5; p.vz = (r() - 0.5) * 1.2; p.s = 0.5; p.grow = 0.9; p.r = 0.78; p.g = 0.6; p.b = 0.42; p.a = 0.4; }
    else if (kind === 'spark') { p.max = 0.35 + r() * 0.3; p.vx = (r() - 0.5) * 4; p.vy = 2 + r() * 3; p.vz = (r() - 0.5) * 4; p.s = 0.22; p.grow = 0; p.r = 1; p.g = 0.8; p.b = 0.3; p.a = 1; }
    else if (kind === 'aether') { p.max = 1.6 + r(); p.vx = (r() - 0.5) * 0.4; p.vy = 1.6 + r(); p.vz = (r() - 0.5) * 0.4; p.s = 0.5; p.grow = 0.5; p.r = 0.45; p.g = 0.95; p.b = 1; p.a = 0.55; }
  }
  _updParticles(dt) {
    const P = this.pPos, Cc = this.pCol, Sz = this.pSize;
    for (let i = 0; i < MAX_PART; i++) {
      const p = this.parts[i];
      if (p.life >= p.max) { Sz[i] = 0; Cc[i * 4 + 3] = 0; continue; }
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.grow === 0) p.vy -= 9 * dt;
      const t = p.life / p.max;
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
      Sz[i] = p.s + p.grow * p.life;
      Cc[i * 4] = p.r; Cc[i * 4 + 1] = p.g; Cc[i * 4 + 2] = p.b; Cc[i * 4 + 3] = p.a * (1 - t) * Math.min(1, t * 8);
    }
    const g = this.pMesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.pc.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }

  // ---------------------------------------------------------------- residents (visual agents)
  _assignAgents() {
    const sim = this.sim, S = sim.S;
    this.agentsDirty = false;
    const jobs = [];
    const hwStaff = S.hw.staff.ext + S.hw.staff.pur + S.hw.staff.tur;
    for (let i = 0; i < hwStaff; i++) jobs.push(sim.C.hw.id);
    for (const b of sim.C.staffList) for (let i = 0; i < b.staff; i++) jobs.push(b.id);
    for (let i = 0; i < S.idle; i++) jobs.push(0);
    const homes = [];
    for (const b of S.buildings) if (B[b.type].housing && b.progress == null) for (let i = 0; i < B[b.type].housing.cap / 2; i++) homes.push(b.id);
    const count = Math.min(MAX_AGENTS, jobs.length, Math.max(0, S.pop - S.sick));
    this.agentCount = count;
    for (let i = 0; i < MAX_AGENTS; i++) {
      const a = this.agents[i];
      if (i >= count) { a.state = 'none'; continue; }
      a.job = jobs[Math.floor(i * jobs.length / count)];
      const home = homes.length ? homes[(i * 5) % homes.length] : sim.C.hw.id;
      if (a.state === 'none' || !sim.byId(a.home)) {
        a.home = home;
        const hb = sim.byId(a.home), f = footprint(hb);
        a.x = f.x + f.w / 2; a.z = f.z + f.d + 0.5; a.state = 'inside'; a.dest = a.home; a.path = [];
      } else a.home = sim.byId(a.home) ? a.home : home;
    }
  }
  _updAgents(simH) {
    const sim = this.sim, S = sim.S, hour = sim.hour();
    if (this.agentsDirty) this._assignAgents();
    let budget = 3;
    const sites = sim.sites || [];
    const leisure = this._leisure || [];
    for (let i = 0; i < MAX_AGENTS; i++) {
      const a = this.agents[i];
      if (i >= this.agentCount || a.state === 'none') { a.vis = false; continue; }
      // where should this agent be?
      let want = a.home, mode = 'home';
      const jb = a.job ? sim.byId(a.job) : null;
      const outdoorRest = sim.curfewOn && hour > 11 && hour < 16 && jb && B[jb.type].outdoor;
      if (hour >= 6 && hour < 18 && !outdoorRest) {
        if (jb) { want = jb.id; mode = 'work'; }
        else if (sites.length) { want = sites[i % sites.length].id; mode = 'site'; }
        else if (leisure.length) { want = leisure[i % leisure.length]; mode = 'leisure'; }
      } else if (hour >= 18 && hour < 21.5 && leisure.length && i % 3 !== 0) { want = leisure[i % leisure.length]; mode = 'leisure'; }
      if (a.errand) { want = a.errand; mode = 'errand'; }
      if (a.dest !== want && budget > 0) {
        const tb = sim.byId(want);
        if (tb) { budget--; a.dest = want; a.path = sim.pathTo(a.x, a.z, footprint(tb)); a.state = 'walk'; a.mode = mode; }
        else if (a.errand) a.errand = null;
      }
      if (a.state === 'walk') {
        let step = 3.4 * simH;
        while (step > 0 && a.path.length) {
          const tx = a.path[0][0] + 0.5 + ((i % 5) - 2) * 0.08, tz = a.path[0][1] + 0.5 + ((i % 3) - 1) * 0.1;
          const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
          if (d > 1e-3) a.dir = Math.atan2(dx, dz);
          if (d <= step) { a.x = tx; a.z = tz; step -= d; a.path.shift(); } else { a.x += dx / d * step; a.z += dz / d * step; step = 0; }
        }
        a.vis = true;
        if (!a.path.length) {
          if (a.mode === 'errand') { a.errand = null; a.carry = false; a.timer = 1.5 + Math.random() * 4; }
          else { a.state = 'at'; a.timer = 0.6 + Math.random() * 3; }
        }
      } else if (a.state === 'at') {
        const tb = sim.byId(a.dest);
        const outside = a.mode === 'site' || a.mode === 'leisure' || (a.mode === 'work' && tb && (B[tb.type].outdoor || tb.type === 'heartwell' || tb.type === 'market'));
        a.vis = outside;
        a.timer -= simH;
        if (a.timer <= 0 && a.mode === 'work' && tb) {
          a.timer = 2 + Math.random() * 5;
          if (B[tb.type].out && sim.C.drops.length && Math.random() < 0.6) { const d = sim.C.drops[(i + (hour | 0)) % sim.C.drops.length]; if (d.id !== tb.id) { a.errand = d.id; a.carry = true; } }
          else if (outside && budget > 0) { budget--; const f = footprint(tb); a.path = sim.pathTo(a.x + (Math.random() - 0.5) * 6, a.z + (Math.random() - 0.5) * 6, f).slice(-2); if (a.path.length) { a.state = 'walk'; } }
        }
        if (a.mode === 'site' && Math.random() < simH * 2) { const e = this.bm.get(a.dest); if (e && this.inView(e.cx, e.cz)) this.puff((a.x - N / 2) * CELL, 0.6, (a.z - N / 2) * CELL, 'dust'); }
      } else if (a.state === 'inside') { a.vis = false; a.state = 'at'; a.mode = 'home'; a.timer = 1; }
      // draw
      if (a.vis) {
        const moving = a.state === 'walk';
        a.phase += moving ? simH * 26 : 0;
        _d.position.set((a.x - N / 2) * CELL, 0.07 + (moving ? Math.abs(Math.sin(a.phase)) * 0.07 : 0), (a.z - N / 2) * CELL);
        _d.rotation.set(0, a.dir, moving ? Math.sin(a.phase) * 0.06 : 0); _d.scale.setScalar(1.15); _d.updateMatrix();
      } else { _d.position.set(0, -50, 0); _d.scale.setScalar(0.001); _d.updateMatrix(); }
      this.pBody.setMatrixAt(i, _d.matrix); this.pHead.setMatrixAt(i, _d.matrix);
    }
    this.pBody.instanceMatrix.needsUpdate = true; this.pHead.instanceMatrix.needsUpdate = true;
  }
  inView(x, z) { return Math.hypot(x - this.cam.target.x, z - this.cam.target.z) < this.cam.dist * 1.3 + 20; }

  // ---------------------------------------------------------------- clickers
  _updClickers(dt, simH) {
    const S = this.sim.S, seen = new Set();
    for (const c of S.clickers) {
      seen.add(c.id);
      let e = this.cm.get(c.id);
      if (!e) {
        const cg = this._cg || (this._cg = {}); const g = cg[c.role] || (cg[c.role] = clickerGeometry(c.role));
        const group = new THREE.Group(); const body = new THREE.Mesh(g.body, this.mat); body.castShadow = true; group.add(body);
        const legs = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(g.leg, this.mat); l.position.set(sx * g.hipX, g.y0, sz * g.hipZ); l.scale.x = sx; l.castShadow = true; group.add(l); legs.push(l); }
        const crate = new THREE.Mesh(this._crateGeo || (this._crateGeo = buildingCrate()), this.mat); crate.position.set(0, g.y0 + 1.0, -0.6); crate.visible = false; group.add(crate);
        this.scene.add(group); e = { group, body, legs, crate, g, phase: 0, px: c.x, pz: c.z };
        this.cm.set(c.id, e);
      }
      const wx = (c.x - N / 2) * CELL, wz = (c.z - N / 2) * CELL;
      const moved = Math.hypot(c.x - e.px, c.z - e.pz); e.px = c.x; e.pz = c.z;
      e.group.position.set(wx, 0, wz);
      if (c.dir != null) { let dy = c.dir - e.group.rotation.y; while (dy > Math.PI) dy -= 6.2832; while (dy < -Math.PI) dy += 6.2832; e.group.rotation.y += dy * Math.min(1, dt * 6); }
      const active = !c.broken && !c.dormant;
      const acting = active && c.state === 'act' && c.task && c.task.kind !== 'idle';
      if (moved > 1e-5) { e.phase += moved * 3.2; e.legs.forEach((l, i) => { l.rotation.x = Math.sin(e.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45; }); e.body.position.y = Math.abs(Math.sin(e.phase * 2)) * 0.06; if (Math.random() < 0.25 && this.inView(wx, wz)) this.puff(wx, 0.2, wz, 'dust'); }
      else if (acting) { e.phase += dt * 5; e.body.position.y = Math.sin(e.phase) * 0.05; e.body.rotation.x = Math.sin(e.phase * 0.7) * 0.03; if (this.inView(wx, wz) && Math.random() < dt * 9) { const k = c.task.kind; const fx = wx + Math.sin(e.group.rotation.y) * 2.4, fz = wz + Math.cos(e.group.rotation.y) * 2.4; this.puff(fx, 0.8 + Math.random(), fz, k === 'work' ? 'dust' : 'spark'); } }
      else { e.body.position.y = c.broken ? -0.25 : 0; e.body.rotation.x = c.broken ? 0.08 : 0; }
      e.crate.visible = !!c.carry;
    }
    for (const [id, e] of this.cm) if (!seen.has(id)) { this.scene.remove(e.group); this.cm.delete(id); }
  }

  // ---------------------------------------------------------------- per-frame
  update(dt, simH) {
    const sim = this.sim, S = sim.S, cam = this.cam;
    if (sim.version !== this.seenVersion) this.sync();
    this.clock += dt;
    // camera
    cam.pitch = Math.max(0.3, Math.min(1.45, cam.pitch)); cam.dist = Math.max(16, Math.min(135, cam.dist));
    cam.target.x = Math.max(-80, Math.min(80, cam.target.x)); cam.target.z = Math.max(-80, Math.min(80, cam.target.z));
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    // keep the camera inside the canyon, above the terrain
    for (let i = 0; i < 40 && cam.dist > 16; i++) {
      const x = cam.target.x + Math.sin(cam.yaw) * cp * cam.dist, z = cam.target.z + Math.cos(cam.yaw) * cp * cam.dist;
      if (sp * cam.dist > terrainH(x, z) + 7 && sp * cam.dist > terrainH((x + cam.target.x) / 2, (z + cam.target.z) / 2) + 4) break;
      cam.dist *= 0.96;
    }
    this.camera.position.set(cam.target.x + Math.sin(cam.yaw) * cp * cam.dist, cam.target.y + sp * cam.dist, cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
    this.camera.lookAt(cam.target);
    this.env = this.world.update(sim, this.camera, cam.target);
    const speed = simH > 0 ? Math.min(4, simH / Math.max(1e-4, dt) / 0.8) : 0;
    // buildings: construction, smoke, heartwell
    const emit = dt * (0.5 + Math.min(2, speed) * 0.5) * (simH > 0 ? 1 : 0);
    for (const e of this.bm.values()) {
      const b = e.b, def = e.def;
      if (b.progress != null) { e.mesh.scale.y = Math.max(0.06, b.progress / def.work); }
      if (!this.inView(e.cx, e.cz)) continue;
      if (e.smoke.length && b.progress == null && !b.broken) {
        const act = def.housing ? (def.tier > 1 ? 0.35 : 0) : b.type === 'heartwell' ? Math.min(1, sim.powerGen / 20) : b.type === 'station' ? 0 : Math.min(1, b.eff || 0);
        if (act > 0) for (const s of e.smoke) if (Math.random() < emit * 2.6 * act) this.puff(s[0], s[1], s[2], b.type === 'heartwell' || b.type === 'generator' ? 'steam' : 'smoke');
      }
      if ((b.progress != null || b.upgrade) && b.crew > 0 && Math.random() < emit * 3) this.puff(e.cx + (Math.random() - 0.5) * 3, 0.5, e.cz + (Math.random() - 0.5) * 3, 'dust');
      if (e.hw) {
        const hw = S.hw, cap = HW.tur.base * HW.turMult[hw.lv.tur - 1];
        e.hw.wheels.forEach((w, i) => { const out = (sim.turOut ? sim.turOut[i ? 'turB' : 'turA'] : 0) / cap; e.hw.spin[i] += (out - e.hw.spin[i]) * Math.min(1, dt * 1.5); w.rotation.z -= e.hw.spin[i] * dt * 2.2 * (i ? -1 : 1) * Math.max(0.0, Math.min(2.5, speed)); });
        const lvl = Math.min(1, S.res.water / sim.C.waterCap);
        for (const p of e.hw.pools) p.position.y += ((0.2 + lvl * 0.72) - p.position.y) * Math.min(1, dt * 2);
        const cl = Math.min(1, hw.coolant / 120);
        for (const p of e.hw.basins) p.position.y += ((0.2 + cl * 0.75) - p.position.y) * Math.min(1, dt * 2);
        e.hw.mats[0].opacity = 0.35 + 0.55 * Math.min(1, lvl * 6);
      }
    }
    for (const nd of NODES) if (nd.type === 'vent' && Math.random() < emit * 2 && this.inView(nd._mesh.position.x, nd._mesh.position.z)) this.puff(nd._mesh.position.x + (Math.random() - 0.5), 1, nd._mesh.position.z + (Math.random() - 0.5), 'aether');
    if (this.world.train.visible && this.world.trainMoving && Math.random() < emit * 14) { const p = this.world.trainSmoke; this.puff(p.x, p.y, p.z, 'smoke'); }
    this._leisureTimer = (this._leisureTimer || 0) - dt;
    if (this._leisureTimer <= 0) { this._leisureTimer = 2; this._leisure = S.buildings.filter(b => (b.type === 'market' || b.type === 'betting' || b.type === 'shade') && b.progress == null).map(b => b.id); }
    this._updAgents(simH);
    this._updClickers(dt, simH);
    this._updParticles(dt);
    // overlays that change with time
    this.overlayTimer -= dt;
    if (this.overlayTimer <= 0) { this.overlayTimer = 1.2; if (!this.placing && (this.overlayMode === 'heat' || this.overlayMode === 'resource')) this.fillOverlay(); }
    this.statusTimer -= dt;
    if (this.statusTimer <= 0) { this.statusTimer = 0.5; this._updStatus(); }
    if (this.sel.visible) { const k = 0.75 + Math.sin(this.clock * 5) * 0.25; this.sel.children[0].material.opacity = k; }
    this.renderer.render(this.scene, this.camera);
  }
  _updStatus() {
    let n = 0;
    for (const e of this.bm.values()) {
      const b = e.b, def = e.def; if (n >= this.stSprites.length) break;
      let kind = null;
      if (b.progress != null) continue;
      if (b.broken) kind = 'crit';
      else if (b.type === 'heartwell') { if (Object.keys(this.sim.S.hw.broken).length) kind = 'crit'; }
      else if ((def.workers || def.power) && b.on && (b.eff || 0) <= 0 && !def.housing) kind = 'warn';
      else if (def.waterRadius && !this.sim.C.onNet[b.id]) kind = 'warn';
      else if (b.type === 'pylon' && !this.sim.C.pylonOn[b.id]) kind = 'warn';
      if (!kind) continue;
      const s = this.stSprites[n++]; s.material = this.stMat[kind]; s.position.set(e.cx, e.h + 2.2, e.cz); const sc = Math.max(2.2, this.cam.dist * 0.045); s.scale.set(sc, sc, 1); s.visible = true;
    }
    for (; n < this.stSprites.length; n++) this.stSprites[n].visible = false;
  }
}

function buildingCrate() {
  const g = new THREE.BoxGeometry(0.9, 0.7, 0.9), n = g.attributes.position.count;
  const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = 0.62; c[i * 3 + 1] = 0.42; c[i * 3 + 2] = 0.25; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}
