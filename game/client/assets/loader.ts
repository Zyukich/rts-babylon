// Загрузка настоящих моделей (glTF) по манифесту, который собирает `npm run assets` из assets/catalog.json.
// Анимации персонажей «запекаются» в набор поз: каждая поза — обычный меш, который рисуется тонкими инстансами.
// Так сотни анимированных юнитов стоят почти как статичные. Нет манифеста или файла — остаются процедурные модели.
import '@babylonjs/loaders/glTF';
import { ANIM_FRAMES, UNIT_HEIGHT } from '../config/visual.ts';
import { SceneLoader, Mesh, VertexData, Vector3, Texture, MultiMaterial, type Scene, type AbstractMesh, type AnimationGroup, type AssetContainer, type Material } from '@babylonjs/core';

export interface LayerLike { mesh: Mesh; begin(): void; add(x: number, y: number, z: number, sx: number, sy: number, sz: number, col?: number[], yaw?: number): void; end(): void; }
export type AnimKey = 'idle' | 'walk' | 'attack' | 'shoot' | 'work' | 'die';
export interface Assets {
  units: Record<string, Partial<Record<AnimKey, LayerLike[]>>>; // тип → анимация → кадры
  udur: Record<string, Partial<Record<AnimKey, number>>>;      // длительность клипа, с
  buildings: Record<string, LayerLike[]>;                       // тип → варианты по цветам игроков
  staged: Record<string, LayerLike[][][]>;                      // тип → [эпоха][вариант][стадия стройки]
  textures: Record<string, Texture>;
  layers: LayerLike[];
}
interface AnimRef { file: string; name: string; }
/** public/assets/manifest.json — собирает scripts/assets/build.mjs */
export interface Manifest {
  version: number;
  units?: Record<string, { file: string; anims: Partial<Record<AnimKey, AnimRef>> }>;
  buildings?: Record<string, { ages?: string[][][]; colors?: string[] }>;
  textures?: Record<string, string>;
  sounds?: Record<string, { file: string; volume?: number }>;
}

export const ASSETS_ROOT = '/assets/';
export async function fetchManifest(): Promise<Manifest | null> {
  try {
    const r = await fetch(ASSETS_ROOT + 'manifest.json');
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

const ROOT = ASSETS_ROOT;
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

async function loadUnit(scene: Scene, spec: { file: string; anims: Partial<Record<AnimKey, AnimRef>> }, libs: Map<string, AssetContainer>) {
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
    const F = ANIM_FRAMES[key] ?? 16, list: Mesh[] = [];
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
        norm = [UNIT_HEIGHT / ((b.maximum.y - b.minimum.y) || 1), (b.minimum.x + b.maximum.x) / 2, b.minimum.y, (b.minimum.z + b.maximum.z) / 2];
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

export async function loadAssets(scene: Scene, man: Manifest, make: (m: Mesh) => LayerLike, sizes: Record<string, { size: number }>, progress?: (text: string) => void): Promise<Assets> {
  const A: Assets = { units: {}, udur: {}, buildings: {}, staged: {}, textures: {}, layers: [] };
  const cache = new Map<string, LayerLike>(), libs = new Map<string, AssetContainer>();
  const staticLayer = async (file: string, footprint: number) => {
    const key = `${file}@${footprint}`;
    if (!cache.has(key)) {
      const m = await loadStatic(scene, file, footprint).catch((e) => { console.warn('Модель не загрузилась:', file, e); return null; });
      if (!m) return null;
      cache.set(key, make(m));
    }
    return cache.get(key)!;
  };
  const types = Object.entries(man.buildings ?? {}).filter(([t]) => sizes[t]);
  for (const [i, [type, spec]] of types.entries()) {
    progress?.(`Здания ${i + 1}/${types.length}`);
    const fp = sizes[type].size * 0.95;
    if (spec.ages?.length) { // по эпохам со стадиями стройки
      const out: LayerLike[][][] = [];
      for (const tier of spec.ages) {
        const vs: LayerLike[][] = [];
        for (const stages of tier) {
          const fit: Fit = { keepBase: true }, ls: (LayerLike | null)[] = new Array(stages.length).fill(null);
          for (let k = stages.length - 1; k >= 0; k--) { // готовое — первым: по нему масштаб для остальных стадий
            const m = await loadStatic(scene, stages[k], fp, fit).catch((e) => { console.warn('Модель не загрузилась:', stages[k], e); return null; });
            if (m) { const l = make(m); ls[k] = l; A.layers.push(l); }
          }
          const ok = ls.filter((l): l is LayerLike => !!l);
          if (ls[ls.length - 1] && ok.length) vs.push(ok);
        }
        if (vs.length) out.push(vs);
      }
      if (out.length) A.staged[type] = out;
    }
    if (spec.colors?.length && !A.staged[type]) { // по цветам игроков
      const ls: LayerLike[] = [];
      for (const f of spec.colors) { const l = await staticLayer(f, fp); if (l) ls.push(l); }
      if (ls.length) A.buildings[type] = ls;
    }
  }
  const units = Object.entries(man.units ?? {});
  for (const [i, [type, spec]] of units.entries()) {
    progress?.(`Юниты ${i + 1}/${units.length}`);
    const got = await loadUnit(scene, spec, libs).catch((e) => { console.warn('Юнит не загрузился:', type, e); return null; });
    if (!got) continue;
    A.udur[type] = got.durs;
    A.units[type] = {};
    for (const [k, list] of Object.entries(got.out)) {
      const ls = list!.map((m) => make(m));
      A.units[type][k as AnimKey] = ls;
      A.layers.push(...ls);
    }
  }
  A.layers.push(...new Set(cache.values()));
  for (const [k, p] of Object.entries(man.textures ?? {})) A.textures[k] = new Texture(ROOT + p, scene);
  for (const lib of libs.values()) lib.dispose();
  return A;
}
