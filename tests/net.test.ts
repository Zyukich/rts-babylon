// Сеть: сервер + два headless-клиента играют по тикам сервера. Хеши миров должны совпадать, рассинхронов — ноль.
import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { createWorld, hash, type World } from '../game/core/world.ts';
import { step } from '../game/core/sim/index.ts';

const PORT = 18090 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', 'game/server/index.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
afterAll(() => { server.kill(); });

function client(name: string, host: boolean) {
  return new Promise<{ steps: number; hash: string; desync: number }>((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    let w: World | null = null, steps = 0, desync = 0, me = -1;
    ws.on('error', reject);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', room: 'sync', name })));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === 'lobby' && host && m.players.length === 2) ws.send(JSON.stringify({ type: 'start', ai: 'hard' }));
      if (m.type === 'start') { w = createWorld(m.seed, m.n); me = m.you; ws.send(JSON.stringify({ type: 'ready' })); } // «загрузились» — сервер запускает время
      if (m.type === 'desync') desync++;
      if (m.type !== 'tick' || !w) return;
      step(w, m.cmds); steps++;
      if (w.tick % 50 === 0) ws.send(JSON.stringify({ type: 'hash', t: w.tick, h: hash(w) }));
      if (steps % 7 === 0) { // немного своих приказов, чтобы сервер разносил команды
        const mine = [...w.ents.values()].filter((e) => e.kind === 'u' && e.owner === me).map((e) => e.id);
        if (mine.length) ws.send(JSON.stringify({ type: 'cmd', cmd: { t: 'move', units: mine.slice(0, 3), x: 20 + (steps % 50), y: 30, f: 1 } }));
      }
      if (steps === 150) { ws.close(); resolve({ steps, hash: hash(w), desync }); }
    });
  });
}

describe('сетевая игра', () => {
  it('два клиента видят один и тот же мир', async () => {
    await new Promise<void>((ok) => server.stdout!.once('data', () => ok())); // сервер поднялся
    const [a, b] = await Promise.all([client('A', true), new Promise((r) => setTimeout(r, 200)).then(() => client('B', false))]);
    expect(a.steps).toBe(150);
    expect(a.hash).toBe(b.hash);
    expect(a.desync + b.desync).toBe(0);
  }, 40000);
});

describe('старт сетевой партии', () => {
  it('время не идёт, пока все игроки не загрузились', async () => {
    const connect = (name: string, host: boolean) => new Promise<{ ws: WebSocket; ticks: () => number }>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      let ticks = 0;
      ws.on('error', reject);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', room: 'wait', name })));
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        if (m.type === 'lobby' && host && m.players.length === 2) ws.send(JSON.stringify({ type: 'start', ai: 'easy' }));
        if (m.type === 'start') resolve({ ws, ticks: () => ticks });
        if (m.type === 'tick') ticks++;
      });
    });
    const a = connect('A', true), b = new Promise((r) => setTimeout(r, 200)).then(() => connect('B', false));
    const [ca, cb] = await Promise.all([a, b]);
    await new Promise((r) => setTimeout(r, 1500));
    expect(ca.ticks()).toBe(0); // оба ещё «грузятся»
    ca.ws.send(JSON.stringify({ type: 'ready' }));
    await new Promise((r) => setTimeout(r, 800));
    expect(ca.ticks()).toBe(0); // второй ещё не готов
    cb.ws.send(JSON.stringify({ type: 'ready' }));
    await new Promise((r) => setTimeout(r, 1500));
    expect(ca.ticks()).toBeGreaterThan(5);
    expect(cb.ticks()).toBe(ca.ticks());
    ca.ws.close(); cb.ws.close();
  }, 20000);
});
