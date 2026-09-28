// За краем карты: горы (как в Cossacks, AoE III/IV), а не пустота. У края — продолжение рельефа, дальше — хребет.
// Играть там нельзя. Туман войны тоже ложится на эти горы.
import { MeshBuilder, VertexBuffer, VertexData, DynamicTexture, Color3, type Texture } from '@babylonjs/core';
import { TerrainMaterial } from '@babylonjs/materials';
import { PAL } from '../config/visual.ts';
import type { GameContext } from '../context.ts';

export const SKIRT = 40; // ширина декоративной полосы за краем, клеток

export function useSkirt(ctx: GameContext) {
  const { w } = ctx.session, { scene } = ctx.stage, { heightAt } = ctx.terrain, A = ctx.assets, M = SKIRT;
  const SW = w.W + 2 * M, SH = w.H + 2 * M;
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
  const pos = skirt.getVerticesData(VertexBuffer.PositionKind)!, col: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] + w.W / 2, z = pos[i + 2] + w.H / 2, h = skirtH(x, z);
    pos[i + 1] = h;
    col.push(...(h > 4.8 ? PAL.snow : h > 2.4 ? PAL.rock : h > 1.1 ? PAL.grassLight : PAL.grass), 1); // трава → скалы → снег
  }
  skirt.updateVerticesData(VertexBuffer.PositionKind, pos);
  skirt.setVerticesData(VertexBuffer.ColorKind, col);
  const nrm: number[] = [];
  VertexData.ComputeNormals(pos, skirt.getIndices()!, nrm);
  skirt.updateVerticesData(VertexBuffer.NormalKind, nrm);
  skirt.material = ctx.gfx.mat(Color3.White());
  if (A?.textures.grass && A.textures.rock && A.textures.sand) { // те же фототекстуры, что и на поле: трава внизу, скала на склонах
    const mix = new DynamicTexture('skirtMix', { width: SW, height: SH }, scene, false);
    const c2d = mix.getContext() as unknown as CanvasRenderingContext2D, img = c2d.createImageData(SW, SH);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const g = Math.min(1, Math.max(0, (skirtH(x - M + 0.5, y - M + 0.5) - 1) / 1.8));
      img.data.set([255 * (1 - g), 255 * g, 0, 255], (x + (SH - 1 - y) * SW) * 4);
    }
    c2d.putImageData(img, 0, 0);
    mix.update();
    const tm = new TerrainMaterial('skirtT', scene), t = (x?: Texture) => { const c = x!.clone(); c.uScale = SW / 4; c.vScale = SH / 4; return c; };
    tm.mixTexture = mix;
    tm.diffuseTexture1 = t(A.textures.grass); tm.diffuseTexture2 = t(A.textures.rock); tm.diffuseTexture3 = t(A.textures.sand);
    tm.specularColor = Color3.Black();
    tm.diffuseColor = new Color3(0.78, 0.95, 0.62); // ближе к перекрашенной траве на поле — без горчицы
    skirt.material = tm;
    skirt.removeVerticesData(VertexBuffer.ColorKind);
  } else skirt.convertToFlatShadedMesh();

  // Туман ложится и на горы за краем: высоты плоскости тумана — по рельефу поля и по горам
  const fm = ctx.fog.mesh, fp = fm.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < fp.length; i += 3) {
    const x = fp[i] + w.W / 2, z = fp[i + 2] + w.H / 2, onMap = x >= 0 && z >= 0 && x <= w.W && z <= w.H;
    fp[i + 1] = (onMap ? heightAt(x, z) : skirtH(x, z)) + 0.3; // выше травы — дымка её накрывает
  }
  fm.updateVerticesData(VertexBuffer.PositionKind, fp);
  return { skirtH };
}
