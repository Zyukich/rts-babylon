// Приказы выделенным: ПКМ по земле/врагу/ресурсу/стройке/рынку, точки сбора зданий, формации отряда.
import { BUILDINGS, UNITS } from '../../data/index.ts';
import { relOf, type Building } from '../../core/world.ts';
import { maxHp } from '../../core/civ.ts';
import { SFX } from '../audio/sfx.ts';
import type { GameContext } from '../context.ts';

// Формация отряда: 0 квадрат, 1 линия, 2 клин, 3 черепаха (Z — следующая). Запоминается между партиями
export const FORMS: { icon: string; name: string; desc: string }[] = [
  { icon: '▦', name: 'Квадрат', desc: 'Обычный плотный строй' },
  { icon: '☰', name: 'Линия', desc: 'Широкий фронт в 1–3 шеренги: рукопашные впереди, стрелки сзади' },
  { icon: '▲', name: 'Клин', desc: 'Остриём к цели — прорыв строя противника' },
  { icon: '⛨', name: 'Черепаха', desc: 'Плотный квадрат: рукопашные по краям, стрелки внутри' },
];

export function useOrders(ctx: GameContext) {
  const { w, ME, send } = ctx.session, fog = ctx.fog, sel = ctx.sel, pick = ctx.pick;
  let form = (() => { try { return Number(localStorage.getItem('epohi-form')) || 0; } catch { return 0; } })();
  const setForm = (f: number) => {
    form = ((f % FORMS.length) + FORMS.length) % FORMS.length;
    try { localStorage.setItem('epohi-form', String(form)); } catch { /* приватный режим */ }
    ctx.hud.touch();
  };

  /** Клетка для точки сбора: своё поле, ресурс или земля */
  function rallyTile(sx: number, sy: number) {
    const e = pick.entityAt(sx, sy);
    if (e && e.kind === 'b' && e.type === 'farm' && e.owner === ME) return e.tx + e.ty * w.W;
    const r = pick.resAt(sx, sy);
    return r >= 0 ? r : pick.tileAt(sx, sy);
  }

  /** ПКМ по точке экрана. amove — атака с движением, q — в очередь (Shift) */
  function order(sx: number, sy: number, amove = false, q = false) {
    const all = sel.ids(), bsel = sel.buildings();
    if (bsel.length && bsel.length === all.length) { // ПКМ зданиями — точка сбора (на ресурс/поле — сразу работать)
      const t = rallyTile(sx, sy);
      if (t >= 0) for (const b of bsel) send({ p: ME, t: 'rally', building: b.id, x: t % w.W, y: (t / w.W) | 0 });
      return;
    }
    const mine = sel.mine();
    if (!mine.length) return;
    const ids = mine.map((u) => u.id), vills = mine.filter(sel.isVill).map((u) => u.id);
    const t = pick.entityAt(sx, sy);
    if (t && t.kind === 'u' && UNITS[t.type].animal && t.owner === ME) { SFX.attack(); return send({ p: ME, q, t: 'attack', units: ids, target: t.id }); } // забить корову
    if (t && relOf(w, ME, t.owner) < 3) { SFX.attack(); return send({ p: ME, q, t: 'attack', units: ids, target: t.id }); } // мир и союз — не атакуем (вражда/нейтралитет — это объявление войны)
    const traders = mine.filter((u) => UNITS[u.type].cls === 'trade').map((u) => u.id);
    if (!amove && t && t.kind === 'b' && t.type === 'market' && traders.length) return send({ p: ME, q, t: 'route', units: traders, target: t.id }); // повозки — торговать с этим рынком
    if (!amove && t && t.kind === 'b' && vills.length) {
      if (t.progress < BUILDINGS[t.type].time || t.hp < maxHp(w, t)) return send({ p: ME, q, t: 'assist', units: vills, target: t.id }); // стройка или ремонт
      if (t.type === 'farm') return send({ p: ME, q, t: 'farm', units: [vills[0]], target: t.id });
    }
    const g = pick.groundAt(sx, sy);
    if (g) orderTile(Math.floor(g.x), Math.floor(g.z), amove, q);
  }

  /** Приказ на клетку (и с миникарты) */
  function orderTile(tx: number, ty: number, amove = false, q = false) {
    const mine = sel.mine(), ids = mine.map((u) => u.id), vills = mine.filter(sel.isVill).map((u) => u.id);
    if (!ids.length) return;
    const i = tx + ty * w.W;
    if (!amove && w.resType[i] && fog.seen[i] && vills.length) {
      send({ p: ME, q, t: 'gather', units: vills, tile: i });
      const others = ids.filter((id) => !vills.includes(id));
      if (others.length) send({ p: ME, q, t: 'move', units: others, x: tx, y: ty });
      return;
    }
    const f = form && mine.some((u) => !sel.isVill(u)) ? form : 0; // строем ходят войска; одни жители — как раньше
    send(f ? { p: ME, q, t: amove ? 'amove' : 'move', units: ids, x: tx, y: ty, f } : { p: ME, q, t: amove ? 'amove' : 'move', units: ids, x: tx, y: ty });
  }

  /** Простые команды выделенным */
  const stop = () => { const u = sel.mine(); if (u.length) send({ p: ME, t: 'stop', units: u.map((x) => x.id) }); };
  const destroy = () => { const ids = sel.ids().filter((id) => w.ents.get(id)?.owner === ME); if (ids.length) send({ p: ME, t: 'destroy', ids }); };
  const toCapital = () => {
    const tc = [...w.ents.values()].find((x): x is Building => x.kind === 'b' && x.owner === ME && x.type === 'town_center');
    if (tc) { sel.select([tc.id]); ctx.camera.lookAt(tc.tx + 1.5, tc.ty + 1.5); }
  };
  return { order, orderTile, stop, destroy, toCapital, get form() { return form; }, setForm };
}
