// Все игровые данные. Баланс правится здесь.
export const TICK_MS = 100; // 10 тиков в секунду
export const TILE = 1000;   // 1 клетка = 1000 единиц: только целые числа → детерминизм

export const RES = ['food', 'wood', 'stone', 'iron'] as const;
export type Res = (typeof RES)[number];
export type Cost = Partial<Record<Res, number>>;
export type Cls = 'worker' | 'infantry' | 'spear' | 'ranged' | 'cavalry' | 'siege' | 'building' | 'animal';

export interface UnitDef {
  cls: Cls; age: number; hp: number; atk: number; armor: number;
  range: number; cd: number; speed: number; sight: number; // range/speed в единицах, sight в клетках
  cost: Cost; time: number; bonus?: Partial<Record<Cls, number>>; // bonus: % урона по классу
  animal?: boolean; // скот: не занимает население, после гибели — туша с мясом
}
export interface BuildingDef {
  age: number; hp: number; armor: number; size: number; cost: Cost; time: number;
  pop?: number; drop?: Res[]; trains?: string[]; atk?: number; range?: number; cd?: number; sight?: number;
}

const M = 1500; // ближний бой: соседняя клетка с диагональю

export const UNITS: Record<string, UnitDef> = {
  villager:  { cls: 'worker',   age: 0, hp: 25,  atk: 3, armor: 0, range: M,    cd: 15, speed: 120, sight: 6, cost: { food: 50 },            time: 130 },
  clubman:   { cls: 'infantry', age: 0, hp: 40,  atk: 5, armor: 1, range: M,    cd: 15, speed: 135, sight: 6, cost: { food: 50, wood: 10 },  time: 150, bonus: { building: 200 } },
  spearman:  { cls: 'spear',    age: 1, hp: 45,  atk: 4, armor: 1, range: M,    cd: 15, speed: 135, sight: 6, cost: { food: 40, wood: 30 },  time: 150, bonus: { cavalry: 300 } },
  archer:    { cls: 'ranged',   age: 1, hp: 30,  atk: 5, armor: 0, range: 5000, cd: 20, speed: 135, sight: 8, cost: { food: 20, wood: 40 },  time: 160, bonus: { infantry: 150, spear: 150 } },
  swordsman: { cls: 'infantry', age: 2, hp: 70,  atk: 9, armor: 3, range: M,    cd: 15, speed: 135, sight: 6, cost: { food: 50, iron: 30 },  time: 180 },
  horseman:  { cls: 'cavalry',  age: 2, hp: 90,  atk: 8, armor: 2, range: M,    cd: 18, speed: 200, sight: 7, cost: { food: 60, iron: 40 },  time: 200, bonus: { ranged: 200, worker: 150 } },
  cow:       { cls: 'animal',   age: 0, hp: 12,  atk: 0, armor: 0, range: 0,    cd: 30, speed: 45,  sight: 2, cost: { food: 30 },            time: 150, animal: true },
  ram:       { cls: 'siege',    age: 2, hp: 150, atk: 3, armor: 5, range: M,    cd: 40, speed: 90,  sight: 4, cost: { wood: 150, iron: 50 }, time: 300, bonus: { building: 1500 } },
};

export const BUILDINGS: Record<string, BuildingDef> = {
  town_center: { age: 0, hp: 1500, armor: 3, size: 3, cost: { wood: 300, stone: 200 }, time: 600, pop: 10,
                 drop: ['food', 'wood', 'stone', 'iron'], trains: ['villager'], atk: 5, range: 6000, cd: 20 },
  house:    { age: 0, hp: 300, armor: 1, size: 2, cost: { wood: 30 },  time: 150, pop: 5 },
  farm:     { age: 0, hp: 200, armor: 0, size: 2, cost: { wood: 50 },  time: 120 }, // поле пшеницы: только рядом с фермой, бесконечная еда, 1 работник
  pasture:  { age: 0, hp: 500, armor: 1, size: 3, cost: { wood: 120 }, time: 250, trains: ['cow'], drop: ['food'] }, // ферма: амбар + загон, коровы и приём еды
  camp:     { age: 0, hp: 400, armor: 1, size: 2, cost: { wood: 80 },  time: 200, drop: ['food', 'wood', 'stone', 'iron'] }, // лагерь принимает любые ресурсы
  barracks: { age: 0, hp: 800, armor: 2, size: 3, cost: { wood: 150 }, time: 300, trains: ['clubman', 'spearman', 'swordsman'] },
  archery:  { age: 1, hp: 700, armor: 2, size: 3, cost: { wood: 150 }, time: 300, trains: ['archer'] },
  tower:    { age: 1, hp: 700, armor: 4, size: 1, cost: { wood: 25, stone: 100 }, time: 250, atk: 6, range: 6000, cd: 20, sight: 9 },
  wall:     { age: 0, hp: 400, armor: 6, size: 1, cost: { stone: 5 }, time: 40 },
  gate:     { age: 0, hp: 600, armor: 6, size: 1, cost: { stone: 30 }, time: 120 }, // своих пропускает, чужих — нет
  stable:   { age: 2, hp: 800, armor: 2, size: 3, cost: { wood: 150, stone: 50 }, time: 300, trains: ['horseman'] },
  workshop: { age: 2, hp: 800, armor: 2, size: 3, cost: { wood: 200, iron: 50 },  time: 400, trains: ['ram'] },
};

export const AGE_NAMES = ['Первобытная', 'Древняя', 'Средневековая'];
export const AGE_COST: Cost[] = [{ food: 500, wood: 200 }, { food: 800, stone: 200, iron: 200 }]; // цена перехода в эпоху i+1
export const AGE_TIME = 600;
export const GATHER_TICKS = 8; // 1 ресурс за 0.8 с
export const CARRY = 10;
export const MEAT = 180; // мяса в туше коровы
export const FIELD_REACH = 3;
// Пшеница: участки-ресурсы вокруг фермы; собрали — участок исчез, досеять можно на ферме
export const WHEAT = 150, WHEAT_INIT = 8, WHEAT_SOW = 4, WHEAT_TIME = 100;
export const WHEAT_COST: Cost = { wood: 60 };
 // поле ставится не дальше стольких клеток от фермы
export const FARM_TICKS = 10;
export const RES_AMOUNT: Record<Res, number> = { food: 150, wood: 100, stone: 300, iron: 300 };
export const POP_MAX = 200;
export const QUEUE_MAX = 5;

// Рельеф: 0 равнина, 1 вода, 2 горы (непроходимы), 3 холм (медленнее, зато обзор и бонус к урону сверху)
export const T_HILL = 3;
export const HILL_BONUS = 25, COVER_BONUS = 30, HILL_SIGHT = 2, HILL_SPEED = 85; // %, %, клетки, % скорости

// Регионы: контроль даёт бонус к добыче своего ресурса внутри региона
export type RegionKind = 'plains' | 'forest' | 'quarry' | 'iron';
export const REGION_KINDS: Record<RegionKind, { noun: string; res: Res; desc: string }> = {
  plains: { noun: 'равнины', res: 'food', desc: '+30% еды и урожая' },
  forest: { noun: 'леса', res: 'wood', desc: '+30% дерева' },
  quarry: { noun: 'каменоломни', res: 'stone', desc: '+30% камня' },
  iron: { noun: 'горы', res: 'iron', desc: '+30% железа' },
};
export const REGION_BONUS = 30;
export const REGION_WEIGHT: Record<string, number> = { town_center: 5, tower: 3, wall: 0, gate: 0 }; // вес здания во влиянии, остальные — 1
export const TERR_SHARE = 60, TERR_HOLD = 1800; // территориальная победа: 60% регионов 3 минуты подряд

// Другие пути к победе
export const ECO_TARGET = 6000;   // сумма запасов, которую надо удержать
export const CULT_TARGET = 550;   // сумма очков культуры
export const FINAL_REQ = 5;       // изученных технологий для «Просвещения»
export const GOAL_HOLD = { eco: 1200, cult: 1800 }; // сколько тиков удерживать
export const WIN_NAMES: Record<string, string> = { mil: 'Военная', terr: 'Территориальная', eco: 'Экономическая', cult: 'Культурная', sci: 'Научная' };
// Динамические события: первое через 2.5–4.5 мин, дальше так же
export const EVENT_MIN = 1500, EVENT_VAR = 1200;
