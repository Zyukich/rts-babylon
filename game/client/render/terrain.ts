// Рельеф: высоты в узлах сетки (среднее соседних клеток), меш земли, запасная раскраска вершин.
import { MeshBuilder, VertexBuffer, VertexData, Color3, type Mesh } from '@babylonjs/core';
import { PAL } from '../config/visual.ts';
import type { GameContext } from '../context.ts';

export function useTerrain(ctx: GameContext) {
  const { w } = ctx.session, { scene } = ctx.stage;
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
  /** Высота земли в точке (билинейная интерполяция) */
  function heightAt(x: number, z: number) {
    x = Math.min(w.W - 0.001, Math.max(0, x)); z = Math.min(w.H - 0.001, Math.max(0, z));
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0, h = (a: number, b: number) => vh[a + b * W1];
    return h(x0, z0) * (1 - fx) * (1 - fz) + h(x0 + 1, z0) * fx * (1 - fz) + h(x0, z0 + 1) * (1 - fx) * fz + h(x0 + 1, z0 + 1) * fx * fz;
  }
  /** Высота по центру клетки */
  const hy = (x: number, z: number) => heightAt(Math.floor(x) + 0.5, Math.floor(z) + 0.5);
  function groundColor(x: number, z: number, y: number) {
    const tx = Math.min(w.W - 1, Math.max(0, Math.floor(x))), tz = Math.min(w.H - 1, Math.max(0, Math.floor(z)));
    const t = w.terrain[tx + tz * w.W], n = (Math.imul(tx * 7349 + tz * 3931, 2654435761) >>> 26) / 900; // лёгкий шум
    const c = y < -0.1 ? PAL.sand : y > 1.95 ? PAL.snow : t === 2 || y > 0.9 ? PAL.rock : t === 3 || y > 0.25 ? PAL.grassLight : PAL.grass;
    return c.map((v) => v + n);
  }
  /** Положить вершины меша на рельеф (off — подъём над землёй), по желанию — раскрасить */
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
  const ground = MeshBuilder.CreateGround('g', { width: w.W, height: w.H, subdivisionsX: w.W, subdivisionsY: w.H, updatable: true }, scene);
  ground.position.set(w.W / 2, 0, w.H / 2);
  ground.material = ctx.gfx.mat(Color3.White()); // цвета — в вершинах, пока нет материала с текстурами
  applyHeights(ground, 0, true);
  ground.convertToFlatShadedMesh();
  ground.receiveShadows = true;
  return { ground, heightAt, hy, applyHeights };
}
