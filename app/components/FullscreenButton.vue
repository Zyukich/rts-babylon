<!-- Развернуть / свернуть на весь экран -->
<script setup lang="ts">
const { on, toggle, supported } = useFullscreen();
</script>

<template>
  <button v-if="supported" class="mbtn icon" :title="on ? 'Свернуть (выйти из полноэкранного режима)' : 'Развернуть на весь экран'" @click="toggle">
    <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
      <path v-if="!on" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      <path v-else d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  </button>
</template>
