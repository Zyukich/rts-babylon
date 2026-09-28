<!-- Дипломатия: отношения с каждым, предложения, дань. Хуже можно сразу, лучше — по согласию -->
<script setup lang="ts">
import type { DiploRow } from '~~/game/client/hud/types.ts';
defineProps<{ rows: DiploRow[] }>();
const game = inject(GameKey)!;
</script>

<template>
  <div class="diplo">
    <b>Дипломатия</b> <small style="opacity: .6">— хуже можно сразу, лучше — по согласию</small>
    <div v-for="r in rows" :key="r.id" class="dr">
      <span class="sw" :style="{ background: r.color }" /><b>{{ r.name }}</b> — {{ r.rel }}
      <small v-if="r.waiting">(ждём ответа: {{ r.waiting }})</small>
      <div class="acts">
        <span v-for="b in r.buttons" :key="b.a" class="db" @click="game.act(b.a)">{{ b.label }}</span>
      </div>
      <div v-if="r.tribute.length" class="acts">Дань: <span v-for="b in r.tribute" :key="b.a" class="db" @click="game.act(b.a)">{{ b.label }}</span></div>
    </div>
  </div>
</template>

<style scoped>
.diplo { position: fixed; top: 76px; right: 10px; z-index: 3; width: 380px; padding: 10px 12px; border-radius: 8px; background: #1c1712ee; border: 1px solid #8a6a3a; color: #eadcc0; font-size: 13px; }
.dr { padding: 6px 0; border-top: 1px solid #ffffff18; margin-top: 6px; }
.acts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; align-items: center; }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
.db { cursor: pointer; padding: 2px 7px; border-radius: 4px; background: #3a2e20; border: 1px solid #8a6a3a; }
.db:hover { background: #5a4630; }
</style>
