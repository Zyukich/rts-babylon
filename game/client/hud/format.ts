// Подписи и иконки для интерфейса.
import { UNITS, BUILDINGS, RES, TECHS, BRANCH, NAMES, type Cost } from '../../data/index.ts';

export const RES_ICON: Record<string, string> = { food: '🍖', wood: '🪵', stone: '🪨', iron: '⛓️', gold: '🪙', energy: '⚡' };
export const icon = (t: string) => UNITS[t]?.icon ?? BUILDINGS[t]?.icon ?? '❔';
export const DOING: Record<string, string> = { idle: 'Бездельничает', move: 'Идёт', amove: 'Идёт в атаку', attack: 'Сражается', gather: 'Добывает', farm: 'Работает в поле', build: 'Строит / чинит', trade: 'Торгует' };
export const costStr = (c: Cost) => RES.filter((r) => c[r]).map((r) => RES_ICON[r] + c[r]).join(' ');
/** Элемент очереди здания: юнит, '@техника', '#wheat', '#age' */
export const queueName = (q: string) => (q === '#wheat' ? 'Пшеница' : q === '#age' ? 'эпоха' : q[0] === '@' ? TECHS[q.slice(1)].name : NAMES[q]);
export const queueIcon = (q: string) => (q === '#wheat' ? '🌾' : q === '#age' ? '⏫' : q[0] === '@' ? BRANCH[TECHS[q.slice(1)].branch].icon : icon(q));
/** Горячие клавиши кнопок панели по порядку (WASD — камера; F H O X Z G P — свои) */
export const HOTKEYS = 'QERTYUIJKLCVBNM';
