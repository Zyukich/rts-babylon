// Прототип рендера: кубики вместо моделей. Вся логика в симуляции — здесь только отображение и ввод.
import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial, Color3, Color4, Matrix, VertexBuffer, VertexData, ShadowGenerator, DynamicTexture, DefaultRenderingPipeline, ImageProcessingConfiguration, ColorCurves, SSAO2RenderingPipeline, FresnelParameters, ShaderMaterial, Effect, Mesh, Vector2, type Texture } from '@babylonjs/core';
import { makeModels } from './models.ts';
import { loadAssets, type AnimKey } from './assets.ts';
import { makeNature, setWind } from './nature.ts';
import { makeGrass } from './grass.ts';
import { AGE_TIME, MEAT, WHEAT, WHEAT_SOW, WHEAT_TIME, WHEAT_COST } from './defs.ts';
import { researchTime } from './civ.ts';
import { TerrainMaterial, CustomMaterial } from '@babylonjs/materials';
import { createWorld, hash, canPlace, ally, type Entity, type Unit, type Building, type Fx } from './world.ts';
import { step, fmt, nearFarm, type Command } from './sim.ts';
import { Bot, type Level } from './ai.ts';
import { loadSettings, COLORS, type StartCfg } from './settings.ts';
import { setVolume } from './sfx.ts';
import { connect } from './net.ts';
import { maxHp, ageCost, TECHS, BRANCH, BRANCHES, cultureLevel, identity, slotsLeft, queuedTechs, year, NAMES } from './civ.ts';
import { Fog } from './fog.ts';
import { drawMinimap } from './minimap.ts';
import { SFX } from './sfx.ts';
import { REGION_KINDS, TERR_HOLD, WIN_NAMES, FINAL_REQ } from './defs.ts';
const GOAL_LABEL = { eco: 'экономическая победа через', cult: 'культурная победа через', sci: 'Просвещение через' };
import { UNITS, BUILDINGS, RES, TILE, TICK_MS, AGE_NAMES, AGE_COST, type Cost, type Cls } from './defs.ts';

const S = loadSettings(); // настройки графики/звука/управления из меню
const CFG = (window as unknown as { __epohi?: StartCfg }).__epohi; // параметры партии из меню
const net = await connect(); // ?room=xxx в адресе → сетевая игра
const slots = CFG?.slots ?? [{ type: 'human', team: 0, color: 0 }, { type: 'normal', team: 0, color: 1 }];
const ME = net ? net.you : Math.max(0, slots.findIndex((s) => s.type === 'human'));
const size = net ? 100 : CFG?.size ?? 100;
const w = createWorld(net ? net.seed : CFG?.seed ?? ((Math.random() * 1e9) | 0), net ? net.n : slots.length, size, size,
  net ? {} : { teams: slots.map((s) => s.team), startRes: CFG?.res, startAge: CFG?.age, popMax: CFG?.pop, events: CFG?.events, victory: CFG?.victory });
const bots = net ? [] : slots.map((s, i) => (s.type === 'human' ? null : new Bot(i, s.type as Level))).filter((b): b is Bot => !!b);
const gameSpeed = net ? 1 : CFG?.speed ?? 1;
const colorIdx = (o: number) => (net ? o : slots[o]?.color ?? o) % 8;
const pcol = (o: number) => COLORS[colorIdx(o)][1];
setVolume((S.master / 100) * (S.sfx / 100));
const pending: Command[] = [];
const send = (c: Command) => { if (net) net.send(c); else pending.push(c); };
const $ = (id: string) => document.getElementById(id)!;

// ---------- Сцена ----------
const canvas = $('c') as HTMLCanvasElement;
const engine = new Engine(canvas, S.msaa);
engine.setHardwareScalingLevel(1 / S.renderScale); // разрешение рендера
const scene = new Scene(engine);
scene.clearColor = new Color4(0.72, 0.82, 0.92, 1); // горизонт — в цвет дымки, без резкой границы
const hemi = new HemisphericLight('h', new Vector3(0.3, 1, 0.2), scene);
hemi.intensity = 0.8; hemi.diffuse = new Color3(0.78, 0.87, 1); hemi.groundColor = new Color3(0.5, 0.42, 0.33); // голубое небо сверху, тёплый отсвет земли — тени цветные, не чёрные
scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.007; scene.fogColor = new Color3(0.72, 0.82, 0.92); // дымка вдали
const sun = new DirectionalLight('s', new Vector3(-0.5, -1.2, 0.4), scene);
sun.intensity = 1.05;
sun.diffuse = new Color3(1, 0.93, 0.8); // тёплое солнце
sun.position = new Vector3(w.W / 2 + 40, 80, w.H / 2 - 30);

const tc0 = [...w.ents.values()].find((e): e is Building => e.kind === 'b' && e.owner === ME)!;
const cam = new ArcRotateCamera('cam', -Math.PI / 2, 0.92, 32, new Vector3(tc0.tx + 1.5, 0, tc0.ty + 1.5), scene);
cam.lowerRadiusLimit = 9; cam.upperRadiusLimit = 90; cam.fov = 0.62; // меньше искажений по краям, как в AoE3
cam.inertia = 0.85; // зум колесом с плавным доводом cam.wheelDeltaPercentage = 0.01;
cam.inputs.removeByType('ArcRotateCameraPointersInput'); // ЛКМ нужна для выделения
cam.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
cam.attachControl(canvas, true);
// Постобработка: сглаживание, киношная тонировка, лёгкое свечение и виньетка
const pipe = new DefaultRenderingPipeline('pp', true, scene, [cam]);
pipe.fxaaEnabled = S.fxaa;
pipe.imageProcessingEnabled = true;
pipe.imageProcessing.toneMappingEnabled = true;
pipe.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL; // мягче ACES, цвета не тускнеют
pipe.imageProcessing.exposure = 1.1;
pipe.imageProcessing.contrast = 1.18;
pipe.imageProcessing.vignetteEnabled = S.vignette;
pipe.imageProcessing.vignetteWeight = 1.3;
pipe.imageProcessing.colorCurvesEnabled = true; // сочнее цвета — ближе к стилизации
const curves = new ColorCurves();
curves.globalSaturation = S.saturation;
pipe.imageProcessing.colorCurves = curves;
pipe.bloomEnabled = S.bloom; pipe.bloomThreshold = 0.85; pipe.bloomWeight = 0.15;

const mat = (c: Color3, alpha = 1) => {
  const m = new StandardMaterial('', scene);
  m.diffuseColor = c; m.specularColor = Color3.Black(); m.alpha = alpha;
  return m;
};
const ground = MeshBuilder.CreateGround('g', { width: w.W, height: w.H, subdivisionsX: w.W, subdivisionsY: w.H, updatable: true }, scene);
ground.position.set(w.W / 2, 0, w.H / 2);
ground.material = mat(Color3.White()); // цвета — в вершинах
const fog = new Fog(w, ME, scene, 40, net ? 'normal' : CFG?.fog ?? 'normal'); // 40 — ширина декоративной полосы за краем (M ниже)

// Слой тонких инстансов: один draw call на весь тип объектов. yaw — поворот вокруг вертикали.
function layer(mesh: Mesh, color: Color3 | null, perColor = false) {
  if (color) { // null — оставить родной материал модели
    const m = mat(color);
    if (m.alpha === 1) { const fp = new FresnelParameters(); fp.leftColor = new Color3(0.28, 0.25, 0.2); fp.rightColor = Color3.Black(); fp.bias = 0.15; fp.power = 2.4; m.emissiveFresnelParameters = fp; } // светлый ободок силуэта
    mesh.material = m;
  }
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isVisible = false; // пока нет инстансов — не рисовать исходник в углу карты
  let cap = 0, n = 0, last = -1, m = new Float32Array(0), c = new Float32Array(0);
  return {
    mesh,
    begin() { n = 0; },
    add(x: number, y: number, z: number, sx: number, sy: number, sz: number, col?: number[], yaw = 0) {
      if (n >= cap) {
        cap = Math.max(64, cap * 2);
        const m2 = new Float32Array(cap * 16); m2.set(m); m = m2;
        const c2 = new Float32Array(cap * 4); c2.set(c); c = c2;
        last = -1;
      }
      const o = n * 16, cs = Math.cos(yaw), sn = Math.sin(yaw);
      m[o] = cs * sx; m[o + 1] = 0; m[o + 2] = -sn * sx; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = sn * sz; m[o + 9] = 0; m[o + 10] = cs * sz; m[o + 11] = 0;
      m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
      if (perColor) c.set(col ?? [1, 1, 1, 1], n * 4);
      n++;
    },
    end() {
      mesh.isVisible = n > 0;
      if (!n) return;
      if (n !== last) {
        mesh.thinInstanceSetBuffer('matrix', m.subarray(0, n * 16), 16, false);
        if (perColor) mesh.thinInstanceSetBuffer('color', c.subarray(0, n * 4), 4, false);
        last = n;
      } else {
        mesh.thinInstanceBufferUpdated('matrix');
        if (perColor) mesh.thinInstanceBufferUpdated('color');
      }
      mesh.thinInstanceRefreshBoundingInfo(false); // чтобы тени и отсечение знали реальные границы
    },
  };
}
type Layer = ReturnType<typeof layer>;
const box = (n: string) => MeshBuilder.CreateBox(n, { size: 1 }, scene);

// ---------- Рельеф: высоты в узлах сетки (среднее соседних клеток) ----------
const tileH = (i: number) => { const t = w.terrain[i]; return t === 1 ? -0.35 : t === 2 ? 1.6 + (Math.imul(i, 2654435761) >>> 28) * 0.06 : t === 3 ? 0.5 : 0; };
const W1 = w.W + 1, vh = new Float32Array(W1 * (w.H + 1));
for (let y = 0; y <= w.H; y++) for (let x = 0; x <= w.W; x++) {
  let s = 0, n = 0;
  for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    const tx = x + dx, ty = y + dy;
    if (tx >= 0 && ty >= 0 && tx < w.W && ty < w.H) { s += tileH(tx + ty * w.W); n++; }
  }
  vh[x + y * W1] = s / n;
}
function heightAt(x: number, z: number) { // билинейная интерполяция
  x = Math.min(w.W - 0.001, Math.max(0, x)); z = Math.min(w.H - 0.001, Math.max(0, z));
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0, h = (a: number, b: number) => vh[a + b * W1];
  return h(x0, z0) * (1 - fx) * (1 - fz) + h(x0 + 1, z0) * fx * (1 - fz) + h(x0, z0 + 1) * (1 - fx) * fz + h(x0 + 1, z0 + 1) * fx * fz;
}
const hy = (x: number, z: number) => heightAt(Math.floor(x) + 0.5, Math.floor(z) + 0.5); // высота по центру клетки
function groundColor(x: number, z: number, y: number) {
  const tx = Math.min(w.W - 1, Math.max(0, Math.floor(x))), tz = Math.min(w.H - 1, Math.max(0, Math.floor(z)));
  const t = w.terrain[tx + tz * w.W], n = (Math.imul(tx * 7349 + tz * 3931, 2654435761) >>> 26) / 900; // лёгкий шум
  if (y < -0.1) return [0.72, 0.66, 0.48];               // берег и дно
  if (y > 1.95) return [0.92, 0.92, 0.95];               // снег на вершинах
  if (t === 2 || y > 0.9) return [0.5 + n, 0.47 + n, 0.44 + n];
  if (t === 3 || y > 0.25) return [0.56 + n, 0.62 + n, 0.34];
  return [0.4 + n, 0.6 + n, 0.28];
}
function applyHeights(m: Mesh, off: number, color: boolean) {
  const pos = m.getVerticesData(VertexBuffer.PositionKind)!, col: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] + w.W / 2, z = pos[i + 2] + w.H / 2, y = heightAt(x, z);
    pos[i + 1] = y + off;
    if (color) col.push(...groundColor(x, z, y), 1);
  }
  m.updateVerticesData(VertexBuffer.PositionKind, pos);
  if (color) m.setVerticesData(VertexBuffer.ColorKind, col);
  const nrm: number[] = [];
  VertexData.ComputeNormals(pos, m.getIndices()!, nrm);
  m.updateVerticesData(VertexBuffer.NormalKind, nrm);
}
applyHeights(ground, 0, true);
ground.convertToFlatShadedMesh();
applyHeights(fog.mesh, 0.08, false);
// Вода: цвет по глубине, пена у берега, блик солнца, отражение неба, лёгкие волны
Effect.ShadersStore.waterVertexShader = `precision highp float; attribute vec3 position; attribute float depth;
  uniform mat4 world, viewProjection; uniform float uTime; varying vec3 vW; varying float vD;
  void main() { vec4 wp = world * vec4(position, 1.0); wp.y += sin(wp.x * 1.7 + uTime * 1.3) * 0.012 + cos(wp.z * 1.3 + uTime) * 0.012;
    vW = wp.xyz; vD = depth; gl_Position = viewProjection * wp; }`;
Effect.ShadersStore.waterFragmentShader = `precision highp float; varying vec3 vW; varying float vD;
  uniform vec3 uCam, uSun, uFog; uniform float uFogD, uTime;
  void main() {
    float d = clamp(vD / 0.25, 0.0, 1.0);
    vec3 col = mix(vec3(0.33, 0.7, 0.68), vec3(0.07, 0.29, 0.47), d);
    vec2 p = vW.xz;
    vec3 n = normalize(vec3(sin(p.x * 3.1 + uTime * 1.7) * 0.12 + sin(p.y * 2.3 - uTime * 1.1) * 0.08, 1.0, cos(p.y * 3.7 + uTime * 1.4) * 0.12 + cos(p.x * 2.1 + uTime) * 0.07));
    vec3 V = normalize(uCam - vW), L = normalize(-uSun), H = normalize(L + V);
    col = mix(col, vec3(0.75, 0.86, 0.95), pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.6);
    col += pow(max(dot(n, H), 0.0), 120.0) * vec3(1.0, 0.95, 0.8) * 0.8;
    float foam = smoothstep(0.07, 0.0, vD) * (0.6 + 0.4 * sin(p.x * 9.0 + p.y * 7.0 + uTime * 2.0));
    col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.8);
    float a = max(mix(0.55, 0.92, d), foam);
    col = mix(uFog, col, exp(-pow(length(uCam - vW) * uFogD, 2.0)));
    gl_FragColor = vec4(col, a);
  }`;
const water = MeshBuilder.CreateGround('water', { width: w.W, height: w.H, subdivisionsX: w.W, subdivisionsY: w.H }, scene);
water.position.set(w.W / 2, -0.12, w.H / 2);
water.isPickable = false;
{
  const pos = water.getVerticesData(VertexBuffer.PositionKind)!, dep: number[] = [];
  for (let i = 0; i < pos.length; i += 3) dep.push(-0.12 - heightAt(pos[i] + w.W / 2, pos[i + 2] + w.H / 2));
  water.setVerticesData('depth', dep, false, 1);
}
const wm = new ShaderMaterial('water', scene, { vertex: 'water', fragment: 'water' }, { attributes: ['position', 'depth'], uniforms: ['world', 'viewProjection', 'uTime', 'uCam', 'uSun', 'uFog', 'uFogD'], needAlphaBlending: true });
wm.backFaceCulling = false;
water.material = wm;

// ---------- Модели ----------
const K = makeModels(scene);
const MODELS: Record<string, [Layer | null, Layer | null]> = {};
for (const [type, [b, t]] of Object.entries(K.things)) MODELS[type] = [b ? layer(b, Color3.White()) : null, t ? layer(t, Color3.White(), true) : null];
const R = {
  bush: layer(K.res.bush, Color3.White()), pine: layer(K.res.pine, Color3.White()), oak: layer(K.res.oak, Color3.White()),
  stone: layer(K.res.stone, Color3.White()), iron: layer(K.res.iron, Color3.White()),
};
const L = {
  bld: layer(box('bld'), Color3.White()), // невидимые «корпуса» зданий — для клика
  sel: layer(MeshBuilder.CreateTorus('sel', { diameter: 1, thickness: 0.05, tessellation: 24 }, scene), new Color3(1, 1, 0.6)),
  hpBg: layer(box('hpbg'), new Color3(0.25, 0.05, 0.05)),
  hpFg: layer(box('hpfg'), Color3.White(), true),
  flag: layer(box('flag'), Color3.White()),
  border: layer(box('border'), Color3.White(), true),
  wallG: layer(box('wallg'), Color3.White(), true),
  fx: layer(box('fx'), Color3.White(), true),
  door: layer(box('door'), Color3.White(), true), // створки ворот
  smoke: layer(MeshBuilder.CreateIcoSphere('smoke', { radius: 0.5, subdivisions: 2 }, scene), new Color3(0.86, 0.86, 0.86)),
  arrow: layer(K.res.arrow, Color3.White()),
  team: layer(MeshBuilder.CreateTorus('team', { diameter: 1, thickness: 0.07, tessellation: 20 }, scene), Color3.White(), true), // кольцо цвета игрока под настоящими моделями
};
(L.bld.mesh.material as StandardMaterial).alpha = 0;
(L.border.mesh.material as StandardMaterial).alpha = 0.45; // границы — лёгкой линией
(L.smoke.mesh.material as StandardMaterial).alpha = 0.35; // полупрозрачный дым
L.bld.mesh.isPickable = true;
L.bld.mesh.thinInstanceEnablePicking = true;

const shadow = new ShadowGenerator(S.shadows || 1024, sun);
if (!S.shadows) sun.shadowEnabled = false;
shadow.usePercentageCloserFiltering = true;
shadow.bias = 0.004;
for (const pair of Object.values(MODELS)) for (const l of pair) if (l) shadow.addShadowCaster(l.mesh);
for (const l of Object.values(R)) shadow.addShadowCaster(l.mesh);
ground.receiveShadows = true;
shadow.filteringQuality = ShadowGenerator.QUALITY_HIGH; shadow.darkness = 0.35; // мягкие светлые тени

// Небо-купол: градиент от голубой дымки у горизонта к насыщенной синеве, с мягкими облаками
Effect.ShadersStore.skyVertexShader = `precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 vP;
  void main() { vP = position; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
Effect.ShadersStore.skyFragmentShader = `precision highp float; varying vec3 vP; uniform float uTime;
  void main() {
    vec3 d = normalize(vP); float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(vec3(0.72, 0.82, 0.92), vec3(0.3, 0.55, 0.9), pow(h, 0.6));
    vec2 uv = d.xz / max(d.y, 0.08) * 0.6 + uTime * 0.004;
    float c = sin(uv.x * 3.1) * cos(uv.y * 2.7) + sin(uv.x * 7.3 + uv.y * 5.1) * 0.5 + sin(uv.y * 11.0 - uv.x * 3.0) * 0.25;
    col = mix(col, vec3(1.0), smoothstep(0.55, 1.2, c) * 0.55 * smoothstep(0.02, 0.25, h));
    gl_FragColor = vec4(col, 1.0);
  }`;
const sky = MeshBuilder.CreateSphere('sky', { diameter: 900, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
const skyM = new ShaderMaterial('sky', scene, { vertex: 'sky', fragment: 'sky' }, { attributes: ['position'], uniforms: ['worldViewProjection', 'uTime'] });
skyM.backFaceCulling = false;
sky.material = skyM; sky.infiniteDistance = true; sky.isPickable = false; sky.applyFog = false;

// ---------- Настоящие модели и текстуры (если скачаны: npm run assets) ----------
$('msg').style.display = 'block'; $('msg').textContent = 'Загрузка моделей…';
const A = await loadAssets(scene, (m) => layer(m, null), BUILDINGS).catch((e) => { console.warn('Ассеты не загрузились, рисуем процедурно', e); return null; });
$('msg').style.display = 'none';
if (A) for (const l of [...A.layers, ...A.natureLayers]) shadow.addShadowCaster(l.mesh);
// ---------- Земля: 4 слоя фототекстур без видимого повтора + живая карта грязи (вокруг зданий, лесная подстилка, протоптанные тропы) ----------
const splatTex = new DynamicTexture('splat', { width: w.W, height: w.H }, scene, false);
const dirtW = new Float32Array(w.W * w.H), traffic = new Float32Array(w.W * w.H);
const nearWater = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.terrain[x + dx + (y + dy) * w.W] === 1);
function updateSplat() { // веса в RGB: трава, скала, песок; земля = остаток (альфу канвас портит — не используем)
  const ctx = splatTex.getContext() as unknown as CanvasRenderingContext2D, img = ctx.createImageData(w.W, w.H), d = img.data;
  dirtW.fill(0);
  for (const e of w.ents.values()) if (e.kind === 'b' && e.type !== 'wall' && e.type !== 'gate') { // утоптанная земля у зданий
    const s = BUILDINGS[e.type].size;
    for (let y = e.ty - 1; y <= e.ty + s; y++) for (let x = e.tx - 1; x <= e.tx + s; x++) {
      if (x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
      const i = x + y * w.W, inside = x >= e.tx && y >= e.ty && x < e.tx + s && y < e.ty + s;
      dirtW[i] = Math.max(dirtW[i], inside ? 1 : 0.6);
    }
  }
  for (let i = 0; i < w.W * w.H; i++) {
    const x = i % w.W, y = (i / w.W) | 0, t = w.terrain[i];
    let g = 1, r = 0, s = 0;
    if (t === 2) { g = 0; r = 1; } else if (t === 3) { g = 0.8; r = 0.2; }
    if (t === 1 || nearWater(x, y)) { g = 0; r = 0; s = 1; }
    if (w.resType[i] === 2) dirtW[i] = Math.max(dirtW[i], 0.5);                  // лесная подстилка
    if (w.resType[i] === 1 && w.resKind[i] === 2) dirtW[i] = Math.max(dirtW[i], 0.85); // пашня под пшеницей
    dirtW[i] = Math.max(dirtW[i], Math.min(0.85, traffic[i] / 25));              // тропы, протоптанные юнитами
    const dd = s ? 0 : dirtW[i], o = (x + (w.H - 1 - y) * w.W) * 4;
    d[o] = 255 * g * (1 - dd); d[o + 1] = 255 * r * (1 - dd); d[o + 2] = 255 * s; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  splatTex.update();
}
updateSplat();
if (A?.textures.grass && A.textures.rock && A.textures.sand) {
  const TT = new CustomMaterial('terrain2', scene);
  TT.AddUniform('tGrass', 'sampler2D', A.textures.grass); TT.AddUniform('tRock', 'sampler2D', A.textures.rock);
  TT.AddUniform('tSand', 'sampler2D', A.textures.sand); TT.AddUniform('tDirt', 'sampler2D', A.textures.dirt ?? A.textures.sand);
  TT.AddUniform('tSplat', 'sampler2D', splatTex); TT.AddUniform('uMap', 'vec2', new Vector2(w.W, w.H)); TT.AddUniform('uNoDirt', 'float', A.textures.dirt ? 0 : 1);
  // Два сэмпла под разным масштабом и поворотом, смешанные шумом, — повтор текстуры не виден
  TT.Fragment_Definitions(`vec3 tex2(sampler2D t, vec2 p) {
    float n = sin(p.x * 0.071 + cos(p.y * 0.053) * 2.0) * 0.5 + 0.5;
    return mix(texture2D(t, p * 0.26).rgb, texture2D(t, vec2(p.y, -p.x) * 0.17 + 0.37).rgb, smoothstep(0.35, 0.65, n));
  }`);
  TT.Fragment_Custom_Diffuse(`
    vec2 wp = vPositionW.xz;
    vec3 sp = texture2D(tSplat, wp / uMap).rgb;
    float dr = clamp(1.0 - sp.r - sp.g - sp.b, 0.0, 1.0);
    float rk = clamp(sp.g + smoothstep(0.2, 0.5, 1.0 - clamp(vNormalW.y, 0.0, 1.0)), 0.0, 1.0); // склоны — скала
    vec3 gr = tex2(tGrass, wp);
    float dry = smoothstep(0.25, 0.85, sin(wp.x * 0.043 + 1.3) * cos(wp.y * 0.037) * 0.5 + 0.5);
    gr = mix(gr, gr * vec3(1.18, 1.06, 0.72), dry * 0.6);                           // пятна сухой травы
    vec3 dc = tex2(tDirt, wp) * mix(vec3(1.0), vec3(0.72, 0.58, 0.42), uNoDirt);
    vec3 col = (gr * sp.r + tex2(tSand, wp) * sp.b + dc * dr) / max(sp.r + sp.b + dr, 0.001);
    col = mix(col, tex2(tRock, wp * 0.8), rk);
    col *= 0.9 + 0.2 * (sin(wp.x * 0.021) * cos(wp.y * 0.017) * 0.5 + 0.5);          // крупная неоднородность
    diffuseColor = col;`);
  TT.specularColor = Color3.Black();
  ground.material = TT;
  ground.removeVerticesData(VertexBuffer.ColorKind);
}
// Природа: фототекстуры коры и камня + карточки листвы (вместо «пластилина»)
const NL: Record<string, Layer> = {};
for (const [k, m] of Object.entries(makeNature(scene, A?.textures ?? {}))) {
  NL[k] = layer(m, null);
  if (!['berry', 'soil', 'fern', 'pebbles', 'mushroom'].includes(k) && !k.startsWith('grass')) shadow.addShadowCaster(m);
}

// ---------- За краем карты: горы и лес (как в Cossacks, AoE III/IV), а не пустота ----------
// Декоративная земля вокруг поля: у края — продолжение рельефа, дальше — подъём в горный хребет. Играть там нельзя.
const M = 40, SW = w.W + 2 * M, SH = w.H + 2 * M;
function skirtH(x: number, z: number) {
  const inside = x > 0.001 && z > 0.001 && x < w.W - 0.001 && z < w.H - 0.001;
  if (inside) return -3; // под игровым полем — спрятано
  const d = Math.hypot(Math.max(-x, x - w.W, 0), Math.max(-z, z - w.H, 0));
  const edge = heightAt(Math.min(Math.max(x, 0), w.W), Math.min(Math.max(z, 0), w.H)); // шов с картой без ступеньки
  const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) + Math.sin(x * 0.07 + z * 0.11) * 1.3 + Math.sin(z * 0.37 - x * 0.05) * 0.4;
  const rise = Math.min(1, d / 14);
  return edge * (1 - rise) + rise * rise * (3.2 + 2.2 * n) + Math.max(0, d - 14) * 0.25;
}
const skirt = MeshBuilder.CreateGround('skirt', { width: SW, height: SH, subdivisionsX: SW, subdivisionsY: SH, updatable: true }, scene);
skirt.position.set(w.W / 2, 0, w.H / 2);
skirt.isPickable = false;
skirt.receiveShadows = true;
{
  const pos = skirt.getVerticesData(VertexBuffer.PositionKind)!, col: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] + w.W / 2, z = pos[i + 2] + w.H / 2, h = skirtH(x, z);
    pos[i + 1] = h;
    col.push(...(h > 4.8 ? [0.93, 0.94, 0.97] : h > 2.4 ? [0.52, 0.5, 0.47] : h > 1.1 ? [0.47, 0.53, 0.33] : [0.4, 0.58, 0.28]), 1); // трава → скалы → снег
  }
  skirt.updateVerticesData(VertexBuffer.PositionKind, pos);
  skirt.setVerticesData(VertexBuffer.ColorKind, col);
  const nrm: number[] = [];
  VertexData.ComputeNormals(pos, skirt.getIndices()!, nrm);
  skirt.updateVerticesData(VertexBuffer.NormalKind, nrm);
  skirt.material = mat(Color3.White());
  if (A?.textures.grass && A.textures.rock && A.textures.sand) { // те же фототекстуры, что и на поле: трава внизу, скала на склонах
    const mix = new DynamicTexture('skirtMix', { width: SW, height: SH }, scene, false);
    const ctx = mix.getContext() as unknown as CanvasRenderingContext2D, img = ctx.createImageData(SW, SH);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const g = Math.min(1, Math.max(0, (skirtH(x - M + 0.5, y - M + 0.5) - 1) / 1.8));
      img.data.set([255 * (1 - g), 255 * g, 0, 255], (x + (SH - 1 - y) * SW) * 4);
    }
    ctx.putImageData(img, 0, 0);
    mix.update();
    const tm2 = new TerrainMaterial('skirtT', scene), t = (x?: Texture) => { const c = x!.clone(); c.uScale = SW / 4; c.vScale = SH / 4; return c; };
    tm2.mixTexture = mix;
    tm2.diffuseTexture1 = t(A.textures.grass); tm2.diffuseTexture2 = t(A.textures.rock); tm2.diffuseTexture3 = t(A.textures.sand);
    tm2.specularColor = Color3.Black();
    skirt.material = tm2;
    skirt.removeVerticesData(VertexBuffer.ColorKind);
  }
}
// Лес у подножия гор за краем: позиции считаем один раз
const skirtTrees: number[] = []; // лес за краем убран: там теперь дымка, деревья торчали бы сквозь неё
// Туман ложится и на горы за краем: высоты плоскости тумана — по рельефу поля и по горам
{
  const pos = fog.mesh.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] + w.W / 2, z = pos[i + 2] + w.H / 2, onMap = x >= 0 && z >= 0 && x <= w.W && z <= w.H;
    pos[i + 1] = (onMap ? heightAt(x, z) : skirtH(x, z)) + 0.3; // выше травы — дымка её накрывает
  }
  fog.mesh.updateVerticesData(VertexBuffer.PositionKind, pos);
}

const PC = [[0.2, 0.45, 1], [0.9, 0.2, 0.2], [0.95, 0.8, 0.2], [0.3, 0.8, 0.3], [0.7, 0.3, 0.9], [0.2, 0.8, 0.8], [1, 0.55, 0.1], [0.9, 0.9, 0.9]];
// Высота «корпуса» зданий (клик, полоски) и юнитов (полоски)
const BH: Record<string, number> = { pasture: 0.6,  town_center: 3, house: 1.7, farm: 0.3, tower: 3.2, camp: 1.2, wall: 1.3, gate: 1.5, barracks: 2.2, archery: 1.9, stable: 1.9, workshop: 2.4 };
const UH: Record<string, number> = { horseman: 1.5, ram: 1.1 };

function drawTerrain() { /* рельеф статичен и построен один раз; неразведанное прячет туман */ }
const rhash = (i: number) => Math.imul(i, 2654435761) >>> 0; // псевдослучайное по номеру клетки
const US = 0.6, TS = 1.4; // пропорции: юниты мельче, деревья выше — как в классических RTS
// Трава: 2–5 мелких пучков на свободную клетку, пять видов; на холмах суше. Перестраивается, только когда что-то изменилось
function drawGrass() { /* старые «коврики» заменены травинками (drawBlades) */ }

// ---------- Травинки: только вокруг камеры (как в больших играх), с наклоном по склону ----------
const G = makeGrass(scene, Math.max(1, Math.round((200 * S.grass) / 100)));
const gRad = () => Math.min(36, cam.radius * 0.8 + 9) * (S.grassDist / 100);
G.mat.setVector3('uSunDir', sun.direction);
G.mat.setColor3('uBase', new Color3(0.16, 0.33, 0.07));
G.mat.setColor3('uTip', new Color3(0.56, 0.8, 0.26));
G.mat.setColor3('uDry', new Color3(0.82, 0.76, 0.36));
let gBuf = new Float32Array(0), gLast = -1, gCx = -1e9, gCz = -1e9, gR = 0, gDirty = true;
const stomp = new Array(24 * 4).fill(0);
const dirt = (x: number, z: number) => Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.27) + Math.sin(x * 0.09 - z * 0.13) * 0.9 + Math.sin(z * 0.51 + x * 0.07) * 0.4; // проплешины земли
function drawBlades() {
  if (!S.grass) { G.mesh.isVisible = false; return; }
  const R = gRad(), cx = cam.target.x, cz = cam.target.z;
  gCx = cx; gCz = cz; gR = R; gDirty = false;
  let n = 0;
  const need = (Math.PI * R * R + 8 * R) * 16;
  if (gBuf.length < need) { gBuf = new Float32Array(need); gLast = -1; }
  for (let z = Math.floor(cz - R); z <= cz + R; z++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
    if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 > R * R) continue;
    const onMap = x >= 0 && z >= 0 && x < w.W && z < w.H, i = x + z * w.W;
    const hh = Math.imul((x + 997) * 7919 ^ (z + 991) * 104729, 2654435761) >>> 0;
    let hill = false, py: number;
    if (onMap) {
      if (!fog.seen[i] || w.resType[i] || w.occ[i] || (w.terrain[i] !== 0 && w.terrain[i] !== 3) || dirtW[i] > 0.55) continue; // на утоптанной земле травы нет
      hill = w.terrain[i] === 3;
    } else {
      const d = Math.hypot(Math.max(-x, x - w.W + 1, 0), Math.max(-z, z - w.H + 1, 0));
      if (d > 8 || (hh % 100) / 100 > 1 - d / 9) continue; // за краем трава редеет и уходит в дымку
    }
    const dm = dirt(x + 0.5, z + 0.5);
    if (dm > 1.6) continue; // голая земля — только редкие проплешины
    const gx = x + 0.5, gz = z + 0.5, H = (px: number, pz: number) => (onMap ? heightAt(px, pz) : skirtH(px, pz));
    py = H(gx, gz);
    const sx = H(gx + 0.5, gz) - H(gx - 0.5, gz), sz = H(gx, gz + 0.5) - H(gx, gz - 0.5); // наклон склона
    const yaw = ((hh >>> 8) % 628) / 100, c = Math.cos(yaw), sn = Math.sin(yaw), s = 1.05;
    const sy = (onMap ? 1 - dirtW[i] * 0.8 : 1) * (dm > 1.1 ? 1 - ((dm - 1.1) / 0.5) * 0.7 : 1) * (0.85 + ((hh >>> 16) % 40) / 100) * (hill ? 0.8 : 1);
    const o = n * 16;
    gBuf[o] = s * c; gBuf[o + 1] = s * (c * sx - sn * sz); gBuf[o + 2] = -s * sn; gBuf[o + 3] = 0;   // травинки стоят вертикально,
    gBuf[o + 4] = 0; gBuf[o + 5] = sy; gBuf[o + 6] = 0; gBuf[o + 7] = 0;                            // а основание лежит на склоне
    gBuf[o + 8] = s * sn; gBuf[o + 9] = s * (sn * sx + c * sz); gBuf[o + 10] = s * c; gBuf[o + 11] = 0;
    gBuf[o + 12] = gx; gBuf[o + 13] = py; gBuf[o + 14] = gz; gBuf[o + 15] = 1;
    n++;
  }
  G.mesh.isVisible = n > 0;
  if (!n) return;
  if (n !== gLast) { G.mesh.thinInstanceSetBuffer('matrix', gBuf.subarray(0, n * 16), 16, false); gLast = n; }
  else G.mesh.thinInstanceBufferUpdated('matrix');
}
function bladesFrame() { // каждый кадр: ветер, камера, кто топчет траву
  if (gDirty || Math.hypot(cam.target.x - gCx, cam.target.z - gCz) > 3 || Math.abs(gRad() - gR) > 4) drawBlades();
  let k = 0;
  const tx = cam.target.x, tz = cam.target.z;
  for (const e of w.ents.values()) {
    if (k >= 24) break;
    if (e.kind !== 'u' || !fog.visible(e)) continue;
    const x = e.x / TILE, z = e.y / TILE;
    if (Math.abs(x - tx) > gR || Math.abs(z - tz) > gR) continue;
    stomp[k * 4] = x; stomp[k * 4 + 1] = 0; stomp[k * 4 + 2] = z; stomp[k * 4 + 3] = UNITS[e.type].cls === 'cavalry' || UNITS[e.type].cls === 'siege' ? 0.45 : 0.3;
    k++;
  }
  for (let j = k; j < 24; j++) stomp[j * 4 + 3] = 0;
  G.mat.setArray4('uStomp', stomp);
  G.mat.setFloat('uTime', S.wind ? performance.now() / 1000 : 0);
  G.mat.setVector3('uCam', cam.position);
  G.mat.setColor3('uFog', scene.fogColor);
  G.mat.setFloat('uFogD', scene.fogDensity);
}
function drawRes() {
  const ls = Object.entries(NL).filter(([k]) => !k.startsWith('grass')).map(([, l]) => l);
  ls.forEach((l) => l.begin());
  for (let i = 0; i < w.W * w.H; i++) {
    if (!fog.seen[i]) continue;
    const r = w.resType[i], h = rhash(i); // только беззнаковые сдвиги (>>>): иначе отрицательные индексы
    const x = (i % w.W) + 0.5 + ((h & 15) - 7.5) / 50, z = ((i / w.W) | 0) + 0.5 + (((h >>> 4) & 15) - 7.5) / 50;
    const y = heightAt(x, z), rot = ((h >>> 8) % 628) / 100, s = 0.85 + ((h >>> 12) % 35) / 100;
    if (!r) { // свободная клетка: иногда — мелкий декор (у леса пни, брёвна, папоротник, грибы; у камня — камешки)
      if (w.occ[i] || (w.terrain[i] !== 0 && w.terrain[i] !== 3) || dirtW[i] > 0.7) continue;
      let nf = 0, ns = 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const t = w.resType[i + dx + dz * w.W]; if (t === 2) nf++; else if (t === 3 || t === 4) ns++; }
      const q = (h >>> 3) % 1000;
      const kind = nf ? (q < 60 ? 'stump' : q < 100 ? 'log' : q < 190 ? 'fern' : q < 215 ? 'mushroom' : '') : ns ? (q < 120 ? 'pebbles' : '') : q < 12 ? 'pebbles' : q < 18 ? 'log' : q < 30 ? 'fern' : '';
      if (kind) NL[kind]?.add(x, y, z, s, s, s, undefined, rot);
      continue;
    }
    if (r === 2) { // лес: ели и лиственные вперемешку, разной высоты
      const pine = (h >>> 20) % 3 !== 0, sy = s * (0.85 + ((h >>> 24) % 35) / 100);
      (pine ? NL.pineT : NL.oakT)?.add(x, y, z, s * TS, sy * TS, s * TS, undefined, rot);
      (pine ? NL.pineL : NL.oakL)?.add(x, y, z, s * TS, sy * TS, s * TS, undefined, rot);
    } else if (r === 1 && w.resKind[i] === 2) { // пшеница: ниже по мере жатвы
      const px = (i % w.W) + 0.5, pz = ((i / w.W) | 0) + 0.5, py = heightAt(px, pz), k = 0.45 + (0.55 * w.resAmt[i]) / WHEAT;
      NL.soil?.add(px, py, pz, 1, 1, 1);
      NL.wheat?.add(px, py, pz, 1, k, 1, undefined, (h % 4) * 1.5708);
    } else if (r === 1 && w.resKind[i] === 1) { /* туша рисуется отдельно */ }
    else if (r === 1) { NL.bush?.add(x, y, z, s, s, s, undefined, rot); NL.berry?.add(x, y, z, s, s, s, undefined, rot); }
    else { // камень и руда уменьшаются по мере выработки
      const k = (0.7 + (0.5 * w.resAmt[i]) / 300) * s;
      NL[(r === 3 ? 'rock' : 'ore') + ((h >>> 16) % 3)]?.add(x, y, z, k, k * 0.9, k, undefined, rot);
    }
  }
  for (let k = 0; k < skirtTrees.length; k += 6) { // лес за краем карты
    const [x, y, z, s, rot, pine] = skirtTrees.slice(k, k + 6), sc = s * TS;
    (pine ? NL.pineT : NL.oakT)?.add(x, y, z, sc, sc, sc, undefined, rot);
    (pine ? NL.pineL : NL.oakL)?.add(x, y, z, sc, sc, sc, undefined, rot);
  }
  for (const e of w.ents.values()) { // быт вокруг построек: ящики, бочки, мешки, стога, телеги, заборы
    if (e.kind !== 'b' || e.progress < BUILDINGS[e.type].time || !fog.visible(e) || !PROPS[e.type]) continue;
    const set = PROPS[e.type], sz = BUILDINGS[e.type].size, n = 2 + (rhash(e.id) % 3);
    for (let k = 0; k < n; k++) {
      const hh = rhash(e.id * 31 + k), side = hh % 4, t = ((hh >>> 4) % 100) / 100;
      const px = side === 0 ? e.tx - 0.35 : side === 1 ? e.tx + sz + 0.35 : e.tx + t * sz, pz = side === 2 ? e.ty - 0.35 : side === 3 ? e.ty + sz + 0.35 : e.ty + t * sz;
      const ti = Math.floor(px) + Math.floor(pz) * w.W;
      if (px < 0 || pz < 0 || px >= w.W || pz >= w.H || w.occ[ti] > 0 || w.resType[ti]) continue;
      const kind = set[(hh >>> 12) % set.length];
      NL[kind]?.add(px, heightAt(px, pz), pz, 1, 1, 1, undefined, side < 2 ? Math.PI / 2 : 0);
    }
  }
  ls.forEach((l) => l.end());
}
const PROPS: Record<string, string[]> = {
  town_center: ['crate', 'barrel', 'sack', 'cart', 'crate'], house: ['barrel', 'crate', 'fence', 'woodpile'], barracks: ['crate', 'barrel', 'fence'],
  archery: ['crate', 'hay', 'fence'], stable: ['hay', 'hay', 'fence'], workshop: ['woodpile', 'crate', 'cart'], camp: ['woodpile', 'cart', 'sack'], pasture: ['hay', 'sack', 'cart'],
};
function addModel(type: string, x: number, y: number, z: number, yaw: number, s: number, col: number[], sy = 1, noTeam = false) {
  const [b, t] = MODELS[type] ?? [null, null];
  b?.add(x, y, z, s, s * sy, s, undefined, yaw);
  if (!noTeam) t?.add(x, y, z, s, s * sy, s, col, yaw);
}

let sel: number[] = [];
const selSet = new Set<number>();
const prev = new Map<number, [number, number]>(); // позиции прошлого тика — для плавности
let bldIds: number[] = [];

// Полоска здоровья: подложка + цветная часть по доле hp
const showBar = (hurt: boolean, picked: boolean) => S.hpBars === 'always' || picked || (S.hpBars === 'damaged' && hurt);
function bar(x: number, y: number, z: number, wd: number, k: number) {
  L.hpBg.add(x, y, z, wd, 0.07, 0.07);
  L.hpFg.add(x - (wd * (1 - k)) / 2, y, z, wd * k, 0.09, 0.09, k > 0.6 ? [0.2, 0.9, 0.2, 1] : k > 0.3 ? [0.95, 0.8, 0.1, 1] : [0.95, 0.2, 0.1, 1]);
}

// ---------- Эффекты: стрелы, искры, пыль, павшие (только визуал, на логику не влияют) ----------
interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; s: number; col: number[]; grav: number; }
interface Arrow { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; t: number; dur: number; }
interface Corpse { type: string; owner: number; x: number; z: number; yaw: number; t: number; }
const smoke: { x: number; y: number; z: number; t: number; life: number; s: number }[] = [];
const parts: Particle[] = [], arrows: Arrow[] = [], corpses: Corpse[] = [], yaws = new Map<number, number>();
function puff(x: number, y: number, z: number, n: number, col: number[], speed: number, grav: number, size: number) {
  for (let i = 0; i < n && parts.length < 600; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6), life = 0.4 + Math.random() * 0.5;
    parts.push({ x, y, z, vx: Math.cos(a) * v, vy: speed * (0.5 + Math.random()), vz: Math.sin(a) * v, life, max: life, s: size * (0.6 + Math.random() * 0.8), col, grav });
  }
}
function effectFx(f: Fx) {
  const x = f.x / TILE, z = f.y / TILE;
  if (!fog.vis[(x | 0) + (z | 0) * w.W]) return;
  const y = heightAt(x, z);
  if (f.k === 'shot' && f.tx !== undefined && f.ty !== undefined) {
    const x1 = f.tx / TILE, z1 = f.ty / TILE;
    arrows.push({ x0: x, z0: z, x1, z1, y0: y + 0.6, y1: heightAt(x1, z1) + 0.5, t: 0, dur: Math.max(0.15, Math.hypot(x1 - x, z1 - z) * 0.07) });
  } else if (f.k === 'hit' && f.type && BUILDINGS[f.type]) puff(x, y + 0.8, z, 4, [0.6, 0.55, 0.5, 1], 1.8, 7, 0.12); // обломки
  else if (f.k === 'hit') puff(x, y + 0.5, z, 3, [0.85, 0.15, 0.12, 1], 1.2, 6, 0.06);        // кровь/искры
  else if (f.k === 'die' && f.type && UNITS[f.type]?.animal) puff(x, y + 0.3, z, 5, [0.6, 0.1, 0.1, 1], 1, 6, 0.06);
  else if (f.k === 'die' && f.type && UNITS[f.type]) corpses.push({ type: f.type, owner: f.owner, x, z, yaw: yaws.get(f.id ?? -1) ?? 0, t: 0 });
  else if (f.k === 'die') puff(x, y + 0.5, z, 24, [0.55, 0.5, 0.45, 1], 2.5, 3, 0.3);          // рухнувшее здание
  else if (f.k === 'built') puff(x, y + 0.2, z, 10, [0.8, 0.75, 0.6, 1], 1.5, 2, 0.15);
}

// Геометрия линии стены: направление, шаг сегментов, поворот. Сегменты стоят на клетках, а рисуются ровно по линии
function lineFrame(l0: number, l1: number) {
  const ax = (l0 % w.W) + 0.5, az = ((l0 / w.W) | 0) + 0.5, dx = (l1 % w.W) + 0.5 - ax, dz = ((l1 / w.W) | 0) + 0.5 - az, len = Math.hypot(dx, dz);
  if (l0 < 0 || len < 0.01) return null;
  const ux = dx / len, uz = dz / len;
  return { ax, az, ux, uz, sp: len / Math.max(Math.abs(dx), Math.abs(dz)), yaw: Math.atan2(-uz, ux) };
}
const gateK = new Map<number, number>(); // плавность открытия ворот
function drawWallPiece(e: Building, by: number, k: number, col: number[]) {
  let px = e.tx + 0.5, pz = e.ty + 0.5, sp = 1, yaw = 0;
  const f = lineFrame(e.l0, e.l1);
  if (f) { // проекция клетки на линию
    const t = (px - f.ax) * f.ux + (pz - f.az) * f.uz;
    px = f.ax + f.ux * t; pz = f.az + f.uz * t; sp = f.sp + 0.04; yaw = f.yaw;
  }
  const [mb, mt] = MODELS[e.type] ?? [null, null];
  const wd = e.type === 'wall' && f ? 0.6 : 0.85; // стена тоньше, ворота — массивнее
  mb?.add(px, by, pz, sp, k, wd, undefined, yaw);
  mt?.add(px, by, pz, sp, k, wd, col, yaw);
  const ti = e.tx + e.ty * w.W;
  if (e.type === 'wall' && f && (ti === e.l0 || ti === e.l1)) { // столбы на концах — стыки и углы выглядят цельно
    const [pb, pt] = MODELS.wallpost;
    pb?.add(px, by, pz, 0.85, k, 0.85, undefined, yaw);
    pt?.add(px, by, pz, 0.85, k, 0.85, col, yaw);
  }
  if (e.type !== 'gate') return;
  const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
  let near = false; // открытые ворота распахиваются, когда рядом свои, и закрываются за ними; запертые — всегда закрыты
  if (e.open) for (const u of w.ents.values()) if (u.kind === 'u' && u.owner === e.owner && Math.abs(u.x / TILE - px) < 1.6 && Math.abs(u.y / TILE - pz) < 1.6) { near = true; break; }
  const target = near ? 1 : 0;
  let gk = gateK.get(e.id) ?? 0;
  gk += Math.sign(target - gk) * Math.min(Math.abs(target - gk), dt * 2);
  gateK.set(e.id, gk);
  const a = (gk * Math.PI) / 2 * 0.95, cs = Math.cos(yaw), sn = Math.sin(yaw);
  for (const side of [-1, 1]) { // две створки на петлях у столбов, распахиваются внутрь
    const lx = side * (0.25 - Math.cos(a) * 0.125) * sp, lz = Math.sin(a) * 0.125 * sp;
    L.door.add(px + lx * cs + lz * sn, by + 0.5 * k, pz - lx * sn + lz * cs, 0.25 * sp, k, 0.06, [0.42 + col[0] * 0.25, 0.28 + col[1] * 0.2, 0.16 + col[2] * 0.2, 1], yaw + side * a);
  }
}

function drawEnts(a: number) {
  const dt = Math.min(0.1, engine.getDeltaTime() / 1000), T = performance.now() / 1000;
  for (const pair of Object.values(MODELS)) for (const l of pair) l?.begin();
  for (const l of A?.layers ?? []) l.begin();
  for (const l of Object.values(L)) if (l !== L.border && l !== L.wallG && l !== L.smoke) l.begin();
  bldIds = [];
  for (const e of w.ents.values()) {
    if (!fog.visible(e)) continue;
    const col = [...pcol(e.owner), 1];
    if (e.kind === 'u') {
      const p = prev.get(e.id) ?? [e.x, e.y], d = UNITS[e.type];
      const x = (p[0] + (e.x - p[0]) * a) / TILE, z = (p[1] + (e.y - p[1]) * a) / TILE, moving = Math.hypot(e.x - p[0], e.y - p[1]) > 40; // мелкие сдвиги от толкотни — не ходьба
      let yaw = yaws.get(e.id) ?? 0;
      if (moving) yaw = Math.atan2(e.x - p[0], e.y - p[1]);
      else if (e.order.t === 'attack') { // лицом к цели
        const t = w.ents.get(e.order.target);
        if (t) yaw = t.kind === 'u' ? Math.atan2(t.x - e.x, t.y - e.y) : Math.atan2((t.tx + 0.5) * TILE - e.x, (t.ty + 0.5) * TILE - e.y);
      }
      else if (e.order.t === 'gather') yaw = Math.atan2(((e.order.tile % w.W) + 0.5) * TILE - e.x, (((e.order.tile / w.W) | 0) + 0.5) * TILE - e.y); // лицом к ресурсу
      else if (e.order.t === 'build') { const t = w.ents.get(e.order.target); if (t && t.kind === 'b') { const hs = BUILDINGS[t.type].size / 2; yaw = Math.atan2((t.tx + hs) * TILE - e.x, (t.ty + hs) * TILE - e.y); } }
      yaws.set(e.id, yaw);
      const g = heightAt(x, z);
      let y = g, mx = x, mz = z;
      if (moving) y += Math.abs(Math.sin(T * 9 + e.id)) * 0.06;                                            // шаг
      else if (e.order.t === 'attack' && e.cd > d.cd - 4) { mx += Math.sin(yaw) * 0.12; mz += Math.cos(yaw) * 0.12; } // выпад
      const au = A?.units[e.type];
      if (au) { // настоящая модель: поза по состоянию юнита
        const work = e.order.t === 'gather' || e.order.t === 'farm' || e.order.t === 'build';
        const key: AnimKey = moving ? 'walk' : e.order.t === 'attack' ? (d.range > 2000 && au.shoot ? 'shoot' : 'attack') : work ? 'work' : 'idle';
        const fr = au[key] ?? au.idle ?? au.walk!;
        const i = key === 'attack' || key === 'shoot'
          ? Math.min(fr.length - 1, Math.floor(((d.cd - e.cd) / d.cd) * fr.length)) // удар синхронен с атакой
          : Math.floor(((T + e.id * 0.37) / (A?.udur[e.type]?.[key] ?? 1)) * fr.length) % fr.length; // ~24 кадра на клип, с реальной скоростью
        fr[i].add(x, g, z, US, US, US, undefined, yaw);
        L.team.add(x, g + 0.03, z, 0.36, 1, 0.36, col);
      } else addModel(e.type, mx, y, mz, yaw, US, col);
      if (selSet.has(e.id)) L.sel.add(x, g + 0.03, z, 0.46, 1, 0.46);
      const mh = maxHp(w, e);
      if (showBar(e.hp < mh, selSet.has(e.id))) bar(x, g + (UH[e.type] ?? 1.05) * US, z, 0.45, e.hp / mh);
    } else {
      const d = BUILDINGS[e.type], k = Math.max(0.15, e.progress / d.time), cx = e.tx + d.size / 2, cz = e.ty + d.size / 2;
      const by = heightAt(cx, cz), bh = (BH[e.type] ?? 1.6) * k;
      const ab = e.type === 'wall' || e.type === 'gate' ? undefined : A?.buildings[e.type]; // стены — свои квадратные блоки, одинаковые по X и Y
      if (ab) ab[colorIdx(e.owner) % ab.length].add(cx, by, cz, 1, k, 1); // здание в цвете игрока
      else if (e.type === 'wall' || e.type === 'gate') drawWallPiece(e, by, k, col); // вдоль линии стены, под любым углом
      else addModel(e.type, cx, by, cz, 0, 1, col, k);
      L.bld.add(cx, by + bh / 2, cz, d.size, bh, d.size);
      bldIds.push(e.id);
      const mh = maxHp(w, e);
      if (showBar(e.hp < mh, selSet.has(e.id))) bar(cx, by + bh + 0.4, cz, d.size * 0.6, e.hp / mh);
      if (selSet.has(e.id)) {
        L.sel.add(cx, by + 0.05, cz, d.size + 0.5, 1, d.size + 0.5);
        if (e.owner === ME && e.rally >= 0) { // флажок точки сбора
          const fx = (e.rally % w.W) + 0.5, fz = ((e.rally / w.W) | 0) + 0.5, fy = heightAt(fx, fz);
          L.flag.add(fx, fy + 0.6, fz, 0.06, 1.2, 0.06); L.flag.add(fx + 0.2, fy + 1.05, fz, 0.4, 0.28, 0.04);
        }
      }
    }
  }
  for (let i = corpses.length - 1; i >= 0; i--) { // павшие лежат 4 секунды и тают
    const c = corpses[i];
    c.t += dt;
    if (c.t > 4) { corpses.splice(i, 1); continue; }
    const s = c.t > 3 ? 4 - c.t : 1;
    const die = A?.units[c.type]?.die;
    if (die) die[Math.min(die.length - 1, Math.floor((c.t / (A?.udur[c.type]?.die ?? 1)) * die.length))].add(c.x, heightAt(c.x, c.z), c.z, s * US, s * US, s * US, undefined, c.yaw);
    else addModel(c.type, c.x, heightAt(c.x, c.z) - 0.02, c.z, c.yaw, s * US, [...pcol(c.owner).map((v) => v * 0.6), 1], 0.2);
  }
  if (selRes >= 0 && w.resType[selRes]) { const rx = (selRes % w.W) + 0.5, rz = ((selRes / w.W) | 0) + 0.5; L.sel.add(rx, heightAt(rx, rz) + 0.04, rz, 0.95, 1, 0.95); }
  for (const ti of w.carcass.values()) { // туши коров: лежат, уменьшаются по мере разделки
    if (!w.resType[ti] || w.resKind[ti] !== 1 || !fog.seen[ti]) continue;
    const cx = (ti % w.W) + 0.5, cz = ((ti / w.W) | 0) + 0.5, k = 0.4 + (0.6 * w.resAmt[ti]) / MEAT;
    addModel('cow', cx, heightAt(cx, cz), cz, (rhash(ti) % 628) / 100, US, [0.55, 0.5, 0.5, 1], 0.3 * k);
  }
  for (const e of w.ents.values()) { // дым из труб домов и столицы
    if (e.kind !== 'b' || (e.type !== 'house' && e.type !== 'town_center') || e.progress < BUILDINGS[e.type].time || !fog.vis[e.tx + e.ty * w.W] || Math.random() > dt * 2.2) continue;
    const d = BUILDINGS[e.type], cx = e.tx + d.size * 0.65, cz = e.ty + d.size * 0.35;
    smoke.push({ x: cx, y: heightAt(cx, cz) + (BH[e.type] ?? 1.6) * 0.95, z: cz, t: 0, life: 3 + Math.random() * 1.5, s: 0.12 + Math.random() * 0.06 });
  }
  L.smoke.begin();
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i];
    p.t += dt;
    if (p.t > p.life) { smoke.splice(i, 1); continue; }
    const k = p.t / p.life, sz = p.s * (1 + k * 3) * (1 - k * 0.6);
    L.smoke.add(p.x + k * 0.6, p.y + p.t * 0.45, p.z + Math.sin(p.t + p.x) * 0.1, sz, sz, sz);
  }
  L.smoke.end();
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.life -= dt;
    if (q.life <= 0) { parts.splice(i, 1); continue; }
    q.vy -= q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    const g = heightAt(q.x, q.z);
    if (q.y < g) { q.y = g; q.vy = 0; q.vx *= 0.5; q.vz *= 0.5; }
    const s = q.s * Math.min(1, (q.life / q.max) * 2);
    L.fx.add(q.x, q.y, q.z, s, s, s, q.col);
  }
  for (let i = arrows.length - 1; i >= 0; i--) { // стрела летит по дуге
    const r = arrows[i];
    r.t += dt;
    const k = r.t / r.dur;
    if (k >= 1) { arrows.splice(i, 1); continue; }
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    L.arrow.add(r.x0 + (r.x1 - r.x0) * k, r.y0 + (r.y1 - r.y0) * k + Math.sin(k * Math.PI) * len * 0.15, r.z0 + (r.z1 - r.z0) * k, 1, 1, 1, undefined, Math.atan2(r.x1 - r.x0, r.z1 - r.z0));
  }
  for (const pair of Object.values(MODELS)) for (const l of pair) l?.end();
  for (const l of A?.layers ?? []) l.end();
  for (const l of Object.values(L)) if (l !== L.border && l !== L.wallG && l !== L.smoke) l.end();
}

// ---------- Ввод ----------
const keys = new Set<string>();
let mouseX = 0, mouseY = 0, mouseIn = false, idleIdx = 0, lastClick = { id: -1, t: 0 };
document.addEventListener('mouseleave', () => (mouseIn = false));
const groups: Record<number, number[]> = {};
let hover = '', wallStart = -1, selRes = -1;
const pendingQ = new Map<number, number>(); // заказы, ещё не дошедшие до симуляции (для раздачи по зданиям)
let placing: string | null = null, drag: [number, number] | null = null, amoveMode = false;
const ghost = box('ghost');
ghost.isPickable = false; ghost.isVisible = false;
const gOk = mat(new Color3(0.3, 1, 0.3), 0.5), gBad = mat(new Color3(1, 0.3, 0.3), 0.5);

const groundAt = (sx: number, sy: number) => { const p = scene.pick(sx, sy, (m) => m === ground); return p?.hit ? p.pickedPoint : null; };
const screen = (x: number, z: number) => Vector3.Project(new Vector3(x, 0.4, z), Matrix.IdentityReadOnly, scene.getTransformMatrix(),
  cam.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight));

function setSel(ids: number[]) {
  sel = [...new Set(ids)].filter((id) => w.ents.has(id));
  selSet.clear(); sel.forEach((id) => selSet.add(id));
}

// Экранная рамка юнита (от ступней до макушки, с учётом рельефа) — выделение цепляет даже краем
const P3 = (x: number, y: number, z: number) => Vector3.Project(new Vector3(x, y, z), Matrix.IdentityReadOnly, scene.getTransformMatrix(),
  cam.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight));
function uBox(u: Unit) {
  const x = u.x / TILE, z = u.y / TILE, g = heightAt(x, z), a = P3(x, g, z), b = P3(x, g + US * (UH[u.type] ?? 1), z);
  const hw = Math.max(7, Math.abs(a.y - b.y) * 0.4);
  return { x0: Math.min(a.x, b.x) - hw, x1: Math.max(a.x, b.x) + hw, y0: Math.min(a.y, b.y) - 3, y1: Math.max(a.y, b.y) + 3 };
}
function entityAt(sx: number, sy: number): Entity | null {
  let best: Entity | null = null, bd = Infinity;
  for (const e of w.ents.values()) if (e.kind === 'u' && fog.visible(e)) {
    const r = uBox(e);
    if (sx < r.x0 - 3 || sx > r.x1 + 3 || sy < r.y0 - 3 || sy > r.y1 + 3) continue;
    const d = (sx - (r.x0 + r.x1) / 2) ** 2 + (sy - (r.y0 + r.y1) / 2) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  const pb = scene.pick(sx, sy, (m) => m === L.bld.mesh);
  if (pb?.hit && pb.thinInstanceIndex >= 0) return w.ents.get(bldIds[pb.thinInstanceIndex]) ?? null;
  return null;
}

const mySel = () => sel.map((id) => w.ents.get(id)).filter((e): e is Unit => !!e && e.kind === 'u' && e.owner === ME && !UNITS[e.type].animal); // коровами не командуют
const isVill = (u: Unit) => UNITS[u.type].cls === 'worker';

// Клетка ресурса под курсором (с «прилипанием» к соседней — по деревьям легко промахнуться)
function resAt(sx: number, sy: number) {
  const g = groundAt(sx, sy);
  if (!g) return -1;
  const tx = Math.floor(g.x), tz = Math.floor(g.z);
  let best = -1, bd = 1.1;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const x = tx + dx, z = tz + dz, i = x + z * w.W;
    if (x < 0 || z < 0 || x >= w.W || z >= w.H || !w.resType[i] || !fog.seen[i]) continue;
    const d = Math.hypot(x + 0.5 - g.x, z + 0.5 - g.z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function rallyTile(sx: number, sy: number) {
  const e = entityAt(sx, sy);
  if (e && e.kind === 'b' && e.type === 'farm' && e.owner === ME) return e.tx + e.ty * w.W;
  const r = resAt(sx, sy);
  if (r >= 0) return r;
  const g = groundAt(sx, sy);
  return g ? Math.floor(g.x) + Math.floor(g.z) * w.W : -1;
}
function order(sx: number, sy: number, amove = false, q = false) {
  const bsel = sel.map((id) => w.ents.get(id)).filter((e): e is Building => !!e && e.kind === 'b' && e.owner === ME);
  if (bsel.length && bsel.length === sel.length) { // ПКМ зданиями — точка сбора (на ресурс/поле — сразу работать)
    const t = rallyTile(sx, sy);
    if (t >= 0) for (const b of bsel) send({ p: ME, t: 'rally', building: b.id, x: t % w.W, y: (t / w.W) | 0 });
    return;
  }
  const mine = mySel();
  if (!mine.length) return;
  const ids = mine.map((u) => u.id), vills = mine.filter(isVill).map((u) => u.id);
  const t = entityAt(sx, sy);
  if (t && t.kind === 'u' && UNITS[t.type].animal && t.owner === ME) { SFX.attack(); return send({ p: ME, q, t: 'attack', units: ids, target: t.id }); } // забить корову
  if (t && !ally(w, t.owner, ME)) { SFX.attack(); return send({ p: ME, q, t: 'attack', units: ids, target: t.id }); }
  if (!amove && t && t.kind === 'b' && vills.length) {
    if (t.progress < BUILDINGS[t.type].time || t.hp < maxHp(w, t)) return send({ p: ME, q, t: 'assist', units: vills, target: t.id }); // стройка или ремонт
    if (t.type === 'farm') return send({ p: ME, q, t: 'farm', units: [vills[0]], target: t.id });
  }
  const g = groundAt(sx, sy);
  if (g) orderTile(Math.floor(g.x), Math.floor(g.z), amove, q);
}

function orderTile(tx: number, ty: number, amove = false, q = false) {
  const mine = mySel(), ids = mine.map((u) => u.id), vills = mine.filter(isVill).map((u) => u.id);
  if (!ids.length) return;
  const i = tx + ty * w.W;
  if (!amove && w.resType[i] && fog.seen[i] && vills.length) {
    send({ p: ME, q, t: 'gather', units: vills, tile: i });
    const others = ids.filter((id) => !vills.includes(id));
    if (others.length) send({ p: ME, q, t: 'move', units: others, x: tx, y: ty });
    return;
  }
  send({ p: ME, q, t: amove ? 'amove' : 'move', units: ids, x: tx, y: ty });
}

function ghostTile(sx: number, sy: number): [number, number] | null {
  const g = groundAt(sx, sy);
  if (!g || !placing) return null;
  const s = BUILDINGS[placing].size;
  return [Math.floor(g.x - s / 2 + 0.5), Math.floor(g.z - s / 2 + 0.5)];
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) {
    if (placing) cancelPlace(); else { order(e.clientX, e.clientY, amoveMode, e.shiftKey); SFX.move(); }
    setAmove(false);
    return;
  }
  if (e.button !== 0) return;
  if (amoveMode) { order(e.clientX, e.clientY, true); SFX.attack(); setAmove(false); return; }
  if (placing === 'wall') { const g = groundAt(e.clientX, e.clientY); if (g) wallStart = Math.floor(g.x) + Math.floor(g.z) * w.W; return; }
  if (placing) {
    const t = ghostTile(e.clientX, e.clientY);
    if (t && canPlace(w, t[0], t[1], BUILDINGS[placing].size) && (placing !== 'farm' || nearFarm(w, ME, t[0], t[1], BUILDINGS[placing].size))) {
      send({ p: ME, q: e.shiftKey, t: 'build', units: sel, type: placing, tx: t[0], ty: t[1] });
      if (!e.shiftKey) { placing = null; ghost.isVisible = false; }
    }
    return;
  }
  drag = [e.clientX, e.clientY];
});
addEventListener('pointermove', (e) => {
  mouseX = e.clientX; mouseY = e.clientY; mouseIn = true;
  const hg = e.target === canvas ? groundAt(e.clientX, e.clientY) : null;
  if (hg) {
    const i = Math.floor(hg.x) + Math.floor(hg.z) * w.W, r = w.regions[w.region[i]];
    hover = fog.seen[i] && r ? `📍 ${r.name}${r.owner >= 0 ? ' — ' + who(r.owner) : ''} (${REGION_KINDS[r.kind].desc})` : '';
  }
  if (placing === 'wall') drawWallGhost(e.clientX, e.clientY);
  if (drag) {
    const bx = $('box');
    bx.style.display = 'block';
    bx.style.left = Math.min(drag[0], e.clientX) + 'px'; bx.style.top = Math.min(drag[1], e.clientY) + 'px';
    bx.style.width = Math.abs(e.clientX - drag[0]) + 'px'; bx.style.height = Math.abs(e.clientY - drag[1]) + 'px';
  }
  if (placing && placing !== 'wall') {
    const t = ghostTile(e.clientX, e.clientY), s = BUILDINGS[placing].size;
    if (!t) return;
    ghost.position.set(t[0] + s / 2, 0.5 + hy(t[0], t[1]), t[1] + s / 2);
    ghost.scaling.set(s, 1, s);
    ghost.material = canPlace(w, t[0], t[1], s) && (placing !== 'farm' || nearFarm(w, ME, t[0], t[1], s)) ? gOk : gBad; // поле — только у фермы
  }
});
addEventListener('pointerup', (e) => {
  if (e.button === 0 && placing === 'wall' && wallStart >= 0) {
    send({ p: ME, t: 'wall', units: sel, tiles: wallLine(wallStart, e.clientX, e.clientY) });
    wallStart = -1;
    if (!e.shiftKey) cancelPlace(); else drawWallGhost(e.clientX, e.clientY);
    return;
  }
  if (e.button !== 0 || !drag) return;
  const [x0, y0] = drag, x1 = e.clientX, y1 = e.clientY;
  drag = null; $('box').style.display = 'none';
  let ids: number[] = [];
  if (Math.abs(x1 - x0) < 6 && Math.abs(y1 - y0) < 6) {
    const t = entityAt(x1, y1);
    selRes = -1;
    if (t) {
      ids = [t.id];
      const now = performance.now();
      if (t.owner === ME && lastClick.id === t.id && now - lastClick.t < 350) // двойной клик — все свои такого же типа на экране
        ids = t.kind === 'u' && UNITS[t.type].animal ? ids : [...w.ents.values()].filter((x) => x.owner === ME && x.type === t.type && onScreen(...entPos(x))).map((x) => x.id);
      lastClick = { id: t.id, t: now };
    } else selRes = resAt(x1, y1); // клик по ресурсу — посмотреть, сколько осталось
  } else {
    const [ax, bx, ay, by] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
    for (const u of w.ents.values()) if (u.kind === 'u' && u.owner === ME && !UNITS[u.type].animal) { // рамка коров не берёт
      const r = uBox(u); // рамка задела юнита хоть краем
      if (r.x1 >= ax && r.x0 <= bx && r.y1 >= ay && r.y0 <= by) ids.push(u.id);
    }
  }
  setSel(e.shiftKey ? [...sel, ...ids] : ids);
});
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'F10') { e.preventDefault(); setPause($('pause').style.display !== 'flex'); }
  if (e.code === 'KeyO') sun.shadowEnabled = !sun.shadowEnabled; // тени вкл/выкл, если тормозит
  if (e.code === 'KeyP' && ssaoMade) { ssaoOn = !ssaoOn; if (ssaoOn) scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', cam); else scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('ssao', cam); } // мягкие контактные тени
  if (e.code === 'Escape') { cancelPlace(); setAmove(false); }
  if (e.code === 'KeyF' && mySel().length) setAmove(true); // F + ЛКМ — атака с движением
  if (e.code === 'KeyX' && mySel().length) send({ p: ME, t: 'stop', units: mySel().map((u) => u.id) });
  if (e.code === 'Delete') { const ids = sel.filter((id) => w.ents.get(id)?.owner === ME); if (ids.length) send({ p: ME, t: 'destroy', ids }); }
  if (e.code === 'KeyH') { // к столице
    const tc = [...w.ents.values()].find((x) => x.kind === 'b' && x.owner === ME && x.type === 'town_center') as Building | undefined;
    if (tc) { setSel([tc.id]); cam.target.x = tc.tx + 1.5; cam.target.z = tc.ty + 1.5; }
  }
  if (e.code === 'Period') nextIdle();
  if (e.code === 'Comma') setSel([...w.ents.values()].filter((u) => u.kind === 'u' && u.owner === ME && UNITS[u.type].cls !== 'worker').map((u) => u.id)); // вся армия
  if (/^Key[A-Z]$/.test(e.code) && !e.ctrlKey && !e.altKey) { // горячие клавиши кнопок панели
    const b = document.querySelector(`#btns [data-hk="${e.code[3]}"]`) as HTMLElement | null;
    if (b && !b.classList.contains('off')) { act(b.dataset.a!); e.preventDefault(); }
  }
  if (e.code === 'Space' && alertAt) { e.preventDefault(); jumpAlert(); }
  const d = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : 0;
  if (d >= 1) {
    if (e.ctrlKey || e.shiftKey) { e.preventDefault(); groups[d] = [...sel]; } // Ctrl+цифру браузер может занять под вкладки — есть Shift
    else setSel(groups[d] ?? []);
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('resize', () => engine.resize());

// Плавная камера: скорость набирается и гасится с инерцией, зум и поворот тоже плавные
let camVX = 0, camVZ = 0, camRot = 0;
function panCamera(dt: number) {
  const k = (a: string, b: string) => (keys.has(a) || keys.has(b) ? 1 : 0);
  const edge = (v: number, max: number) => (!mouseIn || !S.edgeScroll ? 0 : v < 6 ? -1 : v > max - 6 ? 1 : 0); // мышь у края экрана
  const fz = k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown') - edge(mouseY, innerHeight), fx = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft') + edge(mouseX, innerWidth);
  const s = dt / 1000, ease = 1 - Math.exp(-s * 8); // доля «догонки» за кадр
  camRot += ((k('End', 'End') - k('Home', 'Home')) * 1.6 - camRot) * ease;
  cam.alpha += camRot * s;
  const sp = cam.radius * 1.4 * S.camSpeed, fX = -Math.cos(cam.alpha), fZ = -Math.sin(cam.alpha), rX = -Math.sin(cam.alpha), rZ = Math.cos(cam.alpha);
  camVX += ((fX * fz + rX * fx) * sp - camVX) * ease;
  camVZ += ((fZ * fz + rZ * fx) * sp - camVZ) * ease;
  cam.target.x = Math.min(w.W, Math.max(0, cam.target.x + camVX * s));
  cam.target.z = Math.min(w.H, Math.max(0, cam.target.z + camVZ * s));
}

// ---------- Интерфейс: как в классических RTS ----------
// сверху — ресурсы и эпоха, снизу — миникарта, панель выделения и сетка команд с иконками и горячими клавишами
const ICON: Record<string, string> = { food: '🍖', wood: '🪵', stone: '🪨', iron: '⛓️' };
const UICON: Record<string, string> = {
  villager: '🧑‍🌾', clubman: '🪓', spearman: '🔱', archer: '🏹', swordsman: '⚔️', horseman: '🐎', ram: '🪵',
  cow: '🐄', pasture: '🏡', town_center: '🏰', house: '🏠', farm: '🌾', camp: '⛺', barracks: '🛡️', archery: '🎯', tower: '🗼', wall: '🧱', gate: '🚪', stable: '🐴', workshop: '⚒️',
};
const DOING: Record<string, string> = { idle: 'Бездельничает', move: 'Идёт', amove: 'Идёт в атаку', attack: 'Сражается', gather: 'Добывает', farm: 'Работает в поле', build: 'Строит / чинит' };
const costStr = (c: Cost) => RES.filter((r) => c[r]).map((r) => ICON[r] + c[r]).join(' ');
const HK = 'QERTYUIPGJKLZCVBNM'; // горячие клавиши кнопок по порядку (WASD — камера; F H O X — свои)
let hki = 0, tips: Record<string, string> = {};
const btn = (a: string, ic: string, tip: string, ok: boolean, badge = '') => {
  const k = HK[hki++] ?? '';
  tips[a] = tip + (k ? `<br><small>Клавиша: ${k}</small>` : '');
  return `<div class="b${ok ? '' : ' off'}" data-a="${a}" data-hk="${k}">${k ? `<i>${k}</i>` : ''}${ic}${badge ? `<u>${badge}</u>` : ''}</div>`;
};
const qName = (q: string) => (q === '#wheat' ? 'Пшеница' : q === '#age' ? 'эпоха' : q[0] === '@' ? TECHS[q.slice(1)].name : NAMES[q]);
const qIcon = (q: string) => (q === '#wheat' ? '🌾' : q === '#age' ? '⏫' : q[0] === '@' ? BRANCH[TECHS[q.slice(1)].branch].icon : UICON[q] ?? '❔');
const hpBar = (hp: number, mh: number) => { const k = Math.max(0, hp / mh); return `<div class="hp"><div style="width:${k * 100}%;background:${k > 0.6 ? '#5cbf3a' : k > 0.3 ? '#e0b030' : '#d8452e'}"></div></div>`; };
const cache: Record<string, string> = {};
const setHTML = (id: string, html: string) => { if (cache[id] !== html) { $(id).innerHTML = html; cache[id] = html; } };

const selBuildings = () => sel.map((id) => w.ents.get(id)).filter((e): e is Building => !!e && e.kind === 'b' && e.owner === ME);
function act(a: string) {
  const [k, x, y] = a.split(':');
  if (k === 'build') { placing = x; ghost.isVisible = x !== 'wall'; }
  if (k === 'train') { send({ p: ME, t: 'train', building: Number(x), unit: y }); pendingQ.set(Number(x), (pendingQ.get(Number(x)) ?? 0) + 1); }
  if (k === 'sow') send({ p: ME, t: 'sow', building: Number(x) });
  if (k === 'sowm') {
    const b = selBuildings().filter((b) => b.type === 'pasture').sort((a, c) => a.queue.length + (pendingQ.get(a.id) ?? 0) - (c.queue.length + (pendingQ.get(c.id) ?? 0)))[0];
    if (b) { send({ p: ME, t: 'sow', building: b.id }); pendingQ.set(b.id, (pendingQ.get(b.id) ?? 0) + 1); }
  }
  if (k === 'trainm') { // несколько зданий: в то, где очередь короче
    const bs = selBuildings().filter((b) => b.type === x && b.queue.length + (pendingQ.get(b.id) ?? 0) < 5);
    const b = bs.sort((a, c) => a.queue.length + (pendingQ.get(a.id) ?? 0) - (c.queue.length + (pendingQ.get(c.id) ?? 0)))[0];
    if (b) { send({ p: ME, t: 'train', building: b.id, unit: y }); pendingQ.set(b.id, (pendingQ.get(b.id) ?? 0) + 1); }
  }
  if (k === 'cancelm') { // отменить один такой заказ — из самой длинной очереди, с конца
    const b = selBuildings().filter((b) => b.queue.includes(y)).sort((a, c) => c.queue.length - a.queue.length)[0];
    if (b) send({ p: ME, t: 'cancel', building: b.id, index: b.queue.lastIndexOf(y) });
  }
  if (k === 'cancel') send({ p: ME, t: 'cancel', building: Number(x), index: Number(y) });
  if (k === 'res') send({ p: ME, t: 'research', building: Number(x), tech: y });
  if (k === 'age') send({ p: ME, t: 'age', building: Number(x) });
  if (k === 'only') setSel(sel.filter((id) => w.ents.get(id)?.type === x)); // оставить в выделении один тип
  if (k === 'idle') nextIdle();
  if (k === 'conv') send({ p: ME, t: 'convert', building: Number(x), to: y });
  if (k === 'gate') send({ p: ME, t: 'gate', building: Number(x), open: y === '1' });
  if (k === 'alert') jumpAlert();
}
for (const id of ['hud', 'alerts']) $(id).addEventListener('pointerdown', (e) => {
  const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
  if (e.button === 0 && el && !el.classList.contains('off')) act(el.dataset.a!);
});
$('hud').addEventListener('mouseover', (e) => { // подсказка: название, цена, описание
  const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null, tip = $('tip');
  const t = el ? tips[el.dataset.a!] : '';
  tip.style.display = t ? 'block' : 'none';
  if (!t || !el) return;
  tip.innerHTML = t;
  const r = el.getBoundingClientRect();
  tip.style.left = Math.min(innerWidth - 270, r.left) + 'px';
  tip.style.bottom = innerHeight - r.top + 6 + 'px';
});
$('hud').addEventListener('mouseleave', () => ($('tip').style.display = 'none'));

function ui() {
  hki = 0; tips = {};
  const P = w.players[ME];
  const afford = (c: Cost) => RES.every((r) => P.res[r] >= (c[r] ?? 0));
  // верх
  setHTML('res', `<span>👥 <b>${P.pop}/${P.popCap}</b></span>` + RES.map((r) => `<span>${ICON[r]} <b>${P.res[r]}</b></span>`).join(''));
  setHTML('status', `${S.showFps ? `<span>FPS ${Math.round(engine.getFps())}</span>` : ''}<span style="opacity:.45">сб.24</span>

<span>⏱ ${fmt(w.tick)}</span><span>🗺 ${w.regions.filter((r) => r.owner === ME).length}/${w.regions.length}</span><span>${BRANCHES.map((b) => BRANCH[b].icon + cultureLevel(P, b)).join(' ')}</span>`);
  setHTML('agename', `${AGE_NAMES[P.age]} эпоха`);
  setHTML('agesub', `${identity(P)} цивилизация${P.ageing ? ' · переход в новую эпоху…' : ''}`);
  setHTML('hover', hover);
  // уведомления слева
  let al = '';
  const idle = idleVills().length;
  if (idle) al += `<div class="al" data-a="idle">💤 Рабочие бездельничают (${idle}) — клавиша .</div>`;
  if (performance.now() - lastAlert < 6000) al += `<div class="al warn" data-a="alert">⚠ Нас атакуют! — Пробел</div>`;
  if (w.holdBy >= 0) al += `<div class="al info">⏳ ${who(w.holdBy)} удерживает земли: ${fmt(TERR_HOLD - w.holdT)}</div>`;
  for (const g of w.goals) al += `<div class="al info">⏳ ${who(g.p)}: ${GOAL_LABEL[g.kind]} ${fmt(Math.max(0, g.need - g.t))}</div>`;
  setHTML('alerts', al);

  // выделение и команды
  setSel(sel);
  const ents = sel.map((id) => w.ents.get(id)!);
  const one = ents.length === 1 ? ents[0] : null;
  let info = '', btns = '';
  if (selRes >= 0 && !w.resType[selRes]) selRes = -1;
  if (!ents.length && selRes >= 0) { // выбран ресурс
    const rt = w.resType[selRes], meat = w.resKind[selRes] === 1;
    const wh = w.resKind[selRes] === 2 && rt === 1, nm = meat ? 'Туша коровы' : wh ? 'Пшеница' : ['', 'Ягодный куст', 'Дерево', 'Камень', 'Железная руда'][rt], ic = meat ? '🍖' : wh ? '🌾' : ['', '🫐', '🌲', '🪨', '⛓️'][rt];
    const men = [...w.ents.values()].filter((u) => u.kind === 'u' && u.order.t === 'gather' && u.order.tile === selRes).length;
    info = `<div class="pv"><div class="portrait">${ic}</div><div><div class="nm">${nm}</div><div class="sub">Осталось: <b>${w.resAmt[selRes]}</b> ${ICON[RES[rt - 1]]}</div><div class="sub">Добывают: ${men}</div></div></div>`;
  } else if (!ents.length) info = !S.hints ? '' : `<div class="hint">ЛКМ — выбрать (двойной клик — всех таких), рамка — группа. ПКМ — приказ, Shift+ПКМ — в очередь, F+ЛКМ — атака с движением.<br>
    Камера: WASD, стрелки или мышь у края; колесо — зум; Home/End — поворот. X — стоп, Del — снести, H — к столице, . — бездельник, , — армия, Ctrl/Shift+1…9 — группы.<br>
    ПКМ жителями по повреждённому зданию — ремонт. Клик по иконке в очереди — отмена с возвратом ресурсов.</div>`;
  else if (one) {
    const mh = maxHp(w, one), own = one.owner === ME;
    let body = `<div class="nm">${NAMES[one.type]}</div><div class="sub">${who(one.owner)}</div>${hpBar(one.hp, mh)}<div class="stats"><span>❤ ${one.hp}/${mh}</span>`;
    if (one.kind === 'u') {
      const d = UNITS[one.type];
      body += `<span>⚔ ${d.atk}</span><span>🛡 ${d.armor}</span><span>🎯 ${(d.range / TILE).toFixed(1)}</span></div><div class="sub">${DOING[one.order.t] ?? ''}${one.carry ? ` · несёт ${ICON[one.carryRes!]}${one.carry}` : ''}</div>`;
      if (own && d.cls === 'worker') // меню стройки
        for (const [k, bd] of Object.entries(BUILDINGS)) if (bd.age <= P.age && k !== 'gate' && k !== 'farm')
          btns += btn(`build:${k}`, UICON[k], `<b>${NAMES[k]}</b><br>${costStr(bd.cost)}${bd.pop ? `<br>+${bd.pop} к населению` : ''}${k === 'farm' ? '<br><small>Ставится рядом с фермой</small>' : k === 'pasture' ? `<br><small>Сразу засевает ${8} участков пшеницы вокруг, разводит коров, принимает еду</small>` : ''}`, afford(bd.cost));
    } else {
      const d = BUILDINGS[one.type];
      body += `</div>`;
      if (one.progress < d.time) body += `<div class="sub">Строится: ${Math.floor((100 * one.progress) / d.time)}%</div>`;
      else if (own) {
        if (one.queue.length) {
          const q0 = one.queue[0], tot = q0 === '#wheat' ? WHEAT_TIME : q0 === '#age' ? AGE_TIME : q0[0] === '@' ? researchTime(P, q0.slice(1)) : UNITS[q0].time;
          body += `<div class="slots">${one.queue.map((q, i) => `<div class="slot" data-a="cancel:${one.id}:${i}" title="${qName(q)} — клик: отменить">${qIcon(q)}${i === 0 ? `<div class="pb" style="width:${Math.min(100, (100 * one.qt) / tot)}%"></div>` : ''}</div>`).join('')}</div>`;
        }
        for (const u of d.trains ?? []) if (UNITS[u].age <= P.age) {
          const ud = UNITS[u], n = one.queue.filter((q) => q === u).length;
          btns += btn(`train:${one.id}:${u}`, UICON[u], `<b>${NAMES[u]}</b><br>${costStr(ud.cost)}<br>❤ ${ud.hp} ⚔ ${ud.atk} 🛡 ${ud.armor}`, afford(ud.cost), n ? String(n) : '');
        }
        if (one.type === 'wall' || one.type === 'gate') { // стена: сделать воротами или башней; ворота — открыть/закрыть
          if (one.type === 'wall') btns += btn(`conv:${one.id}:gate`, '🚪', '<b>Сделать воротами</b><br>🪨20<br><small>Свои проходят, чужие — нет. Можно открывать и закрывать</small>', afford({ stone: 20 }));
          else btns += btn(`gate:${one.id}:${one.open ? 0 : 1}`, one.open ? '🔒' : '🔓', one.open ? '<b>Закрыть ворота</b><br><small>Не пройдёт никто</small>' : '<b>Открыть ворота</b><br><small>Свои смогут проходить</small>', true);
          btns += btn(`conv:${one.id}:tower`, '🗼', `<b>Башня на стене</b><br>${costStr(BUILDINGS.tower.cost)}<br><small>Стреляет по врагам рядом. Нужна Древняя эпоха</small>`, P.age >= BUILDINGS.tower.age && afford(BUILDINGS.tower.cost));
          if (one.type === 'gate') body += `<div class="sub">${one.open ? 'Ворота открыты' : 'Ворота закрыты'}</div>`;
        }
        if (one.type === 'pasture') { const n = one.queue.filter((q) => q === '#wheat').length; btns += btn(`sow:${one.id}`, '🌾', `<b>Посеять пшеницу</b><br>${costStr(WHEAT_COST)}<br><small>${WHEAT_SOW} участка вокруг фермы, по ${WHEAT} еды. Собранный участок исчезает</small>`, afford(WHEAT_COST), n ? String(n) : ''); }
        const ac = ageCost(P);
        if (one.type === 'town_center' && ac && !P.ageing) btns += btn(`age:${one.id}`, '⏫', `<b>${AGE_NAMES[P.age + 1]} эпоха</b><br>${costStr(ac)}`, afford(ac));
        if (one.type === 'town_center') { // направления развития: слотов мало — выбирай
          const left = slotsLeft(w, P), q = queuedTechs(w, ME);
          btns += `<div class="hdr">Исследования · слотов: ${left}${P.techs.length ? ' · изучено: ' + P.techs.map((t) => BRANCH[TECHS[t].branch].icon).join('') : ''}</div>`;
          for (const [id, t] of Object.entries(TECHS)) if (t.age <= P.age && !P.techs.includes(id) && !q.includes(id))
            btns += btn(`res:${one.id}:${id}`, BRANCH[t.branch].icon, `<b>${t.name}</b> (${BRANCH[t.branch].name})<br>${costStr(t.cost)}<br><small>${t.desc}</small>`, (t.final ? P.techs.length >= FINAL_REQ : left > 0) && afford(t.cost));
        }
      }
    }
    info = `<div class="pv"><div class="portrait">${UICON[one.type] ?? '❔'}</div><div>${body}</div></div>`;
  } else if (ents.every((e) => e.kind === 'b' && e.owner === ME && e.type === ents[0].type && e.progress >= BUILDINGS[e.type].time)) {
    // несколько одинаковых зданий: общий найм, заказы раздаются по очередям, показываем сумму
    const bs = ents as Building[], d = BUILDINGS[bs[0].type], tot: Record<string, number> = {};
    for (const b of bs) for (const q of b.queue) tot[q] = (tot[q] ?? 0) + 1;
    info = `<div class="pv"><div class="portrait">${UICON[bs[0].type] ?? '❔'}</div><div><div class="nm">${NAMES[bs[0].type]} ×${bs.length}</div>`
      + `<div class="sub">В работе: ${Object.values(tot).reduce((a, b) => a + b, 0) || 'ничего'}</div>`
      + `<div class="slots">${Object.entries(tot).map(([q, n]) => `<div class="slot" data-a="cancelm:${bs[0].type}:${q}" title="${qName(q)} — клик: отменить один">${qIcon(q)}<u>${n}</u></div>`).join('')}</div></div></div>`;
    for (const u of d.trains ?? []) if (UNITS[u].age <= P.age) {
      const ud = UNITS[u];
      btns += btn(`trainm:${bs[0].type}:${u}`, UICON[u], `<b>${NAMES[u]}</b><br>${costStr(ud.cost)}<br>❤ ${ud.hp} ⚔ ${ud.atk} 🛡 ${ud.armor}<br><small>Заказ уйдёт в здание с самой короткой очередью</small>`, afford(ud.cost), tot[u] ? String(tot[u]) : '');
    }
    if (bs[0].type === 'pasture') btns += btn('sowm:pasture', '🌾', `<b>Посеять пшеницу</b><br>${costStr(WHEAT_COST)}<br><small>В ферму с самой короткой очередью</small>`, afford(WHEAT_COST), tot['#wheat'] ? String(tot['#wheat']) : '');
  } else { // группа: иконки по типам, клик — оставить только этот тип
    const cnt: Record<string, number> = {};
    for (const e of ents) cnt[e.type] = (cnt[e.type] ?? 0) + 1;
    info = `<div class="nm">Выбрано: ${ents.length}</div><div class="grp">${Object.entries(cnt).map(([t, n]) => `<div class="slot" data-a="only:${t}" title="${NAMES[t]} — оставить только их">${UICON[t] ?? '❔'}<u>${n}</u></div>`).join('')}</div>`;
    if (ents.some((e) => e.kind === 'u' && e.owner === ME && UNITS[e.type].cls === 'worker'))
      for (const [k, d] of Object.entries(BUILDINGS)) if (d.age <= P.age && k !== 'gate' && k !== 'farm') btns += btn(`build:${k}`, UICON[k], `<b>${NAMES[k]}</b><br>${costStr(d.cost)}`, afford(d.cost));
  }
  setHTML('info', info);
  setHTML('btns', btns);
  if (w.winner >= 0 || !P.alive) endScreen();
}

// ---------- Стены и границы регионов ----------
function cancelPlace() { placing = null; wallStart = -1; ghost.isVisible = false; L.wallG.begin(); L.wallG.end(); }
function wallLine(start: number, sx: number, sy: number): number[] { // линия Брезенхэма, до 40 сегментов
  const g = groundAt(sx, sy);
  if (!g) return [start];
  let x0 = start % w.W, y0 = (start / w.W) | 0;
  const x1 = Math.floor(g.x), y1 = Math.floor(g.z), dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), ix = x0 < x1 ? 1 : -1, iy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const out: number[] = [];
  for (;;) {
    out.push(x0 + y0 * w.W);
    if ((x0 === x1 && y0 === y1) || out.length >= 40) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += ix; }
    if (e2 <= dx) { err += dx; y0 += iy; }
  }
  return out;
}
function drawWallGhost(sx: number, sy: number) {
  const g = groundAt(sx, sy);
  const tiles = wallStart >= 0 ? wallLine(wallStart, sx, sy) : g ? [Math.floor(g.x) + Math.floor(g.z) * w.W] : [];
  L.wallG.begin();
  const f = tiles.length > 1 ? lineFrame(tiles[0], tiles[tiles.length - 1]) : null;
  for (const i of tiles) {
    const x = i % w.W, y = (i / w.W) | 0;
    let px = x + 0.5, pz = y + 0.5;
    if (f) { const t = (px - f.ax) * f.ux + (pz - f.az) * f.uz; px = f.ax + f.ux * t; pz = f.az + f.uz * t; }
    L.wallG.add(px, 0.5 + hy(x, y), pz, f ? f.sp + 0.04 : 0.9, 1, 0.6, canPlace(w, x, y, 1) ? [0.3, 1, 0.3, 1] : [1, 0.25, 0.25, 1], f?.yaw ?? 0); // красный — занято
  }
  L.wallG.end();
}
function drawBorders() { // границы регионов цветом владельца
  L.border.begin();
  const col = (k: number) => { const o = w.regions[k].owner; return o >= 0 ? [...pcol(o), 1] : [0.85, 0.85, 0.8, 1]; };
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
    const i = x + y * w.W, r = w.region[i];
    if (!fog.seen[i]) continue;
    if (w.regions[r].owner < 0 && (x + 1 >= w.W || w.regions[w.region[i + 1]].owner < 0) && (y + 1 >= w.H || w.regions[w.region[i + w.W]].owner < 0)) continue; // ничейные границы не рисуем
    if (x + 1 < w.W && w.region[i + 1] !== r) L.border.add(x + 1, heightAt(x + 1, y + 0.5) + 0.06, y + 0.5, 0.05, 0.03, 1, col(w.regions[r].owner >= 0 ? r : w.region[i + 1]));
    if (y + 1 < w.H && w.region[i + w.W] !== r) L.border.add(x + 0.5, heightAt(x + 0.5, y + 1) + 0.06, y + 1, 1, 0.03, 0.05, col(w.regions[r].owner >= 0 ? r : w.region[i + w.W]));
  }
  L.border.end();
}

// ---------- Миникарта, звук, тревога ----------
const idleVills = () => [...w.ents.values()].filter((x): x is Unit => x.kind === 'u' && x.owner === ME && UNITS[x.type].cls === 'worker' && x.order.t === 'idle');
const entPos = (e: Entity): [number, number] => (e.kind === 'u' ? [e.x / TILE, e.y / TILE] : [e.tx + BUILDINGS[e.type].size / 2, e.ty + BUILDINGS[e.type].size / 2]);
const onScreen = (x: number, z: number) => { const p = screen(x, z); return p.x >= 0 && p.y >= 0 && p.x <= innerWidth && p.y <= innerHeight; };
function nextIdle() { // следующий бездельник
  const idle = idleVills();
  if (idle.length) { const u = idle[idleIdx++ % idle.length]; setSel([u.id]); cam.target.x = u.x / TILE; cam.target.z = u.y / TILE; }
}
function jumpAlert() { if (alertAt) { cam.target.x = alertAt[0]; cam.target.z = alertAt[1]; } }
function setAmove(v: boolean) { amoveMode = v; canvas.style.cursor = v ? 'crosshair' : 'default'; }
const mm = $('mm') as HTMLCanvasElement, mmK = mm.width / w.W;
const mmTile = (e: PointerEvent) => [Math.floor(e.offsetX / mmK), Math.floor(w.H - e.offsetY / mmK)] as const;
mm.addEventListener('contextmenu', (e) => e.preventDefault());
mm.addEventListener('pointerdown', (e) => {
  const [tx, ty] = mmTile(e);
  if (e.button === 0 && !amoveMode) { cam.target.x = tx; cam.target.z = ty; }
  else { orderTile(tx, ty, amoveMode); SFX.move(); setAmove(false); }
});
mm.addEventListener('pointermove', (e) => {
  const hg = e.target === canvas ? groundAt(e.clientX, e.clientY) : null;
  if (hg) {
    const i = Math.floor(hg.x) + Math.floor(hg.z) * w.W, r = w.regions[w.region[i]];
    hover = fog.seen[i] && r ? `📍 ${r.name}${r.owner >= 0 ? ' — ' + who(r.owner) : ''} (${REGION_KINDS[r.kind].desc})` : '';
  }
  if (placing === 'wall') drawWallGhost(e.clientX, e.clientY);
  if (e.buttons === 1 && !amoveMode) { const [tx, ty] = mmTile(e); cam.target.x = tx; cam.target.z = ty; }
});

let lastHit = 0, lastAlert = -1e9, alertAt: [number, number] | null = null;
let newsTimer = 0;
function onFx(f: Fx) {
  if (f.k !== 'news') effectFx(f);
  if (f.k === 'news') { // общее событие: баннер + сигнал
    const c = [...w.chron].reverse().find((c) => c.p < 0);
    if (!c) return;
    $('news').textContent = c.text.replace(/P(\d)/g, (_, n) => who(Number(n)));
    clearTimeout(newsTimer);
    newsTimer = setTimeout(() => ($('news').textContent = ''), 7000);
    SFX.built();
    return;
  }
  const now = performance.now(), x = f.x / TILE, y = f.y / TILE, seen = fog.vis[(x | 0) + (y | 0) * w.W];
  if (f.owner === ME && f.k === 'spawn') SFX.train();
  else if (f.owner === ME && f.k === 'built') SFX.built();
  else if (f.owner === ME && f.k === 'age') SFX.age();
  else if (f.k === 'die' && seen) SFX.die();
  else if (f.k === 'hit') {
    if (seen && now - lastHit > 120) { SFX.hit(); lastHit = now; }
    if (f.owner === ME && now - lastAlert > 15000 && Math.hypot(x - cam.target.x, y - cam.target.z) > 20) { SFX.alert(); lastAlert = now; alertAt = [x, y]; }
  }
}

function doStep(cmds: Command[]) {
  prev.clear();
  for (const e of w.ents.values()) if (e.kind === 'u') prev.set(e.id, [e.x, e.y]);
  step(w, cmds);
  pendingQ.clear();
  if (w.tick % 10 === 0) { // где ходят — там со временем тропа
    for (let i = 0; i < traffic.length; i++) traffic[i] *= 0.996;
    for (const e of w.ents.values()) if (e.kind === 'u' && !UNITS[e.type].animal && (e.path.length || e.order.t === 'gather')) traffic[((e.x / TILE) | 0) + ((e.y / TILE) | 0) * w.W] += 1;
    if (w.tick % 20 === 0) { updateSplat(); gDirty = true; }
  }
  for (const f of w.fx) onFx(f);
  if (net && w.tick % 50 === 0) net.hash(w.tick, hash(w)); // сервер сверит с собой
}
if (net) net.onDesync = (t) => { $('msg').style.display = 'block'; $('msg').textContent = `Рассинхрон на тике ${t}`; };
// Пауза и выход в главное меню (F10 или кнопка ☰)
let paused = false;
const setPause = (v: boolean) => { paused = v && !net; $('pause').style.display = v ? 'flex' : 'none'; };
$('menuBtn').onclick = () => setPause(true);
$('pResume').onclick = () => setPause(false);
$('pExit').onclick = () => { location.href = location.pathname; };
for (const id of ['hud', 'topbar', 'alerts']) ($(id).style as unknown as Record<string, string>).zoom = String(S.uiScale); // масштаб интерфейса

// ---------- Итог матча и хроника ----------
const who = (n: number) => (net ? net.names[n] : n === ME ? 'Вы' : 'Бот') ?? `Игрок ${n + 1}`;
let ended = false;
function endScreen() {
  if (ended) return;
  ended = true;
  const P = w.players[ME], won = w.winner >= 0 && ally(w, w.winner, ME);
  const hist = JSON.parse(localStorage.getItem('epohi-history') ?? '[]');
  hist.push({ date: Date.now(), won, title: identity(P), years: year(w.tick), techs: P.techs });
  localStorage.setItem('epohi-history', JSON.stringify(hist.slice(-50)));
  const lines = w.chron.filter((c) => c.p === ME || c.p < 0).map((c) => `<div>Год ${year(c.tick)} — ${c.text.replace(/P(\d)/g, (_, n) => who(Number(n)))}</div>`).join('');
  const el = document.createElement('div');
  el.id = 'end';
  el.innerHTML = `<h1>${won ? 'Победа' : 'Поражение'}</h1>${w.winKind ? `<div>${WIN_NAMES[w.winKind]} победа: ${who(w.winner)}</div>` : ''}
    <h3>${identity(P)} цивилизация · ${year(w.tick)} лет истории</h3>
    <div>${BRANCHES.map((b) => `${BRANCH[b].icon} ${BRANCH[b].cult}: ур. ${cultureLevel(P, b)} (${P.culture[b]})`).join(' · ')}</div>
    <div>Добыто ${P.stats.gathered} · обучено ${P.stats.trained} · убито ${P.stats.kills} · потеряно ${P.stats.lost} · построено ${P.stats.built}</div>
    <h3>Хроника</h3><div class="chron">${lines}</div>
    <p>Сыграно партий: ${hist.length}, побед: ${hist.filter((h: { won: boolean }) => h.won).length}</p>
    <button onclick="location.reload()">Ещё партия</button>`;
  document.body.append(el);
}

// ---------- Цикл: симуляция 10 Гц, рендер — сколько тянет монитор ----------
drawTerrain();
let acc = 0, frame = 0, lastNb = -1, lastFrame = performance.now();
// Мягкое затенение в углах и у земли (SSAO) — объём, как в современных стилизованных играх. P — вкл/выкл
let ssaoOn = S.ssao, ssaoMade = false;
if (ssaoOn) try {
  const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [cam]);
  ssao.radius = 1.2; ssao.totalStrength = 1.0; ssao.samples = 8; ssao.expensiveBlur = false;
  const gbr = scene.enableGeometryBufferRenderer();
  ssaoMade = true;
  if (gbr) gbr.renderList = scene.meshes.filter((m) => m !== G.mesh && m !== fog.mesh && m.name !== 'water' && m.name !== 'sky'); // трава и дымка — без AO (дорого и не нужно)
} catch (e) { ssaoOn = false; console.warn('SSAO недоступен', e); }
let loopErr = false;
engine.runRenderLoop(() => {
  try {
  const nowT = performance.now();
  if (S.fpsLimit && nowT - lastFrame < 1000 / S.fpsLimit - 1) return; // ограничение FPS
  const dt = Math.min(250, nowT - lastFrame);
  lastFrame = nowT;
  acc = paused ? 0 : Math.min(acc + dt, 500);
  const tick = TICK_MS / gameSpeed; // скорость игры из меню
  if (!net) while (acc >= tick && w.winner < 0) { acc -= tick; doStep([...pending.splice(0), ...bots.flatMap((b) => b.think(w))]); }
  else {
    // Шагаем только по пакетам сервера: отстали — догоняем, пакета нет — ждём
    let k = 0;
    while (net.queue.length && (acc >= TICK_MS || net.queue.length > 2) && k++ < 20) { acc = Math.max(0, acc - TICK_MS); doStep(net.queue.shift()!.cmds); }
    if (!net.queue.length) acc = Math.min(acc, TICK_MS);
  }
  if (frame++ % 6 === 0) {
    fog.update(); fog.draw();
    const dirty = fog.changed;
    if (fog.changed) { drawTerrain(); fog.changed = false; }
    drawRes();
    let nb = 0;
    for (const e of w.ents.values()) if (e.kind === 'b') nb += e.id; // набор зданий изменился — траву под ними убрать
    if (dirty || nb !== lastNb) { lastNb = nb; gDirty = true; } // трава пересоберётся: новые разведанные клетки / здания
    drawBorders();
    drawMinimap(mm, w, fog, { x: cam.target.x, z: cam.target.z, r: cam.radius }, w.players.map((p) => '#' + pcol(p.id).map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')));
  }
  panCamera(dt);
  drawEnts(Math.min(1, acc / (TICK_MS / gameSpeed)));
  ui();
  } catch (err) { if (!loopErr) { loopErr = true; console.error('Ошибка кадра (игра продолжается):', err); } }
  setWind(S.wind ? performance.now() / 1000 : 0);
  skyM.setFloat('uTime', performance.now() / 1000);
  wm.setFloat('uTime', performance.now() / 1000); wm.setVector3('uCam', cam.position); wm.setVector3('uSun', sun.direction); wm.setColor3('uFog', scene.fogColor); wm.setFloat('uFogD', scene.fogDensity);
  bladesFrame();
  scene.render();
});
