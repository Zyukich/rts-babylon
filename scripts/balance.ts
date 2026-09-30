// Статистика баланса: много матчей ботов без графики → сводка по победам, эпохам, юнитам, технологиям.
//   npm run balance                 стандартный набор (~40 матчей, параллельно по ядрам)
//   npm run balance -- --quick      быстрый прогон (~12 матчей)
//   npm run balance -- --json out.json   сохранить сырые данные
// Числа правятся в game/data/*.json; этот отчёт показывает, что перекошено.
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { createWorld, type World, type Entity } from '../game/core/world.ts';
import { step } from '../game/core/sim/index.ts';
import { Bot, type Level } from '../game/ai/bot.ts';
import { UNITS, AGE_NAMES, RES, TECHS, WIN_NAMES, AI_PERSONALITIES, type Cost } from '../game/data/index.ts';

interface Job { seed: number; levels: Level[]; size: number }
interface PlayerStat {
  level: Level; fav: string; won: boolean; alive: boolean; ages: number[]; settle: number[]; techs: string[];
  trained: Record<string, number>; lost: Record<string, number>; killed: Record<string, number>; // killed: тип жертвы → сколько убил этот игрок
  killsBy: Record<string, number>; // тип убийцы → сколько он убил (урон по чужим)
  gathered: number; maxPop: number;
}
interface Result { job: Job; ticks: number; winner: number; winKind: string; players: PlayerStat[]; deaths: number[]; peaceAt: number; warAtEnd: boolean; res: Record<string, number>[] }

const MAX_TICKS = 40 * 60 * 10; // 40 игровых минут — дальше ничья

function play(job: Job): Result {
  const w: World = createWorld(job.seed, job.levels.length, job.size, job.size);
  const favs = w.players.map((p) => AI_PERSONALITIES[(job.seed + p.id) % AI_PERSONALITIES.length]); // характеры — по кругу, а не по номеру игрока
  const bots = w.players.map((p) => new Bot(p.id, job.levels[p.id], favs[p.id]));
  const ps: PlayerStat[] = w.players.map((p) => ({ level: job.levels[p.id], fav: favs[p.id], won: false, alive: true, ages: [0], settle: [0], techs: [], trained: {}, lost: {}, killed: {}, killsBy: {}, gathered: 0, maxPop: 0 }));
  let known = new Map<number, Entity>(w.ents);
  const lastHitter = new Map<number, string>(); // id жертвы → тип юнита, ударившего последним
  const deaths: number[] = []; // боевые потери по 5-минуткам
  let peaceAt = -1;
  const res: Record<string, number>[] = []; // запасы игрока 0 каждые 5 минут
  while (w.tick < MAX_TICKS && w.winner < 0) {
    step(w, bots.flatMap((b) => b.think(w)));
    const now = new Map<number, Entity>(w.ents);
    for (const [id, e] of now) if (!known.has(id) && e.kind === 'u' && !UNITS[e.type].animal) ps[e.owner].trained[e.type] = (ps[e.owner].trained[e.type] ?? 0) + 1;
    for (const [id, e] of known) if (!now.has(id) && e.kind === 'u' && !UNITS[e.type].animal) {
      const by = e.lastBy;
      if (by === undefined || by === e.owner || by < 0) continue; // распущен своими — не потеря в бою
      ps[e.owner].lost[e.type] = (ps[e.owner].lost[e.type] ?? 0) + 1;
      const b5 = Math.floor(w.tick / 3000); deaths[b5] = (deaths[b5] ?? 0) + 1;
      ps[by].killed[e.type] = (ps[by].killed[e.type] ?? 0) + 1;
      const k = lastHitter.get(id);
      if (k) ps[by].killsBy[k] = (ps[by].killsBy[k] ?? 0) + 1;
    }
    // кто по кому бьёт: юнит в атаке рядом с целью — последний «ударивший» по типу
    for (const e of w.ents.values()) if (e.kind === 'u' && e.order.t === 'attack' && e.cd === UNITS[e.type].cd) lastHitter.set(e.order.target, e.type);
    known = now;
    if (peaceAt < 0 && w.players.length === 2 && w.rel[1] >= 2) peaceAt = w.tick; // дуэль: перемирие или мир
    if (w.tick % 3000 === 0) res.push({ ...w.players[0].res });
    for (const P of w.players) {
      const s = ps[P.id];
      if (P.age >= s.ages.length) s.ages.push(w.tick);
      if (P.settle >= s.settle.length) s.settle.push(w.tick);
      s.maxPop = Math.max(s.maxPop, P.pop);
    }
  }
  for (const P of w.players) {
    const s = ps[P.id];
    s.alive = P.alive; s.techs = [...P.techs]; s.gathered = P.stats.gathered;
    s.won = w.winner >= 0 && (w.winner === P.id || w.teams[P.id] > 0 && w.teams[P.id] === w.teams[w.winner]);
  }
  return { job, ticks: w.tick, winner: w.winner, winKind: w.winKind, players: ps, deaths, peaceAt, warAtEnd: w.players.length === 2 && w.rel[1] === 0, res };
}

// ---------- Набор матчей ----------
function jobs(quick: boolean): Job[] {
  const out: Job[] = [], seeds = (n: number, from: number) => Array.from({ length: n }, (_, i) => from + i * 7919);
  const add = (n: number, levels: Level[], from: number, size = 100) => { for (const s of seeds(n, from)) out.push({ seed: s, levels, size }); };
  const k = quick ? 1 : 3;
  add(4 * k, ['normal', 'normal'], 11);
  add(3 * k, ['hard', 'hard'], 23);
  add(2 * k, ['hard', 'normal'], 37);
  add(2 * k, ['normal', 'hard'], 41); // та же пара наоборот — проверка стартовых позиций
  add(2 * k, ['easy', 'normal'], 53);
  add(2 * k, ['normal', 'easy'], 59);
  if (!quick) add(2, ['hard', 'hard', 'hard', 'hard'], 67, 128);
  return out;
}

// ---------- Сводка ----------
const min = (t: number) => (t / 600).toFixed(1);
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const costOf = (c: Cost) => RES.reduce((s, r) => s + (c[r] ?? 0), 0);
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);

function report(rs: Result[]) {
  const L: string[] = [], line = (s = '') => L.push(s);
  line(`# Баланс: ${rs.length} матчей ботов`);
  line();
  const wins: Record<string, number> = {}, draws = rs.filter((r) => r.winner < 0).length;
  for (const r of rs) if (r.winner >= 0) wins[r.winKind] = (wins[r.winKind] ?? 0) + 1;
  line(`## Исход`);
  line(`Средняя длина: ${min(avg(rs.map((r) => r.ticks)))} мин · ничьих (${MAX_TICKS / 600} мин без победы): ${draws} (${pct(draws, rs.length)})`);
  line(`Типы побед: ${Object.entries(wins).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${WIN_NAMES[k] ?? k} ${n} (${pct(n, rs.length)})`).join(' · ') || '—'}`);
  const byKind: Record<string, number[]> = {};
  for (const r of rs) if (r.winner >= 0) (byKind[r.winKind] ??= []).push(r.ticks);
  line(`Когда наступают: ${Object.entries(byKind).map(([k, t]) => `${WIN_NAMES[k] ?? k} ~${min(avg(t))} мин`).join(' · ')}`);
  line();
  const d5: number[] = [];
  for (const r of rs) r.deaths.forEach((n, i) => { d5[i] = (d5[i] ?? 0) + (n ?? 0); });
  line(`Боевые потери по 5 минутам (все матчи): ${Array.from(d5, (n, i) => `${i * 5}–${i * 5 + 5}: ${n ?? 0}`).join(' · ')}`);
  const du = rs.filter((r) => r.players.length === 2), peace = du.filter((r) => r.peaceAt >= 0);
  line(`Дуэли с перемирием/миром: ${peace.length}/${du.length}${peace.length ? `, в среднем на ${min(avg(peace.map((r) => r.peaceAt)))} мин` : ''} · война к концу: ${du.filter((r) => r.warAtEnd).length}/${du.length}`);
  const r5: Record<string, number[]>[] = [];
  for (const r of rs) r.res.forEach((x, i) => { r5[i] ??= {}; for (const [k, v] of Object.entries(x)) (r5[i][k] ??= []).push(v); });
  line(`Запасы P0 по 5 минутам: ${r5.slice(0, 7).map((x, i) => `${i * 5} мин: ${RES.map((k) => `${k[0]}${Math.round(avg(x[k] ?? []))}`).join(' ')}`).join(' | ')}`);
  line();
  line(`## Уровни ботов (дуэли)`);
  const duel = rs.filter((r) => r.players.length === 2);
  const pair = (a: Level, b: Level) => duel.filter((r) => r.players[0].level === a && r.players[1].level === b || r.players[0].level === b && r.players[1].level === a);
  for (const [a, b] of [['hard', 'normal'], ['normal', 'easy']] as [Level, Level][]) {
    const ms = pair(a, b), wa = ms.filter((r) => r.players.find((p) => p.level === a)!.won).length, wb = ms.filter((r) => r.players.find((p) => p.level === b)!.won).length;
    line(`${a} против ${b}: ${wa}:${wb} (ничьих ${ms.length - wa - wb})`);
  }
  const mirror = duel.filter((r) => r.players[0].level === r.players[1].level);
  const p0 = mirror.filter((r) => r.players[0].won).length, p1 = mirror.filter((r) => r.players[1].won).length;
  line(`Позиция на карте (зеркальные матчи): P0 ${p0} : P1 ${p1}`);
  const favs = [...new Set(rs.flatMap((r) => r.players.map((p) => p.fav)))];
  line(`Характеры (доля побед): ${favs.map((f) => { const ps = rs.flatMap((r) => r.players).filter((p) => p.fav === f); return `${f} ${pct(ps.filter((p) => p.won).length, ps.length)}`; }).join(' · ')}`);
  line();
  line(`## Эпохи (среднее время перехода, доля дошедших)`);
  const all = rs.flatMap((r) => r.players);
  const ageRow: string[] = [];
  for (let a = 1; a < AGE_NAMES.length; a++) {
    const t = all.map((p) => p.ages[a]).filter((x) => x !== undefined);
    ageRow.push(`${AGE_NAMES[a]}: ${t.length ? min(avg(t)) + ' мин' : '—'} (${pct(t.length, all.length)})`);
  }
  ageRow.forEach((s) => line('- ' + s));
  line();
  line(`## Юниты`);
  line(`${pad('юнит', 22)}${lpad('эпоха', 16)}${lpad('обучено', 9)}${lpad('убито им', 10)}${lpad('погибло', 9)}${lpad('K/D', 6)}${lpad('окупаем.', 10)}`);
  const sum = (k: 'trained' | 'lost' | 'killed' | 'killsBy', t: string) => all.reduce((s, p) => s + (p[k][t] ?? 0), 0);
  const value: Record<string, number> = {}; // стоимость убитых этим типом (по ударившему последним)
  for (const p of all) for (const [t, n] of Object.entries(p.killsBy)) value[t] = (value[t] ?? 0) + n; // приблизительно: число убийств
  const rows = Object.keys(UNITS).filter((t) => !UNITS[t].animal).map((t) => {
    const tr = sum('trained', t), lost = sum('lost', t), kills = sum('killsBy', t);
    return { t, tr, lost, kills, kd: lost ? kills / lost : kills ? Infinity : 0 };
  });
  for (const r of rows.sort((a, b) => UNITS[a.t].age - UNITS[b.t].age || b.tr - a.tr)) {
    const d = UNITS[r.t], eff = r.lost ? (r.kills * 60) / (r.lost * costOf(d.cost)) : 0; // очень грубо: убийства ×60 ресурсов / потерянная стоимость
    line(`${pad(`${d.name} (${r.t})`, 22)}${lpad(AGE_NAMES[d.age], 16)}${lpad(r.tr, 9)}${lpad(r.kills, 10)}${lpad(r.lost, 9)}${lpad(Number.isFinite(r.kd) ? r.kd.toFixed(2) : '∞', 6)}${lpad(r.lost ? eff.toFixed(2) : '—', 10)}`);
  }
  line(`Никто не строил: ${rows.filter((r) => !r.tr).map((r) => UNITS[r.t].name).join(', ') || '—'}`);
  line();
  line(`## Технологии (доля игроков, взявших)`);
  const tc: Record<string, number> = {};
  for (const p of all) for (const t of p.techs) tc[t] = (tc[t] ?? 0) + 1;
  line(Object.keys(TECHS).sort((a, b) => (tc[b] ?? 0) - (tc[a] ?? 0)).map((t) => `${TECHS[t].name} ${pct(tc[t] ?? 0, all.length)}`).join(' · '));
  line();
  line(`Население макс. в среднем: ${Math.round(avg(all.map((p) => p.maxPop)))} · добыто за матч в среднем: ${Math.round(avg(all.map((p) => p.gathered)))}`);
  return L.join('\n');
}

// ---------- Запуск: родитель раздаёт матчи дочерним процессам ----------
if (process.argv[2] === '--worker') {
  process.on('message', (j: Job) => { process.send!(play(j)); });
} else {
  const quick = process.argv.includes('--quick'), ji = process.argv.indexOf('--json');
  const list = jobs(quick), results: Result[] = [], t0 = performance.now();
  const N = Math.max(1, Math.min(cpus().length, list.length));
  let next = 0, done = 0;
  await new Promise<void>((resolve) => {
    for (let i = 0; i < N; i++) {
      const ch = fork(new URL(import.meta.url).pathname, ['--worker'], { execArgv: process.execArgv });
      const feed = () => { if (next < list.length) ch.send(list[next++]); else ch.kill(); };
      ch.on('message', (r: Result) => {
        results.push(r); done++;
        process.stdout.write(`\r  матчей: ${done}/${list.length}`);
        if (done === list.length) resolve();
        feed();
      });
      feed();
    }
  });
  console.log(`\r  матчей: ${done}/${list.length} за ${((performance.now() - t0) / 1000).toFixed(0)} с\n`);
  console.log(report(results));
  if (ji >= 0) writeFileSync(process.argv[ji + 1] ?? 'balance.json', JSON.stringify(results));
}
