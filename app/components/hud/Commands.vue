<!-- Сетка команд: иконка, горячая клавиша, счётчик заказов; подсказка с ценой и описанием при наведении -->
<script setup lang="ts">
import type { CmdItem, CmdButton } from '~~/game/client/hud/types.ts';
defineProps<{ items: CmdItem[] }>();
const game = inject(GameKey)!;
const tip = ref<{ b: CmdButton; left: number; bottom: number } | null>(null);
function show(b: CmdButton, e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  tip.value = { b, left: Math.min(innerWidth - r.width * 5.2, r.left), bottom: innerHeight - r.top + 6 };
}
const isBtn = (it: CmdItem): it is CmdButton => 'a' in it;
</script>

<template>
  <div class="cmd frame" @mouseleave="tip = null">
    <div class="grid">
      <template v-for="(it, i) in items" :key="isBtn(it) ? it.a : 'h' + i">
        <div v-if="isBtn(it)" class="b" :class="{ off: !it.ok }" @pointerdown.left="it.ok && game.act(it.a)" @mouseenter="show(it, $event)">
          <i v-if="it.hk">{{ it.hk }}</i>{{ it.icon }}<u v-if="it.badge">{{ it.badge }}</u>
        </div>
        <div v-else class="hdr">{{ it.header }}</div>
      </template>
    </div>
    <div v-if="tip" class="tip" :style="{ left: tip.left + 'px', bottom: tip.bottom + 'px' }">
      <b>{{ tip.b.tip.title }}</b>
      <div v-for="l in tip.b.tip.lines ?? []" :key="l">{{ l }}</div>
      <small v-if="tip.b.tip.note">{{ tip.b.tip.note }}</small>
      <div v-if="tip.b.hk"><small>Клавиша: {{ tip.b.hk }}</small></div>
    </div>
  </div>
</template>

<style scoped>
.cmd { width: calc(var(--u) * 434); padding: calc(var(--u) * 7); overflow-y: auto; flex: none; box-sizing: border-box; }
.grid { display: grid; grid-template-columns: repeat(6, calc(var(--u) * 64)); gap: calc(var(--u) * 5); }
.hdr { grid-column: 1 / -1; font-size: calc(var(--u) * 12); color: var(--gold); padding: calc(var(--u) * 2) 0 0; }
.b { position: relative; width: calc(var(--u) * 64); height: calc(var(--u) * 64); font-size: calc(var(--u) * 32); line-height: calc(var(--u) * 60); text-align: center; cursor: pointer; background: radial-gradient(#4a3d2b, #211a12); border: calc(var(--u) * 2) solid var(--gold2); border-radius: calc(var(--u) * 6); box-sizing: border-box; }
.b:hover { border-color: var(--gold3); box-shadow: 0 0 calc(var(--u) * 8) #f3d08a66; }
.b.off { filter: grayscale(1) brightness(.55); cursor: default; }
.b i { position: absolute; top: 1px; left: calc(var(--u) * 3); font: bold calc(var(--u) * 12) sans-serif; color: var(--gold3); line-height: calc(var(--u) * 13); font-style: normal; }
.b u { position: absolute; bottom: 1px; right: calc(var(--u) * 3); font: calc(var(--u) * 12) sans-serif; color: #fff; line-height: calc(var(--u) * 13); text-decoration: none; text-shadow: 0 0 calc(var(--u) * 2) #000; }
.tip { position: fixed; max-width: calc(var(--u) * 300); padding: calc(var(--u) * 9) calc(var(--u) * 12); background: #15110cf2; border: 1px solid var(--gold); border-radius: calc(var(--u) * 4); font-size: calc(var(--u) * 14); pointer-events: none; z-index: 30; }
.tip b { color: var(--gold3); }
.tip small { color: var(--muted); }
</style>
