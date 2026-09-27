// Точка входа: сначала главное меню (лёгкая сцена), игра подгружается только после «Начать».
import { runMenu } from './menu.ts';

if (new URLSearchParams(location.search).get('room')) { // ссылка на сетевую комнату — сразу в игру
  document.body.classList.remove('menu');
  import('./main.ts');
} else runMenu(async (cfg) => {
  (window as unknown as { __epohi: unknown }).__epohi = cfg;
  document.body.classList.remove('menu');
  await import('./main.ts');
});
