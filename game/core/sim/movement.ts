// Движение: шаг по пути, подход к точке, поиск пути к цели, расталкивание, «облепить» цель
import { UNITS, TILE } from '../../data/index.ts';
import { type World, type Unit, type Building, walkable, passable, rectDist } from '../world.ts';
import { findPath, smoothPath } from '../path.ts';
import { speedOf } from '../civ.ts';
import { tileOf, size, NOSPOT } from './common.ts';

// ---------- Движение ----------
export function stepPath(w: World, u: Unit) {
  const nt = u.path[0];
  if (!passable(w, nt, u.owner)) { u.path.length = 0; return; } // путь перекрыли — перестроим
  const cx = (nt % w.W) * TILE + TILE / 2, cy = ((nt / w.W) | 0) * TILE + TILE / 2;
  const ox = u.x, oy = u.y, from = tileOf(w, u), arrived = approach(w, u, cx, cy), t = tileOf(w, u);
  if (t !== from && !passable(w, t, u.owner)) { u.x = ox; u.y = oy; u.path.length = 0; return; } // на прямой появилось препятствие
  if (arrived) u.path.shift();
}

export function approach(w: World, u: Unit, px: number, py: number): boolean {
  const o = u.order, cap = (o.t === 'move' || o.t === 'amove') && o.sp ? o.sp : Infinity; // строй держит общий шаг
  const dx = px - u.x, dy = py - u.y, dist = Math.floor(Math.sqrt(dx * dx + dy * dy)), sp = Math.min(speedOf(w, u), cap);
  if (dist <= sp) { u.x = px; u.y = py; return true; }
  u.x += Math.trunc((dx * sp) / dist); u.y += Math.trunc((dy * sp) / dist);
  return false;
}

// true = уже на месте (вплотную к прямоугольнику, либо точно в клетке при exact)
export function moveTo(w: World, u: Unit, rx: number, ry: number, rw: number, rh: number, exact = false): boolean {
  if (UNITS[u.type].air) { // авиация летит по прямой — над водой, горами и стенами
    const t = tileOf(w, u), d = rectDist(w, t, rx, ry, rw, rh);
    if (exact ? t === rx + ry * w.W : d <= 1) return true;
    approach(w, u, rx * TILE + (rw * TILE) / 2, ry * TILE + (rh * TILE) / 2);
    return false;
  }
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

// Мягкое расталкивание юнитов (сетка по клеткам, порядок по id — детерминированно)
export function separate(w: World) {
  const R2 = 480, grid = new Map<number, Unit[]>();
  for (const e of w.ents.values()) if (e.kind === 'u' && !UNITS[e.type].air) { // самолёты друг друга не расталкивают
    const k = tileOf(w, e); let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(e);
  }
  const nudge = (u: Unit, dx: number, dy: number) => {
    const nx = u.x + dx, ny = u.y + dy, t = ((nx / TILE) | 0) + ((ny / TILE) | 0) * w.W;
    if (nx > 0 && ny > 0 && nx < w.W * TILE && ny < w.H * TILE && (walkable(w, t) || t === tileOf(w, u))) { u.x = nx; u.y = ny; }
  };
  for (const e of w.ents.values()) {
    if (e.kind !== 'u' || UNITS[e.type].air) continue;
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

// Встать вплотную к цели: точка на окружности radius вокруг (cx,cy) со стороны подхода, соседи разнесены по id.
// Считается один раз и без тригонометрии — чтобы у всех клиентов совпадало.
export function hug(w: World, u: Unit, cx: number, cy: number, radius: number) {
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
export function hugRect(w: World, u: Unit, b: Building) {
  if (u.sx === NOSPOT) { // место у стены здания: ближайшее к юниту, но не там, где уже стоит другой строитель
    const s = size(b) * TILE, x0 = b.tx * TILE - 220, y0 = b.ty * TILE - 220, x1 = b.tx * TILE + s + 220, y1 = b.ty * TILE + s + 220;
    const taken: number[] = [];
    for (const o of w.ents.values()) if (o !== u && o.kind === 'u' && o.owner === u.owner && o.sx !== NOSPOT && o.order.t === 'build' && o.order.target === b.id) taken.push(o.sx, o.sy);
    const STEP = 420, per = 2 * (x1 - x0) + 2 * (y1 - y0);
    let best = -1, bd = Infinity, bx = 0, by = 0;
    for (let d = 0; d < per; d += STEP) { // точки по периметру
      let px: number, py: number;
      if (d < x1 - x0) { px = x0 + d; py = y0; } else if (d < x1 - x0 + (y1 - y0)) { px = x1; py = y0 + d - (x1 - x0); }
      else if (d < 2 * (x1 - x0) + (y1 - y0)) { px = x1 - (d - (x1 - x0) - (y1 - y0)); py = y1; } else { px = x0; py = y1 - (d - 2 * (x1 - x0) - (y1 - y0)); }
      let free = true;
      for (let i = 0; i < taken.length && free; i += 2) if (Math.abs(taken[i] - px) < STEP - 20 && Math.abs(taken[i + 1] - py) < STEP - 20) free = false;
      if (!free || !walkable(w, ((px / TILE) | 0) + ((py / TILE) | 0) * w.W)) continue;
      const dd = Math.abs(px - u.x) + Math.abs(py - u.y);
      if (dd < bd) { bd = dd; best = d; bx = px; by = py; }
    }
    if (best >= 0) { u.sx = bx; u.sy = by; }
    else { // все места заняты — ближайшая точка у стены, как раньше
      let px = Math.min(Math.max(u.x, x0), x1), py = Math.min(Math.max(u.y, y0), y1);
      if (px > x0 && px < x1 && py > y0 && py < y1) {
        const m = Math.min(px - x0, x1 - px, py - y0, y1 - py);
        if (m === px - x0) px = x0; else if (m === x1 - px) px = x1; else if (m === py - y0) py = y0; else py = y1;
      }
      u.sx = px; u.sy = py;
    }
  }
  return approach(w, u, u.sx, u.sy);
}
