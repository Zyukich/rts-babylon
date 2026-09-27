// Сетевой клиент: лобби + очередь тиков от сервера.
import type { Command } from './sim.ts';
import { loadSettings } from './settings.ts';

export interface Net {
  you: number; seed: number; n: number; names: string[];
  queue: { t: number; cmds: Command[] }[];
  send(c: Command): void;
  hash(t: number, h: string): void;
  onDesync?: (t: number) => void;
}

// Есть ?room=xxx в адресе → подключаемся и ждём старта; иначе null (игра против бота локально)
export function connect(): Promise<Net | null> {
  const room = new URLSearchParams(location.search).get('room');
  if (!room) return Promise.resolve(null);
  const S = loadSettings();
  const url = S.server || ((import.meta as any).env?.VITE_SERVER ?? `ws://${location.hostname}:8080`);
  const name = S.name || localStorage.getItem('epohi-name') || prompt('Ваше имя', 'Игрок') || 'Игрок';
  localStorage.setItem('epohi-name', name);

  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#111;z-index:10;font-size:18px';
  ui.textContent = 'Подключение…';
  document.body.append(ui);

  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const net: Net = {
      you: 0, seed: 0, n: 2, names: [], queue: [],
      send: (c) => ws.send(JSON.stringify({ type: 'cmd', cmd: c })),
      hash: (t, h) => ws.send(JSON.stringify({ type: 'hash', t, h })),
    };
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room, name }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'lobby') {
        ui.innerHTML = `<b>Комната ${room}</b><div>Ссылка для друга:</div><input readonly value="${location.href}" style="width:420px;padding:6px" onclick="this.select()">
          <div>Игроки: ${m.players.map((p: string, i: number) => (i === m.you ? `<u>${p}</u>` : p)).join(', ')}</div>
          ${m.you === 0 ? '<div>Боты на пустых местах: <select id="ai"><option value="easy">Лёгкий</option><option value="normal" selected>Средний</option><option value="hard">Сложный</option></select></div><button id="go" style="padding:10px 24px;font-size:18px">Начать</button>' : '<div>Ждём, пока хост начнёт…</div>'}`;
        ui.querySelector('#go')?.addEventListener('click', () => ws.send(JSON.stringify({ type: 'start', ai: (ui.querySelector('#ai') as HTMLSelectElement).value })));
      } else if (m.type === 'start') {
        Object.assign(net, { you: m.you, seed: m.seed, n: m.n, names: m.names });
        ui.remove();
        resolve(net);
      } else if (m.type === 'tick') net.queue.push(m);
      else if (m.type === 'desync') net.onDesync?.(m.t);
      else if (m.type === 'left') console.log(`${m.name} вышел`);
      else if (m.type === 'error') ui.textContent = m.msg;
    };
    ws.onclose = () => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:40px;width:100%;text-align:center;color:#f66;z-index:11';
      d.textContent = 'Соединение с сервером потеряно';
      document.body.append(d);
    };
    ws.onerror = () => { ui.textContent = `Не удалось подключиться к ${url}. Сервер запущен? (npm run server)`; };
  });
}
