import { Rng } from './rng.ts';
import { BUILDINGS, UNITS, RES, TILE, EVENT_MIN, EVENT_VAR, type Res, type RegionKind } from './defs.ts';
import { genMap } from './map.ts';
import { baseMods, baseStats, chron, type Branch, type Mods, type Stats, type Chron } from './civ.ts';

export type Order =
  | { t: 'idle' }
  | { t: 'move'; x: number; y: number }
  | { t: 'gather'; tile: number; back: boolean }
  | { t: 'build'; target: number }
  | { t: 'farm'; target: number; back: boolean }
  | { t: 'attack'; target: number; ax?: number; ay?: number } // ax/ay — куда вернуться после боя при атаке с движением
  | { t: 'amove'; x: number; y: number };

export interface Unit {
  id: number; kind: 'u'; type: string; owner: number; x: number; y: number; hp: number;
  order: Order; path: number[]; pkey: number; wait: number; cd: number;
  carry: number; carryRes: Res | null; timer: number; lastBy: number;
  sx: number; sy: number; // «место работы» вплотную к цели
  crowdT: number; // сколько тиков тесно у ресурса
  oq: Order[]; // очередь приказов (Shift)
}
export interface Building {
  id: number; kind: 'b'; type: string; owner: number; tx: number; ty: number; hp: number;
  progress: number; queue: string[]; qt: number; cd: number; rally: number; lastBy: number;
  rep: number; // накопленный ремонт (для списания ресурсов)
  open: number; auto: number;
  l0: number; l1: number; // стена: клетки начала и конца линии (для ровной отрисовки под любым углом) // ворота: 1 — открыты; auto: перестраивается сама (стена → ворота/башня)
}
export type Entity = Unit | Building;
export interface Region { name: string; kind: RegionKind; owner: number; size: number; }
export interface Player {
  id: number; res: Record<Res, number>; age: number; ageing: boolean; pop: number; popCap: number; alive: boolean;
  techs: string[]; culture: Record<Branch, number>; mods: Mods; stats: Stats; flags: Record<string, boolean>; econAcc: number;
  effects: Record<string, number>; bonusSlots: number; // временные эффекты событий (до какого тика), лишние слоты
}

export interface World {
  tick: number; W: number; H: number;
  teams: number[]; popMax: number; eventsOn: boolean; victory: { terr: boolean; eco: boolean; cult: boolean; sci: boolean }; // правила партии
  terrain: Uint8Array;  // 0 равнина, 1 вода, 2 горы, 3 холм
  resType: Uint8Array;  // 0 нет, иначе индекс RES + 1
  resAmt: Int32Array;
  resKind: Uint8Array;  // 1 — туша (мясо), 2 — пшеница (по ней можно ходить), иначе обычный ресурс
  carcass: Map<number, number>; // id погибшего животного → клетка туши
  occ: Int32Array;      // id здания на клетке
  region: Uint8Array;   // номер региона клетки
  regions: Region[];
  holdBy: number; holdT: number; // кто удерживает территорию и сколько тиков
  players: Player[]; ents: Map<number, Entity>; nextId: number;
  rng: Rng; winner: number; log: string[];
  fx: Fx[];
  chron: Chron[]; // хроника цивилизаций (p = -1 — общие события)
  goals: Goal[];  // идущие гонки к победе
  winKind: string; nextEvent: number; // события тика для звука/эффектов (не влияют на логику)
}
export interface Goal { kind: 'eco' | 'cult' | 'sci'; p: number; t: number; need: number; }
export interface Fx { k: 'hit' | 'die' | 'spawn' | 'built' | 'age' | 'news' | 'shot'; owner: number; x: number; y: number; type?: string; id?: number; tx?: number; ty?: number; }

export const STARTS = [[0.15, 0.15], [0.85, 0.85], [0.85, 0.15], [0.15, 0.85], [0.5, 0.12], [0.5, 0.88], [0.12, 0.5], [0.88, 0.5]];

export interface WorldOpts { teams?: number[]; startRes?: 'std' | 'high' | 'max'; startAge?: number; popMax?: number; events?: boolean; victory?: World['victory'] }
const START_RES = { std: { food: 200, wood: 200, stone: 100, iron: 0 }, high: { food: 1000, wood: 1000, stone: 500, iron: 300 }, max: { food: 5000, wood: 5000, stone: 3000, iron: 2000 } };
// Союзники: один игрок или одна команда (0 — без команды)
export const ally = (w: World, a: number, b: number) => a === b || (w.teams[a] > 0 && w.teams[a] === w.teams[b]);

export function createWorld(seed: number, nPlayers = 2, W = 100, H = 100, o: WorldOpts = {}): World {
  const w: World = {
    tick: 0, W, H, terrain: new Uint8Array(W * H), resType: new Uint8Array(W * H),
    resAmt: new Int32Array(W * H), resKind: new Uint8Array(W * H), carcass: new Map(), occ: new Int32Array(W * H), region: new Uint8Array(W * H), regions: [], holdBy: -1, holdT: 0, players: [], ents: new Map(),
    teams: o.teams ?? new Array(nPlayers).fill(0), popMax: o.popMax ?? 200, eventsOn: o.events ?? true,
    victory: o.victory ?? { terr: true, eco: true, cult: true, sci: true },
    nextId: 1, rng: new Rng(seed), winner: -1, log: [], fx: [], chron: [], goals: [], winKind: '', nextEvent: 0,
  };
  const starts = STARTS.slice(0, nPlayers).map(([fx, fy]) => [Math.floor(fx * W), Math.floor(fy * H)] as [number, number]);
  genMap(w, starts);
  w.nextEvent = EVENT_MIN + w.rng.int(EVENT_VAR);
  starts.forEach(([x, y], p) => {
    w.players.push({ id: p, res: { ...START_RES[o.startRes ?? 'std'] }, age: o.startAge ?? 0, ageing: false, pop: 0, popCap: 10, alive: true,
      techs: [], culture: { mil: 0, eco: 0, sci: 0, civ: 0 }, mods: baseMods(), stats: baseStats(), flags: {}, econAcc: 0, effects: {}, bonusSlots: 0 });
    chron(w, p, 'Основано поселение');
    const tc = addBuilding(w, 'town_center', p, x - 1, y - 1, true);
    for (let i = 0; i < 3; i++) spawnUnit(w, 'villager', p, tc); // «начал с трёх человек»
  });
  return w;
}

export const inb = (w: World, x: number, y: number) => x >= 0 && y >= 0 && x < w.W && y < w.H;
export const walkable = (w: World, i: number) => (w.terrain[i] === 0 || w.terrain[i] === 3) && (w.resType[i] === 0 || w.resKind[i] === 2) && w.occ[i] <= 0; // поле (occ < 0) и пшеница проходимы
// То же, но свои готовые ворота проходимы
export function passable(w: World, i: number, owner: number) {
  if (walkable(w, i)) return true;
  if (owner < 0 || !w.occ[i]) return false;
  const b = w.ents.get(w.occ[i]);
  return !!b && b.kind === 'b' && b.type === 'gate' && b.owner === owner && b.open === 1 && b.progress >= BUILDINGS.gate.time; // закрытые не пускают никого
}

// Чебышёвское расстояние от клетки до прямоугольника (0 = внутри, 1 = вплотную)
export function rectDist(w: World, i: number, rx: number, ry: number, rw: number, rh: number) {
  const x = i % w.W, y = (i / w.W) | 0;
  return Math.max(rx - x, x - (rx + rw - 1), ry - y, y - (ry + rh - 1), 0);
}

// Расстояние в единицах от точки до юнита или края здания
export function distTo(x: number, y: number, e: Entity) {
  let px = 0, py = 0;
  if (e.kind === 'u') { px = e.x; py = e.y; }
  else {
    const s = BUILDINGS[e.type].size * TILE;
    px = Math.min(Math.max(x, e.tx * TILE), e.tx * TILE + s);
    py = Math.min(Math.max(y, e.ty * TILE), e.ty * TILE + s);
  }
  const dx = px - x, dy = py - y;
  return Math.floor(Math.sqrt(dx * dx + dy * dy));
}

export function canPlace(w: World, tx: number, ty: number, size: number) {
  for (let y = ty; y < ty + size; y++) for (let x = tx; x < tx + size; x++)
    if (!inb(w, x, y) || !walkable(w, x + y * w.W) || w.occ[x + y * w.W] !== 0 || w.resType[x + y * w.W] !== 0) return false;
  return true;
}

export function addBuilding(w: World, type: string, owner: number, tx: number, ty: number, built: boolean): Building {
  const d = BUILDINGS[type];
  const b: Building = { id: w.nextId++, kind: 'b', type, owner, tx, ty, hp: built ? d.hp : 1, progress: built ? d.time : 0, queue: [], qt: 0, cd: 0, rally: -1, lastBy: -1, rep: 0, open: 1, auto: 0, l0: -1, l1: -1 };
  for (let y = ty; y < ty + d.size; y++) for (let x = tx; x < tx + d.size; x++) w.occ[x + y * w.W] = type === 'farm' ? -b.id : b.id;
  w.ents.set(b.id, b);
  return b;
}

// Ищем свободную клетку кольцами вокруг здания
// prefer — клетка точки сбора: появляемся с той стороны здания, что к ней ближе
export function spawnUnit(w: World, type: string, owner: number, b: Building, prefer = -1): Unit | null {
  const s = BUILDINGS[b.type].size;
  const px = prefer >= 0 ? prefer % w.W : b.tx + s, py = prefer >= 0 ? (prefer / w.W) | 0 : b.ty + s; // по умолчанию — к «переду»
  for (let r = 1; r < 8; r++) {
    let x = -1, y = -1, bd = Infinity;
    for (let yy = b.ty - r; yy < b.ty + s + r; yy++)
      for (let xx = b.tx - r; xx < b.tx + s + r; xx++) {
        if (xx > b.tx - r && xx < b.tx + s + r - 1 && yy > b.ty - r && yy < b.ty + s + r - 1) continue;
        if (!inb(w, xx, yy) || !walkable(w, xx + yy * w.W)) continue;
        const d = (xx - px) ** 2 + (yy - py) ** 2;
        if (d < bd) { bd = d; x = xx; y = yy; }
      }
    if (x < 0) continue;
    {
      const u: Unit = {
          id: w.nextId++, kind: 'u', type, owner, x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, hp: UNITS[type].hp,
          order: { t: 'idle' }, path: [], pkey: -1, wait: 0, cd: 0, carry: 0, carryRes: null, timer: 0, lastBy: -1, oq: [], sx: -1e9, sy: -1e9, crowdT: 0,
        };
        w.ents.set(u.id, u);
        if (!UNITS[type].animal) w.players[owner].pop++;
    return u;
    }
  }
  return null;
}

// Хеш состояния: сервер и клиенты сравнивают его, чтобы ловить рассинхрон
export function hash(w: World) {
  let h = 2166136261;
  const mix = (v: number) => { h = Math.imul(h ^ (v | 0), 16777619); };
  mix(w.tick);
  for (const p of w.players) for (const r of RES) mix(p.res[r]);
  for (const e of w.ents.values()) { mix(e.id); mix(e.hp); if (e.kind === 'u') { mix(e.x); mix(e.y); } }
  return (h >>> 0).toString(16);
}
