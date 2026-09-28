// Размещение построек: «призрак» здания под курсором (зелёный — можно, красный — нельзя), стены — протяжкой линией.
import { Color3 } from '@babylonjs/core';
import { BUILDINGS } from '../../data/index.ts';
import { canPlace } from '../../core/world.ts';
import { nearFarm } from '../../core/sim/index.ts';
import { lineFrame, onLine, wallLine } from '../render/walls.ts';
import type { GameContext } from '../context.ts';

export function usePlacement(ctx: GameContext) {
  const { w, ME, send } = ctx.session, { hy } = ctx.terrain, { L } = ctx.models, pick = ctx.pick;
  const ghost = ctx.gfx.box('ghost');
  ghost.isPickable = false; ghost.isVisible = false;
  const ok = ctx.gfx.mat(new Color3(0.3, 1, 0.3), 0.5), bad = ctx.gfx.mat(new Color3(1, 0.3, 0.3), 0.5);
  let placing: string | null = null, wallStart = -1;

  const fits = (type: string, tx: number, ty: number) => {
    const s = BUILDINGS[type].size;
    return canPlace(w, tx, ty, s) && (type !== 'farm' || nearFarm(w, ME, tx, ty, s)); // поле — только у фермы
  };
  function ghostTile(sx: number, sy: number): [number, number] | null {
    const g = pick.groundAt(sx, sy);
    if (!g || !placing) return null;
    const s = BUILDINGS[placing].size;
    return [Math.floor(g.x - s / 2 + 0.5), Math.floor(g.z - s / 2 + 0.5)];
  }
  function line(sx: number, sy: number) {
    const g = pick.groundAt(sx, sy);
    if (!g) return wallStart >= 0 ? [wallStart] : [];
    const x = Math.floor(g.x), y = Math.floor(g.z);
    return wallStart >= 0 ? wallLine(w.W, wallStart, x, y) : [x + y * w.W];
  }
  function drawWallGhost(sx: number, sy: number) {
    const tiles = line(sx, sy);
    L.wallG.begin();
    const f = tiles.length > 1 ? lineFrame(w.W, tiles[0], tiles[tiles.length - 1]) : null;
    for (const i of tiles) {
      const x = i % w.W, y = (i / w.W) | 0, [px, pz] = onLine(f, x + 0.5, y + 0.5);
      L.wallG.add(px, 0.5 + hy(x, y), pz, f ? f.sp + 0.04 : 0.9, 1, 0.6, canPlace(w, x, y, 1) ? [0.3, 1, 0.3, 1] : [1, 0.25, 0.25, 1], f?.yaw ?? 0); // красный — занято
    }
    L.wallG.end();
  }
  function cancel() {
    placing = null; wallStart = -1; ghost.isVisible = false;
    L.wallG.begin(); L.wallG.end();
    ctx.hud.touch();
  }
  return {
    get active() { return placing; },
    start(type: string) { placing = type; wallStart = -1; ghost.isVisible = type !== 'wall'; ctx.hud.touch(); },
    cancel,
    /** Курсор сдвинулся */
    move(sx: number, sy: number) {
      if (placing === 'wall') return drawWallGhost(sx, sy);
      const t = placing && ghostTile(sx, sy);
      if (!placing || !t) return;
      const s = BUILDINGS[placing].size;
      ghost.position.set(t[0] + s / 2, 0.5 + hy(t[0], t[1]), t[1] + s / 2);
      ghost.scaling.set(s, 1, s);
      ghost.material = fits(placing, t[0], t[1]) ? ok : bad;
    },
    /** ЛКМ нажата: поставить здание или начать линию стены. Shift — продолжить строить то же */
    down(sx: number, sy: number, shift: boolean) {
      if (!placing) return;
      if (placing === 'wall') { const t = pick.tileAt(sx, sy); if (t >= 0) wallStart = t; return; }
      const t = ghostTile(sx, sy);
      if (!t || !fits(placing, t[0], t[1])) return;
      send({ p: ME, q: shift, t: 'build', units: ctx.sel.ids(), type: placing, tx: t[0], ty: t[1] });
      if (!shift) cancel();
    },
    /** ЛКМ отпущена: достроить линию стены. Возвращает true, если событие съедено */
    up(sx: number, sy: number, shift: boolean) {
      if (placing !== 'wall' || wallStart < 0) return false;
      send({ p: ME, t: 'wall', units: ctx.sel.ids(), tiles: line(sx, sy) });
      wallStart = -1;
      if (!shift) cancel(); else drawWallGhost(sx, sy);
      return true;
    },
  };
}
