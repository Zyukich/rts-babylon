// Главное меню: фоновая сценка (воины спавнятся с двух сторон и сходятся в бою), настройки, одиночная игра.
import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial, Color3, Color4, ShadowGenerator, DefaultRenderingPipeline, TransformNode, VertexBuffer, VertexData, type Mesh } from '@babylonjs/core';
import { makeModels } from './models.ts';
import { makeNature, setWind } from './nature.ts';
import { loadSettings, saveSettings, PRESETS, DEFAULTS, FIELDS, KEYS, COLORS, type Settings, type StartCfg, type Slot } from './settings.ts';

// ---------- Фон: маленькая битва ----------
function background(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, true), scene = new Scene(engine);
  scene.clearColor = new Color4(0.72, 0.82, 0.92, 1);
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.028; scene.fogColor = new Color3(0.72, 0.82, 0.92);
  const hemi = new HemisphericLight('h', new Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.8; hemi.diffuse = new Color3(0.78, 0.87, 1); hemi.groundColor = new Color3(0.5, 0.42, 0.33);
  const sun = new DirectionalLight('s', new Vector3(-0.5, -1.2, 0.4), scene);
  sun.position = new Vector3(20, 40, -15); sun.intensity = 1.05; sun.diffuse = new Color3(1, 0.93, 0.8);
  const sh = new ShadowGenerator(1024, sun);
  sh.usePercentageCloserFiltering = true; sh.darkness = 0.35;
  const cam = new ArcRotateCamera('c', -Math.PI / 2, 1.15, 16, new Vector3(3, 0.6, 0), scene);
  const pipe = new DefaultRenderingPipeline('pp', true, scene, [cam]);
  pipe.fxaaEnabled = true; pipe.bloomEnabled = true; pipe.bloomWeight = 0.15;
  pipe.imageProcessing.vignetteEnabled = true; pipe.imageProcessing.vignetteWeight = 2.2;

  const g = MeshBuilder.CreateGround('g', { width: 90, height: 90, subdivisions: 90, updatable: true }, scene);
  const p = g.getVerticesData(VertexBuffer.PositionKind)!, col: number[] = [];
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], z = p[i + 2], d = Math.hypot(x, z), n = Math.sin(x * 1.3) * Math.cos(z * 1.1) * 0.04;
    p[i + 1] = d > 12 ? (Math.sin(x * 0.3) * Math.cos(z * 0.25) + 1.2) * 0.5 * Math.min(1, (d - 12) / 10) : 0;
    col.push(0.36 + n, 0.56 + n, 0.24, 1);
  }
  g.updateVerticesData(VertexBuffer.PositionKind, p);
  g.setVerticesData(VertexBuffer.ColorKind, col);
  const nr: number[] = [];
  VertexData.ComputeNormals(p, g.getIndices()!, nr);
  g.updateVerticesData(VertexBuffer.NormalKind, nr);
  const gm = new StandardMaterial('gm', scene); gm.specularColor = Color3.Black(); g.material = gm; g.receiveShadows = true;

  const K = makeModels(scene), N = makeNature(scene, {});
  for (const m of [...Object.values(K.things).flat(), ...Object.values(K.res), ...Object.values(N)]) m?.setEnabled(false); // шаблоны
  const clone = (m: Mesh | null, parent: TransformNode) => { if (!m) return null; const c = m.clone(m.name + '_c', parent)!; c.setEnabled(true); sh.addShadowCaster(c); return c; };
  for (let i = 0; i < 70; i++) { // лес вокруг поляны
    const a = Math.random() * Math.PI * 2, r = 13 + Math.random() * 18, pine = Math.random() < 0.6, t = new TransformNode('t', scene);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); t.rotation.y = Math.random() * 6; t.scaling.setAll(1.3 + Math.random() * 0.9);
    clone(pine ? N.pineT : N.oakT, t); clone(pine ? N.pineL : N.oakL, t);
  }
  for (let i = 0; i < 8; i++) { const t = new TransformNode('r', scene); t.position.set((Math.random() - 0.5) * 20, 0, 6 + Math.random() * 6); t.scaling.setAll(1.5); clone(N['rock' + (i % 3)], t); }

  const TEAM = [new Color3(0.2, 0.45, 1), new Color3(0.9, 0.2, 0.2)].map((c, i) => { const m = new StandardMaterial('team' + i, scene); m.diffuseColor = c; m.specularColor = Color3.Black(); return m; });
  const TYPES = ['spearman', 'swordsman', 'clubman', 'archer', 'horseman', 'spearman', 'swordsman'];
  interface U { root: TransformNode; side: number; type: string; st: 'walk' | 'fight' | 'die'; t: number; dur: number; x: number; z: number; tx: number; id: number; shot: number }
  const us: U[] = [];
  const spawn = (u: U) => {
    u.x = u.side * (16 + Math.random() * 8); u.z = (Math.random() - 0.5) * 11;
    u.tx = u.side * (u.type === 'archer' ? 6 + Math.random() * 2 : 0.5 + Math.random() * 1.4);
    u.st = 'walk'; u.t = 0; u.root.rotation.set(0, u.side > 0 ? -Math.PI / 2 : Math.PI / 2, 0); u.root.position.y = 0;
  };
  for (const side of [-1, 1]) for (let i = 0; i < TYPES.length; i++) {
    const root = new TransformNode('u', scene), type = TYPES[i], [b, t] = K.things[type];
    clone(b, root); const tc = clone(t, root); if (tc) tc.material = TEAM[side < 0 ? 0 : 1];
    const u: U = { root, side, type, st: 'walk', t: 0, dur: 0, x: 0, z: 0, tx: 0, id: us.length, shot: 0 };
    spawn(u); u.x = side * (3 + Math.random() * 14); us.push(u);
  }
  const arrows: { m: Mesh; x0: number; z0: number; x1: number; z1: number; t: number }[] = [];
  let time = 0;
  engine.runRenderLoop(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    time += dt; setWind(time); cam.alpha += dt * 0.03;
    for (const u of us) {
      u.t += dt;
      if (u.st === 'walk') {
        u.x -= u.side * (u.type === 'horseman' ? 3.2 : 1.8) * dt;
        u.root.position.y = Math.abs(Math.sin(time * 9 + u.id)) * 0.06;
        if (Math.abs(u.x) <= Math.abs(u.tx)) { u.st = 'fight'; u.t = 0; u.dur = 3 + Math.random() * 6; }
      } else if (u.st === 'fight') {
        const k = Math.max(0, Math.sin(u.t * 7 + u.id)); // выпады
        u.root.position.x = u.x - u.side * k * 0.18; u.root.position.y = 0;
        if (u.type === 'archer' && (u.shot -= dt) <= 0) { // стрелы через поле боя
          u.shot = 1 + Math.random(); const m = K.res.arrow.clone('a')!; m.setEnabled(true);
          arrows.push({ m, x0: u.x, z0: u.z, x1: -u.side * (1 + Math.random() * 3), z1: u.z + (Math.random() - 0.5) * 4, t: 0 });
        }
        if (u.t > u.dur) { if (Math.random() < 0.5) { u.st = 'die'; u.t = 0; } else { u.t = 0; u.dur = 2 + Math.random() * 5; } }
        continue;
      } else { // падает набок, лежит, уходит в землю — и снова в строй
        u.root.rotation.z = u.side * (Math.PI / 2) * Math.min(1, u.t / 0.5);
        if (u.t > 2.5) u.root.position.y -= dt * 0.6;
        if (u.t > 4) { u.root.rotation.z = 0; spawn(u); }
      }
      u.root.position.x = u.x; u.root.position.z = u.z;
    }
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i]; a.t += dt / 0.9;
      if (a.t >= 1) { a.m.dispose(); arrows.splice(i, 1); continue; }
      a.m.position.set(a.x0 + (a.x1 - a.x0) * a.t, 0.7 + Math.sin(a.t * Math.PI) * 2, a.z0 + (a.z1 - a.z0) * a.t);
      a.m.rotation.y = Math.atan2(a.x1 - a.x0, a.z1 - a.z0);
    }
    scene.render();
  });
  const onResize = () => engine.resize();
  addEventListener('resize', onResize);
  return () => { removeEventListener('resize', onResize); engine.stopRenderLoop(); scene.dispose(); engine.dispose(); };
}

// ---------- Экраны меню ----------
export function runMenu(onStart: (cfg: StartCfg) => void) {
  const stop = background(document.getElementById('c') as HTMLCanvasElement);
  const root = document.createElement('div');
  root.id = 'menuRoot';
  document.body.append(root);
  let S: Settings = loadSettings(), tab = 'Графика', err = '';
  const saved = (() => { try { return JSON.parse(localStorage.getItem('epohi-lastgame') ?? 'null'); } catch { return null; } })();
  const G: StartCfg & { all: Slot[] } = saved ?? {
    size: 100, seed: 0, res: 'std', age: 0, pop: 200, speed: 1, fog: 'normal', events: true, victory: { terr: true, eco: true, cult: true, sci: true },
    slots: [], all: [{ type: 'human', team: 0, color: 0 }, { type: 'normal', team: 0, color: 1 }, ...[2, 3, 4, 5, 6, 7].map((c) => ({ type: 'closed', team: 0, color: c }) as Slot)],
  };
  const side = `<div class="mside"><div class="mtitle">ЭПОХИ</div><div class="msub">Стратегия в реальном времени</div>
    <button class="mbtn" data-go="single">⚔ Одиночная игра</button>
    <button class="mbtn" disabled title="Скоро">🌐 Сетевая игра <small>(скоро)</small></button>
    <button class="mbtn" data-go="settings">⚙ Настройки</button>
    <div style="flex:1"></div><small style="opacity:.5">сб.23</small></div>`;
  const sel = (attr: string, v: string | number, opts: [string | number, string][]) => `<select ${attr}>${opts.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const row = (label: string, ctl: string, hint = '') => `<div class="mrow"><div>${label}${hint ? `<br><small style="opacity:.6">${hint}</small>` : ''}</div><div>${ctl}</div></div>`;

  const screens: Record<string, () => string> = {
    main: () => side,
    settings: () => {
      const tabs = [...new Set(FIELDS.map((f) => f.tab)), 'Управление'];
      const body = tab === 'Управление'
        ? KEYS.map(([k, a]) => row(`<b>${k}</b>`, a)).join('')
        : FIELDS.filter((f) => f.tab === tab).map((f) => {
          const v = S[f.k] as never;
          const ctl = f.kind === 'sel' ? sel(`data-set="${f.k}"`, v, f.opts!)
            : f.kind === 'check' ? `<input type="checkbox" data-set="${f.k}" ${v ? 'checked' : ''}>`
            : f.kind === 'range' ? `<input type="range" data-set="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"> <b>${v}${f.unit ?? ''}</b>`
            : `<input type="text" data-set="${f.k}" value="${v}">`;
          return row(f.label, ctl, f.hint);
        }).join('');
      return side + `<div class="mpanel"><h2>Настройки</h2><div class="mtabs">${tabs.map((t) => `<div class="mtab ${t === tab ? 'on' : ''}" data-tab="${t}">${t}</div>`).join('')}</div>${body}
        <div class="mfoot"><button class="mbtn" data-go="main">← Назад</button><button class="mbtn" data-go="reset">Сбросить всё</button></div></div>`;
    },
    single: () => {
      const types: [string, string][] = [['human', 'Вы'], ['easy', 'Бот: лёгкий'], ['normal', 'Бот: средний'], ['hard', 'Бот: сложный'], ['closed', 'Закрыто']];
      const teams: [number, string][] = [[0, '—'], [1, 'Команда 1'], [2, 'Команда 2'], [3, 'Команда 3'], [4, 'Команда 4']];
      const slots = G.all.map((s, i) => `<tr style="${s.type === 'closed' ? 'opacity:.45' : ''}"><td>${i + 1}</td><td>${sel(`data-slot="${i}" data-f="type"`, s.type, types)}</td>
        <td>${sel(`data-slot="${i}" data-f="team"`, s.team, teams)}</td>
        <td><span class="sw" style="background:rgb(${COLORS[s.color][1].map((c) => c * 255).join(',')})"></span>${sel(`data-slot="${i}" data-f="color"`, s.color, COLORS.map(([n], k) => [k, n]))}</td></tr>`).join('');
      const g = (k: string, v: string | number, o: [string | number, string][]) => sel(`data-g="${k}"`, v, o);
      const vc = (k: keyof StartCfg['victory'], l: string) => `<label><input type="checkbox" data-v="${k}" ${G.victory[k] ? 'checked' : ''}> ${l}</label><br>`;
      return side + `<div class="mpanel"><h2>Одиночная игра</h2><div class="mgrid"><div>
        ${row('Размер карты', g('size', G.size, [[72, 'Маленькая'], [100, 'Средняя'], [128, 'Большая'], [160, 'Огромная']]))}
        ${row('Зерно карты', `<input type="number" data-g="seed" value="${G.seed}" style="width:110px"> <button class="mbtn sm" data-go="dice">🎲</button>`, '0 — каждый раз новая карта')}
        ${row('Стартовые ресурсы', g('res', G.res, [['std', 'Стандарт'], ['high', 'Много'], ['max', 'Очень много']]))}
        ${row('Стартовая эпоха', g('age', G.age, [[0, 'Первобытная'], [1, 'Древняя']]))}
        ${row('Лимит населения', g('pop', G.pop, [[100, '100'], [200, '200'], [300, '300']]))}
        ${row('Скорость игры', g('speed', G.speed, [[0.5, 'Медленно'], [1, 'Нормально'], [1.5, 'Быстро'], [2, 'Очень быстро']]))}
        ${row('Туман войны', g('fog', G.fog, [['normal', 'Обычный'], ['explored', 'Карта разведана'], ['none', 'Нет']]))}
        ${row('Случайные события', `<input type="checkbox" data-g="events" ${G.events ? 'checked' : ''}>`)}
        ${row('Условия победы', `<div style="text-align:left">⚔ Военная — всегда<br>${vc('terr', 'Территориальная')}${vc('eco', 'Экономическая')}${vc('cult', 'Культурная')}${vc('sci', 'Научная')}</div>`)}
      </div><div><table class="slots"><tr><th>#</th><th>Игрок</th><th>Команда</th><th>Цвет</th></tr>${slots}</table>
        <small style="opacity:.6">Игроки одной команды — союзники: общий обзор, не атакуют друг друга, побеждают вместе. «—» — каждый сам за себя.</small></div></div>
        <div class="merr">${err}</div>
        <div class="mfoot"><button class="mbtn" data-go="main">← Назад</button><button class="mbtn" data-go="start">▶ Начать</button></div></div>`;
    },
  };
  let cur = 'main';
  const draw = () => { root.innerHTML = screens[cur](); };
  draw();

  const start = () => {
    const open = G.all.filter((s) => s.type !== 'closed');
    const humans = open.filter((s) => s.type === 'human').length;
    const sides = new Set(open.map((s, i) => (s.team ? 'T' + s.team : 'S' + i)));
    err = humans !== 1 ? 'Нужен ровно один игрок «Вы».' : open.length < 2 ? 'Нужно хотя бы два участника.' : sides.size < 2 ? 'Все в одной команде — не с кем воевать.' : '';
    if (err) return draw();
    localStorage.setItem('epohi-lastgame', JSON.stringify(G));
    const cfg: StartCfg = { ...G, slots: open, seed: G.seed || ((Math.random() * 1e9) | 0) };
    root.remove(); stop(); onStart(cfg);
  };
  root.addEventListener('click', (e) => {
    const el = e.target as HTMLElement, go = el.closest('[data-go]') as HTMLElement | null, tb = el.closest('[data-tab]') as HTMLElement | null;
    if (tb) { tab = tb.dataset.tab!; draw(); }
    if (!go) return;
    const a = go.dataset.go!;
    if (a === 'start') return start();
    if (a === 'reset') { S = { ...DEFAULTS }; saveSettings(S); }
    if (a === 'dice') { G.seed = 1 + ((Math.random() * 999999) | 0); }
    else if (a !== 'reset') { cur = a; err = ''; }
    draw();
  });
  const onChange = (e: Event) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (el.dataset.set) { // настройка
      const f = FIELDS.find((x) => x.k === el.dataset.set)!, k = f.k as string, old = (S as unknown as Record<string, unknown>)[k];
      const v = f.kind === 'check' ? (el as HTMLInputElement).checked : f.kind === 'text' ? el.value : typeof old === 'number' ? Number(el.value) : el.value;
      (S as unknown as Record<string, unknown>)[k] = v;
      if (k === 'preset' && v !== 'custom') Object.assign(S, PRESETS[v as string]);
      else if (f.tab === 'Графика' && k !== 'preset') S.preset = 'custom';
      saveSettings(S);
      if (e.type === 'change') draw(); else { const b = el.parentElement?.querySelector('b'); if (b) b.textContent = `${v}${f.unit ?? ''}`; }
    } else if (el.dataset.slot) { // слот игрока
      const s = G.all[Number(el.dataset.slot)], f = el.dataset.f as keyof Slot;
      (s as unknown as Record<string, unknown>)[f] = f === 'type' ? el.value : Number(el.value);
      if (f === 'type' && el.value === 'human') G.all.forEach((o, i) => { if (o !== s && o.type === 'human') G.all[i].type = 'normal'; }); // «Вы» — только один
      draw();
    } else if (el.dataset.g) {
      const k = el.dataset.g as keyof StartCfg;
      (G as unknown as Record<string, unknown>)[k] = k === 'events' ? (el as HTMLInputElement).checked : ['res', 'fog'].includes(k) ? el.value : Number(el.value);
    } else if (el.dataset.v) G.victory[el.dataset.v as keyof StartCfg['victory']] = (el as HTMLInputElement).checked;
  };
  root.addEventListener('change', onChange);
  root.addEventListener('input', (e) => { if ((e.target as HTMLInputElement).type === 'range') onChange(e); });
}
