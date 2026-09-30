// Витрина моделей (/models): все юниты и здания из manifest.json рядами, с выбором анимации и цвета игрока.
// Нужна, чтобы проверить новую модель из assets/catalog.json, не запуская партию.
import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color3, Color4, MeshBuilder, StandardMaterial, ShadowGenerator } from '@babylonjs/core';
import { BUILDINGS, NAMES } from '../data/index.ts';
import { useLayers } from './render/layers.ts';
import { fetchManifest, loadAssets, type AnimKey, type Assets } from './assets/loader.ts';
import { US } from './config/visual.ts';

export interface ViewerItem { id: string; name: string; kind: 'unit' | 'building'; anims: AnimKey[] }

export async function createViewer(canvas: HTMLCanvasElement, progress: (t: string) => void) {
  const engine = new Engine(canvas, true), scene = new Scene(engine);
  scene.clearColor = new Color4(0.72, 0.82, 0.92, 1);
  const hemi = new HemisphericLight('h', new Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.55; hemi.groundColor = new Color3(0.55, 0.48, 0.38);
  const sun = new DirectionalLight('s', new Vector3(-0.5, -1.2, 0.4), scene);
  sun.position = new Vector3(20, 40, -20); sun.intensity = 1.1; sun.diffuse = new Color3(1, 0.95, 0.84);
  const cam = new ArcRotateCamera('c', Math.PI / 2, 1.1, 12, Vector3.Zero(), scene);
  cam.lowerRadiusLimit = 1.5; cam.upperRadiusLimit = 80; cam.wheelDeltaPercentage = 0.02; cam.minZ = 0.05;
  cam.attachControl(canvas, true);
  const ground = MeshBuilder.CreateGround('g', { width: 200, height: 200 }, scene), gm = new StandardMaterial('gm', scene);
  gm.diffuseColor = new Color3(0.42, 0.58, 0.3); gm.specularColor = Color3.Black(); ground.material = gm; ground.receiveShadows = true;
  const shadow = new ShadowGenerator(2048, sun); shadow.usePercentageCloserFiltering = true; shadow.darkness = 0.35;
  const { layer } = useLayers(scene);

  const man = await fetchManifest();
  const A: Assets | null = man ? await loadAssets(scene, man, (m, perColor) => layer(m, null, perColor), BUILDINGS, progress) : null;
  for (const l of A?.layers ?? []) shadow.addShadowCaster(l.mesh);
  const items: ViewerItem[] = [
    ...Object.entries(A?.units ?? {}).map(([id, a]) => ({ id, name: NAMES[id] ?? id, kind: 'unit' as const, anims: Object.keys(a) as AnimKey[] })),
    ...Object.keys({ ...A?.staged, ...A?.buildings }).map((id) => ({ id, name: NAMES[id] ?? id, kind: 'building' as const, anims: [] })),
  ];
  let anim: AnimKey = 'idle', color = [0.2, 0.45, 1, 1], focus = '';
  const units = items.filter((i) => i.kind === 'unit'), blds = items.filter((i) => i.kind === 'building');
  const pos = (id: string): [number, number] => { // юниты — первый ряд, здания — второй
    const u = units.findIndex((i) => i.id === id);
    if (u >= 0) return [(u - (units.length - 1) / 2) * 1.4, 0];
    const b = blds.findIndex((i) => i.id === id);
    return [(b - (blds.length - 1) / 2) * 4, -5];
  };
  engine.runRenderLoop(() => {
    const T = performance.now() / 1000;
    for (const l of A?.layers ?? []) l.begin();
    for (const it of units) {
      const a = A!.units[it.id], fr = a[anim] ?? a.idle ?? a.walk!, [x, z] = pos(it.id);
      const f = fr[Math.floor((T / (A!.udur[it.id]?.[anim] ?? 1)) * fr.length) % fr.length];
      f.base.add(x, 0, z, US, US, US, undefined, 0);
      f.team?.add(x, 0, z, US, US, US, color, 0);
    }
    for (const it of blds) {
      const [x, z] = pos(it.id), sg = A!.staged[it.id], cb = A!.buildings[it.id];
      if (sg) { const tiers = sg.length, t = Math.floor(T / 3) % tiers, v = sg[t][0]; v[v.length - 1].add(x, 0, z, 1, 1, 1); } // эпохи пака по очереди
      else cb?.[0]?.add(x, 0, z, 1, 1, 1);
    }
    for (const l of A?.layers ?? []) l.end();
    scene.render();
  });
  const onResize = () => engine.resize();
  addEventListener('resize', onResize);
  return {
    items,
    setAnim(a: AnimKey) { anim = a; },
    setColor(c: number[]) { color = [...c, 1]; },
    /** Камера к модели (пусто — общий вид) */
    focus(id: string) {
      focus = id;
      if (!id) { cam.setTarget(new Vector3(0, 0.5, -2)); cam.radius = Math.max(16, units.length * 1.7); return; }
      const [x, z] = pos(id), b = items.find((i) => i.id === id)?.kind === 'building';
      cam.setTarget(new Vector3(x, b ? 1 : 0.4, z)); cam.radius = b ? 7 : 2.4;
    },
    get focused() { return focus; },
    dispose() { removeEventListener('resize', onResize); engine.stopRenderLoop(); scene.dispose(); engine.dispose(); },
  };
}
