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
.sel { flex: 1; padding: 8px 12px; overflow: hidden; min-width: 0; }
.pv { display: flex; gap: 14px; }
.portrait { width: 92px; height: 92px; font-size: 56px; line-height: 92px; text-align: center; background: radial-gradient(#5a4a33, #1c160f); border: 2px solid var(--gold); border-radius: 8px; flex: none; }
.nm { font-size: 18px; color: var(--gold3); font-weight: 600; }
.sub { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.hp { width: 220px; height: 10px; background: #300; border: 1px solid #000; margin: 4px 0; }
.hp div { height: 100%; }
.stats { font-size: 13px; display: flex; gap: 12px; flex-wrap: wrap; }
.slots, .grp { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.slot { position: relative; width: 40px; height: 40px; font-size: 22px; line-height: 40px; text-align: center; background: #2a2218; border: 1px solid var(--gold2); border-radius: 4px; cursor: pointer; }
.slot:hover { border-color: #ff6a5a; }
.pb { position: absolute; left: 0; bottom: 0; height: 4px; background: #8fc05a; }
.slot u { position: absolute; bottom: 0; right: 2px; font: 10px sans-serif; text-decoration: none; line-height: 12px; }
.hint { color: #a89878; font-size: 12px; line-height: 1.6; }
</style>
