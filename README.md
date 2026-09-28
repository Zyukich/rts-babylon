# ЭПОХИ

Браузерная RTS: 8 эпох, экономика, дипломатия, рост поселений. Nuxt (меню, настройки, лобби) + отдельный игровой клиент на Babylon.js + авторитетный lockstep-сервер.

```
npm i
npm run dev            # игра на http://localhost:3000 (перед первым запуском сам соберёт ассеты)
npm run server         # во втором терминале — сервер для сетевой игры (ws://…:8080)
npm run assets         # собрать ассеты по assets/catalog.json (скачает недостающее)
npm run assets:check   # проверить каталог ассетов
npm run assets:list -- quaternius-rts   # какие модели и анимации есть в паке
npm test               # тесты: детерминизм, фаззинг, эксплойты, механики, данные, сеть
npm run typecheck      # типы: game/ + Nuxt-приложение
npm run demo           # headless-матч двух ботов в консоли
npm run balance        # ~50 матчей ботов → сводка баланса (-- --quick — быстрее)
npm run build          # production-сборка (.output/)
```

Витрина моделей: `/models` — все подключённые модели, анимации, цвет игрока.

Интерфейс масштабируется под экран (от 1366×768 до 4K) и настройку «Масштаб интерфейса»: все размеры HUD — от CSS-единицы `--u` (`app/assets/css/main.css`).
В игре: кнопка полного экрана (⛶), меню F10 с настройками прямо в партии (применяются на ходу), лента событий мира слева (клик — к месту события).
Автонастройка качества (Настройки → Графика) по очереди снимает тяжёлые эффекты, если FPS проседает. С телефона или без WebGL показывается предупреждение.
Режимы для тестирования: `/play?debug` — боты не нападают, F2 +1000 ресурсов, F3 открыть карту; `/play?autoplay` — за вас играет бот.

## Где что лежит

| Папка | Что |
|---|---|
| `game/data/` | **баланс и настройки** в JSON: юниты, здания, технологии, эпохи, экономика, карта, победа, боты. См. `game/data/README.md` |
| `assets/` | **модели, текстуры, звуки** и `catalog.json` — что к чему подключено. См. `assets/README.md` |
| `game/core/` | симуляция (детерминированная, без графики): мир, карта, путь, обзор, цивилизация |
| `game/core/sim/` | шаг симуляции по темам: `movement`, `combat`, `economy`, `buildings`, `units`, `formation`, `diplomacy`, `victory`, `events`, `commands` |
| `game/ai/` | боты: `bot.ts` (решения), `diplomacy.ts`, `helpers.ts` |
| `game/server/` | lockstep-сервер (WebSocket): комнаты, тики, сверка хешей, бот вместо ушедшего |
| `game/client/` | игровой клиент (Babylon), не зависит от Vue — см. ниже |
| `app/` | Nuxt: страницы, HUD-компоненты, композаблы |
| `scripts/` | `assets/build.mjs` — сборщик ассетов, `demo.ts` — матч ботов |
| `tests/` | vitest |

### Игровой клиент `game/client/`

`createGame(canvas, options)` собирает партию из модулей `use*(ctx)` над общим контекстом (`context.ts`) и возвращает `{ act, attachMinimap, dispose }`.
Интерфейс клиент не рисует: раз в ~100 мс отдаёт снимок `HudState` (`hud/types.ts`), Vue его показывает и вызывает `act('train:12:archer')`.

| Папка/файл | Что |
|---|---|
| `index.ts` | сборка партии и игровой цикл (симуляция 10 Гц, рендер — с частотой монитора) |
| `session.ts` | мир, кто мы, боты, сеть, цвета и имена |
| `config/visual.ts` | визуальные параметры из `assets/catalog.json` |
| `render/` | `stage` (движок, свет, камера, тени), `terrain`, `ground` (текстуры, дороги, тропы), `skirt` (горы за краем), `water`, `sky`, `blades` (трава), `resources`, `entities` (юниты и здания), `effects`, `borders`, `fog`, `minimap`, `models/` (процедурные модели) |
| `assets/loader.ts` | загрузка glTF по `public/assets/manifest.json`, запекание анимаций в позы |
| `input/` | `controls` (мышь, клавиши, миникарта), `selection`, `picking`, `orders`, `placement`, `camera` |
| `hud/` | `hud.ts` (снимок и действия), `alerts.ts` (звуки, тревога, новости), `format.ts`, `types.ts` |
| `audio/sfx.ts` | звуки: сэмплы из каталога или синтез |
| `net/net.ts` | подключение к комнате |
| `menu-scene.ts` | 3D-фон главного меню |
| `viewer.ts` | витрина моделей (`/models`) |

### Nuxt `app/`

Страницы: `/` меню, `/setup` одиночная игра, `/play` матч, `/lobby` → `/room/<id>` сетевая игра, `/settings`.
`components/GameView.vue` монтирует игру, `components/hud/*` — панели интерфейса, `composables/` — `useGame`, `useSettings`, `useStartConfig`, `useServerUrl`.
Адрес сервера по умолчанию — `ws://<хост>:8080`; меняется в настройках игрока или переменной `NUXT_PUBLIC_SERVER`.
