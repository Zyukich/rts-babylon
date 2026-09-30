<!-- Меню: 3D-сценка на фоне, слева — навигация, справа — содержимое страницы -->
<template>
  <div class="menu">
    <MenuBackground />
    <nav class="side">
      <div class="title">ЭПОХИ</div>
      <div class="sub">Стратегия в реальном времени</div>
      <NuxtLink class="mbtn" to="/setup">⚔ Одиночная игра</NuxtLink>
      <NuxtLink class="mbtn" to="/lobby">🌐 Сетевая игра</NuxtLink>
      <NuxtLink class="mbtn" to="/settings">⚙ Настройки</NuxtLink>
      <div style="flex: 1" />
      <small style="opacity: .5">сб.25</small>
    </nav>
    <main class="content"><slot /></main>
    <div class="corner"><FullscreenButton /></div>
  </div>
</template>

<style scoped>
.menu { position: fixed; inset: 0; display: flex; }
.side { position: relative; z-index: 1; width: calc(var(--u) * 340); flex: none; padding: calc(var(--u) * 56) calc(var(--u) * 40) calc(var(--u) * 24); background: linear-gradient(90deg, #15110cee, #15110c00); display: flex; flex-direction: column; gap: calc(var(--u) * 12); box-sizing: border-box; }
.title { font: 700 calc(var(--u) * 62) Georgia, serif; color: var(--gold3); text-shadow: 0 3px 14px #000; letter-spacing: calc(var(--u) * 8); }
.sub { color: #d9c49a; margin: calc(var(--u) * -6) 0 calc(var(--u) * 26); text-shadow: 0 1px 4px #000; }
.content { position: relative; z-index: 1; flex: 1; min-width: 0; }
.corner { position: fixed; top: calc(var(--u) * 12); right: calc(var(--u) * 12); z-index: 2; }
</style>
