// Дипломатия бота (GDD §7): сила армий решает, мириться или воевать
import { UNITS } from '../data/index.ts';
import { type World, ally, atWar, relOf } from '../core/world.ts';
import type { Command } from '../core/sim/index.ts';
import type { Bot } from './bot.ts';

export function botDiplomacy(bot: Bot, w: World, out: Command[]) {
  const p = bot.p, n = w.players.length, str = new Array(n).fill(0);
  for (const e of w.ents.values()) if (e.kind === 'u' && !['worker', 'trade', 'animal'].includes(UNITS[e.type].cls)) str[e.owner] += e.hp * UNITS[e.type].atk;
  const alive = w.players.filter((q) => q.alive).map((q) => q.id), me = str[p] + 1;
  const wars = alive.filter((q) => atWar(w, p, q));
  for (const o of w.offers) if (o.to === p) { // ответы на предложения
    const them = str[o.from] + 1, cur = relOf(w, p, o.from);
    const common = alive.some((q) => q !== p && q !== o.from && atWar(w, p, q) && atWar(w, o.from, q)); // общий враг
    const yes = o.rel === 4 ? cur === 3 && alive.length >= 3 && common // союз в партии на двоих — это общая победа, не соглашаемся
      : bot.peaceful || (me < 600 && them < 600) || me < them * (bot.level === 'hard' ? 1.1 : bot.level === 'normal' ? 1.5 : 3) || wars.some((q) => q !== o.from && str[q] > me * 0.7); // в начале партии мир принимают все
    if (yes) out.push({ p, t: 'diplo', to: o.from, rel: o.rel });
  }
  for (const q of alive) {
    if (q === p || ally(w, p, q)) continue;
    const them = str[q] + 1, cur = relOf(w, p, q), since = w.tick - w.relT[p * n + q];
    // проигрываем войну — просим мира (не чаще раза в 3 минуты)
    if (cur === 0 && me < them * 0.6 && w.tick - bot.dipT > 1800 && !w.offers.some((o) => o.from === p && o.to === q)) { out.push({ p, t: 'diplo', to: q, rel: 3 }); bot.dipT = w.tick; }
    // окрепли — мир нарушаем (не раньше чем через 4 минуты), нейтралитет — тем более
    if (!bot.peaceful && bot.level !== 'easy' && cur >= 1 && cur <= 3 && since > 2400 && me > them * (cur === 3 ? 2.5 : 1.5)) out.push({ p, t: 'diplo', to: q, rel: 0 });
  }
}
