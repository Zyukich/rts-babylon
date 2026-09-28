// Миникарта: рельеф и ресурсы в пикселях (с учётом тумана), поверх — юниты и здания цветом владельца и рамка камеры.
import { BUILDINGS, TILE } from '../../data/index.ts';
import type { World } from '../../core/world.ts';
import type { Fog } from './fog.ts';

const TERR = [[100, 150, 75], [50, 100, 190], [115, 108, 100], [140, 155, 85]];
const RESC = [[0, 0, 0], [200, 50, 110], [30, 95, 35], [190, 190, 190], [140, 75, 60], [235, 200, 60]];

export function createMinimap(w: World, fog: Fog) {
  const buf = document.createElement('canvas'); // рельеф 1 пиксель = 1 клетка, потом растягивается
  buf.width = w.W; buf.height = w.H;
  const img = new ImageData(w.W, w.H);

  function draw(cv: HTMLCanvasElement, cam: { x: number; z: number; r: number }, colors: string[]) {
    const d = img.data;
    for (let i = 0; i < w.W * w.H; i++) {
      const x = i % w.W, y = (i / w.W) | 0, o = (x + (w.H - 1 - y) * w.W) * 4;
      const c = w.resType[i] ? RESC[w.resType[i]] : TERR[w.terrain[i]], k = fog.vis[i] ? 1 : fog.seen[i] ? 0.55 : 0;
      d[o] = c[0] * k; d[o + 1] = c[1] * k; d[o + 2] = c[2] * k; d[o + 3] = 255;
    }
    buf.getContext('2d')!.putImageData(img, 0, 0);
    const ctx = cv.getContext('2d')!, k = cv.width / w.W;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, cv.width, cv.height);
    for (const e of w.ents.values()) {
      if (!fog.visible(e)) continue;
      ctx.fillStyle = colors[e.owner];
      if (e.kind === 'u') ctx.fillRect((e.x / TILE) * k - 1.5, (w.H - e.y / TILE) * k - 1.5, 3, 3);
      else { const s = BUILDINGS[e.type].size; ctx.fillRect(e.tx * k, (w.H - e.ty - s) * k, s * k, s * k); }
    }
    const v = cam.r * 0.7; // примерная рамка обзора камеры
    ctx.strokeStyle = '#fff';
    ctx.strokeRect((cam.x - v) * k, (w.H - cam.z - v * 0.6) * k, 2 * v * k, 1.2 * v * k);
  }
  return { draw };
}
