// Бой: кто кого может бить (авиация), ближайший враг, удар (бонусы, рельеф, укрытие), атака
import { UNITS, BUILDINGS, TILE, T_HILL, HILL_BONUS, COVER_BONUS, type Cls, type UnitDef } from '../../data/index.ts';
import { ally, atWar, type World, type Unit, type Entity, distTo } from '../world.ts';
import { sightOf, onWar } from '../civ.ts';
import { type Attack, idle, tileOf, size, isWorker, setOrder, isAnimal, fx } from './common.ts';
import { approach, moveTo } from './movement.ts';

// ---------- Поиск ----------
// Авиацию бьют только стрелки (range > 2000), башни/центры и зенитки; зенитка бьёт только авиацию. by — атакующий юнит (нет — здание)
export const isAir = (e: Entity) => e.kind === 'u' && !!UNITS[e.type].air;

export function canHit(by: UnitDef | undefined, t: Entity) {
  if (!by) return true;
  const air = isAir(t);
  if (by.airOnly && !air) return false;
  return !air || (by.hitsAir ?? by.range > 2000);
}

export function nearestEnemy(w: World, owner: number, x: number, y: number, range: number, unitsOnly = false, by?: UnitDef): Entity | null {
  let best: Entity | null = null, bd = Infinity;
  for (const e of w.ents.values()) {
    if (!atWar(w, e.owner, owner) || e.hp <= 0 || (unitsOnly && e.kind === 'b') || isAnimal(e) || !canHit(by, e)) continue; // сами бьём только тех, с кем война
    const d = distTo(x, y, e);
    if (d > range) continue;
    const score = d + (e.kind === 'b' ? 3 * TILE : 0); // юниты приоритетнее зданий
    if (score < bd) { bd = score; best = e; }
  }
  return best;
}

// ---------- Бой ----------
export const onHill = (w: World, x: number, y: number) => w.terrain[((x / TILE) | 0) + ((y / TILE) | 0) * w.W] === T_HILL;

export function inCover(w: World, u: Unit) { // рядом ≥2 деревьев — стрелы летят мимо
  const tx = (u.x / TILE) | 0, ty = (u.y / TILE) | 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.resType[tx + dx + (ty + dy) * w.W] === 2) n++;
  return n >= 2;
}

export function hit(w: World, src: { atk?: number; bonus?: Partial<Record<Cls, number>>; pierce?: boolean }, t: Entity, by: number, military: boolean, ax: number, ay: number, ranged: boolean) {
  const m = w.players[by].mods, tm = w.players[t.owner].mods;
  const cls: Cls = t.kind === 'u' ? UNITS[t.type].cls : 'building';
  const armor = src.pierce ? 0 : t.kind === 'u' ? UNITS[t.type].armor + (cls !== 'worker' ? tm.armor : 0) : BUILDINGS[t.type].armor; // энергетическое оружие броню не замечает
  const mult = (src.bonus?.[cls] ?? 100) + (cls === 'building' ? m.siege : 0);
  const atk = (src.atk ?? 0) + (military ? m.atk : 0);
  let pct = 100 + (military ? m.atkPct : 0);
  const [tx, ty] = t.kind === 'u' ? [t.x, t.y] : [t.tx * TILE + TILE / 2, t.ty * TILE + TILE / 2];
  if (onHill(w, ax, ay) && !onHill(w, tx, ty)) pct += HILL_BONUS;
  if (ranged && t.kind === 'u' && inCover(w, t)) pct -= COVER_BONUS;
  t.hp -= Math.max(1, Math.floor((atk * mult * pct) / 10000) - armor);
  t.lastBy = by;
  if (!ally(w, by, t.owner)) onWar(w, by, t.owner);
  if (ranged) w.fx.push({ k: 'shot', owner: by, x: ax, y: ay, tx, ty }); // стрела — для отрисовки
  fx(w, 'hit', t);
}

export function attack(w: World, u: Unit, o: Attack) {
  const d = UNITS[u.type];
  let t = w.ents.get(o.target);
  if (!t && isWorker(u)) { // добыча убита — разделываем тушу
    const ct = w.carcass.get(o.target);
    if (ct !== undefined && w.resType[ct]) return setOrder(u, { t: 'gather', tile: ct, back: false });
  }
  if (t && t.hp <= 0 && isAnimal(t)) return; // туша появится в конце тика
  if (t && !canHit(d, t)) t = undefined; // эту цель нам не достать (самолёт для мечника, пехота для зенитки)
  if (t && !isAnimal(t) && !atWar(w, u.owner, t.owner)) t = undefined; // заключили мир — бой прекращается
  if (!t || t.hp <= 0) {
    const e = nearestEnemy(w, u.owner, u.x, u.y, sightOf(w, u), false, UNITS[u.type]);
    if (!e) return setOrder(u, o.ax !== undefined ? { t: 'amove', x: o.ax, y: o.ay! } : idle());
    o.target = e.id; t = e;
  }
  if (distTo(u.x, u.y, t) <= d.range) {
    u.path.length = 0;
    if (!u.cd) {
      hit(w, d, t, u.owner, d.cls !== 'worker', u.x, u.y, d.range > 2000); u.cd = d.cd;
      if (d.splash) { // залп по площади: остальные враги рядом с целью — половина удара
        const [cx, cy] = t.kind === 'u' ? [t.x, t.y] : [t.tx * TILE + TILE / 2, t.ty * TILE + TILE / 2], half = { atk: d.atk >> 1, bonus: d.bonus };
        for (const e of w.ents.values()) if (e !== t && e.hp > 0 && atWar(w, e.owner, u.owner) && !isAnimal(e) && canHit(d, e) && distTo(cx, cy, e) <= d.splash) hit(w, half, e, u.owner, true, u.x, u.y, false);
      }
    }
    return;
  }
  if (t.kind === 'u') {
    const tt = tileOf(w, t);
    if (moveTo(w, u, tt % w.W, (tt / w.W) | 0, 1, 1)) approach(w, u, t.x, t.y); // вплотную — доходим напрямую
  } else moveTo(w, u, t.tx, t.ty, size(t), size(t));
}
