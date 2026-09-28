// Настройки игрока: реактивные, общие для всех страниц, сохраняются в браузере.
import { loadSettings, saveSettings, DEFAULTS, PRESETS, type Settings } from '~~/game/client/settings.ts';

export function useSettings() {
  const s = useState<Settings>('settings', () => loadSettings());
  return {
    settings: s,
    /** Поменять одно поле; ручная правка графики переводит пресет в «Своё» */
    set<K extends keyof Settings>(k: K, v: Settings[K], graphics = false) {
      const next = { ...s.value, [k]: v };
      if (k === 'preset' && v !== 'custom') Object.assign(next, PRESETS[v as string]);
      else if (graphics) next.preset = 'custom';
      s.value = next;
      saveSettings(next);
    },
    reset() { s.value = { ...DEFAULTS }; saveSettings(s.value); },
  };
}
