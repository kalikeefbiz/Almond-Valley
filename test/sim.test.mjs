// Headless gameplay tests: node test/sim.test.mjs
import { Sim, footprint } from '../src/sim.js';
import { B, N, YEAR, TECH } from '../src/data.js';

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
  ok(!s.canPlace('frontier', 5, 5, 0).ok, 'cannot build in unclaimed zone');
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
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
