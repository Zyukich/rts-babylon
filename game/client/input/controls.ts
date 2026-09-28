// Мышь и клавиатура: выделение рамкой и кликом, приказы ПКМ, размещение, горячие клавиши, миникарта.
import { UNITS, REGION_KINDS } from '../../data/index.ts';
import { SFX } from '../audio/sfx.ts';
import type { GameContext } from '../context.ts';

const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };

export function useControls(ctx: GameContext) {
  const { w, ME, send, debug, who } = ctx.session, { canvas } = ctx.stage, { listen } = ctx.life;
  const { sel, pick, orders, place, camera, hud, fog } = ctx;
  let drag: [number, number] | null = null, amove = false, lastClick = { id: -1, t: 0 };
  const setAmove = (v: boolean) => { amove = v; canvas.style.cursor = v ? 'crosshair' : 'default'; hud.touch(); };

  function hoverAt(sx: number, sy: number) { // подпись региона под курсором
    const t = pick.tileAt(sx, sy);
    if (t < 0) return;
    const r = w.regions[w.region[t]];
    hud.setHover(fog.seen[t] && r ? `📍 ${r.name}${r.owner >= 0 ? ' — ' + who(r.owner) : ''} (${REGION_KINDS[r.kind].desc})` : '');
  }

  listen(canvas, 'contextmenu', (e) => e.preventDefault());
  listen<PointerEvent>(canvas, 'pointerdown', (e) => {
    if (e.button === 2) {
      if (place.active) place.cancel(); else { orders.order(e.clientX, e.clientY, amove, e.shiftKey); SFX.move(); }
      setAmove(false);
      return;
    }
    if (e.button !== 0) return;
    if (amove) { orders.order(e.clientX, e.clientY, true); SFX.attack(); setAmove(false); return; }
    if (place.active) return place.down(e.clientX, e.clientY, e.shiftKey);
    drag = [e.clientX, e.clientY];
  });
  listen<PointerEvent>(window, 'pointermove', (e) => {
    camera.mouse.x = e.clientX; camera.mouse.y = e.clientY; camera.mouse.inside = true;
    if (e.target === canvas) hoverAt(e.clientX, e.clientY);
    if (drag) hud.setBox({ x: Math.min(drag[0], e.clientX), y: Math.min(drag[1], e.clientY), w: Math.abs(e.clientX - drag[0]), h: Math.abs(e.clientY - drag[1]) });
    if (place.active) place.move(e.clientX, e.clientY);
  });
  listen(document, 'mouseleave', () => (camera.mouse.inside = false));
  listen<PointerEvent>(window, 'pointerup', (e) => {
    if (e.button === 0 && place.up(e.clientX, e.clientY, e.shiftKey)) return;
    if (e.button !== 0 || !drag) return;
    const [x0, y0] = drag, x1 = e.clientX, y1 = e.clientY;
    drag = null; hud.setBox(null);
    let ids: number[] = [];
    if (Math.abs(x1 - x0) < 6 && Math.abs(y1 - y0) < 6) {
      const t = pick.entityAt(x1, y1);
      sel.res = -1;
      if (t) {
        ids = [t.id];
        const now = performance.now();
        if (t.owner === ME && lastClick.id === t.id && now - lastClick.t < 350) // двойной клик — все свои такого же типа на экране
          ids = t.kind === 'u' && UNITS[t.type].animal ? ids : [...w.ents.values()].filter((x) => x.owner === ME && x.type === t.type && pick.onScreen(...pick.entPos(x))).map((x) => x.id);
        lastClick = { id: t.id, t: now };
      } else sel.res = pick.resAt(x1, y1); // клик по ресурсу — посмотреть, сколько осталось
    } else {
      const [ax, bx, ay, by] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
      for (const u of w.ents.values()) if (u.kind === 'u' && u.owner === ME && !UNITS[u.type].animal) { // рамка коров не берёт
        const r = pick.unitBox(u); // рамка задела юнита хоть краем
        if (r.x1 >= ax && r.x0 <= bx && r.y1 >= ay && r.y0 <= by) ids.push(u.id);
      }
    }
    sel.select(e.shiftKey ? [...sel.ids(), ...ids] : ids);
  });

  listen<KeyboardEvent>(window, 'keydown', (e) => {
    if (typing(e)) return; // пишут в поле ввода — не мешаем (Delete не должен сносить здания)
    camera.keys.add(e.code);
    const c = e.code;
    if (c === 'F10') { e.preventDefault(); hud.act('menu'); }
    if (c === 'KeyO') ctx.stage.toggleShadows(); // тени вкл/выкл, если тормозит
    if (c === 'KeyP') ctx.stage.toggleSsao();
    if (c === 'Escape') { place.cancel(); setAmove(false); }
    if (c === 'KeyF' && sel.mine().length) setAmove(true); // F + ЛКМ — атака с движением
    if (c === 'KeyZ') orders.setForm(orders.form + 1);
    if (c === 'KeyG') hud.act('diplo');
    if (debug && c === 'F2') { e.preventDefault(); send({ p: ME, t: 'cheat' }); }
    if (debug && c === 'F3') { e.preventDefault(); fog.mode = fog.mode === 'none' ? 'normal' : 'none'; if (fog.mode === 'none') fog.seen.fill(1); fog.changed = true; }
    if (c === 'KeyX') orders.stop();
    if (c === 'Delete') orders.destroy();
    if (c === 'KeyH') orders.toCapital();
    if (c === 'Period') sel.nextIdle();
    if (c === 'Comma') sel.army();
    if (/^Key[A-Z]$/.test(c) && !e.ctrlKey && !e.altKey && !e.metaKey) { // горячие клавиши кнопок панели
      const a = hud.hotkey(c[3]);
      if (a) { hud.act(a); e.preventDefault(); }
    }
    if (c === 'Space' && ctx.alerts.jump()) e.preventDefault();
    const d = c.startsWith('Digit') ? Number(c.slice(5)) : 0;
    if (d >= 1) {
      if (e.ctrlKey || e.shiftKey) { e.preventDefault(); sel.remember(d); } // Ctrl+цифру браузер может занять под вкладки — есть Shift
      else sel.recall(d);
    }
  });
  listen<KeyboardEvent>(window, 'keyup', (e) => camera.keys.delete(e.code));
  listen(window, 'blur', () => camera.keys.clear()); // отпустили клавишу вне окна — камера не должна ехать дальше

  /** Миникарта: ЛКМ — камера туда, ПКМ — приказ туда */
  function attachMinimap(mm: HTMLCanvasElement) {
    const tile = (e: PointerEvent) => { const k = mm.clientWidth / w.W; return [Math.floor(e.offsetX / k), Math.floor(w.H - e.offsetY / k)] as const; };
    const off: (() => void)[] = [];
    const on = <E extends Event>(type: string, fn: (e: E) => void) => { mm.addEventListener(type, fn as EventListener); off.push(() => mm.removeEventListener(type, fn as EventListener)); };
    on('contextmenu', (e) => e.preventDefault());
    on<PointerEvent>('pointerdown', (e) => {
      const [tx, ty] = tile(e);
      if (e.button === 0 && !amove) camera.lookAt(tx, ty);
      else { orders.orderTile(tx, ty, amove); SFX.move(); setAmove(false); }
    });
    on<PointerEvent>('pointermove', (e) => { if (e.buttons === 1 && !amove) { const [tx, ty] = tile(e); camera.lookAt(tx, ty); } });
    return () => off.forEach((f) => f());
  }
  return { attachMinimap, get amove() { return amove; } };
}

