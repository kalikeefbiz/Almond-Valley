// Scripted "players" for balance testing. Each strategy is called once per game day and acts through the same
// public actions the UI uses (place, upgrade, research, policies, claims, trade), paying real costs.
import { Sim, footprint } from '../src/sim.js';
import { B, N, NODES, NODE_RANGE, TECH, HW } from '../src/data.js';

export function spot(s, type, near) {
  const def = B[type], S = s.S, C = s.C; let best = null, bs = 1e9;
  const cx = near ? near[0] : 31, cz = near ? near[1] : 32;
  for (let z = 3; z < N - 4; z++) for (let x = 3; x < N - 4; x++) for (const rot of [0, 1]) {
    if (!s.canPlace(type, x, z, rot, { free: true }).ok) continue;
    const f = footprint({ type, x, z, rot });
    let road = 0, onRoad = 0, water = 0, power = 0;
    for (let a = f.z - 1; a <= f.z + f.d; a++) for (let b = f.x - 1; b <= f.x + f.w; b++) {
      const i = a * N + b, inside = a >= f.z && a < f.z + f.d && b >= f.x && b < f.x + f.w;
      if (inside) { if (S.roads[i]) onRoad++; if (C.waterCov[i]) water++; if (C.powerCov[i]) power++; } else if (C.linkNet[i]) road++;
    }
    if (onRoad) continue;
    let score = Math.hypot(x + f.w / 2 - cx, z + f.d / 2 - cz) - (road ? 4 : 0);
    if (def.wantsWater || (def.in && def.in.water)) score += water ? -6 : 14;
    if (def.power) score += power ? -6 : 30;
    if (score < bs) { bs = score; best = [x, z, rot]; }
  }
  return best;
}
// Routine spending leaves a working reserve (fuel for the turbines, parts for filters and repairs).
const KEEP = { wood: 140, parts: 30, metal: 25, stone: 20 };
export function spare(s, cost, urgent) { for (const k in cost) if (s.S.res[k] - cost[k] < (urgent ? 0 : KEEP[k] || 0)) return false; return true; }
export function build(s, type, near, urgent) {
  if (!s.hasTech(B[type].tech) || !spare(s, B[type].cost, urgent)) return false;
  if (B[type].limit && s.count(type, false) >= B[type].limit) return false;
  if (B[type].node && !near) { const nd = NODES.filter(n => n.type === B[type].node && s.S.zones[n.zone]).sort((a, b) => b.rich * s.nodeFactor(b) - a.rich * s.nodeFactor(a))[0]; if (!nd) return false; near = [nd.x, nd.z]; }
  const p = spot(s, type, near); if (!p) return false;
  return s.place(type, p[0], p[1], p[2]).ok;
}
export const ensure = (s, type, n = 1, near, urgent) => s.count(type, false) < n ? build(s, type, near, urgent) : false;
export function research(s, order) { if (s.S.tech.cur) return; for (const id of order) if (!s.S.tech.done[id] && s.canResearch(id).ok) { s.startResearch(id); return; } }
export function upgradeAny(s, types, maxActive = 2) {
  if (s.S.buildings.filter(b => b.upgrade).length >= maxActive) return false;
  for (const t of types) for (const b of s.S.buildings) if (b.type === t && s.canUpgrade(b).ok && spare(s, s.nextUpgrade(b).cost)) return s.upgrade(b.id);
  return false;
}
export function keepHeartwell(s) { for (const c in s.S.hw.cond) if ((s.S.hw.broken[c] || s.S.hw.cond[c] < 55) && s.S.res.parts >= 8) s.patch(null, c); }
export function sellSurplus(s) {
  if (s.S.time - s.S.train.at > 24) return;   // the bot acts once a day; a player would trade while the train is in
  for (const [r, min] of [['parts', 30], ['metal', 80], ['aether', 12]]) while (s.S.res[r] < min && s.S.res.scrip > 60 && s.S.trade.cargo >= 5 && s.trade(r, 5).ok);
  for (const r of ['stone', 'wood']) { while (s.S.res[r] > 650 && s.S.trade.cargo >= 10) s.trade(r, -10); }
}
// A sensible manager rests crews whose stores are full and frees them for expeditions.
export function manageLabour(s) {
  const S = s.S;
  const want = !S.expeditions.some(e => e.kind !== 'claim') ? (S.res.metal < 140 ? 'salvage' : S.res.aether < 25 ? 'survey' : S.res.food / Math.max(1, S.pop) < 4 ? 'hunt' : null) : null;
  for (const [t, r, hi, lo] of [['quarry', 'stone', 520, 200], ['lumber', 'wood', 800, 400]]) for (const b of S.buildings) if (b.type === t && b.progress == null) {
    if (S.res[r] > hi) s.setSlots(b.id, 0); else if (S.res[r] < lo) s.setSlots(b.id, s.workersOf(b));
  }
  for (const b of S.buildings) if (b.type === 'workshop' && b.progress == null) { if (S.res.parts > 170 || S.res.metal < 12) s.setSlots(b.id, 1); else if (S.res.parts < 110) s.setSlots(b.id, s.workersOf(b)); }
  // free a crew for the expedition from the least essential workplaces, and give the slots back afterwards
  const lend = S.buildings.filter(b => (b.type === 'market' || b.type === 'betting' || b.type === 'warehouse') && b.progress == null);
  if (want && S.idle < 5) for (const b of lend) s.setSlots(b.id, 0); else if (!want) for (const b of lend) s.setSlots(b.id, s.workersOf(b));
  s._assign();
  if (want) s.expedition(want);
}
const homes = s => s.S.buildings.filter(b => B[b.type].housing).length;

// --- strategies -----------------------------------------------------------
const RESEARCH_CARE = ['heatshift', 'insulation', 'medicine', 'deepdrill', 'steam', 'irrigation', 'tools', 'apprentice', 'trade', 'reclaim', 'cooling', 'warehousing', 'precision', 'fabrication', 'laboratory', 'aether', 'specialists', 'caravans', 'climate', 'aquifer', 'automation'];
const RESEARCH_IND = ['tools', 'steam', 'fabrication', 'precision', 'trade', 'aether', 'specialists', 'deepdrill', 'automation', 'warehousing', 'caravans'];

function expand(s, opts = {}) {
  const S = s.S;
  if (S.housingCap - S.pop < 4 && S.buildings.filter(b => b.progress != null).length < 2) build(s, s.hasTech('insulation') && S.res.wood > 300 && !opts.cheapHomes ? 'insulated' : opts.cheapHomes ? 'frontier' : 'settler');
  if (S.res.food / Math.max(1, S.pop) < 6 || S.flow.food < 4) { if (s.count('farm', false) < 1 + Math.floor(S.pop / 35)) build(s, 'farm'); }
  if (S.flow.wood < 6 && S.res.wood < 400 && s.count('lumber', false) < 2 && S.zones.west) build(s, 'lumber');
}
function claims(s, order) { for (const z of order) if (!s.S.zones[z] && s.canClaim(z).ok) { s.claim(z); return; } }

export const STRATEGIES = {
  'Hands-off': () => {},

  // Follows the adviser: prepares for the heat first, paces growth to what the Heartwell can carry, then expands.
  'Prepared': (s, d, o = {}) => {
    const S = s.S, fc = s.forecast(), F = Object.fromEntries(fc.items.map(i => [i.key, i.score]));
    research(s, o.research || RESEARCH_CARE); keepHeartwell(s); sellSurplus(s); manageLabour(s);
    if (s.hasTech('heatshift')) s.setPolicy('curfew', true);
    s.setPolicy('ration', S.res.water < s.C.waterCap * 0.25);
    s.setPolicy('closed', F.water < 0.8 || F.food < 0.6 || (!o.noMedical && F.health < 0.5) || s.aqLevel() < 0.5);
    if (!o.noMedical) { ensure(s, 'medical', 1, null, true); if (F.health < 0.8) upgradeAny(s, ['medical'], 3) || (S.pop > 70 && ensure(s, 'medical', 2)); }
    ensure(s, 'utility', 1, null, true);
    // water: storage, then the Heartwell itself
    if (s.hasTech('reclaim') && s.aqLevel() < 0.7) { ensure(s, 'generator', 2, [26, 30]); ensure(s, 'reclaim', 2, [30, 26]); }
    if (F.water < 0.85 || s.aqLevel() < 0.6) {
      const order = S.hw.lv.pur < S.hw.lv.ext ? ['pur', 'ext', 'pool'] : S.hw.lv.pool < S.hw.lv.ext ? ['pool', 'ext', 'pur'] : ['ext', 'pur', 'pool'];
      for (const k of order) if (s.hwCanUpgrade(k).ok && spare(s, HW.upCost[S.hw.lv[k]])) { s.hwUpgrade(k); break; }
      if (s.count('watertower', false) < 3 + Math.floor(S.pop / 60)) build(s, 'watertower');
      if (s.hasTech('reclaim') && s.count('generator')) ensure(s, 'reclaim');
    }
    if (F.homes < 0.8) { ensure(s, 'shade', 1, [24, 24]) || ensure(s, 'shade', 2, [39, 40]) || ensure(s, 'shade', 3, [24, 40]); upgradeAny(s, ['frontier', 'settler'], 2); }
    if (s.canCraftRig().ok && S.rigs < S.outdoor && S.res.parts > 70) s.craftRig();
    upgradeAny(s, [...(o.noMedical ? [] : ['medical']), 'school', 'hunter', 'farm', 'workshop', 'warehouse', 'lumber', 'frontier', 'settler', 'insulated'], 2);
    if (s.hasTech('fabrication') && s.count('mine') && S.pop > 90) { ensure(s, 'fabrication', 1, [24, 34]); const f = S.buildings.find(b => b.type === 'fabrication' && b.progress == null); if (f && !f.queue.length && S.res.aether > 30) for (const r of ['construction', 'hauler', 'maintenance']) if (S.clickers.filter(c => c.role === r).length < 1 && s.queueClicker(f.id, r)) break; }
    if (s.hasTech('aether') && S.zones.south) ensure(s, 'refinery', 1, [42, 56]);
    if (S.rank >= 2) claims(s, ['south']);
    claims(s, o.claims || ['east', 'west', 'north']);
    if (s.hasTech('steam') && S.zones.east) { ensure(s, 'generator', 1, [57, 32]); if (s.count('generator')) ensure(s, 'mine', 1, [57, 36]); }
    if (s.hasTech('steam') && (s.powerRatio < 1 || s.hwPower < 1 || s.hasTech('reclaim'))) ensure(s, 'generator', 2, [26, 30]);
    if (S.zones.west) ensure(s, 'lumber', 2, [6, 30]);
    if (s.hasTech('trade')) ensure(s, 'depot');
    // growth is paced: no new homes while the water forecast is poor
    if (s.count('quarry', false) < 2 && S.res.stone < 150 && S.flow.stone < 12) build(s, 'quarry');
    if (F.water >= 0.75 && F.food >= 0.6) expand(s);
    else if (S.res.food / Math.max(1, S.pop) < 4) build(s, 'farm');
  },

  // Chases population: cheap shelters and more workplaces, nothing for the heat.
  'Growth, no preparation': (s) => {
    const S = s.S;
    research(s, ['tools', 'trade', 'apprentice', 'warehousing', 'caravans', 'steam']); sellSurplus(s);
    if (S.housingCap - S.pop < 8 && S.buildings.filter(b => b.progress != null).length < 3) build(s, 'frontier');
    if (S.idle > 3) (s.count('farm', false) < 4 && build(s, 'farm')) || (s.count('hunter', false) < 2 && build(s, 'hunter', [33, 21])) || (s.count('workshop', false) < 2 && build(s, 'workshop'));
    claims(s, ['north']);
  },

  // Industry first: iron, power, parts and Clickers. Housing and care are left as they were.
  'Industry first': (s) => {
    const S = s.S;
    research(s, RESEARCH_IND); keepHeartwell(s); sellSurplus(s);
    claims(s, ['east', 'west', 'south']);
    ensure(s, 'utility');
    if (s.hasTech('steam')) ensure(s, 'generator');
    if (S.zones.east && s.count('generator')) ensure(s, 'mine');
    ensure(s, 'workshop', 2);
    if (s.hasTech('fabrication')) { ensure(s, 'fabrication'); const f = S.buildings.find(b => b.type === 'fabrication' && b.progress == null); if (f && !f.queue.length) for (const r of ['construction', 'hauler', 'harvesting', 'excavation', 'agriculture']) if (S.clickers.filter(c => c.role === r).length < 1 && s.queueClicker(f.id, r)) break; }
    if (s.hasTech('aether') && S.zones.south) ensure(s, 'refinery');
    upgradeAny(s, ['workshop', 'lumber', 'quarry', 'warehouse'], 1);
    if (S.housingCap - S.pop < 2 && S.buildings.filter(b => b.progress != null).length < 2) build(s, 'frontier');
    if (S.idle >= 5 && !S.expeditions.length && S.res.metal < 200) s.expedition('salvage');
  },

  // Prepared, but opens far more workplaces than there are people to staff them.
  'Over-built workplaces': (s, d) => {
    STRATEGIES['Prepared'](s, d);
    for (const [t, n] of [['farm', 4], ['workshop', 3], ['hunter', 3], ['market', 2], ['smokehouse', 2]]) if (ensure(s, t, n, t === 'hunter' ? [33, 21] : null)) break;
  },

  // Prepared in every way except medicine: no Medical Post, no Heat Medicine.
  'No healthcare': (s, d) => STRATEGIES['Prepared'](s, d, { noMedical: true, research: RESEARCH_CARE.filter(t => t !== 'medicine') }),

  // Prepared for the heat, but lives off the core alone: more lodges and camps on the same herds and stand, thirsty farms, no claims.
  'Strip the core': (s) => {
    const S = s.S;
    research(s, ['heatshift', 'insulation', 'medicine', 'tools', 'steam', 'apprentice', 'trade']); keepHeartwell(s); sellSurplus(s);
    if (s.hasTech('heatshift')) s.setPolicy('curfew', true);
    ensure(s, 'medical') || ensure(s, 'utility');
    upgradeAny(s, ['frontier', 'settler', 'hunter', 'lumber', 'farm'], 2);
    ensure(s, 'hunter', 3, [33, 21]) || ensure(s, 'lumber', 3, [20, 36]) || ensure(s, 'farm', 5);
    if (S.housingCap - S.pop < 4 && S.buildings.filter(b => b.progress != null).length < 2) build(s, 'settler');
  },
};

export function run(name, years = 4, seed = 0) {
  const s = new Sim(); if (seed) s.S.rng += seed * 7919;
  const strat = STRATEGIES[name], rows = [];
  for (let d = 0; d < years * 48 && !s.S.over; d++) {
    strat(s, d); s.advance(24);
    if ((d + 1) % 48 === 0 || s.S.over) rows.push({ y: Math.floor(d / 48) + 1, day: d + 1, pop: s.S.pop, kids: s.S.kids, deaths: s.S.deaths, skilled: s.S.skilled, pros: Math.round(s.prosperity().score), rank: s.charter().name, aq: Math.round(s.aqLevel() * 100), game: Math.round(s.S.game / s.gameCap() * 100), unfilled: s.S.unfilled, born: s.S.yrPrev ? s.S.yrPrev.births : s.S.yr.births, arrived: s.S.yrPrev ? s.S.yrPrev.arrived : s.S.yr.arrived, left: s.S.yrPrev ? s.S.yrPrev.left : s.S.yr.left });
  }
  return { name, s, rows, reports: s.S.reports, over: s.S.over, day: s.day() };
}
