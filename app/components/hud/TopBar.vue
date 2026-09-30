<!-- Верх: время, регионы, культура | эпоха | население и ресурсы. Под ним справа — полный экран, дипломатия, меню -->
<script setup lang="ts">
import type { HudState } from '~~/game/client/index.ts';
defineProps<{ hud: HudState }>();
const game = inject(GameKey)!;
</script>

<template>
  <div class="top">
    <div class="box">
      <span v-if="hud.status.fps !== undefined" title="Кадров в секунду">FPS {{ hud.status.fps }}</span>
      <span title="Время партии">⏱ {{ hud.status.time }}</span>
      <span title="Ваши регионы из всех">🗺 {{ hud.status.regions }}</span>
      <span title="Уровни культуры: военная, торговая, научная, гражданская">{{ hud.status.culture }}</span>
    </div>
    <div class="age"><div class="name">{{ hud.age.name }}</div><div class="agesub">{{ hud.age.sub }}</div></div>
    <div class="box res">
      <span title="Население / предел">👥 <b>{{ hud.pop }}</b></span>
      <span v-for="r in hud.res" :key="r.key">{{ r.icon }} <b>{{ r.value }}</b></span>
    </div>
  </div>
  <div class="menu">
    <FullscreenButton />
    <button class="mbtn sm" @click="game.act('diplo')">🤝 Дипломатия <kbd>G</kbd></button>
    <button class="mbtn sm" @click="game.act('menu:1')">☰ Меню <kbd>F10</kbd></button>
  </div>
  <div class="hover">{{ hud.hover }}</div>
  <div v-if="hud.news" class="news">{{ hud.news }}</div>
  <div v-if="hud.notice" class="notice">{{ hud.notice }}</div>
</template>

<style scoped>
.top { position: fixed; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-start; pointer-events: none; z-index: 2; font-size: calc(var(--u) * 16); }
.box { margin: calc(var(--u) * 6) calc(var(--u) * 8); padding: calc(var(--u) * 5) calc(var(--u) * 12); background: linear-gradient(#2a231add, #15110cdd); border: 1px solid var(--gold2); border-radius: calc(var(--u) * 5); display: flex; gap: calc(var(--u) * 16); pointer-events: auto; white-space: nowrap; box-shadow: 0 2px 8px #0006; }
.box b { color: #fff; font-weight: 600; }
.res { font-size: calc(var(--u) * 17); }
.age { min-width: calc(var(--u) * 300); padding: calc(var(--u) * 4) calc(var(--u) * 26) calc(var(--u) * 8); text-align: center; background: linear-gradient(#3a2f20, #1b1712); border: calc(var(--u) * 2) solid var(--gold); border-top: none; border-radius: 0 0 calc(var(--u) * 16) calc(var(--u) * 16); box-shadow: 0 3px 10px #0008; }
.name { color: var(--gold3); font-size: calc(var(--u) * 19); font-weight: 600; }
.agesub { color: #e0b060; font-size: calc(var(--u) * 13); }
.menu { position: fixed; top: calc(var(--u) * 48); right: calc(var(--u) * 10); z-index: 2; display: flex; gap: calc(var(--u) * 6); }
kbd { font: inherit; font-size: .8em; opacity: .65; }
.hover { position: fixed; top: calc(var(--u) * 50); left: calc(var(--u) * 10); font-size: calc(var(--u) * 14); color: #f3e6c8; text-shadow: 0 1px 3px #000; pointer-events: none; }
.news, .notice { position: fixed; left: 50%; transform: translateX(-50%); max-width: 70vw; text-align: center; pointer-events: none; text-shadow: 0 1px 4px #000; }
.news { top: calc(var(--u) * 74); color: #fd6; font-size: calc(var(--u) * 20); }
.notice { top: calc(var(--u) * 108); padding: calc(var(--u) * 6) calc(var(--u) * 14); background: #15110ccc; border: 1px solid var(--gold2); border-radius: calc(var(--u) * 6); color: var(--text); font-size: calc(var(--u) * 14); }
</style>
