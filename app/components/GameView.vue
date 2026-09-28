<!-- Матч: canvas с игрой + HUD поверх. Игра — отдельный клиент (game/client), здесь только отображение снимка и кнопки -->
<script setup lang="ts">
import type { StartCfg } from '~~/game/client/settings.ts';
import type { NetSession } from '~~/game/client/net/net.ts';

const props = defineProps<{ start?: StartCfg | null; net?: NetSession | null; debug?: boolean; autoplay?: boolean }>();
const emit = defineEmits<{ exit: []; again: [] }>();
const canvas = ref<HTMLCanvasElement>();
const { hud, progress, error } = useGame(canvas, { start: props.start, net: props.net, debug: props.debug, autoplay: props.autoplay });
const zoom = computed(() => ({ zoom: String(hud.value?.uiScale ?? 1) }));
</script>

<template>
  <div class="game">
    <canvas ref="canvas" class="fill" />
    <div v-if="error" class="msg err">Не удалось запустить игру: {{ error }}</div>
    <div v-else-if="!hud" class="msg">{{ progress }}</div>
    <template v-else>
      <div :style="zoom"><HudTopBar :hud="hud" /></div>
      <div v-if="hud.debug" class="debug">DEBUG · боты не нападают · F2 +1000 ресурсов · F3 карта</div>
      <div :style="zoom"><HudAlerts :alerts="hud.alerts" /></div>
      <HudDiplomacy v-if="hud.diplomacy" :rows="hud.diplomacy" />
      <div class="panel" :style="zoom">
        <HudMinimap />
        <HudSelection :panel="hud.selection" />
        <HudCommands :items="hud.commands" />
      </div>
      <div v-if="hud.box" class="box" :style="{ left: hud.box.x + 'px', top: hud.box.y + 'px', width: hud.box.w + 'px', height: hud.box.h + 'px' }" />
      <div v-if="hud.message" class="msg">{{ hud.message }}</div>
      <HudPauseMenu v-if="hud.menu" :can-pause="hud.canPause" @exit="emit('exit')" />
      <HudEndScreen v-if="hud.end" :end="hud.end" :again="!net" @again="emit('again')" @exit="emit('exit')" />
    </template>
  </div>
</template>

<style scoped>
.game { position: fixed; inset: 0; }
.panel { position: fixed; left: 0; right: 0; bottom: 0; height: 176px; display: flex; gap: 8px; padding: 6px 8px 8px; box-sizing: border-box; background: linear-gradient(#2c251c, #15110c); border-top: 2px solid var(--gold); box-shadow: 0 -4px 12px #0009; z-index: 2; }
.box { position: fixed; border: 1px solid #fff; background: #fff2; pointer-events: none; z-index: 5; }
.msg { position: fixed; top: 40%; width: 100%; text-align: center; font-size: 42px; text-shadow: 0 2px 8px #000; pointer-events: none; z-index: 6; }
.msg.err { font-size: 20px; color: #ff8a7a; }
.debug { position: fixed; top: 44px; left: 50%; transform: translateX(-50%); z-index: 5; padding: 3px 10px; border-radius: 6px; background: #7a1d1dcc; color: #fff; font: 12px sans-serif; pointer-events: none; }
</style>
