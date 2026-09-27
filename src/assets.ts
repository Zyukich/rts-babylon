// Загрузка настоящих моделей (glTF) по манифесту, который собрал scripts/fetch-assets.mjs.
// Анимации персонажей «запекаются» в набор поз: каждая поза — обычный меш, который рисуется тонкими инстансами.
// Так сотни анимированных юнитов стоят почти как статичные. Нет манифеста или файла — остаются процедурные модели.
import '@babylonjs/loaders/glTF';
import { SceneLoader, Mesh, VertexData, Vector3, Texture, Color3, MultiMaterial, type Scene, type AbstractMesh, type AnimationGroup, type AssetContainer, type Material } from '@babylonjs/core';

export interface LayerLike { mesh: Mesh; begin(): void; add(x: number, y: number, z: number, sx: number, sy: number, sz: number, col?: number[], yaw?: number): void; end(): void; }
export type AnimKey = 'idle' | 'walk' | 'attack' | 'shoot' | 'work' | 'die';
export interface Assets {
  units: Record<string, Partial<Record<AnimKey, LayerLike[]>>>; // тип → анимация → кадры
  udur: Record<string, Partial<Record<AnimKey, number>>>;      // длительность клипа, с
  buildings: Record<string, LayerLike[]>;                       // тип → варианты по цветам игроков
  staged: Record<string, LayerLike[][][]>;                      // тип → [эпоха][вариант][стадия стройки] (пак Quaternius)
  trees: LayerLike[]; rock: LayerLike | null; iron: LayerLike | null; bush: LayerLike | null;
  textures: Record<string, Texture>;
  layers: LayerLike[]; natureLayers: LayerLike[];
}
interface AnimRef { file: string; name: string; }
interface Manifest {
  units?: Record<string, { file: string; anims: Partial<Record<AnimKey, AnimRef | null>> }>;
  buildings?: Record<string, string[]>; staged?: Record<string, string[][][]>; nature?: { tree?: string | null; trees?: string[]; rock?: string | null; bush?: string | null }; textures?: Record<string, string>;
}

const ROOT = '/assets/';
const FRAMES: Record<AnimKey, number> = { idle: 12, walk: 24, attack: 16, shoot: 16, work: 16, die: 16 }; // плавнее: ~24–30 кадров/с
const split = (file: string): [string, string] => { const i = file.lastIndexOf('/'); return [ROOT + file.slice(0, i + 1), file.slice(i + 1)]; };
const load = (file: string, scene: Scene) => { const [d, n] = split(file); return SceneLoader.LoadAssetContainerAsync(d, n, scene); };

// Делаем материалы непрозрачными и двусторонними: иначе у части моделей просвечивают стены
function solid(mat: Material | null) {
  if (!mat) return;
  if (mat instanceof MultiMaterial) { mat.subMaterials.forEach((m) => solid(m)); return; }
  const m = mat as unknown as Record<string, unknown> & { albedoTexture?: Texture; diffuseTexture?: Texture };
  m.alpha = 1;
  m.backFaceCulling = false;
  if ('transparencyMode' in m) m.transparencyMode = 0; // OPAQUE
  if ('useAlphaFromAlbedoTexture' in m) m.useAlphaFromAlbedoTexture = false;
  if ('useAlphaFromDiffuseTexture' in m) m.useAlphaFromDiffuseTexture = false;
  for (const t of [m.albedoTexture, m.diffuseTexture]) if (t) t.hasAlpha = false;
  if ('metallic' in m) { m.metallic = 0; m.roughness = 0.75; } // мягкий стилизованный вид вместо металла
  if ('twoSidedLighting' in m) m.twoSidedLighting = false; // нормали в снимке уже наружу; иначе у doubleSided-моделей (Quaternius) после разворота граней свет «со спины» — они чёрные
}
// Перекраска (для железной руды из обычного камня): клон материала с другим цветом
function tint(mesh: Mesh, c: Color3) {
  const paint = (mat: Material | null): Material | null => {
    if (!mat) return null;
    if (mat instanceof MultiMaterial) { const mm = mat.clone(mat.name + '_t', false); mm.subMaterials = mat.subMaterials.map((s) => paint(s)); return mm; }
    const cl = mat.clone(mat.name + '_t')!, r = cl as unknown as { albedoColor?: Color3; diffuseColor?: Color3 };
    if (r.albedoColor) r.albedoColor = c; if (r.diffuseColor) r.diffuseColor = c;
    return cl;
  };
  mesh.material = paint(mesh.material);
}

// Снимок мешей в текущей позе → один статичный меш в мировых координатах (скелет и иерархия «впекаются»)
function snapshot(scene: Scene, meshes: AbstractMesh[], skinned: boolean): Mesh | null {
  const parts: Mesh[] = [], v = new Vector3();
  for (const m of meshes) {
    const pos = m.getPositionData(skinned, false), src = VertexData.ExtractFromMesh(m as Mesh);
    if (!pos || !src.indices) continue;
    const wm = m.computeWorldMatrix(true), out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      Vector3.TransformCoordinatesFromFloatsToRef(pos[i], pos[i + 1], pos[i + 2], wm, v);
      out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
    }
    const idx = Array.from(src.indices);
    if (wm.determinant() < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } // зеркало glTF → разворот граней
    const vd = new VertexData(), nrm: number[] = [];
    vd.positions = out; vd.indices = idx; vd.uvs = src.uvs ?? new Float32Array((pos.length / 3) * 2);
    const fileN = m.getNormalsData(skinned, false); // родные нормали из файла (для юнитов — уже в позе скелета)
    if (fileN && fileN.length === pos.length) for (let i = 0; i < fileN.length; i += 3) {
      Vector3.TransformNormalFromFloatsToRef(fileN[i], fileN[i + 1], fileN[i + 2], wm, v);
      v.normalize(); nrm.push(v.x, v.y, v.z);
    } else VertexData.ComputeNormals(out, idx, nrm); // пересчёт после зеркала давал нормали «со спины» — модели выглядели почти чёрными
    // Страховка: в среднем нормали должны смотреть от центра модели, иначе освещённая сторона темнеет
    let cx = 0, cy = 0, cz = 0, n = out.length / 3, dot = 0;
    for (let i = 0; i < out.length; i += 3) { cx += out[i]; cy += out[i + 1]; cz += out[i + 2]; }
    cx /= n; cy /= n; cz /= n;
    for (let i = 0; i < out.length; i += 3) dot += nrm[i] * (out[i] - cx) + nrm[i + 1] * (out[i + 1] - cy) + nrm[i + 2] * (out[i + 2] - cz);
    if (dot < 0) for (let i = 0; i < nrm.length; i++) nrm[i] = -nrm[i];
    vd.normals = nrm;
    const p = new Mesh('part', scene);
    vd.applyToMesh(p);
    solid(m.material);
    p.material = m.material;
    parts.push(p);
  }
  return parts.length ? Mesh.MergeMeshes(parts, true, true, undefined, false, true) : null;
}
function normalize(m: Mesh, s: number, ox: number, oy: number, oz: number) {
  m.scaling.setAll(s);
  m.position.set(-ox * s, -oy * s, -oz * s);
  m.bakeCurrentTransformIntoVertices();
  m.refreshBoundingInfo();
  m.isPickable = false;
}
function cleanup(c: AssetContainer) { // материалы оставляем — ими пользуются снимки
  for (const g of c.animationGroups) g.dispose();
  for (const m of c.meshes) m.dispose(false, false);
  for (const n of c.transformNodes) n.dispose(false, false);
  for (const s of c.skeletons) s.dispose();
}

// fit: общий масштаб для стадий стройки одного здания — первым грузится готовое, остальные подгоняются под него
interface Fit { s?: number; ox?: number; oy?: number; oz?: number; keepBase?: boolean }
async function loadStatic(scene: Scene, file: string, footprint: number, fit: Fit = {}): Promise<Mesh | null> {
  const c = await load(file, scene);
  c.addAllToScene();
  let ms = c.meshes.filter((x) => x.getTotalVertices() > 0 && x.isEnabled());
  // Выкидываем «подставки»: шестигранные плиты-основания и плоские подложки, на которых стоят здания в паке
  const box = (x: AbstractMesh) => { x.computeWorldMatrix(true); x.refreshBoundingInfo({}); return x.getBoundingInfo().boundingBox; };
  const all = ms.map(box), top = Math.max(...all.map((b) => b.maximumWorld.y)), bottom = Math.min(...all.map((b) => b.minimumWorld.y));
  const wide = Math.max(...all.map((b) => (b.maximumWorld.x - b.minimumWorld.x) * (b.maximumWorld.z - b.minimumWorld.z)));
  const keep = ms.filter((x, i) => {
    const b = all[i], flat = b.maximumWorld.y - b.minimumWorld.y < (top - bottom) * 0.15;
    const area = (b.maximumWorld.x - b.minimumWorld.x) * (b.maximumWorld.z - b.minimumWorld.z);
    return !/hex|tile|base|ground/i.test(x.name) && !(flat && area > wide * 0.6);
  });
  if (keep.length && !fit.keepBase) ms = keep;
  const m = snapshot(scene, ms, false);
  cleanup(c);
  if (!m) return null;
  if (fit.s === undefined) {
    const b = m.getBoundingInfo().boundingBox, ext = Math.max(b.maximum.x - b.minimum.x, b.maximum.z - b.minimum.z) || 1;
    Object.assign(fit, { s: footprint / ext, ox: (b.minimum.x + b.maximum.x) / 2, oy: b.minimum.y, oz: (b.minimum.z + b.maximum.z) / 2 });
  }
  normalize(m, fit.s!, fit.ox!, fit.oy!, fit.oz!);
  return m;
}

async function loadUnit(scene: Scene, spec: { file: string; anims: Partial<Record<AnimKey, AnimRef | null>> }, libs: Map<string, AssetContainer>) {
  const c = await load(spec.file, scene);
  c.addAllToScene();
  for (const g of c.animationGroups) g.stop();
  const byName = new Map<string, unknown>();
  for (const n of [...c.transformNodes, ...c.meshes]) byName.set(n.name, n);
  const groupFor = async (a?: AnimRef | null): Promise<AnimationGroup | null> => {
    if (!a) return null;
    if (a.file === spec.file) return c.animationGroups.find((g) => g.name === a.name) ?? null;
    let lib = libs.get(a.file);
    if (!lib) { lib = await load(a.file, scene); libs.set(a.file, lib); }
    const src = lib.animationGroups.find((g) => g.name === a.name);
    return src ? src.clone(`${a.name}_${spec.file}`, (t) => byName.get(t.name) ?? t) : null; // переносим анимацию на кости персонажа по именам
  };
  const meshes = c.meshes.filter((m) => m.getTotalVertices() > 0 && m.isEnabled() && m.isVisible);
  const out: Partial<Record<AnimKey, Mesh[]>> = {}, durs: Partial<Record<AnimKey, number>> = {};
  let norm: number[] | null = null;
  for (const key of ['idle', 'walk', 'attack', 'shoot', 'work', 'die'] as AnimKey[]) {
    const g = await groupFor(spec.anims[key]);
    if (!g) continue;
    for (const o of c.animationGroups) o.stop();
    const F = FRAMES[key], list: Mesh[] = [];
    for (let k = 0; k < F; k++) {
      const t = g.from + ((g.to - g.from) * k) / (key === 'die' ? F - 1 : F);
      g.start(false, 1, g.from, g.to);
      g.goToFrame(t);
      g.pause();
      for (const n of c.transformNodes) n.computeWorldMatrix(true);
      for (const s of c.skeletons) s.prepare(true);
      const m = snapshot(scene, meshes, true);
      if (!m) continue;
      if (!norm) { // масштаб и центр — по первой позе: рост ≈ 0.95 клетки, ноги на земле
        const b = m.getBoundingInfo().boundingBox;
        norm = [0.95 / ((b.maximum.y - b.minimum.y) || 1), (b.minimum.x + b.maximum.x) / 2, b.minimum.y, (b.minimum.z + b.maximum.z) / 2];
      }
      normalize(m, norm[0], norm[1], norm[2], norm[3]);
      list.push(m);
    }
    g.stop();
    if (list.length) { out[key] = list; durs[key] = Math.max(0.25, (g.to - g.from) / 60); }
  }
  cleanup(c);
  return Object.keys(out).length ? { out, durs } : null;
}

export async function loadAssets(scene: Scene, make: (m: Mesh) => LayerLike, sizes: Record<string, { size: number }>): Promise<Assets | null> {
  let man: Manifest;
  try {
    const r = await fetch(ROOT + 'manifest.json');
    if (!r.ok) return null;
    man = await r.json();
  } catch { return null; }
  const A: Assets = { units: {}, udur: {}, buildings: {}, staged: {}, trees: [], rock: null, iron: null, bush: null, textures: {}, layers: [], natureLayers: [] };
  const cache = new Map<string, LayerLike>(), libs = new Map<string, AssetContainer>();
  const staticLayer = async (file: string, footprint: number, color?: Color3) => {
    const key = `${file}@${footprint}@${color?.toHexString() ?? ''}`;
    if (!cache.has(key)) {
      const m = await loadStatic(scene, file, footprint).catch((e) => { console.warn('Модель не загрузилась:', file, e); return null; });
      if (!m) return null;
      if (color) tint(m, color);
      cache.set(key, make(m));
    }
    return cache.get(key)!;
  };
  for (const [type, files] of Object.entries(man.buildings ?? {})) {
    if (!sizes[type]) continue;
    const ls: LayerLike[] = [];
    for (const f of files) { const l = await staticLayer(f, sizes[type].size * 0.95); if (l) ls.push(l); }
    if (ls.length) A.buildings[type] = ls;
  }
  for (const [type, tiers] of Object.entries(man.staged ?? {})) { // здания по эпохам со стадиями стройки
    if (!sizes[type]) continue;
    const out: LayerLike[][][] = [];
    for (const tier of tiers) {
      const vs: LayerLike[][] = [];
      for (const stages of tier) {
        const fit: Fit = { keepBase: true }, ls: (LayerLike | null)[] = new Array(stages.length).fill(null);
        for (let i = stages.length - 1; i >= 0; i--) { // готовое — первым: по нему масштаб для остальных стадий
          const m = await loadStatic(scene, stages[i], sizes[type].size * 0.95, fit).catch((e) => { console.warn('Модель не загрузилась:', stages[i], e); return null; });
          if (m) { const l = make(m); ls[i] = l; A.layers.push(l); }
        }
        const ok = ls.filter((l): l is LayerLike => !!l);
        if (ls[ls.length - 1] && ok.length) vs.push(ok);
      }
      if (vs.length) out.push(vs);
    }
    if (out.length) A.staged[type] = out;
  }
  for (const [type, spec] of Object.entries(man.units ?? {})) {
    const got = await loadUnit(scene, spec, libs).catch((e) => { console.warn('Юнит не загрузился:', type, e); return null; });
    const frames = got?.out;
    if (got) A.udur[type] = got.durs;
    if (!frames) continue;
    A.units[type] = {};
    for (const [k, list] of Object.entries(frames)) {
      const ls = list!.map((m) => make(m));
      A.units[type][k as AnimKey] = ls;
      A.layers.push(...ls);
    }
  }
  A.layers.push(...new Set(cache.values()));
  const nat = man.nature ?? {};
  for (const f of nat.trees ?? (nat.tree ? [nat.tree] : [])) { const l = await staticLayer(f, 0.9); if (l) A.trees.push(l); }
  if (nat.rock) {
    A.rock = await staticLayer(nat.rock, 0.8);
    A.iron = await staticLayer(nat.rock, 0.8, new Color3(0.55, 0.32, 0.26)); // руда — тот же камень с ржавым оттенком
  }
  if (nat.bush) A.bush = await staticLayer(nat.bush, 0.7);
  // природа рисуется в drawRes — отделяем её от общего списка
  A.natureLayers = [...A.trees, A.rock, A.iron, A.bush].filter((l): l is LayerLike => !!l);
  A.layers = A.layers.filter((l) => !A.natureLayers.includes(l));
  for (const [k, p] of Object.entries(man.textures ?? {})) A.textures[k] = new Texture(ROOT + p, scene);
  for (const lib of libs.values()) lib.dispose();
  return A;
}
