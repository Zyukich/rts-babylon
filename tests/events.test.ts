// События мира попадают в ленту HUD: у каждого есть вид (значок), у засухи/урожая — срок, у землетрясения и месторождения — место.
import { describe, it, expect } from 'vitest';
import { randomEvent } from '../game/core/sim/events.ts';
import { world } from './helpers.ts';

describe('события мира', () => {
  it('несут вид, место и срок действия', () => {
    const w = world(31);
    for (let i = 0; i < 60; i++) { w.tick += 50; randomEvent(w); }
    const ev = w.chron.filter((c) => c.p < 0);
    expect(ev.length).toBeGreaterThan(20);
    for (const c of ev) expect(c.kind, c.text).toBeTruthy();
    const kinds = new Set(ev.map((c) => c.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(5);
    for (const c of ev.filter((c) => c.kind === 'drought' || c.kind === 'harvest')) expect(c.until).toBeGreaterThan(c.tick);
    for (const c of ev.filter((c) => c.kind === 'quake' || c.kind === 'deposit')) {
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(w.W); expect(c.y).toBeLessThan(w.H);
    }
  });
});
