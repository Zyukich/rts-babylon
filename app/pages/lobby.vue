<!-- Сетевая игра: имя и комната. Ссылку на комнату можно отправить другу -->
<script setup lang="ts">
const { settings, set } = useSettings();
const room = ref(Math.random().toString(36).slice(2, 8));
const server = useServerUrl();
const go = () => { const r = room.value.trim(); if (r) navigateTo(`/room/${encodeURIComponent(r)}`); };
</script>

<template>
  <div class="mpanel">
    <h2>Сетевая игра</h2>
    <div class="mrow"><div>Ваше имя</div><input type="text" maxlength="24" :value="settings.name" @change="set('name', ($event.target as HTMLInputElement).value.trim() || 'Игрок')"></div>
    <div class="mrow"><div>Комната<br><small>Отправьте другу ссылку, которая появится в лобби</small></div><input v-model="room" type="text" maxlength="32" style="width: 160px" @keydown.enter="go"></div>
    <p style="opacity: .75">Нужен запущенный сервер: <b>npm run server</b>. Сервер: <b>{{ server }}</b> (меняется в Настройках → Сеть). Пустые места займут боты.</p>
    <div class="mfoot"><NuxtLink class="mbtn" to="/">← Назад</NuxtLink><button class="mbtn" @click="go">▶ Создать / войти</button></div>
  </div>
</template>
