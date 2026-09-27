import { UNITS, BUILDINGS, RES, TILE, AGE_COST, AGE_TIME, AGE_NAMES, GATHER_TICKS, FARM_TICKS, CARRY, POP_MAX, QUEUE_MAX, MEAT, FIELD_REACH, WHEAT, WHEAT_INIT, WHEAT_SOW, WHEAT_TIME, WHEAT_COST, T_HILL, HILL_BONUS, COVER_BONUS, REGION_WEIGHT, TERR_SHARE, TERR_HOLD, ECO_TARGET, CULT_TARGET, FINAL_REQ, GOAL_HOLD, WIN_NAMES, EVENT_MIN, EVENT_VAR, type Cost, type Res, type Cls } from './defs.ts';
import { ally, type World, type Unit, type Building, type Entity, type Order, type Fx, type Player, type Goal, addBuilding, spawnUnit, canPlace, walkable, passable, rectDist, distTo } from './world.ts';
import { findPath, smoothPath } from './path.ts';
import { TECHS, maxHp, speedOf, sightOf, carryOf, gatherTicks, researchTime, ageCost, popOf, slotsLeft, queuedTechs, research, onAge, onGathered, onBuilt, onTrained, onRemoved, onWar, onPop, chron, addCulture, cultureLevel, BRANCHES } from './civ.ts';

// Команды — единственный способ влиять на мир. По сети передаются только они.
export type Command = { p: number; q?: boolean } & ( // q — добавить в очередь приказов (Shift)
  | { t: 'move'; units: number[]; x: number; y: number }
  | { t: 'attack'; units: number[]; target: number }
  | { t: 'gather'; units: number[]; tile: number }
  | { t: 'build'; units: number[]; type: string; tx: number; ty: number }
  | { t: 'farm'; units: number[]; target: number }
  | { t: 'assist'; units: number[]; target: number }
  | { t: 'train'; building: number; unit: string }
  | { t: 'age'; building: number }
  | { t: 'stop'; units: number[] }
  | { t: 'amove'; units: number[]; x: number; y: number }
  | { t: 'rally'; building: number; x: number; y: number }
  | { t: 'research'; building: number; tech: string }
  | { t: 'wall'; units: number[]; tiles: number[] }
  | { t: 'cancel'; building: number; index: number }
  | { t: 'destroy'; ids: number[] }
  | { t: 'convert'; building: number; to: string }
  | { t: 'gate'; building: number; open: boolean }
  | { t: 'sow'; building: number }
);

type Gather = Extract<Order, { t: 'gather' }>;
type Farm = Extract<Order, { t: 'farm' }>;
type Attack = Extract<Order, { t: 'attack' }>;

const idle = (): Order => ({ t: 'idle' });
const afford = (w: World, p: number, c: Cost) => RES.every((r) => w.players[p].res[r] >= (c[r] ?? 0));
const pay = (w: World, p: number, c: Cost) => { for (const r of RES) w.players[p].res[r] -= c[r] ?? 0; };
const tileOf = (w: World, u: Unit) => ((u.x / TILE) | 0) + ((u.y / TILE) | 0) * w.W;
const size = (b: Building) => BUILDINGS[b.type].size;
const done = (b: Building) => b.progress >= BUILDINGS[b.type].time;
const isWorker = (u: Unit) => UNITS[u.type].cls === 'worker';

function mine(w: World, p: number, ids: number[]): Unit[] {
  const out: Unit[] = [];
  for (const id of ids) { const e = w.ents.get(id); if (e && e.kind === 'u' && e.owner === p && !UNITS[e.type].animal) out.push(e); } // коровами не управляют
  return out;
}
function ownBuilding(w: World, p: number, id: number) {
  const b = w.ents.get(id);
  return b && b.kind === 'b' && b.owner === p && done(b) ? b : null;
}
function setOrder(u: Unit, o: Order) { u.order = o; u.path = []; u.pkey = -1; u.wait = 0; u.timer = 0; u.sx = NOSPOT; }
const NOSPOT = -1e9;
const isAnimal = (e: Entity) => e.kind === 'u' && !!UNITS[e.type].animal;

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
      const us = mine(w, c.p, c.units), s = Math.ceil(Math.sqrt(us.length));
      us.forEach((u, k) => give(u, { t: c.t,
        x: Math.min(w.W - 1, Math.max(0, c.x + (k % s) - (s >> 1))),
        y: Math.min(w.H - 1, Math.max(0, c.y + Math.floor(k / s) - (s >> 1))) }));
      break;
    }
    case 'attack': {
      const t = w.ents.get(c.target);
      if (t && (!ally(w, t.owner, c.p) || isAnimal(t))) for (const u of mine(w, c.p, c.units)) give(u, { t: 'attack', target: c.target }); // своих коров тоже можно забить
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
      for (const id of c.ids) {
        const e = w.ents.get(id);
        if (!e || e.owner !== c.p) continue;
        if (e.kind === 'b') {
          const d = BUILDINGS[e.type];
          if (!done(e)) for (const r of RES) P.res[r] += Math.floor(((d.cost[r] ?? 0) * (d.time - e.progress)) / d.time);
          for (const q of e.queue.splice(0)) refundItem(P, q);
        }
        e.hp = 0;
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
  }
}

function refundItem(P: Player, q: string) {
  const cost = q === '#wheat' ? WHEAT_COST : q === '#age' ? ageCost(P) : q[0] === '@' ? TECHS[q.slice(1)]?.cost : UNITS[q]?.cost;
  for (const r of RES) P.res[r] += cost?.[r] ?? 0;
  if (q === '#age') P.ageing = false;
}

// Поле можно поставить только рядом со своей фермой
export function nearFarm(w: World, p: number, tx: number, ty: number, s: number) {
  for (const e of w.ents.values()) if (e.kind === 'b' && e.owner === p && e.type === 'pasture') {
    const ps = size(e), gx = Math.max(e.tx - (tx + s - 1), tx - (e.tx + ps - 1), 0), gy = Math.max(e.ty - (ty + s - 1), ty - (e.ty + ps - 1), 0);
    if (Math.max(gx, gy) <= FIELD_REACH) return true;
  }
  return false;
}

// Пшеница на свободных клетках вокруг фермы (кольцами)
function sowWheat(w: World, b: Building, n: number) {
  const s = size(b);
  for (let r = 1; r <= 3 && n > 0; r++)
    for (let y = b.ty - r; y < b.ty + s + r && n > 0; y++)
      for (let x = b.tx - r; x < b.tx + s + r && n > 0; x++) {
        if (x > b.tx - r && x < b.tx + s + r - 1 && y > b.ty - r && y < b.ty + s + r - 1) continue;
        if (x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
        const i = x + y * w.W;
        if (!walkable(w, i) || w.resType[i] || w.occ[i]) continue;
        w.resType[i] = RES.indexOf('food') + 1; w.resAmt[i] = WHEAT; w.resKind[i] = 2; n--;
      }
}

// Кто сейчас какую клетку добывает — чтобы рабочие расходились, а не толпились у одного дерева
let crowd = new Map<number, number>(), crowdIds = new Map<number, number[]>();
function pickTile(w: World, from: number, ri: number, rad: number): number {
  const t = pickTile0(w, from, ri, rad, true);
  return t >= 0 || ri !== 1 ? t : pickTile0(w, from, ri, rad, false); // своего вида нет — любая еда рядом
}
function pickTile0(w: World, from: number, ri: number, rad: number, strict: boolean) {
  const fx = from % w.W, fy = (from / w.W) | 0, kind = ri === 1 ? w.resKind[from] : 0, wt = kind === 1 ? 0.35 : kind === 2 ? 2.5 : ri === 1 ? 0.9 : 2.5; // у туши и куста можно плотнее
  let best = -1, bs = Infinity;
  for (let y = fy - rad; y <= fy + rad; y++) for (let x = fx - rad; x <= fx + rad; x++) {
    if (x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
    const i = x + y * w.W;
    if (w.resType[i] !== ri || (strict && ri === 1 && w.resKind[i] !== kind)) continue; // пшеница → пшеница, ягоды → ягоды
    const sc = Math.max(Math.abs(x - fx), Math.abs(y - fy)) + (crowd.get(i) ?? 0) * wt;
    if (sc < bs) { bs = sc; best = i; }
  }
  if (best >= 0) crowd.set(best, (crowd.get(best) ?? 0) + 1);
  return best;
}

// Встать вплотную к цели: точка на окружности radius вокруг (cx,cy) со стороны подхода, соседи разнесены по id.
// Считается один раз и без тригонометрии — чтобы у всех клиентов совпадало.
function hug(w: World, u: Unit, cx: number, cy: number, radius: number) {
  if (u.sx === NOSPOT) {
    let dx = u.x - cx;
    const dy = u.y - cy;
    if (!dx && !dy) dx = 1;
    const k = ((u.id % 7) - 3) * 0.3, nx = dx - dy * k, ny = dy + dx * k, l = Math.sqrt(nx * nx + ny * ny) || 1;
    u.sx = cx + Math.trunc((nx * radius) / l); u.sy = cy + Math.trunc((ny * radius) / l);
  }
  return approach(w, u, u.sx, u.sy);
}
// То же у здания: ближайшая точка на его краю — строители «облепляют» стройку
function hugRect(w: World, u: Unit, b: Building) {
  if (u.sx === NOSPOT) {
    const s = size(b) * TILE, x0 = b.tx * TILE - 220, y0 = b.ty * TILE - 220, x1 = b.tx * TILE + s + 220, y1 = b.ty * TILE + s + 220;
    let px = Math.min(Math.max(u.x, x0), x1), py = Math.min(Math.max(u.y, y0), y1);
    if (px > x0 && px < x1 && py > y0 && py < y1) {
      const m = Math.min(px - x0, x1 - px, py - y0, y1 - py);
      if (m === px - x0) px = x0; else if (m === x1 - px) px = x1; else if (m === py - y0) py = y0; else py = y1;
    }
    u.sx = px; u.sy = py;
  }
  return approach(w, u, u.sx, u.sy);
}
// Туша: клетка с мясом рядом с местом гибели животного
function carcass(w: World, u: Unit) {
  const cx = (u.x / TILE) | 0, cy = (u.y / TILE) | 0;
  for (let r = 0; r < 4; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
    const i = x + y * w.W;
    if (!walkable(w, i) || w.occ[i] || w.resType[i]) continue;
    w.resType[i] = RES.indexOf('food') + 1; w.resAmt[i] = MEAT; w.resKind[i] = 1;
    w.carcass.set(u.id, i);
    return;
  }
}

// ---------- Движение ----------
function stepPath(w: World, u: Unit) {
  const nt = u.path[0];
  if (!passable(w, nt, u.owner)) { u.path.length = 0; return; } // путь перекрыли — перестроим
  const cx = (nt % w.W) * TILE + TILE / 2, cy = ((nt / w.W) | 0) * TILE + TILE / 2;
  const ox = u.x, oy = u.y, from = tileOf(w, u), arrived = approach(w, u, cx, cy), t = tileOf(w, u);
  if (t !== from && !passable(w, t, u.owner)) { u.x = ox; u.y = oy; u.path.length = 0; return; } // на прямой появилось препятствие
  if (arrived) u.path.shift();
}
function approach(w: World, u: Unit, px: number, py: number): boolean {
  const dx = px - u.x, dy = py - u.y, dist = Math.floor(Math.sqrt(dx * dx + dy * dy)), sp = speedOf(w, u);
  if (dist <= sp) { u.x = px; u.y = py; return true; }
  u.x += Math.trunc((dx * sp) / dist); u.y += Math.trunc((dy * sp) / dist);
  return false;
}

// true = уже на месте (вплотную к прямоугольнику, либо точно в клетке при exact)
function moveTo(w: World, u: Unit, rx: number, ry: number, rw: number, rh: number, exact = false): boolean {
  const t = tileOf(w, u), goal = rx + ry * w.W, d = rectDist(w, t, rx, ry, rw, rh);
  if (exact ? t === goal || (d <= 1 && !walkable(w, goal)) : d <= 1) { u.path.length = 0; return true; }
  const key = (rx * 4096 + ry) * 64 + rw * 8 + rh;
  if (u.pkey !== key || !u.path.length) {
    if (u.wait > 0) { u.wait--; return false; }
    u.path = findPath(w, t, rx, ry, rw, rh, u.owner);
    u.pkey = key;
    const last = u.path.length ? u.path[u.path.length - 1] : t;
    if (exact && last !== goal && walkable(w, goal) && rectDist(w, last, rx, ry, 1, 1) <= 1) u.path.push(goal);
    u.path = smoothPath(w, u.x, u.y, u.path, u.owner);
    if (!u.path.length) { if (exact) return true; u.wait = 10; return false; } // недостижимо
  }
  stepPath(w, u);
  return false;
}

// ---------- Поиск ----------
function nearestEnemy(w: World, owner: number, x: number, y: number, range: number, unitsOnly = false): Entity | null {
  let best: Entity | null = null, bd = Infinity;
  for (const e of w.ents.values()) {
    if (ally(w, e.owner, owner) || e.hp <= 0 || (unitsOnly && e.kind === 'b') || isAnimal(e)) continue;
    const d = distTo(x, y, e);
    if (d > range) continue;
    const score = d + (e.kind === 'b' ? 3 * TILE : 0); // юниты приоритетнее зданий
    if (score < bd) { bd = score; best = e; }
  }
  return best;
}
function nearestDrop(w: World, u: Unit, r: Res): Building | null {
  let best: Building | null = null, bd = Infinity;
  for (const e of w.ents.values())
    if (e.kind === 'b' && e.owner === u.owner && done(e) && BUILDINGS[e.type].drop?.includes(r)) {
      const d = distTo(u.x, u.y, e);
      if (d < bd) { bd = d; best = e; }
    }
  return best;
}
export function findRes(w: World, from: number, ri: number, rad: number) {
  const fx = from % w.W, fy = (from / w.W) | 0;
  for (let r = 0; r <= rad; r++)
    for (let y = fy - r; y <= fy + r; y++)
      for (let x = fx - r; x <= fx + r; x++) {
        if (Math.max(Math.abs(x - fx), Math.abs(y - fy)) !== r || x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
        if (w.resType[x + y * w.W] === ri) return x + y * w.W;
      }
  return -1;
}

function fx(w: World, k: Fx['k'], e: Entity) {
  if (e.kind === 'u') w.fx.push({ k, owner: e.owner, x: e.x, y: e.y, type: e.type, id: e.id });
  else w.fx.push({ k, owner: e.owner, x: (e.tx + size(e) / 2) * TILE, y: (e.ty + size(e) / 2) * TILE, type: e.type, id: e.id });
}

// ---------- Бой ----------
const onHill = (w: World, x: number, y: number) => w.terrain[((x / TILE) | 0) + ((y / TILE) | 0) * w.W] === T_HILL;
function inCover(w: World, u: Unit) { // рядом ≥2 деревьев — стрелы летят мимо
  const tx = (u.x / TILE) | 0, ty = (u.y / TILE) | 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.resType[tx + dx + (ty + dy) * w.W] === 2) n++;
  return n >= 2;
}

function hit(w: World, src: { atk?: number; bonus?: Partial<Record<Cls, number>> }, t: Entity, by: number, military: boolean, ax: number, ay: number, ranged: boolean) {
  const m = w.players[by].mods, tm = w.players[t.owner].mods;
  const cls: Cls = t.kind === 'u' ? UNITS[t.type].cls : 'building';
  const armor = t.kind === 'u' ? UNITS[t.type].armor + (cls !== 'worker' ? tm.armor : 0) : BUILDINGS[t.type].armor;
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

// ---------- Поведение юнитов ----------
function gather(w: World, u: Unit, o: Gather) {
  if (u.carry >= carryOf(w, u)) o.back = true;
  if (o.back) {
    if (!u.carry || !u.carryRes) o.back = false;
    else {
      const r = deliver(w, u);
      if (r === null) return setOrder(u, idle());
      if (r) { o.back = false; u.sx = NOSPOT; }
      return;
    }
  }
  let ri = w.resType[o.tile];
  if (!ri) { // клетка истощилась — ищем соседнюю того же типа
    const want = u.carryRes ? RES.indexOf(u.carryRes) + 1 : 0;
    const n = want ? pickTile(w, o.tile, want, 8) : -1; // ближайший похожий и не облепленный другими
    if (n < 0) { if (u.carry) o.back = true; else setOrder(u, idle()); return; }
    o.tile = n; ri = want; u.sx = NOSPOT;
  }
  const res = RES[ri - 1];
  if (u.carryRes !== res) { u.carry = 0; u.carryRes = res; }
  if (!moveTo(w, u, o.tile % w.W, (o.tile / w.W) | 0, 1, 1)) return;
  const kind = res === 'food' ? w.resKind[o.tile] : 0, rad = kind === 2 ? 220 : kind === 1 ? 380 : res === 'food' ? 430 : 520; // к кусту и туше — вплотную, «облепляют»
  if (!hug(w, u, (o.tile % w.W) * TILE + TILE / 2, ((o.tile / w.W) | 0) * TILE + TILE / 2, rad)) return;
  // Тесно? Через пару секунд «лишние» (сверх вместимости) сами уходят к соседнему такому же ресурсу
  const cap = kind === 2 ? 1 : kind === 1 ? 6 : res === 'food' ? 4 : 2, ids = crowdIds.get(o.tile);
  if (ids && ids.indexOf(u.id) >= cap) {
    if (++u.crowdT > 25) {
      u.crowdT = 0;
      const n = pickTile(w, o.tile, ri, 6);
      if (n >= 0 && n !== o.tile) { o.tile = n; u.sx = NOSPOT; return; }
    }
  } else u.crowdT = 0;
  if (++u.timer >= gatherTicks(w, u.owner, kind === 2 ? 'farm' : res, o.tile)) { // пшеница — со всеми бонусами к урожаю
    u.timer = 0; u.carry++;
    if (--w.resAmt[o.tile] <= 0) w.resType[o.tile] = 0; // вид (resKind) оставляем — по нему ищем следующий такой же
  }
}

// true — сдал груз, false — ещё несёт, null — некуда сдать
function deliver(w: World, u: Unit): boolean | null {
  const b = nearestDrop(w, u, u.carryRes!);
  if (!b) return null;
  if (!moveTo(w, u, b.tx, b.ty, size(b), size(b))) return false;
  w.players[u.owner].res[u.carryRes!] += u.carry;
  onGathered(w, w.players[u.owner], u.carryRes!, u.carry);
  u.carry = 0;
  return true;
}

export function farmer(w: World, id: number): Unit | null {
  for (const e of w.ents.values()) if (e.kind === 'u' && e.order.t === 'farm' && e.order.target === id) return e;
  return null;
}

function farm(w: World, u: Unit, o: Farm) {
  const e = w.ents.get(o.target), b = e && e.kind === 'b' && done(e) ? e : null;
  if (u.carryRes !== 'food') { u.carry = 0; u.carryRes = 'food'; }
  if (!b && !u.carry) return setOrder(u, idle());
  if (!b || u.carry >= carryOf(w, u)) o.back = true;
  if (o.back) {
    const r = deliver(w, u);
    if (r === null || (r && !b)) return setOrder(u, idle());
    if (r) { o.back = false; u.sx = NOSPOT; }
    return;
  }
  if (!b || !moveTo(w, u, b.tx, b.ty, 2, 2)) return;
  // фермер бродит по полю от грядки к грядке
  const hs = (Math.imul(u.id, 2654435761) ^ Math.imul(((w.tick / 60) | 0) + 1, 40503)) >>> 0;
  if (!approach(w, u, b.tx * TILE + 250 + (hs % 1500), b.ty * TILE + 250 + ((hs >>> 11) % 1500))) return;
  if (++u.timer >= gatherTicks(w, u.owner, 'farm', b.tx + b.ty * w.W)) { u.timer = 0; u.carry++; }
}

// Мягкое расталкивание юнитов (сетка по клеткам, порядок по id — детерминированно)
function separate(w: World) {
  const R2 = 480, grid = new Map<number, Unit[]>();
  for (const e of w.ents.values()) if (e.kind === 'u') {
    const k = tileOf(w, e); let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(e);
  }
  const nudge = (u: Unit, dx: number, dy: number) => {
    const nx = u.x + dx, ny = u.y + dy, t = ((nx / TILE) | 0) + ((ny / TILE) | 0) * w.W;
    if (nx > 0 && ny > 0 && nx < w.W * TILE && ny < w.H * TILE && (walkable(w, t) || t === tileOf(w, u))) { u.x = nx; u.y = ny; }
  };
  for (const e of w.ents.values()) {
    if (e.kind !== 'u') continue;
    const tx = (e.x / TILE) | 0, ty = (e.y / TILE) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const o of grid.get(tx + dx + (ty + dy) * w.W) ?? []) {
        if (o.id <= e.id) continue;
        let ddx = o.x - e.x, ddy = o.y - e.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= R2 * R2) continue; // R2 — диаметр «тела» юнита
        let d = Math.floor(Math.sqrt(d2));
        if (!d) { ddx = 1; ddy = 0; d = 1; }
        // идущие проходят друг сквозь друга, стоящие уступают дорогу
        const em = e.path.length > 0, om = o.path.length > 0;
        if (em && om) continue;
        const push = Math.min(30, Math.trunc((R2 - d) / 4)), px = Math.trunc((ddx * push) / d), py = Math.trunc((ddy * push) / d);
        if (!om) nudge(o, px, py);
        if (!em) nudge(e, -px, -py);
      }
    }
  }
}

function build(w: World, u: Unit, target: number) {
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

function attack(w: World, u: Unit, o: Attack) {
  const d = UNITS[u.type];
  let t = w.ents.get(o.target);
  if (!t && isWorker(u)) { // добыча убита — разделываем тушу
    const ct = w.carcass.get(o.target);
    if (ct !== undefined && w.resType[ct]) return setOrder(u, { t: 'gather', tile: ct, back: false });
  }
  if (t && t.hp <= 0 && isAnimal(t)) return; // туша появится в конце тика
  if (!t || t.hp <= 0) {
    const e = nearestEnemy(w, u.owner, u.x, u.y, sightOf(w, u));
    if (!e) return setOrder(u, o.ax !== undefined ? { t: 'amove', x: o.ax, y: o.ay! } : idle());
    o.target = e.id; t = e;
  }
  if (distTo(u.x, u.y, t) <= d.range) {
    u.path.length = 0;
    if (!u.cd) { hit(w, d, t, u.owner, d.cls !== 'worker', u.x, u.y, d.range > 2000); u.cd = d.cd; }
    return;
  }
  if (t.kind === 'u') {
    const tt = tileOf(w, t);
    if (moveTo(w, u, tt % w.W, (tt / w.W) | 0, 1, 1)) approach(w, u, t.x, t.y); // вплотную — доходим напрямую
  } else moveTo(w, u, t.tx, t.ty, size(t), size(t));
}

function updUnit(w: World, u: Unit) {
  const d = UNITS[u.type], o = u.order;
  if (u.cd > 0) u.cd--;
  switch (o.t) {
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
        const e = nearestEnemy(w, u.owner, u.x, u.y, sightOf(w, u));
        if (e) setOrder(u, { t: 'attack', target: e.id });
      }
      break;
    case 'move': if (moveTo(w, u, o.x, o.y, 1, 1, true)) setOrder(u, idle()); break;
    case 'amove': // идём, но бьём всех встречных, потом продолжаем путь
      if ((w.tick + u.id) % 5 === 0) {
        const e = nearestEnemy(w, u.owner, u.x, u.y, sightOf(w, u));
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

function updBuilding(w: World, b: Building) {
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
  if (!UNITS[q].animal && P.pop >= P.popCap) return; // ждём жильё (скот места не занимает)
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

function remove(w: World, e: Entity) {
  w.ents.delete(e.id);
  fx(w, 'die', e);
  onRemoved(w, e);
  const P = w.players[e.owner];
  if (e.kind === 'u') { if (UNITS[e.type].animal) carcass(w, e); else P.pop--; return; }
  const s = size(e);
  for (let y = e.ty; y < e.ty + s; y++) for (let x = e.tx; x < e.tx + s; x++) w.occ[x + y * w.W] = 0;
  if (e.queue.includes('#age')) P.ageing = false;
}

export const fmt = (tick: number) => { const s = Math.floor(tick / 10); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- Главный шаг: мир(t) + команды → мир(t+1) ----------
function win(w: World, p: number, kind: string) {
  if (w.winner >= 0) return;
  w.winner = p; w.winKind = kind;
  chron(w, -1, `${WIN_NAMES[kind]} победа: P${p}`);
}

// Гонки к победе без войны: удержать богатство / культуру, или доизучить «Просвещение». Видны всем — есть время помешать.
const GOAL_NAME = { eco: 'экономической', cult: 'культурной', sci: 'научной' };
function updGoals(w: World) {
  for (const P of w.players) {
    if (!P.alive) continue;
    let hasTc = false, sci: Building | null = null;
    for (const e of w.ents.values()) if (e.kind === 'b' && e.owner === P.id && e.type === 'town_center') {
      hasTc = true;
      if (e.queue[0] === '@enlightenment') sci = e;
    }
    const on = {
      eco: w.victory.eco && RES.reduce((s, r) => s + P.res[r], 0) >= ECO_TARGET,
      cult: w.victory.cult && hasTc && BRANCHES.reduce((s, b) => s + P.culture[b], 0) >= CULT_TARGET,
      sci: !!sci && w.victory.sci,
    };
    for (const k of ['eco', 'cult', 'sci'] as Goal['kind'][]) {
      const i = w.goals.findIndex((g) => g.p === P.id && g.kind === k);
      if (on[k] && i < 0) {
        w.goals.push({ kind: k, p: P.id, t: 0, need: k === 'sci' ? researchTime(P, 'enlightenment') : GOAL_HOLD[k] });
        chron(w, -1, `P${P.id} идёт к ${GOAL_NAME[k]} победе`);
      } else if (!on[k] && i >= 0) {
        w.goals.splice(i, 1);
        chron(w, -1, `Путь P${P.id} к ${GOAL_NAME[k]} победе прерван`);
      } else if (i >= 0) {
        const g = w.goals[i];
        g.t = k === 'sci' ? sci!.qt : g.t + 10;
        if (k !== 'sci' && g.t >= g.need) win(w, P.id, k);
      }
    }
  }
}

// Динамические события — детерминированы через общий ГПСЧ, у всех клиентов одинаковы
function randomEvent(w: World) {
  const alive = w.players.filter((p) => p.alive);
  if (!alive.length) return;
  const P = alive[w.rng.int(alive.length)], k = w.rng.int(7);
  const tc = [...w.ents.values()].find((e): e is Building => e.kind === 'b' && e.owner === P.id && e.type === 'town_center');
  switch (k) {
    case 0: P.effects.drought = w.tick + 900; chron(w, -1, `Засуха в землях P${P.id}: урожай вдвое меньше 9 лет`); break;
    case 1: P.effects.harvest = w.tick + 900; chron(w, -1, `Урожайные годы у P${P.id}: еда добывается быстрее`); break;
    case 2: { // эпидемия; гражданская культура смягчает
      const vs = [...w.ents.values()].filter((e): e is Unit => e.kind === 'u' && e.owner === P.id && isWorker(e));
      const n = Math.min(vs.length, Math.max(1, Math.floor((vs.length * (12 - 3 * cultureLevel(P, 'civ'))) / 100)));
      for (let j = 0; j < n; j++) vs.splice(w.rng.int(vs.length), 1)[0].hp = 0;
      if (n) chron(w, -1, `Эпидемия у P${P.id}: погибло жителей — ${n}`);
      break;
    }
    case 3: { // новое месторождение вдали от столиц
      const r = w.rng.int(2) ? 'iron' : 'stone', ri = RES.indexOf(r) + 1;
      for (let tries = 0; tries < 60; tries++) {
        const x = 3 + w.rng.int(w.W - 6), y = 3 + w.rng.int(w.H - 6);
        if (!walkable(w, x + y * w.W) || [...w.ents.values()].some((e) => e.kind === 'b' && e.type === 'town_center' && Math.hypot(e.tx - x, e.ty - y) < 12)) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const i = x + dx + (y + dy) * w.W;
          if (walkable(w, i)) { w.resType[i] = ri; w.resAmt[i] = 300; }
        }
        chron(w, -1, `Открыто месторождение ${r === 'iron' ? 'железа' : 'камня'}: ${w.regions[w.region[x + y * w.W]].name}`);
        break;
      }
      break;
    }
    case 4: { // переселенцы
      let n = 0;
      if (tc) for (let j = 0; j < 3 && P.pop < P.popCap; j++) if (spawnUnit(w, 'villager', P.id, tc)) n++;
      if (n) chron(w, -1, `К P${P.id} пришли переселенцы: +${n}`);
      break;
    }
    case 5: { // землетрясение в случайном заселённом регионе
      const bs = [...w.ents.values()].filter((e): e is Building => e.kind === 'b');
      if (!bs.length) break;
      const c0 = bs[w.rng.int(bs.length)], reg = w.region[c0.tx + c0.ty * w.W];
      for (const b of bs) if (w.region[b.tx + b.ty * w.W] === reg) b.hp -= Math.floor(maxHp(w, b) / 4);
      chron(w, -1, `Землетрясение: ${w.regions[reg].name}`);
      break;
    }
    case 6: P.bonusSlots++; chron(w, -1, `Странствующий учёный у P${P.id}: +1 слот исследований`); break;
  }
}

// Влияние в регионе = сумма весов готовых зданий. Лидер без ничьей — владелец (при ничьей текущий сохраняет).
function updRegions(w: World) {
  const score = w.regions.map(() => new Array<number>(w.players.length).fill(0));
  for (const e of w.ents.values()) if (e.kind === 'b' && done(e)) score[w.region[e.tx + e.ty * w.W]][e.owner] += REGION_WEIGHT[e.type] ?? 1;
  w.regions.forEach((r, k) => {
    const s = score[k];
    let best = -1, bs = 0, tie = false;
    s.forEach((v, p) => { if (v > bs) { bs = v; best = p; tie = false; } else if (v === bs && v > 0) tie = true; });
    const next = tie ? (r.owner >= 0 && s[r.owner] === bs ? r.owner : -1) : best;
    if (next === r.owner) return;
    if (r.owner >= 0) chron(w, r.owner, `Потерян регион: ${r.name}`);
    if (next >= 0) { chron(w, next, `Под контролем: ${r.name}`); addCulture(w, w.players[next], 'civ', 3); }
    r.owner = next;
  });
  // Территориальная победа
  const need = Math.ceil((w.regions.length * TERR_SHARE) / 100), cnt = new Map<number, number>();
  for (const r of w.regions) if (r.owner >= 0) cnt.set(r.owner, (cnt.get(r.owner) ?? 0) + 1);
  let holder = -1;
  for (const [p, n] of cnt) if (n >= need) holder = p;
  if (holder !== w.holdBy) { w.holdBy = holder; w.holdT = 0; if (holder >= 0) chron(w, holder, 'Начато удержание территорий'); }
  else if (holder >= 0 && (w.holdT += 10) >= TERR_HOLD && w.winner < 0 && w.victory.terr) { win(w, holder, 'terr'); }
}

export function step(w: World, cmds: Command[]) {
  w.fx.length = 0;
  crowd = new Map(); crowdIds = new Map();
  for (const e of w.ents.values()) if (e.kind === 'u' && e.order.t === 'gather') {
    crowd.set(e.order.tile, (crowd.get(e.order.tile) ?? 0) + 1);
    const l = crowdIds.get(e.order.tile);
    if (l) l.push(e.id); else crowdIds.set(e.order.tile, [e.id]);
  }
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

  if (w.tick % 10 === 0) { updRegions(w); updGoals(w); }
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
