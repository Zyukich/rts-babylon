// Игровые данные и каталог ассетов согласованы: опечатка в id ловится тестом, а не в игре.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import catalog from '../assets/catalog.json' with { type: 'json' };
import { UNITS, BUILDINGS, TECHS, AGE_NAMES } from '../game/data/index.ts';

const keys = (o: object) => Object.keys(o).filter((k) => !k.startsWith('$'));

describe('game/data', () => {
  it('загружается и прошла встроенную проверку', () => {
    expect(keys(UNITS).length).toBeGreaterThan(20);
    expect(keys(BUILDINGS).length).toBeGreaterThan(10);
    expect(keys(TECHS).length).toBeGreaterThan(10);
    expect(AGE_NAMES).toHaveLength(8);
  });
  it('каждого юнита (кроме скота) можно где-то обучить', () => {
    const trained = new Set(Object.values(BUILDINGS).flatMap((b) => b.trains ?? []));
    for (const [id, u] of Object.entries(UNITS)) if (!u.animal && id !== 'villager') expect(trained.has(id), id).toBe(true);
  });
});

describe('assets/catalog.json', () => {
  it('знает все юниты и здания и не ссылается на несуществующие', () => {
    expect(keys(catalog.units).sort()).toEqual(keys(UNITS).sort());
    expect(keys(catalog.buildings).sort()).toEqual(keys(BUILDINGS).sort());
  });
  it('анимации — только из известного списка', () => {
    const ok = ['idle', 'walk', 'attack', 'shoot', 'work', 'die'];
    for (const [id, u] of Object.entries(catalog.units)) if (typeof u === 'object' && 'anims' in u) for (const k of Object.keys(u.anims)) expect(ok, `${id}.${k}`).toContain(k);
  });
  it('сборщик ассетов не находит ошибок', () => {
    expect(() => execFileSync('node', ['scripts/assets/build.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
