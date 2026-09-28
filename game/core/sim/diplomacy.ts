// Дипломатия: смена отношений (симметрично) с записью в хронику
import { type World } from '../world.ts';
import { chron } from '../civ.ts';

// Отношения симметричны; каждое изменение — в хронику (GDD §13)
export const REL_EVENT = ['объявил войну', 'объявил вражду', 'перешёл к нейтралитету с', 'заключил мир с', 'заключил союз с'];

export const RES_WORD: Record<string, string> = { food: 'еды', wood: 'дерева', stone: 'камня', iron: 'железа', gold: 'золота', energy: 'энергии' };

export function setRel(w: World, a: number, b: number, r: number) {
  const n = w.players.length, was = w.rel[a * n + b];
  if (was === r) return;
  w.rel[a * n + b] = w.rel[b * n + a] = r;
  w.relT[a * n + b] = w.relT[b * n + a] = w.tick;
  chron(w, -1, was === 4 && r < 4 ? `P${a} разорвал союз с P${b}` : was === 3 && r < 3 ? `P${a} нарушил мир с P${b}${r === 0 ? ' и объявил войну' : ''}` : r === 0 ? `P${a} объявил войну P${b}` : `P${a} ${REL_EVENT[r]} P${b}`);
}
