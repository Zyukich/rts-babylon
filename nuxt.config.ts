// Nuxt: меню, настройки, лобби, страницы — Vue. Сам матч — отдельный клиент на Babylon (game/client), страница только монтирует его.
// Рендер только в браузере (ssr: false): игре нужны WebGL, localStorage и WebSocket.
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'ЭПОХИ',
      htmlAttrs: { lang: 'ru' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }, { name: 'description', content: 'ЭПОХИ — браузерная стратегия в реальном времени: 8 эпох, экономика, дипломатия, сетевая игра' }, { name: 'theme-color', content: '#15110c' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  runtimeConfig: {
    public: { server: '' }, // адрес игрового сервера (NUXT_PUBLIC_SERVER); пусто — ws://<этот хост>:8080
  },
  typescript: {
    tsConfig: { compilerOptions: { allowImportingTsExtensions: true, noUncheckedIndexedAccess: false } }, // game/ импортирует модули с .ts (так их запускает Node) и написан без проверки индексов
  },
  vite: {
    build: { target: 'esnext' },
    optimizeDeps: { include: ['@babylonjs/core', '@babylonjs/materials', '@babylonjs/loaders/glTF'] },
  },
  devServer: { host: '0.0.0.0' },
});
