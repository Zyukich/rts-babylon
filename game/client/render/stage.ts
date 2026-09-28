// Сцена: движок, свет, дымка, камера, постобработка, тени, SSAO.
import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color3, Color4, ShadowGenerator, DefaultRenderingPipeline, ImageProcessingConfiguration, ColorCurves, SSAO2RenderingPipeline, type AbstractMesh } from '@babylonjs/core';
import type { Building } from '../../core/world.ts';
import type { GameContext } from '../context.ts';

export function useStage(ctx: GameContext, canvas: HTMLCanvasElement) {
  const { S } = ctx, { w, ME } = ctx.session;
  const engine = new Engine(canvas, S.msaa);
  engine.setHardwareScalingLevel(1 / S.renderScale); // разрешение рендера
  const scene = new Scene(engine);
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
  pipe.fxaaEnabled = S.fxaa;
  pipe.imageProcessingEnabled = true;
  pipe.imageProcessing.toneMappingEnabled = true;
  pipe.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL; // мягче ACES, цвета не тускнеют
  pipe.imageProcessing.exposure = 1.05;
  pipe.imageProcessing.contrast = 1.1;
  pipe.imageProcessing.vignetteEnabled = S.vignette;
  pipe.imageProcessing.vignetteWeight = 0.5;
  pipe.imageProcessing.colorCurvesEnabled = true; // сочнее цвета — ближе к стилизации
  const curves = new ColorCurves();
  curves.globalSaturation = S.saturation;
  pipe.imageProcessing.colorCurves = curves;
  pipe.bloomEnabled = S.bloom; pipe.bloomThreshold = 1.0; pipe.bloomWeight = 0.1; // светятся только блики и огонь, не трава

  const shadow = new ShadowGenerator(S.shadows || 1024, sun);
  if (!S.shadows) sun.shadowEnabled = false;
  shadow.usePercentageCloserFiltering = true;
  shadow.bias = 0.004;
  shadow.filteringQuality = ShadowGenerator.QUALITY_HIGH; shadow.darkness = 0.35; // мягкие светлые тени

  // Мягкое затенение в углах и у земли (SSAO) — объём, как в современных стилизованных играх. P — вкл/выкл
  let ssaoOn = false, ssaoMade = false;
  function enableSsao(skip: (m: AbstractMesh) => boolean) { // вызывается, когда вся сцена собрана
    if (!S.ssao) return;
    try {
      const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [cam]);
      ssao.radius = 1.2; ssao.totalStrength = 1.0; ssao.samples = 8; ssao.expensiveBlur = false;
      const gbr = scene.enableGeometryBufferRenderer();
      ssaoMade = ssaoOn = true;
      if (gbr) gbr.renderList = scene.meshes.filter((m) => !skip(m)); // трава и дымка — без AO (дорого и не нужно)
    } catch (e) { console.warn('SSAO недоступен', e); }
  }
  function toggleSsao() {
    if (!ssaoMade) return;
    ssaoOn = !ssaoOn;
    const m = scene.postProcessRenderPipelineManager;
    if (ssaoOn) m.attachCamerasToRenderPipeline('ssao', cam); else m.detachCamerasFromRenderPipeline('ssao', cam);
  }

  ctx.life.listen(window, 'resize', () => engine.resize());
  ctx.life.onDispose(() => { engine.stopRenderLoop(); scene.dispose(); engine.dispose(); });
  return { canvas, engine, scene, sun, cam, pipe, shadow, enableSsao, toggleSsao };
}
