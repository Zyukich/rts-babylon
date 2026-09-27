// Видимость игрока: vis — видно сейчас, seen — когда-то разведано. Общая для тумана войны и бота.
import { BUILDINGS, UNITS, TILE, T_HILL, HILL_SIGHT } from './defs.ts';
import { ally, type World, type Entity } from './world.ts';

// Возвращает true, если разведаны новые клетки
export function computeVision(w: World, p: number, vis: Uint8Array, seen: Uint8Array) {
  vis.fill(0);
  let changed = false;
  for (const e of w.ents.values()) {
    if (!ally(w, e.owner, p)) continue; // общий обзор с союзниками
    const extra = w.players[e.owner].mods.sight;
    let cx: number, cy: number, r: number;
    if (e.kind === 'u') {
      cx = (e.x / TILE) | 0; cy = (e.y / TILE) | 0;
      r = UNITS[e.type].sight + extra + (w.terrain[cx + cy * w.W] === T_HILL ? HILL_SIGHT : 0);
    } else { const d = BUILDINGS[e.type], h = d.size >> 1; cx = e.tx + h; cy = e.ty + h; r = (d.sight ?? 6) + h; }
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= w.W || y >= w.H || dx * dx + dy * dy > r * r + r) continue;
      const i = x + y * w.W;
      vis[i] = 1;
      if (!seen[i]) { seen[i] = 1; changed = true; }
    }
  }
  return changed;
}

// Свои видны всегда, чужие юниты — в зоне видимости, чужие здания — если их место разведано
export function canSee(w: World, p: number, vis: Uint8Array, seen: Uint8Array, e: Entity) {
  if (ally(w, e.owner, p)) return true;
  if (e.kind === 'u') return !!vis[((e.x / TILE) | 0) + ((e.y / TILE) | 0) * w.W];
  return !!seen[e.tx + e.ty * w.W];
}
