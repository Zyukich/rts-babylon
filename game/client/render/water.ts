// Вода: цвет по глубине, пена у берега, блик солнца, отражение неба, лёгкие волны.
import { MeshBuilder, VertexBuffer, ShaderMaterial, Effect } from '@babylonjs/core';
import type { GameContext } from '../context.ts';

Effect.ShadersStore.waterVertexShader = `precision highp float; attribute vec3 position; attribute float depth;
  uniform mat4 world, viewProjection; uniform float uTime; varying vec3 vW; varying float vD;
  void main() { vec4 wp = world * vec4(position, 1.0); wp.y += sin(wp.x * 1.7 + uTime * 1.3) * 0.012 + cos(wp.z * 1.3 + uTime) * 0.012;
    vW = wp.xyz; vD = depth; gl_Position = viewProjection * wp; }`;
Effect.ShadersStore.waterFragmentShader = `precision highp float; varying vec3 vW; varying float vD;
  uniform vec3 uCam, uSun, uFog; uniform float uFogD, uTime;
  void main() {
    float d = clamp(vD / 0.25, 0.0, 1.0);
    vec3 col = mix(vec3(0.33, 0.7, 0.68), vec3(0.07, 0.29, 0.47), d);
    vec2 p = vW.xz;
    vec3 n = normalize(vec3(sin(p.x * 3.1 + uTime * 1.7) * 0.12 + sin(p.y * 2.3 - uTime * 1.1) * 0.08, 1.0, cos(p.y * 3.7 + uTime * 1.4) * 0.12 + cos(p.x * 2.1 + uTime) * 0.07));
    vec3 V = normalize(uCam - vW), L = normalize(-uSun), H = normalize(L + V);
    col = mix(col, vec3(0.75, 0.86, 0.95), pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.6);
    col += pow(max(dot(n, H), 0.0), 120.0) * vec3(1.0, 0.95, 0.8) * 0.8;
    float foam = smoothstep(0.07, 0.0, vD) * (0.6 + 0.4 * sin(p.x * 9.0 + p.y * 7.0 + uTime * 2.0));
    col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.8);
    float a = max(mix(0.55, 0.92, d), foam);
    col = mix(uFog, col, exp(-pow(length(uCam - vW) * uFogD, 2.0)));
    gl_FragColor = vec4(col, a);
  }`;

export function useWater(ctx: GameContext) {
  const { w } = ctx.session, { scene, cam, sun } = ctx.stage, { heightAt } = ctx.terrain;
  const water = MeshBuilder.CreateGround('water', { width: w.W, height: w.H, subdivisionsX: w.W, subdivisionsY: w.H }, scene);
  water.position.set(w.W / 2, -0.12, w.H / 2);
  water.isPickable = false;
  const pos = water.getVerticesData(VertexBuffer.PositionKind)!, dep: number[] = [];
  for (let i = 0; i < pos.length; i += 3) dep.push(-0.12 - heightAt(pos[i] + w.W / 2, pos[i + 2] + w.H / 2));
  water.setVerticesData('depth', dep, false, 1);
  const wm = new ShaderMaterial('water', scene, { vertex: 'water', fragment: 'water' }, { attributes: ['position', 'depth'], uniforms: ['world', 'viewProjection', 'uTime', 'uCam', 'uSun', 'uFog', 'uFogD'], needAlphaBlending: true });
  wm.backFaceCulling = false;
  water.material = wm;
  return {
    frame(t: number) { wm.setFloat('uTime', t); wm.setVector3('uCam', cam.position); wm.setVector3('uSun', sun.direction); wm.setColor3('uFog', scene.fogColor); wm.setFloat('uFogD', scene.fogDensity); },
  };
}
