<!-- Миникарта: рисует игра; ЛКМ — камера, ПКМ — приказ -->
<script setup lang="ts">
const game = inject(GameKey)!;
const cv = ref<HTMLCanvasElement>();
let off: (() => void) | null = null;
onMounted(() => { off = game.attachMinimap(cv.value!); });
onBeforeUnmount(() => off?.());
</script>

<template><div class="mm frame"><canvas ref="cv" width="160" height="160" /></div></template>

<style scoped>
.mm { width: 164px; height: 164px; padding: 0; overflow: hidden; flex: none; box-sizing: border-box; }
canvas { display: block; cursor: pointer; }
</style>
