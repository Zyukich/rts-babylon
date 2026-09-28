// Клиент партии: createGame(canvas, options) собирает сцену, ввод и интерфейс из модулей use*(ctx) и запускает цикл.
// Симуляция идёт шагами по 100 мс (детерминированно, как на сервере), рендер — с частотой монитора, между шагами плавно.
import { BUILDINGS, TICK_MS } from '../data/index.ts';
import { hash } from '../core/world.ts';
import { step, type Command } from '../core/sim/index.ts';
import { createLifecycle, type GameContext, type GameOptions } from './context.ts';
import type { Settings } from './settings.ts';
import { useSession } from './session.ts';
import { useStage } from './render/stage.ts';
import { useLayers } from './render/layers.ts';
import { useTerrain } from './render/terrain.ts';
import { useWater } from './render/water.ts';
import { useSky } from './render/sky.ts';
import { useModels } from './render/models.ts';
import { useGround } from './render/ground.ts';
import { useSkirt, SKIRT } from './render/skirt.ts';
import { useBlades } from './render/blades.ts';
import { useResources } from './render/resources.ts';
import { useEffects } from './render/effects.ts';
import { useEntities } from './render/entities.ts';
import { useBorders } from './render/borders.ts';
import { createMinimap } from './render/minimap.ts';
import { Fog } from './render/fog.ts';
import { setWind } from './render/models/nature.ts';
import { fetchManifest, loadAssets, ASSETS_ROOT } from './assets/loader.ts';
import { setVolume, loadSounds } from './audio/sfx.ts';
import { useSelection } from './input/selection.ts';
import { usePicking } from './input/picking.ts';
import { useOrders } from './input/orders.ts';
import { usePlacement } from './input/placement.ts';
import { useCamera } from './input/camera.ts';
import { useControls } from './input/controls.ts';
import { useAlerts } from './hud/alerts.ts';
import { useHud } from './hud/hud.ts';

export type { GameOptions } from './context.ts';
export type { HudState } from './hud/types.ts';

export interface Game {
  /** Действие интерфейса: кнопка панели, уведомление, дипломатия, 'pause' … */
  act(action: string): void;
  /** Применить изменённые настройки игрока на ходу (графика, звук, управление, интерфейс) */
  applySettings(s: Settings): void;
  /** Подключить canvas миникарты (возвращает отключение) */
  attachMinimap(canvas: HTMLCanvasElement): () => void;
  /** Остановить партию и освободить всё: WebGL, слушатели, таймеры */
  dispose(): void;
}

export async function createGame(canvas: HTMLCanvasElement, opts: GameOptions): Promise<Game> {
  const ctx = { opts, S: { ...opts.settings }, life: createLifecycle() } as GameContext;
  const progress = (t: string, f: number) => opts.onProgress?.(t, Math.max(0, Math.min(1, f)));
  let alive = true;
  const dispose = () => { if (alive) { alive = false; ctx.life.dispose(); } };
  try {
    ctx.session = useSession(opts);
    const { w, ME, net, bots, pending } = ctx.session;
    setVolume((ctx.S.master / 100) * (ctx.S.sfx / 100));
    // ---------- сцена ----------
    ctx.stage = useStage(ctx, canvas);
    ctx.gfx = useLayers(ctx.stage.scene);
    ctx.terrain = useTerrain(ctx);
    ctx.fog = new Fog(w, ME, ctx.stage.scene, SKIRT, ctx.session.fogMode);
    const water = useWater(ctx), sky = useSky(ctx.stage.scene);
    ctx.models = useModels(ctx);
    ctx.hud = useHud(ctx);
    // ---------- настоящие модели и текстуры (если собраны: npm run assets) ----------
    progress('Строим мир', 0.05);
    const man = await fetchManifest();
    ctx.assets = man ? await loadAssets(ctx.stage.scene, man, (m, perColor) => ctx.gfx.layer(m, null, perColor), BUILDINGS, (t, f) => progress(t, 0.1 + f * 0.75))
      .catch((e) => { console.warn('Ассеты не загрузились, рисуем процедурно', e); return null; }) : null;
    if (!alive) return { act() {}, applySettings() {}, attachMinimap: () => () => {}, dispose };
    progress('Земля, лес и вода', 0.87);
    await new Promise((r) => setTimeout(r, 0));
    void loadSounds(man?.sounds, ASSETS_ROOT);
    for (const l of ctx.assets?.layers ?? []) ctx.stage.shadow.addShadowCaster(l.mesh);
    ctx.ground = useGround(ctx);
    ctx.skirt = useSkirt(ctx);
    ctx.blades = useBlades(ctx);
    ctx.resources = useResources(ctx);
    ctx.effects = useEffects(ctx);
    ctx.ents = useEntities(ctx);
    ctx.borders = useBorders(ctx);
    const minimap = createMinimap(w, ctx.fog);
    // ---------- ввод ----------
    ctx.camera = useCamera(ctx);
    ctx.sel = useSelection(ctx);
    ctx.pick = usePicking(ctx);
    ctx.orders = useOrders(ctx);
    ctx.place = usePlacement(ctx);
    ctx.alerts = useAlerts(ctx);
    ctx.controls = useControls(ctx);
    ctx.stage.enableSsao((m) => m === ctx.blades.mesh || m === ctx.fog.mesh || m.name === 'water' || m.name === 'sky');
    for (const m of ctx.stage.scene.meshes) if (['g', 'skirt', 'water', 'sky'].includes(m.name)) m.freezeWorldMatrix(); // неподвижная геометрия
    progress('Шейдеры и текстуры', 0.93);
    let ready = false;
    ctx.stage.scene.executeWhenReady(() => { // шейдеры собраны, текстуры загружены — ждём пару отрисованных кадров и открываем игру
      let n = 0;
      const obs = ctx.stage.scene.onAfterRenderObservable.add(() => {
        if (++n < 3) return;
        ctx.stage.scene.onAfterRenderObservable.remove(obs);
        ready = true; progress('Готово', 1); opts.onReady?.();
        if (net) { net.ready(); if (!net.queue.length && w.tick === 0) ctx.hud.setMessage('Ждём, пока загрузятся остальные игроки…'); }
      });
    });

    // ---------- цикл: симуляция 10 Гц, рендер — сколько тянет монитор ----------
    if (net) {
      net.onDesync = (t) => ctx.hud.setMessage(`Рассинхрон на тике ${t}`);
      net.onNotice = (t) => ctx.hud.setMessage(t);
    }
    function doStep(cmds: Command[]) {
      if (w.tick === 0 && net) ctx.hud.setMessage(''); // время пошло — убираем «ждём игроков»
      ctx.ents.beforeStep();
      step(w, cmds);
      ctx.hud.onStep();
      if (ctx.ground.onTick()) ctx.blades.dirty();
      for (const f of w.fx) ctx.alerts.onFx(f);
      if (w.tick % 50 === 0) ctx.ents.prune();
      if (net && w.tick % 50 === 0) net.hash(w.tick, hash(w)); // сервер сверит с собой
    }
    let acc = 0, frame = 0, lastNb = -1, lastFrame = performance.now(), loopErr = false, mmCanvas: HTMLCanvasElement | null = null;
    const colors = w.players.map((p) => ctx.session.hex(p.id));
    const { engine, scene } = ctx.stage, S = ctx.S, speed = ctx.session.speed;
    engine.runRenderLoop(() => {
      const now = performance.now(), t = now / 1000;
      try {
        if (S.fpsLimit && now - lastFrame < 1000 / S.fpsLimit - 1) return; // ограничение FPS
        const dt = Math.min(250, now - lastFrame);
        lastFrame = now;
        acc = ctx.hud.paused || !ready ? 0 : Math.min(acc + dt, 500); // пока грузится — время стоит
        const tick = TICK_MS / speed; // скорость игры из меню
        if (!net) while (acc >= tick && w.winner < 0) { acc -= tick; doStep([...pending.splice(0), ...bots.flatMap((b) => b.think(w))]); }
        else { // шагаем только по пакетам сервера: отстали — догоняем, пакета нет — ждём
          let k = 0;
          while (net.queue.length && (acc >= TICK_MS || net.queue.length > 2) && k++ < 20) { acc = Math.max(0, acc - TICK_MS); doStep(net.queue.shift()!.cmds); }
          if (!net.queue.length) acc = Math.min(acc, TICK_MS);
        }
        if (frame++ % 6 === 0) { // туман, ресурсы, границы, миникарта — не каждый кадр
          ctx.fog.update(); ctx.fog.draw();
          const dirty = ctx.fog.changed;
          ctx.fog.changed = false;
          ctx.resources.draw();
          let nb = 0;
          for (const e of w.ents.values()) if (e.kind === 'b') nb += e.id; // набор зданий изменился — траву под ними убрать
          if (dirty || nb !== lastNb) { lastNb = nb; ctx.blades.dirty(); }
          ctx.borders.draw();
          if (mmCanvas) minimap.draw(mmCanvas, ctx.camera.view(), colors);
        }
        ctx.camera.update(dt);
        if (ready && !document.hidden) ctx.stage.govern(now, (what) => ctx.hud.notice(`⚙ Для плавности отключено: ${what}. Автонастройку можно выключить в настройках`));
        ctx.ents.draw(Math.min(1, acc / tick));
        ctx.hud.frame(now);
      } catch (err) {
        if (!loopErr) { loopErr = true; console.error('Ошибка кадра (игра продолжается):', err); }
        if (net) ctx.hud.setMessage('Ошибка симуляции — возможен рассинхрон, см. консоль'); // упавший на полпути step() в сети — уже рассинхрон
      }
      setWind(S.wind ? t : 0);
      sky.frame(t); water.frame(t); ctx.blades.frame(t);
      scene.render();
    });

    return {
      act: (a) => ctx.hud.act(a),
      applySettings(s) {
        const graphicsChanged = (['renderScale', 'fxaa', 'bloom', 'vignette', 'saturation', 'shadows', 'ssao', 'autoQuality', 'grass'] as (keyof Settings)[]).some((k) => s[k] !== ctx.S[k]);
        Object.assign(ctx.S, s);
        setVolume((s.master / 100) * (s.sfx / 100));
        if (graphicsChanged) ctx.stage.resetAuto(); // игрок сам выбрал графику — автоснижение начинаем заново
        ctx.blades.dirty(); ctx.hud.touch();
      },
      attachMinimap(cv) {
        mmCanvas = cv;
        const off = ctx.controls.attachMinimap(cv);
        return () => { off(); if (mmCanvas === cv) mmCanvas = null; };
      },
      dispose,
    };
  } catch (e) {
    dispose();
    throw e;
  }
}
