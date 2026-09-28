// Партия: мир, кто мы, боты, сеть, отправка команд, цвета и имена игроков.
import { createWorld } from '../core/world.ts';
import type { Command } from '../core/sim/index.ts';
import { Bot, type Level } from '../ai/bot.ts';
import { COLORS } from './settings.ts';
import type { GameOptions } from './context.ts';

export function useSession(opts: GameOptions) {
  const { net = null, start } = opts;
  const slots = start?.slots ?? [{ type: 'human', team: 0, color: 0 }, { type: 'normal', team: 0, color: 1 }];
  const ME = net ? net.you : Math.max(0, slots.findIndex((s) => s.type === 'human'));
  const size = net ? 100 : start?.size ?? 100;
  const w = createWorld(net ? net.seed : start?.seed ?? ((Math.random() * 1e9) | 0), net ? net.n : slots.length, size, size,
    net ? {} : { teams: slots.map((s) => s.team), startRes: start?.res, startAge: start?.age, popMax: start?.pop, events: start?.events, victory: start?.victory });
  const debug = !net && !!opts.debug;
  const bots = net ? [] : slots.map((s, i) => (s.type === 'human' ? (opts.autoplay ? new Bot(i, 'hard') : null) : new Bot(i, s.type as Level))).filter((b): b is Bot => !!b);
  if (debug) { w.debug = true; for (const b of bots) b.peaceful = true; }
  const colorIdx = (o: number) => (net ? o : slots[o]?.color ?? o) % 8;
  const pcol = (o: number) => COLORS[colorIdx(o)][1];
  const hex = (o: number) => '#' + pcol(o).map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
  const pending: Command[] = [];
  return {
    w, ME, net, bots, debug, pending,
    speed: net ? 1 : start?.speed ?? 1,
    fogMode: net ? 'normal' : start?.fog ?? 'normal',
    send: (c: Command) => { if (net) net.send(c); else pending.push(c); },
    colorIdx, pcol, hex,
    who: (n: number) => (net ? net.names[n] : n === ME ? 'Вы' : 'Бот') ?? `Игрок ${n + 1}`,
  };
}
