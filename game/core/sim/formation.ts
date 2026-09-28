// Формации отряда (только целые числа — детерминизм)
import { UNITS, TILE, type Cls } from '../../data/index.ts';
import { type World, type Unit, walkable } from '../world.ts';
import { fx } from './common.ts';

// ---------- Формации (только целые числа — детерминизм) ----------
// Направление строя — от центра отряда к цели, округлённое до 8 сторон. Рукопашные — вперёд/по краю, стрелки — назад/внутрь
export const ROLE: Partial<Record<Cls, number>> = { infantry: 0, spear: 0, cavalry: 0, ranged: 1, siege: 2, worker: 2 };

export function formation(w: World, us: Unit[], tx: number, ty: number, f: number): [Unit, number, number][] {
  const n = us.length;
  let sx = 0, sy = 0;
  for (const u of us) { sx += u.x; sy += u.y; }
  const DX = tx - Math.floor(sx / n / TILE), DY = ty - Math.floor(sy / n / TILE), ax = Math.abs(DX), ay = Math.abs(DY);
  let fx = Math.sign(DX), fy = Math.sign(DY);
  if (ax > 2 * ay) fy = 0; else if (ay > 2 * ax) fx = 0;
  if (!fx && !fy) fy = 1;
  const rx = -fy, ry = fx; // вправо от направления
  const sorted = [...us].sort((a, b) => (ROLE[UNITS[a.type].cls] ?? 0) - (ROLE[UNITS[b.type].cls] ?? 0) || a.id - b.id);
  const off: [number, number][] = []; // [вбок, назад]
  if (f === 1) { // линия: 1–3 шеренги, фронт широкий
    const ranks = n <= 8 ? 1 : n <= 24 ? 2 : 3, per = Math.ceil(n / ranks);
    for (let k = 0; k < n; k++) off.push([(k % per) - ((per - 1) >> 1), Math.floor(k / per)]);
  } else if (f === 2) { // клин: остриём к цели, ряд k — 2k+1 мест, от центра к краям
    for (let k = 0; off.length < n; k++) for (let j = 0; j <= 2 * k && off.length < n; j++) off.push([j % 2 ? (j + 1) >> 1 : -(j >> 1), k]);
  } else { // черепаха: плотный квадрат, края — рукопашным, середина — стрелкам
    const s = Math.ceil(Math.sqrt(n)), h = (s - 1) >> 1, cells: [number, number, number][] = [];
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) cells.push([i - h, j - h, Math.min(i, j, s - 1 - i, s - 1 - j)]);
    cells.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    for (let k = 0; k < n; k++) off.push([cells[k][0], cells[k][1]]);
  }
  const used = new Set<number>(), out: [Unit, number, number][] = [];
  sorted.forEach((u, k) => {
    let x = tx + off[k][0] * rx - off[k][1] * fx, y = ty + off[k][0] * ry - off[k][1] * fy;
    if (x < 0 || y < 0 || x >= w.W || y >= w.H || !walkable(w, x + y * w.W) || used.has(x + y * w.W)) { // место занято препятствием — ближайшее свободное
      search: for (let r = 1; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy, i = nx + ny * w.W;
        if (nx >= 0 && ny >= 0 && nx < w.W && ny < w.H && walkable(w, i) && !used.has(i)) { x = nx; y = ny; break search; }
      }
    }
    used.add(x + y * w.W);
    out.push([u, x, y]);
  });
  return out;
}
