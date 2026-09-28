// Травинки: только вокруг камеры (как в больших играх), с наклоном по склону. Ветер и вытаптывание — в шейдере.
import { Color3 } from '@babylonjs/core';
import { TILE, UNITS } from '../../data/index.ts';
import { makeGrass } from './models/grass-blade.ts';
import { PAL } from '../config/visual.ts';
import type { GameContext } from '../context.ts';

const STOMP = 24; // сколько юнитов одновременно приминают траву

export function useBlades(ctx: GameContext) {
  const { S } = ctx, { w } = ctx.session, { scene, cam, sun, eff } = ctx.stage, { heightAt } = ctx.terrain, { skirtH } = ctx.skirt;
  const fog = ctx.fog, dirtW = ctx.ground.dirtW;
  const G = makeGrass(scene, Math.max(1, Math.round((200 * S.grass) / 100)));
  const gRad = () => Math.min(36, cam.radius * 0.8 + 9) * (eff.grassDist / 100);
  G.mat.setVector3('uSunDir', sun.direction);
  G.mat.setColor3('uBase', new Color3(PAL.grass[0] * 0.7, PAL.grass[1] * 0.7, PAL.grass[2] * 0.7)); // травинки — в цвет земли, чтобы не рябило
  G.mat.setColor3('uTip', new Color3(PAL.grassLight[0] * 1.1, PAL.grassLight[1] * 1.08, PAL.grassLight[2]));
  G.mat.setColor3('uDry', new Color3(0.72, 0.74, 0.42));
  let gBuf = new Float32Array(0), gLast = -1, gCx = -1e9, gCz = -1e9, gR = 0, gDirty = true;
  const stomp = new Array(STOMP * 4).fill(0);
  const bare = (x: number, z: number) => Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.27) + Math.sin(x * 0.09 - z * 0.13) * 0.9 + Math.sin(z * 0.51 + x * 0.07) * 0.4; // проплешины земли

  function rebuild() {
    if (!eff.grass) { G.mesh.isVisible = false; gDirty = false; return; }
    const R = gRad(), cx = cam.target.x, cz = cam.target.z;
    gCx = cx; gCz = cz; gR = R; gDirty = false;
    let n = 0;
    const need = (Math.PI * R * R + 8 * R) * 16;
    if (gBuf.length < need) { gBuf = new Float32Array(need); gLast = -1; }
    for (let z = Math.floor(cz - R); z <= cz + R; z++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 > R * R) continue;
      const onMap = x >= 0 && z >= 0 && x < w.W && z < w.H, i = x + z * w.W;
      const hh = Math.imul((x + 997) * 7919 ^ (z + 991) * 104729, 2654435761) >>> 0;
      let hill = false;
      if (onMap) {
        if (!fog.seen[i] || w.resType[i] || w.occ[i] || (w.terrain[i] !== 0 && w.terrain[i] !== 3) || dirtW[i] > 0.55) continue; // на утоптанной земле травы нет
        hill = w.terrain[i] === 3;
      } else {
        const d = Math.hypot(Math.max(-x, x - w.W + 1, 0), Math.max(-z, z - w.H + 1, 0));
        if (d > 8 || (hh % 100) / 100 > 1 - d / 9) continue; // за краем трава редеет и уходит в дымку
      }
      const dm = bare(x + 0.5, z + 0.5);
      if (dm > 1.6) continue; // голая земля — только редкие проплешины
      const gx = x + 0.5, gz = z + 0.5, H = (px: number, pz: number) => (onMap ? heightAt(px, pz) : skirtH(px, pz));
      const py = H(gx, gz);
      const sx = H(gx + 0.5, gz) - H(gx - 0.5, gz), sz = H(gx, gz + 0.5) - H(gx, gz - 0.5); // наклон склона
      const yaw = ((hh >>> 8) % 628) / 100, c = Math.cos(yaw), sn = Math.sin(yaw), s = 1.05;
      const sy = (onMap ? 1 - dirtW[i] * 0.8 : 1) * (dm > 1.1 ? 1 - ((dm - 1.1) / 0.5) * 0.7 : 1) * (0.85 + ((hh >>> 16) % 40) / 100) * (hill ? 0.8 : 1);
      const o = n * 16;
      gBuf[o] = s * c; gBuf[o + 1] = s * (c * sx - sn * sz); gBuf[o + 2] = -s * sn; gBuf[o + 3] = 0;   // травинки стоят вертикально,
      gBuf[o + 4] = 0; gBuf[o + 5] = sy; gBuf[o + 6] = 0; gBuf[o + 7] = 0;                            // а основание лежит на склоне
      gBuf[o + 8] = s * sn; gBuf[o + 9] = s * (sn * sx + c * sz); gBuf[o + 10] = s * c; gBuf[o + 11] = 0;
      gBuf[o + 12] = gx; gBuf[o + 13] = py; gBuf[o + 14] = gz; gBuf[o + 15] = 1;
      n++;
    }
    G.mesh.isVisible = n > 0;
    if (!n) return;
    if (n !== gLast) { G.mesh.thinInstanceSetBuffer('matrix', gBuf.subarray(0, n * 16), 16, false); gLast = n; }
    else G.mesh.thinInstanceBufferUpdated('matrix');
  }

  /** Каждый кадр: ветер, камера, кто топчет траву */
  function frame(t: number) {
    if (gDirty || Math.hypot(cam.target.x - gCx, cam.target.z - gCz) > 3 || Math.abs(gRad() - gR) > 4) rebuild();
    let k = 0;
    const tx = cam.target.x, tz = cam.target.z;
    for (const e of w.ents.values()) {
      if (k >= STOMP) break;
      if (e.kind !== 'u' || !fog.visible(e)) continue;
      const x = e.x / TILE, z = e.y / TILE;
      if (Math.abs(x - tx) > gR || Math.abs(z - tz) > gR) continue;
      stomp[k * 4] = x; stomp[k * 4 + 1] = 0; stomp[k * 4 + 2] = z; stomp[k * 4 + 3] = UNITS[e.type].cls === 'cavalry' || UNITS[e.type].cls === 'siege' ? 0.45 : 0.3;
      k++;
    }
    for (let j = k; j < STOMP; j++) stomp[j * 4 + 3] = 0;
    G.mat.setArray4('uStomp', stomp);
    G.mat.setFloat('uTime', S.wind ? t : 0);
    G.mat.setVector3('uCam', cam.position);
    G.mat.setColor3('uFog', scene.fogColor);
    G.mat.setFloat('uFogD', scene.fogDensity);
  }
  return { mesh: G.mesh, frame, /** трава пересоберётся в следующем кадре */ dirty() { gDirty = true; } };
}
