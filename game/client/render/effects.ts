// Эффекты: стрелы, искры, пыль, обломки, павшие, дым из труб. Только визуал — на логику не влияют.
import { BUILDINGS, UNITS, TILE, MEAT } from '../../data/index.ts';
import type { Fx } from '../../core/world.ts';
import { US, bldH } from '../config/visual.ts';
import { rhash } from './resources.ts';
import type { GameContext } from '../context.ts';

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; s: number; col: number[]; grav: number }
interface Arrow { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; t: number; dur: number }
interface Corpse { type: string; owner: number; x: number; z: number; yaw: number; t: number }
interface Smoke { x: number; y: number; z: number; t: number; life: number; s: number }

const MAX_PARTICLES = 600;

export function useEffects(ctx: GameContext) {
  const { w, pcol } = ctx.session, { heightAt } = ctx.terrain, { L, addModel } = ctx.models, fog = ctx.fog;
  const parts: Particle[] = [], arrows: Arrow[] = [], corpses: Corpse[] = [], smoke: Smoke[] = [];

  function puff(x: number, y: number, z: number, n: number, col: number[], speed: number, grav: number, size: number) {
    for (let i = 0; i < n && parts.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6), life = 0.4 + Math.random() * 0.5;
      parts.push({ x, y, z, vx: Math.cos(a) * v, vy: speed * (0.5 + Math.random()), vz: Math.sin(a) * v, life, max: life, s: size * (0.6 + Math.random() * 0.8), col, grav });
    }
  }
  /** Событие симуляции → эффект на экране (если место видно) */
  function spawn(f: Fx) {
    const x = f.x / TILE, z = f.y / TILE;
    if (!fog.vis[(x | 0) + (z | 0) * w.W]) return;
    const y = heightAt(x, z);
    if (f.k === 'shot' && f.tx !== undefined && f.ty !== undefined) {
      const x1 = f.tx / TILE, z1 = f.ty / TILE;
      arrows.push({ x0: x, z0: z, x1, z1, y0: y + 0.6, y1: heightAt(x1, z1) + 0.5, t: 0, dur: Math.max(0.15, Math.hypot(x1 - x, z1 - z) * 0.07) });
    } else if (f.k === 'hit' && f.type && BUILDINGS[f.type]) puff(x, y + 0.8, z, 4, [0.6, 0.55, 0.5, 1], 1.8, 7, 0.12); // обломки
    else if (f.k === 'hit') puff(x, y + 0.5, z, 3, [0.85, 0.15, 0.12, 1], 1.2, 6, 0.06);        // кровь/искры
    else if (f.k === 'die' && f.type && UNITS[f.type]?.animal) puff(x, y + 0.3, z, 5, [0.6, 0.1, 0.1, 1], 1, 6, 0.06);
    else if (f.k === 'die' && f.type && UNITS[f.type]) corpses.push({ type: f.type, owner: f.owner, x, z, yaw: ctx.ents.yawOf(f.id ?? -1), t: 0 });
    else if (f.k === 'die') puff(x, y + 0.5, z, 24, [0.55, 0.5, 0.45, 1], 2.5, 3, 0.3);          // рухнувшее здание
    else if (f.k === 'built') puff(x, y + 0.2, z, 10, [0.8, 0.75, 0.6, 1], 1.5, 2, 0.15);
  }

  /** Рисуется внутри кадра юнитов (те же слои моделей) */
  function draw(dt: number) {
    const A = ctx.assets;
    for (let i = corpses.length - 1; i >= 0; i--) { // павшие лежат 4 секунды и тают
      const c = corpses[i];
      c.t += dt;
      if (c.t > 4) { corpses.splice(i, 1); continue; }
      const s = c.t > 3 ? 4 - c.t : 1;
      const au = A?.units[c.type], die = au?.die, y = heightAt(c.x, c.z);
      if (die) {
        const f = die[Math.min(die.length - 1, Math.floor((c.t / (A?.udur[c.type]?.die ?? 1)) * die.length))];
        f.base.add(c.x, y, c.z, s * US, s * US, s * US, undefined, c.yaw);
        f.team?.add(c.x, y, c.z, s * US, s * US, s * US, [...pcol(c.owner), 1], c.yaw);
      } else if (au?.idle) { // техника без анимации гибели: обломки оседают в землю
        const f = au.idle[0], k = Math.max(0.05, 1 - c.t / 4);
        f.base.add(c.x, y - (1 - k) * 0.3, c.z, US, US * k, US, undefined, c.yaw);
        f.team?.add(c.x, y - (1 - k) * 0.3, c.z, US, US * k, US, [...pcol(c.owner).map((v) => v * 0.5), 1], c.yaw);
      } else addModel(c.type, c.x, heightAt(c.x, c.z) - 0.02, c.z, c.yaw, s * US, [...pcol(c.owner).map((v) => v * 0.6), 1], 0.2);
    }
    for (const ti of w.carcass.values()) { // туши коров: лежат, уменьшаются по мере разделки
      if (!w.resType[ti] || w.resKind[ti] !== 1 || !fog.seen[ti]) continue;
      const cx = (ti % w.W) + 0.5, cz = ((ti / w.W) | 0) + 0.5, k = 0.4 + (0.6 * w.resAmt[ti]) / MEAT;
      addModel('cow', cx, heightAt(cx, cz), cz, (rhash(ti) % 628) / 100, US, [0.55, 0.5, 0.5, 1], 0.3 * k);
    }
    for (const e of w.ents.values()) { // дым из труб домов и столицы
      if (e.kind !== 'b' || (e.type !== 'house' && e.type !== 'town_center') || e.progress < BUILDINGS[e.type].time || !fog.vis[e.tx + e.ty * w.W] || Math.random() > dt * 2.2) continue;
      const d = BUILDINGS[e.type], cx = e.tx + d.size * 0.65, cz = e.ty + d.size * 0.35;
      smoke.push({ x: cx, y: heightAt(cx, cz) + bldH(e.type) * 0.95, z: cz, t: 0, life: 3 + Math.random() * 1.5, s: 0.12 + Math.random() * 0.06 });
    }
    L.smoke.begin();
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.t += dt;
      if (p.t > p.life) { smoke.splice(i, 1); continue; }
      const k = p.t / p.life, sz = p.s * (1 + k * 3) * (1 - k * 0.6);
      L.smoke.add(p.x + k * 0.6, p.y + p.t * 0.45, p.z + Math.sin(p.t + p.x) * 0.1, sz, sz, sz);
    }
    L.smoke.end();
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.vy -= q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const g = heightAt(q.x, q.z);
      if (q.y < g) { q.y = g; q.vy = 0; q.vx *= 0.5; q.vz *= 0.5; }
      const s = q.s * Math.min(1, (q.life / q.max) * 2);
      L.fx.add(q.x, q.y, q.z, s, s, s, q.col);
    }
    for (let i = arrows.length - 1; i >= 0; i--) { // стрела летит по дуге
      const r = arrows[i];
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { arrows.splice(i, 1); continue; }
      const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
      L.arrow.add(r.x0 + (r.x1 - r.x0) * k, r.y0 + (r.y1 - r.y0) * k + Math.sin(k * Math.PI) * len * 0.15, r.z0 + (r.z1 - r.z0) * k, 1, 1, 1, undefined, Math.atan2(r.x1 - r.x0, r.z1 - r.z0));
    }
  }
  return { spawn, draw };
}
