// Экономика: добыча и доставка, поля и пшеница, туши, торговые рынки, лимит дронов
import { UNITS, BUILDINGS, RES, TILE, MEAT, FIELD_REACH, WHEAT, type Res } from '../../data/index.ts';
import { type World, type Unit, type Building, walkable, distTo } from '../world.ts';
import { carryOf, gatherTicks, onGathered } from '../civ.ts';
import { type Gather, type Farm, idle, size, done, setOrder, NOSPOT, fx } from './common.ts';
import { approach, moveTo, hug } from './movement.ts';

// Кто сейчас какую клетку добывает — чтобы рабочие расходились, а не толпились у одного дерева
let crowd = new Map<number, number>(), crowdIds = new Map<number, number[]>();
// В начале тика: кто какую клетку добывает (порядок обхода — по id, детерминированно)
export function resetCrowd(w: World) {
  crowd = new Map(); crowdIds = new Map();
  for (const e of w.ents.values()) if (e.kind === 'u' && e.order.t === 'gather') {
    crowd.set(e.order.tile, (crowd.get(e.order.tile) ?? 0) + 1);
    const l = crowdIds.get(e.order.tile);
    if (l) l.push(e.id); else crowdIds.set(e.order.tile, [e.id]);
  }
}

export function pickTile(w: World, from: number, ri: number, rad: number): number {
  const t = pickTile0(w, from, ri, rad, true);
  return t >= 0 || ri !== 1 ? t : pickTile0(w, from, ri, rad, false); // своего вида нет — любая еда рядом
}

export function pickTile0(w: World, from: number, ri: number, rad: number, strict: boolean) {
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

// Пшеница на свободных клетках вокруг фермы (кольцами)
export function sowWheat(w: World, b: Building, n: number) {
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

// Туша: клетка с мясом рядом с местом гибели животного
export function carcass(w: World, u: Unit) {
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

export function nearestDrop(w: World, u: Unit, r: Res): Building | null {
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

// ---------- Поведение юнитов ----------
export function gather(w: World, u: Unit, o: Gather) {
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
export function deliver(w: World, u: Unit): boolean | null {
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

export function farm(w: World, u: Unit, o: Farm) {
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

// Поле можно поставить только рядом со своей фермой
export function nearFarm(w: World, p: number, tx: number, ty: number, s: number) {
  for (const e of w.ents.values()) if (e.kind === 'b' && e.owner === p && e.type === 'pasture') {
    const ps = size(e), gx = Math.max(e.tx - (tx + s - 1), tx - (e.tx + ps - 1), 0), gy = Math.max(e.ty - (ty + s - 1), ty - (e.ty + ps - 1), 0);
    if (Math.max(gx, gy) <= FIELD_REACH) return true;
  }
  return false;
}

export const marketDist = (a: Building, b: Building) => { const dx = a.tx - b.tx, dy = a.ty - b.ty; return Math.floor(Math.sqrt(dx * dx + dy * dy)); };

export function droneCount(w: World, p: number) { // дроны в строю + в очередях
  let n = 0;
  for (const e of w.ents.values()) if (e.owner === p) { if (e.kind === 'u') { if (UNITS[e.type].noPop) n++; } else for (const q of e.queue) if (UNITS[q]?.noPop) n++; }
  return n;
}
