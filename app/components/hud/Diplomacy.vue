<!-- Дипломатия: отношения с каждым, предложения, дань. Хуже можно сразу, лучше — по согласию -->
<script setup lang="ts">
import type { DiploRow } from '~~/game/client/hud/types.ts';
defineProps<{ rows: DiploRow[] }>();
const game = inject(GameKey)!;
</script>

<template>
  <div class="diplo">
    <div class="hd"><b>Дипломатия</b> <small>— хуже можно сразу, лучше — по согласию</small><button class="x" @click="game.act('diplo:0')">✕</button></div>
    <div v-for="r in rows" :key="r.id" class="dr">
      <span class="sw" :style="{ background: r.color }" /><b>{{ r.name }}</b> — {{ r.rel }}
      <small v-if="r.waiting">(ждём ответа: {{ r.waiting }})</small>
      <div class="acts"><span v-for="b in r.buttons" :key="b.a" class="db" @click="game.act(b.a)">{{ b.label }}</span></div>
      <div v-if="r.tribute.length" class="acts">Дань: <span v-for="b in r.tribute" :key="b.a" class="db" @click="game.act(b.a)">{{ b.label }}</span></div>
    </div>
  </div>
</template>

<style scoped>
.diplo { position: fixed; top: calc(var(--u) * 90); right: calc(var(--u) * 10); z-index: 3; width: calc(var(--u) * 420); max-height: 60vh; overflow: auto; padding: calc(var(--u) * 12) calc(var(--u) * 14); border-radius: calc(var(--u) * 8); background: #1c1712f2; border: 1px solid #8a6a3a; font-size: calc(var(--u) * 14); }
.hd small { opacity: .6; }
.x { float: right; background: none; border: none; color: var(--muted); cursor: pointer; font-size: 1.1em; }
.dr { padding: calc(var(--u) * 8) 0; border-top: 1px solid #ffffff18; margin-top: calc(var(--u) * 6); }
.acts { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 5); margin-top: calc(var(--u) * 5); align-items: center; }
.sw { display: inline-block; width: calc(var(--u) * 11); height: calc(var(--u) * 11); border-radius: 2px; margin-right: calc(var(--u) * 6); }
.db { cursor: pointer; padding: calc(var(--u) * 3) calc(var(--u) * 8); border-radius: calc(var(--u) * 4); background: #3a2e20; border: 1px solid #8a6a3a; }
.db:hover { background: #5a4630; }
</style>
