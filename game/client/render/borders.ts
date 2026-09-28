// Границы регионов цветом владельца (ничейные не рисуем).
import type { GameContext } from '../context.ts';

export function useBorders(ctx: GameContext) {
  const { w, pcol } = ctx.session, { heightAt } = ctx.terrain, { L } = ctx.models, fog = ctx.fog;
  function draw() {
    L.border.begin();
    const col = (k: number) => { const o = w.regions[k].owner; return o >= 0 ? [...pcol(o), 1] : [0.85, 0.85, 0.8, 1]; };
    for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
      const i = x + y * w.W, r = w.region[i];
      if (!fog.seen[i]) continue;
      if (w.regions[r].owner < 0 && (x + 1 >= w.W || w.regions[w.region[i + 1]].owner < 0) && (y + 1 >= w.H || w.regions[w.region[i + w.W]].owner < 0)) continue;
      if (x + 1 < w.W && w.region[i + 1] !== r) L.border.add(x + 1, heightAt(x + 1, y + 0.5) + 0.06, y + 0.5, 0.05, 0.03, 1, col(w.regions[r].owner >= 0 ? r : w.region[i + 1]));
      if (y + 1 < w.H && w.region[i + w.W] !== r) L.border.add(x + 0.5, heightAt(x + 0.5, y + 1) + 0.06, y + 1, 1, 0.03, 0.05, col(w.regions[r].owner >= 0 ? r : w.region[i + w.W]));
    }
    L.border.end();
  }
  return { draw };
}
