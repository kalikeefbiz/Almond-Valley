// Static game data for Almond Valley. No rendering or state here.

export const N = 64;          // grid cells per side
export const CELL = 2;        // world units per cell
export const YEAR = 48;       // days per seasonal cycle
export const DAY_SECONDS = 570; // real seconds per game day at 1x (about 9.5 minutes, a deliberate management pace)
export const BUILD_PACE = 2;    // construction labour per worker-hour; days are long now, so crews work at a believable hourly rate

export const RES = ['water', 'food', 'wood', 'stone', 'metal', 'parts', 'aether', 'scrip'];
export const RES_INFO = {
  water: { name: 'Water', color: '#4fc3f7' },
  food: { name: 'Rations', color: '#f2c14e' },
  wood: { name: 'Timber', color: '#c98a4b' },
  stone: { name: 'Stone', color: '#b9b4ac' },
  metal: { name: 'Iron', color: '#9fb0c2' },
  parts: { name: 'Parts', color: '#f0a020' },
  aether: { name: 'Aether Cells', color: '#5ee6ff' },
  scrip: { name: 'Scrip', color: '#e8c96a' },
  power: { name: 'Power', color: '#ffd54a' },
};

export const BASE_CAP = { food: 900, wood: 900, stone: 900, metal: 700, parts: 250, aether: 160, scrip: 99999 };
export const WAREHOUSE_CAP = { food: 600, wood: 600, stone: 600, metal: 500, parts: 200, aether: 140 };

// Territory. Almond Valley ('core') is all open valley floor not covered by a survey claim; claims are the
// distant pockets holding the valuable deposits. Canyon rock (see terrain.js) is never buildable.
// cellZone() checks the claims first, so their rectangles carve pockets out of the core.
export const ZONES = {
  core: { name: 'Almond Valley', x0: 0, z0: 0, x1: N - 1, z1: N - 1 },
  north: {
    name: 'North Ridge', x0: 1, z0: 1, x1: 62, z1: 7,
    cost: { wood: 120, stone: 80, food: 60 }, crew: 5, days: 2,
    desc: 'Hunting grounds under the north rim. Richer game, timber and a stone shelf.',
  },
  west: {
    name: 'Works Yard', x0: 1, z0: 8, x1: 7, z1: 51,
    cost: { wood: 100, stone: 120, food: 60 }, crew: 5, days: 2,
    desc: 'Under the western highlands. Dense timber stands for large lumber operations.',
  },
  east: {
    name: 'East Canyon', x0: 56, z0: 8, x1: 62, z1: 51,
    cost: { wood: 160, stone: 100, food: 80 }, crew: 6, days: 3,
    desc: 'Iron seams in the canyon wall. The only local source of ore.',
  },
  south: {
    name: 'Lower Flats', x0: 1, z0: 52, x1: 62, z1: 62,
    cost: { wood: 180, stone: 160, metal: 60, food: 100 }, crew: 6, days: 3,
    desc: 'Open ground at the south end of the basin, split by aether vents.',
  },
};

// Resource deposits. Extractors must sit within NODE_RANGE cells of one.
export const NODE_RANGE = 5;
export const NODES = [
  { id: 'grove', type: 'forest', x: 20, z: 36, rich: 1.0, zone: 'core' },
  { id: 'shelf', type: 'rock', x: 42, z: 22, rich: 1.0, zone: 'core' },
  { id: 'wtimber1', type: 'forest', x: 6, z: 25, rich: 1.6, zone: 'west' },
  { id: 'wtimber2', type: 'forest', x: 5, z: 38, rich: 1.8, zone: 'west' },
  { id: 'ore1', type: 'ore', x: 57, z: 26, rich: 1.0, zone: 'east' },
  { id: 'ore2', type: 'ore', x: 57, z: 38, rich: 1.4, zone: 'east' },
  { id: 'erock', type: 'rock', x: 58, z: 46, rich: 1.5, zone: 'east' },
  { id: 'vent1', type: 'vent', x: 20, z: 54, rich: 1.0, zone: 'south' },
  { id: 'vent2', type: 'vent', x: 42, z: 56, rich: 1.4, zone: 'south' },
  { id: 'nrock', type: 'rock', x: 14, z: 3, rich: 1.4, zone: 'north' },
  { id: 'ntimber', type: 'forest', x: 48, z: 3, rich: 1.4, zone: 'north' },
];
export const NODE_NAMES = { forest: 'Timber stand', rock: 'Stone shelf', ore: 'Iron seam', vent: 'Aether vent' };

export const CATS = [
  { id: 'housing', name: 'Housing' },
  { id: 'production', name: 'Production' },
  { id: 'infra', name: 'Infrastructure' },
  { id: 'civic', name: 'Civic' },
];

// Rates are per game day at 100% efficiency. `work` is construction labour.
export const B = {
  heartwell: {
    name: 'Heartwell', cat: 'unique', w: 8, d: 8, unique: true, wear: 0,
    desc: 'Aquifer drill, twin steam turbines, purification silos and the reserve pools. Everything in the valley drinks from here.',
  },
  station: {
    name: 'High Noon Station', cat: 'unique', w: 4, d: 2, unique: true, wear: 0,
    desc: 'Lift and platform under the High Noon Railway. Trains bring settlers and carry trade.',
  },
  // ---------- housing ----------
  frontier: {
    name: 'Frontier Shelter', cat: 'housing', w: 2, d: 2, tier: 1, cost: { wood: 30, stone: 10 }, work: 28, wear: 0.3,
    housing: { cap: 4, prot: 0.15, morale: 0, eff: 0 }, upgradeTo: 'settler',
    desc: 'Plank walls and a tin awning. Rest, and little else. Minimal heat protection.',
  },
  settler: {
    name: 'Settler Home', cat: 'housing', w: 2, d: 2, tier: 2, cost: { wood: 70, stone: 30, metal: 10 }, work: 45, wear: 0.3,
    housing: { cap: 6, prot: 0.4, morale: 4, eff: 0.05 }, upgradeTo: 'insulated',
    upCost: { wood: 40, stone: 20, metal: 10 }, upWork: 30,
    desc: 'Reinforced frame with a hearth and chimney. Holds some cool through the day.',
  },
  insulated: {
    name: 'Insulated Home', cat: 'housing', w: 2, d: 2, tier: 3, cost: { wood: 150, stone: 70, metal: 30, parts: 5 }, work: 80, wear: 0.3,
    housing: { cap: 8, prot: 0.7, morale: 10, eff: 0.08 }, upgradeTo: 'climate', tech: 'insulation', wantsWater: true,
    upCost: { wood: 80, stone: 40, metal: 20, parts: 5 }, upWork: 50,
    desc: 'Stone-footed, sealed and insulated. Needs the water network for its heat system.',
  },
  climate: {
    name: 'Climate Residence', cat: 'housing', w: 2, d: 2, tier: 4, cost: { wood: 270, stone: 130, metal: 70, parts: 15, aether: 10 }, work: 130, wear: 0.4,
    housing: { cap: 12, prot: 0.95, morale: 15, eff: 0.12 }, tech: 'climate', wantsWater: true, power: 1.5, in: { aether: 0.3 },
    upCost: { wood: 120, stone: 60, metal: 40, parts: 10, aether: 10 }, upWork: 80,
    desc: 'Two storeys, climate regulated. Needs power, water and a trickle of aether.',
  },
  // ---------- production ----------
  hunter: {
    name: "Hunter's Lodge", cat: 'production', w: 2, d: 2, cost: { wood: 60, stone: 20 }, work: 50, wear: 0.5,
    workers: 6, out: { food: 34 }, outdoor: true,
    desc: 'Hunters work the canyon for game. Claiming North Ridge extends their range.',
  },
  farm: {
    name: 'Canyon Farm', cat: 'production', w: 3, d: 3, cost: { wood: 50, stone: 30, metal: 10 }, work: 60, wear: 0.4,
    workers: 4, out: { food: 30 }, in: { water: 14 }, outdoor: true, wantsWater: true, auto: 'agriculture',
    desc: 'Irrigated plots. Thirsty, and weak without the water network.',
  },
  smokehouse: {
    name: 'Smokehouse', cat: 'production', w: 3, d: 2, cost: { wood: 70, stone: 40 }, work: 50, wear: 0.5,
    workers: 2, in: { wood: 4 },
    desc: 'Cures rations so they keep. Each one halves spoilage for 700 stored rations.',
  },
  lumber: {
    name: 'Lumber Camp', cat: 'production', w: 2, d: 2, cost: { wood: 40, stone: 20 }, work: 45, wear: 0.6,
    workers: 5, out: { wood: 48 }, outdoor: true, node: 'forest', auto: 'harvesting',
    desc: 'Fells and hauls timber. Must stand near a timber stand.',
  },
  quarry: {
    name: 'Quarry', cat: 'production', w: 3, d: 3, cost: { wood: 60, metal: 10 }, work: 60, wear: 0.7,
    workers: 5, out: { stone: 30 }, outdoor: true, node: 'rock', auto: 'excavation',
    desc: 'Cuts stone from a shelf. Must stand near a stone shelf.',
  },
  mine: {
    name: 'Iron Mine', cat: 'production', w: 3, d: 3, cost: { wood: 100, stone: 80, parts: 10 }, work: 110, wear: 1.0,
    workers: 6, out: { metal: 26 }, power: 2, node: 'ore', auto: 'excavation',
    desc: 'Shaft and headframe on an iron seam. Needs power for hoists and pumps.',
  },
  workshop: {
    name: 'Workshop', cat: 'production', w: 3, d: 2, cost: { wood: 90, stone: 50, metal: 20 }, work: 70, wear: 0.8,
    workers: 4, in: { wood: 6, metal: 5 }, out: { parts: 8 },
    desc: 'Turns timber and iron into machine parts. Also fits Hunter Clicker rigs.',
  },
  fabrication: {
    name: 'Fabrication Plant', cat: 'production', w: 4, d: 3, cost: { wood: 200, stone: 150, metal: 120, parts: 40 }, work: 180, wear: 1.0,
    workers: 6, skilled: 4, strictSkill: true, power: 6, tech: 'fabrication',
    desc: 'Assembles industrial Clickers. Needs skilled workers, power and a parts supply.',
  },
  refinery: {
    name: 'Aether Plant', cat: 'production', w: 4, d: 3, cost: { wood: 180, stone: 160, metal: 140, parts: 50 }, work: 180, wear: 1.1,
    workers: 6, skilled: 3, strictSkill: true, power: 5, in: { water: 10 }, out: { aether: 12 }, node: 'vent', tech: 'aether',
    desc: 'Condenses vent gas into aether cells. Must stand near an aether vent.',
  },
  // ---------- infrastructure ----------
  road: { name: 'Road', cat: 'infra', w: 1, d: 1, line: true, cost: { stone: 1 }, desc: 'Packed road. Buildings linked by road to a warehouse or market move goods three times faster.' },
  pipe: { name: 'Water Main', cat: 'infra', w: 1, d: 1, line: true, cost: { metal: 1 }, desc: 'Carries Heartwell pressure to valve stations and water towers. Can run under roads.' },
  valve: {
    name: 'Valve Station', cat: 'infra', w: 1, d: 1, cost: { stone: 20, metal: 30, parts: 4 }, work: 25, wear: 0.6, waterRadius: 6,
    desc: 'Serves water to buildings within 6 tiles. Must touch a water main.',
  },
  watertower: {
    name: 'Water Tower', cat: 'infra', w: 2, d: 2, cost: { wood: 50, stone: 30, metal: 40 }, work: 50, wear: 0.5, waterRadius: 7, waterCap: 500,
    desc: 'Adds 500 reserve capacity and serves 7 tiles when on the main.',
  },
  pylon: {
    name: 'Power Pylon', cat: 'infra', w: 1, d: 1, cost: { wood: 6, metal: 4 }, work: 6, wear: 0.2, powerRadius: 6,
    desc: 'Relays power 6 tiles. Chain within 9 tiles of a powered pylon or source.',
  },
  generator: {
    name: 'Steam Generator', cat: 'infra', w: 2, d: 2, cost: { wood: 80, stone: 60, metal: 60, parts: 10 }, work: 90, wear: 1.2,
    workers: 2, in: { wood: 14, water: 6 }, gen: 12, powerRadius: 7, tech: 'steam',
    desc: 'Burns timber for 12 power. Its own boiler serves 7 tiles around it.',
  },
  warehouse: {
    name: 'Warehouse', cat: 'infra', w: 3, d: 2, cost: { wood: 80, stone: 40 }, work: 55, wear: 0.3,
    workers: 1, storage: true,
    desc: 'Adds bulk storage and is a drop point for haulers.',
  },
  utility: {
    name: 'Utility Depot', cat: 'infra', w: 3, d: 2, cost: { wood: 90, stone: 60, metal: 50, parts: 10 }, work: 80, wear: 0.4,
    workers: 3,
    desc: 'Maintenance crews keep machinery and homes in repair, using parts.',
  },
  // ---------- civic ----------
  medical: {
    name: 'Medical Post', cat: 'civic', w: 2, d: 2, cost: { wood: 80, stone: 40, metal: 10 }, work: 60, wear: 0.4,
    workers: 2,
    desc: 'Treats heat sickness and cuts deaths. Each medic covers about 30 residents.',
  },
  shade: {
    name: 'Cooling Pavilion', cat: 'civic', w: 2, d: 2, cost: { wood: 40, stone: 30 }, work: 30, wear: 0.3,
    in: { water: 5 }, shadeRadius: 6,
    desc: 'Shaded misting hall. Homes within 6 tiles take much less heat.',
  },
  school: {
    name: 'School', cat: 'civic', w: 3, d: 2, cost: { wood: 120, stone: 60 }, work: 80, wear: 0.3,
    workers: 2,
    desc: 'Trains skilled workers and drives research.',
  },
  office: {
    name: 'Community Office', cat: 'civic', w: 3, d: 2, cost: { wood: 110, stone: 70 }, work: 80, wear: 0.3,
    workers: 2, limit: 1,
    desc: 'Rosters and permits. +8% work efficiency valley-wide and some research.',
  },
  market: {
    name: 'Market', cat: 'civic', w: 3, d: 3, cost: { wood: 100, stone: 40 }, work: 60, wear: 0.3,
    workers: 3, out: { scrip: 10 }, storage: false, dropPoint: true,
    desc: 'Stalls for food and supplies. Lifts morale and earns scrip.',
  },
  betting: {
    name: 'Betting Hall', cat: 'civic', w: 3, d: 2, cost: { wood: 120, stone: 50, metal: 20 }, work: 80, wear: 0.4,
    workers: 2, out: { scrip: 14 }, limit: 1,
    desc: 'Cards, dice and beetle races. Morale, and the house always earns scrip.',
  },
  depot: {
    name: 'Trade Depot', cat: 'civic', w: 3, d: 3, cost: { wood: 140, stone: 80, metal: 40 }, work: 100, wear: 0.5,
    workers: 3, tech: 'trade', dropPoint: true, limit: 2,
    desc: 'Loads rail freight. Each staffed depot adds 160 cargo to every train.',
  },
};

export const BUILD_ORDER = {
  housing: ['frontier', 'settler', 'insulated', 'climate'],
  production: ['hunter', 'farm', 'smokehouse', 'lumber', 'quarry', 'mine', 'workshop', 'fabrication', 'refinery'],
  infra: ['road', 'pipe', 'valve', 'watertower', 'pylon', 'generator', 'warehouse', 'utility'],
  civic: ['medical', 'shade', 'school', 'office', 'market', 'betting', 'depot'],
};

// Staffing priority (lower = filled first)
export const PRIO_ORDER = {
  medical: 1, hunter: 2, farm: 2, generator: 3, smokehouse: 4, lumber: 4, utility: 5, mine: 5, quarry: 6,
  workshop: 6, refinery: 6, fabrication: 7, warehouse: 7, school: 8, office: 8, market: 9, depot: 9, betting: 10,
};

export const HW = {
  ext: { name: 'Extraction', base: 270, workers: [4, 6, 8], power: [6, 9, 12] },
  pur: { name: 'Purification', base: 260, workers: [3, 5, 7], power: [4, 6, 8] },
  tur: { name: 'Power Turbines', base: 11, workers: [3, 4, 5], wood: [8, 11, 14] },
  pool: { name: 'Reserve Pools', cap: [2400, 4000, 6000] },
  mult: [1, 1.6, 2.3],
  turMult: [1, 1.5, 2.1],
  radius: 7, powerRadius: 9,
  upCost: [null, { stone: 150, metal: 120, parts: 30 }, { stone: 300, metal: 260, parts: 80, aether: 30 }],
  upTech: [null, 'deepdrill', 'aquifer'],
  comps: { drill: 'Extraction drill', turA: 'West turbine', turB: 'East turbine', silo: 'Purification silos', pump: 'Hydraulic pumps' },
};

export const CLICKERS = {
  master: { name: 'Master Clicker', desc: 'Builds, repairs and hauls.', aether: 2, cost: { metal: 220, parts: 90, aether: 40 }, work: 160, tech: 'automation', speed: 15, build: 12, repair: 40, load: 50 },
  construction: { name: 'Construction Clicker', desc: 'Builds and upgrades structures.', aether: 1, cost: { metal: 80, parts: 30, aether: 10 }, work: 70, tech: 'fabrication', speed: 15, build: 10 },
  hauler: { name: 'Hauler Clicker', desc: 'Carries goods from worksites to storage.', aether: 1, cost: { metal: 70, parts: 25, aether: 10 }, work: 60, tech: 'fabrication', speed: 18, load: 90 },
  excavation: { name: 'Excavation Clicker', desc: 'Works a quarry or mine like five labourers.', aether: 1.2, cost: { metal: 100, parts: 40, aether: 15 }, work: 80, tech: 'specialists', speed: 12, equiv: 5 },
  harvesting: { name: 'Harvesting Clicker', desc: 'Works a lumber camp like five labourers.', aether: 1, cost: { metal: 80, parts: 30, aether: 12 }, work: 70, tech: 'specialists', speed: 15, equiv: 5 },
  agriculture: { name: 'Agriculture Clicker', desc: 'Works a farm like four labourers.', aether: 1, cost: { metal: 70, parts: 30, aether: 12 }, work: 70, tech: 'specialists', speed: 15, equiv: 4 },
  maintenance: { name: 'Maintenance Clicker', desc: 'Repairs machinery and buildings.', aether: 1, cost: { metal: 60, parts: 40, aether: 15 }, work: 70, tech: 'specialists', speed: 15, repair: 45 },
};
export const RIG_COST = { metal: 10, parts: 12, aether: 3 };

export const TECH = {
  insulation: { name: 'Insulated Homes', rp: 18, cost: { wood: 60, stone: 40 }, desc: 'Unlocks Tier III Insulated Homes and their upgrade.' },
  heatshift: { name: 'Noon Curfew', rp: 10, cost: {}, desc: 'Unlocks the Noon Curfew policy: outdoor crews rest through the worst heat.' },
  medicine: { name: 'Heat Medicine', rp: 16, cost: { food: 40 }, desc: 'Heat sickness spreads 30% slower and medics treat 50% more.' },
  trade: { name: 'Rail Contracts', rp: 14, cost: { wood: 40 }, desc: 'Unlocks the Trade Depot for bulk rail freight.' },
  steam: { name: 'Steam Power', rp: 20, cost: { metal: 40 }, desc: 'Unlocks the Steam Generator.' },
  tools: { name: 'Tempered Tools', rp: 22, cost: { metal: 30, parts: 20 }, desc: '+15% output from lodges, camps, quarries and mines.' },
  irrigation: { name: 'Drip Irrigation', rp: 20, cost: { parts: 10 }, desc: 'Farms use half the water and yield 20% more.' },
  deepdrill: { name: 'Deep Drilling', rp: 28, cost: { metal: 60, parts: 10 }, desc: 'Unlocks Level 2 for every Heartwell system.' },
  cooling: { name: 'Turbine Cooling Loops', rp: 24, cost: { metal: 50, parts: 15 }, req: ['steam'], desc: 'Heartwell machinery takes 40% less heat wear; turbines +15%.' },
  fabrication: { name: 'Clicker Fabrication', rp: 34, cost: { metal: 60, parts: 30 }, req: ['tools'], desc: 'Unlocks the Fabrication Plant with Construction and Hauler Clickers.' },
  aether: { name: 'Aether Refining', rp: 32, cost: { parts: 20 }, req: ['steam'], desc: 'Unlocks the Aether Plant.' },
  specialists: { name: 'Clicker Specialization', rp: 38, cost: { parts: 30, aether: 20 }, req: ['fabrication'], desc: 'Unlocks Excavation, Harvesting, Agriculture and Maintenance Clickers.' },
  climate: { name: 'Climate Control', rp: 44, cost: { parts: 20, aether: 20 }, req: ['insulation', 'aether'], desc: 'Unlocks Tier IV Climate Residences.' },
  aquifer: { name: 'Aquifer Mapping', rp: 50, cost: { parts: 40, aether: 20 }, req: ['deepdrill'], desc: 'Unlocks Level 3 for every Heartwell system.' },
  automation: { name: 'Industrial Automation', rp: 56, cost: { parts: 40, aether: 40 }, req: ['specialists'], desc: 'Clickers work 35% faster. Unlocks further Master Clickers.' },
};
export const TECH_ORDER = ['insulation', 'heatshift', 'medicine', 'trade', 'steam', 'tools', 'irrigation', 'deepdrill', 'cooling', 'fabrication', 'aether', 'specialists', 'climate', 'aquifer', 'automation'];

export const PRICES = { water: 1, food: 2, wood: 1.5, stone: 1.5, metal: 4, parts: 9, aether: 12 };

export const POLICIES = {
  curfew: { name: 'Noon Curfew', tech: 'heatshift', desc: 'Outdoor crews rest at midday in hot weather. −30% outdoor output, far less exposure.' },
  ration: { name: 'Water Rationing', desc: 'Residents draw 25% less water and farms are cut off first. Hurts morale.' },
  feast: { name: 'Extra Rations', desc: 'Residents eat 30% more. Lifts morale and health.' },
};

export const EXPEDITIONS = {
  hunt: { name: 'Long Hunt', crew: 4, days: 2, cost: { food: 12 }, desc: 'A party ranges past the rim for big game.', gain: { food: [70, 120] } },
  salvage: { name: 'Canyon Salvage', crew: 5, days: 3, cost: { food: 20 }, desc: 'Strip an old rail camp for iron and parts.', gain: { metal: [45, 90], parts: [6, 16] } },
  survey: { name: 'Vent Survey', crew: 4, days: 3, cost: { food: 16, parts: 4 }, desc: 'Tap a far vent by hand for aether cells.', gain: { aether: [14, 30] } },
};

export const SEASONS = [
  { from: 0, name: 'Early Spring' }, { from: 6, name: 'Late Spring' }, { from: 12, name: 'High Summer' },
  { from: 20, name: 'Double Noon' }, { from: 30, name: 'Ember Fall' }, { from: 36, name: 'Autumn' }, { from: 42, name: 'Cool Season' },
];

// Base temperature (°C) through the year. Peak grows each year.
export function seasonTemp(dayOfYear, year) {
  const peak = Math.min(57, 46 + year * 2);
  const pts = [[0, 22], [6, 25], [12, 30], [20, 40], [25, peak], [30, 40], [36, 30], [42, 23], [45, 19], [48, 22]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, ta] = pts[i], [b, tb] = pts[i + 1];
    if (dayOfYear <= b) {
      let t = (dayOfYear - a) / (b - a);
      t = t * t * (3 - 2 * t);
      return ta + (tb - ta) * t;
    }
  }
  return 22;
}
export function seasonName(dayOfYear) {
  let n = SEASONS[0].name;
  for (const s of SEASONS) if (dayOfYear >= s.from) n = s.name;
  return n;
}

// Starting settlement layout (core zone). [type, x, z, rot]
export const START_BUILDINGS = [
  ['heartwell', 28, 28, 0],
  ['station', 30, 18, 0],
  ['settler', 22, 22, 0], ['settler', 25, 22, 0], ['frontier', 22, 25, 1], ['frontier', 25, 25, 1],
  ['settler', 37, 38, 2], ['settler', 40, 38, 2], ['frontier', 37, 41, 2], ['frontier', 40, 41, 2],
  ['settler', 22, 40, 3], ['frontier', 25, 40, 3], ['frontier', 28, 40, 2],
  ['hunter', 33, 21, 0],
  ['farm', 38, 31, 0],
  ['smokehouse', 36, 21, 0],
  ['lumber', 22, 32, 1],
  ['quarry', 39, 25, 0],
  ['workshop', 22, 27, 1],
  ['warehouse', 32, 38, 0],
  ['market', 28, 22, 0],
  ['betting', 32, 41, 2],
  ['watertower', 40, 35, 0],
];
export const START_ROADS = [
  // ring road around the Heartwell
  ...line(27, 27, 36, 27), ...line(27, 36, 36, 36), ...line(27, 28, 27, 35), ...line(36, 28, 36, 35),
  // spokes
  ...line(31, 20, 31, 26), ...line(20, 31, 26, 31), ...line(37, 34, 43, 34), ...line(31, 37, 31, 43),
  ...line(24, 21, 24, 27), ...line(25, 27, 26, 27), ...line(21, 24, 23, 24), ...line(25, 24, 26, 24),
  ...line(39, 37, 39, 43), ...line(36, 40, 38, 40), ...line(40, 40, 42, 40), ...line(39, 35, 39, 36),
  ...line(24, 38, 24, 42), ...line(24, 37, 27, 37), ...line(21, 39, 23, 39),
  ...line(32, 23, 38, 23), ...line(38, 24, 38, 30), ...line(37, 30, 37, 30),
];
export const START_PIPES = [...line(36, 34, 39, 34), ...line(39, 35, 39, 35)];

function line(x0, z0, x1, z1) {
  const out = [];
  const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
  let x = x0, z = z0;
  for (;;) {
    out.push([x, z]);
    if (x === x1 && z === z1) break;
    x += dx; z += dz;
  }
  return out;
}
