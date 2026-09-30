<!-- Предупреждение: телефон/планшет без мыши, маленький экран или нет WebGL. Можно продолжить (кроме случая без WebGL) -->
<script setup lang="ts">
const show = ref(false), reason = ref<'webgl' | 'touch' | 'small' | ''>('');
onMounted(() => {
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  const small = Math.min(innerWidth, innerHeight) < 500 || innerWidth < 900;
  reason.value = !gl ? 'webgl' : touchOnly ? 'touch' : small ? 'small' : '';
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('epohi-device-ok') === '1'; } catch { /* приватный режим */ }
  show.value = !!reason.value && (reason.value === 'webgl' || !dismissed);
});
function proceed() { show.value = false; try { sessionStorage.setItem('epohi-device-ok', '1'); } catch { /* приватный режим */ } }
</script>

<template>
  <div v-if="show" class="warn">
    <div class="box">
      <div class="ic">{{ reason === 'webgl' ? '⛔' : '🖥️' }}</div>
      <h2>{{ reason === 'webgl' ? 'Браузер не поддерживает 3D-графику' : 'Игра рассчитана на компьютер' }}</h2>
      <p v-if="reason === 'webgl'">Для игры нужен WebGL. Обновите браузер (Chrome, Edge, Firefox, Safari) или включите аппаратное ускорение в его настройках.</p>
      <p v-else-if="reason === 'touch'">Похоже, вы зашли с телефона или планшета. Управление в ЭПОХАХ рассчитано на мышь и клавиатуру: рамка выделения, правый клик, горячие клавиши. На сенсорном экране играть будет неудобно.</p>
      <p v-else>Экран слишком маленький: интерфейс стратегии не поместится. Лучше открыть игру на компьютере или развернуть окно браузера.</p>
      <button v-if="reason !== 'webgl'" class="mbtn" @click="proceed">Всё равно продолжить</button>
    </div>
  </div>
</template>

<style scoped>
.warn { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: #0d0a07f2; padding: 16px; }
.box { max-width: 520px; text-align: center; padding: 24px; border: 2px solid var(--gold); border-radius: 10px; background: #1b1712; font-size: 16px; }
.ic { font-size: 48px; }
h2 { color: var(--gold3); margin: 8px 0 12px; font-size: 22px; }
p { color: var(--text); line-height: 1.5; }
</style>
