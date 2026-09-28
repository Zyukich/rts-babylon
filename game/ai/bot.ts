// Бот. Действует только через команды, как игрок, и видит только то же, что видел бы игрок (туман войны).
// Уровни различаются скоростью реакции и тем, какие умения включены, а не жульничеством с ресурсами.
import { UNITS, BUILDINGS, RES, TILE, REGION_WEIGHT, FINAL_REQ, WHEAT_COST, type Res, type Cost, type Level, AGE_NAMES, AI_CFG, AI_COUNTERS, AI_REGION_VALUE, AI_PERSONALITIES } from '../data/index.ts';
import { computeVision, canSee } from '../core/vision.ts';
import { type World, type Unit, type Building, type Entity, distTo, STARTS, ally, atWar } from '../core/world.ts';
import type { Command } from '../core/sim/index.ts';
import { TECHS, slotsLeft, queuedTechs, ageCost, type Branch } from '../core/civ.ts';

export { LEVELS, type Level } from '../data/index.ts';
const CFG = AI_CFG;
const FAV = AI_PERSONALITIES; // у каждого бота свой характер (ai.json → personalities)
const COUNTER = AI_COUNTERS; // кем отвечать на преобладающий класс врага (ai.json → counters)
const VALUE = AI_REGION_VALUE; // ценность региона для экспансии (ai.json → regionValue)

import { xy, strength, nearestRes, fieldSpot, findSpot } from './helpers.ts';
import { botDiplomacy } from './diplomacy.ts';

export class Bot {
  p: number; level: Level; waveSize = 0; walled = false; gateTile = -1;
  vis: Uint8Array | null = null; seen: Uint8Array | null = null;
  mem = new Map<number, string>(); // замеченные вражеские войска: id → класс
  peaceful = false; mkT = 0; dipT = -1e9; // dipT — когда бот последний раз сам предлагал мир // mkT — счётчик для редких сделок на рынке // дебаг-режим: бот развивается и обороняется, но в походы не ходит
  fav: Branch; // характер: какое направление развития любит (и насколько воинственен)
  constructor(p: number, level: Level = 'normal', fav?: Branch) { this.p = p; this.level = level; this.fav = fav ?? FAV[p % FAV.length]; }

  diplomacy(w: World, out: Command[]) { botDiplomacy(this, w, out); }

  // Место под башню в ценном ничейном регионе недалеко от дома
  expansionSpot(w: World, home: [number, number]): [number, number] | null {
    const minD = w.regions.map(() => Infinity);
    for (let i = 0; i < w.W * w.H; i++) {
      const d = Math.hypot((i % w.W) - home[0], ((i / w.W) | 0) - home[1]), k = w.region[i];
      if (d < minD[k]) minD[k] = d;
    }
    let best = -1, bs = -Infinity;
    w.regions.forEach((r, k) => {
      if (r.owner !== -1 || minD[k] > 35) return;
      const s = VALUE[r.kind] * 100 - minD[k] * 3;
      if (s > bs) { bs = s; best = k; }
    });
    if (best < 0) return null;
    let tries = 0;
    for (let i = 0; i < w.W * w.H && tries < 20; i++) {
      if (w.region[i] !== best) continue;
      const [x, y] = xy(w, i), d = Math.hypot(x - home[0], y - home[1]);
      if (d < minD[best] + 4 || d > minD[best] + 6) continue;
      tries++;
      const sp = findSpot(w, x, y, 1);
      if (sp && w.region[sp[0] + sp[1] * w.W] === best) return sp;
    }
    return null;
  }

  think(w: World): Command[] {
    const cfg = CFG[this.level], p = this.p, P = w.players[p], out: Command[] = [];
    if (!P.alive || (w.tick + p * 3) % cfg.every !== 0) return out;
    this.vis ??= new Uint8Array(w.W * w.H); this.seen ??= new Uint8Array(w.W * w.H);
    computeVision(w, p, this.vis, this.seen);

    // ---------- Обзор ----------
    const vills: Unit[] = [], army: Unit[] = [], bs: Building[] = [], foeArmy: Unit[] = [], foeVills: Unit[] = [], foeBs: Building[] = [], cows: Unit[] = [];
    for (const e of w.ents.values()) {
      if (e.kind === 'u' && UNITS[e.type].animal) { if (e.owner === p) cows.push(e); continue; } // скот — отдельно
      if (e.owner === p) { if (e.kind === 'b') bs.push(e); else if (UNITS[e.type].cls !== 'trade') (UNITS[e.type].cls === 'worker' ? vills : army).push(e); } // повозки — не армия
      else if (!atWar(w, p, e.owner) || !canSee(w, p, this.vis, this.seen, e)) continue; // враги — только те, с кем война
      else if (e.kind === 'b') foeBs.push(e);
      else (UNITS[e.type].cls === 'worker' || UNITS[e.type].cls === 'trade' ? foeVills : foeArmy).push(e); // вражеские повозки — цель для рейда, как жители
    }
    for (const e of foeArmy) this.mem.set(e.id, UNITS[e.type].cls);
    for (const id of this.mem.keys()) if (!w.ents.has(id)) this.mem.delete(id);
    const tc = bs.find((b) => b.type === 'town_center');
    const built = (b: Building) => b.progress >= BUILDINGS[b.type].time;
    const has = (t: string) => bs.some((b) => b.type === t);
    const count = (t: string) => bs.filter((b) => b.type === t).length + army.filter((u) => u.type === t).length;
    const afford = (c: Cost) => RES.every((r) => P.res[r] >= (c[r] ?? 0));
    const anyU = army[0] ?? vills[0];
    const home: [number, number] = tc ? [tc.tx + 1, tc.ty + 1] : anyU ? [(anyU.x / TILE) | 0, (anyU.y / TILE) | 0] : [w.W >> 1, w.H >> 1];
    const dH = (x: number, y: number) => Math.hypot(x - home[0], y - home[1]);
    const foeTc = foeBs.filter((b) => b.type === 'town_center').sort((a, b) => dH(a.tx, a.ty) - dH(b.tx, b.ty))[0];
    // Где враг — неизвестно? Идём смотреть на стартовые позиции (их расположение известно всем)
    const scout = STARTS.slice(0, w.players.length).map(([fx, fy]) => [Math.floor(fx * w.W), Math.floor(fy * w.H)] as [number, number])
      .filter(([x, y]) => dH(x, y) > 15 && !this.seen![x + y * w.W]).sort((a, b) => dH(a[0], a[1]) - dH(b[0], b[1]))[0] ?? null;
    const foeHome = foeTc ? [foeTc.tx + 1, foeTc.ty + 1] : scout;
    const len = foeHome ? Math.hypot(foeHome[0] - home[0], foeHome[1] - home[1]) || 1 : 1;
    const dir = foeHome ? [(foeHome[0] - home[0]) / len, (foeHome[1] - home[1]) / len] : [1, 0];

    // ---------- 1. Экономика ----------
    const want: Record<Res, number> = P.age === 0 ? { food: 5, wood: 4, stone: 1, iron: 0, gold: 0, energy: 0 } : P.age === 1 ? { food: 4, wood: 3, stone: 1, iron: 2, gold: 1, energy: 0 } : { food: 4, wood: 3, stone: 1, iron: 2, gold: 2, energy: 0 }; // энергию не добывают — её дают электростанции
    for (const r of RES) { // запасы влияют на приоритеты: избыток — меньше рук, нехватка — больше
      if (P.res[r] > 600) want[r] *= 0.2;
      else if (P.res[r] < 150 && want[r] > 0) want[r] *= 2;
    }
    if (P.res.stone > 400) want.stone = 0;
    const cnt: Record<Res, number> = { food: 0, wood: 0, stone: 0, iron: 0, gold: 0, energy: 0 }, taken = new Set<number>();
    for (const v of vills) {
      if (v.order.t === 'gather' && v.carryRes) cnt[v.carryRes]++;
      else if (v.order.t === 'farm') { cnt.food++; taken.add(v.order.target); }
      else if (v.order.t === 'attack') cnt.food++; // охотится на корову
    }
    for (const v of vills) if (v.order.t === 'idle') {
      const r = RES.filter((r) => want[r] > 0).sort((a, b) => cnt[a] / want[a] - cnt[b] / want[b])[0];
      if (r === 'food') {
        const f = bs.find((b) => b.type === 'farm' && built(b) && !taken.has(b.id));
        if (f) { out.push({ p, t: 'farm', units: [v.id], target: f.id }); taken.add(f.id); cnt.food++; continue; }
        if (cows.length) { out.push({ p, t: 'attack', units: [v.id], target: cows[v.id % cows.length].id }); cnt.food++; continue; } // забить корову
      }
      // нужного ресурса на карте нет (выработан) — берём следующий по нужде, а не стоим без дела
      const order = [r, ...RES.filter((x) => x !== r && x !== 'energy').sort((a, b) => (cnt[a] + 1) / (want[a] || 0.5) - (cnt[b] + 1) / (want[b] || 0.5))];
      for (const rr of order) {
        const tile = nearestRes(w, (v.x / TILE) | 0, (v.y / TILE) | 0, rr, p);
        if (tile >= 0) { out.push({ p, t: 'gather', units: [v.id], tile }); cnt[rr]++; break; }
      }
    }
    // Перебрасываем добытчиков с избыточного ресурса на дефицитный
    const tot = RES.reduce((s, r) => s + want[r], 0), gath = RES.reduce((s, r) => s + cnt[r], 0);
    let moves = this.level === 'easy' ? 0 : 2;
    for (const r of RES) {
      if (moves <= 0 || cnt[r] <= (gath * want[r]) / tot + 1.5) continue;
      const v = vills.find((v) => v.order.t === 'gather' && v.carryRes === r && v.carry < 3);
      const d = RES.filter((x) => want[x] > 0 && x !== r).sort((a, b) => cnt[a] / want[a] - cnt[b] / want[b])[0];
      if (!v || !d || d === 'food' && bs.some((b) => b.type === 'farm' && built(b) && !taken.has(b.id))) continue;
      const tile = nearestRes(w, (v.x / TILE) | 0, (v.y / TILE) | 0, d, p);
      if (tile >= 0) { out.push({ p, t: 'gather', units: [v.id], tile }); cnt[r]--; cnt[d]++; moves--; }
    }

    // ---------- 2. Оборона ----------
    const threats = foeArmy.filter((e) => bs.some((b) => distTo(e.x, e.y, b) < 12 * TILE));
    if (threats.length) {
      const t0 = threats.reduce((a, b) => (dH(b.x / TILE, b.y / TILE) < dH(a.x / TILE, a.y / TILE) ? b : a));
      const busy = new Set(threats.map((t) => t.id));
      const free = army.filter((u) => dH(u.x / TILE, u.y / TILE) < 30 && !(u.order.t === 'attack' && busy.has(u.order.target)));
      if (free.length) out.push({ p, t: 'attack', units: free.map((u) => u.id), target: t0.id });
      if (cfg.defendVills && threats.length <= 2 && army.length < 3) { // мелкий набег — отбиваемся жителями
        const near = vills.filter((v) => Math.hypot(v.x - t0.x, v.y - t0.y) < 10 * TILE).map((v) => v.id);
        if (near.length) out.push({ p, t: 'attack', units: near, target: t0.id });
      }
    }

    // ---------- 3. Стройка ----------
    if (this.gateTile >= 0) { // стена достроена — делаем ворота
      const g = w.ents.get(w.occ[this.gateTile]);
      if (g && g.kind === 'b' && g.owner === p && g.type === 'wall' && built(g)) { out.push({ p, t: 'convert', building: g.id, to: 'gate' }); this.gateTile = -1; }
    }
    const unfinished = bs.filter((b) => !built(b));
    const worker = vills.find((v) => v.order.t === 'gather' && !v.carry) ?? vills.find((v) => v.order.t !== 'build') ?? vills[0];
    if (unfinished.length && worker && !vills.some((v) => v.order.t === 'build')) out.push({ p, t: 'assist', units: [worker.id], target: unfinished[0].id });
    if (tc && worker && unfinished.length < (this.level === 'hard' ? 2 : 1)) {
      const cand: [string, [number, number]][] = [];
      const defTowers = bs.filter((b) => b.type === 'tower' && dH(b.tx, b.ty) < 10).length;
      if (P.popCap - P.pop <= (this.level === 'hard' ? 5 : 3) && P.popCap < 200 && !unfinished.some((b) => b.type === 'house')) cand.push(['house', home]);
      if (!has('camp') && vills.length >= 6) { const t = nearestRes(w, home[0], home[1], 'wood', p); if (t >= 0) cand.push(['camp', xy(w, t)]); }
      if (!has('barracks') && vills.length >= 8) cand.push(['barracks', home]);
      const pen = bs.find((b) => b.type === 'pasture' && built(b)); // поля — вокруг фермы
      if (!has('pasture') && vills.length >= 7) cand.push(['pasture', home]);
      // Поля: бесконечная еда. С Древней эпохи — треть жителей на полях; раньше — когда дикая еда у дома кончилась
      const wildFood = nearestRes(w, home[0], home[1], 'food', p), wildFar = wildFood < 0 || Math.hypot((wildFood % w.W) - home[0], ((wildFood / w.W) | 0) - home[1]) > 18;
      const farmsWant = P.age >= 1 ? Math.min(10, Math.floor(vills.length / 3)) : wildFar ? 3 : 0;
      if (pen && count('farm') < farmsWant) {
        const spot = fieldSpot(w, p);
        if (spot) cand.unshift(['farm', spot]); else if (count('pasture') < 3) cand.push(['pasture', home]); // у ферм нет места — ещё одна ферма
      }
      if (pen && !pen.queue.includes('#wheat') && pen.queue.length < 2 && afford(WHEAT_COST)) { // пшеница кончается — досеять
        let n = 0;
        for (let y = pen.ty - 3; y < pen.ty + 6; y++) for (let x = pen.tx - 3; x < pen.tx + 6; x++) { const i = x + y * w.W; if (x >= 0 && y >= 0 && x < w.W && y < w.H && w.resType[i] && w.resKind[i] === 2) n++; }
        if (n < 3) out.push({ p, t: 'sow', building: pen.id });
      }
      if (P.age >= 1) {
        if (defTowers < cfg.towers && foeHome) cand.push(['tower', [Math.round(home[0] + dir[0] * 6), Math.round(home[1] + dir[1] * 6)]]);
        for (const r of ['stone', 'iron', 'gold'] as Res[]) { // лагерь у дальних залежей
          const t = nearestRes(w, home[0], home[1], r, p);
          if (t < 0) continue;
          const [x, y] = xy(w, t);
          if (dH(x, y) > 8 && !bs.some((b) => (b.type === 'camp' || b.type === 'town_center') && Math.hypot(b.tx - x, b.ty - y) < 7)) cand.push(['camp', [x, y]]);
        }
        if (!has('archery')) cand.push(['archery', home]);
        if (!has('market') && vills.length >= 16) cand.push(['market', home]); // рынок: продавать излишки за золото
        const exp = bs.filter((b) => b.type === 'tower' && dH(b.tx, b.ty) >= 10).length;
        if (exp < cfg.expand && afford(BUILDINGS.tower.cost)) { const s = this.expansionSpot(w, home); if (s) cand.push(['tower', s]); }
        // Стена с воротами поперёк направления на врага
        if (cfg.walls && !this.walled && defTowers >= cfg.towers && P.res.stone >= 150 && foeHome) {
          this.walled = true;
          const cx = home[0] + dir[0] * 10, cy = home[1] + dir[1] * 10, tiles: number[] = [];
          let gate = -1;
          for (let k = -5; k <= 5; k++) {
            const x = Math.round(cx - dir[1] * k), y = Math.round(cy + dir[0] * k);
            if (x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
            if (k === 0) gate = x + y * w.W;
            if (!tiles.includes(x + y * w.W)) tiles.push(x + y * w.W);
          }
          out.push({ p, t: 'wall', units: [worker.id], tiles });
          this.gateTile = gate; // средний сегмент потом перестроим в ворота
        }
      }
      if (P.age >= 2) {
        if (!has('stable')) cand.push(['stable', home]);
        if (P.age >= 4 && count('power_plant') < (P.age >= 5 ? 4 : 2)) cand.push(['power_plant', home]);
        if (P.age >= 5 && !has('factory')) cand.push(['factory', home]);   // танки и зенитки
        if (P.age >= 5 && !has('airfield')) cand.push(['airfield', home]); // авиация
        if (P.age >= 7 && count('drone_hub') < 2) cand.push(['drone_hub', home]); // рой дронов // энергия для пулемётов и артиллерии
        if (this.level !== 'easy' && P.res.food > 700 && count('barracks') < 2) cand.push(['barracks', home]); // богатеем — второй поток войск
        if (!has('workshop') && (this.level === 'hard' || foeBs.filter((b) => b.type === 'tower').length >= 2)) cand.push(['workshop', home]);
      }
      const pick = cand.find(([t]) => afford(BUILDINGS[t].cost));
      if (pick) {
        const [type, at] = pick, s = type === 'farm' ? at : findSpot(w, at[0], at[1], BUILDINGS[type].size); // место поля уже проверено fieldSpot
        if (s) out.push({ p, t: 'build', units: [worker.id], type, tx: s[0], ty: s[1] });
      }
    }

    // ---------- 4. Жители, эпохи, исследования ----------
    // Копим на следующую эпоху (с Средневековой она дорогая): пока не хватает — без найма войск и исследований, если нет угрозы
    const nextAge = P.age < AGE_NAMES.length - 1 ? ageCost(P) : undefined;
    const saveAge = P.age >= 2 && !!nextAge && !P.ageing && vills.length >= 12 + 4 * P.age && !afford(nextAge) && !threats.length && army.length >= 10;
    if (tc && built(tc) && !P.ageing) {
      if (P.age < AGE_NAMES.length - 1 && vills.length >= 12 + 4 * P.age) out.push({ p, t: 'age', building: tc.id });
      else if (tc.queue.length < 2 && vills.length < cfg.vills + 5 * Math.max(0, P.age - 2) && afford(UNITS.villager.cost)) out.push({ p, t: 'train', building: tc.id, unit: 'villager' });
    }
    if (tc && built(tc) && this.level !== 'easy' && P.age >= TECHS.enlightenment.age && P.techs.length >= FINAL_REQ && !queuedTechs(w, p).length && afford(TECHS.enlightenment.cost))
      out.push({ p, t: 'research', building: tc.id, tech: 'enlightenment' }); // сам идёт к научной победе
    if (tc && built(tc) && vills.length >= 8 && !saveAge && !queuedTechs(w, p).length && slotsLeft(w, P) > 0) {
      const fav = this.fav;
      const opts = Object.entries(TECHS).filter(([id, t]) => t.age <= P.age && !t.final && !P.techs.includes(id) && afford(t.cost))
        .sort((a, b) => Number(b[1].branch === fav) - Number(a[1].branch === fav));
      if (opts.length) out.push({ p, t: 'research', building: tc.id, tech: opts[0][0] });
    }

    // ---------- 5. Армия с контрами ----------
    const foeCls: Record<string, number> = {};
    for (const c of this.mem.values()) foeCls[c] = (foeCls[c] ?? 0) + 1;
    const top = Object.entries(foeCls).sort((a, b) => b[1] - a[1])[0]?.[0];
    const counters = cfg.counters && top ? COUNTER[top] : [];
    const reserveIron = P.age >= 5 && (!has('factory') || !has('airfield')) && !threats.length; // копим железо на завод и аэродром
    if (vills.length >= 10 && !saveAge && (P.age > 0 || army.length < 5 || threats.length)) for (const b of bs) {
      if (!built(b) || b.queue.length >= 2 || b.type === 'town_center' || b.type === 'market') continue;
      const opts = (BUILDINGS[b.type].trains ?? []).filter((u) => UNITS[u].age <= P.age);
      if (!opts.length) continue;
      const ok = (o: string) => afford(UNITS[o].cost) && !(reserveIron && UNITS[o].cost.iron && P.res.iron < 350) && !(UNITS[o].cls === 'siege' && army.filter((u) => UNITS[u.type].cls === 'siege').length >= 4) && !(o === 'cow' && cows.length >= 3);
      const u = opts.find((o) => counters.includes(o) && ok(o)) ?? [...opts].reverse().find(ok); // контр, а если не по карману — что есть
      if (u) out.push({ p, t: 'train', building: b.id, unit: u });
    }

    // ---------- 5а. Упёрлись в лимит населения — распускаем устаревших (на две эпохи и старше), место — современным войскам ----------
    if (P.age >= 3 && P.pop >= P.popCap - 3 && P.popCap >= 150 && !threats.length) {
      const old = army.filter((u) => UNITS[u.type].age <= P.age - 2 && u.order.t === 'idle').sort((a, b) => UNITS[a.type].age - UNITS[b.type].age).slice(0, 5);
      if (old.length) out.push({ p, t: 'destroy', ids: old.map((u) => u.id) });
    }

    // ---------- 5б. Рынок: излишки → золото, когда оно нужно (эпоха, элитные войска) ----------
    const mk = bs.find((b) => b.type === 'market' && built(b));
    const noGold = nearestRes(w, home[0], home[1], 'gold', p) < 0; // жилы выработаны — золото только через рынок
    // Порядок: 1) железо, если его нет на карте, 2) огромные излишки → золото, 3) мало золота → продаём лишнее, 4) золота много → докупаем нехватку
    const noIron = nearestRes(w, home[0], home[1], 'iron', p) < 0;
    const glut = (['food', 'wood', 'stone', 'iron', 'energy'] as Res[]).find((r) => P.res[r] > (r === 'energy' ? 1000 : 2500));
    const deal = (res: Res, buy: boolean) => { if (mk && this.mkT++ % 2 === 0) out.push({ p, t: 'trade', building: mk.id, res, buy }); };
    // Копим на эпоху, а золота с запасом — докупаем недостающее (не залезая в золото, нужное самой эпохе)
    const lack = saveAge && nextAge ? (['food', 'wood', 'stone', 'iron', 'energy'] as Res[]).find((r) => P.res[r] < (nextAge[r] ?? 0)) : undefined;
    if (mk && lack && P.res.gold >= (P.prices[lack] ?? 999) + (nextAge?.gold ?? 0)) deal(lack, true);
    else if (mk && (noIron || P.age >= 4) && P.res.iron < 400 && P.res.gold >= (P.prices.iron ?? 999) + 50) deal('iron', true);
    else if (mk && glut) deal(glut, false);
    else if (mk && P.res.gold < (noGold || noIron ? 800 : 300)) {
      const r = (['food', 'wood', 'stone', 'iron'] as Res[]).filter((r) => P.res[r] > (noGold || noIron ? 500 : 900) && !(r === 'iron' && noIron)).sort((a, b) => P.res[b] - P.res[a])[0];
      if (r) deal(r, false);
    } else if (mk && P.res.gold > 700) {
      const r = (['iron', 'food', 'wood', 'stone'] as Res[]).filter((r) => P.res[r] < (r === 'iron' ? 400 : 250)).sort((a, b) => P.res[a] - P.res[b])[0];
      if (r && P.res.gold >= (P.prices[r] ?? 999) + 200) deal(r, true);
    }

    // ---------- 5в. Дипломатия (GDD §7): сила армий решает, мириться или воевать ----------
    this.diplomacy(w, out);

    // ---------- 6. Походы ----------
    if (threats.length || this.peaceful) return out;
    const idle = army.filter((u) => u.order.t === 'idle');
    const inField = army.filter((u) => dH(u.x / TILE, u.y / TILE) > 22 && (u.order.t === 'attack' || u.order.t === 'amove'));
    if (cfg.retreat && this.waveSize && inField.length < this.waveSize * 0.35) { // разбиты — отходим, копим силы
      if (inField.length) out.push({ p, t: 'move', units: inField.map((u) => u.id), x: home[0], y: home[1] + 3 });
      this.waveSize = 0;
      return out;
    }
    // Налёт конницей на жителей
    if (cfg.raid && foeVills.length) {
      const riders = idle.filter((u) => u.type === 'horseman' && dH(u.x / TILE, u.y / TILE) < 15);
      if (riders.length >= 4) {
        const v = foeVills.filter((v) => !foeTc || Math.hypot(v.x / TILE - foeHome![0], v.y / TILE - foeHome![1]) > 6)[0];
        if (v) { out.push({ p, t: 'attack', units: riders.map((u) => u.id), target: v.id }); return out; }
      }
    }
    // Цель: если враг держит земли — его опорные здания в регионах; иначе форпосты, потом столица
    const foeHold = w.holdBy >= 0 && !ally(w, w.holdBy, p);
    let target: Entity | null = null, bd = Infinity;
    const racer = w.goals.find((g) => !ally(w, g.p, p))?.p ?? -1; // кто-то идёт к мирной победе — бьём по его столице
    if (racer >= 0 && !foeHold) target = foeBs.find((b) => b.owner === racer && b.type === 'town_center') ?? null;
    if (!target) for (const b of foeBs) {
      const w8 = REGION_WEIGHT[b.type] ?? 1;
      if (foeHold && (b.owner !== w.holdBy || !w8 || w.regions[w.region[b.tx + b.ty * w.W]].owner !== w.holdBy)) continue;
      const pri = this.level === 'easy' ? 0 : b.type === 'town_center' ? 15 : w8 > 0 && b.type !== 'house' ? 0 : 8;
      const d = dH(b.tx, b.ty) + pri;
      if (d < bd) { bd = d; target = b; }
    }
    target ??= foeArmy[0] ?? foeVills[0] ?? null;
    const tgt = target ? (target.kind === 'b' ? [target.tx, target.ty] : [(target.x / TILE) | 0, (target.y / TILE) | 0]) : racer >= 0 || !foeTc ? scout : null;
    if (!tgt) return out; // врага не видно — идём на разведку к стартам
    const [tx, ty] = tgt;
    const ready = idle.length >= cfg.wave && (this.level === 'easy' || strength(army) > strength(foeArmy) * 1.2 || army.length >= 25);
    const urgent = (foeHold || racer >= 0) && army.length >= 5;
    if (ready || urgent) {
      const units = (urgent ? army.filter((u) => u.order.t !== 'attack') : idle).map((u) => u.id);
      if (units.length) { out.push({ p, t: 'amove', units, x: tx, y: ty }); this.waveSize = Math.max(this.waveSize, units.length); }
    } else if (this.waveSize && idle.length) { // дошедшие до цели и подкрепления — дальше в бой
      const go = idle.filter((u) => dH(u.x / TILE, u.y / TILE) > 22 || idle.length >= 4).map((u) => u.id);
      if (go.length) out.push({ p, t: 'amove', units: go, x: tx, y: ty });
    }
    return out;
  }
}
