// Headless-матч: два бота, без графики. Запуск: npm run demo
import { createWorld, hash, type World } from '../game/core/world.ts';
import { step, fmt, type Command } from '../game/core/sim/index.ts';
import { Bot, type Level } from '../game/ai/bot.ts';
import { AGE_NAMES, UNITS } from '../game/data/index.ts';

function report(w: World) {
  console.log(`— ${fmt(w.tick)} —`);
  for (const P of w.players) {
    let v = 0, a = 0, b = 0;
    for (const e of w.ents.values()) if (e.owner === P.id) {
      if (e.kind === 'b') b++; else if (UNITS[e.type].cls === 'worker') v++; else a++;
    }
    const r = P.res;
    console.log(`  P${P.id} ${AGE_NAMES[P.age].padEnd(13)} еда ${r.food} дер ${r.wood} кам ${r.stone} жел ${r.iron} зол ${r.gold} эн ${r.energy} | нас ${P.pop}/${P.popCap} жит ${v} войск ${a} зданий ${b}`);
  }
}

function run(seed: number, maxTicks: number, verbose: boolean) {
  const w = createWorld(seed, 2);
  const lv = [process.argv[3] ?? 'normal', process.argv[4] ?? 'normal'] as Level[];
  const bots = w.players.map((p) => new Bot(p.id, lv[p.id]));
  while (w.tick < maxTicks && w.winner < 0) {
    const cmds: Command[] = bots.flatMap((b) => b.think(w));
    step(w, cmds);
    if (verbose && w.tick % 1800 === 0) report(w); // каждые 3 минуты
  }
  return w;
}

const seed = Number(process.argv[2] ?? 42), MAX = 30 * 60 * 10; // до 30 игровых минут
const t0 = performance.now();
const w1 = run(seed, MAX, true);
const ms = performance.now() - t0;
w1.log.forEach((l) => console.log(l));
console.log(`Итог ${fmt(w1.tick)}: ${w1.winner < 0 ? 'ничья' : 'победил P' + w1.winner} | симуляция заняла ${ms.toFixed(0)} мс`);
import('../game/core/civ.ts').then(({ identity, year, TECHS }) => {
  for (const P of w1.players) console.log(`P${P.id}: ${identity(P)} культура`, P.culture, 'технологии:', P.techs.map((t) => TECHS[t].name).join(', '));
  console.log('Регионы:', w1.regions.map((r) => `${r.name}${r.owner >= 0 ? ' [P' + r.owner + ']' : ''}`).join(', '));
  console.log('Хроника P0:'); w1.chron.filter((c) => c.p === 0 || c.p < 0).forEach((c) => console.log(`  Год ${year(c.tick)} — ${c.text}`));
});
const w2 = run(seed, MAX, false);
console.log(`Детерминизм: ${hash(w1)} / ${hash(w2)} → ${hash(w1) === hash(w2) ? 'OK' : 'РАССИНХРОН!'}`);
if (hash(w1) !== hash(w2)) process.exitCode = 1; // для CI: рассинхрон — провал
