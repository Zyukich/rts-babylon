// Механики симуляции: дипломатия, дань, авиация, урон по площади, пробитие брони, дроны, формации.
import { describe, it, expect } from 'vitest';
import { step, canHit } from '../game/core/sim/index.ts';
import { hit, attack } from '../game/core/sim/combat.ts';
import { relOf } from '../game/core/world.ts';
import { UNITS, TILE } from '../game/data/index.ts';
import { world, unit, unitsOf, tcOf, run } from './helpers.ts';

describe('дипломатия', () => {
  it('хуже — сразу, лучше — только по согласию обеих сторон', () => {
    const w = world(5);
    expect(relOf(w, 0, 1)).toBe(0); // на старте без команд — война
    step(w, [{ p: 0, t: 'diplo', to: 1, rel: 3 }]);
    expect(relOf(w, 0, 1)).toBe(0);
    expect(w.offers).toHaveLength(1);
    step(w, [{ p: 1, t: 'diplo', to: 0, rel: 3 }]);
    expect(relOf(w, 0, 1)).toBe(3);
    expect(relOf(w, 1, 0)).toBe(3);
    step(w, [{ p: 0, t: 'diplo', to: 1, rel: 0 }]);
    expect(relOf(w, 0, 1)).toBe(0);
  });
  it('союз — только из мира', () => {
    const w = world(5);
    step(w, [{ p: 0, t: 'diplo', to: 1, rel: 4 }, { p: 1, t: 'diplo', to: 0, rel: 4 }]);
    expect(relOf(w, 0, 1)).toBe(0);
  });
  it('дань: не врагу; союзнику/мирному — доходит', () => {
    const w = world(5), [a, b] = w.players;
    const food = [a.res.food, b.res.food];
    step(w, [{ p: 0, t: 'tribute', to: 1, res: 'food', amount: 100 }]);
    expect([a.res.food, b.res.food]).toEqual(food);
    step(w, [{ p: 0, t: 'diplo', to: 1, rel: 3 }, { p: 1, t: 'diplo', to: 0, rel: 3 }]);
    const f2 = [a.res.food, b.res.food];
    step(w, [{ p: 0, t: 'tribute', to: 1, res: 'food', amount: 100 }]);
    expect([a.res.food, b.res.food]).toEqual([f2[0] - 100, f2[1] + 100]);
  });
});

describe('бой', () => {
  it('авиацию бьют только те, кто умеет; зенитки не бьют пехоту', () => {
    const w = world(6), fighter = unit(w, 'fighter', 1), club = unit(w, 'clubman', 1);
    expect(canHit(UNITS.clubman, fighter)).toBe(false);
    expect(canHit(UNITS.archer, fighter)).toBe(true);
    expect(canHit(UNITS.aa_gun, fighter)).toBe(true);
    expect(canHit(UNITS.aa_gun, club)).toBe(false);
    expect(canHit(UNITS.bomber, fighter)).toBe(false);
    expect(canHit(UNITS.bomber, club)).toBe(true);
  });
  it('пробитие (pierce) игнорирует броню', () => {
    const w = world(6), t = unit(w, 'mech', 1), hp0 = t.hp;
    hit(w, { atk: 30 }, t, 0, false, t.x, t.y, false);
    const plain = hp0 - t.hp;
    hit(w, { atk: 30, pierce: true }, t, 0, false, t.x, t.y, false);
    expect(hp0 - plain - t.hp).toBe(30);
    expect(plain).toBe(30 - UNITS.mech.armor);
  });
  it('залп РСЗО задевает соседей цели, но не дальних', () => {
    const w = world(6), tc = tcOf(w, 1), x = tc.tx - 4, y = tc.ty - 4;
    const [a, b, c, far] = [[x, y], [x + 1, y], [x, y + 1], [x + 5, y + 5]].map(([i, j]) => unit(w, 'clubman', 1, i, j));
    const m = unit(w, 'mlrs', 0, x - 5, y);
    const hp = [a, b, c, far].map((u) => u.hp);
    m.cd = 0;
    attack(w, m, { t: 'attack', target: a.id });
    expect(a.hp).toBeLessThan(hp[0]);
    expect(b.hp).toBeLessThan(hp[1]);
    expect(c.hp).toBeLessThan(hp[2]);
    expect(far.hp).toBe(hp[3]);
  });
});

describe('экономика и армия', () => {
  it('дроны не занимают население', () => {
    const w = world(7), pop = w.players[0].pop;
    unit(w, 'drone', 0);
    expect(w.players[0].pop).toBe(pop);
    unit(w, 'clubman', 0);
    expect(w.players[0].pop).toBe(pop + 1);
  });
  it('формация «линия» расставляет отряд по разным клеткам у цели', () => {
    const w = world(8), tc = tcOf(w, 0);
    for (let i = 0; i < 8; i++) unit(w, 'clubman', 0);
    const ids = unitsOf(w, 0, 'clubman').map((u) => u.id), tx = Math.min(w.W - 10, tc.tx + 8), ty = tc.ty + 1;
    run(w, 400, [{ p: 0, t: 'move', units: ids, x: tx, y: ty, f: 1 }]);
    const us = unitsOf(w, 0, 'clubman'), tiles = new Set(us.map((u) => ((u.x / TILE) | 0) + ((u.y / TILE) | 0) * w.W));
    expect(tiles.size).toBeGreaterThanOrEqual(7);
    for (const u of us) expect(Math.hypot(u.x / TILE - tx, u.y / TILE - ty)).toBeLessThan(7);
  });
});
