// Геометрия линии стены: направление, шаг сегментов, поворот. Сегменты стоят на клетках, а рисуются ровно по линии.
export function lineFrame(W: number, l0: number, l1: number) {
  const ax = (l0 % W) + 0.5, az = ((l0 / W) | 0) + 0.5, dx = (l1 % W) + 0.5 - ax, dz = ((l1 / W) | 0) + 0.5 - az, len = Math.hypot(dx, dz);
  if (l0 < 0 || len < 0.01) return null;
  const ux = dx / len, uz = dz / len;
  return { ax, az, ux, uz, sp: len / Math.max(Math.abs(dx), Math.abs(dz)), yaw: Math.atan2(-uz, ux) };
}
export type LineFrame = NonNullable<ReturnType<typeof lineFrame>>;

/** Проекция центра клетки на линию стены */
export function onLine(f: LineFrame | null, px: number, pz: number): [number, number] {
  if (!f) return [px, pz];
  const t = (px - f.ax) * f.ux + (pz - f.az) * f.uz;
  return [f.ax + f.ux * t, f.az + f.uz * t];
}

/** Линия Брезенхэма от клетки start до (x1, y1), не длиннее max сегментов */
export function wallLine(W: number, start: number, x1: number, y1: number, max = 40): number[] {
  let x0 = start % W, y0 = (start / W) | 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), ix = x0 < x1 ? 1 : -1, iy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const out: number[] = [];
  for (;;) {
    out.push(x0 + y0 * W);
    if ((x0 === x1 && y0 === y1) || out.length >= max) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += ix; }
    if (e2 <= dx) { err += dx; y0 += iy; }
  }
  return out;
}
