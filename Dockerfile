# ЭПОХИ — один контейнер: игра (статика Nuxt) + сетевой сервер (WebSocket на /ws) на одном порту.
# Для Coolify: Build Pack — Dockerfile, порт — 3000, домен — любой (HTTPS/WSS даёт Coolify).

# ---------- сборка ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
# Модели и текстуры: паки из assets/packs + скачиваемые (KayKit с GitHub, текстуры Poly Haven).
# Если что-то не скачалось — не страшно: игра нарисует это процедурно.
RUN node scripts/assets/build.mjs --prune || echo "⚠ ассеты собраны не полностью"
RUN npx nuxt generate

# ---------- запуск ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/public
# Серверу нужна только библиотека ws; код игры — TypeScript, Node 22 запускает его напрямую
RUN echo '{"name":"epohi-server","private":true,"type":"module"}' > package.json \
 && npm install --omit=dev --no-audit --no-fund --no-package-lock ws@^8.18.0 && npm cache clean --force
COPY game/core ./game/core
COPY game/ai ./game/ai
COPY game/data ./game/data
COPY game/server ./game/server
COPY --from=build /app/.output/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "--experimental-strip-types", "--no-warnings", "game/server/index.ts"]
