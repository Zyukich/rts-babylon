// Камера RTS: WASD/стрелки/край экрана, Home/End — поворот, колесо — зум. Скорость набирается и гасится с инерцией.
import type { GameContext } from '../context.ts';

export function useCamera(ctx: GameContext) {
  const { S } = ctx, { w } = ctx.session, { cam, canvas } = ctx.stage;
  const keys = new Set<string>();
  const mouse = { x: 0, y: 0, inside: false };
  let vx = 0, vz = 0, rot = 0;
  function update(dtMs: number) {
    const k = (a: string, b: string) => (keys.has(a) || keys.has(b) ? 1 : 0);
    const edge = (v: number, max: number) => (!mouse.inside || !S.edgeScroll ? 0 : v < 6 ? -1 : v > max - 6 ? 1 : 0); // мышь у края экрана
    const fz = k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown') - edge(mouse.y, canvas.clientHeight), fx = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft') + edge(mouse.x, canvas.clientWidth);
    const s = dtMs / 1000, ease = 1 - Math.exp(-s * 8); // доля «догонки» за кадр
    rot += ((k('End', 'End') - k('Home', 'Home')) * 1.6 - rot) * ease;
    cam.alpha += rot * s;
    const sp = cam.radius * 1.4 * S.camSpeed, fX = -Math.cos(cam.alpha), fZ = -Math.sin(cam.alpha), rX = -Math.sin(cam.alpha), rZ = Math.cos(cam.alpha);
    vx += ((fX * fz + rX * fx) * sp - vx) * ease;
    vz += ((fZ * fz + rZ * fx) * sp - vz) * ease;
    cam.target.x = Math.min(w.W, Math.max(0, cam.target.x + vx * s));
    cam.target.z = Math.min(w.H, Math.max(0, cam.target.z + vz * s));
  }
  return {
    keys, mouse, update,
    lookAt(x: number, z: number) { cam.target.x = x; cam.target.z = z; },
    view: () => ({ x: cam.target.x, z: cam.target.z, r: cam.radius }),
  };
}
