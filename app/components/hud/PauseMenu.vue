<!-- Меню паузы (F10). В сетевой игре время не останавливается -->
<script setup lang="ts">
defineProps<{ canPause: boolean }>();
const emit = defineEmits<{ exit: [] }>();
const game = inject(GameKey)!;
</script>

<template>
  <div class="overlay">
    <div class="mpanel box">
      <h2>{{ canPause ? 'Пауза' : 'Меню' }}</h2>
      <button class="mbtn wide" @click="game.act('menu:0')">▶ Продолжить</button>
      <button class="mbtn wide" @click="emit('exit')">⏏ Выйти в главное меню</button>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 40; background: #0009; display: flex; align-items: center; justify-content: center; }
.box { width: 320px; text-align: center; }
.wide { width: 100%; margin-bottom: 10px; text-align: center; }
</style>
