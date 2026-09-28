<!-- Верх: время, регионы, культура | эпоха | население и ресурсы. Под ним — кнопки дипломатии и меню -->
<script setup lang="ts">
import type { HudState } from '~~/game/client/index.ts';
defineProps<{ hud: HudState }>();
const game = inject(GameKey)!;
</script>

<template>
  <div class="top">
    <div class="box">
      <span v-if="hud.status.fps !== undefined">FPS {{ hud.status.fps }}</span>
      <span>⏱ {{ hud.status.time }}</span><span>🗺 {{ hud.status.regions }}</span><span>{{ hud.status.culture }}</span>
    </div>
    <div class="age"><div class="name">{{ hud.age.name }}</div><div class="agesub">{{ hud.age.sub }}</div></div>
    <div class="box">
      <span>👥 <b>{{ hud.pop }}</b></span>
      <span v-for="r in hud.res" :key="r.key">{{ r.icon }} <b>{{ r.value }}</b></span>
    </div>
  </div>
  <div class="menu">
    <button class="mbtn sm" @click="game.act('diplo')">🤝 Дипломатия (G)</button>
    <button class="mbtn sm" @click="game.act('menu:1')">☰ Меню (F10)</button>
  </div>
  <div class="hover">{{ hud.hover }}</div>
  <div class="news">{{ hud.news }}</div>
</template>

<style scoped>
.top { position: fixed; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-start; pointer-events: none; z-index: 2; }
.box { margin: 4px 8px; padding: 4px 10px; background: linear-gradient(#2a231acc, #15110ccc); border: 1px solid var(--gold2); border-radius: 4px; display: flex; gap: 14px; pointer-events: auto; white-space: nowrap; }
.box b { color: #fff; font-weight: 600; }
.age { min-width: 260px; padding: 3px 24px 6px; text-align: center; background: linear-gradient(#3a2f20, #1b1712); border: 2px solid var(--gold); border-top: none; border-radius: 0 0 14px 14px; box-shadow: 0 3px 10px #0008; }
.name { color: var(--gold3); font-size: 16px; font-weight: 600; }
.agesub { color: #e0b060; font-size: 12px; }
.menu { position: fixed; top: 40px; right: 10px; z-index: 2; display: flex; gap: 6px; }
.hover { position: fixed; top: 40px; left: 8px; font-size: 13px; color: #f3e6c8; text-shadow: 0 1px 3px #000; pointer-events: none; }
.news { position: fixed; top: 64px; width: 100%; text-align: center; color: #fd6; font-size: 18px; text-shadow: 0 1px 4px #000; pointer-events: none; }
</style>
