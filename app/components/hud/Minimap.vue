<!-- Миникарта: рисует игра; ЛКМ — камера, ПКМ — приказ -->
<script setup lang="ts">
const game = inject(GameKey)!;
const cv = ref<HTMLCanvasElement>();
let off: (() => void) | null = null;
onMounted(() => { off = game.attachMinimap(cv.value!); });
onBeforeUnmount(() => off?.());
</script>

<template><div class="mm frame"><canvas ref="cv" width="256" height="256" /></div></template>

<style scoped>
.mm { width: calc(var(--u) * 188); height: calc(var(--u) * 188); padding: 0; overflow: hidden; flex: none; box-sizing: border-box; }
canvas { display: block; width: 100%; height: 100%; cursor: pointer; image-rendering: pixelated; }
</style>
