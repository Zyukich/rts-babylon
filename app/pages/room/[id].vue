<!-- Комната сетевой игры: лобби (игроки, ссылка, старт у хоста), затем — сам матч -->
<script setup lang="ts">
import { joinRoom, type NetSession } from '~~/game/client/net/net.ts';

definePageMeta({ layout: false });
const route = useRoute(), room = String(route.params.id);
const { settings } = useSettings(), server = useServerUrl();
const players = ref<string[]>([]), you = ref(-1), error = ref(''), ai = ref('normal');
const net = shallowRef<NetSession | null>(null);
const link = computed(() => location.href);
let conn: ReturnType<typeof joinRoom> | null = null;
onMounted(() => {
  conn = joinRoom(server.value, room, settings.value.name || 'Игрок', {
    lobby: (p, y) => { players.value = p; you.value = y; },
    start: (n) => { net.value = n; },
    error: (m) => { error.value = m; },
  });
});
onBeforeUnmount(() => conn?.close());
const exit = () => navigateTo('/');
const startGame = () => conn?.start(ai.value);
</script>

<template>
  <GameView v-if="net" :net="net" @exit="exit" />
  <div v-else>
    <MenuBackground />
    <div class="mpanel lobby">
      <h2>Комната {{ room }}</h2>
      <div v-if="error" class="merr">{{ error }}</div>
      <template v-else-if="you < 0">Подключение к {{ server }}…</template>
      <template v-else>
        <div class="mrow"><div>Ссылка для друга</div><input type="text" readonly :value="link" style="width: 420px" @click="($event.target as HTMLInputElement).select()"></div>
        <div class="mrow"><div>Игроки</div><div><span v-for="(p, i) in players" :key="i" :class="{ me: i === you }">{{ p }}<template v-if="i < players.length - 1">, </template></span></div></div>
        <div v-if="you === 0" class="mrow"><div>Боты на пустых местах</div>
          <select v-model="ai"><option value="easy">Лёгкий</option><option value="normal">Средний</option><option value="hard">Сложный</option></select></div>
        <p v-else>Ждём, пока хост начнёт…</p>
      </template>
      <div class="mfoot"><NuxtLink class="mbtn" to="/lobby">← Назад</NuxtLink><button v-if="you === 0 && !error" class="mbtn" @click="startGame">▶ Начать</button></div>
    </div>
  </div>
</template>

<style scoped>
.lobby { position: relative; z-index: 1; width: min(calc(var(--u) * 640), 92vw); margin-top: 12vh; }
.me { text-decoration: underline; }
</style>
