import { type World, passable, rectDist } from './world.ts';
import { TILE } from './defs.ts';

const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

class Heap {
  k: number[] = []; v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop()!, lv = v.pop()!, n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

// A* по сетке (8 направлений). Цель — прямоугольник: встать внутрь или вплотную.
// Если цель недостижима — путь к ближайшей достижимой точке.
// Есть ли прямой проход между точками (в единицах): шагаем по отрезку по четверти клетки
export function lineClear(w: World, x0: number, y0: number, x1: number, y1: number, owner = -1) {
  const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE / 4));
  for (let k = 1; k <= n; k++) {
    const x = x0 + Math.trunc((dx * k) / n), y = y0 + Math.trunc((dy * k) / n);
    // проверяем и соседние клетки по краям «тела», чтобы не срезать углы впритирку
    for (const [ox, oy] of [[0, 0], [250, 250], [-250, 250], [250, -250], [-250, -250]]) {
      const t = (((x + ox) / TILE) | 0) + (((y + oy) / TILE) | 0) * w.W;
      if (!passable(w, t, owner) && t !== ((x0 / TILE) | 0) + ((y0 / TILE) | 0) * w.W) return false;
    }
  }
  return true;
}

// Сглаживание: выкидываем промежуточные точки, пока до следующей видно по прямой → идём ровной линией, а не «ёлочкой»
export function smoothPath(w: World, x: number, y: number, path: number[], owner = -1): number[] {
  const out: number[] = [], c = (i: number) => [(i % w.W) * TILE + TILE / 2, ((i / w.W) | 0) * TILE + TILE / 2];
  let i = 0;
  while (i < path.length) {
    let j = Math.min(path.length - 1, i + 40);
    while (j > i && !lineClear(w, x, y, c(path[j])[0], c(path[j])[1], owner)) j--;
    out.push(path[j]);
    [x, y] = c(path[j]);
    i = j + 1;
  }
  return out;
}

export function findPath(w: World, start: number, rx: number, ry: number, rw: number, rh: number, owner = -1, maxIter = 4000): number[] {
  const { W, H } = w, ok = (i: number) => passable(w, i, owner);
  const h0 = rectDist(w, start, rx, ry, rw, rh);
  if (h0 <= 1) return [];
  const g = new Int32Array(W * H).fill(-1), from = new Int32Array(W * H).fill(-1), heap = new Heap();
  g[start] = 0; heap.push(h0 * 10 * 16384 + h0, start);
  let best = start, bestH = h0;
  for (let it = 0; heap.size && it < maxIter; it++) {
    const cur = heap.pop(), h = rectDist(w, cur, rx, ry, rw, rh);
    if (h < bestH) { bestH = h; best = cur; }
    if (h <= 1) break;
    const cx = cur % W, cy = (cur / W) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d], ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = nx + ny * W, diag = d >= 4;
      if (!ok(n)) continue;
      if (diag && (!ok(nx + cy * W) || !ok(cx + ny * W))) continue; // не срезаем углы
      const ng = g[cur] + (diag ? 14 : 10);
      if (g[n] !== -1 && ng >= g[n]) continue;
      g[n] = ng; from[n] = cur;
      const nh = rectDist(w, n, rx, ry, rw, rh);
      heap.push((ng + nh * 10) * 16384 + nh, n);
    }
  }
  const path: number[] = [];
  for (let c = best; c !== start && c !== -1; c = from[c]) path.push(c);
  return path.reverse();
}
