// Almond Valley simulation. Pure state + rules, no rendering. Runs in the browser and in node tests.
import {
  N, YEAR, RES, BASE_CAP, WAREHOUSE_CAP, ZONES, BUILD_PACE, NODES, NODE_RANGE, B, PRIO_ORDER, HW, CLICKERS,
  RIG_COST, TECH, PRICES, EXPEDITIONS, seasonTemp, seasonName, START_BUILDINGS, START_ROADS, START_PIPES,
} from './data.js';
import { findPath } from './path.js';
import { CANYON, PIER_CELLS } from './terrain.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const SAVE_VERSION = 2;

export function footprint(b) {
  const def = B[b.type];
  const sw = b.rot & 1;
  return { x: b.x, z: b.z, w: sw ? def.d : def.w, d: sw ? def.w : def.d };
}
function rectDist(f, x, z) { // euclid distance from cell to rect, in cells
  const dx = x < f.x ? f.x - x : x > f.x + f.w - 1 ? x - (f.x + f.w - 1) : 0;
  const dz = z < f.z ? f.z - z : z > f.z + f.d - 1 ? z - (f.z + f.d - 1) : 0;
  return Math.sqrt(dx * dx + dz * dz);
}
function rectRectCheb(a, b) {
  const dx = Math.max(0, a.x - (b.x + b.w - 1), b.x - (a.x + a.w - 1));
  const dz = Math.max(0, a.z - (b.z + b.d - 1), b.z - (a.z + a.d - 1));
  return Math.max(dx, dz);
}
export function cellZone(x, z) {
  if (x < 0 || z < 0 || x >= N || z >= N || CANYON[z * N + x]) return null;
  if (PIER_CELLS.has(z * N + x)) return 'pier';
  for (const k in ZONES) { if (k === 'core') continue; const q = ZONES[k]; if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) return k; }
  return 'core';
}
export function costText(cost) { return Object.entries(cost || {}).map(([k, v]) => `${v} ${k}`).join(', '); }

function newState() {
  const S = {
    v: SAVE_VERSION, rng: 987654321, time: 6, speed: 1,
    res: { water: 1500, food: 520, wood: 500, stone: 320, metal: 300, parts: 50, aether: 60, scrip: 150 },
    flow: {}, pop: 50, sick: 0, skilled: 8, deaths: 0, grief: 0, morale: 62, thirst: 0, hunger: 0, rigs: 2,
    acc: { sick: 0, death: 0, heal: 0, edu: 0 },
    buildings: [], nextId: 1, roads: new Array(N * N).fill(0), pipes: new Array(N * N).fill(0),
    zones: { core: true }, expeditions: [],
    hw: {
      lv: { ext: 1, pur: 1, tur: 1, pool: 1 }, slots: { ext: 4, pur: 3, tur: 3 }, staff: { ext: 0, pur: 0, tur: 0 },
      cond: { drill: 92, turA: 88, turB: 90, silo: 94, pump: 90 }, broken: {}, raw: 120, coolant: 100,
    },
    clickers: [], nextCid: 1,
    tech: { done: {}, cur: null, rp: 0 },
    policies: { curfew: false, ration: false, feast: false },
    trade: { cargo: 40 }, train: { next: 34, at: -99 },
    obj: {}, log: [], hist: [], dayDeaths: 0, summers: 0, over: false, season: 'Early Spring', lastDay: 0,
  };
  for (const r of RES) S.flow[r] = 0;
  return S;
}

export class Sim {
  constructor(saved) {
    this.events = [];   // transient events for the UI/renderer
    this.version = 0;   // bumps whenever the map changes
    this.C = {};
    if (saved) this.S = migrate(saved);
    else {
      this.S = newState();
      for (const [t, x, z, r] of START_BUILDINGS) this._addBuilding(t, x, z, r, true);
      this._rebuildOcc();
      for (const [x, z] of START_ROADS) if (!this.C.occ[z * N + x]) this.S.roads[z * N + x] = 1;
      for (const [x, z] of START_PIPES) this.S.pipes[z * N + x] = 1;
      this.S.clickers.push(this._newClicker('master', 26.5, 37.5));
    }
    this.fd = {}; for (const r of RES) this.fd[r] = 0;
    this.powerGen = 0; this.powerUse = 0; this.powerRatio = 1; this.hwPower = 1; this.workMult = 1;
    this.h = 0; this.T = 22; this.pumpBudget = 0; this.hwRates = { ext: 0, pur: 0, demand: 0 };
    this.rebuild();
    this._assign();
    this._housing();
  }

  // ------------------------------------------------------------------ helpers
  rand() {
    let t = (this.S.rng += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // decide: the player has to act (the game pauses itself); warn/crit without it drop fast-forward back to 1x.
  log(msg, kind = 'info', decide = false) {
    const S = this.S;
    S.log.unshift({ d: this.day() + 1, msg, kind });
    if (S.log.length > 40) S.log.length = 40;
    this.events.push({ type: 'log', msg, kind, decide });
  }
  day() { return Math.floor(this.S.time / 24); }
  hour() { return this.S.time % 24; }
  doy() { return (this.S.time / 24) % YEAR; }
  year() { return Math.floor(this.S.time / 24 / YEAR); }
  temp(time = this.S.time) {
    const d = time / 24, doy = d % YEAR, yr = Math.floor(d / YEAR), hr = time % 24;
    const wob = Math.sin(Math.floor(d) * 12.9898) * 1.3;
    return seasonTemp(doy, yr) + 5 * Math.sin((hr - 9) / 24 * Math.PI * 2) + wob;
  }
  heatOf(T) { return clamp((T - 32) / 17, 0, 1.5); }
  seasonName() { return seasonName(this.doy()); }
  daysToDoubleNoon() { const d = this.doy(); return d < 20 ? 20 - d : d < 30 ? 0 : YEAR - d + 20; }
  def(b) { return B[b.type]; }
  byId(id) { return this.C.byId.get(id); }
  count(type, done = true) { let n = 0; for (const b of this.S.buildings) if (b.type === type && (!done || b.progress == null)) n++; return n; }
  hasTech(t) { return !t || !!this.S.tech.done[t]; }
  cap(r) { return r === 'water' ? this.C.waterCap : (this.C.caps[r] ?? Infinity); }
  canAfford(cost) { for (const k in cost) if ((this.S.res[k] || 0) < cost[k]) return false; return true; }
  pay(cost) { for (const k in cost) this.S.res[k] -= cost[k]; }
  refund(cost, f = 1) { for (const k in cost) this.S.res[k] = Math.min(this.cap(k), this.S.res[k] + Math.floor(cost[k] * f)); }
  add(r, amt) { // tracked flow, clamped to storage
    const S = this.S, before = S.res[r];
    S.res[r] = clamp(before + amt, 0, this.cap(r));
    const d = S.res[r] - before;
    this.fd[r] += d;
    return d;
  }
  level() { return 1 + Math.floor(this.S.pop / 40) + Math.floor(Object.keys(this.S.tech.done).length / 3); }

  // ------------------------------------------------------------------ map cache
  _rebuildOcc() {
    const occ = new Int32Array(N * N);
    for (const nd of NODES) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) occ[(nd.z + dz) * N + nd.x + dx] = -1;
    const byId = new Map();
    for (const b of this.S.buildings) {
      byId.set(b.id, b);
      const f = footprint(b);
      for (let z = f.z; z < f.z + f.d; z++) for (let x = f.x; x < f.x + f.w; x++) occ[z * N + x] = b.id;
    }
    this.C.occ = occ; this.C.byId = byId;
  }
  rebuild() {
    const S = this.S, C = this.C;
    this._rebuildOcc();
    const occ = C.occ;
    const hwB = S.buildings.find(b => b.type === 'heartwell');
    const hwF = footprint(hwB);
    C.hw = hwB; C.hwF = hwF;
    // --- water network
    const net = new Uint8Array(N * N), stack = [];
    const touches = (f, grid) => {
      for (let x = f.x; x < f.x + f.w; x++) { if (grid[(f.z - 1) * N + x] || grid[(f.z + f.d) * N + x]) return true; }
      for (let z = f.z; z < f.z + f.d; z++) { if (grid[z * N + f.x - 1] || grid[z * N + f.x + f.w]) return true; }
      return false;
    };
    for (let i = 0; i < N * N; i++) {
      if (!S.pipes[i]) continue;
      const x = i % N, z = (i / N) | 0;
      if (rectDist(hwF, x, z) <= 1.01) { net[i] = 1; stack.push(i); }
    }
    while (stack.length) {
      const i = stack.pop(), x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (S.pipes[j] && !net[j]) { net[j] = 1; stack.push(j); }
      }
    }
    C.pipeNet = net;
    const waterCov = new Uint8Array(N * N), powerCov = new Uint8Array(N * N);
    const paint = (grid, f, r) => {
      for (let z = Math.max(0, f.z - r); z <= Math.min(N - 1, f.z + f.d - 1 + r); z++)
        for (let x = Math.max(0, f.x - r); x <= Math.min(N - 1, f.x + f.w - 1 + r); x++)
          if (rectDist(f, x, z) <= r + 0.3) grid[z * N + x] = 1;
    };
    paint(waterCov, hwF, HW.radius);
    let waterCap = HW.pool.cap[S.hw.lv.pool - 1];
    const caps = { ...BASE_CAP };
    C.onNet = {};
    for (const b of S.buildings) {
      const def = B[b.type]; if (b.progress != null) continue;
      const f = footprint(b);
      if (def.waterCap) waterCap += def.waterCap;
      if (def.storage) for (const k in WAREHOUSE_CAP) caps[k] += WAREHOUSE_CAP[k];
      if (def.waterRadius && !b.broken) {
        const on = touches(f, net) || (S.pipes[f.z * N + f.x] && net[f.z * N + f.x]);
        C.onNet[b.id] = !!on;
        if (on) paint(waterCov, f, def.waterRadius);
      }
    }
    C.waterCap = waterCap; C.caps = caps;
    // --- power network
    const emit = [{ f: hwF, r: HW.powerRadius }];
    for (const b of S.buildings) if (b.type === 'generator' && b.progress == null && !b.broken) emit.push({ f: footprint(b), r: B.generator.powerRadius });
    const pylons = S.buildings.filter(b => b.type === 'pylon' && b.progress == null && !b.broken).map(b => ({ b, f: footprint(b), on: false }));
    C.pylonOn = {};
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of pylons) {
        if (p.on) continue;
        for (const e of emit) {
          if (rectRectCheb(p.f, e.f) <= 9) {
            p.on = true; emit.push({ f: p.f, r: B.pylon.powerRadius }); changed = true; C.pylonOn[p.b.id] = true; break;
          }
        }
      }
    }
    for (const e of emit) paint(powerCov, e.f, e.r);
    C.waterCov = waterCov; C.powerCov = powerCov;
    // --- road links (roads connected to a drop point)
    const linkNet = new Uint8Array(N * N); const st2 = [];
    const seed = f => {
      for (let x = f.x - 1; x <= f.x + f.w; x++) for (const z of [f.z - 1, f.z + f.d]) { const i = z * N + x; if (S.roads[i] && !linkNet[i]) { linkNet[i] = 1; st2.push(i); } }
      for (let z = f.z; z < f.z + f.d; z++) for (const x of [f.x - 1, f.x + f.w]) { const i = z * N + x; if (S.roads[i] && !linkNet[i]) { linkNet[i] = 1; st2.push(i); } }
    };
    C.drops = [];
    for (const b of S.buildings) {
      const def = B[b.type];
      if (b.progress == null && (def.storage || def.dropPoint)) { seed(footprint(b)); C.drops.push(b); }
    }
    if (!C.drops.length) { seed(hwF); C.drops.push(hwB); }
    while (st2.length) {
      const i = st2.pop(), x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (z + dz) * N + x + dx;
        if (S.roads[j] && !linkNet[j]) { linkNet[j] = 1; st2.push(j); }
      }
    }
    C.linkNet = linkNet;
    // --- per building info
    const shades = S.buildings.filter(b => b.type === 'shade' && b.progress == null).map(b => footprint(b));
    C.info = {};
    for (const b of S.buildings) {
      const def = B[b.type], f = footprint(b);
      const info = { watered: false, powered: false, linked: false, rich: 0, shaded: false };
      for (let z = f.z; z < f.z + f.d; z++) for (let x = f.x; x < f.x + f.w; x++) {
        if (waterCov[z * N + x]) info.watered = true;
        if (powerCov[z * N + x]) info.powered = true;
      }
      info.linked = def.storage || def.dropPoint || touches(f, linkNet);
      if (def.node) info.rich = this.nodeRich(def.node, f);
      if (def.housing) for (const s of shades) if (rectRectCheb(f, s) <= B.shade.shadeRadius) info.shaded = true;
      C.info[b.id] = info;
    }
    // --- walk grid
    const blocked = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) if (occ[i] || CANYON[i] || PIER_CELLS.has(i)) blocked[i] = 1;
    C.blocked = blocked;
    C.staffList = S.buildings.filter(b => B[b.type].workers).sort((a, b) => (b.prio - a.prio) || ((PRIO_ORDER[a.type] || 9) - (PRIO_ORDER[b.type] || 9)) || (a.id - b.id));
    C.equiv = C.equiv || {};
    this.version++;
    this.dirty = false;
  }
  nodeRich(type, f) {
    let best = 0;
    for (const nd of NODES) {
      if (nd.type !== type) continue;
      if (rectRectCheb(f, { x: nd.x, z: nd.z, w: 2, d: 2 }) <= NODE_RANGE) best = Math.max(best, nd.rich);
    }
    return best;
  }

  // ------------------------------------------------------------------ player actions
  canPlace(type, x, z, rot = 0, opts = {}) {
    const def = B[type], S = this.S;
    if (!def || def.unique) return { ok: false, reason: 'Cannot build' };
    if (!this.hasTech(def.tech)) return { ok: false, reason: `Research ${TECH[def.tech].name}` };
    if (def.limit && this.count(type, false) >= def.limit) return { ok: false, reason: `Limit of ${def.limit}` };
    const f = footprint({ type, x, z, rot });
    for (let cz = f.z; cz < f.z + f.d; cz++) for (let cx = f.x; cx < f.x + f.w; cx++) {
      if (cx < 1 || cz < 1 || cx >= N - 1 || cz >= N - 1) return { ok: false, reason: 'Outside the valley floor' };
      const zone = cellZone(cx, cz);
      if (!zone) return { ok: false, reason: 'Canyon rock — the valley floor ends here' };
      if (zone === 'pier') return { ok: false, reason: 'Railway pier in the way' };
      if (!S.zones[zone]) return { ok: false, reason: `Survey needed: claim ${ZONES[zone].name} from Expedition` };
      const i = cz * N + cx;
      if (type === 'pipe') { if (S.pipes[i]) return { ok: false, reason: 'Main already here' }; if (this.C.occ[i] === -1) return { ok: false, reason: 'Blocked by deposit' }; continue; }
      if (this.C.occ[i]) return { ok: false, reason: this.C.occ[i] === -1 ? 'Blocked by deposit' : 'Space occupied' };
      if (type === 'road' && S.roads[i]) return { ok: false, reason: 'Road already here' };
    }
    if (def.node && this.nodeRich(def.node, f) <= 0) {
      const nm = { forest: 'a timber stand', rock: 'a stone shelf', ore: 'an iron seam', vent: 'an aether vent' }[def.node];
      return { ok: false, reason: `Needs ${nm} within ${NODE_RANGE} tiles` };
    }
    if (type === 'valve') {
      const P = S.pipes; const i = z * N + x;
      if (!(P[i] || P[i - 1] || P[i + 1] || P[i - N] || P[i + N])) return { ok: false, reason: 'Must touch a water main' };
    }
    if (!opts.free && !this.canAfford(def.cost)) return { ok: false, reason: 'Not enough ' + Object.keys(def.cost).filter(k => S.res[k] < def.cost[k]).join(', ') };
    return { ok: true };
  }
  place(type, x, z, rot = 0) {
    const chk = this.canPlace(type, x, z, rot);
    if (!chk.ok) return chk;
    const def = B[type], S = this.S;
    this.pay(def.cost);
    if (def.line) {
      (type === 'road' ? S.roads : S.pipes)[z * N + x] = 1;
      this.dirty = true;
      this.events.push({ type: 'placed', kind: type, x, z });
      return { ok: true };
    }
    const b = this._addBuilding(type, x, z, rot, false);
    const f = footprint(b);
    for (let cz = f.z; cz < f.z + f.d; cz++) for (let cx = f.x; cx < f.x + f.w; cx++) S.roads[cz * N + cx] = 0;
    this.rebuild();
    this.events.push({ type: 'placed', kind: type, id: b.id });
    return { ok: true, id: b.id };
  }
  _addBuilding(type, x, z, rot, done) {
    const def = B[type], S = this.S;
    const b = { id: S.nextId++, type, x, z, rot, cond: done ? 85 + Math.floor(this.rand() * 12) : 100, slots: def.workers || 0, staff: 0, sk: 0, prio: 0, progress: done ? null : 0, out: {}, on: true, broken: false, eff: 0, issue: '' };
    if (type === 'fabrication') b.queue = [];
    S.buildings.push(b);
    return b;
  }
  removeLine(kind, x, z) {
    const g = kind === 'road' ? this.S.roads : this.S.pipes, i = z * N + x;
    if (!g[i]) return false;
    g[i] = 0; this.dirty = true; return true;
  }
  demolish(id) {
    const S = this.S, b = this.byId(id); if (!b || B[b.type].unique) return false;
    const def = B[b.type];
    this.refund(def.cost, b.progress != null ? 1 : 0.5);
    if (b.upgrade) this.refund(B[b.upgrade.to].upCost, 1);
    for (const r in b.out) this.S.res[r] = Math.min(this.cap(r), this.S.res[r] + b.out[r]);
    S.buildings.splice(S.buildings.indexOf(b), 1);
    for (const c of S.clickers) if (c.task && c.task.bid === id) { c.task = null; c.path = []; }
    for (const c of S.clickers) if (c.pin === id) c.pin = null;
    this.rebuild();
    this.events.push({ type: 'removed', id });
    return true;
  }
  canUpgrade(b) {
    const def = B[b.type]; if (!def.upgradeTo || b.progress != null || b.upgrade) return { ok: false, reason: '' };
    const to = B[def.upgradeTo];
    if (!this.hasTech(to.tech)) return { ok: false, reason: `Research ${TECH[to.tech].name}` };
    if (!this.canAfford(to.upCost)) return { ok: false, reason: 'Not enough materials' };
    return { ok: true };
  }
  upgrade(id) {
    const b = this.byId(id); if (!b) return false;
    const chk = this.canUpgrade(b); if (!chk.ok) return false;
    const to = B[B[b.type].upgradeTo];
    this.pay(to.upCost);
    b.upgrade = { to: B[b.type].upgradeTo, progress: 0, work: to.upWork };
    this.version++;
    return true;
  }
  setSlots(id, n) { const b = this.byId(id); if (!b) return; b.slots = clamp(n, 0, B[b.type].workers || 0); }
  setPrio(id, p) { const b = this.byId(id); if (!b) return; b.prio = p; this.C.staffList.sort((a, c) => (c.prio - a.prio) || ((PRIO_ORDER[a.type] || 9) - (PRIO_ORDER[c.type] || 9)) || (a.id - c.id)); }
  toggle(id) { const b = this.byId(id); if (!b) return; b.on = !b.on; this.version++; }
  patchCost(b) { const d = B[b.type]; return { parts: Math.max(3, Math.round((d.w * d.d) * 1.2)) }; }
  patch(id, comp) { // emergency repair
    const S = this.S;
    if (comp) {
      const cost = { parts: 8 }; if (!this.canAfford(cost)) return false; this.pay(cost);
      S.hw.cond[comp] = Math.min(100, S.hw.cond[comp] + 30); if (S.hw.cond[comp] >= 45) delete S.hw.broken[comp];
      return true;
    }
    const b = this.byId(id); if (!b) return false;
    const cost = this.patchCost(b); if (!this.canAfford(cost)) return false; this.pay(cost);
    b.cond = Math.min(100, b.cond + 30);
    if (b.cond >= 45 && b.broken) { b.broken = false; this.dirty = true; }
    return true;
  }
  hwSetSlots(role, n) { const hw = this.S.hw; hw.slots[role] = clamp(n, 0, HW[role].workers[hw.lv[role] - 1]); }
  hwCanUpgrade(part) {
    const lv = this.S.hw.lv[part]; if (lv >= 3) return { ok: false, reason: 'Maximum level' };
    if (!this.hasTech(HW.upTech[lv])) return { ok: false, reason: `Research ${TECH[HW.upTech[lv]].name}` };
    if (!this.canAfford(HW.upCost[lv])) return { ok: false, reason: 'Not enough materials' };
    return { ok: true };
  }
  hwUpgrade(part) {
    if (!this.hwCanUpgrade(part).ok) return false;
    const hw = this.S.hw, lv = hw.lv[part];
    this.pay(HW.upCost[lv]); hw.lv[part] = lv + 1;
    if (HW[part].workers) hw.slots[part] = HW[part].workers[lv];
    this.log(`Heartwell ${HW[part].name} raised to level ${lv + 1}.`, 'good');
    this.rebuild();
    return true;
  }
  canResearch(id) {
    const t = TECH[id], T = this.S.tech;
    if (T.done[id]) return { ok: false, reason: 'Complete' };
    if (T.cur) return { ok: false, reason: T.cur === id ? 'In progress' : 'Lab busy' };
    for (const r of t.req || []) if (!T.done[r]) return { ok: false, reason: `Needs ${TECH[r].name}` };
    if (!this.canAfford(t.cost)) return { ok: false, reason: 'Not enough materials' };
    return { ok: true };
  }
  startResearch(id) { if (!this.canResearch(id).ok) return false; this.pay(TECH[id].cost); this.S.tech.cur = id; this.S.tech.rp = 0; return true; }
  researchRate() {
    let r = 3;
    for (const b of this.S.buildings) {
      if (b.progress != null) continue;
      if (b.type === 'school') r += b.staff * 3 * (0.5 + 0.5 * b.cond / 100);
      if (b.type === 'office') r += b.staff * 1.5;
    }
    return r;
  }
  setPolicy(k, v) {
    if (k === 'curfew' && !this.hasTech('heatshift')) return false;
    this.S.policies[k] = v; return true;
  }
  canClaim(zone) {
    const q = ZONES[zone], S = this.S;
    if (S.zones[zone]) return { ok: false, reason: 'Claimed' };
    if (S.expeditions.some(e => e.zone === zone)) return { ok: false, reason: 'Survey under way' };
    if (!this.canAfford(q.cost)) return { ok: false, reason: 'Not enough supplies' };
    if (S.idle < q.crew) return { ok: false, reason: `Needs ${q.crew} unassigned workers` };
    return { ok: true };
  }
  claim(zone) {
    if (!this.canClaim(zone).ok) return false;
    const q = ZONES[zone];
    this.pay(q.cost);
    this.S.expeditions.push({ kind: 'claim', zone, crew: q.crew, left: q.days * 24, total: q.days * 24 });
    this._assign();
    return true;
  }
  canExpedition(kind) {
    const e = EXPEDITIONS[kind], S = this.S;
    if (S.expeditions.some(x => x.kind === kind)) return { ok: false, reason: 'Party already out' };
    if (!this.canAfford(e.cost)) return { ok: false, reason: 'Not enough supplies' };
    if (S.idle < e.crew) return { ok: false, reason: `Needs ${e.crew} unassigned workers` };
    return { ok: true };
  }
  expedition(kind) {
    if (!this.canExpedition(kind).ok) return false;
    const e = EXPEDITIONS[kind]; this.pay(e.cost);
    this.S.expeditions.push({ kind, crew: e.crew, left: e.days * 24, total: e.days * 24 });
    this._assign();
    return true;
  }
  tradeInfo() {
    const S = this.S;
    return { cargo: S.trade.cargo, next: Math.max(0, S.train.next - S.time), here: S.time - S.train.at < 5 };
  }
  trade(res, qty) { // qty > 0 buy, < 0 sell
    const S = this.S, n = Math.abs(qty);
    if (n > S.trade.cargo) return { ok: false, reason: 'No cargo space left on this train' };
    if (qty > 0) {
      const cost = Math.ceil(PRICES[res] * n);
      if (S.res.scrip < cost) return { ok: false, reason: 'Not enough scrip' };
      if (S.res[res] + n > this.cap(res)) return { ok: false, reason: 'Storage full' };
      S.res.scrip -= cost; S.res[res] += n;
    } else {
      if (S.res[res] < n) return { ok: false, reason: 'Not enough stock' };
      S.res[res] -= n; S.res.scrip += Math.floor(PRICES[res] * n * 0.5);
    }
    S.trade.cargo -= n;
    return { ok: true };
  }
  canQueueClicker(bid, role) {
    const b = this.byId(bid), c = CLICKERS[role];
    if (!b || b.type !== 'fabrication' || b.progress != null) return { ok: false, reason: 'No plant' };
    if (!this.hasTech(c.tech)) return { ok: false, reason: `Research ${TECH[c.tech].name}` };
    if (b.queue.length >= 3) return { ok: false, reason: 'Queue full' };
    if (!this.canAfford(c.cost)) return { ok: false, reason: 'Not enough materials' };
    return { ok: true };
  }
  queueClicker(bid, role) {
    if (!this.canQueueClicker(bid, role).ok) return false;
    this.pay(CLICKERS[role].cost);
    this.byId(bid).queue.push({ role, progress: 0 });
    return true;
  }
  pinClicker(cid, bid) { const c = this.S.clickers.find(k => k.id === cid); if (c) { c.pin = bid; c.task = null; c.path = []; } }
  canCraftRig() {
    if (!this.S.buildings.some(b => b.type === 'workshop' && b.progress == null && b.staff > 0)) return { ok: false, reason: 'Needs a staffed Workshop' };
    if (!this.canAfford(RIG_COST)) return { ok: false, reason: 'Not enough materials' };
    return { ok: true };
  }
  craftRig() { if (!this.canCraftRig().ok) return false; this.pay(RIG_COST); this.S.rigs++; return true; }
  _newClicker(role, x, z) { return { id: this.S.nextCid++, role, x, z, cond: 90, broken: false, task: null, path: [], pin: null, carry: null, state: 'idle', think: 0, dormant: false }; }

  // ------------------------------------------------------------------ main loop
  advance(hours) {
    if (this.S.over) return;
    let left = hours;
    while (left > 1e-9) {
      const dt = Math.min(0.1, left);
      this.step(dt);
      left -= dt;
    }
  }
  step(dt) {
    const S = this.S;
    S.time += dt;
    this.T = this.temp(); this.h = this.heatOf(this.T);
    if (this.dirty) this.rebuild();
    const d = this.day();
    if (d !== S.lastDay) { S.lastDay = d; this._daily(); }
    this._assign();
    this._housing();
    this._power();
    this._heartwell(dt);
    this._people(dt);
    this._production(dt);
    this._wear(dt);
    this._construction(dt);
    this._clickers(dt);
    this._research(dt);
    this._world(dt);
    // reserve warning (with hysteresis so it fires once per shortage)
    const wf = S.res.water / Math.max(1, this.C.waterCap);
    if (!S.lowWater && wf < 0.2) { S.lowWater = true; this.log('Water reserves below 20%. Cut use or raise extraction.', 'warn'); }
    else if (S.lowWater && wf > 0.35) S.lowWater = false;
    // flows (per day, smoothed over ~6 game hours)
    const k = 1 - Math.exp(-dt / 6);
    for (const r of RES) { S.flow[r] += ((this.fd[r] / dt * 24) - S.flow[r]) * k; this.fd[r] = 0; }
  }

  _assign() {
    const S = this.S, hw = S.hw;
    let away = 0; for (const e of S.expeditions) away += e.crew;
    const able = Math.max(0, Math.floor((S.pop - S.sick) * 0.85) - away);
    let left = able, skLeft = Math.min(S.skilled, able);
    for (const r of ['ext', 'pur', 'tur']) {
      const want = Math.min(hw.slots[r], HW[r].workers[hw.lv[r] - 1]);
      const got = Math.min(want, left); hw.staff[r] = got; left -= got;
    }
    let outdoor = 0;
    for (const b of this.C.staffList) {
      const def = B[b.type];
      if (b.progress != null || !b.on || b.broken) { b.staff = 0; b.sk = 0; continue; }
      const got = Math.min(b.slots, left); b.staff = got; left -= got;
      if (def.skilled) { b.sk = Math.min(def.skilled, got, skLeft); skLeft -= b.sk; }
      if (def.outdoor) outdoor += got;
    }
    S.idle = left; S.able = able; S.outdoor = outdoor; S.away = away;
  }

  _housing() {
    const S = this.S, h = this.h;
    let cap = 0;
    for (const b of S.buildings) if (B[b.type].housing && b.progress == null) cap += B[b.type].housing.cap;
    const occ = cap > 0 ? Math.min(1, S.pop / cap) : 0;
    let expo = 0, mor = 0, eff = 0, housed = 0, tierSum = 0;
    for (const b of S.buildings) {
      const def = B[b.type]; if (!def.housing || b.progress != null) continue;
      const info = this.C.info[b.id] || {};
      const res = def.housing.cap * occ;
      let prot = def.housing.prot * (0.6 + 0.4 * b.cond / 100);
      if (def.wantsWater && !info.watered) prot *= 0.6;
      if (def.tier === 4 && (!info.powered || this.powerRatio < 0.5 || S.res.aether <= 0)) prot *= 0.6;
      if (info.shaded && this.shadeOn) prot += (1 - prot) * 0.4;
      b.res = res; b.prot = prot;
      expo += res * h * (1 - prot);
      mor += res * def.housing.morale; eff += res * def.housing.eff; housed += res; tierSum += res * def.tier;
    }
    const homeless = Math.max(0, S.pop - cap);
    expo += homeless * h * 1.05;
    S.housingCap = cap; S.homeless = homeless;
    const pop = Math.max(1, S.pop);
    this.homeExpo = expo / pop;
    this.houseMorale = mor / pop; this.houseEff = eff / pop; this.avgTier = housed ? tierSum / housed : 0;
  }

  _power() {
    const S = this.S, hw = S.hw, h = Math.min(1, this.h);
    const cool = this.hasTech('cooling');
    let gen = 0;
    const turStaff = hw.staff.tur / HW.tur.workers[hw.lv.tur - 1];
    const fuel = S.res.wood > 0 ? 1 : 0.3;
    this.turOut = {};
    for (const t of ['turA', 'turB']) {
      const out = hw.broken[t] ? 0 : HW.tur.base * HW.turMult[hw.lv.tur - 1] * (0.4 + 0.6 * hw.cond[t] / 100) * Math.min(1, turStaff) * fuel * (hw.coolant > 1 ? 1 : 0.55) * (1 - 0.12 * h) * (cool ? 1.15 : 1);
      this.turOut[t] = out; gen += out;
    }
    let use = 0;
    for (const b of S.buildings) {
      const def = B[b.type]; if (b.progress != null) continue;
      if (def.gen) gen += def.gen * (b.eff || 0);
      if (def.power && b.on && !b.broken && this.C.info[b.id].powered && (!def.workers || b.staff > 0 || this.C.equiv[b.id])) use += def.power;
    }
    const hwUse = (hw.staff.ext > 0 ? HW.ext.power[hw.lv.ext - 1] : 0) + (hw.staff.pur > 0 ? HW.pur.power[hw.lv.pur - 1] : 0);
    this.hwPower = hwUse > 0 ? Math.min(1, gen / hwUse) : 1;
    const rest = Math.max(0, gen - hwUse);
    this.powerRatio = use > 0 ? Math.min(1, rest / use) : 1;
    this.powerGen = gen; this.powerUse = use + hwUse; this.hwUse = hwUse;
  }

  _heartwell(dt) {
    const S = this.S, hw = S.hw, h = Math.min(1, this.h), f = dt / 24;
    const condF = c => 0.4 + 0.6 * hw.cond[c] / 100;
    const pw = 0.25 + 0.75 * this.hwPower;
    // extraction
    const extStaff = hw.staff.ext / HW.ext.workers[hw.lv.ext - 1];
    const ext = hw.broken.drill ? 0 : HW.ext.base * HW.mult[hw.lv.ext - 1] * extStaff * pw * condF('drill') * (1 - 0.18 * h);
    const rawCap = 300 * HW.mult[hw.lv.pur - 1];
    let got = Math.min(ext * f, rawCap - hw.raw + 60);
    // coolant basins fill first
    const coolNeed = Math.min(120 - hw.coolant, got * 0.5);
    hw.coolant += coolNeed; got -= coolNeed;
    hw.raw = Math.min(rawCap, hw.raw + got);
    const coolUse = 10 * (1 + 2 * h) * HW.turMult[hw.lv.tur - 1] * f * (hw.staff.tur > 0 ? 1 : 0.2);
    hw.coolant = Math.max(0, hw.coolant - coolUse);
    // purification
    const purStaff = hw.staff.pur / HW.pur.workers[hw.lv.pur - 1];
    const pur = hw.broken.silo ? 0 : HW.pur.base * HW.mult[hw.lv.pur - 1] * purStaff * pw * condF('silo');
    const moved = Math.min(pur * f, hw.raw, this.C.waterCap - S.res.water);
    if (moved > 0) { hw.raw -= moved; this.add('water', moved); }
    // turbine fuel
    if (hw.staff.tur > 0) this.add('wood', -HW.tur.wood[hw.lv.tur - 1] * f);
    // pumps
    const pumpCap = 520 * HW.mult[hw.lv.pur - 1] * (hw.broken.pump ? 0.25 : condF('pump')) * (0.35 + 0.65 * this.hwPower);
    this.pumpBudget = pumpCap * f;
    this.hwRates.ext = ext; this.hwRates.pur = pur; this.hwRates.pump = pumpCap;
  }
  drawWater(need) {
    if (need <= 0) return 0;
    const got = Math.min(need, this.S.res.water, this.pumpBudget);
    if (got > 0) { this.pumpBudget -= got; this.add('water', -got); }
    return got;
  }

  _people(dt) {
    const S = this.S, h = this.h, f = dt / 24, P = S.policies;
    const pop = S.pop; if (pop <= 0) return;
    // water
    const wNeed = pop * 2.2 * (1 + 1.7 * Math.min(1.2, h)) * (P.ration ? 0.75 : 1) * f;
    const wGot = this.drawWater(wNeed);
    const short = 1 - wGot / wNeed;
    S.thirst += (short - S.thirst) * (1 - Math.exp(-dt / 3));
    this.hwRates.demand = wNeed / f;
    // food
    const fNeed = pop * (P.feast ? 1.3 : 1) * f;
    const fGot = Math.min(fNeed, S.res.food); this.add('food', -fGot);
    S.hunger += ((1 - fGot / fNeed) - S.hunger) * (1 - Math.exp(-dt / 8));
    // spoilage
    let keep = 0;
    for (const b of S.buildings) if (b.type === 'smokehouse') keep += 700 * (b.eff || 0);
    const spoilRate = 0.012 + 0.03 * Math.min(1, h);
    const prot = Math.min(S.res.food, keep);
    this.spoil = (S.res.food - prot) * spoilRate + prot * spoilRate * 0.5;
    this.add('food', -this.spoil * f);
    // shade pavilions need water
    let shadeNeed = 0; for (const b of S.buildings) if (b.type === 'shade' && b.progress == null && b.on) shadeNeed += B.shade.in.water * f * (0.3 + h);
    this.shadeOn = shadeNeed > 0 && (!P.ration || S.res.water > this.C.waterCap * 0.25) && this.drawWater(shadeNeed) >= shadeNeed * 0.9;

    // exposure
    const curfewOn = P.curfew && h > 0.2;
    const rigShare = S.outdoor > 0 ? Math.min(1, S.rigs / S.outdoor) : 0;
    this.rigShare = rigShare; this.curfewOn = curfewOn;
    const outExpo = (S.outdoor / pop) * 0.45 * h * (curfewOn ? 0.3 : 1) * (1 - 0.5 * rigShare);
    const E = this.homeExpo + outExpo + S.thirst * 0.8 + (P.ration ? 0.05 * h : 0) - (P.feast ? 0.03 : 0);
    this.expo = Math.max(0, E);
    const e = this.expo;
    // sickness / recovery / death
    const med = this.hasTech('medicine');
    let medStaff = 0; for (const b of S.buildings) if (b.type === 'medical' && b.progress == null && !b.broken) medStaff += b.staff * (0.5 + 0.5 * b.cond / 100);
    this.medCover = Math.min(1, medStaff * 30 / pop);
    const healthy = pop - S.sick;
    S.acc.sick += healthy * (0.004 + 0.04 * e + 0.15 * e * e + S.hunger * 0.3 + S.thirst * 0.4) * (med ? 0.7 : 1) * f;
    S.acc.heal += (medStaff * 2.2 * (med ? 1.5 : 1) + S.sick * 0.1 * (e < 0.25 ? 1 : 0.35)) * f;
    S.acc.death += (S.sick * (0.008 + 0.06 * e + S.thirst * 0.4 + S.hunger * 0.15) * (1 - 0.5 * this.medCover) + pop * (Math.max(0, S.hunger - 0.5) * 0.05 + Math.max(0, S.thirst - 0.4) * 0.12)) * f;
    while (S.acc.sick >= 1) { S.acc.sick -= 1; if (S.sick < S.pop) S.sick++; }
    while (S.acc.heal >= 1) { S.acc.heal -= 1; if (S.sick > 0) S.sick--; else S.acc.heal = 0; }
    while (S.acc.death >= 1) {
      S.acc.death -= 1;
      if (S.pop > 0) {
        if (S.sick < 1) S.sick = 1;
        if (this.rand() < S.skilled / S.pop) S.skilled--;
        S.sick--; S.pop--; S.deaths++; S.dayDeaths++; S.grief = Math.min(32, S.grief + 4);
        this.events.push({ type: 'death' });
      }
    }
    if (S.pop <= 3 && !S.over) { S.over = true; this.log('Almond Valley has been abandoned.', 'crit'); this.events.push({ type: 'over' }); }
    // morale
    let market = 0, bet = 0, office = 0;
    for (const b of S.buildings) {
      if (b.progress != null || b.broken) continue;
      const sr = B[b.type].workers ? b.staff / B[b.type].workers : 0;
      if (b.type === 'market') market += sr * 60; else if (b.type === 'betting') bet += sr * 90; else if (b.type === 'office') office = sr;
    }
    const foodDays = S.res.food / Math.max(1, pop);
    const m = this.moraleParts = {
      Base: 50,
      Housing: this.houseMorale,
      Food: S.hunger > 0.05 ? -25 * S.hunger : foodDays > 4 ? 5 : foodDays > 1.5 ? 0 : -6,
      Water: -30 * S.thirst + (P.ration ? -6 : 0),
      Market: 6 * Math.min(1, market / pop),
      'Betting Hall': 5 * Math.min(1, bet / pop),
      Health: -25 * S.sick / pop,
      Heat: -12 * Math.min(1.2, e),
      Grief: -S.grief,
      Homeless: -35 * S.homeless / pop,
      Policies: (P.feast ? 6 : 0) + (curfewOn ? 2 : 0) + office * 3,
    };
    let target = 0; for (const k in m) target += m[k];
    target = clamp(target, 0, 100);
    S.morale += (target - S.morale) * (1 - Math.exp(-f * 0.9));
    this.moraleTarget = target;
    this.workMult = (0.8 + 0.4 * S.morale / 100) * (1 + this.houseEff) * (1 + 0.08 * office) * (S.hunger > 0.3 ? 0.8 : 1);
    S.grief = Math.max(0, S.grief - S.grief * 0.08 * f - 0.3 * f);
    // education
    let teachers = 0; for (const b of S.buildings) if (b.type === 'school' && b.progress == null && !b.broken) teachers += b.staff;
    if (teachers > 0 && S.skilled < Math.floor(S.pop * 0.5)) { S.acc.edu += teachers * 0.45 * f; while (S.acc.edu >= 1) { S.acc.edu -= 1; S.skilled++; } }
    S.skilled = clamp(S.skilled, 0, S.pop);
  }

  outMult(b) {
    const t = b.type; let m = 1;
    const info = this.C.info[b.id];
    if (B[t].node) m *= info.rich || 0;
    if (this.hasTech('tools') && (t === 'hunter' || t === 'lumber' || t === 'quarry' || t === 'mine')) m *= 1.15;
    if (this.hasTech('irrigation') && t === 'farm') m *= 1.2;
    if (this.hasTech('automation') && (t === 'workshop' || t === 'mine')) m *= 1.2;
    if (t === 'hunter' && this.S.zones.north) m *= 1.4;
    return m;
  }
  inRate(b, r) { let v = B[b.type].in[r]; if (b.type === 'farm' && r === 'water' && this.hasTech('irrigation')) v *= 0.5; return v; }
  bufCap(b, r) { return Math.max(20, B[b.type].out[r] * this.outMult(b) * 1.5); }

  _production(dt) {
    const S = this.S, f = dt / 24, h = Math.min(1, this.h);
    for (const b of S.buildings) {
      const def = B[b.type];
      if (def.housing || def.unique || b.type === 'shade') {
        if (b.type === 'climate' && b.progress == null) this.add('aether', -def.in.aether * f);
        b.eff = b.progress == null ? 1 : 0; continue;
      }
      const info = this.C.info[b.id];
      let e = 1, issue = '';
      if (b.progress != null) { b.eff = 0; b.issue = 'Under construction'; continue; }
      if (b.broken) { b.eff = 0; b.issue = 'Broken down'; continue; }
      if (!b.on) { b.eff = 0; b.issue = 'Paused'; continue; }
      if (def.workers) {
        const eq = this.C.equiv[b.id] || 0;
        const r = Math.min(1.3, (b.staff + eq) / def.workers);
        if (r <= 0) { b.eff = 0; b.issue = 'No workers'; continue; }
        if (r < 0.99) issue = 'Short-staffed';
        e *= r;
        if (def.skilled) {
          const sr = b.sk / def.skilled;
          if (sr <= 0) { b.eff = 0; b.issue = 'Needs skilled workers'; continue; }
          e *= 0.25 + 0.75 * sr; if (sr < 1) issue = 'Needs more skilled workers';
        }
        e *= this.workMult;
      }
      if (def.power) {
        if (!info.powered) { b.eff = 0; b.issue = 'No power connection'; continue; }
        if (this.powerRatio < 0.99) issue = 'Power shortage';
        e *= this.powerRatio;
      }
      e *= 0.5 + 0.5 * b.cond / 100;
      if (def.outdoor) { e *= 1 - 0.3 * h; if (this.curfewOn) e *= 0.7; e *= 1 + 0.25 * (this.rigShare || 0); }
      if (def.wantsWater && !info.watered) { e *= 0.4; issue = 'Off the water network'; }
      // inputs
      let fac = 1;
      if (def.in) for (const r in def.in) {
        const need = this.inRate(b, r) * e * f; if (need <= 0) continue;
        let have = S.res[r];
        if (r === 'water') { have = Math.min(have, this.pumpBudget); if (S.policies.ration && b.type === 'farm' && S.res.water < this.C.waterCap * 0.3) have = 0; }
        if (have < need) { fac = Math.min(fac, have / need); issue = `Out of ${r}`; }
      }
      // output room
      const mult = this.outMult(b);
      if (def.out) for (const r in def.out) {
        if (r === 'scrip') continue;
        const cap = this.bufCap(b, r), cur = b.out[r] || 0;
        const want = def.out[r] * mult * e * f;
        if (want > 0 && cur + want > cap) { fac = Math.min(fac, Math.max(0, (cap - cur) / want)); if (cap - cur < want * 0.5) issue = 'Output full — needs hauling'; }
      }
      e *= fac;
      if (def.in) for (const r in def.in) { const need = this.inRate(b, r) * e * f; if (r === 'water') this.drawWater(need); else this.add(r, -need); }
      if (def.out) for (const r in def.out) {
        const amt = def.out[r] * mult * e * f;
        if (r === 'scrip') this.add('scrip', amt); else b.out[r] = (b.out[r] || 0) + amt;
      }
      // carriers walk goods to storage
      if (def.out) for (const r in def.out) {
        if (r === 'scrip' || !b.out[r]) continue;
        const move = Math.min(b.out[r], this.bufCap(b, r) * (info.linked ? 1.3 : 0.4) * f);
        const stored = this.add(r, move);
        b.out[r] -= stored;
      }
      b.eff = e; b.issue = e > 0 ? issue : (issue || 'Idle');
      // fabrication queue
      if (b.type === 'fabrication' && b.queue.length && e > 0) {
        const q = b.queue[0];
        q.progress += 5 * e * dt;
        if (q.progress >= CLICKERS[q.role].work) {
          b.queue.shift();
          const fp = footprint(b);
          const c = this._newClicker(q.role, fp.x + fp.w / 2, fp.z + fp.d + 0.5); c.cond = 100;
          S.clickers.push(c); S.madeClickers = (S.madeClickers || 0) + 1;
          this.log(`${CLICKERS[q.role].name} rolled out of the Fabrication Plant.`, 'good');
          this.events.push({ type: 'clicker', id: c.id });
        }
      }
    }
  }

  _wear(dt) {
    const S = this.S, f = dt / 24, h = Math.min(1.3, this.h);
    const heatWear = 1 + 1.8 * h;
    for (const b of S.buildings) {
      const def = B[b.type]; if (!def.wear || b.progress != null) continue;
      const active = def.workers ? (b.eff > 0 ? 1 : 0.3) : 1;
      b.cond = Math.max(0, b.cond - def.wear * heatWear * active * f);
    }
    const hwWear = 1.0 * (1 + 1.8 * h * (this.hasTech('cooling') ? 0.6 : 1)) * f;
    const hw = S.hw;
    for (const c in hw.cond) {
      let w = hwWear;
      if ((c === 'turA' || c === 'turB') && hw.coolant <= 1) w *= 3;
      hw.cond[c] = Math.max(0, hw.cond[c] - w);
    }
    // utility depot crews: global repair pool on the worst item
    let pool = 0;
    for (const b of S.buildings) if (b.type === 'utility' && b.progress == null && !b.broken) pool += b.staff * 16 * this.workMult;
    this.repairPool = pool;
    pool *= f;
    let guard = 0;
    while (pool > 0.001 && S.res.parts > 0.05 && guard++ < 4) {
      let worst = null, wc = 85, comp = null, clk = null;
      for (const c in hw.cond) if (hw.cond[c] < wc - 5) { wc = hw.cond[c] + 5; worst = hw; comp = c; clk = null; }
      for (const b of S.buildings) if (b.progress == null && B[b.type].wear && b.cond < wc) { wc = b.cond; worst = b; comp = null; clk = null; }
      for (const c of S.clickers) if (c.cond < wc - 10) { wc = c.cond + 10; worst = c; clk = c; comp = null; }
      if (!worst) break;
      const pts = Math.min(pool, 10);
      const used = this._repair(worst, comp, pts);
      if (used <= 0) break;
      pool -= pts;
    }
  }
  _repair(target, comp, pts) { // returns points applied; costs parts
    const S = this.S;
    const can = Math.min(pts, S.res.parts * 12);
    if (can <= 0) return 0;
    this.add('parts', -can / 12);
    if (comp) {
      S.hw.cond[comp] = Math.min(100, S.hw.cond[comp] + can);
      if (S.hw.broken[comp] && S.hw.cond[comp] >= 45) { delete S.hw.broken[comp]; this.log(`${HW.comps[comp]} is back in service.`, 'good'); }
    } else {
      target.cond = Math.min(100, target.cond + can);
      if (target.broken && target.cond >= 45) { target.broken = false; this.dirty = true; if (target.type) this.log(`${B[target.type].name} repaired and running.`, 'good'); }
    }
    return can;
  }

  _construction(dt) {
    const S = this.S;
    const sites = this.sites = S.buildings.filter(b => b.progress != null || b.upgrade);
    if (!sites.length) { this.buildIdle = 0; return; }
    sites.sort((a, b) => (b.prio - a.prio) || (a.id - b.id));
    const labour = (1 - 0.3 * Math.min(1, this.h)) * (this.curfewOn ? 0.7 : 1);
    let humans = S.idle;
    const builders = {};
    for (const c of S.clickers) if (c.task && c.task.kind === 'build' && c.state === 'act' && !c.dormant && !c.broken) builders[c.task.bid] = (builders[c.task.bid] || 0) + CLICKERS[c.role].build * (this.hasTech('automation') ? 1.35 : 1);
    for (const b of sites) {
      const crew = Math.min(6, humans); humans -= crew;
      const pts = (crew * 1.0 * labour + (builders[b.id] || 0)) * BUILD_PACE * dt;
      b.crew = crew;
      if (b.progress != null) {
        b.progress += pts;
        if (b.progress >= B[b.type].work) {
          b.progress = null; b.crew = 0; this.dirty = true;
          this.log(`${B[b.type].name} completed.`, 'good');
          this.events.push({ type: 'built', id: b.id });
        }
      } else if (b.upgrade) {
        b.upgrade.progress += pts;
        if (b.upgrade.progress >= b.upgrade.work) {
          b.type = b.upgrade.to; b.upgrade = null; b.cond = 100; b.crew = 0; this.dirty = true;
          this.log(`Home upgraded to ${B[b.type].name}.`, 'good');
          this.events.push({ type: 'built', id: b.id });
        }
      }
    }
  }

  // ------------------------------------------------------------------ clickers
  _goalMask(f) {
    const g = this._gm || (this._gm = new Uint8Array(N * N)); g.fill(0);
    const bl = this.C.blocked;
    for (let x = f.x - 1; x <= f.x + f.w; x++) for (let z = f.z - 1; z <= f.z + f.d; z++) {
      if (x >= f.x && x < f.x + f.w && z >= f.z && z < f.z + f.d) continue;
      if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) continue;
      const i = z * N + x; if (!bl[i]) g[i] = 1;
    }
    return g;
  }
  pathTo(x, z, f) {
    const sx = clamp(Math.floor(x), 1, N - 2), sz = clamp(Math.floor(z), 1, N - 2);
    const p = findPath(N, this.C.blocked, this.S.roads, sx, sz, this._goalMask(f));
    if (p) return p;
    return [[clamp(f.x - 1, 1, N - 2), clamp(f.z + ((f.d / 2) | 0), 1, N - 2)]];
  }
  _send(c, task) {
    const b = this.byId(task.bid); if (!b) { c.task = null; return; }
    c.task = task; c.state = 'move'; c.path = this.pathTo(c.x, c.z, footprint(b));
  }
  _clickers(dt) {
    const S = this.S;
    const equiv = {};
    const auto = this.hasTech('automation') ? 1.35 : 1;
    const noAether = S.res.aether <= 0;
    if (noAether && !this._aetherWarned && S.clickers.length) { this._aetherWarned = true; this.log('Aether cells exhausted — Clickers have gone dormant.', 'crit', true); }
    if (!noAether) this._aetherWarned = false;
    const claimed = {};
    for (const c of S.clickers) if (c.task && c.task.kind !== 'idle' && c.task.kind !== 'work') claimed[c.task.kind + c.task.bid + (c.task.comp || '')] = (claimed[c.task.kind + c.task.bid + (c.task.comp || '')] || 0) + 1;
    for (const c of S.clickers) {
      const def = CLICKERS[c.role];
      c.dormant = noAether;
      if (c.broken) { // workshop crews drag it back to life, slowly
        if (S.res.parts > 0.5 && S.buildings.some(b => (b.type === 'workshop' || b.type === 'utility') && b.staff > 0)) { const can = 22 * dt / 24; this.add('parts', -can / 12); c.cond += can; }
        if (c.cond >= 45) c.broken = false;
        continue;
      }
      if (c.dormant) continue;
      const working = c.task && c.task.kind !== 'idle';
      this.add('aether', -def.aether * (working ? 1 : 0.35) * dt / 24);
      c.cond = Math.max(0, c.cond - 1.1 * (1 + 1.5 * Math.min(1, this.h)) * (working ? 1 : 0.3) * dt / 24);
      if (c.cond < 12) { c.broken = true; c.task = null; c.path = []; this.log(`${def.name} has broken down.`, 'warn'); continue; }
      // think
      c.think -= dt;
      if ((!c.task || c.task.kind === 'idle') && c.think <= 0) { c.think = 0.4; this._pickTask(c, claimed); }
      if (c.task && c.task.kind === 'work' && c.think <= 0) { c.think = 6; const b = this.byId(c.task.bid); if (!b || b.progress != null || b.broken) c.task = null; }
      if (!c.task) continue;
      // move
      if (c.state === 'move') {
        let stepLeft = def.speed * auto * dt;
        while (stepLeft > 0 && c.path.length) {
          const tx = c.path[0][0] + 0.5, tz = c.path[0][1] + 0.5;
          const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
          if (d > 1e-4) c.dir = Math.atan2(dx, dz);
          if (d <= stepLeft) { c.x = tx; c.z = tz; stepLeft -= d; c.path.shift(); }
          else { c.x += dx / d * stepLeft; c.z += dz / d * stepLeft; stepLeft = 0; }
        }
        if (!c.path.length) { c.state = 'act'; this._arrive(c); }
        continue;
      }
      // act
      const t = c.task, b = this.byId(t.bid);
      if (!b) { c.task = null; continue; }
      { const f = footprint(b); c.dir = Math.atan2(f.x + f.w / 2 - c.x, f.z + f.d / 2 - c.z); }
      if (t.kind === 'build') { if (b.progress == null && !b.upgrade) c.task = null; }
      else if (t.kind === 'repair') {
        const pts = def.repair * auto * dt / 24;
        const cur = t.comp ? S.hw.cond[t.comp] : b.cond;
        if (cur >= 97) { c.task = null; continue; }
        t.stalled = this._repair(b, t.comp, pts) <= 0;
      } else if (t.kind === 'service') {
        if (c.cond >= 95) { c.task = null; continue; }
        const can = Math.min(60 * dt / 24, S.res.parts * 12);
        if (can > 0) { this.add('parts', -can / 12); c.cond += can; }
      } else if (t.kind === 'work') {
        equiv[b.id] = (equiv[b.id] || 0) + def.equiv * auto * (0.5 + 0.5 * c.cond / 100);
      }
    }
    this.C.equiv = equiv;
  }
  _arrive(c) {
    const S = this.S, t = c.task, def = CLICKERS[c.role];
    const b = this.byId(t.bid); if (!b) { c.task = null; return; }
    if (t.kind === 'haul') {
      let total = 0; for (const r in b.out) total += b.out[r];
      if (total < 1) { c.task = null; return; }
      const k = Math.min(1, def.load / total);
      c.carry = {};
      for (const r in b.out) { const a = b.out[r] * k; c.carry[r] = a; b.out[r] -= a; }
      let best = null, bd = 1e9;
      for (const d of this.C.drops) { const f = footprint(d); const dist = Math.hypot(f.x + f.w / 2 - c.x, f.z + f.d / 2 - c.z); if (dist < bd) { bd = dist; best = d; } }
      this._send(c, { kind: 'drop', bid: best.id });
    } else if (t.kind === 'drop') {
      for (const r in c.carry) this.add(r, c.carry[r]);
      c.carry = null; c.task = null; c.think = 0;
    } else if (t.kind === 'idle') { c.state = 'act'; }
  }
  _pickTask(c, claimed) {
    const S = this.S, role = c.role, def = CLICKERS[role];
    const take = (kind, bid, comp) => { const k = kind + bid + (comp || ''); claimed[k] = (claimed[k] || 0) + 1; this._send(c, { kind, bid, comp }); return true; };
    const free = (kind, bid, comp, max = 1) => (claimed[kind + bid + (comp || '')] || 0) < max;
    // self service
    if (c.cond < 35 && S.res.parts > 2) {
      const shop = S.buildings.find(b => (b.type === 'utility' || b.type === 'fabrication' || b.type === 'workshop') && b.progress == null);
      if (shop) { this._send(c, { kind: 'service', bid: shop.id }); return; }
    }
    if (def.build) {
      for (const b of (this.sites || [])) if (free('build', b.id, '', 2)) return take('build', b.id);
    }
    if (def.repair) {
      const thr = role === 'master' ? 66 : 82;
      let best = null, bc = thr, comp = null;
      for (const k in S.hw.cond) if (S.hw.cond[k] < bc - 4 && free('repair', this.C.hw.id, k)) { bc = S.hw.cond[k] + 4; best = this.C.hw; comp = k; }
      for (const b of S.buildings) if (b.progress == null && B[b.type].wear && (b.cond < bc || (b.broken && bc > 0)) && free('repair', b.id)) { bc = b.broken ? -1 : b.cond; best = b; comp = null; }
      if (best && S.res.parts > 1) return take('repair', best.id, comp);
    }
    if (def.load) {
      let best = null, bf = role === 'master' ? 0.3 : 0.2;
      for (const b of S.buildings) {
        const d = B[b.type]; if (!d.out || b.progress != null) continue;
        let fill = 0, tot = 0;
        for (const r in d.out) { if (r === 'scrip') continue; fill = Math.max(fill, (b.out[r] || 0) / this.bufCap(b, r)); tot += b.out[r] || 0; }
        if (tot >= 12 && fill > bf && free('haul', b.id)) { bf = fill; best = b; }
      }
      if (best) return take('haul', best.id);
    }
    if (def.equiv) {
      let best = null, bn = 99;
      const pin = c.pin && this.byId(c.pin);
      if (pin && B[pin.type].auto === role && pin.progress == null) best = pin;
      else {
        const counts = {};
        for (const k of S.clickers) if (k.task && k.task.kind === 'work') counts[k.task.bid] = (counts[k.task.bid] || 0) + 1;
        for (const b of S.buildings) if (B[b.type].auto === role && b.progress == null && !b.broken && (counts[b.id] || 0) < bn) { bn = counts[b.id] || 0; best = b; }
      }
      if (best) { this._send(c, { kind: 'work', bid: best.id }); c.think = 6; return; }
    }
    // idle: stand by the Heartwell
    if (!c.task) {
      const f = this.C.hwF;
      const spot = { x: f.x - 2 + ((c.id * 3) % (f.w + 3)), z: c.id % 2 ? f.z + f.d + 1 : f.z - 2, w: 1, d: 1 };
      if (Math.hypot(spot.x - c.x, spot.z - c.z) > 2.5) { c.task = { kind: 'idle', bid: this.C.hw.id }; c.state = 'move'; c.path = this.pathTo(c.x, c.z, spot); }
      else c.task = { kind: 'idle', bid: this.C.hw.id }, c.state = 'act';
    }
  }

  _research(dt) {
    const T = this.S.tech; if (!T.cur) return;
    T.rp += this.researchRate() * dt / 24;
    if (T.rp >= TECH[T.cur].rp) {
      const id = T.cur; T.done[id] = true; T.cur = null; T.rp = 0;
      this.log(`Research complete: ${TECH[id].name}.`, 'good');
      this.events.push({ type: 'tech', id });
      this._objectives();
    }
  }

  _world(dt) {
    const S = this.S;
    // season announcements
    const sn = this.seasonName();
    if (sn !== S.season) {
      const prev = S.season; S.season = sn;
      if (sn === 'Double Noon') this.log(`Double Noon has begun. Both suns stand overhead.`, 'crit');
      else if (sn === 'High Summer') this.log('High Summer. The heat is climbing toward Double Noon.', 'warn');
      else if (prev === 'Double Noon') { S.summers++; this.log(`Double Noon has passed. The valley endured its ${ord(S.summers)} summer.`, 'good'); this._objectives(); }
      else this.log(`${sn} has arrived.`, 'info');
      this.events.push({ type: 'season', name: sn });
    }
    // train
    if (S.time >= S.train.next) {
      S.train.at = S.train.next; S.train.next += 48;
      let depots = 0; for (const b of S.buildings) if (b.type === 'depot' && b.progress == null && b.staff > 0) depots++;
      S.trade.cargo = 40 + depots * 160;
      const free = S.housingCap - S.pop;
      if (S.morale >= 48 && free > 0 && S.res.food > S.pop * 4 && S.thirst < 0.2) {
        const n = Math.min(free, 1 + Math.floor((S.morale - 48) / 10) + depots);
        S.pop += n; for (let i = 0; i < n; i++) if (this.rand() < 0.2) S.skilled++;
        this.log(`The High Noon train brought ${n} new settler${n > 1 ? 's' : ''}.`, 'good');
      } else if (S.morale < 22 && S.pop > 8) {
        const n = Math.min(S.pop - 8, 1 + Math.floor((22 - S.morale) / 8));
        S.pop -= n; S.sick = Math.min(S.sick, S.pop); S.skilled = Math.min(S.skilled, S.pop);
        this.log(`${n} resident${n > 1 ? 's' : ''} gave up and left on the train.`, 'warn');
      }
      this.events.push({ type: 'train' });
    }
    // expeditions
    for (let i = S.expeditions.length - 1; i >= 0; i--) {
      const e = S.expeditions[i]; e.left -= dt;
      if (e.left > 0) continue;
      S.expeditions.splice(i, 1);
      if (e.kind === 'claim') {
        S.zones[e.zone] = true; this.dirty = true;
        this.log(`${ZONES[e.zone].name} surveyed and claimed. New ground is open for building.`, 'good');
        this.events.push({ type: 'zone', zone: e.zone });
        this._objectives();
      } else {
        const def = EXPEDITIONS[e.kind]; const got = [];
        const bonus = 1 + 0.3 * Math.min(1, S.rigs / def.crew);
        for (const r in def.gain) { const [a, b] = def.gain[r]; const n = Math.round((a + this.rand() * (b - a)) * bonus); this.S.res[r] = Math.min(this.cap(r), this.S.res[r] + n); got.push(`${n} ${r}`); }
        let msg = `${def.name} returned with ${got.join(', ')}.`;
        if (this.h > 0.5 && this.rand() < 0.35 * (1 - 0.6 * Math.min(1, S.rigs / def.crew))) { S.sick = Math.min(S.pop, S.sick + 2); msg += ' Two came back heat-sick.'; }
        this.log(msg, 'good');
      }
    }
  }

  _daily() {
    const S = this.S, hw = S.hw;
    if (S.dayDeaths > 0) { this.log(`${S.dayDeaths} resident${S.dayDeaths > 1 ? 's' : ''} died yesterday.`, 'crit', true); S.dayDeaths = 0; }
    // breakdowns
    for (const b of S.buildings) {
      if (b.progress != null || b.broken || !B[b.type].wear || B[b.type].housing) continue;
      if (b.cond < 30 && this.rand() < (30 - b.cond) / 30 * 0.6) { b.broken = true; this.dirty = true; this.log(`${B[b.type].name} has broken down.`, 'warn'); this.events.push({ type: 'broke', id: b.id }); }
    }
    for (const c in hw.cond) {
      if (!hw.broken[c] && hw.cond[c] < 30 && this.rand() < (30 - hw.cond[c]) / 30 * 0.6) { hw.broken[c] = true; this.log(`Heartwell failure: ${HW.comps[c]} is down.`, 'crit', true); this.events.push({ type: 'broke', id: this.C.hw.id }); }
    }
    S.hist.push({ d: this.day(), t: Math.round(seasonTemp(this.doy(), this.year())), w: Math.round(S.res.water), f: Math.round(S.res.food), p: S.pop, m: Math.round(S.morale), x: S.deaths });
    if (S.hist.length > 120) S.hist.shift();
    this._objectives();
    this.events.push({ type: 'day' });
  }

  // ------------------------------------------------------------------ objectives & alerts
  objectives() {
    const S = this.S, c = t => this.count(t);
    const startHomes = 11;
    const homes = S.buildings.filter(b => B[b.type].housing && b.progress == null).length;
    const list = [
      { id: 'homes', name: 'Shelter the Valley', desc: 'Build 2 new homes', cur: Math.max(0, homes - startHomes), max: 2, reward: { wood: 60 } },
      { id: 'study', name: 'Study the Heat', desc: 'Research Insulated Homes', cur: S.tech.done.insulation ? 1 : 0, max: 1, reward: { stone: 60 } },
      { id: 'medic', name: 'Tend the Sick', desc: 'Build a Medical Post', cur: c('medical'), max: 1, reward: { food: 80 } },
      { id: 'insul', name: 'Expand Housing', desc: 'Have 4 Insulated Homes or better', cur: c('insulated') + c('climate'), max: 4, reward: { parts: 20 } },
      { id: 'valve', name: 'Expand the Valve Network', desc: 'Build a Valve Station on a water main', cur: c('valve'), max: 1, reward: { metal: 40 } },
      { id: 'noon1', name: 'Prepare for Double Noon', desc: 'Survive the first Double Noon', cur: S.summers, max: 1, reward: { scrip: 150 } },
      { id: 'claim', name: 'Into the Canyon', desc: 'Survey and claim a new district', cur: Object.keys(S.zones).length - 1, max: 1, reward: { wood: 80, stone: 80 } },
      { id: 'mine', name: 'Iron in the East', desc: 'Operate an Iron Mine', cur: c('mine'), max: 1, reward: { parts: 25 } },
      { id: 'deep', name: 'Deepen the Heartwell', desc: 'Raise any Heartwell system to level 2', cur: Math.max(...Object.values(S.hw.lv)) - 1, max: 1, reward: { metal: 60 } },
      { id: 'fleet', name: 'The Automation Fleet', desc: 'Manufacture a Clicker', cur: S.madeClickers || 0, max: 1, reward: { aether: 25 } },
      { id: 'aether', name: 'Bottled Lightning', desc: 'Operate an Aether Plant', cur: c('refinery'), max: 1, reward: { scrip: 200 } },
      { id: 'climate', name: 'Climate Residences', desc: 'Build 2 Climate Residences', cur: c('climate'), max: 2, reward: { scrip: 250 } },
      { id: 'pop', name: 'A Living Civilization', desc: 'Reach a population of 120', cur: S.pop, max: 120, reward: { scrip: 300 } },
      { id: 'noon3', name: 'Three Summers', desc: 'Survive three Double Noons', cur: S.summers, max: 3, reward: { scrip: 500 } },
    ];
    return list;
  }
  _objectives() {
    const S = this.S;
    let shown = 0;
    for (const o of this.objectives()) {
      if (S.obj[o.id]) continue;
      if (++shown > 3) break;
      if (o.cur >= o.max) {
        S.obj[o.id] = true;
        for (const k in o.reward) S.res[k] = Math.min(this.cap(k), S.res[k] + o.reward[k]);
        this.log(`Objective complete: ${o.name}. Reward: ${costText(o.reward)}.`, 'good');
        this.events.push({ type: 'objective', id: o.id });
      }
    }
  }
  alerts() {
    const S = this.S, out = [], hw = S.hw;
    const wp = S.res.water / this.C.waterCap;
    if (S.thirst > 0.1) out.push({ sev: 'crit', msg: 'Residents are going thirsty', go: 'heartwell' });
    else if (wp < 0.25) out.push({ sev: 'crit', msg: `Low water reserve (${Math.round(wp * 100)}%)`, go: 'heartwell' });
    else if (wp < 0.6 && S.flow.water < -20) out.push({ sev: 'warn', msg: 'Water reserves declining', go: 'heartwell' });
    if (S.hunger > 0.1) out.push({ sev: 'crit', msg: 'Residents are starving', go: 'storage' });
    else if (S.res.food < S.pop * 2) out.push({ sev: 'warn', msg: 'Rations running low', go: 'storage' });
    for (const c in hw.broken) out.push({ sev: 'crit', msg: `${HW.comps[c]} is down`, go: 'heartwell' });
    if (S.sick >= Math.max(4, S.pop * 0.12)) out.push({ sev: S.sick > S.pop * 0.3 ? 'crit' : 'warn', msg: `${S.sick} residents heat-sick`, go: 'people' });
    if (S.homeless > 0) out.push({ sev: 'warn', msg: `${S.homeless} homeless residents`, go: 'build' });
    const broken = S.buildings.filter(b => b.broken);
    if (broken.length) out.push({ sev: 'warn', msg: `${broken.length} building${broken.length > 1 ? 's' : ''} broken down`, go: 'b' + broken[0].id });
    if (this.powerRatio < 0.95) out.push({ sev: 'warn', msg: 'Power shortage', go: 'production' });
    if (this.hwPower < 0.95) out.push({ sev: 'crit', msg: 'Heartwell underpowered', go: 'heartwell' });
    if (S.res.aether <= 0 && S.clickers.length) out.push({ sev: 'warn', msg: 'Clickers dormant — no aether', go: 'storage' });
    if (S.res.parts < 2 && (S.buildings.some(b => b.cond < 50 && b.progress == null))) out.push({ sev: 'warn', msg: 'No parts for repairs', go: 'storage' });
    if (S.idle >= 5 && !(this.sites && this.sites.length)) out.push({ sev: 'info', msg: `${S.idle} unassigned workers`, go: 'people' });
    const dn = this.daysToDoubleNoon();
    if (dn > 0 && dn <= 8) out.push({ sev: 'warn', msg: `Double Noon in ${Math.ceil(dn)} day${Math.ceil(dn) > 1 ? 's' : ''}`, go: 'people' });
    return out;
  }

  serialize() { return JSON.stringify(this.S); }
}

function ord(n) { return n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : n + 'th'; }

function migrate(S) {
  const base = newState();
  for (const k in base) if (S[k] === undefined) S[k] = base[k];
  for (const b of S.buildings) { if (b.type === 'fabrication' && !b.queue) b.queue = []; if (!b.out) b.out = {}; }
  for (const c of S.clickers) { c.path = c.path || []; }
  S.over = !!S.over;
  // v2: slower days. Speeds are now pause/1x/2x/4x; the map grew around the existing settlement, so
  // buildings, roads and claims carry over untouched.
  if (!(S.v >= 2)) { if (![0, 1, 2, 4].includes(S.speed)) S.speed = 1; S.v = 2; }
  return S;
}
