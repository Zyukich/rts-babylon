// Модели на сцене: процедурные (запасные) по типам, служебные слои (выделение, полоски, флаги, эффекты) и природа.
import { MeshBuilder, Color3, type StandardMaterial } from '@babylonjs/core';
import { makeModels } from './models/procedural.ts';
import { makeNature, natureMaterial } from './models/nature.ts';
import type { Assets } from '../assets/loader.ts';
import type { Layer } from './layers.ts';
import type { GameContext } from '../context.ts';

export function useModels(ctx: GameContext) {
  const { scene, shadow } = ctx.stage, { layer, box } = ctx.gfx;
  const K = makeModels(scene);
  // тип → [основа, часть цвета игрока]
  const MODELS: Record<string, [Layer | null, Layer | null]> = {};
  for (const [type, [b, t]] of Object.entries(K.things)) MODELS[type] = [b ? layer(b, Color3.White()) : null, t ? layer(t, Color3.White(), true) : null];
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
    team: layer(MeshBuilder.CreateTorus('team', { diameter: 1, thickness: 0.11, tessellation: 20 }, scene), Color3.White(), true), // кольцо цвета игрока под настоящими моделями
    pole: layer(box('pole'), new Color3(0.36, 0.25, 0.15)),        // древко флага на здании
    banner: layer(box('banner'), Color3.White(), true),             // полотнище цвета игрока
  };
  (L.bld.mesh.material as StandardMaterial).alpha = 0;
  (L.border.mesh.material as StandardMaterial).alpha = 0.45; // границы — лёгкой линией
  (L.smoke.mesh.material as StandardMaterial).alpha = 0.35; // полупрозрачный дым
  L.bld.mesh.isPickable = true;
  L.bld.mesh.thinInstanceEnablePicking = true;
  for (const pair of Object.values(MODELS)) for (const l of pair) if (l) shadow.addShadowCaster(l.mesh);

  // Природа: стилизованные деревья, кусты и камни с градиентом в вершинах
  const NL: Record<string, Layer> = {};
  for (const [k, m] of Object.entries(makeNature(scene))) {
    NL[k] = layer(m, null);
    if (!['berry', 'soil', 'fern', 'pebbles', 'mushroom'].includes(k) && !k.startsWith('grass')) shadow.addShadowCaster(m);
  }

  /** Природа из файлов (assets/models/nature) вместо процедурной — ключ в ключ */
  const SMALL = new Set(['berry', 'soil', 'fern', 'pebbles', 'mushroom', 'wheat']); // мелочь — без теней
  function useNature(A: Assets | null) {
    for (const [k, { mesh, wind }] of Object.entries(A?.nature ?? {})) {
      NL[k]?.mesh.dispose(false, true);
      mesh.material = natureMaterial(scene, 'n_' + k, wind, k.endsWith('L') || k.startsWith('oak') ? 0.5 : 0);
      NL[k] = layer(mesh, null);
      if (!SMALL.has(k)) shadow.addShadowCaster(mesh);
    }
  }

  /** Процедурная модель: основа + часть в цвете игрока (sy — сплющить по высоте) */
  function addModel(type: string, x: number, y: number, z: number, yaw: number, s: number, col: number[], sy = 1, noTeam = false) {
    const [b, t] = MODELS[type] ?? [null, null];
    b?.add(x, y, z, s, s * sy, s, undefined, yaw);
    if (!noTeam) t?.add(x, y, z, s, s * sy, s, col, yaw);
  }
  return { MODELS, L, NL, addModel, useNature };
}
