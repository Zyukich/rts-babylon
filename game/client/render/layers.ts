// Слой тонких инстансов: один draw call на весь тип объектов. Каждый кадр: begin() → add(...) × N → end().
import { MeshBuilder, StandardMaterial, Color3, FresnelParameters, type Mesh, type Scene } from '@babylonjs/core';

export interface Layer {
  mesh: Mesh;
  begin(): void;
  /** yaw — поворот вокруг вертикали; col — цвет инстанса (если слой perColor) */
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, col?: number[], yaw?: number): void;
  end(): void;
}

export function useLayers(scene: Scene) {
  const mat = (c: Color3, alpha = 1) => {
    const m = new StandardMaterial('', scene);
    m.diffuseColor = c; m.specularColor = Color3.Black(); m.alpha = alpha;
    return m;
  };
  function layer(mesh: Mesh, color: Color3 | null, perColor = false): Layer {
    if (color) { // null — оставить родной материал модели
      const m = mat(color);
      const fp = new FresnelParameters(); fp.leftColor = new Color3(0.28, 0.25, 0.2); fp.rightColor = Color3.Black(); fp.bias = 0.15; fp.power = 2.4;
      m.emissiveFresnelParameters = fp; // светлый ободок силуэта
      mesh.material = m;
    }
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isVisible = false; // пока нет инстансов — не рисовать исходник в углу карты
    let cap = 0, n = 0, last = -1, m = new Float32Array(0), c = new Float32Array(0);
    return {
      mesh,
      begin() { n = 0; },
      add(x, y, z, sx, sy, sz, col, yaw = 0) {
        if (n >= cap) {
          cap = Math.max(64, cap * 2);
          const m2 = new Float32Array(cap * 16); m2.set(m); m = m2;
          const c2 = new Float32Array(cap * 4); c2.set(c); c = c2;
          last = -1;
        }
        const o = n * 16, cs = Math.cos(yaw), sn = Math.sin(yaw);
        m[o] = cs * sx; m[o + 1] = 0; m[o + 2] = -sn * sx; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = sn * sz; m[o + 9] = 0; m[o + 10] = cs * sz; m[o + 11] = 0;
        m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
        if (perColor) c.set(col ?? [1, 1, 1, 1], n * 4);
        n++;
      },
      end() {
        mesh.isVisible = n > 0;
        if (!n) return;
        if (n !== last) {
          mesh.thinInstanceSetBuffer('matrix', m.subarray(0, n * 16), 16, false);
          if (perColor) mesh.thinInstanceSetBuffer('color', c.subarray(0, n * 4), 4, false);
          last = n;
        } else {
          mesh.thinInstanceBufferUpdated('matrix');
          if (perColor) mesh.thinInstanceBufferUpdated('color');
        }
        mesh.thinInstanceRefreshBoundingInfo(false); // чтобы тени и отсечение знали реальные границы
      },
    };
  }
  const box = (n: string) => MeshBuilder.CreateBox(n, { size: 1 }, scene);
  return { mat, layer, box };
}
