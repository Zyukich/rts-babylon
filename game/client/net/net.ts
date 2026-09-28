// Сетевой клиент: лобби комнаты и поток тиков от сервера (lockstep). Интерфейс лобби рисует Vue по событиям.
import type { Command } from '../../core/sim/index.ts';

/** Идущая сетевая партия — то, что нужно игре */
export interface NetSession {
  you: number; seed: number; n: number; names: string[];
  queue: { t: number; cmds: Command[] }[];
  send(c: Command): void;
  hash(t: number, h: string): void;
  onDesync?: (t: number) => void;
  onNotice?: (text: string) => void; // «игрок вышел», «соединение потеряно»
}

export interface LobbyEvents {
  lobby(players: string[], you: number): void;
  start(net: NetSession): void;
  error(msg: string): void;
}

export const defaultServer = () => `ws://${location.hostname}:8080`;

/** Подключиться к комнате. Возвращает функции лобби: начать (хост) и закрыть соединение */
export function joinRoom(url: string, room: string, name: string, ev: LobbyEvents) {
  const ws = new WebSocket(url);
  let started = false, closed = false;
  const net: NetSession = {
    you: 0, seed: 0, n: 2, names: [], queue: [],
    send: (c) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'cmd', cmd: c })); },
    hash: (t, h) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'hash', t, h })); },
  };
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room, name }));
  ws.onmessage = (e) => {
    let m: Record<string, any>;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'lobby') ev.lobby(m.players, m.you);
    else if (m.type === 'start') { Object.assign(net, { you: m.you, seed: m.seed, n: m.n, names: m.names }); started = true; ev.start(net); }
    else if (m.type === 'tick') net.queue.push({ t: m.t, cmds: m.cmds });
    else if (m.type === 'desync') net.onDesync?.(m.t);
    else if (m.type === 'left') net.onNotice?.(`${m.name} вышел — его цивилизацией управляет бот`);
    else if (m.type === 'error') { if (started) net.onNotice?.(m.msg); else ev.error(m.msg); }
  };
  ws.onclose = () => { if (closed) return; if (started) net.onNotice?.('Соединение с сервером потеряно'); else ev.error('Соединение с сервером потеряно'); };
  ws.onerror = () => { if (!started) ev.error(`Не удалось подключиться к ${url}. Сервер запущен? (npm run server)`); };
  return {
    start: (ai: string) => ws.send(JSON.stringify({ type: 'start', ai })),
    close: () => { closed = true; ws.close(); },
  };
}
