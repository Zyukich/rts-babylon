<!-- Витрина моделей: что подключено в assets/catalog.json и как это выглядит. Для художника/разработчика, в меню не выводится -->
<script setup lang="ts">
import { createViewer, type ViewerItem } from '~~/game/client/viewer.ts';
import { COLORS } from '~~/game/client/settings.ts';
import type { AnimKey } from '~~/game/client/assets/loader.ts';

definePageMeta({ layout: false });
const canvas = ref<HTMLCanvasElement>();
const items = shallowRef<ViewerItem[]>([]), progress = ref('Загрузка моделей…');
const anim = ref<AnimKey>('idle'), color = ref(0), focus = ref('');
const ANIMS: [AnimKey, string][] = [['idle', 'Стоит'], ['walk', 'Идёт'], ['attack', 'Бьёт'], ['shoot', 'Стреляет'], ['work', 'Работает'], ['die', 'Гибнет']];
let v: Awaited<ReturnType<typeof createViewer>> | null = null, gone = false;
onMounted(async () => {
  const x = await createViewer(canvas.value!, (t) => (progress.value = t));
  if (gone) return x.dispose();
  v = x; items.value = x.items; progress.value = ''; x.focus('');
});
onBeforeUnmount(() => { gone = true; v?.dispose(); });
watch(anim, (a) => v?.setAnim(a));
watch(color, (c) => v?.setColor(COLORS[c][1]));
watch(focus, (f) => v?.focus(f));
</script>

<template>
  <canvas ref="canvas" class="fill" />
  <div class="side mpanel">
    <h2>Модели</h2>
    <div v-if="progress">{{ progress }}</div>
    <template v-else>
      <div class="row"><span v-for="[k, l] in ANIMS" :key="k" class="chip" :class="{ on: anim === k }" @click="anim = k">{{ l }}</span></div>
      <div class="row"><span v-for="(c, i) in COLORS" :key="i" class="sw" :class="{ on: color === i }" :style="{ background: `rgb(${c[1].map((x) => x * 255).join(',')})` }" @click="color = i" /></div>
      <div class="list">
        <div class="it" :class="{ on: !focus }" @click="focus = ''">Все рядом</div>
        <div v-for="it in items" :key="it.id" class="it" :class="{ on: focus === it.id }" @click="focus = it.id">
          {{ it.kind === 'unit' ? '🧍' : '🏠' }} {{ it.name }} <small>{{ it.id }}{{ it.anims.length ? ' · ' + it.anims.join(', ') : '' }}</small>
        </div>
      </div>
      <small>Подключение моделей — assets/catalog.json, затем <b>npm run assets</b>. Колесо — зум, ЛКМ — вращать.</small>
    </template>
    <div class="mfoot"><NuxtLink class="mbtn sm" to="/">← В меню</NuxtLink></div>
  </div>
</template>

<style scoped>
.side { position: fixed; top: 12px; left: 12px; bottom: 12px; margin: 0; width: 330px; max-height: none; display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { padding: 3px 8px; border: 1px solid var(--gold2); border-radius: 4px; cursor: pointer; font-size: 13px; }
.chip.on, .it.on { background: #3a2f20; border-color: var(--gold); color: var(--gold3); }
.sw { width: 20px; height: 20px; border-radius: 4px; cursor: pointer; border: 2px solid transparent; }
.sw.on { border-color: #fff; }
.list { flex: 1; overflow: auto; }
.it { padding: 4px 6px; border: 1px solid transparent; border-radius: 4px; cursor: pointer; }
.it small { opacity: .55; }
</style>
