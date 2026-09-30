// Адрес игрового сервера: из настроек игрока → из NUXT_PUBLIC_SERVER → по умолчанию (dev — :8080, сайт — тот же адрес /ws).
import { defaultServer } from '~~/game/client/net/net.ts';

export function useServerUrl() {
  const { settings } = useSettings(), cfg = useRuntimeConfig();
  return computed(() => settings.value.server || (cfg.public.server as string) || defaultServer(import.meta.dev));
}
