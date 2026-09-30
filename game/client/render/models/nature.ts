// Природа в стиле моделей KayKit: low-poly формы, цвет в вершинах (градиент снизу вверх), без фототекстур.
// Листва травы, папоротника и пшеницы — «карточки» с нарисованной в канвасе текстурой.
import { Mesh, MeshBuilder, VertexData, StandardMaterial, Color3, DynamicTexture, FresnelParameters, type Scene } from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials';

let windT = 0;
export const setWind = (t: number) => { windT = t; }; // время для покачивания листвы и травы

let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Текстуры листвы рисуем сами: хвоя (лучи от центра), листья (эллипсы), с прозрачным фоном
function foliage(scene: Scene, kind: 'needle' | 'leaf' | 'bush' | 'grass' | 'dry' | 'flowers' | 'wheat' | 'blades' | 'bladesY' | 'bladesDry' | 'bladesFl') {
  const S = 256, t = new DynamicTexture('fol_' + kind, { width: S, height: S }, scene, true);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  c.clearRect(0, 0, S, S);
  if (kind.startsWith('blades')) { // короткая густая трава: много тонких прямых травинок
    const pal = kind === 'bladesY' ? [[95, 140], [135, 185], [35, 55]] : kind === 'bladesDry' ? [[150, 195], [135, 170], [60, 90]] : [[50, 95], [115, 175], [25, 50]];
    for (let k = 0; k < 260; k++) {
      const x = S * (0.03 + rnd() * 0.94), len = S * (0.45 + rnd() * 0.55), lean = (rnd() - 0.5) * S * 0.12;
      c.strokeStyle = `rgb(${(pal[0][0] + rnd() * (pal[0][1] - pal[0][0])) | 0},${(pal[1][0] + rnd() * (pal[1][1] - pal[1][0])) | 0},${(pal[2][0] + rnd() * (pal[2][1] - pal[2][0])) | 0})`;
      c.lineWidth = 1.5 + rnd();
      c.beginPath(); c.moveTo(x, S); c.lineTo(x + lean, S - len); c.stroke();
    }
    if (kind === 'bladesFl') for (let k = 0; k < 10; k++) {
      c.fillStyle = ['#f4f1e6', '#f5d33b', '#b58ae8'][(rnd() * 3) | 0];
      c.beginPath(); c.arc(S * (0.1 + rnd() * 0.8), S * (0.05 + rnd() * 0.3), 4 + rnd() * 3, 0, Math.PI * 2); c.fill();
    }
  } else if (kind === 'wheat') { // стебли с колосьями
    for (let k = 0; k < 90; k++) {
      const x = S * (0.08 + rnd() * 0.84), len = S * (0.6 + rnd() * 0.35), lean = (rnd() - 0.5) * S * 0.12, tx = x + lean, ty = S - len;
      c.strokeStyle = `rgb(${(190 + rnd() * 40) | 0},${(160 + rnd() * 40) | 0},${(70 + rnd() * 30) | 0})`; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, S); c.lineTo(tx, ty); c.stroke();
      c.fillStyle = `rgb(${(215 + rnd() * 35) | 0},${(175 + rnd() * 35) | 0},${(80 + rnd() * 30) | 0})`;
      c.beginPath(); c.ellipse(tx, ty + 8, 3.5, 11, lean * 0.01, 0, Math.PI * 2); c.fill();
    }
  } else if (kind === 'grass' || kind === 'dry' || kind === 'flowers') { // пучок травинок снизу вверх
    const dry = kind === 'dry';
    for (let k = 0; k < 150; k++) {
      const x = S * (0.12 + rnd() * 0.76), len = S * (0.35 + rnd() * 0.6), lean = (rnd() - 0.5) * S * 0.35;
      c.strokeStyle = dry ? `rgb(${(150 + rnd() * 60) | 0},${(125 + rnd() * 50) | 0},${(45 + rnd() * 30) | 0})` : `rgb(${(55 + rnd() * 60) | 0},${(105 + rnd() * 75) | 0},${(25 + rnd() * 25) | 0})`;
      c.lineWidth = 2 + rnd() * 2;
      c.beginPath(); c.moveTo(x, S); c.quadraticCurveTo(x + lean * 0.3, S - len * 0.6, x + lean, S - len); c.stroke();
    }
    if (kind === 'flowers') for (let k = 0; k < 14; k++) { // цветочки
      c.fillStyle = ['#f4f1e6', '#f5d33b', '#b58ae8', '#e8506a'][(rnd() * 4) | 0];
      c.beginPath(); c.arc(S * (0.15 + rnd() * 0.7), S * (0.1 + rnd() * 0.45), 5 + rnd() * 4, 0, Math.PI * 2); c.fill();
    }
  } else if (kind === 'needle') {
    for (let b = 0; b < 9; b++) {
      const a0 = (b / 9) * Math.PI * 2 + rnd() * 0.4, len = S * (0.3 + rnd() * 0.17), x1 = S / 2 + Math.cos(a0) * len, y1 = S / 2 + Math.sin(a0) * len;
      c.strokeStyle = '#3b2a1a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(S / 2, S / 2); c.lineTo(x1, y1); c.stroke();
      for (let k = 0; k < 70; k++) {
        const f = 0.1 + rnd() * 0.9, px = S / 2 + (x1 - S / 2) * f, py = S / 2 + (y1 - S / 2) * f, a = a0 + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.7), l = 6 + rnd() * 12 * (1.1 - f);
        c.strokeStyle = `rgb(${(18 + rnd() * 22) | 0},${(60 + rnd() * 55) | 0},${(28 + rnd() * 22) | 0})`; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); c.stroke();
      }
    }
  } else {
    const n = kind === 'leaf' ? 260 : 200;
    for (let k = 0; k < n; k++) {
      const r = Math.sqrt(rnd()) * S * 0.44, a = rnd() * Math.PI * 2, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
      const light = 1 - r / (S * 0.5) * 0.4; // к краю темнее — объём
      c.fillStyle = `rgb(${((35 + rnd() * 40) * light) | 0},${((85 + rnd() * 70) * light) | 0},${((22 + rnd() * 25) * light) | 0})`;
      c.beginPath(); c.ellipse(x, y, 5 + rnd() * 6, 2.5 + rnd() * 3, rnd() * Math.PI, 0, Math.PI * 2); c.fill();
    }
  }
  t.update();
  t.hasAlpha = true;
  return t;
}

// Набор плоских «карточек»: центр, размер, поворот вокруг вертикали и наклон
function cards(scene: Scene, name: string, qs: { x: number; y: number; z: number; w: number; h: number; yaw: number; tilt: number }[]) {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const q of qs) {
    const rx = Math.cos(q.yaw), rz = -Math.sin(q.yaw);                        // «вправо» по карточке
    const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw);                          // нормаль вертикальной карточки
    const ux = fx * Math.sin(q.tilt), uy = Math.cos(q.tilt), uz = fz * Math.sin(q.tilt); // «вверх» с наклоном
    const nx = -fx * Math.cos(q.tilt), ny = Math.sin(q.tilt), nz = -fz * Math.cos(q.tilt);
    const b = pos.length / 3;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(q.x + (rx * sx * q.w) / 2 + (ux * sy * q.h) / 2, q.y + (uy * sy * q.h) / 2, q.z + (rz * sx * q.w) / 2 + (uz * sy * q.h) / 2);
      nrm.push(nx, ny, nz);
      uv.push((sx + 1) / 2, (sy + 1) / 2);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const m = new Mesh(name, scene), vd = new VertexData();
  vd.positions = pos; vd.normals = nrm; vd.uvs = uv; vd.indices = idx;
  vd.applyToMesh(m);
  return m;
}

function rock(scene: Scene, name: string, variant: number) {
  const m = MeshBuilder.CreateIcoSphere(name, { radius: 0.36, subdivisions: 2, flat: false, updatable: true }, scene);
  const p = m.getVerticesData('position')!;
  for (let i = 0; i < p.length; i += 3) { // неровность от «шума» по координатам
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const n = 1 + 0.22 * Math.sin(x * 9 + variant * 2) * Math.cos(z * 7 - variant) + 0.12 * Math.sin(y * 13 + variant * 5);
    p[i] = x * n * (1 + variant * 0.12); p[i + 1] = Math.max(-0.05, y * n * 0.7) + 0.05; p[i + 2] = z * n;
  }
  m.updateVerticesData('position', p);
  const nr: number[] = [];
  VertexData.ComputeNormals(p, m.getIndices()!, nr);
  m.updateVerticesData('normal', nr);
  return m;
}

/** Материал природы: цвет из вершин, светлый ободок силуэта; wind > 0 — колышется от ветра (сильнее к верху, выше from) */
export function natureMaterial(scene: Scene, name: string, wind = 0, from = 0) {
  const m = wind > 0 ? new CustomMaterial(name, scene) : new StandardMaterial(name, scene); // CustomMaterial без вставок рисовал чёрным
  if (m instanceof CustomMaterial) {
    m.AddUniform('uWind', 'float', 0);
    m.Vertex_After_WorldPosComputed(`
      float wph = worldPos.x * 0.35 + worldPos.z * 0.27;
      float sway = (sin(uWind * 1.6 + wph) * 0.65 + sin(uWind * 3.3 + wph * 2.1) * 0.35) * ${wind.toFixed(3)} * max(position.y - ${from.toFixed(2)}, 0.0);
      worldPos.x += sway; worldPos.z += sway * 0.6;`);
    m.onBindObservable.add(() => m.getEffect()?.setFloat('uWind', windT));
  }
  m.diffuseColor = Color3.White();
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  const fp = new FresnelParameters();
  fp.leftColor = new Color3(0.3, 0.27, 0.2); fp.rightColor = Color3.Black(); fp.bias = 0.15; fp.power = 2.2;
  m.emissiveFresnelParameters = fp;
  return m;
}

export function makeNature(scene: Scene) {
  seed = 12345;
  const leafMat = (name: string, t: DynamicTexture, tintc: Color3, amp = 0.04) => {
    const m = new CustomMaterial(name, scene);
    // Ветер: смещаем вершины в шейдере — чем выше над землёй, тем сильнее; порывы разные в разных местах карты
    m.AddUniform('uWind', 'float', 0);
    m.AddUniform('uAmp', 'float', amp);
    m.Vertex_After_WorldPosComputed(`
      float wph = worldPos.x * 0.35 + worldPos.z * 0.27;
      float sway = (sin(uWind * 1.6 + wph) * 0.65 + sin(uWind * 3.3 + wph * 2.1) * 0.35) * uAmp * max(position.y, 0.0);
      worldPos.x += sway; worldPos.z += sway * 0.6;`);
    m.onBindObservable.add(() => { const e = m.getEffect(); e?.setFloat('uWind', windT); e?.setFloat('uAmp', amp); });
    m.diffuseTexture = t;              // hasAlpha → отсечение по альфе
    m.diffuseColor = tintc;
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    return m;
  };
  // ---------- Стилизация «как в Overwatch»: мягкие округлые формы, градиент цвета снизу вверх, светлый ободок ----------
  const rim = (m: StandardMaterial, c = new Color3(0.32, 0.28, 0.2)) => { // светлый край силуэта
    const fp = new FresnelParameters();
    fp.leftColor = c; fp.rightColor = Color3.Black(); fp.bias = 0.15; fp.power = 2.2;
    m.emissiveFresnelParameters = fp;
  };
  const styl = (name: string, amp = 0) => { // цвет из вершин; amp > 0 — колышется от ветра
    const m = new CustomMaterial(name, scene);
    if (amp > 0) {
      m.AddUniform('uWind', 'float', 0);
      m.Vertex_After_WorldPosComputed(`
        float wph = worldPos.x * 0.35 + worldPos.z * 0.27;
        float sway = (sin(uWind * 1.6 + wph) * 0.65 + sin(uWind * 3.3 + wph * 2.1) * 0.35) * ${amp.toFixed(3)} * max(position.y - 0.5, 0.0);
        worldPos.x += sway; worldPos.z += sway * 0.6;`);
      m.onBindObservable.add(() => m.getEffect()?.setFloat('uWind', windT));
    }
    m.diffuseColor = Color3.White();
    m.specularColor = new Color3(0.05, 0.05, 0.05);
    rim(m);
    return m;
  };
  // Градиент по высоте (темнее снизу, светлее сверху) + лёгкий разброс — «рисованный» объём
  const paint = (m: Mesh, lo: Color3, hi: Color3, y0: number, y1: number, j = 0.05) => {
    const p = m.getVerticesData('position')!, c: number[] = [];
    for (let i = 0; i < p.length; i += 3) {
      const t = Math.min(1, Math.max(0, (p[i + 1] - y0) / (y1 - y0))), n = (rnd() - 0.5) * j;
      c.push(lo.r + (hi.r - lo.r) * t + n, lo.g + (hi.g - lo.g) * t + n, lo.b + (hi.b - lo.b) * t + n * 0.5, 1);
    }
    m.setVerticesData('color', c);
    return m;
  };
  const blob = (r: number, x: number, y: number, z: number, sq = 0.85, noise = 0.16) => { // мягкий «пузырь» листвы
    const m = MeshBuilder.CreateIcoSphere('b', { radius: r, subdivisions: 2, updatable: true }, scene), p = m.getVerticesData('position')!, ph = rnd() * 10;
    for (let i = 0; i < p.length; i += 3) {
      const k = 1 + noise * Math.sin(p[i] * 9 + ph) * Math.cos(p[i + 2] * 8 - ph) + noise * 0.5 * Math.sin(p[i + 1] * 11 + ph);
      p[i] = p[i] * k + x; p[i + 1] = p[i + 1] * k * sq + y; p[i + 2] = p[i + 2] * k + z;
    }
    m.updateVerticesData('position', p);
    return m;
  };
  const merge = (parts: Mesh[], name: string) => {
    const m = Mesh.MergeMeshes(parts, true, true)!;
    m.name = name;
    const p = m.getVerticesData('position')!, nr: number[] = [];
    VertexData.ComputeNormals(p, m.getIndices()!, nr);
    m.updateVerticesData('normal', nr);
    return m;
  };
  const C = (r: number, g: number, b: number) => new Color3(r, g, b);
  const trunk = (name: string, h: number, d0: number, d1: number) => {
    const m = MeshBuilder.CreateCylinder(name, { height: h, diameterTop: d1, diameterBottom: d0, tessellation: 7 }, scene);
    m.position.y = h / 2; m.bakeCurrentTransformIntoVertices();
    paint(m, C(0.24, 0.15, 0.09), C(0.46, 0.31, 0.19), 0, h);
    m.material = styl(name);
    return m;
  };

  // Ель: ствол + три мягких конуса ярусами, от тёмно-изумрудного к светлому
  const pineT = trunk('pineT', 1.0, 0.16, 0.07);
  const cone = (r: number, h: number, y: number) => {
    const m = MeshBuilder.CreateCylinder('c', { height: h, diameterTop: 0.02, diameterBottom: r * 2, tessellation: 9, updatable: true }, scene), p = m.getVerticesData('position')!;
    for (let i = 0; i < p.length; i += 3) { const k = 1 + 0.12 * Math.sin(Math.atan2(p[i + 2], p[i]) * 5); p[i] *= k; p[i + 2] *= k; p[i + 1] += y + h / 2; }
    m.updateVerticesData('position', p);
    return m;
  };
  const pineL = paint(merge([cone(0.62, 0.8, 0.45), cone(0.48, 0.7, 0.9), cone(0.32, 0.6, 1.3)], 'pineL'), C(0.05, 0.2, 0.12), C(0.3, 0.56, 0.27), 0.45, 1.9, 0.06);
  pineL.material = styl('pineL', 0.02);

  // Лиственное: ствол + крона из нескольких «пузырей»
  const oakT = trunk('oakT', 0.9, 0.17, 0.1);
  const crown = (name: string, lo: Color3, hi: Color3, k = 1) => {
    const m = paint(merge([blob(0.5 * k, 0, 1.15, 0), blob(0.36 * k, 0.3 * k, 1.0, 0.12 * k), blob(0.38 * k, -0.28 * k, 1.05, -0.12 * k), blob(0.32 * k, 0.05, 1.15 + 0.35 * k, 0.05), blob(0.3 * k, 0.1 * k, 1.1, -0.35 * k)], name), lo, hi, 0.65, 1.8, 0.07);
    m.material = styl(name, 0.03);
    return m;
  };
  const oakL = crown('oakL', C(0.12, 0.3, 0.09), C(0.5, 0.72, 0.24));
  // Осенние кроны и берёза — пёстрый лес, как в War Selection / AoE III
  const oakY = crown('oakY', C(0.38, 0.3, 0.06), C(0.93, 0.76, 0.22));
  const oakO = crown('oakO', C(0.4, 0.14, 0.05), C(0.92, 0.48, 0.16));
  const birchT = trunk('birchT', 1.1, 0.11, 0.06);
  paint(birchT, C(0.55, 0.53, 0.48), C(0.93, 0.92, 0.88), 0, 1.1, 0.12);
  const birchL = crown('birchL', C(0.25, 0.42, 0.12), C(0.66, 0.82, 0.32), 0.8);

  // Ягодный куст: пухлые шарики листвы + ягоды
  const bush = paint(merge([blob(0.22, 0, 0.2, 0), blob(0.17, 0.16, 0.16, 0.06), blob(0.16, -0.14, 0.17, -0.07), blob(0.15, 0.02, 0.33, 0.02)], 'bush'), C(0.1, 0.3, 0.1), C(0.42, 0.68, 0.22), 0, 0.45, 0.06);
  bush.material = styl('bush', 0.05);
  const berryParts = [];
  for (let i = 0; i < 11; i++) {
    const b = MeshBuilder.CreateSphere('b', { diameter: 0.06, segments: 5 }, scene), a = rnd() * Math.PI * 2, r = 0.14 + rnd() * 0.1;
    b.position.set(Math.cos(a) * r, 0.18 + rnd() * 0.2, Math.sin(a) * r);
    berryParts.push(b);
  }
  const berry = Mesh.MergeMeshes(berryParts, true)!;
  const bm = new StandardMaterial('berry', scene);
  bm.diffuseColor = new Color3(0.85, 0.12, 0.2); bm.specularColor = new Color3(0.6, 0.5, 0.5); bm.specularPower = 24;
  rim(bm, C(0.4, 0.15, 0.15));
  berry.material = bm;

  // Трава: пучки из трёх скрещённых карточек — оживляют землю
  // Трава: «коврик» на клетку — 8 кустиков из тонких коротких травинок; земля между ними видна, ноги юнитов чуть утопают
  const patch = (name: string, kind: 'blades' | 'bladesY' | 'bladesDry' | 'bladesFl') => {
    const q = [];
    for (let i = 0; i < 8; i++) {
      const x = (rnd() - 0.5) * 0.85, z = (rnd() - 0.5) * 0.85, h = 0.07 + rnd() * 0.05, a = rnd() * Math.PI;
      q.push({ x, y: h / 2, z, w: 0.34, h, yaw: a, tilt: 0 }, { x, y: h / 2, z, w: 0.34, h, yaw: a + Math.PI / 2, tilt: 0 });
    }
    const m = cards(scene, name, q);
    m.material = leafMat(name, foliage(scene, kind), Color3.White(), 0.6);
    return m;
  };
  // Участок пшеницы: 3×3 кустика из скрещённых карточек + тёмная пашня под ними
  const wq = [];
  for (const ox of [-0.3, 0, 0.3]) for (const oz of [-0.3, 0, 0.3]) for (let i = 0; i < 3; i++) wq.push({ x: ox + (rnd() - 0.5) * 0.08, y: 0.2, z: oz + (rnd() - 0.5) * 0.08, w: 0.34, h: 0.4, yaw: (i * Math.PI) / 3 + rnd(), tilt: 0 });
  const wheat = cards(scene, 'wheat', wq);
  wheat.material = leafMat('wheat', foliage(scene, 'wheat'), Color3.White(), 0.18);
  const soil = MeshBuilder.CreateGround('soil', { width: 0.96, height: 0.96 }, scene);
  soil.position.y = 0.02; soil.bakeCurrentTransformIntoVertices();
  const sm = new StandardMaterial('soil', scene);
  sm.diffuseColor = new Color3(0.36, 0.26, 0.16); sm.specularColor = Color3.Black();
  soil.material = sm;
  // ---------- Декор и быт: пни, брёвна, камешки, грибы, папоротник; ящики, бочки, стога, мешки, заборы, телеги, поленницы ----------
  const vc = (m: Mesh, c: Color3) => { const n = m.getTotalVertices(), a: number[] = []; for (let i = 0; i < n; i++) { const j = (rnd() - 0.5) * 0.05; a.push(c.r + j, c.g + j, c.b + j, 1); } m.setVerticesData('color', a); return m; };
  const at = (m: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.bakeCurrentTransformIntoVertices(); return m; };
  const prop = (name: string, parts: Mesh[]) => { const m = Mesh.MergeMeshes(parts, true, true)!; m.name = name; m.material = styl(name); return m; };
  const bx = (w: number, h: number, d: number) => MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, scene);
  const cy = (dt: number, db: number, h: number, t = 10) => MeshBuilder.CreateCylinder('p', { diameterTop: dt, diameterBottom: db, height: h, tessellation: t }, scene);
  const WOOD = C(0.55, 0.38, 0.22), DARK = C(0.3, 0.2, 0.12), STRAW = C(0.86, 0.72, 0.38), CLOTH = C(0.8, 0.72, 0.56), IRON = C(0.36, 0.36, 0.38), H = Math.PI / 2;
  const props: Record<string, Mesh> = {
    crate: prop('crate', [vc(at(bx(0.26, 0.26, 0.26), 0, 0.13, 0), WOOD), vc(at(bx(0.27, 0.04, 0.27), 0, 0.21, 0), DARK), vc(at(bx(0.27, 0.04, 0.27), 0, 0.05, 0), DARK)]),
    barrel: prop('barrel', [vc(at(cy(0.2, 0.18, 0.3), 0, 0.15, 0), WOOD), vc(at(cy(0.215, 0.215, 0.03), 0, 0.07, 0), IRON), vc(at(cy(0.215, 0.215, 0.03), 0, 0.23, 0), IRON)]),
    hay: prop('hay', [vc(at(cy(0.34, 0.34, 0.42, 12), 0, 0.17, 0, 0, 0, H), STRAW)]),
    sack: prop('sack', [vc(at(MeshBuilder.CreateSphere('p', { diameter: 0.24, segments: 6 }, scene), 0, 0.1, 0), CLOTH), vc(at(cy(0.05, 0.08, 0.08, 6), 0, 0.22, 0), CLOTH)]),
    fence: prop('fence', [...[-0.45, 0, 0.45].map((x) => vc(at(bx(0.05, 0.32, 0.05), x, 0.16, 0), WOOD)), vc(at(bx(0.95, 0.04, 0.03), 0, 0.23, 0), WOOD), vc(at(bx(0.95, 0.04, 0.03), 0, 0.12, 0), WOOD)]),
    cart: prop('cart', [vc(at(bx(0.5, 0.1, 0.3), 0, 0.22, 0), WOOD), vc(at(bx(0.5, 0.12, 0.02), 0, 0.32, 0.15), WOOD), vc(at(bx(0.5, 0.12, 0.02), 0, 0.32, -0.15), WOOD),
      vc(at(cy(0.22, 0.22, 0.04, 12), -0.08, 0.11, 0.18, H), DARK), vc(at(cy(0.22, 0.22, 0.04, 12), -0.08, 0.11, -0.18, H), DARK), vc(at(bx(0.45, 0.03, 0.03), 0.45, 0.2, 0.08), WOOD), vc(at(bx(0.45, 0.03, 0.03), 0.45, 0.2, -0.08), WOOD)]),
    woodpile: prop('woodpile', [0, 1, 2, 3, 4].map((k) => vc(at(cy(0.09, 0.09, 0.5, 7), 0, 0.05 + (k > 2 ? 0.08 : 0), ((k % 3) - 1) * 0.09 + (k > 2 ? 0.045 : 0), 0, 0, H), k % 2 ? WOOD : C(0.5, 0.35, 0.2)))),
    stump: prop('stump', [vc(at(cy(0.18, 0.24, 0.14, 8), 0, 0.07, 0), C(0.42, 0.3, 0.18)), vc(at(cy(0.17, 0.17, 0.01, 8), 0, 0.145, 0), C(0.78, 0.62, 0.42))]),
    log: prop('log', [vc(at(cy(0.12, 0.12, 0.7, 8), 0, 0.06, 0, 0, 0, H), C(0.4, 0.28, 0.17))]),
    pebbles: prop('pebbles', [0, 1, 2].map(() => vc(at(MeshBuilder.CreateIcoSphere('p', { radius: 0.05 + rnd() * 0.04, subdivisions: 1 }, scene), (rnd() - 0.5) * 0.3, 0.025, (rnd() - 0.5) * 0.3), C(0.56, 0.55, 0.51)))),
    mushroom: prop('mushroom', [vc(at(cy(0.03, 0.035, 0.08, 6), 0, 0.04, 0), C(0.92, 0.9, 0.82)), vc(at(MeshBuilder.CreateSphere('p', { diameter: 0.1, segments: 6, slice: 0.5 }, scene), 0, 0.075, 0), C(0.78, 0.18, 0.12))]),
  };
  const fern = cards(scene, 'fern', [0, 1, 2, 3, 4, 5].map((i) => ({ x: 0, y: 0.1, z: 0, w: 0.4, h: 0.22, yaw: (i * Math.PI) / 3, tilt: 0.7 })));
  fern.material = leafMat('fern', foliage(scene, 'leaf'), new Color3(0.8, 1, 0.75), 0.25);
  props.fern = fern;
  const out: Record<string, Mesh> = {
    ...props,
    wheat, soil,
    pineT, pineL, oakT, oakL, oakY, oakO, birchT, birchL, bush, berry,
    grassA: patch('grassA', 'blades'), grassB: patch('grassB', 'bladesY'), grassC: patch('grassC', 'bladesDry'), grassD: patch('grassD', 'bladesFl'),
  };
  // Камни: гранёные глыбы с «рисованным» градиентом (светлый верх); руда — с ржаво-медным оттенком
  const stoneM = styl('stone'), oreM = styl('ore');
  oreM.specularColor = new Color3(0.3, 0.22, 0.15);
  for (let v = 0; v < 3; v++) {
    const r = rock(scene, 'rock' + v, v); r.convertToFlatShadedMesh(); paint(r, C(0.36, 0.35, 0.34), C(0.78, 0.76, 0.72), 0, 0.5, 0.08); r.material = stoneM; out['rock' + v] = r;
    const o = rock(scene, 'ore' + v, v + 3); o.convertToFlatShadedMesh(); paint(o, C(0.3, 0.19, 0.15), C(0.78, 0.5, 0.33), 0, 0.5, 0.1); o.material = oreM; out['ore' + v] = o;
    const g = rock(scene, 'gold' + v, v + 6); g.convertToFlatShadedMesh(); paint(g, C(0.45, 0.36, 0.12), C(0.98, 0.82, 0.3), 0, 0.5, 0.1); g.material = oreM; out['gold' + v] = g; // золотая жила
  }
  for (const m of Object.values(out)) m.isPickable = false;
  return out;
}
