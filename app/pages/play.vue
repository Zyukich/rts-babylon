<!-- Одиночная партия. ?debug — боты не нападают (F2 ресурсы, F3 карта), ?autoplay — за вас играет бот -->
<script setup lang="ts">
definePageMeta({ layout: false });
const route = useRoute();
const flag = (k: string) => k in route.query && !['0', 'false', 'no'].includes(String(route.query[k]));
const start = currentStart();
const again = () => navigateTo('/setup');
const exit = () => navigateTo('/');
</script>

<template>
  <GameView :start="start" :debug="flag('debug')" :autoplay="flag('autoplay')" @again="again" @exit="exit" />
</template>
