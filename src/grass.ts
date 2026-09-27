// Стилизованная трава из настоящих травинок: ветер, вытаптывание юнитами, просвет против солнца, проплешины земли, цветы.
// Идеи техники — Christian Ortiz (Cortiz), github.com/cortiz2894/stylized-components (MIT). Здесь своя реализация на Babylon.
import { Mesh, VertexData, ShaderMaterial, Effect, type Scene } from '@babylonjs/core';

Effect.ShadersStore.bladeVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 bladeData;
#include<instancesDeclaration>
uniform mat4 viewProjection;
uniform float uTime;
uniform vec4 uStomp[24];
varying float vT;
varying vec2 vData;
varying vec3 vWorld;
void main() {
  #include<instancesVertex>
  vec4 wp = finalWorld * vec4(position, 1.0);
  float t = uv.y;
  // ветер: порывы волнами по миру, гнётся верх травинки
  float ph = wp.x * 0.35 + wp.z * 0.27;
  float gust = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 2.3) * 0.25 + 0.35;
  vec2 bend = vec2(0.9, 0.5) * gust * 0.05 * t * t;
  // вытаптывание: травинки под юнитами прижимаются и расходятся в стороны
  for (int i = 0; i < 24; i++) {
    vec4 s = uStomp[i];
    if (s.w <= 0.0) continue;
    vec2 d = wp.xz - s.xz;
    float dist = length(d);
    float k = 1.0 - smoothstep(s.w * 0.5, s.w, dist);
    bend += d / max(dist, 0.001) * k * 0.08 * t;
    wp.y -= k * t * 0.07;
  }
  wp.xz += bend;
  vT = t; vData = bladeData.xy; vWorld = wp.xyz;
  gl_Position = viewProjection * wp;
}`;

Effect.ShadersStore.bladeFragmentShader = `
precision highp float;
varying float vT;
varying vec2 vData;
varying vec3 vWorld;
uniform vec3 uBase, uTip, uDry, uSunDir, uCam, uFog;
uniform float uFogD;
void main() {
  // оттенок: пятна посуше и позеленее по миру + разброс по травинкам
  float n = sin(vWorld.x * 0.23 + 1.7) * cos(vWorld.z * 0.19) * 0.5 + 0.5;
  vec3 tip = mix(uTip, uDry, n * 0.55);
  vec3 col = mix(uBase, tip, vT) * (0.85 + vData.x * 0.3);
  if (vData.y > 0.5 && vT > 0.8) { // цветок на верхушке
    col = vData.x < 0.33 ? vec3(0.97, 0.95, 0.9) : vData.x < 0.66 ? vec3(0.98, 0.84, 0.25) : vec3(0.75, 0.55, 0.95);
  }
  vec3 L = normalize(-uSunDir), V = normalize(uCam - vWorld);
  float ao = mix(0.5, 1.0, vT);                                        // у земли темнее
  float trans = pow(max(dot(-V, L), 0.0), 4.0) * vT * 0.55;            // просвет кончиков против солнца
  col = col * ao * (0.8 + 0.35 * max(L.y, 0.0)) + tip * trans;
  float f = exp(-pow(length(uCam - vWorld) * uFogD, 2.0));             // дымка, как у сцены
  gl_FragColor = vec4(mix(uFog, col, f), 1.0);
}`;

// Кусок травы на одну клетку: 200 травинок по 3 сегмента, изогнутые, разной высоты; ~3% с цветком
export function makeGrass(scene: Scene, blades = 200) {
  let seed = 777;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pos: number[] = [], uv: number[] = [], bd: number[] = [], idx: number[] = [];
  for (let b = 0; b < blades; b++) { // густота — из настроек графики
    const x = rnd() - 0.5, z = rnd() - 0.5, fl = rnd() < 0.025 ? 1 : 0, h = (0.14 + rnd() * 0.16) * (fl ? 1.2 : 1);
    const wd = 0.02 + rnd() * 0.014, yaw = rnd() * Math.PI, lean = (rnd() - 0.5) * 0.6, r = rnd();
    const c = Math.cos(yaw), s = Math.sin(yaw), base = pos.length / 3;
    for (const t of [0, 0.35, 0.7, 1]) {
      const off = lean * t * t * h, px = x + s * off, pz = z + c * off, y = t * h, hw = (wd * (1 - t)) / 2;
      if (t < 1) { pos.push(px - c * hw, y, pz + s * hw, px + c * hw, y, pz - s * hw); uv.push(0, t, 1, t); bd.push(r, fl, 0, 0, r, fl, 0, 0); }
      else { pos.push(px, y, pz); uv.push(0.5, 1); bd.push(r, fl, 0, 0); }
    }
    for (let k = 0; k < 2; k++) { const a = base + k * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    idx.push(base + 4, base + 5, base + 6);
  }
  const mesh = new Mesh('blades', scene), vd = new VertexData();
  vd.positions = pos; vd.uvs = uv; vd.indices = idx;
  vd.applyToMesh(mesh);
  mesh.setVerticesData('bladeData', bd, false, 4);
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isVisible = false;
  const mat = new ShaderMaterial('blades', scene, { vertex: 'blade', fragment: 'blade' }, {
    attributes: ['position', 'uv', 'bladeData'],
    uniforms: ['world', 'viewProjection', 'uTime', 'uStomp', 'uBase', 'uTip', 'uDry', 'uSunDir', 'uCam', 'uFog', 'uFogD'],
  });
  mat.backFaceCulling = false;
  mesh.material = mat;
  return { mesh, mat };
}
