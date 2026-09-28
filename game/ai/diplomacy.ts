// Дипломатия бота (GDD §7): сила армий решает, мириться или воевать
import { UNITS, AI_DIPLO as D } from '../data/index.ts';
import { type World, ally, atWar, relOf } from '../core/world.ts';
import type { Command } from '../core/sim/index.ts';
import type { Bot } from './bot.ts';

export function botDiplomacy(bot: Bot, w: World, out: Command[]) {
  const p = bot.p, n = w.players.length, str = new Array(n).fill(0);
  for (const e of w.ents.values()) if (e.kind === 'u' && !['worker', 'trade', 'animal'].includes(UNITS[e.type].cls)) str[e.owner] += e.hp * UNITS[e.type].atk;
  const alive = w.players.filter((q) => q.alive).map((q) => q.id), me = str[p] + 1;
  const wars = alive.filter((q) => atWar(w, p, q));
  // близок к мирной победе (идёт отсчёт) — его надо остановить
  const leader = (q: number) => D.attackLeader && (w.holdBy === q || w.goals.some((g) => g.p === q));
  for (const o of w.offers) if (o.to === p) { // ответы на предложения
    const them = str[o.from] + 1, cur = relOf(w, p, o.from);
    const common = alive.some((q) => q !== p && q !== o.from && atWar(w, p, q) && atWar(w, o.from, q)); // общий враг
    const yes = o.rel === 4 ? cur === 3 && alive.length >= 3 && common // союз в партии на двоих — это общая победа, не соглашаемся
      : bot.peaceful || (me < D.minArmy && them < D.minArmy && !leader(o.from)) || me < them * (bot.level === 'hard' ? 1.1 : bot.level === 'normal' ? 1.5 : 3) || wars.some((q) => q !== o.from && str[q] > me * 0.7); // в начале партии мир принимают все, кроме лидера гонки
    if (yes) out.push({ p, t: 'diplo', to: o.from, rel: o.rel });
  }
  for (const q of alive) {
    if (q === p || ally(w, p, q)) continue;
    const them = str[q] + 1, cur = relOf(w, p, q), since = w.tick - w.relT[p * n + q];
    // проигрываем войну — просим мира (не чаще раза в 3 минуты); пока армий нет — воевать нечем, мира не просим
    if (cur === 0 && them > D.minArmy && me < them * D.askPeace && !leader(q) && w.tick - bot.dipT > 1800 && !w.offers.some((o) => o.from === p && o.to === q)) { out.push({ p, t: 'diplo', to: q, rel: 3 }); bot.dipT = w.tick; }
    // окрепли — мир нарушаем (не раньше minPeace), воинственный характер — охотнее; лидера гонки — останавливаем
    if (bot.peaceful || bot.level === 'easy' || cur < 1 || cur > 3) continue;
    const k = D.breakPeace[bot.fav] ?? 1.7;
    if ((since > D.minPeace && me > them * (cur === 3 ? k : k * 0.8)) || (leader(q) && me > them * 0.8)) out.push({ p, t: 'diplo', to: q, rel: 0 });
  }
}
