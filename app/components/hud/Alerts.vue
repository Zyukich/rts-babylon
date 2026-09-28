<!-- Уведомления слева: бездельники, атака, чужие победы на подходе, предложения дипломатии -->
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
.alerts { position: fixed; left: 0; bottom: 186px; display: flex; flex-direction: column; gap: 4px; z-index: 2; }
.al { padding: 6px 14px 6px 10px; background: linear-gradient(90deg, #2f4a1ecc, #2f4a1e55); border-left: 3px solid #8fc05a; cursor: pointer; font-size: 13px; }
.al.warn { background: linear-gradient(90deg, #6a1e1ecc, #6a1e1e55); border-color: #ff6a5a; }
.al.info { background: linear-gradient(90deg, #3a3020cc, #3a302055); border-color: var(--gold); cursor: default; }
.al.click { cursor: pointer; }
</style>
