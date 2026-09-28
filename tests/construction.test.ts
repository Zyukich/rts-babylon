// Стройка и ремонт: полоска здоровья идёт вместе с процентами, бонусы не «ранят» здания,
// строители переходят к следующей работе и не толпятся в одной точке.
import { describe, it, expect } from 'vitest';
import { step } from '../game/core/sim/index.ts';
import { maxHp, recalc } from '../game/core/civ.ts';
import { BUILDINGS, TILE } from '../game/data/index.ts';
import { world, building, unit, unitsOf, run } from './helpers.ts';

describe('стройка', () => {
  it('здоровье растёт ровно вместе с процентом готовности', () => {
    const w = world(21), b = building(w, 'barracks', 0, false), v = unitsOf(w, 0, 'villager')[0], t = BUILDINGS.barracks.time;
    step(w, [{ p: 0, t: 'assist', units: [v.id], target: b.id }]);
    let worst = 0;
    for (let i = 0; i < t * 3 && b.progress < t; i++) { step(w, []); worst = Math.max(worst, Math.abs(b.hp / maxHp(w, b) - b.progress / t)); }
    expect(b.progress).toBe(t);
    expect(b.hp).toBe(maxHp(w, b));
    expect(worst).toBeLessThan(0.02);
  });
  it('рост поселения и технологии на прочность не делают целые здания «повреждёнными»', () => {
    const w = world(21), P = w.players[0], b = building(w, 'barracks', 0, true);
    expect(b.hp).toBe(maxHp(w, b));
    P.settle = 2; recalc(P, w); // посёлок вырос — у зданий больше здоровья
    expect(maxHp(w, b)).toBeGreaterThan(BUILDINGS.barracks.hp);
    expect(b.hp).toBe(maxHp(w, b));
    b.hp -= 100; P.settle = 3; recalc(P, w); // урон сохраняется
    expect(maxHp(w, b) - b.hp).toBe(100);
  });
  it('достроив здание, рабочий идёт строить соседнее такое же', () => {
    const w = world(22), a = building(w, 'house', 0, false), b = building(w, 'house', 0, false), v = unitsOf(w, 0, 'villager')[0];
    run(w, 60 * 10, [{ p: 0, t: 'assist', units: [v.id], target: a.id }]);
    expect(a.progress).toBe(BUILDINGS.house.time);
    expect(b.progress).toBeGreaterThan(0);
  });
  it('починив здание, рабочий идёт чинить такое же рядом', () => {
    const w = world(22), a = building(w, 'house', 0, true), b = building(w, 'house', 0, true), v = unitsOf(w, 0, 'villager')[0];
    a.hp -= 60; b.hp -= 60;
    run(w, 60 * 10, [{ p: 0, t: 'assist', units: [v.id], target: a.id }]);
    expect(a.hp).toBe(maxHp(w, a));
    expect(b.hp).toBe(maxHp(w, b));
  });
  it('строители встают по разным сторонам, а не в одну точку', () => {
    const w = world(23), b = building(w, 'barracks', 0, false);
    for (let i = 0; i < 4; i++) unit(w, 'villager', 0);
    const vs = unitsOf(w, 0, 'villager');
    step(w, [{ p: 0, t: 'assist', units: vs.map((v) => v.id), target: b.id }]);
    for (let i = 0; i < 400 && b.progress < BUILDINGS.barracks.time * 0.6; i++) step(w, []); // середина стройки — все уже на местах
    const at = vs.filter((v) => v.order.t === 'build');
    let close = 0;
    for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) if (Math.hypot(at[i].x - at[j].x, at[i].y - at[j].y) < 0.3 * TILE) close++;
    expect(at.length).toBeGreaterThanOrEqual(5);
    expect(close).toBe(0);
  });
});
