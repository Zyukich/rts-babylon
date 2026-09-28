// Что под курсором: точка земли, юнит (по экранной рамке — цепляется даже краем), здание, клетка ресурса.
import { Vector3, Matrix } from '@babylonjs/core';
import { BUILDINGS, TILE } from '../../data/index.ts';
import type { Entity, Unit } from '../../core/world.ts';
import { US, unitH } from '../config/visual.ts';
import type { GameContext } from '../context.ts';

export function usePicking(ctx: GameContext) {
  const { w } = ctx.session, { scene, cam, canvas } = ctx.stage, { ground, heightAt } = ctx.terrain, fog = ctx.fog;
  const groundAt = (sx: number, sy: number) => { const p = scene.pick(sx, sy, (m) => m === ground); return p?.hit ? p.pickedPoint : null; };
  const project = (x: number, y: number, z: number) => Vector3.Project(new Vector3(x, y, z), Matrix.IdentityReadOnly, scene.getTransformMatrix(),
    cam.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight));
  /** Экранная рамка юнита — от ступней до макушки, с учётом рельефа */
  function unitBox(u: Unit) {
    const x = u.x / TILE, z = u.y / TILE, g = heightAt(x, z), a = project(x, g, z), b = project(x, g + US * unitH(u.type), z);
    const hw = Math.max(7, Math.abs(a.y - b.y) * 0.4);
    return { x0: Math.min(a.x, b.x) - hw, x1: Math.max(a.x, b.x) + hw, y0: Math.min(a.y, b.y) - 3, y1: Math.max(a.y, b.y) + 3 };
  }
  function entityAt(sx: number, sy: number): Entity | null {
    let best: Entity | null = null, bd = Infinity;
    for (const e of w.ents.values()) if (e.kind === 'u' && fog.visible(e)) {
      const r = unitBox(e);
      if (sx < r.x0 - 3 || sx > r.x1 + 3 || sy < r.y0 - 3 || sy > r.y1 + 3) continue;
      const d = (sx - (r.x0 + r.x1) / 2) ** 2 + (sy - (r.y0 + r.y1) / 2) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return best;
    const pb = scene.pick(sx, sy, (m) => m === ctx.ents.pickMesh);
    if (pb?.hit && pb.thinInstanceIndex >= 0) return w.ents.get(ctx.ents.buildingAt(pb.thinInstanceIndex)) ?? null;
    return null;
  }
  /** Клетка ресурса под курсором (с «прилипанием» к соседней — по деревьям легко промахнуться) */
  function resAt(sx: number, sy: number) {
    const g = groundAt(sx, sy);
    if (!g) return -1;
    const tx = Math.floor(g.x), tz = Math.floor(g.z);
    let best = -1, bd = 1.1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, z = tz + dz, i = x + z * w.W;
      if (x < 0 || z < 0 || x >= w.W || z >= w.H || !w.resType[i] || !fog.seen[i]) continue;
      const d = Math.hypot(x + 0.5 - g.x, z + 0.5 - g.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  const entPos = (e: Entity): [number, number] => (e.kind === 'u' ? [e.x / TILE, e.y / TILE] : [e.tx + BUILDINGS[e.type].size / 2, e.ty + BUILDINGS[e.type].size / 2]);
  const onScreen = (x: number, z: number) => { const p = project(x, 0.4, z); return p.x >= 0 && p.y >= 0 && p.x <= canvas.clientWidth && p.y <= canvas.clientHeight; };
  /** Клетка под курсором (или -1) */
  const tileAt = (sx: number, sy: number) => { const g = groundAt(sx, sy); return g ? Math.floor(g.x) + Math.floor(g.z) * w.W : -1; };
  return { groundAt, tileAt, unitBox, entityAt, resAt, entPos, onScreen };
}
