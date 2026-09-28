// Случайные события (через общий ГПСЧ — у всех клиентов одинаковы)
import { RES } from '../../data/index.ts';
import { type World, type Unit, type Building, spawnUnit, walkable } from '../world.ts';
import { maxHp, chron, cultureLevel } from '../civ.ts';
import { isWorker } from './common.ts';

// Динамические события — детерминированы через общий ГПСЧ, у всех клиентов одинаковы
export function randomEvent(w: World) {
  const alive = w.players.filter((p) => p.alive);
  if (!alive.length) return;
  const P = alive[w.rng.int(alive.length)], k = w.rng.int(7);
  const tc = [...w.ents.values()].find((e): e is Building => e.kind === 'b' && e.owner === P.id && e.type === 'town_center');
  switch (k) {
    case 0: P.effects.drought = w.tick + 900; chron(w, -1, `Засуха в землях P${P.id}: урожай вдвое меньше 9 лет`); break;
    case 1: P.effects.harvest = w.tick + 900; chron(w, -1, `Урожайные годы у P${P.id}: еда добывается быстрее`); break;
    case 2: { // эпидемия; гражданская культура смягчает
      const vs = [...w.ents.values()].filter((e): e is Unit => e.kind === 'u' && e.owner === P.id && isWorker(e));
      const n = Math.min(vs.length, Math.max(1, Math.floor((vs.length * (12 - 3 * cultureLevel(P, 'civ'))) / 100)));
      for (let j = 0; j < n; j++) vs.splice(w.rng.int(vs.length), 1)[0].hp = 0;
      if (n) chron(w, -1, `Эпидемия у P${P.id}: погибло жителей — ${n}`);
      break;
    }
    case 3: { // новое месторождение вдали от столиц
      const r = w.rng.int(2) ? 'iron' : 'stone', ri = RES.indexOf(r) + 1;
      for (let tries = 0; tries < 60; tries++) {
        const x = 3 + w.rng.int(w.W - 6), y = 3 + w.rng.int(w.H - 6);
        if (!walkable(w, x + y * w.W) || [...w.ents.values()].some((e) => e.kind === 'b' && e.type === 'town_center' && (e.tx - x) ** 2 + (e.ty - y) ** 2 < 144)) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const i = x + dx + (y + dy) * w.W;
          if (walkable(w, i)) { w.resType[i] = ri; w.resAmt[i] = 300; }
        }
        chron(w, -1, `Открыто месторождение ${r === 'iron' ? 'железа' : 'камня'}: ${w.regions[w.region[x + y * w.W]].name}`);
        break;
      }
      break;
    }
    case 4: { // переселенцы
      let n = 0;
      if (tc) for (let j = 0; j < 3 && P.pop < P.popCap; j++) if (spawnUnit(w, 'villager', P.id, tc)) n++;
      if (n) chron(w, -1, `К P${P.id} пришли переселенцы: +${n}`);
      break;
    }
    case 5: { // землетрясение в случайном заселённом регионе
      const bs = [...w.ents.values()].filter((e): e is Building => e.kind === 'b');
      if (!bs.length) break;
      const c0 = bs[w.rng.int(bs.length)], reg = w.region[c0.tx + c0.ty * w.W];
      for (const b of bs) if (w.region[b.tx + b.ty * w.W] === reg) b.hp -= Math.floor(maxHp(w, b) / 4);
      chron(w, -1, `Землетрясение: ${w.regions[reg].name}`);
      break;
    }
    case 6: P.bonusSlots++; chron(w, -1, `Странствующий учёный у P${P.id}: +1 слот исследований`); break;
  }
}
