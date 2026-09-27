// Все игровые данные. Баланс правится здесь.
export const TICK_MS = 100; // 10 тиков в секунду
export const TILE = 1000;   // 1 клетка = 1000 единиц: только целые числа → детерминизм

export const RES = ['food', 'wood', 'stone', 'iron', 'gold', 'energy'] as const; // золото — элита, технологии, торговля; энергия — с Индустриальной эпохи, её дают электростанции (GDD §3)
export type Res = (typeof RES)[number];
export type Cost = Partial<Record<Res, number>>;
export type Cls = 'worker' | 'trade' | 'infantry' | 'spear' | 'ranged' | 'cavalry' | 'siege' | 'armor' | 'air' | 'building' | 'animal';

export interface UnitDef {
  cls: Cls; age: number; hp: number; atk: number; armor: number;
  range: number; cd: number; speed: number; sight: number; // range/speed в единицах, sight в клетках
  cost: Cost; time: number; bonus?: Partial<Record<Cls, number>>; // bonus: % урона по классу
  animal?: boolean; // скот: не занимает население, после гибели — туша с мясом
  air?: boolean;      // летает: над водой, горами и стенами, по прямой; достают только стрелки, башни и зенитки
  hitsAir?: boolean;  // может ли бить авиацию (по умолчанию — если стреляет, range > 2000)
  airOnly?: boolean;  // бьёт только авиацию (зенитка)
  pierce?: boolean;   // энергетическое оружие: броня цели не учитывается
  noPop?: boolean;    // автономный (дрон): население не занимает, но не больше DRONE_CAP на центр дронов
  splash?: number;    // урон по площади: враги в этом радиусе от цели получают половину удара (РСЗО)
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
  // Охотник (I): метатель дротиков — первый стрелок, против дубинщиков
  hunter:    { cls: 'ranged',   age: 0, hp: 30,  atk: 3, armor: 0, range: 3500, cd: 22, speed: 140, sight: 7, cost: { food: 40, wood: 20 },  time: 140, bonus: { infantry: 150 } },
  // Разведчик (II): быстрая лёгкая конница — рейды по жителям и осаде, большой обзор
  scout:     { cls: 'cavalry',  age: 1, hp: 55,  atk: 4, armor: 0, range: M,    cd: 16, speed: 230, sight: 10, cost: { food: 80 },           time: 150, bonus: { worker: 200, siege: 200, trade: 250 } },
  // Торговая повозка (II): возит золото между рынками — чем длиннее путь, тем больше; беззащитна — цель для рейдов
  trader:    { cls: 'trade',    age: 1, hp: 70,  atk: 0, armor: 1, range: 0,    cd: 30, speed: 150, sight: 6, cost: { food: 100, wood: 60 }, time: 200 },
  // Легионер (II): тяжёлая пехота — ломает строй копейщиков
  legionary: { cls: 'infantry', age: 1, hp: 60,  atk: 7, armor: 3, range: M,    cd: 15, speed: 130, sight: 6, cost: { food: 50, iron: 20 },  time: 170, bonus: { spear: 150 } },
  // Арбалетчик (III): медленный бронебойный выстрел — по пехоте и коннице
  crossbowman: { cls: 'ranged', age: 2, hp: 40,  atk: 8, armor: 1, range: 5500, cd: 28, speed: 125, sight: 8, cost: { food: 30, wood: 40, gold: 25 }, time: 180, bonus: { infantry: 150, cavalry: 120 } },
  // Рыцарь (III): тяжёлая конница — таран по пехоте, но копейщики его останавливают
  knight:    { cls: 'cavalry',  age: 2, hp: 130, atk: 11, armor: 4, range: M,   cd: 18, speed: 180, sight: 7, cost: { food: 80, iron: 40, gold: 50 },  time: 240, bonus: { infantry: 150 } },
  horseman:  { cls: 'cavalry',  age: 2, hp: 90,  atk: 8, armor: 2, range: M,    cd: 18, speed: 200, sight: 7, cost: { food: 60, iron: 40 },  time: 200, bonus: { ranged: 200, worker: 150 } },
  cow:       { cls: 'animal',   age: 0, hp: 12,  atk: 0, armor: 0, range: 0,    cd: 30, speed: 45,  sight: 2, cost: { food: 30 },            time: 150, animal: true },
  // ---------- IV Имперская: порох ----------
  musketeer: { cls: 'ranged',   age: 3, hp: 60,  atk: 14, armor: 1, range: 5000, cd: 40, speed: 125, sight: 8, cost: { food: 60, iron: 30, gold: 20 }, time: 200, bonus: { cavalry: 150, infantry: 120 } },
  cuirassier: { cls: 'cavalry', age: 3, hp: 150, atk: 13, armor: 4, range: M,   cd: 18, speed: 190, sight: 7, cost: { food: 100, iron: 50, gold: 60 }, time: 240, bonus: { ranged: 150 } },
  cannon:    { cls: 'siege',    age: 3, hp: 120, atk: 40, armor: 2, range: 7000, cd: 60, speed: 70,  sight: 8, cost: { wood: 200, iron: 150, gold: 100 }, time: 350, bonus: { building: 300 } },
  // ---------- V Индустриальная: винтовки, пулемёты, энергия ----------
  rifleman:  { cls: 'ranged',   age: 4, hp: 80,  atk: 16, armor: 2, range: 6000, cd: 30, speed: 135, sight: 8, cost: { food: 70, iron: 40, gold: 20 }, time: 200, bonus: { infantry: 120, cavalry: 150 } },
  machinegunner: { cls: 'ranged', age: 4, hp: 90, atk: 6, armor: 2, range: 5500, cd: 6,  speed: 100, sight: 8, cost: { food: 80, iron: 60, energy: 20 }, time: 240, bonus: { infantry: 200, cavalry: 150 } },
  artillery: { cls: 'siege',    age: 4, hp: 150, atk: 60, armor: 3, range: 9000, cd: 70, speed: 60,  sight: 9, cost: { iron: 250, gold: 100, energy: 50 }, time: 400, bonus: { building: 300 } },
  // ---------- VI Механизированная: танки и самолёты ----------
  tank:      { cls: 'armor',    age: 5, hp: 400, atk: 30, armor: 8, range: 5000, cd: 35, speed: 150, sight: 8, cost: { iron: 150, gold: 100, energy: 120 }, time: 400, bonus: { infantry: 150, ranged: 150, building: 150 } },
  bazooka:   { cls: 'infantry', age: 5, hp: 90,  atk: 10, armor: 2, range: 4500, cd: 35, speed: 125, sight: 8, cost: { food: 80, iron: 40, energy: 20 }, time: 220, bonus: { armor: 400, siege: 200 } },
  aa_gun:    { cls: 'siege',    age: 5, hp: 150, atk: 18, armor: 3, range: 7000, cd: 15, speed: 80,  sight: 10, cost: { iron: 100, energy: 60 }, time: 250, bonus: { air: 300 }, airOnly: true },
  fighter:   { cls: 'air',      age: 5, hp: 160, atk: 14, armor: 2, range: 4000, cd: 12, speed: 320, sight: 11, cost: { iron: 100, gold: 100, energy: 100 }, time: 300, bonus: { air: 300 }, air: true },
  bomber:    { cls: 'air',      age: 5, hp: 220, atk: 60, armor: 3, range: 1500, cd: 80, speed: 250, sight: 10, cost: { iron: 120, gold: 150, energy: 150 }, time: 400, bonus: { building: 300, armor: 150, siege: 150 }, air: true, hitsAir: false },
  // ---------- VII Современная: БТР, реактивная авиация, ракеты ----------
  marine:    { cls: 'ranged',   age: 6, hp: 110, atk: 18, armor: 3, range: 6000, cd: 25, speed: 140, sight: 9, cost: { food: 90, iron: 40, energy: 20 }, time: 220, bonus: { infantry: 130, cavalry: 130 } },
  apc:       { cls: 'armor',    age: 6, hp: 300, atk: 9,  armor: 6, range: 4500, cd: 8,  speed: 230, sight: 9, cost: { iron: 120, gold: 60, energy: 80 }, time: 300, bonus: { infantry: 150, ranged: 150 } },
  mlrs:      { cls: 'siege',    age: 6, hp: 180, atk: 45, armor: 3, range: 10000, cd: 90, speed: 110, sight: 9, cost: { iron: 150, gold: 120, energy: 150 }, time: 400, bonus: { building: 200, infantry: 150, ranged: 150 }, splash: 1800 },
  sam:       { cls: 'siege',    age: 6, hp: 180, atk: 40, armor: 3, range: 9000, cd: 30, speed: 120, sight: 12, cost: { iron: 120, energy: 120 }, time: 300, bonus: { air: 300 }, airOnly: true },
  jet:       { cls: 'air',      age: 6, hp: 220, atk: 26, armor: 3, range: 5000, cd: 10, speed: 420, sight: 12, cost: { iron: 120, gold: 150, energy: 180 }, time: 350, bonus: { air: 300 }, air: true },
  helicopter: { cls: 'air',     age: 6, hp: 260, atk: 20, armor: 4, range: 4500, cd: 14, speed: 260, sight: 10, cost: { iron: 150, gold: 120, energy: 150 }, time: 350, bonus: { armor: 250, siege: 150 }, air: true, hitsAir: false },
  // ---------- VIII Футуристическая: дроны и энергетическое оружие ----------
  laser_trooper: { cls: 'ranged', age: 7, hp: 130, atk: 22, armor: 4, range: 6500, cd: 20, speed: 145, sight: 10, cost: { food: 100, gold: 40, energy: 80 }, time: 240, bonus: { infantry: 130 }, pierce: true },
  drone:     { cls: 'air',      age: 7, hp: 60,  atk: 8,  armor: 1, range: 3500, cd: 8,  speed: 380, sight: 10, cost: { iron: 20, energy: 60 }, time: 120, bonus: { ranged: 130, worker: 200 }, air: true, noPop: true },
  mech:      { cls: 'armor',    age: 7, hp: 700, atk: 40, armor: 10, range: 5000, cd: 25, speed: 140, sight: 10, cost: { iron: 300, gold: 200, energy: 250 }, time: 450, bonus: { armor: 150, building: 150 }, pierce: true },
  railgun:   { cls: 'siege',    age: 7, hp: 200, atk: 120, armor: 4, range: 13000, cd: 100, speed: 100, sight: 12, cost: { iron: 200, gold: 200, energy: 300 }, time: 450, bonus: { building: 200, armor: 150 }, pierce: true },
  ram:       { cls: 'siege',    age: 2, hp: 150, atk: 3, armor: 5, range: M,    cd: 40, speed: 90,  sight: 4, cost: { wood: 150, iron: 50 }, time: 300, bonus: { building: 1500 } },
};

export const BUILDINGS: Record<string, BuildingDef> = {
  town_center: { age: 0, hp: 1500, armor: 3, size: 3, cost: { wood: 300, stone: 200 }, time: 600, pop: 10,
                 drop: ['food', 'wood', 'stone', 'iron', 'gold'], trains: ['villager'], atk: 5, range: 6000, cd: 20 },
  house:    { age: 0, hp: 300, armor: 1, size: 2, cost: { wood: 30 },  time: 150, pop: 5 },
  farm:     { age: 0, hp: 200, armor: 0, size: 2, cost: { wood: 50 },  time: 120 }, // поле пшеницы: только рядом с фермой, бесконечная еда, 1 работник
  pasture:  { age: 0, hp: 500, armor: 1, size: 3, cost: { wood: 120 }, time: 250, trains: ['cow'], drop: ['food'] }, // ферма: амбар + загон, коровы и приём еды
  camp:     { age: 0, hp: 400, armor: 1, size: 2, cost: { wood: 80 },  time: 200, drop: ['food', 'wood', 'stone', 'iron', 'gold'] }, // лагерь принимает любые ресурсы
  barracks: { age: 0, hp: 800, armor: 2, size: 3, cost: { wood: 150 }, time: 300, trains: ['clubman', 'hunter', 'spearman', 'scout', 'legionary', 'swordsman', 'musketeer', 'rifleman', 'machinegunner', 'bazooka', 'marine', 'laser_trooper'] },
  archery:  { age: 1, hp: 700, armor: 2, size: 3, cost: { wood: 150 }, time: 300, trains: ['archer', 'crossbowman'] },
  tower:    { age: 1, hp: 700, armor: 4, size: 1, cost: { wood: 25, stone: 100 }, time: 250, atk: 6, range: 6000, cd: 20, sight: 9 },
  wall:     { age: 0, hp: 400, armor: 6, size: 1, cost: { stone: 5 }, time: 40 },
  gate:     { age: 0, hp: 600, armor: 6, size: 1, cost: { stone: 30 }, time: 120 }, // своих пропускает, чужих — нет
  market:   { age: 1, hp: 800, armor: 2, size: 3, cost: { wood: 175 }, time: 300, trains: ['trader'] }, // рынок: обмен ресурсов на золото, торговые повозки
  stable:   { age: 2, hp: 800, armor: 2, size: 3, cost: { wood: 150, stone: 50 }, time: 300, trains: ['horseman', 'knight', 'cuirassier'] },
  workshop: { age: 2, hp: 800, armor: 2, size: 3, cost: { wood: 200, iron: 50 },  time: 400, trains: ['ram', 'cannon', 'artillery'] },
  factory:  { age: 5, hp: 1200, armor: 4, size: 3, cost: { wood: 300, stone: 300, iron: 200 }, time: 450, trains: ['aa_gun', 'sam', 'tank', 'apc', 'mlrs', 'mech', 'railgun'] }, // завод
  airfield: { age: 5, hp: 1000, armor: 3, size: 3, cost: { stone: 400, iron: 200, gold: 150 }, time: 450, trains: ['fighter', 'bomber', 'helicopter', 'jet'] }, // аэродром
  drone_hub: { age: 7, hp: 900, armor: 4, size: 2, cost: { stone: 300, iron: 200, energy: 200 }, time: 400, trains: ['drone'] }, // центр дронов: до DRONE_CAP дронов на каждый
  power_plant: { age: 4, hp: 900, armor: 3, size: 2, cost: { wood: 200, stone: 200, iron: 150 }, time: 400 }, // электростанция: +ENERGY_RATE энергии каждые 10 тиков
};

export const AGE_NAMES = ['Первобытная', 'Древняя', 'Средневековая', 'Имперская', 'Индустриальная', 'Механизированная', 'Современная', 'Футуристическая'];
export const DRONE_CAP = 12; // дронов на один центр дронов
export const ENERGY_RATE = 1; // энергии за 10 тиков (6 в минуту) с одной электростанции

// Рост поселения (GDD §3): посёлок → деревня → город → столица. Растёт от населения, числа зданий и эпохи.
// Каждый уровень: +SETTLE_GATHER% к добыче и +SETTLE_HP% к прочности зданий; в городе дороги мостятся камнем
export const SETTLE: { name: string; grew: string; into: string; pop: number; blds: number; age: number }[] = [ // grew — «вырос(ла)», into — «в кого»
  { name: 'Посёлок', grew: 'вырос', into: '', pop: 0, blds: 0, age: 0 },
  { name: 'Деревня', grew: 'выросла', into: 'деревню', pop: 15, blds: 8, age: 0 },
  { name: 'Город', grew: 'вырос', into: 'город', pop: 35, blds: 18, age: 1 },
  { name: 'Столица', grew: 'выросла', into: 'столицу', pop: 70, blds: 30, age: 2 },
  { name: 'Мегаполис', grew: 'выросла', into: 'мегаполис', pop: 120, blds: 45, age: 4 },
];
export const SETTLE_GATHER = 4, SETTLE_HP = 5;
export const AGE_COST: Cost[] = [{ food: 500, wood: 200 }, { food: 800, stone: 200, iron: 150, gold: 100 },
  { food: 1200, wood: 400, iron: 300, gold: 300 }, { food: 1600, stone: 300, iron: 500, gold: 500 }, { food: 2000, iron: 700, gold: 600, energy: 200 }, { food: 2500, iron: 800, gold: 800, energy: 400 }, { food: 3000, iron: 1000, gold: 1000, energy: 800 }]; // цена перехода в эпоху i+1 // цена перехода в эпоху i+1
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
export const RES_AMOUNT: Record<Res, number> = { food: 150, wood: 100, stone: 300, iron: 300, gold: 400, energy: 0 };
// Рынок: цена 100 единиц ресурса в золоте. Покупка поднимает цену, продажа — снижает; продажа с комиссией
export const MARKET_BASE: Partial<Record<Res, number>> = { food: 100, wood: 100, stone: 130, iron: 150, energy: 120 }; // энергию можно продать (купить — тоже)
export const MARKET_STEP = 6, MARKET_MIN = 25, MARKET_MAX = 400, MARKET_FEE = 25; // %, комиссия при продаже
export const TRADE_MIN = 12; // торговля — между рынками не ближе стольких клеток; золото за рейс ≈ дистанция² / TRADE_K
export const TRADE_K = 30;
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
