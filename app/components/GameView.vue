<!-- Матч: canvas с игрой + HUD поверх. Игра — отдельный клиент (game/client), здесь только отображение снимка и кнопки.
     Пока всё не загружено и не отрисовано — экран загрузки -->
<script setup lang="ts">
import type { StartCfg } from '~~/game/client/settings.ts';
import type { NetSession } from '~~/game/client/net/net.ts';

const props = defineProps<{ start?: StartCfg | null; net?: NetSession | null; debug?: boolean; autoplay?: boolean }>();
const emit = defineEmits<{ exit: []; again: [] }>();
const canvas = ref<HTMLCanvasElement>();
const { hud, progress, stage, ready, error } = useGame(canvas, { start: props.start, net: props.net, debug: props.debug, autoplay: props.autoplay });
const { settings } = useSettings();
const scale = computed(() => ({ '--ui-scale': String(settings.value.uiScale) }));
</script>

<template>
  <div class="game" :style="scale">
    <canvas ref="canvas" class="fill" />
    <template v-if="hud && ready">
      <HudTopBar :hud="hud" />
      <div v-if="hud.debug" class="debug">DEBUG · боты не нападают · F2 +1000 ресурсов · F3 карта</div>
      <HudEventFeed :events="hud.events" />
      <HudAlerts :alerts="hud.alerts" />
      <HudDiplomacy v-if="hud.diplomacy" :rows="hud.diplomacy" />
      <div class="panel">
        <HudMinimap />
        <HudSelection :panel="hud.selection" />
        <HudCommands :items="hud.commands" />
      </div>
      <div v-if="hud.box" class="box" :style="{ left: hud.box.x + 'px', top: hud.box.y + 'px', width: hud.box.w + 'px', height: hud.box.h + 'px' }" />
      <div v-if="hud.message" class="msg">{{ hud.message }}</div>
      <HudPauseMenu v-if="hud.menu" :can-pause="hud.canPause" @exit="emit('exit')" />
      <HudEndScreen v-if="hud.end" :end="hud.end" :again="!net" @again="emit('again')" @exit="emit('exit')" />
    </template>
    <Transition name="fade"><LoadingScreen v-if="!ready || error" :progress="progress" :stage="stage" :error="error" @exit="emit('exit')" /></Transition>
  </div>
</template>

<style scoped>
.game { position: fixed; inset: 0; }
.panel { position: fixed; left: 0; right: 0; bottom: 0; height: calc(var(--u) * 206); display: flex; gap: calc(var(--u) * 8); padding: calc(var(--u) * 8) calc(var(--u) * 9) calc(var(--u) * 9); box-sizing: border-box; background: linear-gradient(#2c251c, #15110c); border-top: calc(var(--u) * 2) solid var(--gold); box-shadow: 0 -4px 12px #0009; z-index: 2; }
.box { position: fixed; border: 1px solid #fff; background: #fff2; pointer-events: none; z-index: 5; }
.msg { position: fixed; top: 40%; width: 100%; text-align: center; font-size: calc(var(--u) * 38); text-shadow: 0 2px 8px #000; pointer-events: none; z-index: 6; }
.debug { position: fixed; top: calc(var(--u) * 52); left: 50%; transform: translateX(-50%); z-index: 5; padding: calc(var(--u) * 3) calc(var(--u) * 10); border-radius: calc(var(--u) * 6); background: #7a1d1dcc; color: #fff; font-size: calc(var(--u) * 12); pointer-events: none; white-space: nowrap; }
.fade-leave-active { transition: opacity .6s ease; }
.fade-leave-to { opacity: 0; }
</style>
