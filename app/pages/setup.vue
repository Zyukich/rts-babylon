<!-- Одиночная игра: карта, ресурсы, эпоха, скорость, туман, условия победы и слоты игроков -->
<script setup lang="ts">
import { COLORS, type SlotType } from '~~/game/client/settings.ts';

const f = reactive(loadSetup());
const err = ref('');
type Opt = [string | number, string];
const SIZES: Opt[] = [[72, 'Маленькая'], [100, 'Средняя'], [128, 'Большая'], [160, 'Огромная']];
const RESS: Opt[] = [['std', 'Стандарт'], ['high', 'Много'], ['max', 'Очень много']];
const AGES: Opt[] = [[0, 'Первобытная'], [1, 'Древняя'], [2, 'Средневековая'], [3, 'Имперская'], [4, 'Индустриальная'], [5, 'Механизированная'], [6, 'Современная']];
const POPS: Opt[] = [[100, '100'], [200, '200'], [300, '300']];
const SPEEDS: Opt[] = [[0.5, 'Медленно'], [1, 'Нормально'], [1.5, 'Быстро'], [2, 'Очень быстро']];
const FOGS: Opt[] = [['normal', 'Обычный'], ['explored', 'Карта разведана'], ['none', 'Нет']];
const TYPES: [SlotType, string][] = [['human', 'Вы'], ['easy', 'Бот: лёгкий'], ['normal', 'Бот: средний'], ['hard', 'Бот: сложный'], ['closed', 'Закрыто']];
const TEAMS: Opt[] = [[0, '—'], [1, 'Команда 1'], [2, 'Команда 2'], [3, 'Команда 3'], [4, 'Команда 4']];
const WINS = [['terr', 'Территориальная'], ['eco', 'Экономическая'], ['cult', 'Культурная'], ['sci', 'Научная']] as const;
const rgb = (c: number) => `rgb(${COLORS[c][1].map((v) => v * 255).join(',')})`;

function setType(i: number, t: SlotType) { // «Вы» — только один
  if (t === 'human') f.all.forEach((o, k) => { if (k !== i && o.type === 'human') o.type = 'normal'; });
  f.all[i].type = t;
}
function start() {
  err.value = commitSetup(JSON.parse(JSON.stringify(f)));
  if (!err.value) navigateTo('/play');
}
</script>

<template>
  <div class="mpanel">
    <h2>Одиночная игра</h2>
    <div class="grid">
      <div>
        <div class="mrow"><div>Размер карты</div><select v-model.number="f.size"><option v-for="[k, l] in SIZES" :key="k" :value="k">{{ l }}</option></select></div>
        <div class="mrow"><div>Зерно карты<br><small>0 — каждый раз новая карта</small></div>
          <div><input v-model.number="f.seed" type="number" style="width: 110px"> <button class="mbtn sm" @click="f.seed = 1 + ((Math.random() * 999999) | 0)">🎲</button></div></div>
        <div class="mrow"><div>Стартовые ресурсы</div><select v-model="f.res"><option v-for="[k, l] in RESS" :key="k" :value="k">{{ l }}</option></select></div>
        <div class="mrow"><div>Стартовая эпоха</div><select v-model.number="f.age"><option v-for="[k, l] in AGES" :key="k" :value="k">{{ l }}</option></select></div>
        <div class="mrow"><div>Лимит населения</div><select v-model.number="f.pop"><option v-for="[k, l] in POPS" :key="k" :value="k">{{ l }}</option></select></div>
        <div class="mrow"><div>Скорость игры</div><select v-model.number="f.speed"><option v-for="[k, l] in SPEEDS" :key="k" :value="k">{{ l }}</option></select></div>
        <div class="mrow"><div>Туман войны</div><select v-model="f.fog"><option v-for="[k, l] in FOGS" :key="k" :value="k">{{ l }}</option></select></div>
        <div class="mrow"><div>Случайные события</div><input v-model="f.events" type="checkbox"></div>
        <div class="mrow"><div>Условия победы</div>
          <div style="text-align: left">⚔ Военная — всегда<br><label v-for="[k, l] in WINS" :key="k"><input v-model="f.victory[k]" type="checkbox"> {{ l }}<br></label></div></div>
      </div>
      <div>
        <table class="slots">
          <thead><tr><th>#</th><th>Игрок</th><th>Команда</th><th>Цвет</th></tr></thead>
          <tbody>
          <tr v-for="(s, i) in f.all" :key="i" :style="{ opacity: s.type === 'closed' ? 0.45 : 1 }">
            <td>{{ i + 1 }}</td>
            <td><select :value="s.type" @change="setType(i, ($event.target as HTMLSelectElement).value as SlotType)"><option v-for="[k, l] in TYPES" :key="k" :value="k">{{ l }}</option></select></td>
            <td><select v-model.number="s.team"><option v-for="[k, l] in TEAMS" :key="k" :value="k">{{ l }}</option></select></td>
            <td><span class="sw" :style="{ background: rgb(s.color) }" /><select v-model.number="s.color"><option v-for="(c, k) in COLORS" :key="k" :value="k">{{ c[0] }}</option></select></td>
          </tr>
          </tbody>
        </table>
        <small style="opacity: .6">Игроки одной команды — союзники: общий обзор, не атакуют друг друга, побеждают вместе. «—» — каждый сам за себя.</small>
      </div>
    </div>
    <div class="merr">{{ err }}</div>
    <div class="mfoot"><NuxtLink class="mbtn" to="/">← Назад</NuxtLink><button class="mbtn" @click="start">▶ Начать</button></div>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1.25fr; gap: 26px; }
table.slots { border-collapse: collapse; width: 100%; }
table.slots th { text-align: left; color: var(--gold); font-weight: 500; padding: 4px; }
table.slots td { padding: 3px 4px; }
.sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: middle; border: 1px solid #0008; }
</style>
