// Общие помощники симуляции: оплата, выбор своих юнитов/зданий, приказы, эффекты
import { UNITS, BUILDINGS, RES, TILE, type Cost } from '../../data/index.ts';
import { type World, type Unit, type Building, type Entity, type Order, type Fx } from '../world.ts';

export type Gather = Extract<Order, { t: 'gather' }>;

export type Farm = Extract<Order, { t: 'farm' }>;

export type Attack = Extract<Order, { t: 'attack' }>;

export const idle = (): Order => ({ t: 'idle' });

export const afford = (w: World, p: number, c: Cost) => RES.every((r) => w.players[p].res[r] >= (c[r] ?? 0));

export const pay = (w: World, p: number, c: Cost) => { for (const r of RES) w.players[p].res[r] -= c[r] ?? 0; };

export const tileOf = (w: World, u: Unit) => ((u.x / TILE) | 0) + ((u.y / TILE) | 0) * w.W;

export const size = (b: Building) => BUILDINGS[b.type].size;

export const done = (b: Building) => b.progress >= BUILDINGS[b.type].time;

export const isWorker = (u: Unit) => UNITS[u.type].cls === 'worker';

export function mine(w: World, p: number, ids: number[]): Unit[] {
  const out: Unit[] = [];
  for (const id of ids) { const e = w.ents.get(id); if (e && e.kind === 'u' && e.owner === p && !UNITS[e.type].animal) out.push(e); } // коровами не управляют
  return out;
}

export function ownBuilding(w: World, p: number, id: number) {
  const b = w.ents.get(id);
  return b && b.kind === 'b' && b.owner === p && done(b) ? b : null;
}

export function setOrder(u: Unit, o: Order) { u.order = o; u.path = []; u.pkey = -1; u.wait = 0; u.timer = 0; u.sx = NOSPOT; }

export const NOSPOT = -1e9;

export const isAnimal = (e: Entity) => e.kind === 'u' && !!UNITS[e.type].animal;

export function fx(w: World, k: Fx['k'], e: Entity) {
  if (e.kind === 'u') w.fx.push({ k, owner: e.owner, x: e.x, y: e.y, type: e.type, id: e.id });
  else w.fx.push({ k, owner: e.owner, x: (e.tx + size(e) / 2) * TILE, y: (e.ty + size(e) / 2) * TILE, type: e.type, id: e.id });
}

export const fmt = (tick: number) => { const s = Math.floor(tick / 10); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
