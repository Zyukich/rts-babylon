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
      <small style="opacity: .5">сб.24 · Nuxt</small>
    </nav>
    <main class="content"><slot /></main>
  </div>
</template>

<style scoped>
.menu { position: fixed; inset: 0; display: flex; }
.side { position: relative; z-index: 1; width: 330px; padding: 56px 40px 24px; background: linear-gradient(90deg, #15110cee, #15110c00); display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; }
.title { font: 700 58px Georgia, serif; color: var(--gold3); text-shadow: 0 3px 14px #000; letter-spacing: 8px; }
.sub { color: #d9c49a; margin: -6px 0 26px; text-shadow: 0 1px 4px #000; }
.content { position: relative; z-index: 1; flex: 1; min-width: 0; }
</style>
