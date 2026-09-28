// Юниты и здания: модели (настоящие glTF с запечёнными позами или процедурные), флаги, полоски здоровья,
// выделение, точки сбора, стены с воротами. Позиции юнитов плавно интерполируются между тиками симуляции.
import { BUILDINGS, UNITS, TILE } from '../../data/index.ts';
import { maxHp } from '../../core/civ.ts';
import type { Building } from '../../core/world.ts';
import type { AnimKey } from '../assets/loader.ts';
import { US, AGE_TIER, unitH, bldH, bldScale, hasFlag } from '../config/visual.ts';
import { rhash } from './resources.ts';
import { lineFrame, onLine } from './walls.ts';
import type { GameContext } from '../context.ts';

export function useEntities(ctx: GameContext) {
  const { S } = ctx, { w, ME, pcol, colorIdx } = ctx.session, { engine } = ctx.stage, { heightAt } = ctx.terrain;
  const { MODELS, L, addModel } = ctx.models, fog = ctx.fog;
  const prev = new Map<number, [number, number]>(); // позиции прошлого тика — для плавности
  const yaws = new Map<number, number>();            // куда смотрит юнит
  const gateK = new Map<number, number>();           // насколько открыты ворота (0..1)
  let bldIds: number[] = [];                         // номер инстанса «корпуса» → id здания (для клика)
  const own = [L.bld, L.sel, L.hpBg, L.hpFg, L.flag, L.fx, L.door, L.arrow, L.team, L.pole, L.banner]; // слои, которые целиком рисуются здесь

  // Полоска здоровья: подложка + цветная часть по доле hp
  const showBar = (hurt: boolean, picked: boolean) => S.hpBars === 'always' || picked || (S.hpBars === 'damaged' && hurt);
  function bar(x: number, y: number, z: number, wd: number, k: number) {
    L.hpBg.add(x, y, z, wd, 0.07, 0.07);
    L.hpFg.add(x - (wd * (1 - k)) / 2, y, z, wd * k, 0.09, 0.09, k > 0.6 ? [0.2, 0.9, 0.2, 1] : k > 0.3 ? [0.95, 0.8, 0.1, 1] : [0.95, 0.2, 0.1, 1]);
  }

  function drawWallPiece(e: Building, by: number, k: number, col: number[], dt: number) {
    let sp = 1, yaw = 0;
    const f = lineFrame(w.W, e.l0, e.l1), [px, pz] = onLine(f, e.tx + 0.5, e.ty + 0.5);
    if (f) { sp = f.sp + 0.04; yaw = f.yaw; }
    const [mb, mt] = MODELS[e.type] ?? [null, null];
    const wd = e.type === 'wall' && f ? 0.6 : 0.85; // стена тоньше, ворота — массивнее
    mb?.add(px, by, pz, sp, k, wd, undefined, yaw);
    mt?.add(px, by, pz, sp, k, wd, col, yaw);
    const ti = e.tx + e.ty * w.W;
    if (e.type === 'wall' && f && (ti === e.l0 || ti === e.l1)) { // столбы на концах — стыки и углы выглядят цельно
      const [pb, pt] = MODELS.wallpost;
      pb?.add(px, by, pz, 0.85, k, 0.85, undefined, yaw);
      pt?.add(px, by, pz, 0.85, k, 0.85, col, yaw);
    }
    if (e.type !== 'gate') return;
    let near = false; // открытые ворота распахиваются, когда рядом свои, и закрываются за ними; запертые — всегда закрыты
    if (e.open) for (const u of w.ents.values()) if (u.kind === 'u' && u.owner === e.owner && Math.abs(u.x / TILE - px) < 1.6 && Math.abs(u.y / TILE - pz) < 1.6) { near = true; break; }
    const target = near ? 1 : 0;
    let gk = gateK.get(e.id) ?? 0;
    gk += Math.sign(target - gk) * Math.min(Math.abs(target - gk), dt * 2);
    gateK.set(e.id, gk);
    const a = (gk * Math.PI) / 2 * 0.95, cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (const side of [-1, 1]) { // две створки на петлях у столбов, распахиваются внутрь
      const lx = side * (0.25 - Math.cos(a) * 0.125) * sp, lz = Math.sin(a) * 0.125 * sp;
      L.door.add(px + lx * cs + lz * sn, by + 0.5 * k, pz - lx * sn + lz * cs, 0.25 * sp, k, 0.06, [0.42 + col[0] * 0.25, 0.28 + col[1] * 0.2, 0.16 + col[2] * 0.2, 1], yaw + side * a);
    }
  }

  /** Кадр: a — доля пути между прошлым и текущим тиком (0..1) */
  function draw(a: number) {
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000), T = performance.now() / 1000, A = ctx.assets, sel = ctx.sel;
    for (const pair of Object.values(MODELS)) for (const l of pair) l?.begin();
    for (const l of A?.layers ?? []) l.begin();
    for (const l of own) l.begin();
    bldIds = [];
    for (const e of w.ents.values()) {
      if (!fog.visible(e)) continue;
      const col = [...pcol(e.owner), 1], picked = sel.has(e.id);
      if (e.kind === 'u') {
        const p = prev.get(e.id) ?? [e.x, e.y], d = UNITS[e.type];
        const x = (p[0] + (e.x - p[0]) * a) / TILE, z = (p[1] + (e.y - p[1]) * a) / TILE, moving = Math.hypot(e.x - p[0], e.y - p[1]) > 40; // мелкие сдвиги от толкотни — не ходьба
        let yaw = yaws.get(e.id) ?? 0;
        if (moving) yaw = Math.atan2(e.x - p[0], e.y - p[1]);
        else if (e.order.t === 'attack') { // лицом к цели
          const t = w.ents.get(e.order.target);
          if (t) yaw = t.kind === 'u' ? Math.atan2(t.x - e.x, t.y - e.y) : Math.atan2((t.tx + 0.5) * TILE - e.x, (t.ty + 0.5) * TILE - e.y);
        } else if (e.order.t === 'gather') yaw = Math.atan2(((e.order.tile % w.W) + 0.5) * TILE - e.x, (((e.order.tile / w.W) | 0) + 0.5) * TILE - e.y); // лицом к ресурсу
        else if (e.order.t === 'build') { const t = w.ents.get(e.order.target); if (t && t.kind === 'b') { const hs = BUILDINGS[t.type].size / 2; yaw = Math.atan2((t.tx + hs) * TILE - e.x, (t.ty + hs) * TILE - e.y); } }
        yaws.set(e.id, yaw);
        const g = heightAt(x, z);
        const fly = d.air ? 2.6 + Math.sin(T * 1.3 + e.id) * 0.15 : 0; // авиация — в воздухе, слегка покачивается
        let y = g + fly, mx = x, mz = z;
        if (moving) y += Math.abs(Math.sin(T * 9 + e.id)) * 0.06;                                              // шаг
        else if (e.order.t === 'attack' && e.cd > d.cd - 4) { mx += Math.sin(yaw) * 0.12; mz += Math.cos(yaw) * 0.12; } // выпад
        const au = A?.units[e.type];
        if (au) { // настоящая модель: поза по состоянию юнита
          const work = e.order.t === 'gather' || e.order.t === 'farm' || e.order.t === 'build';
          const key: AnimKey = moving ? 'walk' : e.order.t === 'attack' ? (d.range > 2000 && au.shoot ? 'shoot' : 'attack') : work ? 'work' : 'idle';
          const fr = au[key] ?? au.idle ?? au.walk!;
          const i = key === 'attack' || key === 'shoot'
            ? Math.min(fr.length - 1, Math.floor(((d.cd - e.cd) / d.cd) * fr.length)) // удар синхронен с атакой
            : Math.floor(((T + e.id * 0.37) / (A?.udur[e.type]?.[key] ?? 1)) * fr.length) % fr.length; // с реальной скоростью клипа
          const air = fly ? y : g; // техника в воздухе висит на высоте полёта
          fr[i].base.add(x, air, z, US, US, US, undefined, yaw);
          fr[i].team?.add(x, air, z, US, US, US, col, yaw);
          L.team.add(x, g + 0.03, z, 0.44, 1, 0.44, col);
        } else addModel(e.type, mx, y, mz, yaw, US, col);
        if (picked) L.sel.add(x, g + 0.03, z, 0.46, 1, 0.46);
        const mh = maxHp(w, e);
        if (showBar(e.hp < mh, picked)) bar(x, g + fly + unitH(e.type) * US, z, 0.45, e.hp / mh);
      } else {
        const d = BUILDINGS[e.type], k = Math.max(0.15, e.progress / d.time), cx = e.tx + d.size / 2, cz = e.ty + d.size / 2;
        const by = heightAt(cx, cz), bh = bldH(e.type) * k, wall = e.type === 'wall' || e.type === 'gate';
        const ab = wall ? undefined : A?.buildings[e.type]; // стены — свои квадратные блоки, одинаковые по X и Y
        const sg = wall ? undefined : A?.staged[e.type];
        if (sg) { // по эпохам: вид по эпохе владельца, вариант — по зданию, стадия — по ходу стройки
          const tier = sg[Math.min(AGE_TIER[w.players[e.owner].age] ?? 0, sg.length - 1)], v = tier[rhash(e.id) % tier.length];
          const st = e.progress >= d.time ? v.length - 1 : Math.min(v.length - 1, Math.floor((e.progress / d.time) * v.length));
          const yaw = e.type === 'house' ? ((rhash(e.id) >>> 5) % 4) * (Math.PI / 2) : 0; // дома повёрнуты по-разному — деревня живее
          v[st].add(cx, by, cz, 1, v.length > 1 ? 1 : k, 1, undefined, yaw);
        } else if (ab) { const [bw, bv] = bldScale(e.type); ab[colorIdx(e.owner) % ab.length].add(cx, by, cz, bw, k * bv, bw); } // здание в цвете игрока
        else if (wall) drawWallPiece(e, by, k, col, dt); // вдоль линии стены, под любым углом
        else addModel(e.type, cx, by, cz, 0, 1, col, k);
        L.bld.add(cx, by + bh / 2, cz, d.size, bh, d.size);
        if (k >= 1 && hasFlag(e.type)) { // флаг цвета игрока на углу, как в War Selection: сразу видно, чьё здание
          const fx = e.tx + 0.12, fz = e.ty + 0.12, fy = heightAt(fx, fz), ph = 1.3 + d.size * 0.25, wave = Math.sin(T * 3 + e.id) * 0.12;
          L.pole.add(fx, fy + ph / 2, fz, 0.05, ph, 0.05);
          L.banner.add(fx + 0.22, fy + ph - 0.16, fz, 0.42, 0.28, 0.03, col, wave);
        }
        bldIds.push(e.id);
        const mh = maxHp(w, e);
        if (showBar(e.hp < mh, picked)) bar(cx, by + bh + 0.4, cz, d.size * 0.6, e.hp / mh);
        if (picked) {
          L.sel.add(cx, by + 0.05, cz, d.size + 0.5, 1, d.size + 0.5);
          if (e.owner === ME && e.rally >= 0) { // флажок точки сбора
            const fx = (e.rally % w.W) + 0.5, fz = ((e.rally / w.W) | 0) + 0.5, fy = heightAt(fx, fz);
            L.flag.add(fx, fy + 0.6, fz, 0.06, 1.2, 0.06); L.flag.add(fx + 0.2, fy + 1.05, fz, 0.4, 0.28, 0.04);
          }
        }
      }
    }
    const sr = sel.res;
    if (sr >= 0 && w.resType[sr]) { const rx = (sr % w.W) + 0.5, rz = ((sr / w.W) | 0) + 0.5; L.sel.add(rx, heightAt(rx, rz) + 0.04, rz, 0.95, 1, 0.95); }
    ctx.effects.draw(dt);
    for (const pair of Object.values(MODELS)) for (const l of pair) l?.end();
    for (const l of A?.layers ?? []) l.end();
    for (const l of own) l.end();
  }

  return {
    draw,
    /** Запомнить позиции перед шагом симуляции — для плавного движения */
    beforeStep() { prev.clear(); for (const e of w.ents.values()) if (e.kind === 'u') prev.set(e.id, [e.x, e.y]); },
    /** Забыть погибших (иначе карты поворотов и ворот растут всю партию) */
    prune() { for (const m of [yaws, gateK]) for (const id of m.keys()) if (!w.ents.has(id)) m.delete(id); },
    yawOf: (id: number) => yaws.get(id) ?? 0,
    buildingAt: (instance: number) => bldIds[instance],
    pickMesh: L.bld.mesh,
  };
}
