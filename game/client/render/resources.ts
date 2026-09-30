// Ресурсы и декор: лес, кусты, камень и руда (уменьшаются по мере выработки), пшеница, мелочи на земле и быт у построек.
import { BUILDINGS, WHEAT } from '../../data/index.ts';
import { TS, props } from '../config/visual.ts';
import type { GameContext } from '../context.ts';

export const rhash = (i: number) => Math.imul(i, 2654435761) >>> 0; // псевдослучайное по номеру клетки/id

export function useResources(ctx: GameContext) {
  const { w } = ctx.session, { heightAt } = ctx.terrain, { NL } = ctx.models, fog = ctx.fog, dirtW = ctx.ground.dirtW;
  const layers = Object.entries(NL).filter(([k]) => !k.startsWith('grass')).map(([, l]) => l);

  // Перестраиваем тысячи инстансов, только если что-то изменилось: разведка, выработка, постройки, рост поселений
  let lastKey = '';
  const key = () => {
    let seen = 0, amt = 0, b = 0;
    for (let i = 0; i < w.W * w.H; i++) { seen += fog.seen[i]; if (fog.seen[i]) amt = (amt + w.resAmt[i] * ((i & 7) + 1) + w.resType[i]) | 0; }
    for (const e of w.ents.values()) if (e.kind === 'b') b = (b + e.id * (e.progress >= BUILDINGS[e.type].time ? 3 : 1) + (fog.visible(e) ? 7 : 0)) | 0;
    return `${seen}|${amt}|${b}|${w.players.map((P) => P.settle).join('')}`;
  };

  function draw() {
    const k = key();
    if (k === lastKey) return;
    lastKey = k;
    layers.forEach((l) => l.begin());
    for (let i = 0; i < w.W * w.H; i++) {
      if (!fog.seen[i]) continue;
      const r = w.resType[i], h = rhash(i); // только беззнаковые сдвиги (>>>): иначе отрицательные индексы
      const x = (i % w.W) + 0.5 + ((h & 15) - 7.5) / 50, z = ((i / w.W) | 0) + 0.5 + (((h >>> 4) & 15) - 7.5) / 50;
      const y = heightAt(x, z), rot = ((h >>> 8) % 628) / 100, s = 0.85 + ((h >>> 12) % 35) / 100;
      if (!r) { // свободная клетка: иногда — мелкий декор (у леса пни, брёвна, папоротник, грибы; у камня — камешки)
        if (w.occ[i] || (w.terrain[i] !== 0 && w.terrain[i] !== 3) || dirtW[i] > 0.7) continue;
        let nf = 0, ns = 0;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const t = w.resType[i + dx + dz * w.W]; if (t === 2) nf++; else if (t === 3 || t === 4) ns++; }
        const q = (h >>> 3) % 1000;
        const kind = nf ? (q < 60 ? 'stump' : q < 100 ? 'log' : q < 190 ? 'fern' : q < 215 ? 'mushroom' : '') : ns ? (q < 120 ? 'pebbles' : '') : q < 12 ? 'pebbles' : q < 18 ? 'log' : q < 30 ? 'fern' : '';
        if (kind) NL[kind]?.add(x, y, z, s, s, s, undefined, rot);
        continue;
      }
      if (r === 2) { // лес: ели, дубы, берёзы и осенние кроны вперемешку, разной высоты
        const q = (h >>> 20) % 100, sy = s * (0.85 + ((h >>> 24) % 35) / 100);
        const [tr, cr] = q < 38 ? ['pineT', 'pineL'] : q < 70 ? ['oakT', 'oakL'] : q < 82 ? ['oakT', 'oakY'] : q < 90 ? ['oakT', 'oakO'] : ['birchT', 'birchL'];
        NL[tr]?.add(x, y, z, s * TS, sy * TS, s * TS, undefined, rot);
        NL[cr]?.add(x, y, z, s * TS, sy * TS, s * TS, undefined, rot);
        if ((h >>> 5) % 2) { // подлесок: второе, пониже, со смещением — лес гуще
          const ox = x + (((h >>> 9) & 7) - 3.5) / 9, oz = z + (((h >>> 13) & 7) - 3.5) / 9, k = s * TS * 0.62;
          const pine2 = q % 2 === 0;
          NL[pine2 ? 'pineT' : 'oakT']?.add(ox, heightAt(ox, oz), oz, k, k, k, undefined, rot + 1.7);
          NL[pine2 ? 'pineL' : q % 3 ? 'oakL' : 'oakY']?.add(ox, heightAt(ox, oz), oz, k, k, k, undefined, rot + 1.7);
        }
      } else if (r === 1 && w.resKind[i] === 2) { // пшеница: ниже по мере жатвы
        const px = (i % w.W) + 0.5, pz = ((i / w.W) | 0) + 0.5, py = heightAt(px, pz), k = 0.45 + (0.55 * w.resAmt[i]) / WHEAT;
        NL.soil?.add(px, py, pz, 1, 1, 1);
        NL.wheat?.add(px, py, pz, 1, k, 1, undefined, (h % 4) * 1.5708);
      } else if (r === 1 && w.resKind[i] === 1) { /* туша рисуется вместе с юнитами */ }
      else if (r === 1) { NL.bush?.add(x, y, z, s, s, s, undefined, rot); NL.berry?.add(x, y, z, s, s, s, undefined, rot); }
      else { // камень и руда уменьшаются по мере выработки
        const k = (0.7 + (0.5 * w.resAmt[i]) / 300) * s;
        NL[(r === 3 ? 'rock' : r === 5 ? 'gold' : 'ore') + ((h >>> 16) % 3)]?.add(x, y, z, k, k * 0.9, k, undefined, rot);
      }
    }
    for (const e of w.ents.values()) { // быт вокруг построек: ящики, бочки, мешки, стога, телеги, заборы
      const set = e.kind === 'b' ? props(e.type) : undefined;
      if (e.kind !== 'b' || !set || e.progress < BUILDINGS[e.type].time || !fog.visible(e)) continue;
      const sz = BUILDINGS[e.type].size, n = 3 + (rhash(e.id) % 3) + (sz > 2 ? 2 : 0) + w.players[e.owner].settle * 2; // чем крупнее поселение, тем больше быта
      for (let k = 0; k < n; k++) {
        const hh = rhash(e.id * 31 + k), side = hh % 4, t = ((hh >>> 4) % 100) / 100;
        const px = side === 0 ? e.tx - 0.35 : side === 1 ? e.tx + sz + 0.35 : e.tx + t * sz, pz = side === 2 ? e.ty - 0.35 : side === 3 ? e.ty + sz + 0.35 : e.ty + t * sz;
        const ti = Math.floor(px) + Math.floor(pz) * w.W;
        if (px < 0 || pz < 0 || px >= w.W || pz >= w.H || w.occ[ti] > 0 || w.resType[ti]) continue;
        NL[set[(hh >>> 12) % set.length]]?.add(px, heightAt(px, pz), pz, 1, 1, 1, undefined, side < 2 ? Math.PI / 2 : 0);
      }
    }
    layers.forEach((l) => l.end());
  }
  return { draw };
}
