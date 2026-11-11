import './style.css';
import { Sim, footprint } from './sim.js';
import { View } from './render.js';
import { UI } from './ui.js';
import { bindInput } from './input.js';
import { B, N, DAY_SECONDS } from './data.js';

const SAVE_KEY = 'almond-valley-save-v1';
const PREF_KEY = 'almond-valley-prefs-v1';

function readSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function prefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } }
function setPref(k, v) { try { const p = prefs(); p[k] = v; localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ } }

const canvas = document.getElementById('c');
let saved = readSave();
if (saved && saved.over) saved = null;
let sim;
try { sim = new Sim(saved); } catch (e) { console.warn('Save could not be loaded, starting fresh', e); sim = new Sim(); }

const game = {
  sim, view: null, ui: null, speed: 1, lastSpeed: 1, placing: null, quality: 'med', fps: 0, lastSaved: '',

  setSpeed(s) { if (s > 0) this.lastSpeed = s; this.speed = s; this.sim.S.speed = s; },
  setOverlay(m) { this.view.setOverlay(m); },
  setShadows(on) { this.view.setShadows(on); setPref('shadows', on); },
  setClickerModel(m) { this.view.setClickerModel(m); setPref('clickerModel', m); },
  setBuildingModels(m) { this.view.setBuildingModels(m); setPref('buildingModels', m); },
  setQuality(q) {
    this.quality = q; setPref('quality', q);
    const dpr = window.devicePixelRatio || 1;
    this.view.pixelRatio = q === 'low' ? Math.min(dpr, 1) : q === 'med' ? Math.min(dpr, 2) : Math.min(dpr, 3);
    this.view.resize();
  },

  // ---- selection
  select(hit) {
    if (hit.building) { this.view.setSelected(hit.building); this.ui.open('building', hit.building); }
    else if (hit.clicker) { this.view.setSelected(null); this.ui.open('clicker', hit.clicker); }
    else if (hit.node) { this.view.setSelected(null); this.ui.open('node', hit.node); }
    else { this.view.setSelected(null); if (this.ui.panel) this.ui.close(); }
  },
  deselect() { this.view.setSelected(null); },

  // ---- placement
  startPlacing(type) {
    const c = this.view.cellAt(innerWidth / 2, innerHeight * 0.42) || { x: 32, z: 32 };
    const def = B[type];
    let bx = c.x - (def.w >> 1), bz = c.z - (def.d >> 1);
    if (!def.line) { // start on the nearest free spot so the first thing the player sees is a valid site
      search: for (let r = 0; r < 16; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const k = this.sim.canPlace(type, bx + dx, bz + dz, 0, { free: true });
        if (k.ok) { bx += dx; bz += dz; break search; }
      }
    }
    this.placing = { type, x: bx, z: bz, rot: 0, erase: false, chk: null };
    this.view.setSelected(null);
    if (def.line && this.view.overlayMode === 'none' && type === 'pipe') this.view.setOverlay('water');
    this.updateGhost();
  },
  updateGhost() {
    const p = this.placing; if (!p) return;
    p.x = Math.max(1, Math.min(N - 2, p.x)); p.z = Math.max(1, Math.min(N - 2, p.z));
    p.chk = this.sim.canPlace(p.type, p.x, p.z, p.rot);
    if (B[p.type].line && !p.hasPos) this.view.setGhost(p.type, -99, -99, 0, true);
    else this.view.setGhost(p.type, p.x, p.z, p.rot, p.chk.ok);
  },
  cancelPlacing() { if (this.placing && this.placing.type === 'pipe' && this.view.overlayMode === 'water') this.view.setOverlay('none'); this.placing = null; this.view.setGhost(null); },
  rotatePlace() { const p = this.placing; if (!p) return; p.rot = (p.rot + 1) % 4; this.updateGhost(); },
  toggleErase() { if (this.placing) this.placing.erase = !this.placing.erase; },
  confirmPlace() {
    const p = this.placing; if (!p) return;
    const r = this.sim.place(p.type, p.x, p.z, p.rot);
    if (r.ok) { this.ui.toast(`${B[p.type].name} — construction started`, 'good'); this.save(); }
    else this.ui.toast(r.reason, 'warn');
    this.updateGhost();
  },
  paint(cx, cy) {
    const p = this.placing, c = this.view.cellAt(cx, cy); if (!c || !p) return;
    if (c.x === p.lx && c.z === p.lz) return; p.lx = c.x; p.lz = c.z;
    p.x = c.x; p.z = c.z; p.hasPos = true;
    if (p.erase) { this.sim.removeLine(p.type, c.x, c.z); }
    else { const r = this.sim.place(p.type, c.x, c.z, 0); if (!r.ok && r.reason.startsWith('Not enough')) this.ui.toast(r.reason, 'warn'); }
    this.updateGhost();
  },
  moveGhost(cx, cy) {
    const p = this.placing, c = this.view.cellAt(cx, cy); if (!c || !p) return;
    const f = footprint({ type: p.type, x: 0, z: 0, rot: p.rot });
    p.x = c.x - (f.w >> 1); p.z = c.z - (f.d >> 1); this.updateGhost();
  },

  // ---- persistence
  save(manual) {
    try { localStorage.setItem(SAVE_KEY, this.sim.serialize()); this.lastSaved = 'on day ' + (this.sim.day() + 1); if (manual) this.ui.toast('Valley saved', 'good'); return true; }
    catch (e) { if (manual) this.ui.toast('Could not save on this device', 'crit'); return false; }
  },
  load() {
    const s = readSave(); if (!s) { this.ui.toast('No save found', 'warn'); return; }
    this.swap(new Sim(s)); this.ui.toast('Valley loaded', 'good');
  },
  reset() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } this.swap(new Sim()); this.ui.el.modal.classList.remove('open'); this.ui.help(true); this.setSpeed(0); },
  swap(s) {
    this.cancelPlacing(); this.sim = s; this.view.sim = s; this.view.seenVersion = -1; this.view.setSelected(null);
    for (const a of this.view.agents) a.state = 'none';
    this.ui.panel = null; this.setSpeed(1); this.ui.refresh(true);
  },
};

const view = game.view = new View(canvas, sim);
const P = prefs();
if (P.shadows != null) view.setShadows(P.shadows);
view.setClickerModel(new URLSearchParams(location.search).get('clicker') || P.clickerModel || 'new');
view.setBuildingModels(new URLSearchParams(location.search).get('buildings') || P.buildingModels || 'new');
game.setQuality(P.quality || (view.mobile ? 'med' : 'high'));
const ui = game.ui = new UI(game);

const input = bindInput(canvas, view, {
  tap(x, y) {
    const p = game.placing;
    if (p) { if (B[p.type].line) { p.lx = p.lz = null; game.paint(x, y); } else game.moveGhost(x, y); ui.refresh(true); return; }
    ui.el.ovpop.hidden = true;
    game.select(view.pick(x, y));
  },
  dragStart(x, y) {
    const p = game.placing; if (!p) return false;
    if (B[p.type].line) { p.lx = p.lz = null; game.paint(x, y); return true; }
    const c = view.cellAt(x, y); if (!c) return false;
    const f = footprint(p);
    return c.x >= f.x - 1 && c.x <= f.x + f.w && c.z >= f.z - 1 && c.z <= f.z + f.d;
  },
  dragMove(x, y) { const p = game.placing; if (!p) return; if (B[p.type].line) game.paint(x, y); else game.moveGhost(x, y); },
  dragEnd() { ui.refresh(true); },
  key(k, e) {
    if (k === ' ') { e.preventDefault(); game.setSpeed(game.speed ? 0 : game.lastSpeed); }
    else if (k === 'r') game.rotatePlace();
    else if (k === 'escape') { if (game.placing) game.cancelPlacing(); else ui.close(); }
    else if (k === 'enter' && game.placing) game.confirmPlace();
    else if (k === '1' || k === '2' || k === '3') game.setSpeed(k === '3' ? 4 : +k);
    ui.refresh(true);
  },
});

window.addEventListener('resize', () => view.resize());
window.addEventListener('orientationchange', () => setTimeout(() => view.resize(), 250));
document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
window.addEventListener('pagehide', () => game.save());

function handleEvents() {
  const ev = game.sim.events; if (!ev.length) return;
  for (const e of ev) {
    if (e.type === 'log') {
      ui.toast(e.msg, e.kind);
      // critical decisions pause the valley; other warnings drop fast-forward back to normal speed
      if (e.decide && game.speed > 0) { game.setSpeed(0); ui.toast('Paused — this needs your decision', 'warn'); }
      else if ((e.kind === 'warn' || e.kind === 'crit') && game.speed > 1) game.setSpeed(1);
    }
    else if (e.type === 'season') {
      if (e.name === 'Double Noon') ui.banner('Double Noon', 'Both suns stand overhead');
      else if (e.name === 'High Summer') ui.banner('High Summer', 'The heat is rising');
      else if (e.name === 'Ember Fall') ui.banner('Ember Fall', 'The valley endures');
    } else if (e.type === 'over') { game.setSpeed(0); ui.gameOver(); }
    else if (e.type === 'day') game.save();
    else if (e.type === 'removed' && view.selected === e.id) view.setSelected(null);
  }
  ev.length = 0;
}

let last = performance.now(), saveT = 0, fpsAcc = 0, fpsN = 0, slow = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const simH = game.speed > 0 ? dt * game.speed * 24 / DAY_SECONDS : 0;
  if (simH > 0) {
    const h0 = game.sim.hour(); game.sim.advance(simH);
    // the start of each workday returns fast-forward to normal speed, so the morning gets the player's attention
    if (game.speed > 1 && h0 < 6 && game.sim.hour() >= 6) game.setSpeed(1);
  }
  input.update(dt);
  view.update(dt, simH);
  handleEvents();
  ui.tick(dt);
  saveT += dt; if (saveT > 12) { saveT = 0; game.save(); }
  // adaptive quality: step down if the device struggles
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 2) {
    game.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (game.fps < 24 && !document.hidden) { if (++slow >= 2) { slow = 0; if (view.shadows) game.setShadows(false); else if (game.quality !== 'low') game.setQuality(game.quality === 'high' ? 'med' : 'low'); } } else slow = 0;
  }
}
game.setSpeed(sim.S.speed || 1);
if (!P.seenIntro) { setPref('seenIntro', true); game.setSpeed(0); ui.help(true); }
requestAnimationFrame(frame);
requestAnimationFrame(() => document.getElementById('boot').classList.add('hide'));
window.__game = game;
