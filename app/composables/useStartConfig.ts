// Параметры одиночной партии: форма в /setup, запуск — /play. Последние параметры помнятся между визитами.
import type { StartCfg, Slot } from '~~/game/client/settings.ts';

export type SetupForm = Omit<StartCfg, 'slots'> & { all: Slot[] };
const LAST = 'epohi-lastgame', CURRENT = 'epohi-start';

export const defaultSetup = (): SetupForm => ({
  size: 100, seed: 0, res: 'std', age: 0, pop: 200, speed: 1, fog: 'normal', events: true, victory: { terr: true, eco: true, cult: true, sci: true },
  all: [{ type: 'human', team: 0, color: 0 }, { type: 'normal', team: 0, color: 1 }, ...[2, 3, 4, 5, 6, 7].map((c) => ({ type: 'closed', team: 0, color: c }) as Slot)],
});

export function loadSetup(): SetupForm {
  try {
    const s = JSON.parse(localStorage.getItem(LAST) ?? 'null');
    return s && Array.isArray(s.all) ? { ...defaultSetup(), ...s } : defaultSetup();
  } catch { return defaultSetup(); }
}

/** Проверить форму; вернуть текст ошибки или сохранить и подготовить партию */
export function commitSetup(f: SetupForm): string {
  const open = f.all.filter((s) => s.type !== 'closed');
  const humans = open.filter((s) => s.type === 'human').length;
  const sides = new Set(open.map((s, i) => (s.team ? 'T' + s.team : 'S' + i)));
  if (humans !== 1) return 'Нужен ровно один игрок «Вы».';
  if (open.length < 2) return 'Нужно хотя бы два участника.';
  if (sides.size < 2) return 'Все в одной команде — не с кем воевать.';
  localStorage.setItem(LAST, JSON.stringify(f));
  const { all: _, ...rest } = f;
  const cfg: StartCfg = { ...rest, slots: open, seed: f.seed || 1 + ((Math.random() * 1e9) | 0) };
  sessionStorage.setItem(CURRENT, JSON.stringify(cfg));
  return '';
}

/** Параметры текущей партии (null — открыли /play напрямую: вы против среднего бота) */
export function currentStart(): StartCfg | null {
  try { return JSON.parse(sessionStorage.getItem(CURRENT) ?? 'null'); } catch { return null; }
}
