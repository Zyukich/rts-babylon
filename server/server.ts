// Авторитетный lockstep-сервер.
// Собирает команды игроков, раз в тик рассылает всем пакет «тик N: команды» и сам крутит ту же симуляцию.
// Клиент не может «нарисовать» себе золото: всё решает step() на сервере; клиенты лишь повторяют её.
import { WebSocketServer, type WebSocket } from 'ws';
import { createWorld, hash, type World } from '../src/world.ts';
import { step, type Command } from '../src/sim.ts';
import { Bot, LEVELS, type Level } from '../src/ai.ts';
import { TICK_MS, UNITS, BUILDINGS } from '../src/defs.ts';
import { TECHS } from '../src/civ.ts';

interface Client { ws: WebSocket; name: string; slot: number; budget: number; }
interface Room {
  id: string; clients: Client[]; started: boolean; bots: Bot[]; inbox: Command[];
  hashes: Map<number, string>; w?: World; timer?: ReturnType<typeof setInterval>;
}

const PORT = Number(process.env.PORT ?? 8080), MAX_PLAYERS = 8, HASH_EVERY = 50, CMD_BUDGET = 30;
const rooms = new Map<string, Room>();
const out = (ws: WebSocket, m: object) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const all = (r: Room, m: object) => { const s = JSON.stringify(m); for (const c of r.clients) if (c.ws.readyState === 1) c.ws.send(s); };
const lobby = (r: Room) => r.clients.forEach((c) => out(c.ws, { type: 'lobby', players: r.clients.map((x) => x.name), you: c.slot }));

// Никогда не доверяем клиенту: проверяем форму команды и подставляем номер игрока сами
function sanitize(c: any, p: number): Command | null {
  const r = sanitize0(c, p);
  if (r && c?.q === true) r.q = true;
  return r;
}
function sanitize0(c: any, p: number): Command | null {
  if (!c || typeof c.t !== 'string') return null;
  const ids = (a: unknown) => Array.isArray(a) && a.length <= 200 && a.every(Number.isInteger);
  const ints = (...v: unknown[]) => v.every(Number.isInteger);
  switch (c.t) {
    case 'move': case 'amove': return ids(c.units) && ints(c.x, c.y) ? { p, t: c.t, units: c.units, x: c.x, y: c.y } : null;
    case 'attack': case 'assist': case 'farm': return ids(c.units) && ints(c.target) ? { p, t: c.t, units: c.units, target: c.target } : null;
    case 'gather': return ids(c.units) && ints(c.tile) ? { p, t: 'gather', units: c.units, tile: c.tile } : null;
    case 'build': return ids(c.units) && Object.hasOwn(BUILDINGS, c.type) && ints(c.tx, c.ty) ? { p, t: 'build', units: c.units, type: c.type, tx: c.tx, ty: c.ty } : null;
    case 'train': return ints(c.building) && Object.hasOwn(UNITS, c.unit) ? { p, t: 'train', building: c.building, unit: c.unit } : null;
    case 'age': return ints(c.building) ? { p, t: 'age', building: c.building } : null;
    case 'rally': return ints(c.building, c.x, c.y) ? { p, t: 'rally', building: c.building, x: c.x, y: c.y } : null;
    case 'research': return ints(c.building) && Object.hasOwn(TECHS, c.tech) ? { p, t: 'research', building: c.building, tech: c.tech } : null;
    case 'wall': return ids(c.units) && Array.isArray(c.tiles) && c.tiles.length <= 40 && c.tiles.every(Number.isInteger) ? { p, t: 'wall', units: c.units, tiles: c.tiles } : null;
    case 'cancel': return ints(c.building, c.index) ? { p, t: 'cancel', building: c.building, index: c.index } : null;
    case 'destroy': return ids(c.ids) ? { p, t: 'destroy', ids: c.ids } : null;
    case 'convert': return ints(c.building) && (c.to === 'gate' || c.to === 'tower') ? { p, t: 'convert', building: c.building, to: c.to } : null;
    case 'gate': return ints(c.building) && typeof c.open === 'boolean' ? { p, t: 'gate', building: c.building, open: c.open } : null;
    case 'sow': return ints(c.building) ? { p, t: 'sow', building: c.building } : null;
    case 'stop': return ids(c.units) ? { p, t: 'stop', units: c.units } : null;
  }
  return null;
}

function start(r: Room, level: Level) {
  r.started = true;
  const n = Math.max(2, r.clients.length), seed = (Math.random() * 2 ** 31) | 0;
  r.w = createWorld(seed, n);
  for (let p = r.clients.length; p < n; p++) r.bots.push(new Bot(p, level)); // пустые места — боты
  const names = [...r.clients.map((c) => c.name), ...r.bots.map(() => `Бот (${LEVELS[level]})`)];
  r.clients.forEach((c, i) => { c.slot = i; out(c.ws, { type: 'start', seed, n, you: i, names }); });
  r.timer = setInterval(() => tick(r), TICK_MS);
  console.log(`[${r.id}] старт: ${names.join(', ')}`);
}

function tick(r: Room) {
  const w = r.w!;
  const cmds = [...r.inbox.splice(0), ...r.bots.flatMap((b) => b.think(w))];
  for (const c of r.clients) c.budget = 0;
  all(r, { type: 'tick', t: w.tick, cmds });
  step(w, cmds);
  if (w.tick % HASH_EVERY === 0) { r.hashes.set(w.tick, hash(w)); r.hashes.delete(w.tick - HASH_EVERY * 20); }
  if (w.winner >= 0 || !r.clients.some((c) => c.ws.readyState === 1)) {
    clearInterval(r.timer);
    rooms.delete(r.id);
    console.log(`[${r.id}] конец: ${w.winner >= 0 ? 'победил P' + w.winner : 'все вышли'}`);
  }
}

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', (ws: WebSocket) => {
  let room: Room | null = null, me: Client | null = null;
  ws.on('message', (raw: unknown) => {
    let m: any;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.type === 'join' && !room) {
      const id = String(m.room ?? '').slice(0, 32);
      let r = rooms.get(id);
      if (!r) { r = { id, clients: [], started: false, bots: [], inbox: [], hashes: new Map() }; rooms.set(id, r); }
      if (r.started || r.clients.length >= MAX_PLAYERS) return out(ws, { type: 'error', msg: 'Игра уже идёт или комната заполнена' });
      room = r;
      me = { ws, name: String(m.name ?? 'Игрок').slice(0, 20), slot: r.clients.length, budget: 0 };
      r.clients.push(me);
      lobby(r);
      return;
    }
    if (!room || !me) return;
    if (m.type === 'start' && !room.started && me.slot === 0) start(room, Object.hasOwn(LEVELS, m.ai) ? m.ai : 'normal');
    else if (m.type === 'cmd' && room.started && me.budget++ < CMD_BUDGET) {
      const c = sanitize(m.cmd, me.slot);
      if (c) room.inbox.push(c);
    } else if (m.type === 'hash' && room.started) {
      const h = room.hashes.get(m.t);
      if (h && h !== m.h) { out(ws, { type: 'desync', t: m.t }); console.warn(`[${room.id}] рассинхрон у ${me.name} на тике ${m.t}`); }
    }
  });
  ws.on('close', () => {
    if (!room || !me) return;
    if (!room.started) {
      room.clients.splice(room.clients.indexOf(me), 1);
      room.clients.forEach((c, i) => (c.slot = i));
      if (room.clients.length) lobby(room); else rooms.delete(room.id);
    } else all(room, { type: 'left', name: me.name });
  });
});
console.log(`Сервер ЭПОХИ на ws://localhost:${PORT}`);
