import { STRATEGIES, run } from './bots.mjs';
const only = process.argv[2], years = +(process.argv[3] || 4);
for (const name of Object.keys(STRATEGIES)) {
  if (only && only !== 'all' && !name.toLowerCase().includes(only.toLowerCase())) continue;
  const t0 = Date.now(), r = run(name, years);
  console.log(`\n== ${name}${r.over ? '  [ABANDONED day ' + r.day + ']' : ''}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  for (const x of r.rows) console.log(`  Y${x.y} pop ${x.pop} (kids ${x.kids}) dead ${x.deaths} skilled ${x.skilled} pros ${x.pros} ${x.rank} | aq ${x.aq}% game ${x.game}% unfilled ${x.unfilled} | born ${x.born} arrived ${x.arrived} left ${x.left}`);
  for (const p of r.reports) console.log(`  Summer ${p.summer}: grade ${p.grade} ${p.peakT}°C deaths ${p.deaths} (untreated ${p.untreated}) cases ${p.cases} peak sick ${p.sickPeak} lostWork ${p.lostWork} eff ${(p.eff * 100) | 0}% minWater ${(p.minWater * 100) | 0}% aq ${(p.aq0 * 100) | 0}->${(p.aq1 * 100) | 0} breaks ${p.breaks} fc ${(p.fc * 100) | 0}% fcDeaths ${p.fcDeaths}`);
  const S = r.s.S; console.log('  end:', 'W', S.res.water | 0, 'F', S.res.food | 0, 'wood', S.res.wood | 0, 'stone', S.res.stone | 0, 'metal', S.res.metal | 0, 'parts', S.res.parts | 0, 'ae', S.res.aether | 0, 'scrip', S.res.scrip | 0, 'bld', S.buildings.length, 'tech', Object.keys(S.tech.done).length, 'zones', Object.keys(S.zones).join(','));
}
