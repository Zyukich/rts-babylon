<!-- Лента событий мира слева посередине: засуха, землетрясение, месторождение… Клик — камера к месту -->
<script setup lang="ts">
import type { WorldEvent } from '~~/game/client/hud/types.ts';
defineProps<{ events: WorldEvent[] }>();
const game = inject(GameKey)!;
</script>

<template>
  <TransitionGroup tag="div" name="ev" class="feed">
    <div v-for="e in events" :key="e.id" class="ev" :class="{ mine: e.mine, fresh: e.fresh, link: e.a }" :title="e.a ? 'Показать место' : ''" @pointerdown.left="e.a && game.act(e.a)">
      <div class="ic">{{ e.icon }}</div>
      <div class="tx">
        <div>{{ e.text }}</div>
        <small>{{ e.ago }}<b v-if="e.left"> · {{ e.left }}</b></small>
      </div>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.feed { position: fixed; left: calc(var(--u) * 8); top: 32%; width: calc(var(--u) * 310); display: flex; flex-direction: column; gap: calc(var(--u) * 6); z-index: 2; pointer-events: none; }
.ev { pointer-events: auto; display: flex; gap: calc(var(--u) * 10); align-items: flex-start; padding: calc(var(--u) * 7) calc(var(--u) * 10); background: linear-gradient(90deg, #1b1712ee, #1b1712aa); border-left: calc(var(--u) * 3) solid var(--gold2); border-radius: 0 calc(var(--u) * 6) calc(var(--u) * 6) 0; font-size: calc(var(--u) * 13); box-shadow: 0 2px 8px #0006; }
.ev.mine { border-left-color: #ff8a5a; }
.ev.fresh { animation: flash 1.2s ease-out; }
.ev.link { cursor: pointer; }
.ev.link:hover { background: linear-gradient(90deg, #2a2116f5, #2a2116bb); }
.ic { font-size: calc(var(--u) * 22); line-height: 1; }
.tx small { color: var(--muted); }
.tx b { color: var(--gold3); font-weight: 600; }
@keyframes flash { from { box-shadow: 0 0 calc(var(--u) * 18) var(--gold3); } }
.ev-enter-from, .ev-leave-to { opacity: 0; transform: translateX(-30px); }
.ev-enter-active, .ev-leave-active { transition: all .4s ease; }
</style>
