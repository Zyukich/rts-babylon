// Адрес игрового сервера: из настроек игрока → из NUXT_PUBLIC_SERVER → тот же хост, порт 8080.
import { defaultServer } from '~~/game/client/net/net.ts';

export function useServerUrl() {
  const { settings } = useSettings(), cfg = useRuntimeConfig();
  return computed(() => settings.value.server || (cfg.public.server as string) || defaultServer());
}
