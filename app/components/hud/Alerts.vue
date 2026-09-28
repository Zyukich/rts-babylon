<!-- Уведомления слева внизу: бездельники, атака, чужие победы на подходе, предложения дипломатии -->
<script setup lang="ts">
import type { Alert } from '~~/game/client/hud/types.ts';
defineProps<{ alerts: Alert[] }>();
const game = inject(GameKey)!;
</script>

<template>
  <div class="alerts">
    <div v-for="(al, i) in alerts" :key="i" class="al" :class="[al.kind, { click: al.a }]" @pointerdown.left="al.a && game.act(al.a)">{{ al.text }}</div>
  </div>
</template>

<style scoped>
.alerts { position: fixed; left: 0; bottom: calc(var(--u) * 214); display: flex; flex-direction: column; gap: calc(var(--u) * 4); z-index: 2; font-size: calc(var(--u) * 14); }
.al { padding: calc(var(--u) * 7) calc(var(--u) * 16) calc(var(--u) * 7) calc(var(--u) * 10); background: linear-gradient(90deg, #2f4a1ecc, #2f4a1e55); border-left: calc(var(--u) * 3) solid #8fc05a; }
.al.warn { background: linear-gradient(90deg, #6a1e1ecc, #6a1e1e55); border-color: #ff6a5a; }
.al.info { background: linear-gradient(90deg, #3a3020cc, #3a302055); border-color: var(--gold); }
.al.click { cursor: pointer; }
</style>
