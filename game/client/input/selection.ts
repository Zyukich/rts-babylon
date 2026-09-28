// Выделение: выбранные юниты/здания, выбранная клетка ресурса, группы Ctrl+1…9, поиск бездельников.
import { UNITS, TILE } from '../../data/index.ts';
import type { Unit, Building } from '../../core/world.ts';
import type { GameContext } from '../context.ts';

export function useSelection(ctx: GameContext) {
  const { w, ME } = ctx.session;
  let ids: number[] = [], res = -1, idleIdx = 0;
  const set = new Set<number>();
  const groups: Record<number, number[]> = {};

  function select(list: number[]) {
    ids = [...new Set(list)].filter((id) => w.ents.has(id));
    set.clear(); ids.forEach((id) => set.add(id));
    ctx.hud.touch();
  }
  const ents = () => ids.map((id) => w.ents.get(id)).filter((e) => !!e);
  /** Свои юниты в выделении (коровами не командуют) */
  const mine = () => ents().filter((e): e is Unit => e.kind === 'u' && e.owner === ME && !UNITS[e.type].animal);
  const buildings = () => ents().filter((e): e is Building => e.kind === 'b' && e.owner === ME);
  const idleVills = () => [...w.ents.values()].filter((x): x is Unit => x.kind === 'u' && x.owner === ME && UNITS[x.type].cls === 'worker' && x.order.t === 'idle');

  return {
    ids: () => ids,
    has: (id: number) => set.has(id),
    select,
    /** Убрать из выделения погибших */
    refresh() { if (ids.some((id) => !w.ents.has(id))) select(ids); },
    get res() { return res; },
    set res(v: number) { res = v; ctx.hud.touch(); },
    ents, mine, buildings, idleVills,
    isVill: (u: Unit) => UNITS[u.type].cls === 'worker',
    remember(n: number) { groups[n] = [...ids]; },
    recall(n: number) { select(groups[n] ?? []); },
    /** Следующий бездельник: выделить и показать */
    nextIdle() {
      const idle = idleVills();
      if (!idle.length) return;
      const u = idle[idleIdx++ % idle.length];
      select([u.id]);
      ctx.camera.lookAt(u.x / TILE, u.y / TILE);
    },
    /** Вся армия */
    army() { select([...w.ents.values()].filter((u) => u.kind === 'u' && u.owner === ME && UNITS[u.type].cls !== 'worker' && !UNITS[u.type].animal).map((u) => u.id)); },
  };
}
