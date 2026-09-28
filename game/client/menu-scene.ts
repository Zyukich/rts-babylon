// Фон главного меню: маленькая битва — воины спавнятся с двух сторон и сходятся в бою. Возвращает dispose().
import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial, Color3, Color4, ShadowGenerator, DefaultRenderingPipeline, TransformNode, VertexBuffer, VertexData, type Mesh } from '@babylonjs/core';
import { makeModels } from './render/models/procedural.ts';
import { makeNature, setWind } from './render/models/nature.ts';

export function createMenuScene(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, true), scene = new Scene(engine);
  scene.clearColor = new Color4(0.72, 0.82, 0.92, 1);
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.028; scene.fogColor = new Color3(0.72, 0.82, 0.92);
  const hemi = new HemisphericLight('h', new Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.8; hemi.diffuse = new Color3(0.78, 0.87, 1); hemi.groundColor = new Color3(0.5, 0.42, 0.33);
  const sun = new DirectionalLight('s', new Vector3(-0.5, -1.2, 0.4), scene);
  sun.position = new Vector3(20, 40, -15); sun.intensity = 1.05; sun.diffuse = new Color3(1, 0.93, 0.8);
  const sh = new ShadowGenerator(1024, sun);
  sh.usePercentageCloserFiltering = true; sh.darkness = 0.35;
  const cam = new ArcRotateCamera('c', -Math.PI / 2, 1.15, 16, new Vector3(3, 0.6, 0), scene);
  const pipe = new DefaultRenderingPipeline('pp', true, scene, [cam]);
  pipe.fxaaEnabled = true; pipe.bloomEnabled = true; pipe.bloomWeight = 0.15;
  pipe.imageProcessing.vignetteEnabled = true; pipe.imageProcessing.vignetteWeight = 2.2;

  const g = MeshBuilder.CreateGround('g', { width: 90, height: 90, subdivisions: 90, updatable: true }, scene);
  const p = g.getVerticesData(VertexBuffer.PositionKind)!, col: number[] = [];
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], z = p[i + 2], d = Math.hypot(x, z), n = Math.sin(x * 1.3) * Math.cos(z * 1.1) * 0.04;
    p[i + 1] = d > 12 ? (Math.sin(x * 0.3) * Math.cos(z * 0.25) + 1.2) * 0.5 * Math.min(1, (d - 12) / 10) : 0;
    col.push(0.36 + n, 0.56 + n, 0.24, 1);
  }
  g.updateVerticesData(VertexBuffer.PositionKind, p);
  g.setVerticesData(VertexBuffer.ColorKind, col);
  const nr: number[] = [];
  VertexData.ComputeNormals(p, g.getIndices()!, nr);
  g.updateVerticesData(VertexBuffer.NormalKind, nr);
  const gm = new StandardMaterial('gm', scene); gm.specularColor = Color3.Black(); g.material = gm; g.receiveShadows = true;

  const K = makeModels(scene), N = makeNature(scene);
  for (const m of [...Object.values(K.things).flat(), ...Object.values(K.res), ...Object.values(N)]) m?.setEnabled(false); // шаблоны
  const clone = (m: Mesh | null, parent: TransformNode) => { if (!m) return null; const c = m.clone(m.name + '_c', parent)!; c.setEnabled(true); sh.addShadowCaster(c); return c; };
  for (let i = 0; i < 70; i++) { // лес вокруг поляны
    const a = Math.random() * Math.PI * 2, r = 13 + Math.random() * 18, pine = Math.random() < 0.6, t = new TransformNode('t', scene);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); t.rotation.y = Math.random() * 6; t.scaling.setAll(1.3 + Math.random() * 0.9);
    clone(pine ? N.pineT : N.oakT, t); clone(pine ? N.pineL : N.oakL, t);
  }
  for (let i = 0; i < 8; i++) { const t = new TransformNode('r', scene); t.position.set((Math.random() - 0.5) * 20, 0, 6 + Math.random() * 6); t.scaling.setAll(1.5); clone(N['rock' + (i % 3)], t); }

  const TEAM = [new Color3(0.2, 0.45, 1), new Color3(0.9, 0.2, 0.2)].map((c, i) => { const m = new StandardMaterial('team' + i, scene); m.diffuseColor = c; m.specularColor = Color3.Black(); return m; });
  const TYPES = ['spearman', 'swordsman', 'clubman', 'archer', 'horseman', 'spearman', 'swordsman'];
  interface U { root: TransformNode; side: number; type: string; st: 'walk' | 'fight' | 'die'; t: number; dur: number; x: number; z: number; tx: number; id: number; shot: number }
  const us: U[] = [];
  const spawn = (u: U) => {
    u.x = u.side * (16 + Math.random() * 8); u.z = (Math.random() - 0.5) * 11;
    u.tx = u.side * (u.type === 'archer' ? 6 + Math.random() * 2 : 0.5 + Math.random() * 1.4);
    u.st = 'walk'; u.t = 0; u.root.rotation.set(0, u.side > 0 ? -Math.PI / 2 : Math.PI / 2, 0); u.root.position.y = 0;
  };
  for (const side of [-1, 1]) for (let i = 0; i < TYPES.length; i++) {
    const root = new TransformNode('u', scene), type = TYPES[i], [b, t] = K.things[type];
    clone(b, root); const tc = clone(t, root); if (tc) tc.material = TEAM[side < 0 ? 0 : 1];
    const u: U = { root, side, type, st: 'walk', t: 0, dur: 0, x: 0, z: 0, tx: 0, id: us.length, shot: 0 };
    spawn(u); u.x = side * (3 + Math.random() * 14); us.push(u);
  }
  const arrows: { m: Mesh; x0: number; z0: number; x1: number; z1: number; t: number }[] = [];
  let time = 0;
  engine.runRenderLoop(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    time += dt; setWind(time); cam.alpha += dt * 0.03;
    for (const u of us) {
      u.t += dt;
      if (u.st === 'walk') {
        u.x -= u.side * (u.type === 'horseman' ? 3.2 : 1.8) * dt;
        u.root.position.y = Math.abs(Math.sin(time * 9 + u.id)) * 0.06;
        if (Math.abs(u.x) <= Math.abs(u.tx)) { u.st = 'fight'; u.t = 0; u.dur = 3 + Math.random() * 6; }
      } else if (u.st === 'fight') {
        const k = Math.max(0, Math.sin(u.t * 7 + u.id)); // выпады
        u.root.position.x = u.x - u.side * k * 0.18; u.root.position.y = 0;
        if (u.type === 'archer' && (u.shot -= dt) <= 0) { // стрелы через поле боя
          u.shot = 1 + Math.random(); const m = K.res.arrow.clone('a')!; m.setEnabled(true);
          arrows.push({ m, x0: u.x, z0: u.z, x1: -u.side * (1 + Math.random() * 3), z1: u.z + (Math.random() - 0.5) * 4, t: 0 });
        }
        if (u.t > u.dur) { if (Math.random() < 0.5) { u.st = 'die'; u.t = 0; } else { u.t = 0; u.dur = 2 + Math.random() * 5; } }
        continue;
      } else { // падает набок, лежит, уходит в землю — и снова в строй
        u.root.rotation.z = u.side * (Math.PI / 2) * Math.min(1, u.t / 0.5);
        if (u.t > 2.5) u.root.position.y -= dt * 0.6;
        if (u.t > 4) { u.root.rotation.z = 0; spawn(u); }
      }
      u.root.position.x = u.x; u.root.position.z = u.z;
    }
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i]; a.t += dt / 0.9;
      if (a.t >= 1) { a.m.dispose(); arrows.splice(i, 1); continue; }
      a.m.position.set(a.x0 + (a.x1 - a.x0) * a.t, 0.7 + Math.sin(a.t * Math.PI) * 2, a.z0 + (a.z1 - a.z0) * a.t);
      a.m.rotation.y = Math.atan2(a.x1 - a.x0, a.z1 - a.z0);
    }
    scene.render();
  });
  const onResize = () => engine.resize();
  addEventListener('resize', onResize);
  return () => { removeEventListener('resize', onResize); engine.stopRenderLoop(); scene.dispose(); engine.dispose(); };
}
