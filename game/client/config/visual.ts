// Визуальные параметры из assets/catalog.json: пропорции, высоты для полосок здоровья, быт у зданий, палитра.
// Модели и анимации каталог описывает там же; собранный список доступных файлов — public/assets/manifest.json.
import catalog from '../../../assets/catalog.json' with { type: 'json' };

type Rgb = [number, number, number];
interface UnitVis { height?: number }
interface BuildingVis { height?: number; scale?: [number, number]; flag?: boolean; props?: string[] }

const style = catalog.style;
export const PAL = style.palette as Record<'grass' | 'grassLight' | 'dirt' | 'sand' | 'rock' | 'snow' | 'meadow' | 'meadowDry', Rgb>;
export const US = style.unitScale;   // юниты мельче зданий, но читаются
export const TS = style.treeScale;   // деревья выше — как в классических RTS
export const AGE_TIER: number[] = style.ageTier; // эпоха игры → набор зданий пака (дерево, камень…)
export const ANIM_FRAMES = style.animFrames as Record<string, number>;
export const UNIT_HEIGHT = style.unitHeight; // рост модели юнита в клетках после нормализации

const U = catalog.units as unknown as Record<string, UnitVis>;
const B = catalog.buildings as unknown as Record<string, BuildingVis>;
/** Высота юнита (в ростах) — для полоски здоровья и рамки выделения */
export const unitH = (t: string) => U[t]?.height ?? 1.05;
/** Высота «корпуса» здания — клик, полоска, дым из трубы */
export const bldH = (t: string) => B[t]?.height ?? 1.6;
/** Растяжение модели здания [ширина, высота] */
export const bldScale = (t: string): [number, number] => B[t]?.scale ?? [1, 1];
export const hasFlag = (t: string) => B[t]?.flag !== false;
/** Быт вокруг построек: ящики, бочки, стога… */
export const props = (t: string) => B[t]?.props;
