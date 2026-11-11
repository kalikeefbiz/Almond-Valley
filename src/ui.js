// HUD and panels. Plain DOM, event delegation through data-a="action:arg:arg".
import { B, CATS, BUILD_ORDER, RES_INFO, TECH, TECH_ORDER, HW, CLICKERS, POLICIES, ZONES, EXPEDITIONS, PRICES, RIG_COST, YEAR, NODE_NAMES, NODE_RANGE } from './data.js';
import { footprint } from './sim.js';

const ic = (n, cls = '') => `<svg class="ic ${cls}"><use href="#i-${n}"/></svg>`;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (v) => Math.round(v * 100) + '%';
const sign = (n) => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const RICON = { water: 'water', food: 'food', wood: 'wood', stone: 'stone', metal: 'metal', parts: 'parts', aether: 'aether', scrip: 'scrip', power: 'power' };
const NAV = [['build', 'Build', 'build'], ['people', 'People', 'people'], ['production', 'Production', 'factory'], ['storage', 'Storage', 'box'], ['research', 'Research', 'flask'], ['expedition', 'Expedition', 'map']];
const OVERLAYS = [['none', 'No overlay'], ['water', 'Water network'], ['power', 'Power grid'], ['heat', 'Heat exposure'], ['resource', 'Resources & roads']];

export class UI {
  constructor(game) {
    this.g = game; this.panel = null; this.cache = new Map(); this.timer = 0; this.pressing = false; this.confirm = null;
    const root = this.root = document.getElementById('ui');
    root.innerHTML = `
      <div id="heatfx"></div>
      <div id="top">
        <div class="row1">
          <div class="bar crest"><div class="logo">${ic('water')}</div><div style="min-width:0;flex:1"><div class="t">ALMOND VALLEY</div><div class="s"><span id="lv"></span><span class="lvbar"><i id="lvb"></i></span></div></div></div>
          <div class="bar speed" id="speed"></div>
        </div>
        <div class="bar resrow" id="res"></div>
        <div class="row3"><button class="bar clim" id="clim" data-a="open:log"></button><button class="bar popc" id="popc" data-a="open:people"></button></div>
      </div>
      <div id="left"><div class="bar card" id="objc"></div><div class="bar card" id="alc"></div></div>
      <div id="right">
        <button class="bar rb" id="b-ov" data-a="ovpop">${ic('layers')}</button>
        <button class="bar rb" id="b-cl" data-a="open:clickers">${ic('bot')}</button>
        <button class="bar rb" data-a="open:log">${ic('chart')}</button>
        <button class="bar rb" data-a="rot:-1">${ic('rotl')}</button>
        <button class="bar rb" data-a="rot:1">${ic('rot')}</button>
        <button class="bar rb" data-a="open:menu">${ic('menu')}</button>
        <div class="bar pop" id="ovpop" hidden></div>
      </div>
      <div id="banner"></div>
      <div id="toasts"></div>
      <div class="bar" id="place"></div>
      <div id="sheet"><div class="sh-head"><div class="ti" id="shti"></div><button class="x" data-a="close">${ic('x')}</button></div><div class="tabs" id="shtabs"></div><div class="sh-body" id="shbody"></div></div>
      <div id="nav">${NAV.map(([id, name, icon]) => `<button data-a="nav:${id}" id="nav-${id}">${ic(icon)}<span>${name}</span></button>`).join('')}</div>
      <div id="modal"></div>`;
    this.el = {}; for (const id of ['lv', 'lvb', 'speed', 'res', 'clim', 'popc', 'objc', 'alc', 'ovpop', 'banner', 'toasts', 'place', 'sheet', 'shti', 'shtabs', 'shbody', 'modal', 'heatfx', 'left', 'b-ov']) this.el[id] = document.getElementById(id);
    root.addEventListener('click', (e) => { const t = e.target.closest('[data-a]'); if (t && !t.disabled) { e.preventDefault(); this.act(t.dataset.a.split(':'), t); } });
    root.addEventListener('pointerdown', () => { this.pressing = true; }, true);
    window.addEventListener('pointerup', () => { this.pressing = false; }, true);
    window.addEventListener('pointercancel', () => { this.pressing = false; }, true);
    this.objShut = innerWidth < 760; this.buildTab = 'housing';
    this.refresh(true);
  }
  get sim() { return this.g.sim; }
  set(el, html) { if (this.cache.get(el) !== html) { this.cache.set(el, html); el.innerHTML = html; return true; } return false; }

  // ---------------------------------------------------------------- actions
  act(a, el) {
    const g = this.g, sim = this.sim, [cmd, x, y] = a;
    const num = (v) => parseInt(v, 10);
    if (cmd !== 'demolish' && cmd !== 'newgame') this.confirm = null;
    switch (cmd) {
      case 'nav': if (this.panel && this.panel.id === x) this.close(); else this.open(x); break;
      case 'open': this.open(x, y != null ? num(y) : undefined); break;
      case 'close': this.close(); break;
      case 'speed': g.setSpeed(num(x)); break;
      case 'tab': this.buildTab = x; break;
      case 'place': this.close(true); g.startPlacing(x); break;
      case 'p-ok': g.confirmPlace(); break;
      case 'p-rot': g.rotatePlace(); break;
      case 'p-no': g.cancelPlacing(); this.open('build'); break;
      case 'p-erase': g.toggleErase(); break;
      case 'ovpop': this.el.ovpop.hidden = !this.el.ovpop.hidden; break;
      case 'ov': g.setOverlay(x); this.el.ovpop.hidden = true; break;
      case 'rot': g.view.cam.yaw += num(x) * Math.PI / 4; break;
      case 'objt': this.objShut = !this.objShut; break;
      case 'go': this.goto(x); break;
      case 'slots': sim.setSlots(num(x), sim.byId(num(x)).slots + num(y)); break;
      case 'prio': sim.setPrio(num(x), sim.byId(num(x)).prio ? 0 : 1); break;
      case 'toggle': sim.toggle(num(x)); break;
      case 'patch': if (!sim.patch(num(x))) this.toast('Not enough parts', 'warn'); break;
      case 'hwpatch': if (!sim.patch(null, x)) this.toast('Not enough parts', 'warn'); break;
      case 'upgrade': if (sim.upgrade(num(x))) this.toast('Upgrade started', 'good'); break;
      case 'demolish': if (this.confirm === 'd' + x) { sim.demolish(num(x)); this.confirm = null; this.close(); } else this.confirm = 'd' + x; break;
      case 'hwslots': sim.hwSetSlots(x, sim.S.hw.slots[x] + num(y)); break;
      case 'hwup': sim.hwUpgrade(x); break;
      case 'research': sim.startResearch(x); break;
      case 'policy': if (!sim.setPolicy(x, !sim.S.policies[x])) this.toast('Research Noon Curfew first', 'warn'); break;
      case 'claim': if (sim.claim(x)) this.toast(`Survey party sent to ${ZONES[x].name}`, 'good'); break;
      case 'exped': if (sim.expedition(x)) this.toast(`${EXPEDITIONS[x].name} party has set out`, 'good'); break;
      case 'trade': { const r = sim.trade(x, num(y)); if (!r.ok) this.toast(r.reason, 'warn'); break; }
      case 'queue': if (!sim.queueClicker(num(x), y)) this.toast('Cannot queue that Clicker', 'warn'); break;
      case 'rig': if (sim.craftRig()) this.toast('Hunter Clicker rig fitted', 'good'); break;
      case 'pin': sim.pinClicker(num(x), y === '0' ? null : num(y)); break;
      case 'focusb': g.view.focusBuilding(num(x)); g.select({ building: num(x) }); break;
      case 'focusc': { const c = sim.S.clickers.find(k => k.id === num(x)); if (c) { g.view.focus((c.x - 32) * 2, (c.z - 32) * 2); this.open('clicker', c.id); } break; }
      case 'save': g.save(true); break;
      case 'load': g.load(); break;
      case 'newgame': if (this.confirm === 'new') { this.confirm = null; g.reset(); } else this.confirm = 'new'; break;
      case 'shadows': g.setShadows(!g.view.shadows); break;
      case 'cmodel': g.setClickerModel(x); this.refresh(true); break;
      case 'quality': g.setQuality(x); break;
      case 'help': this.help(); break;
      case 'modal-x': this.el.modal.classList.remove('open'); if (x === 'resume') g.setSpeed(g.lastSpeed || 1); break;
    }
    this.refresh(true);
  }
  goto(where) {
    if (where === 'heartwell') { const b = this.sim.C.hw; this.g.view.focusBuilding(b.id); this.g.select({ building: b.id }); }
    else if (where[0] === 'b') { const id = parseInt(where.slice(1), 10); this.g.view.focusBuilding(id); this.g.select({ building: id }); }
    else this.open(where);
  }
  open(id, arg) { this.panel = { id, arg }; this.confirm = null; this.el.ovpop.hidden = true; this.cache.delete(this.el.shbody); this.refresh(true); this.el.shbody.scrollTop = 0; }
  close(keepSel) { if (!this.panel) return; this.panel = null; if (!keepSel) this.g.deselect(); this.refresh(true); }
  toast(msg, kind = 'info') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
    const box = this.el.toasts; box.prepend(t);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 3600); setTimeout(() => t.remove(), 4100);
  }
  banner(title, sub) { const b = this.el.banner; b.innerHTML = `<b>${title}</b><span>${sub}</span>`; b.classList.add('show'); clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('show'), 4200); }
  modal(html) { this.el.modal.innerHTML = `<div class="dlg">${html}</div>`; this.el.modal.classList.add('open'); }
  help(first) {
    this.modal(`<h2>${first ? 'Welcome to Almond Valley' : 'How to play'}</h2>
      <p>A frontier settlement in a dry canyon under two suns. It already runs itself — your job is to grow it, and to get it through <b>Double Noon</b>, the killing summer that returns every year.</p>
      <ul>
        <li><b>Drag</b> to move, <b>pinch</b> to zoom, <b>twist</b> or use the arrows to rotate.</li>
        <li><b>Tap</b> a building to manage workers, upgrades and repairs.</li>
        <li><b>Build</b> opens construction. Tap a spot, then the green tick.</li>
        <li>The <b>Heartwell</b> at the centre is your only water. Watch its pools.</li>
        <li>Homes protect people from heat. Research <b>Insulated Homes</b> early, add a <b>Medical Post</b>, and keep rations stocked before summer.</li>
        <li>The bar under the temperature shows the year. Red is Double Noon.</li>
      </ul>
      <div class="btns"><button class="btn pri" data-a="modal-x:resume">${first ? 'Begin' : 'Close'}</button></div>`);
  }
  gameOver() {
    const S = this.sim.S;
    this.modal(`<h2>The valley falls silent</h2><p>Almond Valley was abandoned on day ${this.sim.day() + 1}, after ${S.summers} Double Noon${S.summers === 1 ? '' : 's'} and ${S.deaths} deaths.</p><div class="btns"><button class="btn pri" data-a="newgame">Start again</button></div>`);
    this.confirm = 'new';
  }

  // ---------------------------------------------------------------- refresh
  tick(dt) { this.timer -= dt; if (this.timer <= 0) { this.timer = 0.25; this.refresh(false); } }
  refresh(force) {
    // Keep the objectives column clear of the HUD however the top rows wrap (phone landscape wraps to two lines).
    const tb = Math.round(document.getElementById('top').getBoundingClientRect().bottom) + 6; if (tb !== this._tb) { this._tb = tb; this.el.left.style.top = tb + 'px'; }
    const sim = this.sim, S = sim.S, g = this.g, el = this.el;
    // speed
    this.set(el.speed, [[0, 'pause'], [1, 'play'], [2, 'ff'], [4, 'fff']].map(([s, i]) => `<button data-a="speed:${s}" class="${g.speed === s ? 'on' : ''}" aria-label="speed ${s}">${ic(i)}</button>`).join(''));
    el.lv.textContent = 'Settlement Lv. ' + sim.level();
    el.lvb.style.width = ((S.pop % 40) / 40 * 100) + '%';
    // resources
    const chip = (r, val, sub, cls, low) => `<button class="chip ${low ? 'low' : ''}" data-a="open:${r === 'power' ? 'production' : 'storage'}"><span class="c-${r}">${ic(RICON[r])}</span><span><b>${val}</b><small class="${cls}">${sub}</small></span></button>`;
    let h = '';
    for (const r of ['water', 'food', 'wood', 'stone', 'metal', 'parts', 'aether', 'scrip']) {
      const f = S.flow[r] || 0, cap = sim.cap(r);
      const low = r === 'water' ? S.res.water < cap * 0.25 : r === 'food' ? S.res.food < S.pop * 2 : false;
      h += chip(r, fmt(Math.floor(S.res[r])), Math.abs(f) < 0.5 ? '±0/d' : sign(f) + '/d', f > 0.5 ? 'up' : f < -0.5 ? 'dn' : '', low);
    }
    h += chip('power', `${fmt(sim.powerUse)}/${fmt(sim.powerGen)}`, sim.powerRatio < 0.99 || sim.hwPower < 0.99 ? 'shortage' : 'power', sim.powerRatio < 0.99 ? 'dn' : '', sim.powerRatio < 0.99);
    this.set(el.res, h);
    // climate
    const T = sim.T, hr = sim.hour(), doy = sim.doy();
    const hot = sim.h > 0.45;
    el.clim.classList.toggle('hot', hot);
    this.set(el.clim, `<span style="color:${hot ? '#ff8a5a' : '#ffd24a'}">${ic('temp')}</span><span class="tval">${Math.round(T)}°C</span><span style="color:#ffd24a">${ic('sun')}</span><span class="sea">${sim.seasonName()}</span><span class="day">D<span class="dw">ay </span>${sim.day() + 1} · ${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor((hr % 1) * 6) * 10).padStart(2, '0')}</span><i class="yr"></i><i class="yrm" style="left:${(doy / YEAR * 100).toFixed(1)}%"></i>`);
    this.set(el.popc, `<span style="color:var(--gold)">${ic('people')}</span>${S.pop}<small>/ ${S.housingCap}</small>`);
    el.heatfx.style.opacity = Math.max(0, Math.min(0.55, (sim.h - 0.35) * 0.6 * (g.view.env.day || 0)));
    // objectives
    const objs = sim.objectives().filter(o => !S.obj[o.id]).slice(0, 3);
    el.objc.classList.toggle('shut', this.objShut);
    this.set(el.objc, `<h4 data-a="objt">${ic('target')}Valley Objectives${ic('chev')}</h4><div class="body">${objs.map(o => `<div class="obj"><i class="bx"></i><div><b>${o.name}</b><span>${o.desc}${o.max > 1 ? ` (${Math.min(o.cur, o.max)}/${o.max})` : ''}</span></div></div>`).join('') || '<div class="obj"><div><b>All objectives complete</b><span>The valley is yours to shape.</span></div></div>'}</div>`);
    const al = sim.alerts();
    el.alc.style.display = al.length ? '' : 'none';
    this.set(el.alc, al.slice(0, 4).map(a => `<button class="alert ${a.sev}" data-a="go:${a.go}">${ic('warn')}<span>${a.msg}</span></button>`).join(''));
    // right buttons
    el['b-ov'].classList.toggle('on', g.view.overlayMode !== 'none');
    this.set(el.ovpop, OVERLAYS.map(([id, n]) => `<button data-a="ov:${id}" class="${g.view.overlayMode === id ? 'on' : ''}">${n}</button>`).join(''));
    // nav
    for (const [id] of NAV) document.getElementById('nav-' + id).classList.toggle('on', !!this.panel && this.panel.id === id);
    // placement bar
    const P = g.placing;
    el.place.classList.toggle('open', !!P);
    if (P) {
      const def = B[P.type];
      const info = P.chk && !P.chk.ok ? `<div class="why">${P.chk.reason}</div>` : `<div class="okk">${def.line ? (P.erase ? 'Tap or drag to remove' : 'Tap or drag to lay. Two fingers move the view.') : 'Tap the map to position, then confirm'}</div>`;
      this.set(el.place, `<div class="inf"><b>${def.name}</b>${cost(sim, def.cost)}${info}</div>
        ${def.line ? `<button class="pb ${P.erase ? 'on' : ''}" data-a="p-erase" aria-label="erase">${ic('x')}</button>` : `<button class="pb" data-a="p-rot" aria-label="rotate">${ic('rot')}</button>`}
        ${def.line ? `<button class="pb ok" data-a="p-no" aria-label="done">${ic('check')}</button>` : `<button class="pb no" data-a="p-no" aria-label="cancel">${ic('x')}</button><button class="pb ok ${P.chk && P.chk.ok ? '' : 'off'}" data-a="p-ok" aria-label="confirm">${ic('check')}</button>`}`);
    }
    // sheet
    const open = !!this.panel && !P;
    el.sheet.classList.toggle('open', open);
    el.left.style.display = (open || P) && innerWidth < 760 ? 'none' : '';
    if (open && (force || !this.pressing)) {
      const r = this.render(this.panel);
      if (!r) { this.close(); return; }
      this.set(el.shti, r.title);
      el.shtabs.style.display = r.tabs ? '' : 'none';
      if (r.tabs) this.set(el.shtabs, r.tabs);
      const st = el.shbody.scrollTop;
      if (this.set(el.shbody, r.body)) el.shbody.scrollTop = st;
    }
  }

  // ---------------------------------------------------------------- panels
  render(p) {
    const fn = this['p_' + p.id]; return fn ? fn.call(this, p.arg) : null;
  }
  p_build() {
    const sim = this.sim, tab = this.buildTab;
    const tabs = CATS.map(c => `<button data-a="tab:${c.id}" class="${tab === c.id ? 'on' : ''}">${c.name}</button>`).join('');
    const cards = BUILD_ORDER[tab].map(t => {
      const d = B[t]; let lock = '';
      if (!sim.hasTech(d.tech)) lock = `Research ${TECH[d.tech].name}`;
      else if (d.limit && sim.count(t, false) >= d.limit) lock = 'Already built';
      const bits = [];
      if (d.housing) bits.push(`Sleeps ${d.housing.cap}`, `Heat protection ${pct(d.housing.prot)}`);
      if (d.workers) bits.push(`${d.workers} workers`);
      if (d.power) bits.push(`${d.power} power`);
      if (d.gen) bits.push(`+${d.gen} power`);
      return `<button class="bcard ${lock ? 'lock' : ''}" ${lock ? 'disabled' : ''} data-a="place:${t}"><b>${d.name}${d.tier ? ` <small style="color:var(--mute)">Tier ${ROMAN[d.tier]}</small>` : ''}</b>${lock ? `<span class="lk">${lock}</span>` : cost(sim, d.cost)}<p>${bits.length ? bits.join(' · ') + '. ' : ''}${d.desc}</p></button>`;
    }).join('');
    return { title: 'Construction', tabs, body: `<div class="grid">${cards}</div>` };
  }

  p_building(id) {
    const sim = this.sim, S = sim.S, b = sim.byId(id); if (!b) return null;
    if (b.type === 'heartwell') return this.p_heartwell();
    const d = B[b.type], info = sim.C.info[b.id] || {};
    const building = b.progress != null;
    let status = 'Operational', sc = 'good';
    if (building) { status = `Under construction ${pct(b.progress / d.work)}`; sc = 'warn'; }
    else if (b.broken) { status = 'Broken down'; sc = 'bad'; }
    else if (!b.on) { status = 'Paused'; sc = 'warn'; }
    else if (b.upgrade) { status = `Upgrading ${pct(b.upgrade.progress / b.upgrade.work)}`; sc = 'warn'; }
    else if (b.issue && !d.housing && !d.unique) { status = b.issue; sc = b.eff > 0 ? 'warn' : 'bad'; }
    let h = `<p class="desc">${d.desc}</p><div class="stats"><span class="stat ${sc}">● ${status}</span>`;
    if (d.housing && !building) h += `<span class="stat">${ic('people')}Residents ${Math.round(b.res || 0)} / ${d.housing.cap}</span><span class="stat">${ic('temp')}Heat protection ${pct(b.prot || 0)}</span>${d.housing.morale ? `<span class="stat good">${ic('smile')}Morale +${d.housing.morale}</span>` : ''}`;
    if (d.workers && !building) h += `<span class="stat">${ic('people')}${b.staff} / ${d.workers} workers</span>`;
    if (d.skilled && !building) h += `<span class="stat ${b.sk < d.skilled ? 'warn' : ''}">Skilled ${b.sk} / ${d.skilled}</span>`;
    h += '</div>';
    if (building) h += meter('Construction', b.progress / d.work, pct(b.progress / d.work)) + `<p class="desc">${b.crew ? b.crew + ' labourers on site.' : 'Waiting for free labourers or a Clicker.'} Unassigned workers build; Clickers build much faster.</p>`;
    else {
      if (d.wear) h += meter('Condition', b.cond / 100, pct(b.cond / 100), b.cond < 35 ? 'r' : '');
      if (d.workers) h += meter('Efficiency', Math.min(1, b.eff), pct(b.eff), b.eff < 0.4 ? 'r' : 'g');
      if (b.upgrade) h += meter('Upgrade', b.upgrade.progress / b.upgrade.work, pct(b.upgrade.progress / b.upgrade.work));
      // networks
      const nets = [];
      if (d.wantsWater) nets.push(`<span class="stat ${info.watered ? 'good' : 'bad'}">${ic('water')}${info.watered ? 'On water network' : 'No water service'}</span>`);
      if (d.power) nets.push(`<span class="stat ${info.powered ? 'good' : 'bad'}">${ic('power')}${info.powered ? `Powered (${d.power})` : 'No power connection'}</span>`);
      if (d.out && !d.dropPoint) nets.push(`<span class="stat ${info.linked ? 'good' : 'warn'}">${info.linked ? 'Road-linked to storage' : 'No road to storage — slow hauling'}</span>`);
      if (d.housing && info.shaded) nets.push(`<span class="stat good">Cooling pavilion nearby</span>`);
      if (d.waterRadius) nets.push(`<span class="stat ${sim.C.onNet[b.id] ? 'good' : 'bad'}">${ic('water')}${sim.C.onNet[b.id] ? 'Connected to main' : 'Not touching a connected main'}</span>`);
      if (b.type === 'pylon') nets.push(`<span class="stat ${sim.C.pylonOn[b.id] ? 'good' : 'bad'}">${ic('power')}${sim.C.pylonOn[b.id] ? 'Energised' : 'Out of range of a powered source'}</span>`);
      if (d.node) nets.push(`<span class="stat">Deposit richness ×${(info.rich || 0).toFixed(1)}</span>`);
      if (nets.length) h += `<div class="stats">${nets.join('')}</div>`;
      // production
      if (d.out || d.in || d.gen) {
        h += '<div class="sec">Operations (per day)</div><div class="io">';
        const m = d.out ? sim.outMult(b) : 1;
        for (const r in d.out || {}) h += `<span class="c-${r}">${ic(RICON[r])}+${fmt(d.out[r] * m * b.eff)}</span>`;
        if (d.gen) h += `<span class="c-power">${ic('power')}+${fmt(d.gen * b.eff)}</span>`;
        for (const r in d.in || {}) h += `<span class="c-${r}">${ic(RICON[r])}−${(sim.inRate(b, r) * (d.housing || b.type === 'shade' ? 1 : b.eff)).toFixed(1).replace('.0', '')}</span>`;
        h += '</div>';
        const wait = Object.entries(b.out || {}).filter(([, v]) => v >= 1);
        if (wait.length) h += `<p class="desc" style="margin-top:6px">Waiting for carriers: ${wait.map(([r, v]) => `${fmt(v)} ${RES_INFO[r].name.toLowerCase()}`).join(', ')}</p>`;
      }
      if (b.type === 'smokehouse') h += `<p class="desc">Preserving up to ${fmt(700 * b.eff)} rations. Spoilage now ${fmt(sim.spoil || 0)}/day.</p>`;
      if (b.type === 'medical') h += `<p class="desc">${S.sick} sick. Medics cover ${pct(sim.medCover || 0)} of residents.</p>`;
      if (b.type === 'school') h += `<p class="desc">${S.skilled} skilled workers of ${S.pop}. Research ${sim.researchRate().toFixed(1)} pts/day.</p>`;
      if (b.type === 'utility') h += `<p class="desc">Repair capacity ${fmt(sim.repairPool || 0)} condition/day (1 part per 12).</p>`;
      if (b.type === 'station') { const t = sim.tradeInfo(); h += `<div class="stats"><span class="stat">${ic('train')}${t.here ? 'Train at the platform' : `Next train in ${fmtH(t.next)}`}</span><span class="stat">Cargo space ${t.cargo}</span></div><div class="btns"><button class="btn" data-a="open:storage">Open trade</button></div>`; }
      if (b.type === 'depot') h += `<div class="btns"><button class="btn" data-a="open:storage">Open trade</button></div>`;
      // workforce
      if (d.workers) {
        const eq = sim.C.equiv[b.id];
        h += `<div class="sec">Workforce</div><div class="rowl"><div class="nm"><b>Worker slots</b><small>${b.staff} at work${eq ? ` · Clickers +${eq.toFixed(1)}` : ''}${S.idle ? ` · ${S.idle} unassigned in the valley` : ''}</small></div>${stepper('slots:' + b.id, b.slots, d.workers)}</div>
          <div class="rowl"><div class="nm"><b>Staff first</b><small>Fill this building before others when workers are short</small></div><button class="tog ${b.prio ? 'on' : ''}" data-a="prio:${b.id}" aria-label="priority"></button></div>`;
        if (d.auto) {
          const mine = S.clickers.filter(c => c.role === d.auto);
          if (mine.length) h += mine.map(c => `<div class="rowl"><div class="nm"><b>${CLICKERS[c.role].name} #${c.id}</b><small>${c.pin === b.id ? 'Assigned here' : c.task && c.task.bid === b.id ? 'Working here (auto)' : 'Elsewhere'}</small></div><button class="btn sm" data-a="pin:${c.id}:${c.pin === b.id ? 0 : b.id}">${c.pin === b.id ? 'Release' : 'Assign here'}</button></div>`).join('');
          else h += `<p class="desc">A ${CLICKERS[d.auto].name} can work here in place of labourers.</p>`;
        }
      }
      if (b.type === 'workshop') { const c = sim.canCraftRig(); h += `<div class="sec">Hunter Clicker rigs</div><p class="desc">Wearable exosuits for outdoor crews: +25% output and half the heat exposure per fitted worker. ${S.rigs} rigs for ${S.outdoor} outdoor workers.</p><div class="rowl"><div class="nm">${cost(sim, RIG_COST)}</div><button class="btn sm ${c.ok ? '' : 'off'}" data-a="rig">Fit a rig</button></div>`; }
      if (b.type === 'fabrication') {
        h += `<div class="sec">Assembly line</div>`;
        h += b.queue.length ? b.queue.map((q, i) => i === 0 ? meter(CLICKERS[q.role].name.replace(' Clicker', ''), q.progress / CLICKERS[q.role].work, pct(q.progress / CLICKERS[q.role].work)) : `<div class="rowl"><div class="nm"><small>Queued: ${CLICKERS[q.role].name}</small></div></div>`).join('') : '<p class="desc">Line idle. Queue a Clicker below.</p>';
        for (const role in CLICKERS) {
          const c = CLICKERS[role], chk = sim.canQueueClicker(b.id, role);
          h += `<div class="rowl"><div class="nm"><b>${c.name}</b><small>${c.desc}</small>${sim.hasTech(c.tech) ? cost(sim, c.cost) : `<small class="bad">${chk.reason}</small>`}</div><button class="btn sm ${chk.ok ? '' : 'off'}" data-a="queue:${b.id}:${role}">Build</button></div>`;
        }
      }
      // upgrade
      if (d.upgradeTo && !b.upgrade) {
        const to = B[d.upgradeTo], chk = sim.canUpgrade(b);
        h += `<div class="sec">Upgrade</div><div class="rowl"><div class="nm"><b>${to.name} <small style="display:inline">Tier ${ROMAN[to.tier]}</small></b><small>Sleeps ${to.housing.cap} · heat protection ${pct(to.housing.prot)} · morale +${to.housing.morale}</small>${cost(sim, to.upCost)}${chk.ok ? '' : `<small class="bad">${chk.reason}</small>`}</div><button class="btn sm pri ${chk.ok ? '' : 'off'}" data-a="upgrade:${b.id}">Upgrade</button></div>`;
      }
    }
    // actions
    if (!d.unique) {
      h += '<div class="btns">';
      if (!building && d.wear && b.cond < 90) { const pc = sim.patchCost(b); h += `<button class="btn sm ${sim.canAfford(pc) ? '' : 'off'}" data-a="patch:${b.id}">Repair +30% (${pc.parts} parts)</button>`; }
      if (!building && (d.workers || d.in) && !d.housing) h += `<button class="btn sm" data-a="toggle:${b.id}">${b.on ? 'Pause' : 'Resume'}</button>`;
      h += `<button class="btn sm red" data-a="demolish:${b.id}">${this.confirm === 'd' + b.id ? 'Tap again to confirm' : building ? 'Cancel (full refund)' : 'Demolish (50% back)'}</button></div>`;
    }
    return { title: `${d.name}${d.tier ? `<small>Tier ${ROMAN[d.tier]}</small>` : ''}`, body: h };
  }

  p_heartwell() {
    const sim = this.sim, S = sim.S, hw = S.hw, R = sim.hwRates, cap = sim.C.waterCap;
    const wp = S.res.water / cap;
    let h = `<div class="stats"><span class="stat ${Object.keys(hw.broken).length ? 'bad' : 'good'}">● ${Object.keys(hw.broken).length ? 'Component failure' : 'Operational'}</span><span class="stat c-water">${ic('water')}${sign(S.flow.water)}/day</span><span class="stat">${ic('people')}Demand ${fmt(R.demand || 0)}/day</span><span class="stat c-power">${ic('power')}${fmt(sim.powerGen)} made · ${fmt(sim.powerUse)} used</span></div>`;
    h += meter('Reserve pools', wp, `${fmt(S.res.water)} / ${fmt(cap)}`, wp < 0.25 ? 'r' : 'w');
    const row = (k, label, val, max, unit) => {
      const lv = hw.lv[k], mx = HW[k].workers[lv - 1], up = sim.hwCanUpgrade(k);
      return `<div class="sec">${label} · Lv ${lv}</div>${meter(unit, max > 0 ? Math.min(1, val / max) : 0, fmt(val) + (k === 'tur' ? '' : '/d'), k === 'tur' ? '' : 'w')}
        <div class="rowl"><div class="nm"><b>Crew</b><small>${hw.staff[k]} at work of ${mx}</small></div>${stepper('hwslots:' + k, hw.slots[k], mx)}</div>${upRow(sim, k, up)}`;
    };
    h += row('ext', 'Extraction', R.ext, HW.ext.base * HW.mult[hw.lv.ext - 1], 'Aquifer draw');
    h += row('pur', 'Purification', R.pur, HW.pur.base * HW.mult[hw.lv.pur - 1], 'Treatment');
    h += row('tur', 'Power turbines', (sim.turOut ? sim.turOut.turA + sim.turOut.turB : 0), 2 * HW.tur.base * HW.turMult[hw.lv.tur - 1] * 1.15, 'Output');
    h += `<p class="desc">Turbines burn ${HW.tur.wood[hw.lv.tur - 1]} timber a day and need cooling water. Cooling basins ${pct(hw.coolant / 120)}. Raw water buffer ${fmt(hw.raw)}.</p>`;
    h += `<div class="sec">Reserve pools · Lv ${hw.lv.pool}</div>${upRow(sim, 'pool', sim.hwCanUpgrade('pool'), `Capacity ${fmt(HW.pool.cap[hw.lv.pool - 1])}${hw.lv.pool < 3 ? ' → ' + fmt(HW.pool.cap[hw.lv.pool]) : ''}`)}`;
    h += '<div class="sec">Maintenance</div>';
    for (const c in HW.comps) h += `<div class="rowl"><div class="nm"><b>${HW.comps[c]}${hw.broken[c] ? ' — DOWN' : ''}</b>${meter('', hw.cond[c] / 100, pct(hw.cond[c] / 100), hw.cond[c] < 35 ? 'r' : '')}</div><button class="btn sm ${S.res.parts >= 8 && hw.cond[c] < 90 ? '' : 'off'}" data-a="hwpatch:${c}">+30% (8 parts)</button></div>`;
    h += `<p class="desc">Heat wears the machinery faster. Below 30% a component can fail outright. A Utility Depot, the Master Clicker or Maintenance Clickers keep it serviced.</p>`;
    return { title: 'Heartwell <small>Water extraction complex</small>', body: h };
  }

  p_people() {
    const sim = this.sim, S = sim.S, P = S.policies;
    let h = `<div class="stats"><span class="stat">${ic('people')}${S.pop} residents</span><span class="stat">${ic('home')}Housing ${S.housingCap}</span><span class="stat ${S.homeless ? 'bad' : ''}">Homeless ${S.homeless}</span><span class="stat ${S.sick > S.pop * 0.12 ? 'bad' : ''}">${ic('heart')}Sick ${S.sick}</span><span class="stat">Skilled ${S.skilled}</span><span class="stat ${S.deaths ? 'bad' : ''}">Lost ${S.deaths}</span></div>`;
    h += meter('Morale', S.morale / 100, fmt(S.morale), S.morale < 35 ? 'r' : 'g') + meter('Heat exposure', Math.min(1, (sim.expo || 0)), pct(Math.min(1, sim.expo || 0)), 'r');
    h += `<div class="stats"><span class="stat">Workforce ${S.able}</span><span class="stat ${S.idle > 4 ? 'warn' : ''}">Unassigned ${S.idle}</span><span class="stat">Outdoor ${S.outdoor}</span>${S.away ? `<span class="stat">On expedition ${S.away}</span>` : ''}<span class="stat">Work efficiency ${pct(sim.workMult)}</span></div>`;
    h += '<div class="sec">Morale factors</div><div class="io">' + Object.entries(sim.moraleParts || {}).filter(([, v]) => Math.abs(v) >= 0.5).map(([k, v]) => `<span style="color:${k === 'Base' ? 'var(--mute)' : v > 0 ? 'var(--good)' : 'var(--crit)'}">${k} ${k === 'Base' ? fmt(v) : sign(v)}</span>`).join('') + '</div>';
    h += '<div class="sec">Policies</div>';
    for (const k in POLICIES) { const p = POLICIES[k], locked = p.tech && !sim.hasTech(p.tech); h += `<div class="rowl"><div class="nm"><b>${p.name}</b><small>${locked ? 'Requires research: ' + TECH[p.tech].name : p.desc}</small></div><button class="tog ${P[k] ? 'on' : ''} ${locked ? 'off2' : ''}" data-a="policy:${k}" aria-label="${p.name}"></button></div>`; }
    h += '<div class="sec">Workforce assignment</div>';
    h += `<div class="rowl" data-a="go:heartwell"><div class="nm"><b>Heartwell</b><small>${S.hw.staff.ext + S.hw.staff.pur + S.hw.staff.tur} crew · tap to manage</small></div></div>`;
    for (const b of sim.C.staffList) {
      if (b.progress != null) continue; const d = B[b.type];
      h += `<div class="rowl"><div class="nm" data-a="focusb:${b.id}"><b>${d.name}</b><small class="${b.eff <= 0 ? 'bad' : ''}">${b.staff}/${d.workers} · ${b.eff > 0 ? pct(b.eff) : b.issue}</small></div>${stepper('slots:' + b.id, b.slots, d.workers)}</div>`;
    }
    h += '<div class="sec">Record</div>' + spark(S.hist, 'p', '#f3e7d0', 'Population') + spark(S.hist, 'm', '#84dd6c', 'Morale');
    return { title: 'People', body: h };
  }

  p_production() {
    const sim = this.sim, S = sim.S;
    let h = `<div class="stats"><span class="stat c-power">${ic('power')}Power ${fmt(sim.powerUse)} / ${fmt(sim.powerGen)}</span><span class="stat ${sim.powerRatio < 1 ? 'bad' : 'good'}">Grid ${pct(sim.powerRatio)}</span><span class="stat">${ic('bot')}${S.clickers.length} Clicker${S.clickers.length === 1 ? '' : 's'}</span><span class="stat">Rigs ${S.rigs}</span></div>`;
    h += '<div class="sec">Daily flow</div><div class="io">' + ['water', 'food', 'wood', 'stone', 'metal', 'parts', 'aether', 'scrip'].map(r => `<span class="c-${r}">${ic(RICON[r])}${sign(S.flow[r])}</span>`).join('') + '</div>';
    h += '<div class="sec">Worksites</div>';
    const list = S.buildings.filter(b => { const d = B[b.type]; return (d.out || d.gen || b.type === 'fabrication' || b.type === 'smokehouse') && !d.unique; });
    for (const b of list) {
      const d = B[b.type]; const m = d.out ? sim.outMult(b) : 1;
      const outs = Object.keys(d.out || {}).map(r => `<span class="c-${r}">${ic(RICON[r])}${fmt(d.out[r] * m * b.eff)}</span>`).join(' ') + (d.gen ? `<span class="c-power">${ic('power')}${fmt(d.gen * b.eff)}</span>` : '');
      h += `<div class="rowl" data-a="focusb:${b.id}"><div class="nm"><b>${d.name}</b><small class="${b.eff <= 0 ? 'bad' : b.issue ? '' : 'good'}">${b.progress != null ? 'Under construction' : b.issue || 'Running well'}</small></div><div class="io">${outs}</div><b style="min-width:42px;text-align:right">${b.progress != null ? '—' : pct(b.eff)}</b></div>`;
    }
    h += `<div class="btns"><button class="btn" data-a="open:clickers">${ic('bot')}Clicker fleet</button></div>`;
    return { title: 'Production', body: h };
  }

  p_storage() {
    const sim = this.sim, S = sim.S, t = sim.tradeInfo();
    let h = '';
    for (const r of ['water', 'food', 'wood', 'stone', 'metal', 'parts', 'aether']) {
      const cap = sim.cap(r); h += meter(`<span class="c-${r}">${ic(RICON[r])}</span> ${RES_INFO[r].name}`, S.res[r] / cap, `${fmt(Math.floor(S.res[r]))}/${fmt(cap)}`, r === 'water' ? 'w' : '', 'wide');
    }
    h += `<p class="desc">Rations last ${(S.res.food / Math.max(1, S.pop)).toFixed(1)} days. Spoilage ${fmt(sim.spoil || 0)}/day. Warehouses add storage; water towers add reserve.</p>`;
    h += `<div class="sec">Rail trade</div><div class="stats"><span class="stat">${ic('train')}${t.here ? 'Train at the platform' : 'Next train in ' + fmtH(t.next)}</span><span class="stat">Cargo space ${t.cargo}</span><span class="stat c-scrip">${ic('scrip')}${fmt(S.res.scrip)} scrip</span></div>`;
    if (!sim.count('depot')) h += `<p class="desc">The station handles 40 units a train. Build a Trade Depot (research Rail Contracts) for bulk freight.</p>`;
    for (const r of ['food', 'wood', 'stone', 'metal', 'parts', 'aether']) {
      const p = PRICES[r];
      h += `<div class="rowl"><div class="nm"><b><span class="c-${r}">${ic(RICON[r])}</span> ${RES_INFO[r].name}</b><small>Buy ${p} · sell ${p / 2} scrip each</small></div><button class="btn sm" data-a="trade:${r}:-20">Sell 20</button><button class="btn sm pri" data-a="trade:${r}:20">Buy 20</button></div>`;
    }
    return { title: 'Storage & Trade', body: h };
  }

  p_research() {
    const sim = this.sim, T = sim.S.tech, rate = sim.researchRate();
    let h = `<div class="stats"><span class="stat">${ic('flask')}${rate.toFixed(1)} points/day</span><span class="stat">${Object.keys(T.done).length} / ${TECH_ORDER.length} complete</span></div>`;
    if (!sim.count('school')) h += `<p class="desc">Research is slow without a School. Teachers add 3 points a day each.</p>`;
    for (const id of TECH_ORDER) {
      const t = TECH[id], done = T.done[id], cur = T.cur === id, chk = sim.canResearch(id);
      h += `<div class="tech ${done ? 'done' : cur ? 'cur' : ''}"><div class="hd"><b>${t.name}</b>${done ? `<span style="color:var(--good)">${ic('check')}</span>` : cur ? `<span>${fmtH((t.rp - T.rp) / rate * 24)}</span>` : `<button class="btn sm ${chk.ok ? 'pri' : 'off'}" data-a="research:${id}">Research</button>`}</div><p>${t.desc}</p>${cur ? meter('', T.rp / t.rp, pct(T.rp / t.rp)) : done ? '' : `<div class="cost"><span>${ic('flask')}${t.rp} pts</span>${costInner(sim, t.cost)}</div>${chk.ok || chk.reason === 'Lab busy' ? '' : `<div class="why">${chk.reason}</div>`}`}</div>`;
    }
    return { title: 'Research', body: h };
  }

  p_expedition() {
    const sim = this.sim, S = sim.S;
    let h = `<p class="desc">Survey parties claim new districts. Hunting and salvage parties bring back supplies. Each needs unassigned workers (${S.idle} free) — lower worker slots somewhere to free hands.</p>`;
    if (S.expeditions.length) { h += '<div class="sec">In the field</div>'; for (const e of S.expeditions) h += meter(e.kind === 'claim' ? ZONES[e.zone].name : EXPEDITIONS[e.kind].name, 1 - e.left / e.total, fmtH(e.left)); }
    h += '<div class="sec">Districts</div>';
    for (const k in ZONES) {
      if (k === 'core') continue; const q = ZONES[k], chk = sim.canClaim(k);
      h += `<div class="tech ${S.zones[k] ? 'done' : ''}"><div class="hd"><b>${q.name}</b>${S.zones[k] ? `<span style="color:var(--good)">${ic('check')}</span>` : `<button class="btn sm ${chk.ok ? 'pri' : 'off'}" data-a="claim:${k}">Survey</button>`}</div><p>${q.desc}</p>${S.zones[k] ? '' : `<div class="cost"><span>${ic('people')}${q.crew} crew · ${q.days} days</span>${costInner(sim, q.cost)}</div>${chk.ok ? '' : `<div class="why">${chk.reason}</div>`}`}</div>`;
    }
    h += '<div class="sec">Parties</div>';
    for (const k in EXPEDITIONS) {
      const e = EXPEDITIONS[k], chk = sim.canExpedition(k);
      h += `<div class="tech"><div class="hd"><b>${e.name}</b><button class="btn sm ${chk.ok ? 'pri' : 'off'}" data-a="exped:${k}">Send</button></div><p>${e.desc} Returns ${Object.entries(e.gain).map(([r, [a, b]]) => `${a}–${b} ${RES_INFO[r].name.toLowerCase()}`).join(', ')}.</p><div class="cost"><span>${ic('people')}${e.crew} crew · ${e.days} days</span>${costInner(sim, e.cost)}</div>${chk.ok ? '' : `<div class="why">${chk.reason}</div>`}</div>`;
    }
    return { title: 'Expeditions', body: h };
  }

  clickerTask(c) {
    const sim = this.sim;
    if (c.broken) return 'Broken down — awaiting repair';
    if (c.dormant) return 'Dormant — no aether cells';
    const t = c.task; if (!t) return 'Looking for work';
    const b = sim.byId(t.bid), nm = b ? B[b.type].name : 'site';
    const moving = c.state === 'move';
    return { build: (moving ? 'Heading to build ' : 'Building ') + nm, repair: (moving ? 'Heading to repair ' : t.stalled ? 'Waiting for parts at ' : 'Repairing ') + (t.comp ? HW.comps[t.comp] : nm), haul: 'Collecting goods from ' + nm, drop: 'Hauling goods to ' + nm, work: (moving ? 'Walking to ' : 'Working at ') + nm, service: 'In for servicing at ' + nm, idle: 'Standing by at the Heartwell' }[t.kind] || '';
  }
  p_clickers() {
    const sim = this.sim, S = sim.S;
    let use = 0; for (const c of S.clickers) use += CLICKERS[c.role].aether;
    let h = `<div class="stats"><span class="stat">${ic('bot')}${S.clickers.length} in the fleet</span><span class="stat c-aether">${ic('aether')}${fmt(S.res.aether)} cells · up to −${use.toFixed(1)}/day</span></div>`;
    for (const c of S.clickers) h += `<div class="rowl" data-a="focusc:${c.id}"><div class="nm"><b>${CLICKERS[c.role].name} #${c.id}</b><small class="${c.broken || c.dormant ? 'bad' : ''}">${this.clickerTask(c)}</small>${meter('', c.cond / 100, pct(c.cond / 100), c.cond < 35 ? 'r' : '')}</div></div>`;
    h += `<p class="desc">${sim.count('fabrication') ? 'Queue new Clickers at the Fabrication Plant.' : 'Research Clicker Fabrication and build a Fabrication Plant to manufacture more. It needs skilled workers and power.'} Clickers burn aether cells and wear down; a Utility Depot or Workshop services them.</p>`;
    return { title: 'Clicker fleet', body: h };
  }
  p_clicker(id) {
    const sim = this.sim, c = sim.S.clickers.find(k => k.id === id); if (!c) return null;
    const d = CLICKERS[c.role];
    let h = `<p class="desc">${d.desc}</p><div class="stats"><span class="stat ${c.broken || c.dormant ? 'bad' : 'good'}">● ${this.clickerTask(c)}</span><span class="stat c-aether">${ic('aether')}${d.aether}/day working</span></div>` + meter('Condition', c.cond / 100, pct(c.cond / 100), c.cond < 35 ? 'r' : '');
    if (c.carry) h += `<p class="desc">Carrying ${Object.entries(c.carry).map(([r, v]) => `${fmt(v)} ${RES_INFO[r].name.toLowerCase()}`).join(', ')}.</p>`;
    if (d.equiv) {
      h += '<div class="sec">Assignment</div>';
      const sites = sim.S.buildings.filter(b => B[b.type].auto === c.role && b.progress == null);
      h += `<div class="rowl"><div class="nm"><b>Automatic</b><small>Goes where it is needed most</small></div><button class="tog ${c.pin ? '' : 'on'}" data-a="pin:${c.id}:0"></button></div>`;
      for (const b of sites) h += `<div class="rowl"><div class="nm"><b>${B[b.type].name}</b><small>${b.staff} workers there</small></div><button class="tog ${c.pin === b.id ? 'on' : ''}" data-a="pin:${c.id}:${b.id}"></button></div>`;
      if (!sites.length) h += '<p class="desc">No matching worksite yet.</p>';
    } else h += `<p class="desc">Works on its own: ${c.role === 'master' ? 'construction first, then urgent repairs, then hauling.' : c.role === 'hauler' ? 'empties the fullest worksite into the nearest warehouse or market.' : c.role === 'construction' ? 'builds the oldest site first. Mark a site "Staff first" to jump the queue.' : 'repairs whatever is in the worst condition.'}</p>`;
    return { title: `${d.name} <small>#${c.id}</small>`, body: h };
  }
  p_node(nd) {
    if (!nd) return null;
    const need = { forest: 'Lumber Camp', rock: 'Quarry', ore: 'Iron Mine', vent: 'Aether Plant' }[nd.type];
    return { title: NODE_NAMES[nd.type], body: `<div class="stats"><span class="stat">Richness ×${nd.rich.toFixed(1)}</span><span class="stat">${ZONES[nd.zone].name}</span><span class="stat ${this.sim.S.zones[nd.zone] ? 'good' : 'warn'}">${this.sim.S.zones[nd.zone] ? 'In your territory' : 'Unclaimed — survey this district'}</span></div><p class="desc">Build a ${need} within ${NODE_RANGE} tiles to work this deposit. Richer deposits multiply output.</p><div class="btns"><button class="btn" data-a="open:${this.sim.S.zones[nd.zone] ? 'build' : 'expedition'}">${this.sim.S.zones[nd.zone] ? 'Open construction' : 'Open expeditions'}</button></div>` };
  }
  p_log() {
    const sim = this.sim, S = sim.S;
    const dn = sim.daysToDoubleNoon();
    let h = `<div class="stats"><span class="stat">${ic('sun')}${dn > 0 ? `Double Noon in ${Math.ceil(dn)} days` : 'Double Noon is here'}</span><span class="stat">Year ${sim.year() + 1}</span><span class="stat">Summers survived ${S.summers}</span></div>`;
    h += spark(S.hist, 't', '#ff8a5a', 'Temperature °C') + spark(S.hist, 'w', '#55c8f5', 'Water reserve') + spark(S.hist, 'f', '#f2c14e', 'Rations') + spark(S.hist, 'p', '#f3e7d0', 'Population');
    h += '<div class="sec">Valley log</div>' + (S.log.map(l => `<div class="lg ${l.kind}"><i>Day ${l.d}</i><span>${l.msg}</span></div>`).join('') || '<p class="desc">Nothing yet.</p>');
    return { title: 'Valley record', body: h };
  }
  p_menu() {
    const g = this.g;
    return { title: 'Menu', body: `<div class="btns"><button class="btn pri" data-a="save">Save now</button><button class="btn" data-a="load">Load last save</button></div>
      <p class="desc" style="margin-top:8px">The valley saves itself to this device every few seconds and whenever you leave the page.${g.lastSaved ? ' Last saved ' + g.lastSaved + '.' : ''}</p>
      <div class="sec">Graphics</div>
      <div class="rowl"><div class="nm"><b>Shadows</b><small>Turn off if the game runs slowly</small></div><button class="tog ${g.view.shadows ? 'on' : ''}" data-a="shadows"></button></div>
      <div class="rowl"><div class="nm"><b>Resolution</b><small>${g.fps ? Math.round(g.fps) + ' frames per second' : ''}</small></div><button class="btn sm ${g.quality === 'low' ? 'pri' : ''}" data-a="quality:low">Low</button><button class="btn sm ${g.quality === 'med' ? 'pri' : ''}" data-a="quality:med">Medium</button><button class="btn sm ${g.quality === 'high' ? 'pri' : ''}" data-a="quality:high">High</button></div>
      <div class="sec">Model test</div>
      <div class="rowl"><div class="nm"><b>Master Clicker</b><small>Compare the Meshy model with the built-in shapes</small></div>${[['new', 'New'], ['pbr', 'Metal'], ['classic', 'Old']].map(([k, n]) => `<button class="btn sm ${g.view.clickerModel === k ? 'pri' : ''}" data-a="cmodel:${k}">${n}</button>`).join('')}</div>
      <div class="sec">Game</div>
      <div class="btns"><button class="btn" data-a="help">How to play</button><button class="btn red" data-a="newgame">${this.confirm === 'new' ? 'Tap again — this erases your valley' : 'New game'}</button></div>
      <p class="desc" style="margin-top:10px">Almond Valley · an Ashes × Aether settlement builder by BlackHouse.</p>` };
  }
}

// ------------------------------------------------------------------ small html helpers
function costInner(sim, c) { return Object.entries(c || {}).map(([r, v]) => `<span class="c-${r} ${sim.S.res[r] < v ? 'no' : ''}">${ic(RICON[r])}${v}</span>`).join(''); }
function cost(sim, c) { return `<div class="cost">${costInner(sim, c)}</div>`; }
function meter(label, frac, val, cls = '', variant = '') { return `<div class="meter ${label === '' ? 'nl' : ''} ${variant}">${label === '' ? '' : `<span>${label}</span>`}<div class="tr"><i class="${cls}" style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(0)}%"></i></div><span class="v">${val}</span></div>`; }
function stepper(act, val, max) { return `<div class="step"><button data-a="${act}:-1" aria-label="fewer">−</button><span>${val} / ${max}</span><button data-a="${act}:1" aria-label="more">+</button></div>`; }
function upRow(sim, k, up, note = '') {
  const lv = sim.S.hw.lv[k];
  if (lv >= 3) return `<div class="rowl"><div class="nm"><small>${note ? note + ' · ' : ''}Maximum level</small></div></div>`;
  return `<div class="rowl"><div class="nm"><b>Upgrade to Lv ${lv + 1}</b>${note ? `<small>${note}</small>` : ''}${cost(sim, HW.upCost[lv])}${up.ok ? '' : `<small class="bad">${up.reason}</small>`}</div><button class="btn sm pri ${up.ok ? '' : 'off'}" data-a="hwup:${k}">Upgrade</button></div>`;
}
function fmtH(h) { return h >= 24 ? `${(h / 24).toFixed(1)} days` : `${Math.max(0, Math.ceil(h))} h`; }
function spark(hist, key, color, label) {
  if (!hist || hist.length < 2) return `<div class="meter" style="grid-template-columns:1fr"><span style="color:var(--mute)">${label}: chart appears after two days</span></div>`;
  const v = hist.map(h => h[key]), mn = Math.min(...v), mx = Math.max(...v), span = mx - mn || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * 300).toFixed(1)},${(46 - (y - mn) / span * 38).toFixed(1)}`).join(' ');
  return `<div style="font-size:11.5px;color:var(--mute);display:flex;justify-content:space-between"><span>${label}</span><span>${fmt(mn)} – ${fmt(mx)} · now <b style="color:${color}">${fmt(v[v.length - 1])}</b></span></div><svg class="spark" viewBox="0 0 300 54" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
