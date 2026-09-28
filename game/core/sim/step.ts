// Главный шаг: мир(t) + команды → мир(t+1)
import { EVENT_MIN, EVENT_VAR, ENERGY_RATE, OFFER_TTL, MARKET_BASE, type Res } from '../../data/index.ts';
import { ally, type World } from '../world.ts';
import { popOf, onPop, updSettle, chron } from '../civ.ts';
import { done, isAnimal, fmt } from './common.ts';
import { separate } from './movement.ts';
import { resetCrowd } from './economy.ts';
import { updBuilding, remove } from './buildings.ts';
import { updUnit } from './units.ts';
import { win, updGoals, updRegions } from './victory.ts';
import { randomEvent } from './events.ts';
import { type Command, applyCommand } from './commands.ts';

export function step(w: World, cmds: Command[]) {
  w.fx.length = 0;
  resetCrowd(w);
  for (const c of cmds) applyCommand(w, c);
  for (const e of w.ents.values()) {
    if (e.hp <= 0) continue;
    if (e.kind === 'u') updUnit(w, e); else updBuilding(w, e);
  }
  separate(w);
  for (const e of [...w.ents.values()]) if (e.hp <= 0) remove(w, e);

  for (const P of w.players) P.popCap = 0;
  for (const e of w.ents.values()) if (e.kind === 'b' && done(e)) w.players[e.owner].popCap += popOf(w, e);
  for (const P of w.players) { P.popCap = Math.min(w.popMax, P.popCap); onPop(w, P); }

  if (w.tick % 10 === 0 && w.offers.length) w.offers = w.offers.filter((o) => w.tick - o.tick < OFFER_TTL && w.players[o.from].alive && w.players[o.to].alive); // предложения истекают
  if (w.tick % 10 === 0) { updRegions(w); updGoals(w); for (const P of w.players) if (P.alive) updSettle(w, P); }
  if (w.tick % 10 === 0) for (const e of w.ents.values()) if (e.kind === 'b' && e.type === 'power_plant' && done(e)) w.players[e.owner].res.energy += Math.floor((ENERGY_RATE * (100 + w.players[e.owner].mods.energy)) / 100); // электростанции (Термояд — вдвое)
  if (w.tick % 100 === 0) for (const P of w.players) for (const [r, base] of Object.entries(MARKET_BASE) as [Res, number][]) { // цены медленно возвращаются к обычным
    const p = P.prices[r] ?? base;
    P.prices[r] = p + Math.sign(base - p);
  }
  if (w.eventsOn && w.tick >= w.nextEvent) { randomEvent(w); w.nextEvent = w.tick + EVENT_MIN + w.rng.int(EVENT_VAR); }
  if (w.tick % 10 === 0 && w.winner < 0) {
    const has = new Set<number>();
    for (const e of w.ents.values()) if (!isAnimal(e)) has.add(e.owner);
    for (const P of w.players) if (P.alive && !has.has(P.id)) { P.alive = false; chron(w, P.id, 'Цивилизация пала'); w.log.push(`[${fmt(w.tick)}] P${P.id} уничтожен`); }
    const alive = w.players.filter((p) => p.alive);
    if (alive.length && alive.every((p) => ally(w, p.id, alive[0].id))) win(w, alive[0].id, 'mil'); // остались одни союзники
  }
  w.tick++;
}
