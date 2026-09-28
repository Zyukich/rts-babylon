<!-- Настройки: графика, звук, игра, сеть + список управления. Всё сохраняется сразу -->
<script setup lang="ts">
import { FIELDS, KEYS, type Field, type Settings } from '~~/game/client/settings.ts';

const { settings, set, reset } = useSettings();
const tabs = [...new Set(FIELDS.map((f) => f.tab)), 'Управление'];
const tab = ref(tabs[0]);
const val = (f: Field) => settings.value[f.k] as string | number | boolean;
function change(f: Field, e: Event) {
  const el = e.target as HTMLInputElement, old = settings.value[f.k];
  const v = f.kind === 'check' ? el.checked : f.kind === 'text' ? el.value : typeof old === 'number' ? Number(el.value) : el.value;
  set(f.k, v as Settings[typeof f.k], f.tab === 'Графика' && f.k !== 'preset');
}
</script>

<template>
  <div class="mpanel">
    <h2>Настройки</h2>
    <div class="tabs"><div v-for="t in tabs" :key="t" class="tab" :class="{ on: t === tab }" @click="tab = t">{{ t }}</div></div>
    <template v-if="tab === 'Управление'">
      <div v-for="[k, a] in KEYS" :key="k" class="mrow"><b>{{ k }}</b><div>{{ a }}</div></div>
    </template>
    <template v-else>
      <div v-for="f in FIELDS.filter((x) => x.tab === tab)" :key="f.k" class="mrow">
        <div>{{ f.label }}<template v-if="f.hint"><br><small>{{ f.hint }}</small></template></div>
        <div>
          <select v-if="f.kind === 'sel'" :value="val(f)" @change="change(f, $event)"><option v-for="[k, l] in f.opts" :key="k" :value="k">{{ l }}</option></select>
          <input v-else-if="f.kind === 'check'" type="checkbox" :checked="!!val(f)" @change="change(f, $event)">
          <template v-else-if="f.kind === 'range'"><input type="range" :min="f.min" :max="f.max" :step="f.step" :value="val(f)" @input="change(f, $event)"> <b>{{ val(f) }}{{ f.unit ?? '' }}</b></template>
          <input v-else type="text" :value="val(f)" @change="change(f, $event)">
        </div>
      </div>
    </template>
    <div class="mfoot"><NuxtLink class="mbtn" to="/">← Назад</NuxtLink><button class="mbtn" @click="reset">Сбросить всё</button></div>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.tab { padding: 6px 14px; border: 1px solid var(--gold2); border-radius: 4px; cursor: pointer; }
.tab.on { background: #3a2f20; border-color: var(--gold); color: var(--gold3); }
</style>
