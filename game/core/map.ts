import type { World } from './world.ts';
import { RES, RES_AMOUNT, REGION_KINDS, MAP, type Res, type RegionKind } from '../data/index.ts';


const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

// Процедурная карта: озёра, горы, леса, залежи + гарантированные ресурсы у каждой базы
export function genMap(w: World, starts: [number, number][]) {
  const { W, H, rng } = w;
  const nearStart = (x: number, y: number, d: number) => starts.some(([sx, sy]) => Math.max(Math.abs(x - sx), Math.abs(y - sy)) < d);
  const blob = (cx: number, cy: number, r: number, fn: (i: number) => void) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r - rng.int(r + 1)) fn(x + y * W);
    }
  };
  const setRes = (i: number, r: Res) => {
    if (w.terrain[i] === 0 && w.resType[i] === 0) { w.resType[i] = RES.indexOf(r) + 1; w.resAmt[i] = RES_AMOUNT[r]; }
  };
  const randPt = (m: number): [number, number] | null => {
    for (let k = 0; k < 50; k++) {
      const x = m + rng.int(W - 2 * m), y = m + rng.int(H - 2 * m);
      if (!nearStart(x, y, MAP.start.keepAway)) return [x, y];
    }
    return null;
  };
  const scatter = (n: number, rMin: number, rVar: number, fn: (i: number) => void) => {
    for (let k = 0; k < n; k++) { const p = randPt(4); if (p) blob(p[0], p[1], rMin + rng.int(rVar), fn); }
  };

  for (const s of MAP.scatter) // пятна рельефа и ресурсов — по порядку из map.json
    scatter(s.count, s.radius, s.radiusSpread, s.res ? (i) => setRes(i, s.res as Res) : (i) => (w.terrain[i] = s.terrain!));

  for (const [sx, sy] of starts) {
    const cr = MAP.start.clearRadius;
    for (let y = sy - cr; y <= sy + cr; y++) for (let x = sx - cr; x <= sx + cr; x++)
      if (x >= 0 && y >= 0 && x < W && y < H) { const i = x + y * W; w.terrain[i] = 0; w.resType[i] = 0; w.resAmt[i] = 0; }
    const rot = rng.int(8);
    const place = (k: number, dist: number, r: number, res: Res) => {
      const [dx, dy] = DIRS[(rot + k) % 8];
      blob(sx + dx * dist, sy + dy * dist, r, (i) => setRes(i, res));
    };
    for (const p of MAP.start.place) place(p.dir, p.dist, p.radius, p.res as Res); // гарантированные ресурсы у базы
  }

  // Регионы: диаграмма Вороного по «дрожащей» сетке 4×4
  const seeds: [number, number][] = [], G = MAP.regionGrid, cw = Math.floor(W / G), ch = Math.floor(H / G);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++)
    seeds.push([gx * cw + Math.floor(cw * 0.2) + rng.int(Math.floor(cw * 0.6)), gy * ch + Math.floor(ch * 0.2) + rng.int(Math.floor(ch * 0.6))]);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    let best = 0, bd = Infinity;
    seeds.forEach(([sx, sy], k) => { const d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = k; } });
    w.region[i] = best;
  }
  const pool = [...MAP.regionNames];
  seeds.forEach((_, k) => {
    const cnt = new Array(RES.length + 1).fill(0); // по типам ресурсов (индекс = RES + 1)
    let size = 0;
    for (let i = 0; i < W * H; i++) if (w.region[i] === k) { size++; cnt[w.resType[i]]++; }
    const score: [RegionKind, number][] = [['forest', cnt[2] / 2], ['quarry', cnt[3] * 3], ['iron', cnt[4] * 3]];
    let kind: RegionKind = 'plains', bs = 12;
    for (const [kk, v] of score) if (v > bs) { bs = v; kind = kk; }
    const adj = pool.splice(rng.int(pool.length), 1)[0];
    w.regions.push({ name: `${adj} ${REGION_KINDS[kind].noun}`, kind, owner: -1, size });
  });

}
