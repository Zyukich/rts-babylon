// Победа: регионы и территория, мирные пути (экономика, культура, наука)
import { RES, REGION_WEIGHT, TERR_SHARE, TERR_HOLD, CULT_TARGET, GOAL_HOLD, WIN_NAMES } from '../../data/index.ts';
import { type World, type Building, type Goal } from '../world.ts';
import { researchTime, chron, addCulture, BRANCHES } from '../civ.ts';
import { done } from './common.ts';

// ---------- Главный шаг: мир(t) + команды → мир(t+1) ----------
export function win(w: World, p: number, kind: string) {
  if (w.winner >= 0) return;
  w.winner = p; w.winKind = kind;
  chron(w, -1, `${WIN_NAMES[kind]} победа: P${p}`);
}

// Гонки к победе без войны: удержать богатство / культуру, или доизучить «Просвещение». Видны всем — есть время помешать.
export const GOAL_NAME = { eco: 'экономической', cult: 'культурной', sci: 'научной' };

export function updGoals(w: World) {
  for (const P of w.players) {
    if (!P.alive) continue;
    let hasTc = false, sci: Building | null = null;
    for (const e of w.ents.values()) if (e.kind === 'b' && e.owner === P.id && e.type === 'town_center') {
      hasTc = true;
      if (e.queue[0] === '@enlightenment') sci = e;
    }
    const on = {
      eco: w.victory.eco && RES.reduce((s, r) => s + P.res[r], 0) >= w.ecoTarget,
      cult: w.victory.cult && hasTc && BRANCHES.reduce((s, b) => s + P.culture[b], 0) >= CULT_TARGET,
      sci: !!sci && w.victory.sci,
    };
    for (const k of ['eco', 'cult', 'sci'] as Goal['kind'][]) {
      const i = w.goals.findIndex((g) => g.p === P.id && g.kind === k);
      if (on[k] && i < 0) {
        w.goals.push({ kind: k, p: P.id, t: 0, need: k === 'sci' ? researchTime(P, 'enlightenment') : GOAL_HOLD[k] });
        chron(w, -1, `P${P.id} идёт к ${GOAL_NAME[k]} победе`);
      } else if (!on[k] && i >= 0) {
        w.goals.splice(i, 1);
        chron(w, -1, `Путь P${P.id} к ${GOAL_NAME[k]} победе прерван`);
      } else if (i >= 0) {
        const g = w.goals[i];
        g.t = k === 'sci' ? sci!.qt : g.t + 10;
        if (k !== 'sci' && g.t >= g.need) win(w, P.id, k);
      }
    }
  }
}

// Влияние в регионе = сумма весов готовых зданий. Лидер без ничьей — владелец (при ничьей текущий сохраняет).
export function updRegions(w: World) {
  const score = w.regions.map(() => new Array<number>(w.players.length).fill(0));
  for (const e of w.ents.values()) if (e.kind === 'b' && done(e)) score[w.region[e.tx + e.ty * w.W]][e.owner] += REGION_WEIGHT[e.type] ?? 1;
  w.regions.forEach((r, k) => {
    const s = score[k];
    let best = -1, bs = 0, tie = false;
    s.forEach((v, p) => { if (v > bs) { bs = v; best = p; tie = false; } else if (v === bs && v > 0) tie = true; });
    const next = tie ? (r.owner >= 0 && s[r.owner] === bs ? r.owner : -1) : best;
    if (next === r.owner) return;
    if (r.owner >= 0) chron(w, r.owner, `Потерян регион: ${r.name}`);
    if (next >= 0) { chron(w, next, `Под контролем: ${r.name}`); addCulture(w, w.players[next], 'civ', 3); }
    r.owner = next;
  });
  // Территориальная победа
  const need = Math.ceil((w.regions.length * TERR_SHARE) / 100), cnt = new Map<number, number>();
  for (const r of w.regions) if (r.owner >= 0) cnt.set(r.owner, (cnt.get(r.owner) ?? 0) + 1);
  let holder = -1;
  for (const [p, n] of cnt) if (n >= need) holder = p;
  if (holder !== w.holdBy) { w.holdBy = holder; w.holdT = 0; if (holder >= 0) chron(w, holder, 'Начато удержание территорий'); }
  else if (holder >= 0 && (w.holdT += 10) >= TERR_HOLD && w.winner < 0 && w.victory.terr) { win(w, holder, 'terr'); }
}
