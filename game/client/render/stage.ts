// Сцена: движок, свет, дымка, камера, постобработка, тени, SSAO.
// Настройки графики применяются на ходу (apply), а автонастройка качества снижает нагрузку, если FPS проседает.
import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color3, Color4, ShadowGenerator, DefaultRenderingPipeline, ImageProcessingConfiguration, ColorCurves, SSAO2RenderingPipeline, RenderTargetTexture, type AbstractMesh } from '@babylonjs/core';
import type { Building } from '../../core/world.ts';
import type { Settings } from '../settings.ts';
import type { GameContext } from '../context.ts';

// Ступени автоснижения качества: что отключаем по очереди, пока FPS не станет нормальным
const STEPS: [string, (s: Settings) => void][] = [
  ['мягкое затенение', (s) => { s.ssao = false; }],
  ['разрешение 85%', (s) => { s.renderScale = Math.min(s.renderScale, 0.85); }],
  ['тени попроще', (s) => { s.shadows = Math.min(s.shadows, 1024); }],
  ['свечение', (s) => { s.bloom = false; }],
  ['разрешение 70%', (s) => { s.renderScale = Math.min(s.renderScale, 0.7); }],
  ['тени', (s) => { s.shadows = 0; }],
  ['трава', (s) => { s.grass = 0; }],
];

export function useStage(ctx: GameContext, canvas: HTMLCanvasElement) {
  const { S } = ctx, { w, ME } = ctx.session;
  const engine = new Engine(canvas, S.msaa, { powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
  const scene = new Scene(engine);
  scene.skipPointerMovePicking = true; // объекты под курсором ищем сами — встроенный пикинг на каждое движение мыши дорог
  scene.clearColor = new Color4(0.72, 0.82, 0.92, 1); // горизонт — в цвет дымки, без резкой границы
  const hemi = new HemisphericLight('h', new Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.45; hemi.diffuse = new Color3(0.8, 0.87, 1); hemi.groundColor = new Color3(0.55, 0.48, 0.38); // голубое небо сверху, тёплый отсвет земли — тени цветные, не чёрные
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.007; scene.fogColor = new Color3(0.72, 0.82, 0.92); // дымка вдали
  const sun = new DirectionalLight('s', new Vector3(-0.5, -1.2, 0.4), scene);
  sun.intensity = 1.0;
  sun.diffuse = new Color3(1, 0.95, 0.84); // тёплое солнце, как в War Selection / AoE III
  sun.position = new Vector3(w.W / 2 + 40, 80, w.H / 2 - 30);

  const tc0 = [...w.ents.values()].find((e): e is Building => e.kind === 'b' && e.owner === ME);
  const cam = new ArcRotateCamera('cam', -Math.PI / 2, 0.92, 32, new Vector3(tc0 ? tc0.tx + 1.5 : w.W / 2, 0, tc0 ? tc0.ty + 1.5 : w.H / 2), scene);
  cam.lowerRadiusLimit = 9; cam.upperRadiusLimit = 90; cam.fov = 0.62; // меньше искажений по краям, как в AoE3
  cam.inertia = 0.85; // зум колесом с плавным доводом
  cam.inputs.removeByType('ArcRotateCameraPointersInput'); // ЛКМ нужна для выделения
  cam.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
  cam.attachControl(canvas, true);

  // Постобработка: сглаживание, киношная тонировка, лёгкое свечение и виньетка
  const pipe = new DefaultRenderingPipeline('pp', true, scene, [cam]);
  pipe.imageProcessingEnabled = true;
  pipe.imageProcessing.toneMappingEnabled = true;
  pipe.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL; // мягче ACES, цвета не тускнеют
  pipe.imageProcessing.exposure = 1.05;
  pipe.imageProcessing.contrast = 1.1;
  pipe.imageProcessing.vignetteWeight = 0.5;
  pipe.imageProcessing.colorCurvesEnabled = true; // сочнее цвета — ближе к стилизации
  const curves = new ColorCurves();
  pipe.imageProcessing.colorCurves = curves;
  pipe.bloomThreshold = 1.0; pipe.bloomWeight = 0.1; // светятся только блики и огонь, не трава

  const shadow = new ShadowGenerator(S.shadows || 1024, sun);
  shadow.usePercentageCloserFiltering = true;
  shadow.bias = 0.004;
  shadow.filteringQuality = ShadowGenerator.QUALITY_HIGH; shadow.darkness = 0.35; // мягкие светлые тени
  shadow.getShadowMap()!.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYTWOFRAMES; // тени через кадр — глазу незаметно, GPU вдвое легче

  // Мягкое затенение в углах и у земли (SSAO) — объём, как в современных стилизованных играх
  let ssao: SSAO2RenderingPipeline | null = null, ssaoOn = false, aoSkip: ((m: AbstractMesh) => boolean) | null = null;
  function setSsao(on: boolean) {
    if (on && !ssao && aoSkip) try {
      ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [cam]);
      ssao.radius = 1.2; ssao.totalStrength = 1.0; ssao.samples = 8; ssao.expensiveBlur = false;
      const gbr = scene.enableGeometryBufferRenderer();
      if (gbr) gbr.renderList = scene.meshes.filter((m) => !aoSkip!(m)); // трава и дымка — без AO (дорого и не нужно)
      ssaoOn = true;
    } catch (e) { console.warn('SSAO недоступен', e); ssao = null; }
    if (!ssao || on === ssaoOn) return;
    ssaoOn = on;
    const m = scene.postProcessRenderPipelineManager;
    if (on) m.attachCamerasToRenderPipeline('ssao', cam); else m.detachCamerasFromRenderPipeline('ssao', cam);
  }

  // ---------- Применение настроек: ручные + автоснижение ----------
  let auto = 0, shadowsForced: boolean | null = null; // shadowsForced — переключатель клавишей O поверх настроек
  const eff: Settings = { ...S }; // действующие настройки (с учётом автоснижения)
  function apply() {
    Object.assign(eff, S);
    if (S.autoQuality) for (let i = 0; i < auto; i++) STEPS[i][1](eff);
    engine.setHardwareScalingLevel(1 / eff.renderScale);
    pipe.fxaaEnabled = eff.fxaa;
    pipe.bloomEnabled = eff.bloom;
    pipe.imageProcessing.vignetteEnabled = eff.vignette;
    curves.globalSaturation = eff.saturation;
    const sm = shadow.getShadowMap()!;
    if (eff.shadows && sm.getSize().width !== eff.shadows) sm.resize(eff.shadows);
    sun.shadowEnabled = shadowsForced ?? eff.shadows > 0;
    setSsao(eff.ssao);
  }
  apply();

  // ---------- Автонастройка: FPS ниже порога 3 секунды подряд — снимаем следующую ступень ----------
  let frames = 0, since = 0, calmUntil = 0;
  function govern(now: number, onDrop: (what: string) => void) {
    if (!S.autoQuality || auto >= STEPS.length) return;
    if (!since) since = now;
    frames++;
    if (now - since < 3000) return;
    const fps = (frames * 1000) / (now - since), target = S.fpsLimit && S.fpsLimit < 50 ? S.fpsLimit * 0.85 : 40;
    frames = 0; since = now;
    if (now < calmUntil || fps >= target) return;
    auto++; calmUntil = now + 2000; // после ступени — дать FPS устояться
    apply();
    onDrop(STEPS[auto - 1][0]);
  }

  ctx.life.listen(window, 'resize', () => engine.resize());
  ctx.life.onDispose(() => { engine.stopRenderLoop(); scene.dispose(); engine.dispose(); });
  return {
    canvas, engine, scene, sun, cam, pipe, shadow, eff, apply, govern,
    /** Включить SSAO, когда сцена собрана (skip — что не затенять) */
    enableSsao(skip: (m: AbstractMesh) => boolean) { aoSkip = skip; setSsao(eff.ssao); },
    toggleSsao() { S.ssao = !S.ssao; apply(); },
    toggleShadows() { shadowsForced = !sun.shadowEnabled; sun.shadowEnabled = shadowsForced; },
    /** Сбросить автоснижение (после ручной смены настроек) */
    resetAuto() { auto = 0; frames = 0; since = 0; apply(); },
  };
}
