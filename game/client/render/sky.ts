// Небо-купол: градиент от голубой дымки у горизонта к насыщенной синеве, с мягкими облаками.
import { MeshBuilder, ShaderMaterial, Effect, Mesh, type Scene } from '@babylonjs/core';

Effect.ShadersStore.skyVertexShader = `precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 vP;
  void main() { vP = position; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
Effect.ShadersStore.skyFragmentShader = `precision highp float; varying vec3 vP; uniform float uTime;
  void main() {
    vec3 d = normalize(vP); float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(vec3(0.72, 0.82, 0.92), vec3(0.3, 0.55, 0.9), pow(h, 0.6));
    vec2 uv = d.xz / max(d.y, 0.08) * 0.6 + uTime * 0.004;
    float c = sin(uv.x * 3.1) * cos(uv.y * 2.7) + sin(uv.x * 7.3 + uv.y * 5.1) * 0.5 + sin(uv.y * 11.0 - uv.x * 3.0) * 0.25;
    col = mix(col, vec3(1.0), smoothstep(0.55, 1.2, c) * 0.55 * smoothstep(0.02, 0.25, h));
    gl_FragColor = vec4(col, 1.0);
  }`;

export function useSky(scene: Scene) {
  const sky = MeshBuilder.CreateSphere('sky', { diameter: 900, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  const m = new ShaderMaterial('sky', scene, { vertex: 'sky', fragment: 'sky' }, { attributes: ['position'], uniforms: ['worldViewProjection', 'uTime'] });
  m.backFaceCulling = false;
  sky.material = m; sky.infiniteDistance = true; sky.isPickable = false; sky.applyFog = false;
  return { frame(t: number) { m.setFloat('uTime', t); } };
}
