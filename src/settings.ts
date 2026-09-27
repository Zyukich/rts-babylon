// Настройки игрока (хранятся в браузере) и параметры новой партии из меню.
export interface Settings {
  preset: 'low' | 'medium' | 'high' | 'ultra' | 'custom';
  renderScale: number; msaa: boolean; fxaa: boolean; shadows: number; ssao: boolean; bloom: boolean; vignette: boolean;
  saturation: number; grass: number; grassDist: number; wind: boolean; fpsLimit: number; showFps: boolean;
  master: number; sfx: number; music: number;
  camSpeed: number; edgeScroll: boolean; hpBars: 'damaged' | 'always' | 'selected'; uiScale: number; hints: boolean;
  name: string; server: string;
}
export const PRESETS: Record<string, Partial<Settings>> = {
  low: { renderScale: 0.75, msaa: false, fxaa: true, shadows: 0, ssao: false, bloom: false, vignette: false, grass: 30, grassDist: 60, wind: true },
  medium: { renderScale: 1, msaa: true, fxaa: true, shadows: 1024, ssao: false, bloom: true, vignette: true, grass: 70, grassDist: 80, wind: true },
  high: { renderScale: 1, msaa: true, fxaa: true, shadows: 2048, ssao: true, bloom: true, vignette: true, grass: 100, grassDist: 100, wind: true },
  ultra: { renderScale: 1.25, msaa: true, fxaa: true, shadows: 4096, ssao: true, bloom: true, vignette: true, grass: 150, grassDist: 130, wind: true },
};
export const DEFAULTS: Settings = {
  preset: 'high', renderScale: 1, msaa: true, fxaa: true, shadows: 2048, ssao: true, bloom: true, vignette: true,
  saturation: 38, grass: 100, grassDist: 100, wind: true, fpsLimit: 0, showFps: false,
  master: 80, sfx: 80, music: 60,
  camSpeed: 1, edgeScroll: true, hpBars: 'damaged', uiScale: 1, hints: true,
  name: 'Игрок', server: '',
};
export function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('epohi-settings') ?? '{}') }; } catch { return { ...DEFAULTS }; }
}
export const saveSettings = (s: Settings) => localStorage.setItem('epohi-settings', JSON.stringify(s));

type Opt = [string | number, string];
export interface Field { tab: string; k: keyof Settings; label: string; kind: 'sel' | 'range' | 'check' | 'text'; opts?: Opt[]; min?: number; max?: number; step?: number; unit?: string; hint?: string }
export const FIELDS: Field[] = [
  { tab: 'Графика', k: 'preset', label: 'Качество (пресет)', kind: 'sel', opts: [['low', 'Низкое'], ['medium', 'Среднее'], ['high', 'Высокое'], ['ultra', 'Ультра'], ['custom', 'Своё']] },
  { tab: 'Графика', k: 'renderScale', label: 'Разрешение рендера', kind: 'range', min: 0.5, max: 1.5, step: 0.05, unit: '×', hint: 'Меньше 1 — быстрее, больше 1 — чётче' },
  { tab: 'Графика', k: 'msaa', label: 'Сглаживание MSAA', kind: 'check', hint: 'Применится при следующем запуске партии' },
  { tab: 'Графика', k: 'fxaa', label: 'Сглаживание FXAA', kind: 'check' },
  { tab: 'Графика', k: 'shadows', label: 'Тени', kind: 'sel', opts: [[0, 'Выключены'], [1024, 'Низкие'], [2048, 'Средние'], [4096, 'Высокие']] },
  { tab: 'Графика', k: 'ssao', label: 'Мягкое затенение (SSAO)', kind: 'check', hint: 'Объём в углах и у земли. Самое «тяжёлое»' },
  { tab: 'Графика', k: 'bloom', label: 'Свечение (bloom)', kind: 'check' },
  { tab: 'Графика', k: 'vignette', label: 'Затемнение краёв', kind: 'check' },
  { tab: 'Графика', k: 'saturation', label: 'Насыщенность цвета', kind: 'range', min: 0, max: 70, step: 1 },
  { tab: 'Графика', k: 'grass', label: 'Густота травы', kind: 'range', min: 0, max: 150, step: 5, unit: '%', hint: '0 — без травы' },
  { tab: 'Графика', k: 'grassDist', label: 'Дальность травы', kind: 'range', min: 40, max: 150, step: 5, unit: '%' },
  { tab: 'Графика', k: 'wind', label: 'Ветер (трава и деревья колышутся)', kind: 'check' },
  { tab: 'Графика', k: 'fpsLimit', label: 'Ограничение FPS', kind: 'sel', opts: [[0, 'Без ограничения'], [30, '30'], [60, '60'], [120, '120']] },
  { tab: 'Графика', k: 'showFps', label: 'Показывать FPS', kind: 'check' },
  { tab: 'Звук', k: 'master', label: 'Общая громкость', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
  { tab: 'Звук', k: 'sfx', label: 'Эффекты', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
  { tab: 'Звук', k: 'music', label: 'Музыка', kind: 'range', min: 0, max: 100, step: 1, unit: '%', hint: 'Музыки пока нет' },
  { tab: 'Игра', k: 'camSpeed', label: 'Скорость камеры', kind: 'range', min: 0.5, max: 2.5, step: 0.1, unit: '×' },
  { tab: 'Игра', k: 'edgeScroll', label: 'Прокрутка мышью у края экрана', kind: 'check' },
  { tab: 'Игра', k: 'hpBars', label: 'Полоски здоровья', kind: 'sel', opts: [['damaged', 'У раненых и выбранных'], ['always', 'Всегда'], ['selected', 'Только у выбранных']] },
  { tab: 'Игра', k: 'uiScale', label: 'Масштаб интерфейса', kind: 'range', min: 0.75, max: 1.5, step: 0.05, unit: '×' },
  { tab: 'Игра', k: 'hints', label: 'Подсказки по управлению', kind: 'check' },
  { tab: 'Сеть', k: 'name', label: 'Имя в сетевой игре', kind: 'text' },
  { tab: 'Сеть', k: 'server', label: 'Адрес сервера', kind: 'text', hint: 'Пусто — тот же компьютер (ws://…:8080)' },
];
export const KEYS: [string, string][] = [
  ['ЛКМ / рамка', 'Выбрать / выбрать группу'], ['Двойной клик', 'Все такие же на экране'], ['ПКМ', 'Приказ (для зданий — точка сбора)'], ['Shift+ПКМ', 'Приказ в очередь'],
  ['F + ЛКМ', 'Атака с движением'], ['X', 'Стоп'], ['Del', 'Снести / распустить'], ['H', 'К столице'], ['.', 'Следующий бездельник'], [',', 'Вся армия'],
  ['Ctrl/Shift + 1…9', 'Запомнить группу'], ['1…9', 'Выбрать группу'], ['Пробел', 'К месту атаки'], ['Буквы на кнопках', 'Команды панели'],
  ['WASD / стрелки / край экрана', 'Камера'], ['Колесо', 'Приближение'], ['Home / End', 'Поворот камеры'], ['O', 'Тени вкл/выкл'], ['P', 'SSAO вкл/выкл'], ['F10', 'Пауза / меню'],
];

// ---------- Новая партия ----------
export type SlotType = 'human' | 'easy' | 'normal' | 'hard' | 'closed';
export interface Slot { type: SlotType; team: number; color: number }
export interface StartCfg {
  size: number; seed: number; slots: Slot[]; res: 'std' | 'high' | 'max'; age: number; pop: number; speed: number;
  fog: 'normal' | 'explored' | 'none'; events: boolean; victory: { terr: boolean; eco: boolean; cult: boolean; sci: boolean };
}
export const COLORS: [string, number[]][] = [
  ['Синий', [0.2, 0.45, 1]], ['Красный', [0.9, 0.2, 0.2]], ['Жёлтый', [0.95, 0.8, 0.2]], ['Зелёный', [0.3, 0.8, 0.3]],
  ['Фиолетовый', [0.7, 0.3, 0.9]], ['Бирюзовый', [0.2, 0.8, 0.8]], ['Оранжевый', [1, 0.55, 0.1]], ['Белый', [0.9, 0.9, 0.9]],
];
