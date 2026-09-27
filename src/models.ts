// Процедурные low-poly модели: собираем из примитивов, красим вершины, сливаем в один меш на тип.
// У каждого типа две части: base — натуральные цвета, team — белая, её окрашивает цвет игрока (цвет инстанса).
// Модель смотрит вдоль +z, стоит на y = 0.
import { MeshBuilder, Mesh, VertexBuffer, Color3, type Scene } from '@babylonjs/core';

const C = (h: string) => Color3.FromHexString(h);
const SKIN = C('#e0b48a'), WOOD = C('#8a5a33'), DARK = C('#4a3526'), METAL = C('#a7b0ba'), STONE = C('#a39d90'),
  PLASTER = C('#dccca5'), STRAW = C('#d8b85a'), LEAF = C('#2e6b33'), LEAF2 = C('#4a8a3a'), HORSE = C('#6b4a2e'),
  SOIL = C('#7a5a35'), CROP = C('#9bbf3a'), W = Color3.White();
const PI = Math.PI;
type V3 = [number, number, number];

class Kit {
  scene: Scene; parts: Mesh[] = [];
  constructor(scene: Scene) { this.scene = scene; }
  put(m: Mesh, c: Color3, x: number, y: number, z: number, r?: V3, s?: V3) {
    m.position.set(x, y, z);
    if (r) m.rotation.set(r[0], r[1], r[2]);
    if (s) m.scaling.set(s[0], s[1], s[2]);
    const n = m.getTotalVertices(), col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b, 1], i * 4);
    m.setVerticesData(VertexBuffer.ColorKind, col);
    if (!m.isVerticesDataPresent(VertexBuffer.UVKind)) m.setVerticesData(VertexBuffer.UVKind, new Float32Array(n * 2)); // для слияния нужен одинаковый набор атрибутов
    this.parts.push(m);
  }
  box(w: number, h: number, d: number, c: Color3, x: number, y: number, z: number, r?: V3) {
    this.put(MeshBuilder.CreateBox('', { width: w, height: h, depth: d }, this.scene), c, x, y, z, r);
  }
  cyl(dt: number, db: number, h: number, c: Color3, x: number, y: number, z: number, tess = 8, r?: V3) {
    this.put(MeshBuilder.CreateCylinder('', { diameterTop: dt, diameterBottom: db, height: h, tessellation: tess }, this.scene), c, x, y, z, r);
  }
  ball(d: number, c: Color3, x: number, y: number, z: number, sy = 1) {
    this.put(MeshBuilder.CreateSphere('', { diameter: d, segments: 3 }, this.scene), c, x, y, z, undefined, [1, sy, 1]);
  }
  rock(d: number, c: Color3, x: number, y: number, z: number) {
    this.put(MeshBuilder.CreatePolyhedron('', { type: 2, size: d / 2 }, this.scene), c, x, y, z, [0.4, x * 3, 0.2]);
  }
  pyr(wd: number, dp: number, h: number, c: Color3, x: number, y: number, z: number) { // четырёхскатная крыша, y — низ
    const m = MeshBuilder.CreateCylinder('', { diameterTop: 0, diameterBottom: Math.SQRT2, height: 1, tessellation: 4 }, this.scene);
    m.rotation.y = PI / 4;
    m.bakeCurrentTransformIntoVertices();
    this.put(m, c, x, y + h / 2, z, undefined, [wd, h, dp]);
  }
  done(name: string): Mesh | null {
    if (!this.parts.length) return null;
    const m = Mesh.MergeMeshes(this.parts, true, true)!;
    m.name = name;
    m.convertToFlatShadedMesh(); // гранёный low-poly вид
    m.isPickable = false;
    this.parts = [];
    return m;
  }
}

function human(b: Kit, t: Kit, y0 = 0, helmet = false) {
  b.box(0.2, 0.32, 0.13, DARK, 0, y0 + 0.16, 0);  // ноги
  t.cyl(0.22, 0.3, 0.34, W, 0, y0 + 0.49, 0, 6);   // туника — цвет игрока
  b.ball(0.18, SKIN, 0, y0 + 0.75, 0);             // голова
  if (helmet) b.ball(0.21, METAL, 0, y0 + 0.8, 0, 0.6);
}

const DEFS: Record<string, (b: Kit, t: Kit) => void> = {
  // ---------- юниты ----------
  villager: (b, t) => { human(b, t); b.cyl(0.02, 0.3, 0.1, STRAW, 0, 0.86, 0, 8); b.box(0.16, 0.16, 0.1, WOOD, 0, 0.5, -0.17); },
  clubman: (b, t) => { human(b, t); b.cyl(0.09, 0.04, 0.45, WOOD, 0.19, 0.55, 0.1, 6, [0.5, 0, 0]); },
  spearman: (b, t) => {
    human(b, t);
    b.cyl(0.03, 0.03, 1.2, WOOD, 0.18, 0.6, 0.05, 5); b.cyl(0, 0.07, 0.14, METAL, 0.18, 1.27, 0.05, 4);
    t.box(0.05, 0.36, 0.26, W, -0.18, 0.5, 0.03);
  },
  archer: (b, t) => { human(b, t); b.cyl(0.03, 0.03, 0.75, WOOD, -0.18, 0.55, 0.08, 5); b.cyl(0.09, 0.09, 0.32, DARK, 0.07, 0.58, -0.15, 6, [0.3, 0, 0]); },
  swordsman: (b, t) => {
    human(b, t, 0, true);
    b.box(0.04, 0.42, 0.03, METAL, 0.19, 0.58, 0.12, [0.6, 0, 0]);
    t.cyl(0.32, 0.32, 0.05, W, -0.19, 0.5, 0.05, 10, [0, 0, PI / 2]);
  },
  horseman: (b, t) => {
    b.box(0.3, 0.3, 0.75, HORSE, 0, 0.55, 0);
    for (const [x, z] of [[0.1, 0.27], [-0.1, 0.27], [0.1, -0.27], [-0.1, -0.27]]) b.box(0.08, 0.42, 0.08, DARK, x, 0.21, z);
    b.box(0.15, 0.36, 0.15, HORSE, 0, 0.8, 0.38, [0.5, 0, 0]);
    b.box(0.13, 0.13, 0.3, HORSE, 0, 0.97, 0.52);
    t.box(0.34, 0.06, 0.42, W, 0, 0.72, -0.02);
    human(b, t, 0.52);
    b.cyl(0.03, 0.03, 1.3, WOOD, 0.2, 1.15, 0.3, 5, [1.2, 0, 0]);
  },
  ram: (b, t) => {
    b.box(0.7, 0.3, 1.1, WOOD, 0, 0.42, 0);
    t.box(0.5, 0.05, 1.15, W, 0.2, 0.72, 0, [0, 0, -0.6]); t.box(0.5, 0.05, 1.15, W, -0.2, 0.72, 0, [0, 0, 0.6]);
    for (const [x, z] of [[0.38, 0.35], [-0.38, 0.35], [0.38, -0.35], [-0.38, -0.35]]) b.cyl(0.3, 0.3, 0.08, DARK, x, 0.15, z, 10, [0, 0, PI / 2]);
    b.cyl(0.14, 0.14, 1.3, WOOD, 0, 0.35, 0.15, 8, [PI / 2, 0, 0]);
    b.cyl(0.2, 0.16, 0.16, METAL, 0, 0.35, 0.85, 8, [PI / 2, 0, 0]);
  },
  cow: (b, t) => {
    const Wc = C('#f2efe6'), Bk = C('#2b2622');
    b.box(0.34, 0.3, 0.62, Wc, 0, 0.42, 0);
    b.box(0.35, 0.16, 0.2, Bk, 0, 0.47, 0.08); b.box(0.35, 0.12, 0.16, Bk, 0, 0.4, -0.18); // пятна
    for (const [x, z] of [[0.12, 0.22], [-0.12, 0.22], [0.12, -0.22], [-0.12, -0.22]]) b.box(0.07, 0.28, 0.07, C('#e3dccd'), x, 0.14, z);
    b.box(0.2, 0.2, 0.24, Wc, 0, 0.55, 0.39); b.box(0.15, 0.08, 0.06, C('#d9a0a0'), 0, 0.5, 0.52);
    b.box(0.3, 0.04, 0.04, C('#d8d0b8'), 0, 0.67, 0.36); // рога
    t.box(0.23, 0.05, 0.05, W, 0, 0.47, 0.28); // ошейник цвета игрока
  },
  // ---------- здания (центр основания в 0) ----------
  town_center: (b, t) => {
    b.box(2.8, 0.5, 2.8, STONE, 0, 0.25, 0); b.box(2.2, 1.0, 2.2, PLASTER, 0, 1.0, 0);
    t.pyr(2.6, 2.6, 1.1, W, 0, 1.5, 0);
    b.cyl(0.6, 0.7, 2.4, STONE, 1.1, 1.2, 1.1, 8); t.cyl(0, 0.85, 0.7, W, 1.1, 2.75, 1.1, 8);
    b.box(0.4, 0.6, 0.05, DARK, 0, 0.8, 1.11);
  },
  house: (b, t) => { b.box(1.3, 0.75, 1.3, PLASTER, 0, 0.375, 0); b.box(0.3, 0.45, 0.04, DARK, 0, 0.23, 0.66); t.pyr(1.6, 1.6, 0.7, W, 0, 0.75, 0); },
  barracks: (b, t) => { b.box(2.6, 0.9, 1.9, WOOD, 0, 0.45, 0); t.pyr(2.9, 2.2, 0.8, W, 0, 0.9, 0); b.box(0.9, 0.5, 0.1, DARK, 0, 0.25, 1.2); },
  archery: (b, t) => {
    b.box(2.4, 0.8, 1.6, WOOD, 0, 0.4, -0.3); t.pyr(2.7, 1.9, 0.7, W, 0, 0.8, -0.3);
    b.cyl(0.6, 0.6, 0.08, C('#e8e0c8'), 0.8, 0.5, 1.1, 12, [PI / 2, 0, 0]); b.cyl(0.3, 0.3, 0.09, C('#c0392b'), 0.8, 0.5, 1.1, 12, [PI / 2, 0, 0]);
  },
  stable: (b, t) => {
    b.box(2.7, 0.8, 1.5, WOOD, 0, 0.4, -0.5); t.pyr(2.9, 1.8, 0.6, W, 0, 0.8, -0.5);
    for (let x = -1.2; x <= 1.21; x += 0.6) b.box(0.08, 0.4, 0.08, WOOD, x, 0.2, 1.2);
    b.box(2.6, 0.06, 0.06, WOOD, 0, 0.3, 1.2);
  },
  workshop: (b, t) => {
    b.box(2.4, 1.0, 2.0, STONE, 0, 0.5, 0); t.pyr(2.6, 2.2, 0.7, W, 0, 1.0, 0);
    b.box(0.3, 0.8, 0.3, STONE, 0.8, 1.4, 0.6); b.cyl(0.6, 0.6, 0.08, WOOD, 1.3, 0.3, 0, 10, [0, 0, PI / 2]);
  },
  camp: (b, t) => {
    t.cyl(0, 1.2, 1.0, W, -0.3, 0.5, -0.2, 6);
    for (let k = 0; k < 3; k++) b.cyl(0.18, 0.18, 0.9, WOOD, 0.5, 0.09 + (k === 2 ? 0.16 : 0), 0.3 + (k === 1 ? 0.18 : k === 2 ? 0.09 : 0), 6, [0, 0, PI / 2]);
    b.box(0.35, 0.35, 0.35, WOOD, 0.5, 0.18, -0.5);
  },
  pasture: (b, t) => { // ферма: амбар с сеновалом + загон для коров
    b.box(2.9, 0.04, 2.9, C('#7c8f45'), 0, 0.02, 0);
    b.box(1.5, 0.8, 1.1, WOOD, -0.65, 0.4, -0.75); t.pyr(1.75, 1.35, 0.65, W, -0.65, 0.8, -0.75);   // амбар
    b.box(0.45, 0.55, 0.04, DARK, -0.65, 0.28, -0.19);                                                  // ворота амбара
    b.cyl(0.55, 0.62, 0.55, STRAW, 0.85, 0.28, -0.9, 8); b.cyl(0, 0.65, 0.3, STRAW, 0.85, 0.7, -0.9, 8);  // стог
    for (const h of [0.16, 0.3]) { // загон спереди
      b.box(2.8, 0.05, 0.05, WOOD, 0, h, 1.4); b.box(0.05, 0.05, 1.4, WOOD, 1.4, h, 0.7); b.box(0.05, 0.05, 1.4, WOOD, -1.4, h, 0.7); b.box(2.8, 0.05, 0.05, WOOD, 0, h, 0);
    }
    for (const x of [-1.4, -0.7, 0, 0.7, 1.4]) { b.box(0.07, 0.4, 0.07, WOOD, x, 0.2, 1.4); b.box(0.07, 0.4, 0.07, WOOD, x, 0.2, 0); }
    b.box(0.7, 0.18, 0.28, WOOD, 0.5, 0.09, 0.8); b.box(0.6, 0.06, 0.2, C('#5a86b0'), 0.5, 0.17, 0.8); // корыто с водой
    b.cyl(0.03, 0.03, 1.0, WOOD, -1.3, 0.5, -1.3, 5); t.box(0.35, 0.2, 0.02, W, -1.12, 0.88, -1.3);
  },
  farm: (b, t) => { // поле пшеницы: пашня и золотые колосья рядами
    b.box(1.95, 0.05, 1.95, SOIL, 0, 0.025, 0);
    for (let k = -3; k <= 3; k++) { b.box(1.8, 0.2, 0.1, C('#d6b24a'), 0, 0.12, k * 0.26); b.box(1.8, 0.05, 0.13, C('#e8c860'), 0, 0.24, k * 0.26); }
    b.cyl(0.03, 0.03, 0.6, WOOD, 0.9, 0.3, 0.9, 5); t.box(0.25, 0.15, 0.02, W, 1.02, 0.52, 0.9);
  },
  tower: (b, t) => { b.cyl(0.7, 0.85, 2.2, STONE, 0, 1.1, 0, 8); b.cyl(0.95, 0.95, 0.3, STONE, 0, 2.35, 0, 8); t.cyl(0, 1.0, 0.7, W, 0, 2.85, 0, 8); },
  wall: (b, t) => { // прямой пролёт с дорожкой и зубцами; тянется вдоль линии
    b.box(1, 1.0, 1, STONE, 0, 0.5, 0);
    b.box(1, 0.06, 0.7, C('#8d877b'), 0, 1.02, 0);
    for (const x of [-0.375, -0.125, 0.125, 0.375]) for (const z of [-0.42, 0.42]) b.box(0.13, 0.2, 0.16, STONE, x, 1.12, z);
    t.box(1.01, 0.08, 1.01, W, 0, 0.75, 0);
  },
  wallpost: (b, t) => { // столб на концах линии и в углах
    b.box(1.0, 1.45, 1.0, STONE, 0, 0.725, 0);
    for (const [x, z] of [[0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36], [0, 0.36], [0, -0.36], [0.36, 0], [-0.36, 0]]) b.box(0.18, 0.22, 0.18, STONE, x, 1.56, z);
    t.box(1.02, 0.1, 1.02, W, 0, 1.15, 0);
  },
  gate: (b, t) => {
    b.box(0.25, 1.4, 1, STONE, 0.38, 0.7, 0); b.box(0.25, 1.4, 1, STONE, -0.38, 0.7, 0); b.box(1, 0.25, 1, STONE, 0, 1.3, 0);
    t.box(0.3, 0.18, 1.02, W, 0, 1.15, 0); // герб над проходом; створки рисуются отдельно и открываются
  },
};

export function makeModels(scene: Scene) {
  const things: Record<string, [Mesh | null, Mesh | null]> = {};
  for (const [type, fn] of Object.entries(DEFS)) {
    const b = new Kit(scene), t = new Kit(scene);
    fn(b, t);
    things[type] = [b.done(type + '_b'), t.done(type + '_t')];
  }
  const one = (fn: (k: Kit) => void, name: string) => { const k = new Kit(scene); fn(k); return k.done(name)!; };
  const res = {
    pine: one((k) => { k.cyl(0.12, 0.16, 0.5, WOOD, 0, 0.25, 0, 5); k.cyl(0, 0.9, 0.8, LEAF, 0, 0.8, 0, 6); k.cyl(0, 0.65, 0.7, LEAF, 0, 1.2, 0, 6); }, 'pine'),
    oak: one((k) => { k.cyl(0.12, 0.16, 0.6, WOOD, 0, 0.3, 0, 5); k.ball(0.95, LEAF2, 0, 1.0, 0, 0.85); }, 'oak'),
    bush: one((k) => { k.ball(0.6, LEAF2, 0, 0.25, 0, 0.8); for (const [x, z] of [[0.18, 0.1], [-0.12, 0.18], [0.02, -0.2]]) k.ball(0.1, C('#c0304a'), x, 0.42, z); }, 'bush'),
    stone: one((k) => { k.rock(0.55, C('#9a9a98'), 0, 0.2, 0); k.rock(0.35, C('#b4b3ad'), 0.25, 0.12, 0.15); k.rock(0.3, C('#8c8b88'), -0.22, 0.1, -0.12); }, 'stone'),
    iron: one((k) => { k.rock(0.55, C('#5a5552'), 0, 0.2, 0); k.rock(0.35, C('#8a4a32'), 0.25, 0.12, 0.15); k.rock(0.3, C('#6a3a2a'), -0.22, 0.1, -0.12); }, 'iron'),
    arrow: one((k) => { k.box(0.03, 0.03, 0.45, WOOD, 0, 0, 0); k.cyl(0, 0.06, 0.08, METAL, 0, 0, 0.25, 4, [PI / 2, 0, 0]); }, 'arrow'),
  };
  return { things, res };
}
