# ЭПОХИ — прототип

```
npm i
npm run dev      # при первом запуске сам скачает модели KayKit и текстуры Poly Haven (CC0), затем игра
npm run assets   # перекачать модели заново
npm run server   # во втором терминале — для сетевой игры (кнопка «Сетевая игра»)
npm run demo     # headless-матч двух ботов без графики
```

Структура:
- `index.html`, `vite.config.ts` — точка входа клиента
- `src/` — симуляция (`sim.ts`, `world.ts`, `civ.ts`, `defs.ts`…), рендер (`main.ts`, `fog.ts`, `minimap.ts`), сеть (`net.ts`)
- `server/server.ts` — lockstep-сервер
