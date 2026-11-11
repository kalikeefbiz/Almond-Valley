// Headless gameplay tests: node test/sim.test.mjs
import { Sim, footprint, cellZone, SAVE_VERSION } from '../src/sim.js';
import { B, N, YEAR, TECH, ZONES, LEVELS } from '../src/data.js';
import { CANYON, PIER_CELLS } from '../src/terrain.js';
import { readFileSync } from 'node:fs';

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

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
