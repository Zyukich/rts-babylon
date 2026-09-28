// Здания: стройка и ремонт, очереди (обучение, исследования, эпоха, посев), снос
import { UNITS, BUILDINGS, RES, TILE, AGE_TIME, AGE_NAMES, WHEAT_INIT, WHEAT_SOW, WHEAT_TIME, type Res } from '../../data/index.ts';
import { type World, type Unit, type Building, type Entity, spawnUnit, distTo } from '../world.ts';
import { TECHS, maxHp, researchTime, research, onAge, onBuilt, onTrained, onRemoved } from '../civ.ts';
import { idle, size, done, isWorker, setOrder, fx, fmt } from './common.ts';
import { moveTo, hugRect } from './movement.ts';
import { nearestEnemy, hit } from './combat.ts';
import { sowWheat, carcass, findRes, farmer } from './economy.ts';
import { win } from './victory.ts';

export function build(w: World, u: Unit, target: number) {
  const b = w.ents.get(target);
  if (!b || b.kind !== 'b') return setOrder(u, idle());
  const d = BUILDINGS[b.type];
  const P = w.players[u.owner];
  if (done(b) && b.hp > 0 && b.hp < maxHp(w, b)) { // ремонт: полный стоит половину цены здания в его главном ресурсе
    if (!moveTo(w, u, b.tx, b.ty, d.size, d.size) || !hugRect(w, u, b)) return;
    const mh = maxHp(w, b), heal = Math.max(1, Math.ceil(mh / (d.time * 2)));
    const main = (Object.keys(d.cost)[0] ?? 'wood') as Res, per = Math.max(1, Math.floor((mh * 2) / Math.max(1, d.cost[main] ?? 1)));
    b.rep += heal;
    while (b.rep >= per) {
      if (P.res[main] <= 0) return setOrder(u, idle()); // нечем чинить
      P.res[main]--;
      b.rep -= per;
    }
    b.hp = Math.min(mh, b.hp + heal);
    return;
  }
  if (done(b)) { // достроили склад — сразу добываем рядом
    if (b.type === 'wall' || b.type === 'gate') { // стену строим дальше: ближайший недостроенный сегмент
      let nb: Building | null = null, bd = 13 * TILE;
      for (const e of w.ents.values())
        if (e.kind === 'b' && e.owner === u.owner && (e.type === 'wall' || e.type === 'gate') && !done(e)) {
          const dd = distTo(u.x, u.y, e);
          if (dd < bd) { bd = dd; nb = e; }
        }
      if (nb) return setOrder(u, { t: 'build', target: nb.id });
    }
    if (b.type === 'farm' && !farmer(w, b.id)) return setOrder(u, { t: 'farm', target: b.id, back: false });
    if (b.type !== 'town_center') for (const r of d.drop ?? []) {
      const n = findRes(w, b.tx + b.ty * w.W, RES.indexOf(r) + 1, 8);
      if (n >= 0) return setOrder(u, { t: 'gather', tile: n, back: false });
    }
    return setOrder(u, idle());
  }
  if (!moveTo(w, u, b.tx, b.ty, d.size, d.size) || !hugRect(w, u, b)) return;
  b.progress++;
  if (done(b)) { fx(w, 'built', b); onBuilt(w, b); if (b.type === 'pasture') sowWheat(w, b, WHEAT_INIT); } // ферма сразу с полями
  const mh = maxHp(w, b);
  b.hp = Math.min(mh, b.hp + Math.ceil(mh / d.time));
}

export function updBuilding(w: World, b: Building) {
  const d = BUILDINGS[b.type], P = w.players[b.owner];
  if (!done(b)) { // перестройка стены в ворота/башню идёт сама
    if (b.auto) {
      b.progress++;
      const mh = maxHp(w, b);
      b.hp = Math.min(mh, b.hp + Math.ceil(mh / d.time));
      if (done(b)) { b.auto = 0; fx(w, 'built', b); }
    }
    return;
  }
  if (b.cd > 0) b.cd--;
  if (d.atk && !b.cd) {
    const c = (d.size * TILE) / 2, e = nearestEnemy(w, b.owner, b.tx * TILE + c, b.ty * TILE + c, d.range! + w.players[b.owner].mods.range * TILE, true);
    if (e) { hit(w, d, e, b.owner, false, b.tx * TILE + c, b.ty * TILE + c, true); b.cd = d.cd!; }
  }
  const q = b.queue[0];
  if (!q) return;
  if (q[0] === '@') { // исследование
    if (++b.qt >= researchTime(P, q.slice(1))) { b.queue.shift(); b.qt = 0; research(w, P, q.slice(1)); if (TECHS[q.slice(1)].final && w.victory.sci) win(w, P.id, 'sci'); }
    return;
  }
  if (q === '#wheat') { if (++b.qt >= WHEAT_TIME) { b.queue.shift(); b.qt = 0; sowWheat(w, b, WHEAT_SOW); } return; }
  if (q === '#age') {
    if (++b.qt >= AGE_TIME) {
      P.age++; P.ageing = false; b.queue.shift(); b.qt = 0; fx(w, 'age', b); onAge(w, P);
      w.log.push(`[${fmt(w.tick)}] P${b.owner} → ${AGE_NAMES[P.age]} эпоха`);
    }
    return;
  }
  if (b.qt < UNITS[q].time) { b.qt++; return; }
  if (!UNITS[q].animal && !UNITS[q].noPop && P.pop >= P.popCap) return; // ждём жильё (скот и дроны места не занимают)
  const u = spawnUnit(w, q, b.owner, b, b.rally);
  if (!u) return;
  b.queue.shift(); b.qt = 0; u.hp = maxHp(w, u); fx(w, 'spawn', u); onTrained(w, P, u);
  if (b.rally >= 0) { // точка сбора: на ресурс — добывать, иначе идти (воины — атакой с движением)
    const fe = w.occ[b.rally] < 0 ? w.ents.get(-w.occ[b.rally]) : undefined; // точка сбора на поле — пахать
    if (isWorker(u) && fe && fe.kind === 'b' && fe.type === 'farm' && fe.owner === u.owner && !farmer(w, fe.id)) setOrder(u, { t: 'farm', target: fe.id, back: false });
    else if (isWorker(u) && w.resType[b.rally]) setOrder(u, { t: 'gather', tile: b.rally, back: false });
    else setOrder(u, { t: isWorker(u) ? 'move' : 'amove', x: b.rally % w.W, y: (b.rally / w.W) | 0 });
  }
}

export function remove(w: World, e: Entity) {
  w.ents.delete(e.id);
  fx(w, 'die', e);
  onRemoved(w, e);
  const P = w.players[e.owner];
  if (e.kind === 'u') { if (UNITS[e.type].animal) carcass(w, e); else if (!UNITS[e.type].noPop) P.pop--; return; }
  const s = size(e);
  for (let y = e.ty; y < e.ty + s; y++) for (let x = e.tx; x < e.tx + s; x++) w.occ[x + y * w.W] = 0;
  if (e.queue.includes('#age')) P.ageing = false;
}
