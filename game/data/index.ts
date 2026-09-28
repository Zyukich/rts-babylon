// Загрузчик игровых данных: JSON (удобные единицы: секунды, клетки) → внутренние (тики, 1/1000 клетки).
// Здесь же проверка: ошибки в балансе (опечатка в id, неизвестный класс, ресурс или эпоха) видны сразу при запуске,
// а не случайным багом в середине партии. Работает и в браузере, и в Node (сервер, тесты).
import unitsJson from './units.json' with { type: 'json' };
import buildingsJson from './buildings.json' with { type: 'json' };
import techsJson from './techs.json' with { type: 'json' };
import agesJson from './ages.json' with { type: 'json' };
import economyJson from './economy.json' with { type: 'json' };
import settlementsJson from './settlements.json' with { type: 'json' };
import worldJson from './world.json' with { type: 'json' };
import victoryJson from './victory.json' with { type: 'json' };
import cultureJson from './culture.json' with { type: 'json' };
import diplomacyJson from './diplomacy.json' with { type: 'json' };
import aiJson from './ai.json' with { type: 'json' };
import mapJson from './map.json' with { type: 'json' };

// ---------- Базовые перечисления (часть движка, не баланса) ----------
export const TICK_MS = 100; // 10 тиков в секунду
export const TILE = 1000;   // 1 клетка = 1000 единиц: только целые числа → детерминизм
export const RES = ['food', 'wood', 'stone', 'iron', 'gold', 'energy'] as const;
export type Res = (typeof RES)[number];
export type Cost = Partial<Record<Res, number>>;
export const CLASSES = ['worker', 'trade', 'infantry', 'spear', 'ranged', 'cavalry', 'siege', 'armor', 'air', 'building', 'animal'] as const;
export type Cls = (typeof CLASSES)[number];
export type Branch = 'mil' | 'eco' | 'sci' | 'civ';
export const BRANCHES: Branch[] = ['mil', 'eco', 'sci', 'civ'];
// Модификаторы от технологий и культуры (значения — единицы или %)
export const MOD_KEYS = ['atk', 'atkPct', 'armor', 'hp', 'vilHp', 'speed', 'cavSpeed', 'gather', 'farm', 'mine', 'carry', 'research', 'bldHp',
  'housePop', 'tcPop', 'sight', 'range', 'siege', 'ageCost', 'energy'] as const;
export type Mods = Record<(typeof MOD_KEYS)[number], number>;

// ---------- Внутренние типы (то, с чем работает симуляция) ----------
export interface UnitDef {
  name: string; icon: string; cls: Cls; age: number; hp: number; atk: number; armor: number;
  range: number; cd: number; speed: number; sight: number; // range/speed — единицы (1/1000 клетки, за тик), cd — тики, sight — клетки
  cost: Cost; time: number; bonus?: Partial<Record<Cls, number>>; // bonus: % урона по классу
  animal?: boolean; // скот: не занимает население, после гибели — туша с мясом
  air?: boolean;     // летает над водой, горами и стенами; достают только стрелки, башни и зенитки
  hitsAir?: boolean; // может ли бить авиацию (по умолчанию — если стреляет, range > 2000)
  airOnly?: boolean; // бьёт только авиацию (зенитка)
  pierce?: boolean;  // энергетическое оружие: броня цели не учитывается
  noPop?: boolean;   // автономный (дрон): население не занимает, но не больше DRONE_CAP на центр дронов
  splash?: number;   // урон по площади (радиус в единицах): враги рядом с целью получают половину удара
}
export interface BuildingDef {
  name: string; icon: string; age: number; hp: number; armor: number; size: number; cost: Cost; time: number;
  pop?: number; drop?: Res[]; trains?: string[]; atk?: number; range?: number; cd?: number; sight?: number;
}
export interface TechDef { name: string; desc: string; branch: Branch; age: number; cost: Cost; time: number; fx: Partial<Mods>; final?: boolean; }

// ---------- Проверка ----------
const errors: string[] = [];
const fail = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
const ageIds = agesJson.list.map((a) => a.id);
const ageOf = (where: string, id: string) => { const i = ageIds.indexOf(id); if (i < 0) fail(where, `неизвестная эпоха «${id}» (есть: ${ageIds.join(', ')})`); return Math.max(0, i); };
const num = (where: string, v: unknown, min = 0) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min) fail(where, `ожидалось число ≥ ${min}, а не ${JSON.stringify(v)}`); return v as number; };
const cost = (where: string, c: Record<string, number> | undefined): Cost => {
  for (const [r, v] of Object.entries(c ?? {})) { if (!(RES as readonly string[]).includes(r)) fail(where, `неизвестный ресурс «${r}»`); num(`${where}.${r}`, v); }
  return (c ?? {}) as Cost;
};
const ticks = (s: number) => Math.round(s * 10);    // секунды → тики
const units_ = (t: number) => Math.round(t * TILE); // клетки → единицы
const strip = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('$'))) as T; // $comment — пояснения в JSON

// ---------- Юниты ----------
type UnitJson = { name: string; icon: string; class: string; age: string; hp: number; attack: number; armor: number; range: number; reload: number; speed: number; sight: number;
  cost: Record<string, number>; trainTime: number; bonus?: Record<string, number>; animal?: boolean; air?: boolean; hitsAir?: boolean; airOnly?: boolean; pierce?: boolean; noPop?: boolean; splash?: number };
export const UNITS: Record<string, UnitDef> = {};
for (const [id, u] of Object.entries(strip(unitsJson as unknown as Record<string, UnitJson>))) {
  const w = `units.json → ${id}`;
  if (!(CLASSES as readonly string[]).includes(u.class)) fail(w, `неизвестный класс «${u.class}» (есть: ${CLASSES.join(', ')})`);
  for (const [c, v] of Object.entries(u.bonus ?? {})) { if (!(CLASSES as readonly string[]).includes(c)) fail(`${w}.bonus`, `неизвестный класс «${c}»`); num(`${w}.bonus.${c}`, v); }
  for (const k of ['hp', 'attack', 'armor', 'range', 'reload', 'speed', 'sight', 'trainTime'] as const) num(`${w}.${k}`, u[k]);
  if (u.hp <= 0 || u.reload <= 0) fail(w, 'hp и reload должны быть больше нуля');
  const d: UnitDef = { name: u.name, icon: u.icon, cls: u.class as Cls, age: ageOf(w, u.age), hp: u.hp, atk: u.attack, armor: u.armor, range: units_(u.range), cd: ticks(u.reload),
    speed: Math.round(u.speed * 100), sight: u.sight, cost: cost(`${w}.cost`, u.cost), time: ticks(u.trainTime) };
  if (u.bonus) d.bonus = u.bonus as UnitDef['bonus'];
  for (const k of ['animal', 'air', 'airOnly', 'pierce', 'noPop'] as const) if (u[k]) d[k] = true;
  if (u.hitsAir !== undefined) d.hitsAir = u.hitsAir;
  if (u.splash) d.splash = units_(u.splash);
  UNITS[id] = d;
}

// ---------- Здания ----------
type BuildingJson = { name: string; icon: string; age: string; hp: number; armor: number; size: number; cost: Record<string, number>; buildTime: number;
  pop?: number; drop?: string[]; trains?: string[]; attack?: number; range?: number; reload?: number; sight?: number };
export const BUILDINGS: Record<string, BuildingDef> = {};
for (const [id, b] of Object.entries(strip(buildingsJson as unknown as Record<string, BuildingJson>))) {
  const w = `buildings.json → ${id}`;
  for (const k of ['hp', 'armor', 'buildTime'] as const) num(`${w}.${k}`, b[k]);
  num(`${w}.size`, b.size, 1);
  for (const u of b.trains ?? []) if (!UNITS[u]) fail(`${w}.trains`, `нет юнита «${u}» в units.json`);
  for (const r of b.drop ?? []) if (!(RES as readonly string[]).includes(r)) fail(`${w}.drop`, `неизвестный ресурс «${r}»`);
  const d: BuildingDef = { name: b.name, icon: b.icon, age: ageOf(w, b.age), hp: b.hp, armor: b.armor, size: b.size, cost: cost(`${w}.cost`, b.cost), time: ticks(b.buildTime) };
  if (b.pop) d.pop = b.pop;
  if (b.drop) d.drop = b.drop as Res[];
  if (b.trains) d.trains = b.trains;
  if (b.attack) Object.assign(d, { atk: b.attack, range: units_(b.range ?? 0), cd: ticks(b.reload ?? 1) });
  if (b.sight) d.sight = b.sight;
  BUILDINGS[id] = d;
}
for (const need of ['town_center', 'house', 'farm', 'pasture', 'wall', 'gate', 'tower', 'market', 'drone_hub', 'power_plant']) // на них ссылается код
  if (!BUILDINGS[need]) fail('buildings.json', `нужно здание «${need}» — на него завязана логика игры`);
for (const need of ['villager', 'cow']) if (!UNITS[need]) fail('units.json', `нужен юнит «${need}»`);

// ---------- Технологии ----------
type TechJson = { name: string; desc: string; branch: string; age: string; cost: Record<string, number>; researchTime: number; effects: Record<string, number>; final?: boolean };
export const TECHS: Record<string, TechDef> = {};
for (const [id, t] of Object.entries(strip(techsJson as unknown as Record<string, TechJson>))) {
  const w = `techs.json → ${id}`;
  if (!(BRANCHES as string[]).includes(t.branch)) fail(w, `неизвестное направление «${t.branch}» (есть: ${BRANCHES.join(', ')})`);
  for (const k of Object.keys(t.effects)) if (!(MOD_KEYS as readonly string[]).includes(k)) fail(`${w}.effects`, `неизвестный эффект «${k}» (есть: ${MOD_KEYS.join(', ')})`);
  TECHS[id] = { name: t.name, desc: t.desc, branch: t.branch as Branch, age: ageOf(w, t.age), cost: cost(`${w}.cost`, t.cost), time: ticks(num(`${w}.researchTime`, t.researchTime)),
    fx: t.effects as Partial<Mods>, ...(t.final ? { final: true } : {}) };
}
if (!TECHS.enlightenment?.final) fail('techs.json', 'нужна финальная технология «enlightenment» (final: true) — научная победа');

// ---------- Эпохи, экономика, поселения ----------
export const AGE_NAMES = agesJson.list.map((a) => a.name);
export const AGE_COST: Cost[] = agesJson.list.slice(1).map((a, i) => cost(`ages.json → ${agesJson.list[i + 1].id}.cost`, (a as { cost?: Record<string, number> }).cost)); // цена перехода в эпоху i+1
export const AGE_TIME = ticks(agesJson.transitionTime);

const E = economyJson;
export const RES_AMOUNT = Object.fromEntries(RES.map((r) => [r, (E.resources as Record<string, { amountPerTile: number }>)[r]?.amountPerTile ?? 0])) as Record<Res, number>;
export const START_RES = E.startResources as Record<'std' | 'high' | 'max', Record<Res, number>>;
export const GATHER_TICKS = ticks(E.gatherTime);
export const FARM_TICKS = ticks(E.farmTime);
export const CARRY = E.carry, MEAT = E.meatPerCow, FIELD_REACH = E.fieldReach;
export const WHEAT = E.wheat.amountPerPlot, WHEAT_INIT = E.wheat.initialPlots, WHEAT_SOW = E.wheat.plotsPerSowing, WHEAT_TIME = ticks(E.wheat.sowTime);
export const WHEAT_COST: Cost = cost('economy.json → wheat.cost', E.wheat.cost);
export const POP_MAX = E.populationMax, QUEUE_MAX = E.queueMax;
export const MARKET_BASE: Partial<Record<Res, number>> = cost('economy.json → market.basePrice', E.market.basePrice);
export const MARKET_STEP = E.market.step, MARKET_MIN = E.market.min, MARKET_MAX = E.market.max, MARKET_FEE = E.market.sellFeePercent;
export const TRADE_MIN = E.trade.minDistance, TRADE_K = E.trade.goldDivisor, TRADE_FOREIGN = E.trade.foreignPercent;
export const ENERGY_RATE = E.energyPerSecond, DRONE_CAP = E.droneCap;

export const SETTLE = settlementsJson.levels.map((s) => ({ ...s, age: ageOf('settlements.json', s.age) }));
export const SETTLE_GATHER = settlementsJson.gatherBonusPerLevel, SETTLE_HP = settlementsJson.buildingHpBonusPerLevel;

// ---------- Мир: рельеф, регионы, события ----------
export const T_HILL = 3; // код клетки «холм» (0 равнина, 1 вода, 2 горы, 3 холм)
const T = worldJson.terrain;
export const HILL_BONUS = T.hillDamageBonus, COVER_BONUS = T.forestCoverPercent, HILL_SIGHT = T.hillSight, HILL_SPEED = T.hillSpeedPercent;
export type RegionKind = 'plains' | 'forest' | 'quarry' | 'iron';
export const REGION_KINDS = worldJson.regions.kinds as Record<RegionKind, { noun: string; res: Res; desc: string }>;
export const REGION_BONUS = worldJson.regions.bonusPercent;
export const REGION_WEIGHT: Record<string, number> = worldJson.regions.influence;
export const EVENT_MIN = ticks(worldJson.events.interval), EVENT_VAR = ticks(worldJson.events.intervalSpread);
export const MAP = mapJson;
for (const s of MAP.scatter) if (s.res && !(RES as readonly string[]).includes(s.res)) fail('map.json → scatter', `неизвестный ресурс «${s.res}»`);

// ---------- Победа ----------
const V = victoryJson;
export const TERR_SHARE = V.territory.sharePercent, TERR_HOLD = ticks(V.territory.hold);
export const ECO_TARGET = V.economy.target, CULT_TARGET = V.culture.target, FINAL_REQ = V.science.techsRequired;
export const GOAL_HOLD = { eco: ticks(V.economy.hold), cult: ticks(V.culture.hold) };
/** С какой эпохи возможна экономическая и культурная победа */
export const GOAL_MIN_AGE = { eco: ageOf('victory.json → economy.minAge', V.economy.minAge), cult: ageOf('victory.json → culture.minAge', V.culture.minAge) };
export const WIN_NAMES: Record<string, string> = V.names;

// ---------- Культура, дипломатия ----------
export const BRANCH = cultureJson.branches as Record<Branch, { name: string; icon: string; cult: string; title: string }>;
export const CULT_LEVELS = cultureJson.levels, TECH_SLOTS = cultureJson.techSlotsPerAge;
export const REL_NAMES = diplomacyJson.relations;
export const OFFER_TTL = ticks(diplomacyJson.offerTtl);
export const TRIBUTES = diplomacyJson.tributes;

// ---------- Боты ----------
export type Level = 'easy' | 'normal' | 'hard';
type AiLevel = { name: string; every: number; vills: number; wave: number; counters: boolean; towers: number; expand: number; walls: boolean; retreat: boolean; defendVills: boolean; raid: boolean };
const AI_LEVELS = aiJson.levels as Record<Level, AiLevel>;
export const LEVELS = Object.fromEntries(Object.entries(AI_LEVELS).map(([k, v]) => [k, v.name])) as Record<Level, string>;
export const AI_CFG = Object.fromEntries(Object.entries(AI_LEVELS).map(([k, v]) => [k, { ...v, every: ticks(v.every) }])) as Record<Level, AiLevel>;
export const AI_COUNTERS: Record<string, string[]> = aiJson.counters;
export const AI_REGION_VALUE: Record<string, number> = aiJson.regionValue;
export const AI_PERSONALITIES = aiJson.personalities as Branch[];
const AD = aiJson.diplomacy;
/** Дипломатия ботов (ai.json → diplomacy) */
export const AI_DIPLO = { askPeace: AD.askPeace, minArmy: AD.minArmy, minPeace: ticks(AD.minPeace), breakPeace: AD.breakPeace as Record<Branch, number>, attackLeader: AD.attackLeader };
for (const [c, list] of Object.entries(AI_COUNTERS)) for (const u of list) if (!UNITS[u]) fail(`ai.json → counters.${c}`, `нет юнита «${u}»`);

// ---------- Имена для интерфейса и хроники ----------
export const NAMES: Record<string, string> = Object.fromEntries([...Object.entries(UNITS), ...Object.entries(BUILDINGS)].map(([id, d]) => [id, d.name]));

if (errors.length) throw new Error(`Ошибки в игровых данных (game/data):\n  • ${errors.join('\n  • ')}`);
