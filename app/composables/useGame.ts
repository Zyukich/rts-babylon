// Партия внутри Vue: монтирует игровой клиент на canvas, держит снимок HUD, применяет настройки на ходу, освобождает всё при уходе.
import type { InjectionKey } from 'vue';
import { createGame, type Game, type GameOptions, type HudState } from '~~/game/client/index.ts';

export interface GameApi { act(a: string): void; attachMinimap(cv: HTMLCanvasElement): () => void }
export const GameKey: InjectionKey<GameApi> = Symbol('game');

export function useGame(canvas: Ref<HTMLCanvasElement | undefined>, opts: Omit<GameOptions, 'onHud' | 'onProgress' | 'onReady' | 'settings'>) {
  const hud = shallowRef<HudState | null>(null);
  const progress = ref(0), stage = ref('Готовим карту'), ready = ref(false), error = ref('');
  const { settings } = useSettings();
  let game: Game | null = null, gone = false;
  const pendingMinimap: HTMLCanvasElement[] = [];
  let offMinimap: (() => void) | null = null;

  onMounted(async () => {
    await nextTick(); await new Promise((r) => requestAnimationFrame(r)); // сначала показать экран загрузки
    try {
      const g = await createGame(canvas.value!, {
        ...opts, settings: { ...settings.value },
        onHud: (s) => { hud.value = s; },
        onProgress: (t, f) => { stage.value = t; progress.value = f; },
        onReady: () => { ready.value = true; },
      });
      if (gone) return g.dispose(); // ушли со страницы, пока грузилось
      game = g;
      for (const cv of pendingMinimap.splice(0)) offMinimap = g.attachMinimap(cv);
    } catch (e) {
      console.error(e);
      error.value = e instanceof Error ? e.message : String(e);
    }
  });
  watch(settings, (s) => game?.applySettings({ ...s }), { deep: true }); // настройки из меню паузы — сразу в игру
  onBeforeUnmount(() => { gone = true; offMinimap?.(); game?.dispose(); game = null; });

  const api: GameApi = {
    act: (a) => game?.act(a),
    attachMinimap(cv) {
      if (game) offMinimap = game.attachMinimap(cv); else pendingMinimap.push(cv);
      return () => { offMinimap?.(); offMinimap = null; };
    },
  };
  provide(GameKey, api);
  return { hud, progress, stage, ready, error, ...api };
}
