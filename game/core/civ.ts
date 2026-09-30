// Цивилизация: направления развития, культура и хроника.
// Идея: два игрока одной эпохи расходятся. Слотов исследований мало — приходится выбирать направление,
// а культура растёт от поведения (воюешь — военная, добываешь — торговая…) и сама даёт бонусы.
import { TECHS, BRANCH, BRANCHES, TECH_SLOTS, CULT_LEVELS, NAMES, MOD_KEYS, type Mods, type Branch, type TechDef, SETTLE, SETTLE_GATHER, SETTLE_HP, UNITS, BUILDINGS, AGE_COST, AGE_NAMES, GATHER_TICKS, FARM_TICKS, CARRY, TILE, T_HILL, HILL_SIGHT, HILL_SPEED, REGION_KINDS, REGION_BONUS, type Cost, type Res } from '../data/index.ts';
export { TECHS, BRANCH, BRANCHES, TECH_SLOTS, NAMES, type Mods, type Branch, type TechDef }; // данные — из game/data, здесь реэкспорт для старых импортов

const hillAt = (w: World, u: Unit) => w.terrain[((u.x / TILE) | 0) + ((u.y / TILE) | 0) * w.W] === T_HILL;
import type { World, Player, Unit, Entity, Building } from './world.ts';


export const baseMods = (): Mods => Object.fromEntries(MOD_KEYS.map((k) => [k, 0])) as Mods;
export interface Stats { gathered: number; trained: number; kills: number; lost: number; built: number; }
export const baseStats = (): Stats => ({ gathered: 0, trained: 0, kills: 0, lost: 0, built: 0 });
/** Запись хроники. У событий мира (p < 0): kind — вид (для значка), who — кого касается, x/y — где (клетка), until — до какого тика действует */
export interface Chron { tick: number; p: number; text: string; kind?: string; who?: number; x?: number; y?: number; until?: number }
export type ChronExtra = Pick<Chron, 'kind' | 'who' | 'x' | 'y' | 'until'>;



export const year = (tick: number) => Math.floor(tick / 100) + 1; // 10 секунд = 1 год
export const chron = (w: World, p: number, text: string, extra?: ChronExtra) => {
  w.chron.push({ tick: w.tick, p, text, ...extra });
  if (p < 0) w.fx.push({ k: 'news', owner: -1, x: 0, y: 0 }); // общее событие — всем на экран
};
export function once(w: World, P: Player, flag: string, text: string) { if (!P.flags[flag]) { P.flags[flag] = true; chron(w, P.id, text); } }
export const cultureLevel = (P: Player, b: Branch) => CULT_LEVELS.filter((t) => P.culture[b] >= t).length;
export function identity(P: Player) {
  const best = BRANCHES.reduce((a, b) => (P.culture[b] > P.culture[a] ? b : a));
  return cultureLevel(P, best) ? BRANCH[best].title : 'Юная';
}

/** Пересчитать бонусы игрока. С w — заодно поднять здоровье его юнитов и зданий, если вырос максимум
 *  (иначе после роста поселения или технологии на прочность всё выглядело бы повреждённым) */
export function recalc(P: Player, w?: World) {
  const old = w ? new Map([...w.ents.values()].filter((e) => e.owner === P.id).map((e) => [e.id, maxHp(w, e)])) : null;
  const m = baseMods();
  for (const id of P.techs) for (const [k, v] of Object.entries(TECHS[id].fx)) m[k as keyof Mods] += v!;
  m.atkPct += 5 * cultureLevel(P, 'mil');
  m.gather += 7 * cultureLevel(P, 'eco');
  m.research = Math.min(60, m.research + 10 * cultureLevel(P, 'sci'));
  m.bldHp += 10 * cultureLevel(P, 'civ');
  m.gather += SETTLE_GATHER * P.settle; m.bldHp += SETTLE_HP * P.settle; // рост поселения
  P.mods = m;
  if (w && old) for (const [id, was] of old) {
    const e = w.ents.get(id)!, now = maxHp(w, e);
    if (now === was || e.hp <= 0) continue; // погибший в этом тике не оживает
    if (e.kind === 'b' && e.progress < BUILDINGS[e.type].time) e.hp = Math.min(now, Math.max(1, Math.round((e.hp * now) / was))); // стройка — пропорционально
    else e.hp = Math.max(1, Math.min(now, e.hp + now - was)); // рост максимума — прибавка к здоровью; падение — не выше нового максимума
  }
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
  let bonus = m.gather + (r === 'farm' ? m.farm : r === 'stone' || r === 'iron' || r === 'gold' ? m.mine : 0);
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
    recalc(P, w);
    chron(w, P.id, after === 1 ? `Зародилась ${BRANCH[b].cult} культура` : `${BRANCH[b].cult[0].toUpperCase() + BRANCH[b].cult.slice(1)} культура достигла ${after}-го уровня`);
  }
}
export function research(w: World, P: Player, id: string) {
  const before = new Map<number, number>();
  for (const e of w.ents.values()) if (e.owner === P.id) before.set(e.id, maxHp(w, e));
  P.techs.push(id);
  recalc(P, w);
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
  if (r === 'gold') once(w, P, 'gold', 'Добыто первое золото');
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
// Рост поселения: только вверх, по одному уровню за проверку; событие — в хронику
export function updSettle(w: World, P: Player) {
  const next = SETTLE[P.settle + 1];
  if (!next || P.pop < next.pop || P.age < next.age) return;
  let n = 0;
  for (const e of w.ents.values()) if (e.kind === 'b' && e.owner === P.id && e.type !== 'wall' && e.type !== 'gate' && e.progress >= BUILDINGS[e.type].time) n++;
  if (n < next.blds) return;
  P.settle++;
  recalc(P, w);
  chron(w, P.id, `${SETTLE[P.settle - 1].name} ${SETTLE[P.settle - 1].grew} в ${next.into}`);
  addCulture(w, P, 'civ', 5);
}
export function onPop(w: World, P: Player) {
  for (const m of [20, 40, 60, 100]) if (P.pop >= m) once(w, P, 'pop' + m, `Население достигло ${m}`);
}
