// Туман войны — светлая облачная дымка (как в Cossacks / War Selection), а не чернота.
// Неразведанное — плотные облака, разведанное вне обзора — лёгкая серая вуаль. За краем карты дымка плавно густеет.
// Пока считается на клиенте: защиту от maphack даст сервер, когда перестанет слать невидимое.
import { DynamicTexture, MeshBuilder, StandardMaterial, Color3, Texture, type Scene, type Mesh } from '@babylonjs/core';
import type { World, Entity } from './world.ts';
import { computeVision, canSee } from './vision.ts';

const S = 4; // пикселей текстуры на клетку — мягкие края

export class Fog {
  w: World; me: number; vis: Uint8Array; seen: Uint8Array; changed = true; mesh: Mesh; M: number;
  tex: DynamicTexture; small: HTMLCanvasElement; img: ImageData; noise: HTMLCanvasElement;

  mode: string;
  constructor(w: World, me: number, scene: Scene, margin = 0, mode = 'normal') {
    this.w = w; this.me = me; this.M = margin; this.mode = mode;
    this.vis = new Uint8Array(w.W * w.H);
    this.seen = new Uint8Array(w.W * w.H);
    if (mode !== 'normal') this.seen.fill(1); // карта разведана / тумана нет
    const FW = w.W + 2 * margin, FH = w.H + 2 * margin;
    const plane = MeshBuilder.CreateGround('fog', { width: FW, height: FH, subdivisionsX: FW, subdivisionsY: FH, updatable: true }, scene);
    this.mesh = plane; // высоты повторяют рельеф (и горы за краем) — задаются снаружи
    plane.position.set(w.W / 2, 0.06, w.H / 2);
    plane.isPickable = false;
    this.tex = new DynamicTexture('fogT', { width: FW * S, height: FH * S }, scene, false, Texture.BILINEAR_SAMPLINGMODE);
    this.tex.hasAlpha = true;
    const m = new StandardMaterial('fogM', scene);
    m.diffuseTexture = this.tex; m.useAlphaFromDiffuseTexture = true;
    m.disableLighting = true; m.diffuseColor = Color3.White(); m.emissiveColor = Color3.Black(); m.specularColor = Color3.Black();
    plane.material = m;
    this.small = document.createElement('canvas'); this.small.width = FW; this.small.height = FH;
    this.img = new ImageData(FW, FH);
    // Облака: светлый серо-бежевый с мягкими пятнами (считается один раз)
    this.noise = document.createElement('canvas'); this.noise.width = FW * S; this.noise.height = FH * S;
    const nc = this.noise.getContext('2d')!, ni = nc.createImageData(FW * S, FH * S);
    for (let y = 0; y < FH * S; y++) for (let x = 0; x < FW * S; x++) {
      const n = Math.sin(x * 0.045) * Math.cos(y * 0.05) + Math.sin(x * 0.013 + y * 0.017) * 1.4 + Math.sin(x * 0.11 - y * 0.09) * 0.35;
      const v = 212 + n * 9, o = (x + y * FW * S) * 4;
      ni.data[o] = v + 6; ni.data[o + 1] = v + 3; ni.data[o + 2] = v - 6; ni.data[o + 3] = 255;
    }
    nc.putImageData(ni, 0, 0);
  }

  update() {
    if (computeVision(this.w, this.me, this.vis, this.seen)) this.changed = true;
    if (this.mode === 'none') this.vis.fill(1);
  }

  draw() {
    const { w, vis, seen, M } = this, FW = w.W + 2 * M, FH = w.H + 2 * M, d = this.img.data;
    for (let fy = 0; fy < FH; fy++) for (let fx = 0; fx < FW; fx++) {
      const x = fx - M, y = fy - M, o = (fx + (FH - 1 - fy) * FW) * 4; // строка 0 — дальний край
      let a: number;
      if (x >= 0 && y >= 0 && x < w.W && y < w.H) { const i = x + y * w.W; a = vis[i] ? 0 : seen[i] ? 70 : 228; }
      else a = Math.min(245, 70 + Math.hypot(Math.max(-x - 1, x - w.W, 0), Math.max(-y - 1, y - w.H, 0)) * 22); // за краем — плавно гуще
      d[o + 3] = a;
    }
    this.small.getContext('2d')!.putImageData(this.img, 0, 0);
    const c = this.tex.getContext() as unknown as CanvasRenderingContext2D;
    c.clearRect(0, 0, FW * S, FH * S);
    c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = true;
    c.filter = `blur(${S * 0.9}px)`; // размытые, «облачные» границы
    c.drawImage(this.small, 0, 0, FW * S, FH * S);
    c.filter = 'none';
    c.globalCompositeOperation = 'source-in'; // окрашиваем маску в облака
    c.drawImage(this.noise, 0, 0);
    c.globalCompositeOperation = 'source-over';
    this.tex.update();
  }

  visible(e: Entity) { return canSee(this.w, this.me, this.vis, this.seen, e); }
}
