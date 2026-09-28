// Поведение юнитов по приказу: бездействие, движение, атака, добыча, поля, торговля
import { UNITS, TILE, TRADE_K, TRADE_FOREIGN } from '../../data/index.ts';
import { type World, type Unit, type Building, distTo } from '../world.ts';
import { sightOf, onGathered } from '../civ.ts';
import { idle, tileOf, size, setOrder } from './common.ts';
import { approach, moveTo } from './movement.ts';
import { nearestEnemy, attack } from './combat.ts';
import { gather, farm, marketDist } from './economy.ts';
import { build } from './buildings.ts';

export function updUnit(w: World, u: Unit) {
  const d = UNITS[u.type], o = u.order;
  if (u.cd > 0) u.cd--;
  switch (o.t) {
    case 'trade': { // рейс: до чужого рынка → с золотом домой → снова
      const home = w.ents.get(o.home), dest = w.ents.get(o.dest);
      if (!home || !dest || home.kind !== 'b' || dest.kind !== 'b' || home.hp <= 0 || dest.hp <= 0) { setOrder(u, idle()); break; }
      const t = o.leg ? home : dest, s = size(t);
      if (!moveTo(w, u, t.tx, t.ty, s, s)) break;
      if (!o.leg) { // у чужого рынка: грузим золото — его ещё надо довезти
        const g = Math.floor((marketDist(home, dest) ** 2) / TRADE_K);
        u.carry = dest.owner !== u.owner ? Math.floor((g * TRADE_FOREIGN) / 100) : g; // чужой рынок — выгоднее (economy.json → trade.foreignPercent) u.carryRes = 'gold'; o.leg = 1;
      } else {
        const P = w.players[u.owner];
        if (u.carry) { P.res.gold += u.carry; P.stats.gathered += u.carry; onGathered(w, P, 'gold', u.carry); }
        u.carry = 0; u.carryRes = null; o.leg = 0;
      }
      u.path = []; u.pkey = -1;
      break;
    }
    case 'idle':
      if (u.oq.length) { setOrder(u, u.oq.shift()!); break; } // следующий приказ из очереди
      if (d.animal) { // скот бродит у своего загона
        if ((w.tick + u.id * 7) % 60 === 0) {
          let pen: Building | null = null, bd = Infinity;
          for (const e of w.ents.values()) if (e.kind === 'b' && e.owner === u.owner && e.type === 'pasture') { const dd = distTo(u.x, u.y, e); if (dd < bd) { bd = dd; pen = e; } }
          if (pen) {
            const hs = (Math.imul(u.id, 2654435761) ^ Math.imul(w.tick, 40503)) >>> 0, s = size(pen) + 4;
            setOrder(u, { t: 'move', x: Math.max(0, Math.min(w.W - 1, pen.tx - 2 + (hs % s))), y: Math.max(0, Math.min(w.H - 1, pen.ty - 2 + ((hs >>> 8) % s))) });
          }
        }
        break;
      }
      if (d.cls !== 'worker' && (w.tick + u.id) % 5 === 0) { // автоагрессия
        const e = nearestEnemy(w, u.owner, u.x, u.y, sightOf(w, u), false, UNITS[u.type]);
        if (e) setOrder(u, { t: 'attack', target: e.id });
      }
      break;
    case 'move': // дошли до клетки — встаём в её центр: так строй держит форму и соседи не расталкивают друг друга
      if (moveTo(w, u, o.x, o.y, 1, 1, true) && (tileOf(w, u) !== o.x + o.y * w.W || approach(w, u, o.x * TILE + TILE / 2, o.y * TILE + TILE / 2))) setOrder(u, idle());
      break;
    case 'amove': // идём, но бьём всех встречных, потом продолжаем путь
      if ((w.tick + u.id) % 5 === 0) {
        const e = nearestEnemy(w, u.owner, u.x, u.y, sightOf(w, u), false, UNITS[u.type]);
        if (e) { setOrder(u, { t: 'attack', target: e.id, ax: o.x, ay: o.y }); break; }
      }
      if (moveTo(w, u, o.x, o.y, 1, 1, true)) setOrder(u, idle());
      break;
    case 'gather': gather(w, u, o); break;
    case 'build': build(w, u, o.target); break;
    case 'farm': farm(w, u, o); break;
    case 'attack': attack(w, u, o); break;
  }
}
