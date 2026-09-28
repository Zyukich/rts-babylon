// Команды — единственный способ влиять на мир; проверяются полностью (сервер не доверяет клиенту)
import { UNITS, BUILDINGS, RES, QUEUE_MAX, WHEAT_COST, FINAL_REQ, DRONE_CAP, TRIBUTES, MARKET_MAX, MARKET_MIN, MARKET_STEP, MARKET_FEE, TRADE_MIN, type Cost, type Res } from '../../data/index.ts';
import { atWar, relOf, type World, type Unit, type Building, type Order, type Player, addBuilding, canPlace, distTo } from '../world.ts';
import { TECHS, speedOf, ageCost, slotsLeft, queuedTechs, chron } from '../civ.ts';
import { idle, afford, pay, done, isWorker, mine, ownBuilding, setOrder, isAnimal } from './common.ts';
import { canHit } from './combat.ts';
import { farmer, nearFarm, marketDist, droneCount } from './economy.ts';
import { formation } from './formation.ts';
import { RES_WORD, setRel } from './diplomacy.ts';

// Команды — единственный способ влиять на мир. По сети передаются только они.
export type Command = { p: number; q?: boolean } & ( // q — добавить в очередь приказов (Shift)
  | { t: 'move'; units: number[]; x: number; y: number; f?: number } // f — формация: 0 квадрат, 1 линия, 2 клин, 3 черепаха
  | { t: 'attack'; units: number[]; target: number }
  | { t: 'gather'; units: number[]; tile: number }
  | { t: 'build'; units: number[]; type: string; tx: number; ty: number }
  | { t: 'farm'; units: number[]; target: number }
  | { t: 'assist'; units: number[]; target: number }
  | { t: 'train'; building: number; unit: string }
  | { t: 'age'; building: number }
  | { t: 'stop'; units: number[] }
  | { t: 'amove'; units: number[]; x: number; y: number; f?: number }
  | { t: 'rally'; building: number; x: number; y: number }
  | { t: 'research'; building: number; tech: string }
  | { t: 'wall'; units: number[]; tiles: number[] }
  | { t: 'cancel'; building: number; index: number }
  | { t: 'destroy'; ids: number[] }
  | { t: 'convert'; building: number; to: string }
  | { t: 'gate'; building: number; open: boolean }
  | { t: 'sow'; building: number }
  | { t: 'trade'; building: number; res: string; buy: boolean } // рынок: купить/продать 100 ресурса за золото
  | { t: 'route'; units: number[]; target: number }            // повозки: торговать со своим/союзным рынком
  | { t: 'diplo'; to: number; rel: number }                      // отношения: хуже — сразу, лучше — предложение/согласие
  | { t: 'tribute'; to: number; res: string; amount: number }    // дань ресурсами
  | { t: 'cheat' } // только при w.debug (одиночная игра); сервер такую команду не пропускает
);

// ---------- Команды (с полной проверкой: сервер не доверяет клиенту) ----------
export function applyCommand(w: World, c: Command) {
  const P = w.players[c.p];
  if (!P?.alive) return;
  const give = (u: Unit, o: Order) => { // Shift — в конец очереди, иначе сразу
    if (c.q && u.order.t !== 'idle') u.oq.push(o);
    else { u.oq = []; setOrder(u, o); }
  };
  switch (c.t) {
    case 'move':
    case 'amove': {
      const us = mine(w, c.p, c.units);
      if (c.f && us.length > 1) { // строй: места по формации, отряд идёт шагом самого медленного
        const slots = formation(w, us, c.x, c.y, c.f), sp = Math.min(...us.map((u) => speedOf(w, u)));
        for (const [u, x, y] of slots) give(u, { t: c.t, x: Math.min(w.W - 1, Math.max(0, x)), y: Math.min(w.H - 1, Math.max(0, y)), sp });
        break;
      }
      const s = Math.ceil(Math.sqrt(us.length));
      us.forEach((u, k) => give(u, { t: c.t,
        x: Math.min(w.W - 1, Math.max(0, c.x + (k % s) - (s >> 1))),
        y: Math.min(w.H - 1, Math.max(0, c.y + Math.floor(k / s) - (s >> 1))) }));
      break;
    }
    case 'attack': {
      const t = w.ents.get(c.target);
      if (!t || (relOf(w, c.p, t.owner) >= 3 && !isAnimal(t))) break; // мир или союз — атаковать нельзя
      if (!isAnimal(t) && !atWar(w, c.p, t.owner)) setRel(w, c.p, t.owner, 0); // вражда/нейтралитет — приказ атаковать и есть объявление войны
      for (const u of mine(w, c.p, c.units)) if (canHit(UNITS[u.type], t)) give(u, { t: 'attack', target: c.target }); // своих коров тоже можно забить
      break;
    }
    case 'gather':
      if (w.resType[c.tile]) for (const u of mine(w, c.p, c.units)) if (isWorker(u)) give(u, { t: 'gather', tile: c.tile, back: false }); // сначала все — куда сказали
      break;
    case 'build': {
      const d = BUILDINGS[c.type], ws = mine(w, c.p, c.units).filter(isWorker);
      if (!d || !ws.length || d.age > P.age || !afford(w, c.p, d.cost) || !canPlace(w, c.tx, c.ty, d.size)) return;
      if (c.type === 'farm' && !nearFarm(w, c.p, c.tx, c.ty, d.size)) return; // поле — только вокруг фермы
      pay(w, c.p, d.cost);
      const b = addBuilding(w, c.type, c.p, c.tx, c.ty, false);
      for (const u of ws) give(u, { t: 'build', target: b.id });
      break;
    }
    case 'farm': {
      const b = ownBuilding(w, c.p, c.target), u = mine(w, c.p, c.units).find(isWorker);
      if (b?.type === 'farm' && u && !farmer(w, b.id)) give(u, { t: 'farm', target: b.id, back: false });
      break;
    }
    case 'assist': {
      const b = w.ents.get(c.target);
      if (b && b.kind === 'b' && b.owner === c.p) for (const u of mine(w, c.p, c.units)) if (isWorker(u)) give(u, { t: 'build', target: b.id });
      break;
    }
    case 'train': {
      const b = ownBuilding(w, c.p, c.building), ud = UNITS[c.unit];
      if (!b || !ud || !BUILDINGS[b.type].trains?.includes(c.unit) || ud.age > P.age || b.queue.length >= QUEUE_MAX || !afford(w, c.p, ud.cost)) return;
      if (ud.noPop && droneCount(w, c.p) >= DRONE_CAP * [...w.ents.values()].filter((e) => e.kind === 'b' && e.owner === c.p && e.type === 'drone_hub' && done(e)).length) return; // лимит дронов
      pay(w, c.p, ud.cost);
      b.queue.push(c.unit);
      break;
    }
    case 'age': {
      const b = ownBuilding(w, c.p, c.building), cost = ageCost(P);
      if (!b || b.type !== 'town_center' || !cost || P.ageing || !afford(w, c.p, cost)) return;
      pay(w, c.p, cost);
      P.ageing = true;
      b.queue.push('#age');
      break;
    }
    case 'rally': {
      const b = ownBuilding(w, c.p, c.building);
      if (b && c.x >= 0 && c.y >= 0 && c.x < w.W && c.y < w.H) b.rally = c.x + c.y * w.W;
      break;
    }
    case 'wall': { // линия стены: каждый сегмент — отдельное здание
      const d = BUILDINGS.wall, ws = mine(w, c.p, c.units).filter(isWorker);
      if (!ws.length) return;
      let first: Building | null = null;
      for (const i of c.tiles.slice(0, 40)) {
        const x = i % w.W, y = Math.floor(i / w.W);
        if (!afford(w, c.p, d.cost) || !canPlace(w, x, y, 1)) continue;
        pay(w, c.p, d.cost);
        const b = addBuilding(w, 'wall', c.p, x, y, false);
        b.l0 = c.tiles[0]; b.l1 = c.tiles[Math.min(c.tiles.length, 40) - 1]; // линия целиком — для ровной стены под углом
        first ??= b;
      }
      if (first) for (const u of ws) give(u, { t: 'build', target: first.id });
      break;
    }
    case 'research': {
      const b = ownBuilding(w, c.p, c.building), t = Object.hasOwn(TECHS, c.tech) ? TECHS[c.tech] : null;
      if (!b || b.type !== 'town_center' || !t || t.age > P.age || P.techs.includes(c.tech) || queuedTechs(w, c.p).includes(c.tech)
        || (t.final ? P.techs.length < FINAL_REQ : slotsLeft(w, P) <= 0) || b.queue.length >= QUEUE_MAX || !afford(w, c.p, t.cost)) return;
      pay(w, c.p, t.cost);
      b.queue.push('@' + c.tech);
      break;
    }
    case 'cancel': { // отмена из очереди с полным возвратом
      const b = w.ents.get(c.building);
      if (!b || b.kind !== 'b' || b.owner !== c.p || c.index < 0 || c.index >= b.queue.length) return;
      const q = b.queue.splice(c.index, 1)[0];
      if (c.index === 0) b.qt = 0;
      refundItem(P, q);
      break;
    }
    case 'destroy': // снос своего: недостроенное возвращает остаток цены
      for (const id of new Set(c.ids)) {
        const e = w.ents.get(id);
        if (!e || e.owner !== c.p || e.hp <= 0) continue; // уже снесено в этом тике — второй раз не возвращаем (иначе дюп ресурсов через [id, id])
        if (e.kind === 'b') {
          const d = BUILDINGS[e.type];
          if (!done(e)) for (const r of RES) P.res[r] += Math.floor(((d.cost[r] ?? 0) * (d.time - e.progress)) / d.time);
          for (const q of e.queue.splice(0)) refundItem(P, q);
        }
        e.hp = 0; e.lastBy = e.owner; // снёс сам — это не чьё-то убийство (иначе враг получает военную культуру)
      }
      break;
    case 'convert': { // стену — в ворота или башню; каменщики перестраивают сами
      const b = ownBuilding(w, c.p, c.building), d = BUILDINGS[c.to];
      if (!b || !d || (b.type !== 'wall' && b.type !== 'gate') || (c.to !== 'gate' && c.to !== 'tower') || b.type === c.to || d.age > P.age) return;
      const cost: Cost = c.to === 'gate' ? { stone: 20 } : d.cost;
      if (!afford(w, c.p, cost)) return;
      pay(w, c.p, cost);
      b.type = c.to; b.progress = 0; b.auto = 1; b.open = 1; b.hp = Math.max(1, Math.floor(b.hp / 2));
      break;
    }
    case 'sow': { // посеять пшеницу вокруг фермы
      const b = ownBuilding(w, c.p, c.building);
      if (!b || b.type !== 'pasture' || b.queue.length >= QUEUE_MAX || !afford(w, c.p, WHEAT_COST)) return;
      pay(w, c.p, WHEAT_COST);
      b.queue.push('#wheat');
      break;
    }
    case 'gate': { const b = ownBuilding(w, c.p, c.building); if (b?.type === 'gate') b.open = c.open ? 1 : 0; break; }
    case 'stop':
      for (const u of mine(w, c.p, c.units)) { u.oq = []; setOrder(u, idle()); }
      break;
    case 'trade': { // обмен на рынке: 100 единиц ресурса ↔ золото по текущей цене
      const b = ownBuilding(w, c.p, c.building), price = P.prices[c.res as Res];
      if (!b || b.type !== 'market' || price === undefined) return;
      const r = c.res as Res;
      if (c.buy) {
        if (P.res.gold < price) return;
        P.res.gold -= price; P.res[r] += 100; P.prices[r] = Math.min(MARKET_MAX, price + MARKET_STEP);
      } else {
        if (P.res[r] < 100) return;
        P.res[r] -= 100; P.res.gold += Math.floor((price * (100 - MARKET_FEE)) / 100); P.prices[r] = Math.max(MARKET_MIN, price - MARKET_STEP);
      }
      break;
    }
    case 'route': { // торговый путь: от ближайшего своего рынка к указанному (свой или союзный, не ближе TRADE_MIN клеток)
      const dest = w.ents.get(c.target);
      if (!dest || dest.kind !== 'b' || dest.type !== 'market' || !done(dest) || relOf(w, dest.owner, c.p) < 2) return; // торговать можно с нейтральными и дружественными
      for (const u of mine(w, c.p, c.units)) {
        if (UNITS[u.type].cls !== 'trade') continue;
        let home: Building | null = null, bd = Infinity;
        for (const e of w.ents.values()) if (e.kind === 'b' && e.type === 'market' && e.owner === c.p && e.id !== dest.id && done(e)) {
          const d = distTo(u.x, u.y, e);
          if (d < bd) { bd = d; home = e; }
        }
        if (home && marketDist(home, dest) >= TRADE_MIN) give(u, { t: 'trade', home: home.id, dest: dest.id, leg: 0 });
      }
      break;
    }
    case 'diplo': { // хуже — сразу; лучше — если есть встречное предложение, иначе своё предложение ждёт ответа
      const to = c.to, cur = relOf(w, c.p, to), n = w.players.length;
      if (to === c.p || to < 0 || to >= n || !w.players[to].alive || c.rel < 0 || c.rel > 4 || c.rel === cur) return;
      if (c.rel < cur) { setRel(w, c.p, to, c.rel); w.offers = w.offers.filter((o) => !((o.from === c.p && o.to === to) || (o.from === to && o.to === c.p))); return; }
      if (c.rel === 4 && cur < 3) return; // союз — только из мира
      const i = w.offers.findIndex((o) => o.from === to && o.to === c.p && o.rel === c.rel);
      if (i >= 0) { w.offers.splice(i, 1); setRel(w, c.p, to, c.rel); return; }
      w.offers = w.offers.filter((o) => !(o.from === c.p && o.to === to));
      w.offers.push({ from: c.p, to, rel: c.rel, tick: w.tick });
      break;
    }
    case 'tribute': { // дань: кому угодно, кроме тех, с кем война
      const r = c.res as Res, amt = c.amount;
      if (c.to === c.p || !w.players[c.to]?.alive || atWar(w, c.p, c.to) || !RES.includes(r) || !TRIBUTES.includes(amt) || P.res[r] < amt) return;
      P.res[r] -= amt; w.players[c.to].res[r] += amt;
      chron(w, -1, `P${c.p} отправил дань P${c.to}: ${amt} ${RES_WORD[r]}`);
      break;
    }
    case 'cheat':
      if (w.debug) for (const r of RES) P.res[r] += 1000;
      break;
  }
}

export function refundItem(P: Player, q: string) {
  const cost = q === '#wheat' ? WHEAT_COST : q === '#age' ? ageCost(P) : q[0] === '@' ? TECHS[q.slice(1)]?.cost : UNITS[q]?.cost;
  for (const r of RES) P.res[r] += cost?.[r] ?? 0;
  if (q === '#age') P.ageing = false;
}
