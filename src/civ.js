// Civilization layer: prosperity, charter ranks, the adviser's priorities, alerts, the Double Noon forecast
// and the season report. All of it reads the live simulation; nothing here is scripted.
// These are mixed into Sim.prototype (see the bottom of sim.js).
import { B, HW, TECH, YEAR, POP, NODES, NODE_NAMES, ZONES, CLICKERS } from './data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pc = v => Math.round(v * 100) + '%';
const costText = cost => Object.entries(cost || {}).map(([k, v]) => `${v} ${k}`).join(', ');

// Charter ranks. Each requirement is [id, text, value(sim), target].
const staffed = (s, t, lv = 1) => s.S.buildings.filter(b => b.type === t && b.progress == null && b.staff > 0 && (b.lv || 1) >= lv).length;
const homesAtLeast = (s, tier) => s.S.buildings.filter(b => B[b.type].housing && b.progress == null && B[b.type].tier >= tier).length;
export const RANKS = [
  { name: 'Frontier Camp' },
  {
    name: 'Settlement', reward: { wood: 120, stone: 80, scrip: 150 },
    blurb: 'Prove the camp can keep its people alive through a summer.',
    reqs: [
      ['medic', 'Staff a Medical Post', s => staffed(s, 'medical'), 1],
      ['study', 'Research Insulated Homes', s => s.S.tech.done.insulation ? 1 : 0, 1],
      ['store', 'Hold 3,400 water in reserve capacity', s => s.C.waterCap, 3400],
      ['pop', 'Reach 60 residents', s => s.S.pop, 60],
      ['noon', 'Come through a Double Noon', s => s.S.summers, 1],
    ],
  },
  {
    name: 'Township', reward: { metal: 120, parts: 40, scrip: 250 },
    blurb: 'Schools, clinics and claims: a town that plans beyond the next summer.',
    reqs: [
      ['pop', 'Reach 90 residents', s => s.S.pop, 90],
      ['homes', 'Have 4 Insulated Homes or better', s => homesAtLeast(s, 3), 4],
      ['clinic', 'Run a Clinic (Medical Post level II)', s => staffed(s, 'medical', 2), 1],
      ['skilled', 'Have 20 skilled workers', s => s.S.skilled, 20],
      ['claim', 'Survey and claim a district', s => Object.keys(s.S.zones).length - 1, 1],
      ['depot', 'Staff a Utility Depot', s => staffed(s, 'utility'), 1],
      ['pros', 'Reach prosperity 55', s => Math.round(s.prosperity().score), 55],
    ],
  },
  {
    name: 'Industrial Town', reward: { parts: 80, aether: 40, scrip: 400 },
    blurb: 'Iron, power and Clickers. Industry that feeds itself.',
    reqs: [
      ['pop', 'Reach 130 residents', s => s.S.pop, 130],
      ['mine', 'Operate an Iron Mine', s => staffed(s, 'mine'), 1],
      ['fab', 'Run a Fabrication Plant', s => staffed(s, 'fabrication'), 1],
      ['fleet', 'Manufacture 2 Clickers', s => s.S.madeClickers || 0, 2],
      ['deep', 'Raise Heartwell extraction to level II', s => s.S.hw.lv.ext, 2],
      ['mild', 'Come through a Double Noon with no more than 2 deaths', s => s.S.reports.some(r => r.deaths <= 2) ? 1 : 0, 1],
    ],
  },
  {
    name: 'Canyon City', reward: { scrip: 800, aether: 60 },
    blurb: 'A civilization that no summer can break.',
    reqs: [
      ['pop', 'Reach 180 residents', s => s.S.pop, 180],
      ['climate', 'Have 3 Climate Residences', s => homesAtLeast(s, 4), 3],
      ['aether', 'Operate an Aether Plant', s => staffed(s, 'refinery'), 1],
      ['aq', 'Hold the aquifer above 60% after 3 summers', s => s.S.summers >= 3 && s.aqLevel() >= 0.6 ? 1 : 0, 1],
      ['pros', 'Reach prosperity 75', s => Math.round(s.prosperity().score), 75],
      ['noon', 'Come through 4 Double Noons', s => s.S.summers, 4],
    ],
  },
];

export const civ = {
  // ------------------------------------------------------------------ prosperity
  // How good life in the valley is, 0-100. Drives immigration and births, and is itself a goal.
  prosperity() {
    const S = this.S, pop = Math.max(1, S.pop);
    const foodDays = S.res.food / pop, wf = S.res.water / Math.max(1, this.C.waterCap);
    const jobs = Math.max(1, S.jobs || 1);
    let services = 0;
    for (const t of ['market', 'betting', 'school', 'office']) if (this.S.buildings.some(b => b.type === t && b.progress == null && b.staff > 0)) services += 0.25;
    const parts = {
      Morale: clamp(S.morale / 100, 0, 1) * 30,
      Housing: clamp(((this.avgTier || 1) - 1) / 3, 0, 1) * 12 + (S.homeless ? 0 : 3),
      Food: clamp(foodDays / 6, 0, 1) * 15,
      Water: clamp(wf / 0.6, 0, 1) * 6 + clamp(this.aqLevel() / 0.6, 0, 1) * 4,
      Work: clamp(1 - (S.unfilled || 0) / jobs, 0, 1) * 6 + clamp(1 - (S.idle || 0) / Math.max(1, S.able || 1) * 2, 0, 1) * 4,
      Health: clamp(1 - (S.sick + S.recov) / pop * 3, 0, 1) * 6 + (this.medCover || 0) * 4,
      Services: services * 10,
    };
    let score = 0; for (const k in parts) score += parts[k];
    return { score: clamp(score, 0, 100), parts };
  },

  // ------------------------------------------------------------------ charter (long-term goals)
  charter() {
    const S = this.S, i = Math.min(S.rank, RANKS.length - 1), next = RANKS[S.rank + 1];
    const out = { rank: S.rank, name: RANKS[i].name, next: null };
    if (next) out.next = { name: next.name, blurb: next.blurb, reward: next.reward, reqs: next.reqs.map(([id, text, fn, max]) => { const cur = fn(this); return { id, text, cur: Math.min(cur, max), max, done: cur >= max }; }) };
    else { // open-ended legacy goals keep the valley growing after the last rank
      const target = Math.max(220, Math.ceil((S.legacyPop || 180) / 40) * 40 + 40);
      out.next = { name: 'Legacy', blurb: 'The canyon keeps growing. So do the summers.', reward: { scrip: 500 }, legacy: true, reqs: [
        { id: 'pop', text: `Reach ${target} residents`, cur: Math.min(S.pop, target), max: target, done: S.pop >= target },
        { id: 'pros', text: 'Hold prosperity at 80', cur: Math.min(80, Math.round(this.prosperity().score)), max: 80, done: this.prosperity().score >= 80 },
      ] };
    }
    return out;
  },
  _objectives() {
    const S = this.S;
    for (let guard = 0; guard < 6; guard++) {
      const c = this.charter(); if (!c.next || !c.next.reqs.every(r => r.done)) break;
      if (c.next.legacy) S.legacyPop = S.pop; else S.rank++;
      for (const k in c.next.reward) S.res[k] = Math.min(this.cap(k), S.res[k] + c.next.reward[k]);
      this.log(c.next.legacy ? `Legacy milestone reached. Reward: ${costText(c.next.reward)}.` : `Almond Valley is now a ${c.next.name}. Reward: ${costText(c.next.reward)}.`, 'good');
      this.events.push({ type: 'rank', name: c.next.name });
    }
  },
  // kept for older UI code and tests: the current charter requirements as a flat list
  objectives() { const c = this.charter(); return c.next ? c.next.reqs.map(r => ({ id: r.id, name: r.text, desc: c.next.name, cur: r.cur, max: r.max, reward: {} })) : []; },

  // ------------------------------------------------------------------ adviser: what needs attention now, and why
  priorities() {
    const S = this.S, hw = S.hw, out = [], pop = Math.max(1, S.pop);
    const add = (w, sev, title, why, act, go) => out.push({ w, sev, title, why, do: act, go });
    const foodDays = S.res.food / pop, wf = S.res.water / Math.max(1, this.C.waterCap);
    const beds = this.beds || 0, untreated = Math.max(0, S.sick - beds);
    const has = t => this.count(t) > 0;
    // emergencies
    if (S.thirst > 0.1) add(100, 'crit', 'People are going thirsty', `The reserve pools cannot meet demand (${Math.round(this.hwRates.demand)}/day).`, 'Raise Heartwell crews, repair failed components, or ration water.', 'heartwell');
    if (S.hunger > 0.1) add(98, 'crit', 'People are starving', `Rations have run out.`, 'Send a Long Hunt, buy food at the station, and add farms or lodges.', 'expedition');
    for (const c in hw.broken) add(95, 'crit', `${HW.comps[c]} is down`, 'A failed Heartwell component cuts water or power for the whole valley.', `Repair it (8 parts) from the Heartwell panel.`, 'heartwell');
    if (S.rawDrink > 0.05) add(93, 'crit', 'Residents are drinking untreated water', 'With the reserve dry they are filling buckets from the raw basins. It spreads sickness fast.', 'Restore purification: crew, power and parts for filters.', 'heartwell');
    // health
    if (untreated >= 2) add(80 + Math.min(10, untreated), untreated > 5 ? 'crit' : 'warn', `${untreated} sick without a bed`, `${S.sick} are sick and there ${beds === 1 ? 'is 1 staffed bed' : `are ${beds} staffed beds`}. Untreated patients recover five times slower and die far more often.`, has('medical') ? 'Upgrade or fully staff the Medical Post, or build another.' : 'Build a Medical Post and staff it.', has('medical') ? 'b' + S.buildings.find(b => b.type === 'medical').id : 'build');
    else if (!has('medical') && S.pop >= 30) add(62, 'warn', 'No medical care', 'Nobody in the valley can treat heat sickness. The sick cannot work and recover slowly on their own.', 'Build a Medical Post (Civic).', 'build');
    // workforce
    const lost = (S.sickA || 0) + (S.recovA || 0);
    if ((S.unfilled || 0) >= 4) {
      const short = this.shortList().slice(0, 3).map(b => `${this.bname(b)} ${b.staff}/${b.slots}`).join(', ');
      let why, act;
      if (lost >= S.unfilled * 0.5) { why = `${lost} workers are sick or recovering.`; act = beds < S.sick ? 'More staffed beds return them to work sooner.' : 'They will return as they recover. Lower exposure to stop new cases.'; }
      else if (S.housingCap - S.pop <= 0) { why = `Housing is full (${S.pop}/${S.housingCap}), so no settlers can come.`; act = 'Build or upgrade homes, or cut slots at workplaces you need least.'; }
      else { why = `There is room for settlers, but prosperity is ${Math.round(this.prosperity().score)} — they come faster above 60.`; act = 'Raise morale and food stocks, or cut slots at workplaces you need least.'; }
      add(58 + Math.min(15, S.unfilled), 'warn', `${S.unfilled} jobs unfilled`, `${why} Short: ${short}.`, act, 'people');
    }
    if (S.idle >= 6 && !(this.sites && this.sites.length)) add(50, 'info', `${S.idle} adults without work`, 'Unassigned workers build, but with nothing to build they sit idle and morale falls.', 'Start construction or add workplaces.', 'build');
    // food
    if (S.hunger <= 0.1 && foodDays < 4) {
      const why = this.gameFactor() < 0.6 ? `The herds are over-hunted (${pc(S.game / this.gameCap())} left), so lodges bring in less.` : this.h > 0.4 ? 'Heat is cutting outdoor food production and spoiling stores.' : `Production ${Math.round(S.flow.food)}/day does not cover ${S.pop} mouths.`;
      add(70 - foodDays * 4, foodDays < 2 ? 'crit' : 'warn', `${foodDays.toFixed(1)} days of rations`, why, 'Add a Canyon Farm on the water network, a Smokehouse, or trade for food.', 'build');
    } else if (this.gameFactor() < 0.6 && this.count('hunter')) add(44, 'warn', 'Game is growing scarce', `The herds are at ${pc(S.game / this.gameCap())}. Lodges bring in ${pc(this.gameFactor())} of a normal hunt.`, S.zones.north ? 'Rest a lodge (lower its slots) and lean on farms.' : 'Claim North Ridge for the far herds, or shift to farms.', S.zones.north ? 'people' : 'expedition');
    // water and aquifer
    const net = (this.recharge || 0) - (this.drawn || 0), lvl = this.aqLevel();
    if (S.thirst <= 0.1 && wf < 0.3) add(72, 'crit', `Reserve pools at ${pc(wf)}`, `Water is leaving ${Math.round(-S.flow.water)}/day faster than it is purified.`, 'Add Heartwell crew, ration, or cut farm slots.', 'heartwell');
    if (lvl < 0.6 && net < -15) add(lvl < 0.4 ? 68 : 46, lvl < 0.4 ? 'crit' : 'warn', `Aquifer at ${pc(lvl)} and falling`, `The well draws ${Math.round(this.drawn)}/day but only ${Math.round(this.recharge)}/day seeps back. Below 50% the drill lifts less (now ${pc(this.pf)}).`, this.hasTech('irrigation') ? (this.hasTech('reclaim') ? 'Build a Reclamation Works, raise extraction a level, or ease demand.' : 'Research Water Reclamation or raise extraction a level.') : 'Research Drip Irrigation, and consider rationing in the dry months.', 'research');
    if (this.noFilters) add(66, 'warn', 'Purification has no filter media', 'The silos use parts for filters. Without them they treat 30% less water.', 'Make or buy parts.', 'storage');
    // materials and deposits
    for (const b of S.buildings) {
      const info = this.C.info[b.id]; if (!info || !info.node || b.progress != null || !b.staff) continue;
      const nd = info.node, left = this.nodeLeft(nd);
      if (nd.type !== 'vent' && left < 0.3 && !out.some(o => o.key === nd.id)) {
        const regrow = nd.type === 'forest';
        out.push({ key: nd.id, w: 42, sev: 'warn', title: `${NODE_NAMES[nd.type]} ${regrow ? 'over-cut' : 'nearly worked out'} (${pc(left)})`, why: regrow ? 'Felling faster than it regrows. Yield falls as the stand thins.' : `What is left will last about ${Math.max(1, Math.round((S.nodes[nd.id] || 0) / Math.max(1, B[b.type].out[Object.keys(B[b.type].out)[0]])))} days.`, do: regrow ? 'Lower the camp\'s slots to let it recover, or claim a richer stand.' : 'Survey a district with a fresh deposit before it runs out.', go: regrow ? 'b' + b.id : 'expedition' });
      }
    }
    const woodUse = Math.max(1, -Math.min(0, S.flow.wood));
    if (S.res.wood < 40 || (S.flow.wood < -5 && S.res.wood / woodUse < 4)) add(60, 'warn', 'Timber is running out', 'Turbines, kitchens and workshops all burn it. Without timber the turbines lose 70% of their power.', 'Staff the Lumber Camp fully or buy timber.', 'people');
    if (S.res.parts < 6) add(54, 'warn', 'Almost no parts', 'Repairs, purification filters and machine tooling all need parts.', S.res.metal < 20 ? 'Workshops need iron: send a Canyon Salvage or claim East Canyon.' : 'Staff the Workshop.', S.res.metal < 20 ? 'expedition' : 'people');
    if (S.res.aether <= 4 && S.clickers.length) add(52, 'warn', 'Aether cells nearly gone', 'Clickers go dormant without aether.', has('refinery') ? 'Check the Aether Plant.' : 'Send a Vent Survey or buy cells at the station.', 'expedition');
    if (this.powerRatio < 0.95 || this.hwPower < 0.95) add(64, 'warn', 'Power shortage', `Demand ${Math.round(this.powerUse)} against ${Math.round(this.powerGen)} generated.`, this.hasTech('steam') ? 'Build a Steam Generator or upgrade the turbines.' : 'Research Steam Power.', 'research');
    // growth
    if (S.housingCap - S.pop <= 0 && S.morale > 45 && !S.homeless) add(40, 'info', 'Housing is full', 'No births and no settlers until there is room.', 'Build homes or upgrade shelters to a higher tier.', 'build');
    if (S.kids > (this.seats || 0) + 4) add(30, 'info', `${S.kids - (this.seats || 0)} children without a school place`, 'Schooled children come of age as skilled workers.', 'Staff or upgrade the School.', 'people');
    if (!S.tech.cur && this.researchRate() > 0 && Object.keys(TECH).some(id => this.canResearch(id).ok)) add(36, 'info', 'No research under way', `The valley produces ${this.researchRate().toFixed(1)} research points a day and they are going unused.`, 'Choose a project.', 'research');
    // the coming summer
    const dn = this.daysToDoubleNoon();
    if (dn > 0 && dn <= 16) {
      const fc = this.forecast(), weak = fc.items.slice().sort((a, b) => a.score - b.score)[0];
      if (weak && weak.score < 0.75) add(56 + (16 - dn), weak.score < 0.4 ? 'crit' : 'warn', `Double Noon in ${Math.ceil(dn)} days: ${weak.name.toLowerCase()} not ready`, weak.text, weak.advice, 'forecast');
    }
    out.sort((a, b) => b.w - a.w);
    if (out.length < 3) { // nothing urgent: point at the next step on the charter
      const c = this.charter(); const r = c.next && c.next.reqs.find(q => !q.done);
      if (r) out.push({ w: 0, sev: 'info', title: `Toward ${c.next.name}`, why: r.text + (r.max > 1 ? ` (${r.cur}/${r.max})` : '') + '.', do: '', go: 'charter' });
    }
    return out;
  },
  bname(b) { const l = this.lvDef(b); return (l && l.name) || B[b.type].name; },
  shortList() { return this.C.staffList.filter(b => b.progress == null && b.on && !b.broken && b.staff < b.slots).sort((a, b) => (b.slots - b.staff) - (a.slots - a.staff)); },

  alerts() {
    return this.priorities().filter(p => p.sev !== 'info' || p.w >= 50).slice(0, 4).map(p => ({ sev: p.sev, msg: p.title, go: p.go }));
  },

  // ------------------------------------------------------------------ daily workforce digest
  _digest() {
    const S = this.S, L = S.last || {};
    const short = this.shortList(), key = short.map(b => b.id + ':' + b.staff).join(',');
    if (L.able != null) {
      const d = S.able - L.able, bits = [];
      if (L.fell) bits.push(`${L.fell} fell sick`); if (L.back) bits.push(`${L.back} back at work`);
      if (S.deaths - (L.deaths || 0) > 0) bits.push(`${S.deaths - L.deaths} died`);
      if (L.arrived) bits.push(`${L.arrived} arrived`); if (L.grown) bits.push(`${L.grown} came of age`); if (L.births) bits.push(`${L.births} born`);
      const newShort = short.filter(b => !(L.shortIds || []).includes(b.id));
      if (Math.abs(d) >= 3 || newShort.length) {
        let msg = d ? `Workforce ${L.able} → ${S.able}` : `Workforce ${S.able}`;
        if (bits.length) msg += ` (${bits.join(', ')})`;
        if (short.length) msg += `. Short-staffed: ${short.slice(0, 3).map(b => `${this.bname(b)} ${b.staff}/${b.slots}`).join(', ')}${short.length > 3 ? ` +${short.length - 3} more` : ''}`;
        this.log(msg + '.', d <= -3 ? 'warn' : 'info');
      }
    }
    S.last = { able: S.able, deaths: S.deaths, shortIds: short.map(b => b.id), key };
  },

  // ------------------------------------------------------------------ Double Noon forecast
  // Projects the coming Double Noon from the settlement as it stands today.
  forecast() {
    const S = this.S, hw = S.hw, pop = Math.max(1, S.pop), P = S.policies;
    const yr = this.doy() < 30 ? this.year() : this.year() + 1;
    let hs = 0, hmax = 0, n = 0, peakT = 0;
    for (let t = 0; t < 240; t += 2) { const T = this.temp((yr * YEAR + 20) * 24 + t), h = this.heatOf(T); hs += h; hmax = Math.max(hmax, h); peakT = Math.max(peakT, T); n++; }
    const h = hs / n, hc = Math.min(1, h), items = [];
    const item = (key, name, score, text, advice, go) => items.push({ key, name, score: clamp(score, 0, 1), status: score >= 0.75 ? 'ok' : score >= 0.4 ? 'warn' : 'crit', text, advice, go });
    // --- water
    const people = pop * POP.water * (1 + POP.heatWater * Math.min(1.2, h)) * (P.ration ? 0.75 : 1);
    let farms = 0, industry = 0, shade = 0;
    for (const b of S.buildings) {
      const def = B[b.type]; if (b.progress != null || !b.on) continue;
      if (b.type === 'shade') { shade += def.in.water * (0.3 + h); continue; }
      if (!def.in || !def.in.water || def.housing) continue;
      const base = def.in.water * this.lvMul(b, 'out') * Math.min(1, b.slots / Math.max(1, this.workersOf(b)));
      if (b.type === 'farm') farms += base * (this.hasTech('irrigation') ? 0.5 : 1) * (1 + 0.8 * hc); else industry += base;
    }
    const coolant = 10 * (1 + 2 * hc) * HW.turMult[hw.lv.tur - 1];
    const demand = people * (1 - (this.reclaimShare || 0)) + farms + industry + shade + coolant;
    const condF = c => hw.broken[c] ? 0 : 0.4 + 0.6 * Math.max(0, hw.cond[c] - 8) / 100;
    const staffR = k => Math.min(1, hw.slots[k] / HW[k].workers[hw.lv[k] - 1]);
    const rech = this.aqRecharge('Double Noon');
    const lvlEnd = clamp((hw.aq + (rech - Math.min(demand, 400)) * 10) / this.aqMax(), 0, 1), pfMid = this.aqPressure((this.aqLevel() + lvlEnd) / 2);
    const ext = HW.ext.base * HW.mult[hw.lv.ext - 1] * staffR('ext') * condF('drill') * (1 - 0.18 * hc) * pfMid * (0.25 + 0.75 * this.hwPower);
    const pur = HW.pur.base * HW.mult[hw.lv.pur - 1] * staffR('pur') * condF('silo') * (0.25 + 0.75 * this.hwPower);
    const supply = Math.min(ext, pur), net = supply - demand;
    const reserve = Math.max(S.res.water, this.daysToDoubleNoon() > 6 ? this.C.waterCap * 0.85 : S.res.water);
    const lasts = net >= 0 ? 10 : Math.min(10, reserve / -net);
    item('water', 'Water', net >= 0 ? 1 : lasts / 10 * 0.9,
      `Peak demand about ${Math.round(demand)}/day (${Math.round(people)} for residents, ${Math.round(farms)} farms) against ${Math.round(supply)}/day from the Heartwell. ${net >= 0 ? 'Supply keeps up.' : `The reserve covers ${lasts.toFixed(1)} of the 10 days.`} Aquifer ${pc(this.aqLevel())}${lvlEnd < this.aqLevel() - 0.02 ? `, ending near ${pc(lvlEnd)}` : ''}.`,
      net >= 0 ? 'Keep the pools full going in.' : pur < ext ? 'Purification is the bottleneck: add crew or upgrade it.' : 'Add reserve capacity (Water Tower, pool upgrade), raise extraction, or plan to ration.', 'heartwell');
    // --- homes and outdoor crews
    let hExpo = 0, protSum = 0, housed = 0;
    for (const b of S.buildings) {
      const def = B[b.type]; if (!def.housing || b.progress != null) continue;
      const info = this.C.info[b.id] || {};
      let prot = def.housing.prot * (0.6 + 0.4 * b.cond / 100);
      if (def.wantsWater && !info.watered) prot *= 0.6;
      if (def.tier === 4 && (!info.powered || S.res.aether <= 0)) prot *= 0.6;
      if (info.shaded) prot += (1 - prot) * 0.4;
      const res = b.res || 0; hExpo += res * h * Math.min(1, (1 - prot) + 0.07 * (info.heat || 0)); protSum += res * prot; housed += res;
    }
    hExpo = (hExpo + (S.homeless || 0) * h * 1.05) / pop;
    const prot = housed ? protSum / housed : 0;
    item('homes', 'Housing', 1 - hExpo / 0.5,
      `Homes keep out ${pc(prot)} of the heat on average${S.homeless ? `, and ${S.homeless} residents have no home` : ''}. At ${Math.round(peakT)}°C that leaves residents ${pc(hExpo)} exposed indoors.`,
      this.hasTech('insulation') ? 'Upgrade the weakest homes a tier, and shade clusters with a Cooling Pavilion.' : 'Research Insulated Homes; meanwhile upgrade Frontier Shelters and add a Cooling Pavilion.', 'build');
    const oExpo = (S.outdoor / pop) * 0.45 * h * (P.curfew ? 0.3 : 1) * (1 - 0.5 * (S.outdoor ? Math.min(1, S.rigs / S.outdoor) : 0));
    item('crews', 'Outdoor crews', 1 - oExpo / 0.16,
      `${S.outdoor} people work outdoors with ${S.rigs} Hunter Clicker rigs. Noon Curfew is ${P.curfew ? 'on' : this.hasTech('heatshift') ? 'available but off' : 'not researched'}.`,
      P.curfew ? 'Fit more rigs at the Workshop.' : this.hasTech('heatshift') ? 'Turn on Noon Curfew before the heat (People).' : 'Research Noon Curfew, and fit rigs at the Workshop.', P.curfew || !this.hasTech('heatshift') ? 'research' : 'people');
    // --- health
    const e = hExpo + oExpo, med = this.hasTech('medicine');
    const cases = pop * (0.004 + 0.04 * e + 0.15 * e * e) * (med ? 0.7 : 1);
    const cure = POP.bedCure * (med ? 1.5 : 1), bedsNeed = cases / cure;
    let bedsMax = 0; for (const b of S.buildings) if (b.type === 'medical' && b.progress == null && b.on) bedsMax += this.lvDef(b).beds * Math.min(1, b.slots / this.workersOf(b));
    const D = 0.008 + 0.06 * e, inBeds = Math.min(bedsNeed, bedsMax), over = cases - inBeds * cure;
    const untreatedSteady = over > 0 ? over / (POP.selfCure * (e < 0.25 ? 1 : 0.35)) : 0;
    let deaths = (inBeds * D * 0.3 + Math.min(pop * 0.6, untreatedSteady) * D) * 10;
    if (net < 0 && lasts < 10) deaths += pop * 0.04 * (10 - lasts);   // days with dry pools
    deaths = Math.min(pop, deaths);
    item('health', 'Medical care', cases < 0.4 ? 1 : bedsMax <= 0 ? 0 : Math.min(1, bedsMax / Math.max(1, bedsNeed * 1.2)),
      `Expect about ${Math.round(cases * 10)} cases of heat sickness, needing ${Math.ceil(bedsNeed)} beds at a time. The valley has ${Math.floor(bedsMax)}. As things stand, around ${Math.round(deaths)} would die.`,
      bedsMax <= 0 ? 'Build and staff a Medical Post.' : bedsMax < bedsNeed ? 'Upgrade the Medical Post or add another — or cut exposure so fewer fall sick.' : 'Keep the medics\' slots filled through the summer.', 'build');
    // --- food
    let prod = 0;
    for (const b of S.buildings) { const def = B[b.type]; if (!def.out || !def.out.food || b.progress != null) continue; prod += def.out.food * this.outMult(b) * (b.eff || 0) / Math.max(0.3, 1 - 0.3 * Math.min(1, this.h)) * (1 - 0.3 * hc) * (P.curfew ? 0.7 : 1); }
    const fNeed = pop * (P.feast ? 1.3 : 1) + S.res.food * (0.012 + 0.03 * hc) * 0.8, fNet = prod - fNeed, fLast = fNet >= 0 ? 10 : Math.min(10, S.res.food / -fNet);
    item('food', 'Food', fNet >= 0 ? 1 : fLast / 10,
      `In the heat, food production falls to about ${Math.round(prod)}/day against ${Math.round(fNeed)}/day eaten or spoiled. ${fNet >= 0 ? 'Stores hold.' : `Stores (${Math.round(S.res.food)}) cover ${fLast.toFixed(1)} of the 10 days.`}`,
      'Stock rations before the heat: a Smokehouse halves spoilage, and a Long Hunt or the train can top up.', 'storage');
    // --- machinery
    const wear = 1 + 1.8 * hc * (this.hasTech('cooling') ? 0.6 : 1), risk = [];
    for (const c in hw.cond) if (hw.broken[c] || hw.cond[c] - wear * 10 * ((c === 'drill' || c === 'pump') ? 1.2 : 1) < 30) risk.push(HW.comps[c]);
    let bRisk = 0; for (const b of S.buildings) { const def = B[b.type]; if (def.wear && !def.housing && b.progress == null && b.cond - def.wear * (1 + 1.8 * hc) * 10 < 30) bRisk++; }
    const fixers = this.S.buildings.some(b => b.type === 'utility' && b.progress == null && b.staff > 0) || S.clickers.some(c => CLICKERS[c.role].repair && !c.broken && S.res.aether > 5);
    item('machines', 'Machinery', 1 - risk.length * 0.3 - Math.min(0.3, bRisk * 0.06) - (fixers && S.res.parts >= 20 ? 0 : 0.25),
      `${risk.length ? risk.join(', ') + ` could fail in the heat` : 'Heartwell components should hold'}${bRisk ? `; ${bRisk} other building${bRisk > 1 ? 's' : ''} at risk` : ''}. ${fixers ? `Repair crews are available with ${Math.floor(S.res.parts)} parts.` : 'Nobody is assigned to repairs.'}`,
      risk.length ? 'Repair those components now (Heartwell panel).' : fixers ? 'Hold at least 30 parts in store.' : 'Build a Utility Depot, or keep the Master Clicker supplied with aether.', 'heartwell');
    // --- power
    const gen = this.powerGen * (1 - 0.12 * hc) / Math.max(0.5, 1 - 0.12 * Math.min(1, this.h)), pr = this.powerUse > 0 ? gen / this.powerUse : 1;
    item('power', 'Power', pr >= 1 ? 1 : (pr - 0.5) * 2, `Turbines lose output in the heat: about ${Math.round(gen)} generated against ${Math.round(this.powerUse)} needed.`, 'Add a Steam Generator or upgrade the turbines.', 'heartwell');
    const W = { water: 0.25, homes: 0.2, health: 0.17, food: 0.14, crews: 0.09, machines: 0.1, power: 0.05 };
    let score = 0; for (const it of items) score += it.score * W[it.key];
    // one failing essential sinks the whole summer, so it must sink the headline number too
    const worst = Math.min(...items.filter(i => ['water', 'homes', 'health', 'food'].includes(i.key)).map(i => i.score));
    score = 0.55 * score + 0.45 * worst;
    return { days: this.daysToDoubleNoon(), year: yr, peakT, score, items, cases: cases * 10, deaths, summer: S.summers + 1 };
  },

  // ------------------------------------------------------------------ season tracking and report
  _dnStart() {
    const S = this.S, fc = this.forecast();
    S.dn = { y: this.year(), pop0: S.pop, deaths: 0, untreated: 0, cases: 0, sickPeak: S.sick, sickDays: 0, bedShort: 0, care: 0, lostWork: 0, unfilled: 0, waterUsed: 0, minWater: 1, aq0: this.aqLevel(), breaks: 0,
      food0: S.res.food, wood0: S.res.wood, parts0: S.res.parts, hours: 0, effSum: 0, curfewH: 0, rationH: 0, protSum: 0, rigSum: 0, thirstH: 0, rawH: 0, peakT: 0, fc: fc.score, fcDeaths: fc.deaths, beds0: this.beds || 0,
      goal: Math.max(1, Math.ceil(S.pop * 0.03)) };
    this.log(`Summer charter: lose no more than ${S.dn.goal} resident${S.dn.goal > 1 ? 's' : ''} this Double Noon. Readiness going in: ${pc(fc.score)}.`, 'info');
  },
  _dnEnd() {
    const S = this.S, n = S.dn; if (!n) return;
    const hrs = Math.max(1, n.hours), eff = n.effSum / hrs, prot = n.protSum / hrs, curfew = n.curfewH / hrs, ration = n.rationH / hrs;
    const good = [], bad = [];
    if (prot < 0.45) bad.push(`Homes kept out only ${pc(prot)} of the heat — the main cause of the ${n.cases} cases of heat sickness.`);
    else if (prot >= 0.65) good.push(`Homes kept out ${pc(prot)} of the heat.`);
    if (n.bedShort > 2) bad.push(`Patients spent ${Math.round(n.bedShort)} patient-days without a bed${n.deaths ? `; ${n.untreated} of the ${n.deaths} deaths were untreated` : ''}.`);
    else if (n.care > 0.5) good.push('Every patient had a staffed bed.');
    else if (n.cases > 3 && n.beds0 === 0) bad.push('There was no medical care at all.');
    if (curfew > 0.4) good.push(`Noon Curfew ran ${pc(curfew)} of the time and kept outdoor crews out of the worst heat.`);
    else if (S.outdoor > 4) bad.push(this.hasTech('heatshift') ? 'Noon Curfew was available but mostly off; outdoor crews worked through the heat.' : 'Outdoor crews worked through the noon heat (Noon Curfew is not researched).');
    if (n.thirstH > 1) bad.push(`The reserve pools ran dry for ${Math.round(n.thirstH)} hours.`);
    else if (n.minWater < 0.2) bad.push(`Reserves fell to ${pc(n.minWater)}.`);
    else good.push(`Reserves never fell below ${pc(n.minWater)}.`);
    if (n.rawH > 1) bad.push(`Residents drank untreated basin water for ${Math.round(n.rawH)} hours, spreading sickness.`);
    if (ration > 0.3) good.push(`Water rationing ran ${pc(ration)} of the time, at a cost to morale.`);
    const aq1 = this.aqLevel();
    if (aq1 < n.aq0 - 0.03) bad.push(`The aquifer fell from ${pc(n.aq0)} to ${pc(aq1)}.`);
    if (n.breaks) bad.push(`${n.breaks} breakdown${n.breaks > 1 ? 's' : ''} in the heat.`);
    else good.push('No machinery failed.');
    const ratio = Math.min(1.2, eff / Math.max(0.4, S.effBase));
    if (ratio < 0.75) bad.push(`Worksites ran at ${pc(ratio)} of their spring output; ${Math.round(n.lostWork)} worker-days were lost to sickness.`);
    const dr = n.deaths / Math.max(1, n.pop0), sr = n.sickPeak / Math.max(1, n.pop0);
    const grade = n.deaths === 0 && sr < 0.1 ? 'A' : dr <= 0.02 && sr < 0.25 ? 'B' : dr <= 0.06 ? 'C' : dr <= 0.12 ? 'D' : 'F';
    const met = n.deaths <= n.goal, reward = 80 + 40 * S.summers;
    if (met) { S.res.scrip += reward; this.log(`Summer charter met (${n.deaths} lost, limit ${n.goal}). ${reward} scrip from the railway.`, 'good'); }
    const rep = { summer: S.summers, year: n.y + 1, grade, peakT: Math.round(n.peakT), pop0: n.pop0, pop1: S.pop, deaths: n.deaths, untreated: n.untreated, cases: n.cases, sickPeak: n.sickPeak, stillSick: S.sick + S.recov,
      lostWork: Math.round(n.lostWork), unfilled: Math.round(n.unfilled / (hrs / 24)), waterUsed: Math.round(n.waterUsed), minWater: n.minWater, aq0: n.aq0, aq1, breaks: n.breaks, eff: ratio,
      food: [Math.round(n.food0), Math.round(S.res.food)], wood: [Math.round(n.wood0), Math.round(S.res.wood)], parts: [Math.round(n.parts0), Math.round(S.res.parts)],
      fc: n.fc, fcDeaths: Math.round(n.fcDeaths), goal: n.goal, met, reward, good, bad, broken: S.buildings.filter(b => b.broken).length + Object.keys(S.hw.broken).length };
    S.dn = null;
    rep.unresolved = this.priorities().filter(p => p.w > 0).slice(0, 4).map(p => ({ title: p.title, do: p.do, go: p.go }));
    S.reports.push(rep); if (S.reports.length > 6) S.reports.shift();
    this.events.push({ type: 'report' });
  },
};
