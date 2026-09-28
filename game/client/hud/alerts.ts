// События симуляции → звук, тревога «нас атакуют» (Пробел — туда), общие новости мира баннером.
import { TILE } from '../../data/index.ts';
import type { Fx } from '../../core/world.ts';
import { SFX } from '../audio/sfx.ts';
import type { GameContext } from '../context.ts';

const ALERT_MS = 6000, ALERT_COOLDOWN = 15000, NEWS_MS = 7000;

export function useAlerts(ctx: GameContext) {
  const { w, ME, who } = ctx.session, fog = ctx.fog;
  let lastHit = 0, lastAlert = -1e9, at: [number, number] | null = null, news = '', newsUntil = 0;
  const names = (s: string) => s.replace(/P(\d)/g, (_, n) => who(Number(n)));

  function onFx(f: Fx) {
    if (f.k === 'news') { // общее событие: баннер + сигнал
      const c = [...w.chron].reverse().find((c) => c.p < 0);
      if (!c) return;
      news = names(c.text); newsUntil = performance.now() + NEWS_MS;
      SFX.news();
      ctx.hud.touch();
      return;
    }
    ctx.effects.spawn(f);
    const now = performance.now(), x = f.x / TILE, y = f.y / TILE, seen = fog.vis[(x | 0) + (y | 0) * w.W];
    if (f.owner === ME && f.k === 'spawn') SFX.train();
    else if (f.owner === ME && f.k === 'built') SFX.built();
    else if (f.owner === ME && f.k === 'age') SFX.age();
    else if (f.k === 'die' && seen) SFX.die();
    else if (f.k === 'hit') {
      if (seen && now - lastHit > 120) { SFX.hit(); lastHit = now; }
      const cam = ctx.camera.view();
      if (f.owner === ME && now - lastAlert > ALERT_COOLDOWN && Math.hypot(x - cam.x, y - cam.z) > 20) { SFX.alert(); lastAlert = now; at = [x, y]; ctx.hud.touch(); }
    }
  }
  return {
    onFx, names,
    attacked: () => performance.now() - lastAlert < ALERT_MS,
    news: () => (performance.now() < newsUntil ? news : ''),
    /** Камера к месту последней атаки; false — атак не было */
    jump() { if (!at) return false; ctx.camera.lookAt(at[0], at[1]); return true; },
  };
}
