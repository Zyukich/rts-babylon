// Партия внутри Vue: монтирует игровой клиент на canvas, держит снимок HUD, освобождает всё при уходе со страницы.
import type { InjectionKey } from 'vue';
import { createGame, type Game, type GameOptions, type HudState } from '~~/game/client/index.ts';

export interface GameApi { act(a: string): void; attachMinimap(cv: HTMLCanvasElement): () => void }
export const GameKey: InjectionKey<GameApi> = Symbol('game');

export function useGame(canvas: Ref<HTMLCanvasElement | undefined>, opts: Omit<GameOptions, 'onHud' | 'onProgress' | 'settings'>) {
  const hud = shallowRef<HudState | null>(null);
  const progress = ref('Загрузка…'), error = ref('');
  const { settings } = useSettings();
  let game: Game | null = null, gone = false;
  const pendingMinimap: HTMLCanvasElement[] = [];
  let offMinimap: (() => void) | null = null;

  onMounted(async () => {
    try {
      const g = await createGame(canvas.value!, { ...opts, settings: { ...settings.value }, onHud: (s) => { hud.value = s; }, onProgress: (t) => { progress.value = t; } });
      if (gone) return g.dispose(); // ушли со страницы, пока грузилось
      game = g;
      for (const cv of pendingMinimap.splice(0)) offMinimap = g.attachMinimap(cv);
    } catch (e) {
      console.error(e);
      error.value = e instanceof Error ? e.message : String(e);
    }
  });
  onBeforeUnmount(() => { gone = true; offMinimap?.(); game?.dispose(); game = null; });

  const api: GameApi = {
    act: (a) => game?.act(a),
    attachMinimap(cv) {
      if (game) offMinimap = game.attachMinimap(cv); else pendingMinimap.push(cv);
      return () => { offMinimap?.(); offMinimap = null; };
    },
  };
  provide(GameKey, api);
  return { hud, progress, error, ...api };
}
