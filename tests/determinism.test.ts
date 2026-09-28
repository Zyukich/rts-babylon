// Lockstep держится на детерминизме: одинаковые команды → одинаковый мир у всех. Плюс фаззинг — мусорные команды не ломают инварианты.
import { describe, it, expect } from 'vitest';
import { createWorld, hash } from '../game/core/world.ts';
import { step, type Command } from '../game/core/sim/index.ts';
import { Bot, type Level } from '../game/ai/bot.ts';
import { UNITS, BUILDINGS, RES, TILE } from '../game/data/index.ts';
import { TECHS } from '../game/core/civ.ts';
import { botMatch } from './helpers.ts';

describe('детерминизм', () => {
  for (const seed of [42, 7]) it(`матч ботов (seed ${seed}) повторяется до бита`, () => {
    const a = botMatch(seed, 12000), b = botMatch(seed, 12000);
    expect(a.tick).toBeGreaterThan(3000);
    expect(hash(a)).toBe(hash(b));
  });
});

describe('фаззинг команд', () => {
  for (const seed of [1, 2]) it(`seed ${seed}: 4 бота + 3 случайные команды за тик — без падений и нарушений`, () => {
    let s = seed * 9973 + 7;
    const rnd = (n: number) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s % n; };
    const pick = <T>(a: readonly T[]) => a[rnd(a.length)];
    const N = 4, w = createWorld(seed, N, 100, 100, { startRes: 'high', events: true });
    const bots = w.players.map((P) => new Bot(P.id, pick(['easy', 'normal', 'hard'] as Level[])));
    const U = Object.keys(UNITS), B = Object.keys(BUILDINGS), TT = Object.keys(TECHS);
    const junk = () => pick([-1, 0, 1e9, NaN, 3.5, -99999, 1e15]);
    const randCmd = (): Command => {
      const p = rnd(N), ents = [...w.ents.values()], e = () => (rnd(5) ? pick(ents)?.id ?? 0 : junk()), ids = () => Array.from({ length: 1 + rnd(4) }, e);
      const xy = () => (rnd(6) ? rnd(100) : junk());
      const all: (() => Command)[] = [
        () => ({ p, t: pick(['move', 'amove'] as const), units: ids(), x: xy(), y: xy(), f: rnd(5) }),
        () => ({ p, t: pick(['attack', 'farm', 'assist'] as const), units: ids(), target: e() }),
        () => ({ p, t: 'gather', units: ids(), tile: rnd(10000) }),
        () => ({ p, t: 'build', units: ids(), type: pick(B), tx: xy(), ty: xy() }),
        () => ({ p, t: 'train', building: e(), unit: pick(U) }),
        () => ({ p, t: pick(['age', 'sow'] as const), building: e() }),
        () => ({ p, t: 'rally', building: e(), x: xy(), y: xy() }),
        () => ({ p, t: 'research', building: e(), tech: pick(TT) }),
        () => ({ p, t: 'wall', units: ids(), tiles: Array.from({ length: rnd(10) }, () => rnd(10000)) }),
        () => ({ p, t: 'cancel', building: e(), index: rnd(6) - 1 }),
        () => { const id = e(); return { p, t: 'destroy', ids: [id, id, ...ids()] }; },
        () => ({ p, t: 'convert', building: e(), to: pick(['gate', 'tower', 'house']) }),
        () => ({ p, t: 'gate', building: e(), open: !!rnd(2) }),
        () => ({ p, t: 'stop', units: ids() }),
        () => ({ p, t: 'trade', building: e(), res: pick([...RES, 'x']), buy: !!rnd(2) }),
        () => ({ p, t: 'route', units: ids(), target: e() }),
        () => ({ p, t: 'diplo', to: rnd(N + 1), rel: rnd(6) }),
        () => ({ p, t: 'tribute', to: rnd(N), res: pick(RES), amount: pick([100, 500, 7]) }),
      ];
      return pick(all)();
    };
    const problems = new Set<string>();
    for (let tick = 0; tick < 4000 && w.winner < 0; tick++) {
      const cmds = bots.flatMap((b) => b.think(w));
      for (let k = 0; k < 3; k++) cmds.push(randCmd());
      step(w, cmds);
      if (tick % 50) continue;
      for (const P of w.players) {
        for (const r of RES) if (!(P.res[r] >= 0) || !Number.isInteger(P.res[r])) problems.add(`ресурс ${r} у P${P.id} = ${P.res[r]}`);
        const real = [...w.ents.values()].filter((e) => e.kind === 'u' && e.owner === P.id && !UNITS[e.type].animal && !UNITS[e.type].noPop).length;
        if (real !== P.pop) problems.add(`население P${P.id}: счётчик ${P.pop}, реально ${real}`);
      }
      for (const e of w.ents.values()) if (e.kind === 'u' && !(e.x >= 0 && e.y >= 0 && e.x <= w.W * TILE && e.y <= w.H * TILE)) problems.add(`юнит ${e.type} вне карты: ${e.x},${e.y}`);
    }
    expect([...problems]).toEqual([]);
  });
});
