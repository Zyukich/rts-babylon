<!-- Настройки: графика, звук, игра, сеть + управление. Сохраняются сразу; в партии применяются на ходу -->
<script setup lang="ts">
import { FIELDS, KEYS, type Field, type Settings } from '~~/game/client/settings.ts';

const props = defineProps<{ inGame?: boolean }>();
const { settings, set, reset } = useSettings();
const tabs = [...new Set(FIELDS.map((f) => f.tab))].filter((t) => !(props.inGame && t === 'Сеть')).concat('Управление'); // адрес сервера и имя в партии не меняются
const tab = ref(tabs[0]);
const val = (f: Field) => settings.value[f.k] as string | number | boolean;
function change(f: Field, e: Event) {
  const el = e.target as HTMLInputElement, old = settings.value[f.k];
  const v = f.kind === 'check' ? el.checked : f.kind === 'text' ? el.value : typeof old === 'number' ? Number(el.value) : el.value;
  set(f.k, v as Settings[typeof f.k], f.tab === 'Графика' && f.k !== 'preset' && f.k !== 'autoQuality');
}
</script>

<template>
  <div class="settings">
    <div class="tabs"><div v-for="t in tabs" :key="t" class="tab" :class="{ on: t === tab }" @click="tab = t">{{ t }}</div></div>
    <div class="body">
      <template v-if="tab === 'Управление'">
        <div v-for="[k, a] in KEYS" :key="k" class="mrow"><b>{{ k }}</b><div>{{ a }}</div></div>
      </template>
      <template v-else>
        <div v-for="f in FIELDS.filter((x) => x.tab === tab)" :key="f.k" class="mrow">
          <div>{{ f.label }}<template v-if="f.hint"><br><small>{{ f.hint }}</small></template></div>
          <div class="ctl">
            <select v-if="f.kind === 'sel'" :value="val(f)" @change="change(f, $event)"><option v-for="[k, l] in f.opts" :key="k" :value="k">{{ l }}</option></select>
            <input v-else-if="f.kind === 'check'" type="checkbox" :checked="!!val(f)" @change="change(f, $event)">
            <template v-else-if="f.kind === 'range'"><input type="range" :min="f.min" :max="f.max" :step="f.step" :value="val(f)" @input="change(f, $event)"> <b class="num">{{ val(f) }}{{ f.unit ?? '' }}</b></template>
            <input v-else type="text" :value="val(f)" @change="change(f, $event)">
          </div>
        </div>
      </template>
    </div>
    <div class="foot"><slot name="back" /><button class="mbtn sm" @click="reset">Сбросить всё</button></div>
  </div>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; min-height: 0; }
.tabs { display: flex; gap: calc(var(--u) * 6); margin-bottom: calc(var(--u) * 12); flex-wrap: wrap; }
.tab { padding: calc(var(--u) * 7) calc(var(--u) * 15); border: 1px solid var(--gold2); border-radius: calc(var(--u) * 4); cursor: pointer; }
.tab.on { background: #3a2f20; border-color: var(--gold); color: var(--gold3); }
.body { overflow: auto; min-height: 0; }
.ctl { display: flex; align-items: center; gap: calc(var(--u) * 8); flex: none; }
.num { min-width: calc(var(--u) * 48); text-align: right; }
.foot { display: flex; justify-content: space-between; gap: calc(var(--u) * 12); margin-top: calc(var(--u) * 14); }
</style>
