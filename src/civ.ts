// Цивилизация: направления развития, культура и хроника.
// Идея: два игрока одной эпохи расходятся. Слотов исследований мало — приходится выбирать направление,
// а культура растёт от поведения (воюешь — военная, добываешь — торговая…) и сама даёт бонусы.
import { UNITS, BUILDINGS, AGE_COST, AGE_NAMES, GATHER_TICKS, FARM_TICKS, CARRY, TILE, T_HILL, HILL_SIGHT, HILL_SPEED, REGION_KINDS, REGION_BONUS, type Cost, type Res } from './defs.ts';

const hillAt = (w: World, u: Unit) => w.terrain[((u.x / TILE) | 0) + ((u.y / TILE) | 0) * w.W] === T_HILL;
import type { World, Player, Unit, Entity, Building } from './world.ts';

export type Branch = 'mil' | 'eco' | 'sci' | 'civ';
export const BRANCHES: Branch[] = ['mil', 'eco', 'sci', 'civ'];
export const BRANCH: Record<Branch, { name: string; icon: string; cult: string; title: string }> = {
  mil: { name: 'Военное', icon: '⚔', cult: 'военная', title: 'Воинственная' },
  eco: { name: 'Экономическое', icon: '💰', cult: 'торговая', title: 'Торговая' },
  sci: { name: 'Научное', icon: '📚', cult: 'научная', title: 'Учёная' },
  civ: { name: 'Гражданское', icon: '🏛', cult: 'гражданская', title: 'Созидающая' },
};

export interface Mods {
  atk: number; atkPct: number; armor: number; hp: number; vilHp: number; speed: number; cavSpeed: number;
  gather: number; farm: number; mine: number; carry: number; research: number; bldHp: number;
  housePop: number; tcPop: number; sight: number; range: number; siege: number; ageCost: number;
}
export const baseMods = (): Mods => ({
  atk: 0, atkPct: 0, armor: 0, hp: 0, vilHp: 0, speed: 0, cavSpeed: 0, gather: 0, farm: 0, mine: 0, carry: 0,
  research: 0, bldHp: 0, housePop: 0, tcPop: 0, sight: 0, range: 0, siege: 0, ageCost: 0,
});
export interface Stats { gathered: number; trained: number; kills: number; lost: number; built: number; }
export const baseStats = (): Stats => ({ gathered: 0, trained: 0, kills: 0, lost: 0, built: 0 });
export interface Chron { tick: number; p: number; text: string; }

export interface TechDef { branch: Branch; age: number; name: string; desc: string; cost: Cost; time: number; fx: Partial<Mods>; final?: boolean; }
export const TECHS: Record<string, TechDef> = {
  bronze:    { branch: 'mil', age: 0, name: 'Бронзовые наконечники', desc: '+1 к атаке войск',        cost: { food: 100, wood: 60 },  time: 300, fx: { atk: 1 } },
  drill:     { branch: 'mil', age: 0, name: 'Строевая подготовка',   desc: '+15% здоровья войск',     cost: { food: 150 },            time: 300, fx: { hp: 15 } },
  ironarms:  { branch: 'mil', age: 1, name: 'Железное оружие',       desc: '+2 к атаке войск',        cost: { food: 150, iron: 100 }, time: 400, fx: { atk: 2 } },
  stirrups:  { branch: 'mil', age: 1, name: 'Стремена',              desc: '+20% скорости конницы',   cost: { food: 200, wood: 100 }, time: 400, fx: { cavSpeed: 20 } },
  plate:     { branch: 'mil', age: 2, name: 'Латы',                  desc: '+2 к броне войск',        cost: { food: 200, iron: 200 }, time: 500, fx: { armor: 2 } },
  tools:     { branch: 'eco', age: 0, name: 'Каменные орудия',       desc: '+20% скорости добычи',    cost: { food: 100, wood: 50 },  time: 300, fx: { gather: 20 } },
  baskets:   { branch: 'eco', age: 0, name: 'Корзины',               desc: '+5 к переносимому',       cost: { wood: 100 },            time: 250, fx: { carry: 5 } },
  plough:    { branch: 'eco', age: 1, name: 'Плуг',                  desc: '+35% урожая ферм',        cost: { food: 150, wood: 150 }, time: 400, fx: { farm: 35 } },
  shafts:    { branch: 'eco', age: 1, name: 'Шахты',                 desc: '+35% добычи камня и железа', cost: { wood: 200 },         time: 400, fx: { mine: 35 } },
  guilds:    { branch: 'eco', age: 2, name: 'Гильдии',               desc: '+25% скорости добычи',    cost: { food: 300, stone: 100 }, time: 500, fx: { gather: 25 } },
  writing:   { branch: 'sci', age: 0, name: 'Письменность',          desc: '−25% времени исследований', cost: { food: 120 },          time: 250, fx: { research: 25 } },
  astronomy: { branch: 'sci', age: 1, name: 'Астрономия',            desc: '+2 к обзору',             cost: { food: 150, stone: 50 }, time: 350, fx: { sight: 2 } },
  geometry:  { branch: 'sci', age: 1, name: 'Геометрия',             desc: '+1 к дальности башен и центров', cost: { wood: 150, stone: 100 }, time: 400, fx: { range: 1 } },
  engineering: { branch: 'sci', age: 2, name: 'Инженерия',           desc: '+50% урона по зданиям',   cost: { wood: 200, stone: 150 }, time: 500, fx: { siege: 50 } },
  masonry:   { branch: 'civ', age: 0, name: 'Каменная кладка',       desc: '+30% прочности зданий',   cost: { stone: 100 },           time: 300, fx: { bldHp: 30 } },
  housing:   { branch: 'civ', age: 0, name: 'Общинные дома',         desc: '+3 жителя на дом',        cost: { wood: 120 },            time: 250, fx: { housePop: 3 } },
  roads:     { branch: 'civ', age: 1, name: 'Дороги',                desc: '+10% скорости всех юнитов', cost: { wood: 150, stone: 100 }, time: 400, fx: { speed: 10 } },
  calendar:  { branch: 'civ', age: 1, name: 'Календарь',             desc: '−20% цены следующей эпохи', cost: { food: 200 },          time: 300, fx: { ageCost: 20 } },
  law:       { branch: 'civ', age: 2, name: 'Свод законов',          desc: '+10 мест у центра, +50% здоровья жителей', cost: { food: 200, stone: 200 }, time: 500, fx: { tcPop: 10, vilHp: 50 } },
  enlightenment: { branch: 'sci', age: 2, name: 'Просвещение', desc: 'Научная победа. Нужно 5 технологий; 3 минуты, центр должен уцелеть', cost: { food: 1000, stone: 400, iron: 400 }, time: 1800, fx: {}, final: true },
};
export const TECH_SLOTS = 3;           // исследований на эпоху: всё сразу не открыть
const CULT_LEVELS = [15, 45, 100];     // очки культуры для уровней 1..3

export const NAMES: Record<string, string> = {
  villager: 'Житель', clubman: 'Дубинщик', spearman: 'Копейщик', archer: 'Лучник', swordsman: 'Мечник', horseman: 'Всадник', ram: 'Таран',
  town_center: 'Центр', house: 'Дом', farm: 'Поле пшеницы', camp: 'Лагерь', barracks: 'Казармы', archery: 'Стрельбище', tower: 'Башня', stable: 'Конюшня', workshop: 'Мастерская', wall: 'Стена', gate: 'Ворота', pasture: 'Ферма', cow: 'Корова',
};

export const year = (tick: number) => Math.floor(tick / 100) + 1; // 10 секунд = 1 год
export const chron = (w: World, p: number, text: string) => {
  w.chron.push({ tick: w.tick, p, text });
  if (p < 0) w.fx.push({ k: 'news', owner: -1, x: 0, y: 0 }); // общее событие — всем на экран
};
export function once(w: World, P: Player, flag: string, text: string) { if (!P.flags[flag]) { P.flags[flag] = true; chron(w, P.id, text); } }
export const cultureLevel = (P: Player, b: Branch) => CULT_LEVELS.filter((t) => P.culture[b] >= t).length;
export function identity(P: Player) {
  const best = BRANCHES.reduce((a, b) => (P.culture[b] > P.culture[a] ? b : a));
  return cultureLevel(P, best) ? BRANCH[best].title : 'Юная';
}

export function recalc(P: Player) {
  const m = baseMods();
  for (const id of P.techs) for (const [k, v] of Object.entries(TECHS[id].fx)) m[k as keyof Mods] += v!;
  m.atkPct += 5 * cultureLevel(P, 'mil');
  m.gather += 7 * cultureLevel(P, 'eco');
  m.research = Math.min(60, m.research + 10 * cultureLevel(P, 'sci'));
  m.bldHp += 10 * cultureLevel(P, 'civ');
  P.mods = m;
}

// ---------- Характеристики с учётом технологий и культуры ----------
export function maxHp(w: World, e: Entity) {
  const m = w.players[e.owner].mods;
  if (e.kind === 'b') return Math.floor((BUILDINGS[e.type].hp * (100 + m.bldHp)) / 100);
  const d = UNITS[e.type];
  return Math.floor((d.hp * (100 + (d.cls === 'worker' ? m.vilHp : m.hp))) / 100);
}
export function speedOf(w: World, u: Unit) {
  const m = w.players[u.owner].mods, d = UNITS[u.type];
  const sp = Math.floor((d.speed * (100 + m.speed + (d.cls === 'cavalry' ? m.cavSpeed : 0))) / 100);
  return hillAt(w, u) ? Math.floor((sp * HILL_SPEED) / 100) : sp;
}
export const sightOf = (w: World, u: Unit) => (UNITS[u.type].sight + w.players[u.owner].mods.sight + (hillAt(w, u) ? HILL_SIGHT : 0)) * TILE;
export const carryOf = (w: World, u: Unit) => CARRY + w.players[u.owner].mods.carry;
export function gatherTicks(w: World, p: number, r: Res | 'farm', tile = -1) {
  const m = w.players[p].mods, reg = tile >= 0 ? w.regions[w.region[tile]] : null;
  let bonus = m.gather + (r === 'farm' ? m.farm : r === 'stone' || r === 'iron' ? m.mine : 0);
  if (reg && reg.owner === p && REGION_KINDS[reg.kind].res === (r === 'farm' ? 'food' : r)) bonus += REGION_BONUS; // бонус своего региона
  let t = Math.floor(((r === 'farm' ? FARM_TICKS : GATHER_TICKS) * 100) / (100 + bonus));
  const P = w.players[p];
  if (r === 'farm' || r === 'food') { // события: засуха / урожайные годы
    if ((P.effects.drought ?? 0) > w.tick) t *= 2;
    if ((P.effects.harvest ?? 0) > w.tick) t = Math.floor((t * 2) / 3);
  }
  return Math.max(2, t);
}
export const researchTime = (P: Player, id: string) => (TECHS[id].final ? TECHS[id].time : Math.floor((TECHS[id].time * (100 - P.mods.research)) / 100)); // «Просвещение» не ускоряется — у врага должно быть время
export function ageCost(P: Player): Cost | undefined {
  const c = AGE_COST[P.age];
  if (!c) return undefined;
  const out: Cost = {};
  for (const [r, v] of Object.entries(c)) out[r as Res] = Math.floor((v! * (100 - P.mods.ageCost)) / 100);
  return out;
}
export function popOf(w: World, b: Building) {
  const d = BUILDINGS[b.type], m = w.players[b.owner].mods;
  return d.pop ? d.pop + (b.type === 'house' ? m.housePop : b.type === 'town_center' ? m.tcPop : 0) : 0;
}
export function queuedTechs(w: World, p: number) {
  const out: string[] = [];
  for (const e of w.ents.values()) if (e.kind === 'b' && e.owner === p) for (const q of e.queue) if (q[0] === '@') out.push(q.slice(1));
  return out;
}
export const slotsLeft = (w: World, P: Player) => TECH_SLOTS * (P.age + 1) + P.bonusSlots - P.techs.length - queuedTechs(w, P.id).filter((id) => !TECHS[id].final).length;

// ---------- События: культура растёт от поведения, всё важное пишется в хронику ----------
export function addCulture(w: World, P: Player, b: Branch, n: number) {
  const before = cultureLevel(P, b);
  P.culture[b] += n;
  const after = cultureLevel(P, b);
  if (after > before) {
    recalc(P);
    chron(w, P.id, after === 1 ? `Зародилась ${BRANCH[b].cult} культура` : `${BRANCH[b].cult[0].toUpperCase() + BRANCH[b].cult.slice(1)} культура достигла ${after}-го уровня`);
  }
}
export function research(w: World, P: Player, id: string) {
  const before = new Map<number, number>();
  for (const e of w.ents.values()) if (e.owner === P.id) before.set(e.id, maxHp(w, e));
  P.techs.push(id);
  recalc(P);
  for (const e of w.ents.values()) if (e.owner === P.id) e.hp += Math.max(0, maxHp(w, e) - before.get(e.id)!);
  chron(w, P.id, `Изобретено: ${TECHS[id].name}`);
  addCulture(w, P, 'sci', 4);
}
export function onAge(w: World, P: Player) { chron(w, P.id, `Наступила ${AGE_NAMES[P.age]} эпоха`); addCulture(w, P, 'sci', 8); }
export function onGathered(w: World, P: Player, r: Res, n: number) {
  P.stats.gathered += n;
  P.econAcc += n;
  while (P.econAcc >= 100) { P.econAcc -= 100; addCulture(w, P, 'eco', 1); }
  if (r === 'iron') once(w, P, 'iron', 'Найдено железо');
  if (r === 'stone') once(w, P, 'stone', 'Начата добыча камня');
}
export function onBuilt(w: World, b: Building) {
  const P = w.players[b.owner];
  P.stats.built++;
  addCulture(w, P, 'civ', b.type === 'house' || b.type === 'farm' ? 1 : 2);
  if (b.type === 'farm') once(w, P, 'farm', 'Распахано первое поле');
  else if (b.type !== 'house') once(w, P, 'b_' + b.type, `Построено: ${NAMES[b.type]}`);
}
export function onTrained(w: World, P: Player, u: Unit) {
  P.stats.trained++;
  if (UNITS[u.type].cls !== 'worker' && !UNITS[u.type].animal) { addCulture(w, P, 'mil', 1); once(w, P, 'army', 'Собрана первая дружина'); }
}
export function onRemoved(w: World, e: Entity) {
  const P = w.players[e.owner];
  if (e.kind === 'u') P.stats.lost++;
  if (e.lastBy < 0 || e.lastBy === e.owner) return;
  const K = w.players[e.lastBy];
  if (e.kind === 'u') { K.stats.kills++; addCulture(w, K, 'mil', 1); }
  else {
    addCulture(w, K, 'mil', 3);
    if (e.type === 'town_center') { chron(w, K.id, `Пала столица P${e.owner}`); chron(w, P.id, 'Потеряна столица'); }
  }
}
export function onWar(w: World, a: number, b: number) {
  once(w, w.players[a], 'war' + b, `Началась война с P${b}`);
  once(w, w.players[b], 'war' + a, `P${a} напал на нас`);
}
export function onPop(w: World, P: Player) {
  for (const m of [20, 40, 60, 100]) if (P.pop >= m) once(w, P, 'pop' + m, `Население достигло ${m}`);
}
