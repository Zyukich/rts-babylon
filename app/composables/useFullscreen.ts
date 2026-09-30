// Полноэкранный режим: кнопка во всех экранах. Браузер разрешает включать его только по действию игрока (клик/клавиша).
export function useFullscreen() {
  const on = useState('fullscreen', () => false);
  if (import.meta.client) {
    const sync = () => { on.value = !!document.fullscreenElement; };
    onMounted(() => { sync(); document.addEventListener('fullscreenchange', sync); });
    onBeforeUnmount(() => document.removeEventListener('fullscreenchange', sync));
  }
  const supported = import.meta.client && !!document.documentElement.requestFullscreen;
  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch (e) { console.warn('Полноэкранный режим недоступен', e); }
  }
  return { on, toggle, supported };
}
