// Общее для тестов: мир, поиск и создание сущностей, прогон тиков.
import { createWorld, addBuilding, spawnUnit, canPlace, type World, type Building, type Unit, type WorldOpts } from '../game/core/world.ts';
import { step, type Command } from '../game/core/sim/index.ts';
import { Bot, type Level } from '../game/ai/bot.ts';
import { TILE, BUILDINGS } from '../game/data/index.ts';

export const world = (seed = 1, n = 2, o: WorldOpts = {}) => createWorld(seed, n, 100, 100, { events: false, ...o });
export const tcOf = (w: World, p: number) => [...w.ents.values()].find((e): e is Building => e.kind === 'b' && e.owner === p && e.type === 'town_center')!;
export const unitsOf = (w: World, p: number, type?: string) => [...w.ents.values()].filter((e): e is Unit => e.kind === 'u' && e.owner === p && (!type || e.type === type));

/** Поставить юнит у своей ратуши и (по желанию) перенести в клетку (x, y) */
export function unit(w: World, type: string, p: number, x?: number, y?: number): Unit {
  const u = spawnUnit(w, type, p, tcOf(w, p))!;
  if (x !== undefined && y !== undefined) { u.x = x * TILE + TILE / 2; u.y = y * TILE + TILE / 2; }
  return u;
}
/** Свободное место под здание рядом с ратушей игрока */
export function spot(w: World, p: number, type: string): [number, number] {
  const tc = tcOf(w, p), s = BUILDINGS[type].size;
  for (let r = 3; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = tc.tx + dx, y = tc.ty + dy;
    if (canPlace(w, x, y, s)) return [x, y];
  }
  throw new Error('нет места');
}
export const building = (w: World, type: string, p: number, built = true) => { const [x, y] = spot(w, p, type); return addBuilding(w, type, p, x, y, built); };

export function run(w: World, ticks: number, cmds: Command[] = []) {
  step(w, cmds);
  for (let i = 1; i < ticks; i++) step(w, []);
}

/** Headless-матч ботов, как `npm run demo` */
export function botMatch(seed: number, maxTicks: number, levels: Level[] = ['normal', 'normal']) {
  const w = createWorld(seed, levels.length);
  const bots = w.players.map((p) => new Bot(p.id, levels[p.id]));
  while (w.tick < maxTicks && w.winner < 0) step(w, bots.flatMap((b) => b.think(w)));
  return w;
}
