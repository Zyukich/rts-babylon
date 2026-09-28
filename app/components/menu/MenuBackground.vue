<!-- Фоновая битва главного меню (Babylon). Живёт, пока открыто меню -->
<script setup lang="ts">
import { createMenuScene } from '~~/game/client/menu-scene.ts';

const canvas = ref<HTMLCanvasElement>();
let stop: (() => void) | null = null;
onMounted(() => { stop = createMenuScene(canvas.value!); });
onBeforeUnmount(() => stop?.());
</script>

<template><canvas ref="canvas" class="fill" /></template>
