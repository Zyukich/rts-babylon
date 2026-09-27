// Экранирование для вставки чужих строк (имена игроков, параметры URL) в innerHTML
const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => MAP[c]);
