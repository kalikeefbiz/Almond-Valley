// Headless gameplay tests: node test/sim.test.mjs
import { Sim, footprint, cellZone, SAVE_VERSION } from '../src/sim.js';
import { B, N, YEAR, TECH, ZONES, LEVELS } from '../src/data.js';
import { CANYON, PIER_CELLS } from '../src/terrain.js';
import { readFileSync } from 'node:fs';
import { run as runBot } from './bots.mjs';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } else console.log('  ok  ', m); };
const row = s => { const S = s.S; return `d${String(s.day() + 1).padStart(3)} ${s.seasonName().padEnd(12)} ${s.T.toFixed(0)}C pop ${S.pop} sick ${S.sick} dead ${S.deaths} mor ${S.morale.toFixed(0)} water ${S.res.water.toFixed(0)}/${s.C.waterCap} food ${S.res.food.toFixed(0)} wood ${S.res.wood.toFixed(0)} stone ${S.res.stone.toFixed(0)} metal ${S.res.metal.toFixed(0)} parts ${S.res.parts.toFixed(0)} aeth ${S.res.aether.toFixed(0)} idle ${S.idle} expo ${(s.expo||0).toFixed(2)} pw ${s.powerGen.toFixed(0)}/${s.powerUse.toFixed(0)}`; };

console.log('--- start state');
{
  const s = new Sim();
  const S = s.S;
  // overlap check
  const seen = new Map(); let overlap = 0;
  for (const b of S.buildings) { const f = footprint(b); for (let z = f.z; z < f.z + f.d; z++) for (let x = f.x; x < f.x + f.w; x++) { const k = z * N + x; if (seen.has(k)) overlap++; seen.set(k, b.id); } }
  ok(overlap === 0, 'no overlapping start buildings');
  ok(S.buildings.every(b => !B[b.type].node || s.C.info[b.id].rich > 0), 'extractors have deposits');
  ok(S.buildings.filter(b => B[b.type].out).every(b => s.C.info[b.id].linked), 'producers road-linked: ' + S.buildings.filter(b => B[b.type].out && !s.C.info[b.id].linked).map(b => b.type));
  ok(s.C.onNet[S.buildings.find(b => b.type === 'watertower').id], 'water tower on the main');
  console.log('  homes unwatered:', S.buildings.filter(b => B[b.type].housing && !s.C.info[b.id].watered).length, 'cap', S.housingCap, 'idle', S.idle);
}

console.log('--- construction + costs');
{
  const s = new Sim(); const S = s.S;
  const wood0 = S.res.wood;
  let spot = null;
  for (let z = 20; z < 44 && !spot; z++) for (let x = 20; x < 44 && !spot; x++) if (s.canPlace('frontier', x, z, 0).ok) spot = [x, z];
  const r = s.place('frontier', spot[0], spot[1], 0);
  ok(r.ok && S.res.wood === wood0 - 30, 'placing deducts cost');
  ok(!s.canPlace('frontier', spot[0], spot[1], 0).ok, 'cannot overlap');
  ok(!s.canPlace('frontier', 3, 30, 0).ok, 'cannot build in unclaimed survey zone');
  ok(!s.canPlace('insulated', 20, 20, 0).ok, 'tier III locked by research');
  const b = s.byId(r.id);
  s.advance(24);
  ok(b.progress == null, 'house built within a day (master + idle workers)');
  ok(S.housingCap === 58, 'housing capacity rose: ' + S.housingCap);
  // workforce
  const hunter = S.buildings.find(x => x.type === 'hunter');
  s.setSlots(hunter.id, 2); s.advance(0.2);
  ok(hunter.staff === 2, 'worker slots respected');
  const eff2 = hunter.eff; s.setSlots(hunter.id, 6); s.advance(0.2);
  ok(hunter.eff > eff2 * 2, 'more workers, more output');
  // save/load
  const json = s.serialize(); const s2 = new Sim(JSON.parse(json));
  ok(s2.S.buildings.length === S.buildings.length && Math.abs(s2.S.res.wood - S.res.wood) < 1e-6, 'save/load round trip');
  s2.advance(5); ok(!isNaN(s2.S.res.water), 'loaded sim keeps running');
}

function run(name, policy, years = 1) {
  console.log('--- ' + name);
  const s = new Sim();
  for (let d = 0; d < YEAR * years; d++) {
    if (policy) policy(s, d);
    s.advance(9); const mid = row(s); s.advance(15);
    if (d % 6 === 5 || (d % YEAR >= 20 && d % YEAR <= 31 && d % 2 === 0)) console.log(row(s));
    if (s.S.over) { console.log('GAME OVER'); break; }
  }
  return s;
}
const passive = run('passive year', null, 1);
ok(!passive.S.over, 'settlement not wiped out passively in year 1');
ok(passive.S.deaths > 0, 'ignoring Double Noon costs lives: ' + passive.S.deaths);

// A scripted, sensible player
function tryBuild(s, type, zone = [20, 20, 43, 43]) {
  for (let z = zone[1]; z <= zone[3]; z++) for (let x = zone[0]; x <= zone[2]; x++) for (let r = 0; r < 2; r++) {
    if (s.canPlace(type, x, z, r).ok) {
      // keep a road gap: avoid touching roads so we don't erase them
      return s.place(type, x, z, r).ok;
    }
  }
  return false;
}
function active(s, d) {
  const S = s.S;
  const T = S.tech;
  if (!T.cur) for (const t of ['insulation', 'heatshift', 'medicine', 'trade', 'steam', 'tools', 'deepdrill', 'irrigation', 'cooling', 'fabrication', 'aether', 'specialists', 'climate', 'aquifer', 'automation']) { if (s.canResearch(t).ok) { s.startResearch(t); break; } }
  const sites = S.buildings.filter(b => b.progress != null).length;
  if (d === 0) tryBuild(s, 'school');
  if (d === 1) tryBuild(s, 'medical');
  if (d === 3) tryBuild(s, 'shade');
  if (d === 5) tryBuild(s, 'utility');
  if (d === 6) tryBuild(s, 'lumber');
  if (d > 8 && sites < 2 && (S.flow.food < 8 || S.res.food < S.pop * 5) && S.res.wood > 80) tryBuild(s, S.idle > 5 ? 'hunter' : 'farm');
  if (T.done.heatshift) s.setPolicy('curfew', true);
  if (sites < 2 && d > 6) {
    for (const b of S.buildings) if (B[b.type].housing && s.canUpgrade(b).ok && S.res.wood > 150) { s.upgrade(b.id); break; }
    if (S.housingCap - S.pop < 4 && S.res.wood > 120) tryBuild(s, T.done.insulation && S.res.wood > 250 && S.res.parts > 20 ? 'insulated' : 'frontier');
    if (S.res.food < S.pop * 6 && S.idle >= 4 && S.res.wood > 150) tryBuild(s, 'farm');
  }
  const q = S.buildings.find(b => b.type === 'quarry'), ws = S.buildings.find(b => b.type === 'workshop');
  if (d === 9) s.setSlots(q.id, 0);
  s.setSlots(ws.id, S.res.metal > 120 && S.res.parts < 120 ? 4 : 0);
  if (d >= 10 && !S.zones.east && s.canClaim('east').ok) s.claim('east');
  if (S.zones.east) s.setSlots(q.id, S.res.stone < 400 ? 5 : 0);
  if (S.zones.east && !s.count('mine', false) && S.res.wood > 130) {
    s.place('pylon', 44, 30, 0); s.place('pylon', 52, 30, 0);
    tryBuild(s, 'mine', [50, 25, 56, 33]);
  }
  if (T.done.fabrication && !s.count('fabrication', false)) tryBuild(s, 'fabrication');
  const fab = S.buildings.find(b => b.type === 'fabrication' && b.progress == null);
  if (fab && !fab.queue.length && S.clickers.length < 4) s.queueClicker(fab.id, S.clickers.length % 2 ? 'hauler' : 'construction');
  if (T.done.steam && s.powerGen - s.powerUse < 4 && !S.buildings.some(b => b.type === 'generator' && b.progress != null)) tryBuild(s, 'generator');
  if (S.res.water < s.C.waterCap * 0.3) s.setPolicy('ration', true); else if (S.res.water > s.C.waterCap * 0.5) s.setPolicy('ration', false);
  if (T.done.deepdrill) for (const p of ['ext', 'pur', 'pool', 'tur']) if (S.hw.lv[p] < 2) s.hwUpgrade(p);
  if (S.res.metal < 60 && S.res.scrip > 100) s.trade('metal', 20);
  if (S.res.parts < 15 && S.res.scrip > 150) s.trade('parts', 10);
  if (S.res.aether < 15 && S.res.scrip > 150) s.trade('aether', 8);
  if (s.canExpedition('salvage').ok && S.res.metal < 150 && s.h < 0.5) s.expedition('salvage');
}
const act = run('active player, 2 years', active, 2);
ok(!act.S.over, 'active player survives two summers');
ok(act.S.deaths < passive.S.deaths, `preparation saves lives (${act.S.deaths} vs ${passive.S.deaths})`);
ok(act.S.pop > 50, 'population grew: ' + act.S.pop);
ok(act.S.summers === 2, 'two Double Noons recorded');
console.log('  clickers:', act.S.clickers.map(c => c.role + ':' + (c.task ? c.task.kind : '-') + ':' + c.cond.toFixed(0)).join(' '), 'mine', act.count('mine'), 'hw', JSON.stringify(act.S.hw.lv), JSON.stringify(act.S.hw.cond));
console.log('  techs:', Object.keys(act.S.tech.done).join(','));
console.log('  log:', act.S.log.slice(0, 12).map(l => l.msg).join(' | '));

console.log('--- expanded valley + railway right of way');
{
  const s = new Sim(); const S = s.S;
  let open = 0, oldCore = 0;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const zn = cellZone(x, z); if (zn === 'core') { open++; if (x >= 20 && x <= 43 && z >= 20 && z <= 43) oldCore++; } }
  console.log('  buildable core cells', open, '(old core', oldCore + ')');
  ok(open > 1600, 'core is several times the old 24x24 zone');
  for (const [x, z] of [[10, 12], [50, 12], [12, 48], [48, 48], [31, 10], [30, 46]]) ok(s.canPlace('frontier', x, z, 0).ok, `open ground buildable at ${x},${z}: ` + s.canPlace('frontier', x, z, 0).reason);
  ok(s.canPlace('road', 33, 10, 0).ok, 'roads can run under the viaduct between piers');
  const pier = [...PIER_CELLS][3], px = pier % N, pz = (pier / N) | 0;
  ok(/pier/i.test(s.canPlace('frontier', px, pz, 0).reason || ''), 'piers block building with a clear reason');
  const rock = [...CANYON.keys()].find(i => CANYON[i] && (i % N) > 2 && (i % N) < 61 && ((i / N) | 0) > 20 && ((i / N) | 0) < 44);
  if (rock != null) ok(/canyon/i.test(s.canPlace('frontier', rock % N, (rock / N) | 0, 0).reason || ''), 'canyon rock blocked with a clear reason');
  ok(/claim East Canyon/.test(s.canPlace('frontier', 58, 30, 0).reason || ''), 'distant deposits still need a survey claim');
  // a house far from the old core still gets built and housed
  const r = s.place('frontier', 12, 48, 0); s.advance(24 * 2);
  ok(s.byId(r.id).progress == null, 'house on newly opened ground gets built');
  const lumber = s.canPlace('lumber', 9, 12, 0);
  console.log('  roads reach new ground:', s.pathTo(26, 30, footprint(s.byId(r.id))).length, 'steps');
}

console.log('--- old save migration');
{
  const old = JSON.parse(readFileSync(new URL('./fixtures-v1-save.json', import.meta.url)));
  const n0 = old.buildings.length, roads0 = old.roads.reduce((a, b) => a + b, 0), pop0 = old.pop;
  const s = new Sim(JSON.parse(JSON.stringify(old)));
  ok(s.S.v === SAVE_VERSION && [0, 1, 2, 4].includes(s.S.speed), 'v1 save migrated (speed ' + old.speed + ' -> ' + s.S.speed + ')');
  ok(s.S.buildings.length === n0 && s.S.roads.reduce((a, b) => a + b, 0) === roads0, 'buildings and roads preserved');
  s.advance(24 * 3);
  ok(!s.S.over && s.S.pop >= pop0 - 5, `old settlement keeps running (pop ${pop0} -> ${s.S.pop})`);
}


console.log('--- research from infrastructure');
{
  const s = new Sim(); const S = s.S;
  const school = S.buildings.find(b => b.type === 'school');
  ok(school && school.progress == null && school.staff > 0, `starting School is built and staffed (${school && school.staff} staff)`);
  const src = s.researchSources();
  ok(src.length === 1 && src[0].id === school.id && s.researchRate() > 5, `research comes from the School (${s.researchRate().toFixed(1)}/day), no passive trickle`);
  s.setSlots(school.id, 0); s.advance(0.3);
  ok(s.researchRate() === 0, 'unstaffed School produces no research');
  s.setSlots(school.id, 2); s.advance(0.3);
  // prerequisites, facility requirement, cost deduction
  ok(/Needs Tempered Tools/.test(s.canResearch('fabrication').reason), 'tech prerequisites enforced');
  S.tech.done.fabrication = true;
  ok(/Fabrication Plant/.test(s.canResearch('specialists').reason), 'advanced tech needs the manufacturing facility: ' + s.canResearch('specialists').reason);
  delete S.tech.done.fabrication;
  const w0 = S.res.wood; ok(s.startResearch('apprentice') && S.res.wood === w0 - 40, 'starting research deducts its cost');
  ok(/under way/.test(s.canResearch('insulation').reason), 'one project at a time, chosen centrally');
  let d = 0; while (S.tech.cur && d < 10) { s.advance(24); d++; }
  ok(S.tech.done.apprentice, `Apprenticeships researched in ${d} days from one School`);
  // research unlocks only: nothing is built or upgraded by it
  const n0 = S.buildings.length, lv0 = S.buildings.map(b => b.lv + b.type).join();
  S.tech.done.precision = true; S.tech.done.laboratory = true; s.advance(1);
  ok(S.buildings.length === n0 && S.buildings.map(b => b.lv + b.type).join() === lv0, 'research does not build or upgrade anything by itself');
  // a settlement with no School still researches (slowly) until it builds one
  const t = new Sim(); t.demolish(t.S.buildings.find(b => b.type === 'school').id);
  ok(t.researchRate() > 0 && t.researchSources()[0].id === null, 'no School: slow notebook research so nobody is stuck');
  const r = t.place('school', 12, 14, 0); t.S.res.wood += 200; t.advance(24 * 2);
  ok(t.byId(r.id).progress == null && t.researchSources().every(x => x.id !== null), 'once a School stands the notebook trickle stops');
}

console.log('--- per-building upgrades');
{
  const s = new Sim(); const S = s.S;
  S.res.wood += 500; S.res.stone += 500; S.res.metal += 300; S.res.parts += 200;
  const shops = S.buildings.filter(b => b.type === 'workshop'); const ws = shops[0];
  ok(s.nextUpgrade(ws).name === 'Improved Workshop' && s.canUpgrade(ws).ok, 'Workshop Lv 2 needs only materials and labour');
  const out0 = s.outMult(ws), w0 = S.res.wood, m0 = S.res.metal;
  ok(s.upgrade(ws.id) && S.res.wood === w0 - 60 && S.res.metal === m0 - 30, 'upgrade deducts its materials up front');
  ok(ws.upgrade && ws.lv === 1, 'upgrade is a construction job, not instant');
  let h = 0; while (ws.upgrade && h < 72) { s.advance(1); h++; }
  ok(ws.lv === 2 && !ws.upgrade, `labourers finished the upgrade in ${h} h`);
  ok(s.workersOf(ws) === 6 && s.outMult(ws) > out0 * 1.35, 'Lv 2 adds worker slots and output');
  ok(/Precision Machining/.test(s.canUpgrade(ws).reason), 'Lv 3 is gated by research');
  // a second workshop keeps its own level
  const r = s.place('workshop', 12, 14, 0); s.advance(24);
  ok(s.byId(r.id).lv === 1, 'a second Workshop has its own level (1 vs 2)');
  // School upgrade raises research capacity
  const sc = S.buildings.find(b => b.type === 'school'); s.setPrio(sc.id, 1); S.pop += 10; s.advance(1); const rate0 = s.researchRate();
  ok(sc.staff === 2 && rate0 > 4, `School fully staffed before upgrade (${sc.staff}, ${rate0.toFixed(1)}/day)`);
  s.upgrade(sc.id); h = 0; while (sc.upgrade && h < 72) { s.advance(1); h++; }
  s.setSlots(sc.id, 4); s.advance(1);
  ok(sc.lv === 2 && sc.staff === 4 && s.researchRate() > rate0 * 1.4, `Schoolhouse expands research (${rate0.toFixed(1)} -> ${s.researchRate().toFixed(1)}/day)`);
  // housing tiers still use their own path
  const home = S.buildings.find(b => b.type === 'frontier'); ok(s.nextUpgrade(home).kind === 'tier', 'homes still upgrade by tier');
  // demolishing mid-upgrade refunds the upgrade
  const q = S.buildings.find(b => b.type === 'quarry'); s.upgrade(q.id); const st0 = S.res.stone; s.demolish(q.id);
  ok(S.res.stone > st0, 'cancelling an upgrade by demolition refunds it');
}

console.log('--- v2 save with research in progress');
{
  const old = JSON.parse(readFileSync(new URL('./fixtures-v2-save.json', import.meta.url)));
  const s = new Sim(JSON.parse(JSON.stringify(old)));
  ok(s.S.v === SAVE_VERSION && s.S.buildings.every(b => b.lv === 1), 'v2 save migrated, buildings at level 1');
  ok(s.S.tech.done.heatshift && s.S.tech.cur === 'insulation' && s.S.tech.rp === old.tech.rp, 'research progress preserved');
  ok(!s.S.buildings.some(b => b.type === 'school') && s.researchRate() > 0, 'old settlement without a School keeps researching');
  let d = 0; while (s.S.tech.cur && d < 20) { s.advance(24); d++; }
  ok(s.S.tech.done.insulation, `in-progress project still completes (${d} days)`);
}


console.log('--- population and workforce');
{
  const s = new Sim(); const S = s.S;
  ok(S.kids === 8 && S.adults === 42 && S.able === 42, `children do not work (${S.pop} residents, ${S.kids} children, ${S.able} able)`);
  // sickness removes workers; the lowest-priority workplaces lose staff first, and say so
  const before = S.able; S.sick = 12; s.advance(0.2);
  ok(S.able < before - 8 && S.unfilled > 0, `12 sick: workforce ${before} -> ${S.able}, ${S.unfilled} jobs unfilled`);
  const short = s.shortList(); ok(short.length > 0 && short.every(b => b.staff < b.slots), 'short-staffed workplaces are listed: ' + short.map(b => s.bname(b)).join(', '));
  const q = S.buildings.find(b => b.type === 'betting'); ok(q.staff < q.slots && q.eff < 1, 'a short-staffed workplace produces less');
  ok(s.priorities().some(p => /jobs unfilled/.test(p.title) && /sick/.test(p.why)), 'adviser explains the shortage by sickness');
  // a medical post turns slow self-recovery into fast treatment
  const noCare = new Sim(); noCare.S.sick = 10; noCare.advance(24 * 3);
  const care = new Sim(); care.S.res.wood += 200; care.place('medical', 12, 14, 0); care.advance(24 * 2); care.S.sick = 10; care.S.recov = 0; care.advance(24); const conv = care.S.recov; care.advance(24 * 2);
  ok(care.beds >= 4 && care.S.sick < noCare.S.sick - 3, `3 days later: ${care.S.sick} still sick with a Medical Post (${care.beds} beds) vs ${noCare.S.sick} without`);
  ok(conv > 0 && care.S.recov < conv + 3, `treated patients convalesce (${conv} after a day), then return to work`);
  // births need room and food; deaths are permanent
  const g = new Sim(); g.S.res.wood += 600; for (let i = 0; i < 4; i++) g.place('settler', 10 + i * 3, 12, 0); g.advance(24 * 12);
  ok(g.S.yr.births > 0 || g.S.yr.arrived > 0, `with room and food the valley grows (born ${g.S.yr.births}, arrived ${g.S.yr.arrived})`);
  const full = new Sim(); full.S.pop = 54; full.advance(24 * 10);
  ok(full.S.yr.arrived === 0 && full.birthFactor <= 0.13, 'no room: no settlers, almost no births');
  const closed = new Sim(); closed.S.res.wood += 600; for (let i = 0; i < 4; i++) closed.place('settler', 10 + i * 3, 12, 0); closed.setPolicy('closed', true); closed.advance(24 * 12);
  ok(closed.S.yr.arrived === 0, 'Close the Gates stops immigration');
}

console.log('--- economy: depletion, regrowth and dependencies');
{
  const s = new Sim(); const S = s.S; S.res.wood += 400; S.res.stone += 200;
  // two more camps on the core stand over-cut it
  s.place('lumber', 18, 34, 0); s.place('lumber', 22, 38, 0); for (const b of S.buildings) if (b.type === 'lumber') s.setPrio(b.id, 1);
  const grove = { id: 'grove', type: 'forest', rich: 1 };
  S.pop += 12; for (let d = 0; d < 20; d++) { S.res.wood = Math.min(S.res.wood, 200); s.advance(24); }   // the timber is being used, not piling up
  ok(s.nodeLeft(grove) < 0.45, `three camps over-cut the grove to ${Math.round(s.nodeLeft(grove) * 100)}%`);
  ok(s.nodeFactor(grove) < 1, `yield falls to ${Math.round(s.nodeFactor(grove) * 100)}% as the stand thins`);
  for (const b of S.buildings) if (b.type === 'lumber') s.setSlots(b.id, 0);
  const low = s.nodeLeft(grove); s.advance(24 * 30);
  ok(s.nodeLeft(grove) > low + 0.1, `rested, the stand regrows (${Math.round(low * 100)}% -> ${Math.round(s.nodeLeft(grove) * 100)}%)`);
  // stone does not come back
  const t = new Sim(); const shelf0 = t.S.nodes.shelf; t.advance(24 * 10); ok(t.S.nodes.shelf < shelf0, 'quarrying draws down the stone shelf for good');
  // no timber: turbines lose power, the well loses lift
  const d = new Sim(); d.advance(2); const ext0 = d.hwRates.ext; d.S.res.wood = 0; for (const b of d.S.buildings) if (b.type === 'lumber') d.setSlots(b.id, 0); d.advance(3);
  ok(d.hwRates.ext < ext0 * 0.8, `no timber -> turbines starve -> extraction ${Math.round(ext0)} -> ${Math.round(d.hwRates.ext)}`);
  // no parts: purification loses its filters
  const f = new Sim(); f.advance(2); const pur0 = f.hwRates.pur; f.S.res.parts = 0; for (const b of f.S.buildings) if (b.type === 'workshop') f.setSlots(b.id, 0); f.advance(1);
  ok(f.noFilters && f.hwRates.pur < pur0 * 0.8, 'no parts -> no filter media -> purification falls');
  // prices move with trade
  const tr = new Sim(); const p0 = tr.price('metal'); tr.S.res.scrip = 5000; tr.S.trade.cargo = 200; tr.trade('metal', 40); ok(tr.price('metal') > p0 * 1.1, 'buying pushes the price up');
}

console.log('--- aquifer');
{
  const s = new Sim(); const S = s.S;
  const a0 = s.aqLevel(); s.advance(24 * 10);
  ok(Math.abs(s.aqLevel() - a0) < 0.06, `50 residents in spring are roughly sustainable (${Math.round(a0 * 100)}% -> ${Math.round(s.aqLevel() * 100)}%)`);
  S.pop = 160; S.kids = 20; S.res.food = 5000; const a1 = s.aqLevel(); s.advance(24 * 12);
  ok(s.aqLevel() < a1 - 0.015 && s.drawn > s.recharge, `a large town overdraws it (${Math.round(a1 * 100)}% -> ${Math.round(s.aqLevel() * 100)}%, drawn ${Math.round(s.drawn)} vs recharge ${Math.round(s.recharge)})`);
  S.hw.aq = s.aqMax() * 0.15; s.advance(0.5);
  ok(s.pf < 0.6, `a low water table cuts drill lift to ${Math.round(s.pf * 100)}%`);
  ok(s.aqRecharge('Cool Season') > s.aqRecharge('Double Noon') * 3, 'recharge is seasonal');
}

console.log('--- forecast and season report');
{
  const bare = new Sim(); bare.advance(24 * 14); const fb = bare.forecast();
  const prep = new Sim(); const P = prep.S; P.res.wood += 900; P.res.stone += 500; P.res.metal += 200; P.tech.done.insulation = true; P.tech.done.heatshift = true;
  prep.place('medical', 12, 14, 0); prep.place('shade', 23, 28, 0); prep.setPolicy('curfew', true);
  for (const b of [...P.buildings]) if (b.type === 'frontier') prep.upgrade(b.id);
  prep.advance(24 * 14); const fp = prep.forecast();
  console.log('  unprepared readiness', Math.round(fb.score * 100) + '%', 'deaths ~' + Math.round(fb.deaths), '| prepared', Math.round(fp.score * 100) + '%', 'deaths ~' + Math.round(fp.deaths));
  ok(fp.score > fb.score + 0.15 && fp.deaths < fb.deaths, 'forecast responds to preparation');
  ok(fb.items.length === 7 && fb.items.every(i => i.text && i.advice && i.go), 'every forecast item explains itself and links to an action');
  bare.advance(24 * 20); prep.advance(24 * 20);
  const rb = bare.S.reports[0], rp = prep.S.reports[0];
  ok(rb && rp && rb.summer === 1, 'a report is filed when Double Noon ends');
  console.log('  unprepared: grade', rb.grade, 'deaths', rb.deaths, 'cases', rb.cases, '| prepared: grade', rp.grade, 'deaths', rp.deaths, 'cases', rp.cases);
  ok(rp.deaths < rb.deaths && rp.sickPeak < rb.sickPeak && rp.lostWork < rb.lostWork, `the prepared valley loses fewer people and less work (${rp.lostWork} vs ${rb.lostWork} worker-days)`);
  ok(Math.abs(rb.deaths - rb.fcDeaths) <= Math.max(5, rb.fcDeaths * 0.6), `forecast was in the right range (forecast ${rb.fcDeaths}, actual ${rb.deaths})`);
  ok(rb.bad.length > 0 && rb.unresolved.length > 0 && rp.good.length > 0, 'report says what went wrong, what held and what is unresolved');
  ok(bare.events.some(e => e.type === 'report'), 'the UI is told to show the report');
}

console.log('--- charter');
{
  const s = new Sim(); const c = s.charter();
  ok(c.name === 'Frontier Camp' && c.next.name === 'Settlement' && c.next.reqs.length >= 4, 'starts as a Frontier Camp working toward Settlement');
  s.S.res.wood += 400; s.place('medical', 12, 14, 0); s.advance(24 * 2);
  ok(s.charter().next.reqs.find(r => r.id === 'medic').done, 'requirements track the real settlement');
}

console.log('--- v3 save (day 38, after a first summer)');
{
  const old = JSON.parse(readFileSync(new URL('./fixtures-v3-save.json', import.meta.url)));
  const s = new Sim(JSON.parse(JSON.stringify(old))); const S = s.S;
  ok(S.v === SAVE_VERSION && S.kids > 0 && S.kids < S.pop && S.recov === 0, `v3 save migrated: ${S.pop} residents, ${S.kids} children`);
  ok(S.tech.done.heatshift && S.tech.cur === 'insulation' && S.buildings.length === old.buildings.length && S.buildings.find(b => b.type === 'workshop').lv === 2, 'research, buildings and upgrade levels preserved');
  ok(s.aqLevel() > 0.7 && S.nodes.grove > 0 && S.game > 0 && S.rank === 0, 'aquifer, deposits and herds initialised');
  s.advance(24 * 60);
  ok(!S.over && S.reports.length === 1, `old settlement plays on through its next summer (pop ${S.pop}, grade ${S.reports[0].grade})`);
  const rt = new Sim(JSON.parse(s.serialize())); ok(rt.S.pop === S.pop && rt.S.nodes.vent1 != null && Math.abs(rt.aqLevel() - s.aqLevel()) < 1e-9, 'new state round-trips through save/load');
}

console.log('--- strategies over three years (scripted players)');
{
  const R = {}; for (const n of ['Hands-off', 'Prepared', 'Growth, no preparation', 'No healthcare', 'Strip the core']) R[n] = runBot(n, 3);
  for (const n in R) { const r = R[n], l = r.rows[r.rows.length - 1]; console.log(`  ${n.padEnd(24)} ${r.over ? 'abandoned day ' + r.day : 'pop ' + l.pop}, ${l.deaths} deaths, summers ${r.reports.map(p => p.grade + '(' + p.deaths + ')').join(' ')}, ${l.rank}`); }
  const P = R['Prepared'], H = R['Hands-off'];
  ok(!P.over && P.rows[2].pop > 80 && P.reports.every(r => r.deaths <= 2), 'a prepared valley grows and comes through three summers nearly unharmed');
  ok(H.rows[H.rows.length - 1].deaths > 20, 'a neglected valley does not');
  ok(R['No healthcare'].reports[0].deaths > P.reports[0].deaths, 'skipping medical care costs lives');
  ok(R['Growth, no preparation'].reports[0].cases > P.reports[0].cases * 2, 'growth without heat preparation fills the sickbeds');
  ok(R['Strip the core'].rows[1].game < 20, 'living off the core herds alone exhausts them');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
