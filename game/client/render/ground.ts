// Земля: 4 слоя фототекстур без видимого повтора + живая карта «грязи» (вокруг зданий, лесная подстилка, тропы, дороги).
// Без скачанных текстур — чистые цвета палитры. Только визуал: на симуляцию не влияет.
import { DynamicTexture, Vector2, VertexBuffer, Color3 } from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials';
import { BUILDINGS, TILE, UNITS } from '../../data/index.ts';
import { walkable, type Building } from '../../core/world.ts';
import { PAL } from '../config/visual.ts';
import type { GameContext } from '../context.ts';

export function useGround(ctx: GameContext) {
  const { w } = ctx.session, { scene } = ctx.stage, { ground } = ctx.terrain, A = ctx.assets;
  const splatTex = new DynamicTexture('splat', { width: w.W, height: w.H }, scene, false);
  const dirtW = new Float32Array(w.W * w.H), traffic = new Float32Array(w.W * w.H);
  const nearWater = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.terrain[x + dx + (y + dy) * w.W] === 1);

  // ---------- Дороги (GDD §3: рост поселения виден на карте) ----------
  // От каждого здания — улица к ближайшей своей ратуше: поиск в ширину по проходимым клеткам (4 соседа — прямые улицы).
  // road: 0 — нет, 1 — грунтовка, 2 — мощёная (город и выше)
  const road = new Uint8Array(w.W * w.H);
  let roadKey = '';
  function updateRoads() {
    const key = [...w.ents.values()].filter((e) => e.kind === 'b' && e.progress >= BUILDINGS[e.type].time).map((e) => e.id + ':' + w.players[e.owner].settle).join(',');
    if (key === roadKey) return;
    roadKey = key;
    road.fill(0);
    const N = w.W * w.H, par = new Int32Array(N), q = new Int32Array(N);
    for (const P of w.players) {
      const mine = [...w.ents.values()].filter((e): e is Building => e.kind === 'b' && e.owner === P.id && e.progress >= BUILDINGS[e.type].time);
      const tcs = mine.filter((b) => b.type === 'town_center');
      if (!tcs.length) continue;
      par.fill(-2); // -2 — не посещено, -1 — источник
      let h = 0, t = 0;
      const ring = (b: Building) => { // клетки вокруг здания (без углов)
        const s = BUILDINGS[b.type].size, out: number[] = [];
        for (let y = b.ty - 1; y <= b.ty + s; y++) for (let x = b.tx - 1; x <= b.tx + s; x++)
          if ((x === b.tx - 1 || x === b.tx + s || y === b.ty - 1 || y === b.ty + s) && x >= 0 && y >= 0 && x < w.W && y < w.H && (x === b.tx - 1 || x === b.tx + s) !== (y === b.ty - 1 || y === b.ty + s)) out.push(x + y * w.W);
        return out;
      };
      for (const tc of tcs) for (const i of ring(tc)) if (walkable(w, i) && par[i] === -2) { par[i] = -1; q[t++] = i; }
      while (h < t) {
        const i = q[h++], x = i % w.W;
        for (const j of [i - w.W, i + w.W, x > 0 ? i - 1 : -1, x < w.W - 1 ? i + 1 : -1]) if (j >= 0 && j < N && par[j] === -2 && walkable(w, j)) { par[j] = i; q[t++] = j; }
      }
      const kind = P.settle >= 2 ? 2 : 1;
      for (const b of mine) {
        if (b.type === 'town_center' || b.type === 'wall' || b.type === 'gate' || b.type === 'farm') continue;
        let best = -1;
        for (const i of ring(b)) if (par[i] !== -2 && (best < 0 || i < best)) best = i;
        for (let i = best, n = 0; i >= 0 && n < 45; i = par[i], n++) road[i] = Math.max(road[i], kind);
      }
      if (kind === 2) for (const tc of tcs) for (const i of ring(tc)) if (par[i] !== -2) road[i] = 2; // мощёная площадь вокруг ратуши
    }
  }

  /** Пересчитать карту весов: RGB = трава, скала, песок; земля = остаток (альфу канвас портит — не используем) */
  function updateSplat() {
    updateRoads();
    const c2d = splatTex.getContext() as unknown as CanvasRenderingContext2D, img = c2d.createImageData(w.W, w.H), d = img.data;
    dirtW.fill(0);
    for (const e of w.ents.values()) if (e.kind === 'b' && e.type !== 'wall' && e.type !== 'gate') { // утоптанная земля у зданий
      const s = BUILDINGS[e.type].size;
      for (let y = e.ty - 1; y <= e.ty + s; y++) for (let x = e.tx - 1; x <= e.tx + s; x++) {
        if (x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
        const i = x + y * w.W, inside = x >= e.tx && y >= e.ty && x < e.tx + s && y < e.ty + s;
        dirtW[i] = Math.max(dirtW[i], inside ? 1 : 0.6);
      }
    }
    for (let i = 0; i < w.W * w.H; i++) {
      const x = i % w.W, y = (i / w.W) | 0, t = w.terrain[i];
      let g = 1, r = 0, s = 0;
      if (t === 2) { g = 0; r = 1; } else if (t === 3) { g = 0.8; r = 0.2; }
      if (t === 1 || nearWater(x, y)) { g = 0; r = 0; s = 1; }
      if (w.resType[i] === 2) dirtW[i] = Math.max(dirtW[i], 0.5);                      // лесная подстилка
      if (w.resType[i] === 1 && w.resKind[i] === 2) dirtW[i] = Math.max(dirtW[i], 0.85); // пашня под пшеницей
      dirtW[i] = Math.max(dirtW[i], Math.min(0.85, traffic[i] / 25));                  // тропы, протоптанные юнитами
      if (road[i] === 1) dirtW[i] = Math.max(dirtW[i], 0.95);                            // грунтовая улица
      if (road[i] === 2 && !s) { g = 0; r = 1; dirtW[i] = 0; }                            // мощёная улица — камень
      const dd = s ? 0 : dirtW[i], o = (x + (w.H - 1 - y) * w.W) * 4;
      d[o] = 255 * g * (1 - dd); d[o + 1] = 255 * r * (1 - dd); d[o + 2] = 255 * s; d[o + 3] = 255;
    }
    c2d.putImageData(img, 0, 0);
    splatTex.update();
  }

  /** Раз в тик: где ходят — там со временем тропа. Возвращает true, если карта земли пересчитана */
  function onTick() {
    if (w.tick % 10 !== 0) return false;
    for (let i = 0; i < traffic.length; i++) traffic[i] *= 0.996;
    for (const e of w.ents.values()) if (e.kind === 'u' && !UNITS[e.type].animal && (e.path.length || e.order.t === 'gather')) traffic[((e.x / TILE) | 0) + ((e.y / TILE) | 0) * w.W] += 1;
    if (w.tick % 20 !== 0) return false;
    updateSplat();
    return true;
  }

  updateSplat();
  const TT = new CustomMaterial('terrain2', scene);
  TT.AddUniform('tSplat', 'sampler2D', splatTex); TT.AddUniform('uMap', 'vec2', new Vector2(w.W, w.H));
  if (A?.textures.grass && A.textures.rock && A.textures.sand) { // фототекстуры (трава, земля, песок, скала), смешанные по карте весов
    TT.AddUniform('tGrass', 'sampler2D', A.textures.grass); TT.AddUniform('tRock', 'sampler2D', A.textures.rock);
    TT.AddUniform('tSand', 'sampler2D', A.textures.sand); TT.AddUniform('tDirt', 'sampler2D', A.textures.dirt ?? A.textures.sand);
    TT.AddUniform('uNoDirt', 'float', A.textures.dirt ? 0 : 1);
    // Два сэмпла под разным масштабом и поворотом, смешанные шумом, — повтор текстуры не виден
    TT.Fragment_Definitions(`vec3 tex2(sampler2D t, vec2 p) {
      float n = sin(p.x * 0.071 + cos(p.y * 0.053) * 2.0) * 0.5 + 0.5;
      return mix(texture2D(t, p * 0.26).rgb, texture2D(t, vec2(p.y, -p.x) * 0.17 + 0.37).rgb, smoothstep(0.35, 0.65, n));
    }`);
    TT.Fragment_Custom_Diffuse(`
      vec2 wp = vPositionW.xz;
      vec3 sp = texture2D(tSplat, wp / uMap).rgb;
      float dr = clamp(1.0 - sp.r - sp.g - sp.b, 0.0, 1.0);
      float rk = clamp(sp.g + smoothstep(0.2, 0.5, 1.0 - clamp(vNormalW.y, 0.0, 1.0)), 0.0, 1.0); // склоны — скала
      vec3 gr = tex2(tGrass, wp);
      float dry = smoothstep(0.25, 0.85, sin(wp.x * 0.043 + 1.3) * cos(wp.y * 0.037) * 0.5 + 0.5);
      // Перекраска: у фототекстуры берём только рисунок (яркость), цвет задаём сами — сочная зелень с золотистыми пятнами (War Selection)
      float gl = dot(gr, vec3(0.3, 0.59, 0.11)) / 0.33;
      vec3 tint = mix(vec3(${PAL.meadow}), vec3(${PAL.meadowDry}), dry * 0.7);
      gr = mix(gr, tint * clamp(gl, 0.55, 1.5), 0.8);
      vec3 dc = tex2(tDirt, wp) * mix(vec3(1.0), vec3(0.72, 0.58, 0.42), uNoDirt);
      vec3 col = (gr * sp.r + tex2(tSand, wp) * sp.b + dc * dr) / max(sp.r + sp.b + dr, 0.001);
      col = mix(col, tex2(tRock, wp * 0.8), rk);
      col *= 0.9 + 0.2 * (sin(wp.x * 0.021) * cos(wp.y * 0.017) * 0.5 + 0.5);          // крупная неоднородность
      diffuseColor = col;`);
  } else { // запасной вариант без скачанных текстур: чистые цвета из палитры
    TT.Fragment_Custom_Diffuse(`
      vec2 wp = vPositionW.xz;
      vec3 sp = texture2D(tSplat, wp / uMap).rgb;
      float dr = clamp(1.0 - sp.r - sp.g - sp.b, 0.0, 1.0);
      float rk = clamp(sp.g + smoothstep(0.25, 0.5, 1.0 - clamp(vNormalW.y, 0.0, 1.0)), 0.0, 1.0); // склоны — скала
      float spot = smoothstep(0.35, 0.65, sin(wp.x * 0.09 + 1.3) * cos(wp.y * 0.075) * 0.5 + 0.5);   // крупные пятна светлой травы
      vec3 gr = mix(vec3(${PAL.grass}), vec3(${PAL.grassLight}), spot);
      vec3 col = (gr * sp.r + vec3(${PAL.sand}) * sp.b + vec3(${PAL.dirt}) * dr) / max(sp.r + sp.b + dr, 0.001);
      col = mix(col, vec3(${PAL.rock}), smoothstep(0.35, 0.65, rk));
      diffuseColor = col;`);
  }
  TT.specularColor = Color3.Black();
  ground.material = TT;
  ground.removeVerticesData(VertexBuffer.ColorKind);
  return { dirtW, onTick };
}
