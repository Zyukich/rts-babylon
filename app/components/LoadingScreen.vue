<!-- Экран загрузки партии: шестерни, прогресс, этап и подсказка. Убирается, когда игра полностью готова и отрисована -->
<script setup lang="ts">
const props = defineProps<{ progress: number; stage: string; error?: string }>();
const emit = defineEmits<{ exit: [] }>();
const TIPS = [
  'Двойной клик по юниту выделяет всех таких же на экране.',
  'Shift+ПКМ — приказ в очередь. Так можно заранее расставить стройки.',
  'Жители, достроив здание, сами идут строить или чинить соседнее такое же.',
  'Z — сменить строй отряда: линия, клин, черепаха.',
  'Ctrl/Shift + цифра — запомнить группу, цифра — выбрать её.',
  'Конница бьёт стрелков, копейщики — конницу, стрелки — пехоту.',
  'Засуха и землетрясения видны в ленте событий слева — по клику камера покажет место.',
  'Рынок меняет излишки на золото, а повозки между рынками приносят доход.',
  'Если игра подтормаживает, автонастройка сама снизит тяжёлые эффекты.',
  'G — дипломатия: мир, союз, дань. Хуже можно сразу, лучше — по согласию.',
];
const tip = ref(TIPS[Math.floor(Math.random() * TIPS.length)]);
let timer = 0;
onMounted(() => { timer = window.setInterval(() => { tip.value = TIPS[(TIPS.indexOf(tip.value) + 1) % TIPS.length]; }, 6000); });
onBeforeUnmount(() => clearInterval(timer));
const pct = computed(() => Math.round(props.progress * 100));
/** Контур шестерни: n зубцов вокруг центра (cx, cy), внешний радиус r */
function gear(cx: number, cy: number, r: number, n: number) {
  const pts: string[] = [], inner = r * 0.78;
  for (let i = 0; i < n * 4; i++) {
    const a = (i / (n * 4)) * Math.PI * 2, rr = i % 4 === 1 || i % 4 === 2 ? r : inner;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
const G1 = gear(34, 40, 26, 10), G2 = gear(82, 30, 17, 8);
</script>

<template>
  <div class="loading">
    <div class="center">
      <div class="title">ЭПОХИ</div>
      <svg class="gears" viewBox="0 0 120 80" aria-hidden="true">
        <g class="g1"><path :d="G1" /><circle cx="34" cy="40" r="8" /></g>
        <g class="g2"><path :d="G2" /><circle cx="82" cy="30" r="5" /></g>
      </svg>
      <template v-if="!error">
        <div class="bar"><div :style="{ width: pct + '%' }" /></div>
        <div class="stage">{{ stage }} <span class="pct">{{ pct }}%</span></div>
        <div class="tip">💡 {{ tip }}</div>
      </template>
      <template v-else>
        <div class="err">Не удалось запустить игру: {{ error }}</div>
        <button class="mbtn" @click="emit('exit')">⏏ В главное меню</button>
      </template>
    </div>
  </div>
</template>



<style scoped>
.loading { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at center, #2a2116 0%, #0d0a07 75%); }
.center { width: min(calc(var(--u) * 560), 90vw); text-align: center; }
.title { font: 700 calc(var(--u) * 64) Georgia, serif; color: var(--gold3); letter-spacing: calc(var(--u) * 10); text-shadow: 0 3px 18px #000; }
.gears { width: calc(var(--u) * 150); height: calc(var(--u) * 100); margin: calc(var(--u) * 10) auto; display: block; }
.gears path { fill: #7a5c2e; stroke: var(--gold); stroke-width: 1.2; }
.gears circle { fill: #1b1712; stroke: var(--gold); stroke-width: 1.2; }
.g1 { transform-origin: 34px 40px; animation: spin 3s linear infinite; }
.g2 { transform-origin: 82px 30px; animation: spin 2s linear infinite reverse; }
@keyframes spin { to { transform: rotate(360deg); } }
.bar { height: calc(var(--u) * 12); border: 1px solid var(--gold2); border-radius: calc(var(--u) * 6); background: #1b1712; overflow: hidden; }
.bar div { height: 100%; background: linear-gradient(90deg, #7a5c2e, var(--gold3)); transition: width .3s ease; }
.stage { margin-top: calc(var(--u) * 10); color: #d9c49a; }
.pct { color: var(--gold3); margin-left: calc(var(--u) * 6); }
.tip { margin-top: calc(var(--u) * 26); color: var(--muted); font-size: calc(var(--u) * 14); min-height: 3em; }
.err { color: #ff8a7a; margin: calc(var(--u) * 16) 0; }
</style>
