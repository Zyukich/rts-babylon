<!-- Итог матча: победа/поражение, культура, статистика, хроника цивилизации -->
<script setup lang="ts">
import type { EndInfo } from '~~/game/client/hud/types.ts';
defineProps<{ end: EndInfo; again?: boolean }>();
const emit = defineEmits<{ again: []; exit: [] }>();
</script>

<template>
  <div class="end">
    <h1>{{ end.won ? 'Победа' : 'Поражение' }}</h1>
    <div v-if="end.victory">{{ end.victory }}</div>
    <h3>{{ end.title }} цивилизация · {{ end.years }} лет истории</h3>
    <div>{{ end.culture.join(' · ') }}</div>
    <div>{{ end.stats }}</div>
    <h3>Хроника</h3>
    <div class="chron"><div v-for="(c, i) in end.chronicle" :key="i">Год {{ c.year }} — {{ c.text }}</div></div>
    <p>Сыграно партий: {{ end.played }}, побед: {{ end.wins }}</p>
    <div class="acts">
      <button v-if="again" class="mbtn" @click="emit('again')">⚔ Ещё партия</button>
      <button class="mbtn" @click="emit('exit')">⏏ В главное меню</button>
    </div>
  </div>
</template>

<style scoped>
.end { position: fixed; inset: 5% 20%; overflow: auto; background: #15110cf2; border: 2px solid var(--gold); border-radius: 8px; padding: 16px 28px; z-index: 20; text-align: center; }
.chron { text-align: left; max-width: 520px; margin: 0 auto; line-height: 1.6; }
.acts { display: flex; gap: 12px; justify-content: center; }
</style>
