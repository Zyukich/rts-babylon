<!-- Панель выделения: портрет, здоровье, характеристики, очередь найма (клик — отмена), группа по типам -->
<script setup lang="ts">
import type { SelectionPanel } from '~~/game/client/hud/types.ts';
defineProps<{ panel: SelectionPanel }>();
const game = inject(GameKey)!;
const hpColor = (k: number) => (k > 0.6 ? '#5cbf3a' : k > 0.3 ? '#e0b030' : '#d8452e');
</script>

<template>
  <div class="sel frame">
    <div v-if="panel.kind === 'none'" class="hint">
      <template v-if="panel.hints">
        ЛКМ — выбрать (двойной клик — всех таких), рамка — группа. ПКМ — приказ, Shift+ПКМ — в очередь, F+ЛКМ — атака с движением.<br>
        Камера: WASD, стрелки или мышь у края; колесо — зум; Home/End — поворот. X — стоп, Del — снести, H — к столице, . — бездельник, , — армия, Ctrl/Shift+1…9 — группы.<br>
        ПКМ жителями по повреждённому зданию — ремонт. Клик по иконке в очереди — отмена с возвратом ресурсов.
      </template>
    </div>
    <div v-else-if="panel.kind === 'resource'" class="pv">
      <div class="portrait">{{ panel.icon }}</div>
      <div><div class="nm">{{ panel.name }}</div><div class="sub">Осталось: <b>{{ panel.left }}</b> {{ panel.resIcon }}</div><div class="sub">Добывают: {{ panel.workers }}</div></div>
    </div>
    <div v-else-if="panel.kind === 'one'" class="pv">
      <div class="portrait">{{ panel.icon }}</div>
      <div>
        <div class="nm">{{ panel.name }}</div><div class="sub">{{ panel.owner }}</div>
        <div class="hp"><div :style="{ width: Math.max(0, panel.hp / panel.maxHp) * 100 + '%', background: hpColor(panel.hp / panel.maxHp) }" /></div>
        <div class="stats"><span v-for="s in panel.stats" :key="s">{{ s }}</span></div>
        <div v-for="l in panel.lines" :key="l" class="sub">{{ l }}</div>
        <div v-if="panel.queue.length" class="slots">
          <div v-for="q in panel.queue" :key="q.a" class="slot" :title="q.title" @pointerdown.left="game.act(q.a)">
            {{ q.icon }}<div v-if="q.progress !== undefined" class="pb" :style="{ width: q.progress + '%' }" />
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="panel.kind === 'buildings'" class="pv">
      <div class="portrait">{{ panel.icon }}</div>
      <div>
        <div class="nm">{{ panel.name }} ×{{ panel.count }}</div>
        <div class="sub">В работе: {{ panel.busy || 'ничего' }}</div>
        <div class="slots"><div v-for="q in panel.queue" :key="q.a" class="slot" :title="q.title" @pointerdown.left="game.act(q.a)">{{ q.icon }}<u>{{ q.count }}</u></div></div>
      </div>
    </div>
    <div v-else>
      <div class="nm">Выбрано: {{ panel.count }}</div>
      <div class="grp"><div v-for="t in panel.types" :key="t.a" class="slot" :title="t.title" @pointerdown.left="game.act(t.a)">{{ t.icon }}<u>{{ t.count }}</u></div></div>
    </div>
  </div>
</template>

<style scoped>
.sel { flex: 1; padding: calc(var(--u) * 10) calc(var(--u) * 14); font-size: calc(var(--u) * 14); overflow: hidden; min-width: 0; }
.pv { display: flex; gap: calc(var(--u) * 14); }
.portrait { width: calc(var(--u) * 110); height: calc(var(--u) * 110); font-size: calc(var(--u) * 66); line-height: calc(var(--u) * 110); text-align: center; background: radial-gradient(#5a4a33, #1c160f); border: calc(var(--u) * 2) solid var(--gold); border-radius: calc(var(--u) * 8); flex: none; }
.nm { font-size: calc(var(--u) * 20); color: var(--gold3); font-weight: 600; }
.sub { font-size: calc(var(--u) * 13); color: var(--muted); margin-bottom: calc(var(--u) * 4); }
.hp { width: calc(var(--u) * 260); height: calc(var(--u) * 12); background: #300; border: 1px solid #000; margin: calc(var(--u) * 4) 0; }
.hp div { height: 100%; }
.stats { font-size: calc(var(--u) * 14); display: flex; gap: calc(var(--u) * 12); flex-wrap: wrap; }
.slots, .grp { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 4); margin-top: calc(var(--u) * 6); }
.slot { position: relative; width: calc(var(--u) * 46); height: calc(var(--u) * 46); font-size: calc(var(--u) * 26); line-height: calc(var(--u) * 46); text-align: center; background: #2a2218; border: 1px solid var(--gold2); border-radius: calc(var(--u) * 4); cursor: pointer; }
.slot:hover { border-color: #ff6a5a; }
.pb { position: absolute; left: 0; bottom: 0; height: calc(var(--u) * 4); background: #8fc05a; }
.slot u { position: absolute; bottom: 0; right: calc(var(--u) * 2); font: calc(var(--u) * 11) sans-serif; text-decoration: none; line-height: calc(var(--u) * 13); }
.hint { color: #a89878; font-size: calc(var(--u) * 13); line-height: 1.6; }
</style>
