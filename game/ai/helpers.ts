// Помощники бота: поиск ресурсов и мест под постройки, оценка силы
import { UNITS, BUILDINGS, RES, FIELD_REACH, type Res } from '../data/index.ts';
import { type World, type Unit, canPlace } from '../core/world.ts';
import { nearFarm } from '../core/sim/index.ts';
export const xy = (w: World, i: number): [number, number] => [i % w.W, (i / w.W) | 0];
export const strength = (us: Unit[]) => us.reduce((s, u) => s + u.hp * UNITS[u.type].atk, 0);

// Ближайший ресурс; в своих регионах (там бонус) — «ближе»
export function nearestRes(w: World, x: number, y: number, r: Res, p = -1): number {
  const ri = RES.indexOf(r) + 1;
  let best = -1, bd = Infinity;
  for (let i = 0; i < w.W * w.H; i++) if (w.resType[i] === ri) {
    const dx = (i % w.W) - x, dy = ((i / w.W) | 0) - y;
    const d = (dx * dx + dy * dy) * (p >= 0 && w.regions[w.region[i]].owner === p ? 0.6 : 1);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// Место под поле 2×2: вплотную к своей ферме (в пределах FIELD_REACH), иначе стройку не разрешат
export function fieldSpot(w: World, p: number): [number, number] | null {
  for (const e of w.ents.values()) if (e.kind === 'b' && e.owner === p && e.type === 'pasture') {
    const ps = BUILDINGS.pasture.size, R = FIELD_REACH;
    for (let y = e.ty - R - 1; y <= e.ty + ps + R - 1; y++) for (let x = e.tx - R - 1; x <= e.tx + ps + R - 1; x++)
      if (canPlace(w, x, y, 2) && nearFarm(w, p, x, y, 2)) return [x, y];
  }
  return null;
}
export function findSpot(w: World, cx: number, cy: number, s: number): [number, number] | null {
  for (let r = 0; r < 16; r++)
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === r && canPlace(w, x - 1, y - 1, s + 2)) return [x, y]; // с отступом, чтобы не запирать проходы
  return null;
}
