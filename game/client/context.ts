// Общий контекст партии: каждый модуль (use*) получает его, берёт нужное и добавляет своё.
// Порядок сборки — в index.ts (createGame). Модули не знают про Vue: интерфейс получает снимок HudState через колбэк.
import type { Settings, StartCfg } from './settings.ts';
import type { NetSession } from './net/net.ts';
import type { HudState } from './hud/types.ts';
import type { Fog } from './render/fog.ts';
import type { Assets } from './assets/loader.ts';
import type { useSession } from './session.ts';
import type { useStage } from './render/stage.ts';
import type { useLayers } from './render/layers.ts';
import type { useTerrain } from './render/terrain.ts';
import type { useModels } from './render/models.ts';
import type { useGround } from './render/ground.ts';
import type { useSkirt } from './render/skirt.ts';
import type { useControls } from './input/controls.ts';
import type { useBlades } from './render/blades.ts';
import type { useEffects } from './render/effects.ts';
import type { useEntities } from './render/entities.ts';
import type { useResources } from './render/resources.ts';
import type { useBorders } from './render/borders.ts';
import type { useSelection } from './input/selection.ts';
import type { usePicking } from './input/picking.ts';
import type { useOrders } from './input/orders.ts';
import type { usePlacement } from './input/placement.ts';
import type { useCamera } from './input/camera.ts';
import type { useAlerts } from './hud/alerts.ts';
import type { useHud } from './hud/hud.ts';

export interface GameOptions {
  settings: Settings;
  start?: StartCfg | null;        // параметры одиночной партии из меню
  net?: NetSession | null;        // сетевая партия (лобби уже пройдено)
  debug?: boolean;                // боты не нападают, F2 — ресурсы, F3 — карта
  autoplay?: boolean;             // за игрока играет бот
  onHud: (s: HudState) => void;   // снимок интерфейса для Vue (~10 раз в секунду и сразу после действий)
  onProgress?: (text: string) => void; // ход загрузки (до первого снимка)
}

export function createLifecycle() {
  const off: (() => void)[] = [];
  return {
    /** addEventListener, который сам снимется при выходе из партии */
    listen<E extends Event>(t: EventTarget, type: string, fn: (e: E) => void, o?: AddEventListenerOptions) {
      t.addEventListener(type, fn as EventListener, o);
      off.push(() => t.removeEventListener(type, fn as EventListener, o));
    },
    onDispose(fn: () => void) { off.push(fn); },
    dispose() { for (const f of off.splice(0).reverse()) try { f(); } catch (e) { console.warn(e); } },
  };
}

export interface GameContext {
  opts: GameOptions;
  S: Settings;
  life: ReturnType<typeof createLifecycle>;
  session: ReturnType<typeof useSession>;
  stage: ReturnType<typeof useStage>;
  gfx: ReturnType<typeof useLayers>;
  terrain: ReturnType<typeof useTerrain>;
  fog: Fog;
  models: ReturnType<typeof useModels>;
  assets: Assets | null;
  ground: ReturnType<typeof useGround>;
  skirt: ReturnType<typeof useSkirt>;
  blades: ReturnType<typeof useBlades>;
  effects: ReturnType<typeof useEffects>;
  ents: ReturnType<typeof useEntities>;
  resources: ReturnType<typeof useResources>;
  borders: ReturnType<typeof useBorders>;
  sel: ReturnType<typeof useSelection>;
  pick: ReturnType<typeof usePicking>;
  orders: ReturnType<typeof useOrders>;
  place: ReturnType<typeof usePlacement>;
  camera: ReturnType<typeof useCamera>;
  controls: ReturnType<typeof useControls>;
  alerts: ReturnType<typeof useAlerts>;
  hud: ReturnType<typeof useHud>;
}
