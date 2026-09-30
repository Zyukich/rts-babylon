// Интерфейс: собирает снимок HudState из мира (~10 раз в секунду и сразу после действий игрока) и выполняет действия кнопок.
import { UNITS, BUILDINGS, RES, TILE, AGE_NAMES, AGE_TIME, SETTLE, MARKET_FEE, REL_NAMES, TERR_HOLD, WIN_NAMES, FINAL_REQ, WHEAT, WHEAT_INIT, WHEAT_SOW, WHEAT_TIME, WHEAT_COST, NAMES, type Cost, type Res } from '../../data/index.ts';
import { maxHp, ageCost, researchTime, TECHS, BRANCH, BRANCHES, cultureLevel, identity, slotsLeft, queuedTechs, year } from '../../core/civ.ts';
import { ally, relOf, type Building, type Unit } from '../../core/world.ts';
import { fmt } from '../../core/sim/index.ts';
import { FORMS } from '../input/orders.ts';
import { RES_ICON, icon, DOING, costStr, queueName, queueIcon, HOTKEYS } from './format.ts';
import type { HudState, CmdItem, CmdButton, Tip, SelectionPanel, Alert, DiploRow, EndInfo, QueueSlot, WorldEvent } from './types.ts';
import type { GameContext } from '../context.ts';

const PUSH_MS = 100;
const EVENT_ICON: Record<string, string> = { drought: '☀️', harvest: '🌾', plague: '☠️', deposit: '⛏️', settlers: '🧳', quake: '🌋', scholar: '📜' };
const EVENT_SHOW = 2.5 * 60 * 10; // событие висит в ленте 2,5 минуты (или пока действует)
const GOAL_LABEL: Record<string, string> = { eco: 'экономическая победа через', cult: 'культурная победа через', sci: 'Просвещение через' };

export function useHud(ctx: GameContext) {
  const { S } = ctx, { w, ME, net, send, debug, who, hex } = ctx.session;
  let dirty = true, lastPush = 0, hover = '', box: HudState['box'] = null, message = '', notice = '', noticeUntil = 0;
  let menu = false, dipOpen = false, end: EndInfo | null = null;
  const pendingQ = new Map<number, number>(); // заказы, ещё не дошедшие до симуляции (для раздачи по зданиям)
  let hotkeys: Record<string, string> = {};

  // ---------- Кнопки панели команд ----------
  function commands(): CmdItem[] {
    const P = w.players[ME], sel = ctx.sel, out: CmdItem[] = [];
    const afford = (c: Cost) => RES.every((r) => P.res[r] >= (c[r] ?? 0));
    const btn = (a: string, ic: string, tip: Tip, ok: boolean, badge = '') => { out.push({ a, icon: ic, tip, ok, badge: badge || undefined }); };
    const header = (h: string) => out.push({ header: h });
    const unitTip = (u: string, note?: string): Tip => { const d = UNITS[u]; return { title: NAMES[u], lines: [costStr(d.cost), `❤ ${d.hp} ⚔ ${d.atk} 🛡 ${d.armor}`], note }; };
    const buildMenu = () => {
      for (const [k, bd] of Object.entries(BUILDINGS)) if (bd.age <= P.age && k !== 'gate' && k !== 'farm')
        btn(`build:${k}`, icon(k), { title: NAMES[k], lines: [costStr(bd.cost), ...(bd.pop ? [`+${bd.pop} к населению`] : [])], note: k === 'pasture' ? `Сразу засевает ${WHEAT_INIT} участков пшеницы вокруг, разводит коров, принимает еду` : undefined }, afford(bd.cost));
    };
    const ents = sel.ents(), one = ents.length === 1 ? ents[0] : null;
    if (one?.kind === 'u' && one.owner === ME && UNITS[one.type].cls === 'worker') buildMenu();
    else if (one?.kind === 'b' && one.owner === ME && one.progress >= BUILDINGS[one.type].time) {
      const d = BUILDINGS[one.type];
      for (const u of d.trains ?? []) if (UNITS[u].age <= P.age) {
        const n = one.queue.filter((q) => q === u).length;
        btn(`train:${one.id}:${u}`, icon(u), unitTip(u), afford(UNITS[u].cost), n ? String(n) : '');
      }
      if (one.type === 'wall' || one.type === 'gate') { // стена: сделать воротами или башней; ворота — открыть/закрыть
        if (one.type === 'wall') btn(`conv:${one.id}:gate`, '🚪', { title: 'Сделать воротами', lines: ['🪨20'], note: 'Свои проходят, чужие — нет. Можно открывать и закрывать' }, afford({ stone: 20 }));
        else btn(`gate:${one.id}:${one.open ? 0 : 1}`, one.open ? '🔒' : '🔓', one.open ? { title: 'Закрыть ворота', note: 'Не пройдёт никто' } : { title: 'Открыть ворота', note: 'Свои смогут проходить' }, true);
        btn(`conv:${one.id}:tower`, '🗼', { title: 'Башня на стене', lines: [costStr(BUILDINGS.tower.cost)], note: 'Стреляет по врагам рядом. Нужна Древняя эпоха' }, P.age >= BUILDINGS.tower.age && afford(BUILDINGS.tower.cost));
      }
      if (one.type === 'market') { // обмен: 100 единиц ↔ золото по плавающей цене
        header('Рынок · 100 единиц за 🪙 · повозкам — ПКМ по другому рынку');
        for (const r of (P.age >= 4 ? ['food', 'wood', 'stone', 'iron', 'energy'] : ['food', 'wood', 'stone', 'iron']) as Res[]) { // энергия — с Индустриальной
          const pr = P.prices[r] ?? 0, sell = Math.floor((pr * (100 - MARKET_FEE)) / 100);
          btn(`mkt:${one.id}:${r}:1`, `${RES_ICON[r]}+`, { title: `Купить 100 ${RES_ICON[r]}`, lines: [`за 🪙${pr}`], note: 'Покупка поднимает цену' }, P.res.gold >= pr);
          btn(`mkt:${one.id}:${r}:0`, `${RES_ICON[r]}−`, { title: `Продать 100 ${RES_ICON[r]}`, lines: [`получите 🪙${sell}`], note: `Продажа снижает цену; комиссия ${MARKET_FEE}%` }, P.res[r] >= 100);
        }
      }
      if (one.type === 'pasture') { const n = one.queue.filter((q) => q === '#wheat').length; btn(`sow:${one.id}`, '🌾', { title: 'Посеять пшеницу', lines: [costStr(WHEAT_COST)], note: `${WHEAT_SOW} участка вокруг фермы, по ${WHEAT} еды. Собранный участок исчезает` }, afford(WHEAT_COST), n ? String(n) : ''); }
      const ac = ageCost(P);
      if (one.type === 'town_center' && ac && !P.ageing) btn(`age:${one.id}`, '⏫', { title: `${AGE_NAMES[P.age + 1]} эпоха`, lines: [costStr(ac)] }, afford(ac));
      if (one.type === 'town_center') { // направления развития: слотов мало — выбирай
        const left = slotsLeft(w, P), q = queuedTechs(w, ME);
        header(`Исследования · слотов: ${left}${P.techs.length ? ' · изучено: ' + P.techs.map((t) => BRANCH[TECHS[t].branch].icon).join('') : ''}`);
        for (const [id, t] of Object.entries(TECHS)) if (t.age <= P.age && !P.techs.includes(id) && !q.includes(id))
          btn(`res:${one.id}:${id}`, BRANCH[t.branch].icon, { title: `${t.name} (${BRANCH[t.branch].name})`, lines: [costStr(t.cost)], note: t.desc }, (t.final ? P.techs.length >= FINAL_REQ : left > 0) && afford(t.cost));
      }
    } else if (ents.length > 1 && sameBuildings(ents)) { // несколько одинаковых зданий: общий найм
      const bs = ents as Building[], tot = queueTotals(bs);
      for (const u of BUILDINGS[bs[0].type].trains ?? []) if (UNITS[u].age <= P.age)
        btn(`trainm:${bs[0].type}:${u}`, icon(u), unitTip(u, 'Заказ уйдёт в здание с самой короткой очередью'), afford(UNITS[u].cost), tot[u] ? String(tot[u]) : '');
      if (bs[0].type === 'pasture') btn('sowm:pasture', '🌾', { title: 'Посеять пшеницу', lines: [costStr(WHEAT_COST)], note: 'В ферму с самой короткой очередью' }, afford(WHEAT_COST), tot['#wheat'] ? String(tot['#wheat']) : '');
    } else if (ents.length > 1) {
      if (ents.some((e) => e.kind === 'u' && e.owner === ME && UNITS[e.type].cls !== 'worker' && !UNITS[e.type].animal)) // строй для войск
        FORMS.forEach((f, i) => btn(`form:${i}`, f.icon, { title: `Формация: ${f.name}`, note: `${f.desc}. Z — следующая` }, true, i === ctx.orders.form ? '✓' : ''));
      if (ents.some((e) => e.kind === 'u' && e.owner === ME && UNITS[e.type].cls === 'worker')) buildMenu();
    }
    hotkeys = {};
    let k = 0;
    for (const it of out) if ('a' in it) { it.hk = HOTKEYS[k++]; if (it.hk) hotkeys[it.hk] = it.a; }
    return out;
  }
  const sameBuildings = (ents: ReturnType<typeof ctx.sel.ents>) => ents.every((e) => e.kind === 'b' && e.owner === ME && e.type === ents[0].type && e.progress >= BUILDINGS[e.type].time);
  const queueTotals = (bs: Building[]) => { const tot: Record<string, number> = {}; for (const b of bs) for (const q of b.queue) tot[q] = (tot[q] ?? 0) + 1; return tot; };

  // ---------- Панель выделения ----------
  function selection(): SelectionPanel {
    const P = w.players[ME], sel = ctx.sel, ents = sel.ents(), sr = sel.res;
    if (!ents.length && sr >= 0 && w.resType[sr]) { // выбран ресурс
      const rt = w.resType[sr], meat = w.resKind[sr] === 1, wh = w.resKind[sr] === 2 && rt === 1;
      return {
        kind: 'resource', left: w.resAmt[sr], resIcon: RES_ICON[RES[rt - 1]],
        name: meat ? 'Туша коровы' : wh ? 'Пшеница' : ['', 'Ягодный куст', 'Дерево', 'Камень', 'Железная руда', 'Золотая жила'][rt],
        icon: meat ? '🍖' : wh ? '🌾' : ['', '🫐', '🌲', '🪨', '⛓️', '🪙'][rt],
        workers: [...w.ents.values()].filter((u) => u.kind === 'u' && u.order.t === 'gather' && u.order.tile === sr).length,
      };
    }
    if (!ents.length) return { kind: 'none', hints: S.hints };
    if (ents.length === 1) {
      const one = ents[0], mh = maxHp(w, one), own = one.owner === ME;
      const panel = { kind: 'one' as const, icon: icon(one.type), name: NAMES[one.type], owner: who(one.owner), hp: one.hp, maxHp: mh, stats: [`❤ ${one.hp}/${mh}`], lines: [] as string[], queue: [] as QueueSlot[] };
      if (one.kind === 'u') {
        const d = UNITS[one.type], u = one as Unit;
        panel.stats.push(`⚔ ${d.atk}`, `🛡 ${d.armor}`, `🎯 ${(d.range / TILE).toFixed(1)}`);
        panel.lines.push(`${DOING[u.order.t] ?? ''}${u.carry ? ` · несёт ${RES_ICON[u.carryRes!]}${u.carry}` : ''}`);
      } else {
        const d = BUILDINGS[one.type];
        if (one.progress < d.time) panel.lines.push(`Строится: ${Math.floor((100 * one.progress) / d.time)}%`);
        else if (own && one.queue.length) {
          const q0 = one.queue[0], tot = q0 === '#wheat' ? WHEAT_TIME : q0 === '#age' ? AGE_TIME : q0[0] === '@' ? researchTime(P, q0.slice(1)) : UNITS[q0].time;
          panel.queue = one.queue.map((q, i) => ({ a: `cancel:${one.id}:${i}`, icon: queueIcon(q), title: `${queueName(q)} — клик: отменить`, progress: i === 0 ? Math.min(100, (100 * one.qt) / tot) : undefined }));
        }
        if (one.type === 'gate' && one.progress >= d.time) panel.lines.push(one.open ? 'Ворота открыты' : 'Ворота закрыты');
      }
      return panel;
    }
    if (sameBuildings(ents)) { // несколько одинаковых зданий: заказы раздаются по очередям, показываем сумму
      const bs = ents as Building[], tot = queueTotals(bs);
      return {
        kind: 'buildings', icon: icon(bs[0].type), name: NAMES[bs[0].type], count: bs.length, busy: Object.values(tot).reduce((a, b) => a + b, 0),
        queue: Object.entries(tot).map(([q, n]) => ({ a: `cancelm:${bs[0].type}:${q}`, icon: queueIcon(q), title: `${queueName(q)} — клик: отменить один`, count: n })),
      };
    }
    const cnt: Record<string, number> = {}; // группа: иконки по типам, клик — оставить только этот тип
    for (const e of ents) cnt[e.type] = (cnt[e.type] ?? 0) + 1;
    return { kind: 'group', count: ents.length, types: Object.entries(cnt).map(([t, n]) => ({ a: `only:${t}`, icon: icon(t), title: `${NAMES[t]} — оставить только их`, count: n })) };
  }

  // ---------- Уведомления и дипломатия ----------
  function alerts(): Alert[] {
    const out: Alert[] = [], idle = ctx.sel.idleVills().length;
    if (idle) out.push({ kind: 'idle', a: 'idle', text: `💤 Рабочие бездельничают (${idle}) — клавиша .` });
    if (ctx.alerts.attacked()) out.push({ kind: 'warn', a: 'alert', text: '⚠ Нас атакуют! — Пробел' });
    if (w.holdBy >= 0) out.push({ kind: 'info', text: `⏳ ${who(w.holdBy)} удерживает земли: ${fmt(TERR_HOLD - w.holdT)}` });
    for (const g of w.goals) out.push({ kind: 'info', text: `⏳ ${who(g.p)}: ${GOAL_LABEL[g.kind]} ${fmt(Math.max(0, g.need - g.t))}` });
    for (const o of w.offers) if (o.to === ME) out.push({ kind: 'info', a: `dip:${o.from}:${o.rel}`, text: `🤝 ${who(o.from)} предлагает: ${REL_NAMES[o.rel].toLowerCase()} — нажмите, чтобы принять` });
    return out;
  }
  function diplomacy(): DiploRow[] {
    const rows: DiploRow[] = [];
    for (const Q of w.players) {
      if (Q.id === ME || !Q.alive) continue;
      const r = relOf(w, ME, Q.id), mine = w.offers.find((o) => o.from === ME && o.to === Q.id), theirs = w.offers.find((o) => o.from === Q.id && o.to === ME);
      const b: DiploRow['buttons'] = [], id = Q.id;
      if (theirs) b.push({ a: `dip:${id}:${theirs.rel}`, label: `✅ Принять: ${REL_NAMES[theirs.rel].toLowerCase()}` });
      if (r < 3) b.push({ a: `dip:${id}:3`, label: '🕊 Предложить мир' });
      if (r === 0) b.push({ a: `dip:${id}:2`, label: '🏳 Перемирие' });
      if (r === 3) b.push({ a: `dip:${id}:4`, label: '🤝 Предложить союз' });
      if (r === 4) b.push({ a: `dip:${id}:2`, label: '💔 Разорвать союз' });
      if (r >= 1 && r <= 3) b.push({ a: `dip:${id}:0`, label: '⚔ Объявить войну' });
      rows.push({
        id, name: who(id), color: hex(id), rel: REL_NAMES[r], waiting: mine ? REL_NAMES[mine.rel].toLowerCase() : undefined, buttons: b,
        tribute: r > 0 ? (['food', 'wood', 'gold'] as const).map((res) => ({ a: `tri:${id}:${res}`, label: `${RES_ICON[res]}100` })) : [],
      });
    }
    return rows;
  }

  // ---------- Лента событий мира ----------
  function events(): WorldEvent[] {
    const out: WorldEvent[] = [];
    w.chron.forEach((c, id) => {
      if (c.p >= 0 || !c.kind) return;
      const active = (c.until ?? 0) > w.tick;
      if (!active && w.tick - c.tick > EVENT_SHOW) return;
      const ago = Math.floor((w.tick - c.tick) / 600);
      out.push({
        id, icon: EVENT_ICON[c.kind] ?? '📢', text: ctx.alerts.names(c.text), mine: c.who === ME, fresh: w.tick - c.tick < 100,
        ago: ago < 1 ? 'только что' : `${ago} мин назад`, left: active ? `ещё ${fmt(c.until! - w.tick)}` : undefined,
        a: c.x !== undefined && c.y !== undefined ? `look:${c.x}:${c.y}` : undefined,
      });
    });
    return out.slice(-6).reverse(); // свежие сверху
  }

  // ---------- Итог матча ----------
  function finish(): EndInfo {
    const P = w.players[ME], won = w.winner >= 0 && ally(w, w.winner, ME);
    let hist: { won: boolean }[] = [];
    try { const h = JSON.parse(localStorage.getItem('epohi-history') ?? '[]'); if (Array.isArray(h)) hist = h; } catch { /* испорченная история — начинаем заново */ }
    hist.push({ date: Date.now(), won, title: identity(P), years: year(w.tick), techs: P.techs } as { won: boolean });
    try { localStorage.setItem('epohi-history', JSON.stringify(hist.slice(-50))); } catch { /* нет места */ }
    const s = P.stats;
    return {
      won, victory: w.winKind ? `${WIN_NAMES[w.winKind]} победа: ${who(w.winner)}` : '', title: identity(P), years: year(w.tick),
      culture: BRANCHES.map((b) => `${BRANCH[b].icon} ${BRANCH[b].cult}: ур. ${cultureLevel(P, b)} (${P.culture[b]})`),
      stats: `Добыто ${s.gathered} · обучено ${s.trained} · убито ${s.kills} · потеряно ${s.lost} · построено ${s.built}`,
      chronicle: w.chron.filter((c) => c.p === ME || c.p < 0).map((c) => ({ year: year(c.tick), text: ctx.alerts.names(c.text) })),
      played: hist.length, wins: hist.filter((h) => h.won).length,
    };
  }

  function build(): HudState {
    const P = w.players[ME];
    ctx.sel.refresh();
    if (!end && (w.winner >= 0 || !P.alive)) end = finish();
    return {
      pop: `${P.pop}/${P.popCap}`,
      res: RES.filter((r) => r !== 'energy' || P.age >= 4 || P.res.energy > 0).map((r) => ({ key: r, icon: RES_ICON[r], value: P.res[r] })),
      status: {
        fps: S.showFps ? Math.round(ctx.stage.engine.getFps()) : undefined, time: fmt(w.tick),
        regions: `${w.regions.filter((r) => r.owner === ME).length}/${w.regions.length}`, culture: BRANCHES.map((b) => BRANCH[b].icon + cultureLevel(P, b)).join(' '),
      },
      age: { name: `${AGE_NAMES[P.age]} эпоха`, sub: `${identity(P)} цивилизация · ${SETTLE[P.settle].name}${P.ageing ? ' · переход в новую эпоху…' : ''}` },
      hover, news: ctx.alerts.news(), message, notice: performance.now() < noticeUntil ? notice : '', events: events(), alerts: alerts(), diplomacy: dipOpen ? diplomacy() : null,
      selection: selection(), commands: commands(), box, menu, canPause: !net, debug, amove: ctx.controls?.amove ?? false,
      uiScale: S.uiScale, hints: S.hints, end,
    };
  }

  // ---------- Действия ----------
  const queued = (b: Building) => b.queue.length + (pendingQ.get(b.id) ?? 0);
  const addPending = (id: number) => pendingQ.set(id, (pendingQ.get(id) ?? 0) + 1);
  function act(a: string) {
    const [k, x, y, z] = a.split(':'), sel = ctx.sel;
    if (k === 'build') ctx.place.start(x);
    if (k === 'train') { send({ p: ME, t: 'train', building: Number(x), unit: y }); addPending(Number(x)); }
    if (k === 'sow') send({ p: ME, t: 'sow', building: Number(x) });
    if (k === 'sowm') {
      const b = sel.buildings().filter((b) => b.type === 'pasture').sort((a, c) => queued(a) - queued(c))[0];
      if (b) { send({ p: ME, t: 'sow', building: b.id }); addPending(b.id); }
    }
    if (k === 'trainm') { // несколько зданий: в то, где очередь короче
      const b = sel.buildings().filter((b) => b.type === x && queued(b) < 5).sort((a, c) => queued(a) - queued(c))[0];
      if (b) { send({ p: ME, t: 'train', building: b.id, unit: y }); addPending(b.id); }
    }
    if (k === 'cancelm') { // отменить один такой заказ — из самой длинной очереди, с конца
      const b = sel.buildings().filter((b) => b.queue.includes(y)).sort((a, c) => c.queue.length - a.queue.length)[0];
      if (b) send({ p: ME, t: 'cancel', building: b.id, index: b.queue.lastIndexOf(y) });
    }
    if (k === 'cancel') send({ p: ME, t: 'cancel', building: Number(x), index: Number(y) });
    if (k === 'res') send({ p: ME, t: 'research', building: Number(x), tech: y });
    if (k === 'age') send({ p: ME, t: 'age', building: Number(x) });
    if (k === 'only') sel.select(sel.ids().filter((id) => w.ents.get(id)?.type === x)); // оставить в выделении один тип
    if (k === 'idle') sel.nextIdle();
    if (k === 'conv') send({ p: ME, t: 'convert', building: Number(x), to: y });
    if (k === 'gate') send({ p: ME, t: 'gate', building: Number(x), open: y === '1' });
    if (k === 'alert') ctx.alerts.jump();
    if (k === 'form') ctx.orders.setForm(Number(x));
    if (k === 'dip') send({ p: ME, t: 'diplo', to: Number(x), rel: Number(y) });
    if (k === 'tri') send({ p: ME, t: 'tribute', to: Number(x), res: y as Res, amount: 100 });
    if (k === 'mkt') send({ p: ME, t: 'trade', building: Number(x), res: y as Res, buy: z === '1' });
    if (k === 'look') ctx.camera.lookAt(Number(x) + 0.5, Number(y) + 0.5);
    if (k === 'menu') menu = x === undefined ? !menu : x === '1'; // меню паузы; в сетевой игре время не останавливается
    if (k === 'diplo') dipOpen = x === undefined ? !dipOpen : x === '1';
    dirty = true;
  }

  return {
    act, touch() { dirty = true; },
    setHover(t: string) { if (t !== hover) { hover = t; dirty = true; } },
    setBox(b: HudState['box']) { box = b; dirty = true; },
    setMessage(t: string) { message = t; dirty = true; },
    /** Уведомление на несколько секунд */
    notice(t: string, ms = 6000) { notice = t; noticeUntil = performance.now() + ms; dirty = true; },
    /** Действие кнопки по букве (актуально на момент последнего снимка) */
    hotkey: (letter: string) => hotkeys[letter],
    get paused() { return menu && !net; },
    /** Шаг симуляции прошёл — заказы уже в очередях зданий */
    onStep() { pendingQ.clear(); },
    /** Раз в кадр: отправить снимок, если пора */
    frame(now: number) {
      if (!dirty && now - lastPush < PUSH_MS) return;
      dirty = false; lastPush = now;
      ctx.opts.onHud(build());
    },
  };
}
