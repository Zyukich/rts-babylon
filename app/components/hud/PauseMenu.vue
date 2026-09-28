<!-- Меню (F10): продолжить, настройки прямо в партии, полный экран, выход. В сетевой игре время не останавливается -->
<script setup lang="ts">
defineProps<{ canPause: boolean }>();
const emit = defineEmits<{ exit: [] }>();
const game = inject(GameKey)!;
const view = ref<'menu' | 'settings' | 'exit'>('menu');
const { on: full, toggle: toggleFull, supported } = useFullscreen();
</script>

<template>
  <div class="overlay" @keydown.esc.stop="view = 'menu'">
    <div v-if="view === 'menu'" class="mpanel box">
      <h2>{{ canPause ? 'Пауза' : 'Меню' }}</h2>
      <button class="mbtn wide" @click="game.act('menu:0')">▶ Продолжить</button>
      <button class="mbtn wide" @click="view = 'settings'">⚙ Настройки</button>
      <button v-if="supported" class="mbtn wide" @click="toggleFull">{{ full ? '🗗 Свернуть из полного экрана' : '⛶ Развернуть на весь экран' }}</button>
      <button class="mbtn wide" @click="view = 'exit'">⏏ Выйти в главное меню</button>
      <small v-if="!canPause" class="note">Сетевая игра — время не останавливается</small>
    </div>
    <div v-else-if="view === 'settings'" class="mpanel in-game-settings">
      <h2>Настройки</h2>
      <SettingsPanel in-game><template #back><button class="mbtn sm" @click="view = 'menu'">← Назад</button></template></SettingsPanel>
    </div>
    <div v-else class="mpanel box">
      <h2>Выйти из партии?</h2>
      <p>Прогресс этой партии не сохранится.</p>
      <button class="mbtn wide" @click="emit('exit')">⏏ Выйти</button>
      <button class="mbtn wide" @click="view = 'menu'">← Остаться</button>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 40; background: #000a; display: flex; align-items: center; justify-content: center; }
.box { width: calc(var(--u) * 380); text-align: center; }
.wide { width: 100%; margin-bottom: calc(var(--u) * 10); justify-content: center; }
.note { display: block; color: var(--muted); }
.in-game-settings { display: flex; flex-direction: column; width: min(calc(var(--u) * 860), 94vw); max-height: 88vh; }
</style>
