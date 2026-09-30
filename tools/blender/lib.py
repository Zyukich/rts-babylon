# Общая библиотека стиля ЭПОХ для Blender: палитра, материалы, заготовки и экспорт в glTF.
# Стиль — тёплый стилизованный low-poly в духе Age of Empires III / War Selection: гранёные формы, земляные тона,
# «рисованная» светотень в цвете вершин (низ темнее, лёгкий разброс по граням), цвет игрока — материал «Team».
# Оси Blender: Z — вверх, лицо модели смотрит в −Y (после экспорта в glTF это +Z — так ждёт игра).
import bpy, bmesh, math, random
from mathutils import Matrix, Vector, Euler

# ---------- Палитра (sRGB 0..1) ----------
PAL = {
    'wood': (0.47, 0.32, 0.19), 'wood_dark': (0.29, 0.19, 0.11), 'wood_light': (0.62, 0.46, 0.29), 'bark': (0.33, 0.24, 0.16),
    'thatch': (0.79, 0.63, 0.34), 'thatch_dark': (0.58, 0.44, 0.22), 'straw': (0.88, 0.75, 0.42),
    'hide': (0.66, 0.52, 0.36), 'hide_dark': (0.45, 0.33, 0.22), 'fur': (0.48, 0.36, 0.25), 'fur_light': (0.7, 0.6, 0.47),
    'stone': (0.56, 0.54, 0.5), 'stone_dark': (0.38, 0.37, 0.35), 'stone_light': (0.72, 0.7, 0.65),
    'mud': (0.45, 0.35, 0.24), 'soil': (0.36, 0.25, 0.15), 'clay': (0.66, 0.44, 0.3),
    'skin': (0.84, 0.62, 0.46), 'skin_dark': (0.62, 0.43, 0.3), 'hair': (0.24, 0.16, 0.1), 'bone': (0.9, 0.86, 0.76),
    'rope': (0.72, 0.6, 0.4), 'cloth': (0.78, 0.7, 0.55), 'iron': (0.4, 0.4, 0.42), 'gold': (0.95, 0.76, 0.28),
    'leaf': (0.26, 0.47, 0.16), 'leaf_dark': (0.13, 0.3, 0.1), 'leaf_light': (0.5, 0.68, 0.24), 'pine': (0.13, 0.33, 0.18), 'pine_light': (0.3, 0.5, 0.25),
    'autumn_y': (0.88, 0.68, 0.18), 'autumn_o': (0.86, 0.42, 0.14), 'birch': (0.9, 0.88, 0.82), 'berry': (0.78, 0.1, 0.18),
    'ember': (1.0, 0.45, 0.1), 'wheat': (0.9, 0.74, 0.32), 'wheat_dark': (0.66, 0.5, 0.2), 'grass': (0.36, 0.55, 0.2), 'fire': (1.0, 0.55, 0.15),
    'team': (1.0, 1.0, 1.0), 'cow': (0.52, 0.35, 0.24), 'cow_light': (0.9, 0.86, 0.78), 'horn': (0.86, 0.8, 0.66), 'hoof': (0.18, 0.14, 0.1),
    'ore': (0.52, 0.3, 0.22), 'ore_vein': (0.74, 0.38, 0.22), 'stone_ore': (0.5, 0.46, 0.43),
    'leaf_mid': (0.33, 0.55, 0.2), 'autumn_y2': (0.95, 0.8, 0.3), 'autumn_o2': (0.78, 0.3, 0.1), 'autumn_r': (0.7, 0.22, 0.12),
}

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(1)

_mats = {}
def mat(name, color=None, rough=0.85, metal=0.0, emit=0.0):
    """Материал по имени (кэш). color — из палитры по имени или кортеж. Имя 'Team' — часть в цвет игрока"""
    key = name
    if key in _mats and _mats[key].name in bpy.data.materials: return _mats[key]
    c = PAL.get(color or name, color) if isinstance(color or name, str) else color
    if c is None: c = PAL.get(name, (0.8, 0.8, 0.8))
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb_to_lin(c), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*srgb_to_lin(c), 1); b.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = (*srgb_to_lin(c), 1)
    _mats[key] = m
    return m

def srgb_to_lin(c):
    f = lambda x: x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    return tuple(f(x) for x in c[:3])

def T(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Матрица трансформации: положение, поворот (градусы XYZ), масштаб"""
    s = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    return Matrix.Translation(loc) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() @ Matrix.Diagonal((*s, 1))

class Mesh:
    """Собираем модель из заготовок в один bmesh; у каждой грани — свой материал"""
    def __init__(self, seed=0):
        self.bm = bmesh.new(); self.mats = []; self.rnd = random.Random(seed)
    def _mat(self, m):
        if isinstance(m, str): m = mat(m)
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)
    def _take(self, before, m, jitter=0.0):
        new = [f for f in self.bm.faces if f not in before]
        mi = self._mat(m)
        for f in new: f.material_index = mi
        if jitter:
            vs = {v for f in new for v in f.verts}
            for v in vs: v.co += Vector((self.rnd.uniform(-jitter, jitter) for _ in range(3)))
        return new
    def _op(self, fn, m, M, jitter=0.0):
        before = set(self.bm.faces)
        res = fn()
        verts = res['verts'] if isinstance(res, dict) and 'verts' in res else [v for f in self.bm.faces if f not in before for v in f.verts]
        bmesh.ops.transform(self.bm, matrix=M, verts=list(set(verts)))
        return self._take(before, m, jitter)

    def box(self, size, m, M=Matrix(), jitter=0.0, taper=None):
        """Брусок size=(x,y,z), основание на z=0. taper — сужение верха (0..1)"""
        sx, sy, sz = size
        def fn():
            r = bmesh.ops.create_cube(self.bm, size=1.0)
            for v in r['verts']:
                v.co.z += 0.5
                if taper and v.co.z > 0.5: v.co.x *= taper; v.co.y *= taper
                v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
            return r
        return self._op(fn, m, M, jitter)
    def cyl(self, r1, r2, h, m, M=Matrix(), seg=8, jitter=0.0, cap=True):
        """Цилиндр/конус вдоль Z, основание на z=0"""
        def fn():
            r = bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
            for v in r['verts']: v.co.z += h / 2
            return r
        return self._op(fn, m, M, jitter)
    def ball(self, r, m, M=Matrix(), sub=1, jitter=0.0, squash=1.0):
        def fn():
            res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r)
            for v in res['verts']: v.co.z *= squash
            return res
        return self._op(fn, m, M, jitter)
    def rock(self, r, m, M=Matrix(), flat=0.7, rough=0.28, sub=1):
        """Гранёный камень: икосфера с выдавленными вершинами, приплюснутая, дно срезано"""
        def fn():
            res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r)
            for v in res['verts']:
                k = 1 + self.rnd.uniform(-rough, rough)
                v.co *= k; v.co.z = max(v.co.z * flat, -r * 0.15)
                v.co.z += r * 0.15
            return res
        return self._op(fn, m, M)
    def log(self, r, length, m, M=Matrix(), seg=7, end_mat=None):
        """Бревно вдоль X с торцами другого цвета"""
        f = self.cyl(r, r * 0.92, length, m, T((0, 0, 0), (0, 90, 0)) , seg=seg, jitter=r * 0.06)
        # сдвинуть к центру: цилиндр строится от 0 до length по оси X после поворота
        vs = {v for face in f for v in face.verts}
        for v in vs: v.co.x -= length / 2
        bmesh.ops.transform(self.bm, matrix=M, verts=list(vs))
        if end_mat:
            mi = self._mat(end_mat)
            for face in f:
                if abs(face.normal.x) > 0.9 and len(face.verts) > 4: face.material_index = mi
        return f
    def poly(self, pts, m, M=Matrix()):
        """Произвольный многоугольник по точкам"""
        def fn():
            vs = [self.bm.verts.new(p) for p in pts]
            self.bm.faces.new(vs)
            return {'verts': vs}
        return self._op(fn, m, M)

    def stick(self, a, b, r, m, seg=5, r2=None, jitter=0.0):
        """Жердь/бревно от точки a до точки b"""
        a, b = Vector(a), Vector(b); d = b - a
        M = Matrix.Translation(a) @ d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
        return self.cyl(r, r if r2 is None else r2, d.length, m, M, seg=seg, jitter=jitter)
    def prism(self, prof, length, m, M=Matrix()):
        """Призма вдоль X по профилю [(y, z), …] — двускатные крыши, навесы"""
        def fn():
            L = length / 2
            A = [self.bm.verts.new((-L, y, z)) for y, z in prof]; B = [self.bm.verts.new((L, y, z)) for y, z in prof]
            self.bm.faces.new(A[::-1]); self.bm.faces.new(B)
            for i in range(len(prof)):
                j = (i + 1) % len(prof); self.bm.faces.new((A[i], A[j], B[j], B[i]))
            return {'verts': A + B}
        return self._op(fn, m, M)

    def obj(self, name, shade=True, colors='shade', lo=0.68, hi=1.0, h0=0.0, h1=None, face_jitter=0.07):
        """Готовый объект. colors: 'shade' — только светотень (цвет даёт материал), 'full' — цвет материала × светотень в вершинах
        (для природы: в игре её красит шейдер ветра по цвету вершин), None — без цвета вершин"""
        me = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=list(self.bm.faces))
        self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(m)
        for p in me.polygons: p.use_smooth = not shade
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if colors: paint(ob, colors, lo, hi, h0, h1, face_jitter, self.rnd)
        return ob

def paint(ob, mode, lo, hi, h0, h1, jit, rnd):
    """Светотень в цвете вершин: снизу темнее (как затенение у земли), каждая грань чуть своего оттенка — «рисованный» вид"""
    me = ob.data
    zs = [v.co.z for v in me.vertices]
    top = h1 if h1 is not None else (max(zs) if zs else 1)
    attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for p in me.polygons:
        base = (1, 1, 1)
        if mode == 'full' and me.materials:
            c = me.materials[p.material_index].diffuse_color
            base = tuple(lin_to_srgb(x) for x in c[:3])
        j = 1 + rnd.uniform(-jit, jit)
        for li in p.loop_indices:
            z = me.vertices[me.loops[li].vertex_index].co.z
            t = min(1, max(0, (z - h0) / max(1e-4, top - h0)))
            k = (lo + (hi - lo) * t) * j
            attr.data[li].color = (*[min(1, x * k) for x in base], 1)
    me.color_attributes.active_color = attr

def lin_to_srgb(x):
    return x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055

def export(objs, path, anims=False, colors=True):
    import os
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive: c.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_texcoords=False, export_normals=True, export_materials='EXPORT', export_extras=False,
              export_animations=anims, export_vertex_color='ACTIVE' if colors else 'NONE')
    if anims: kw.update(export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1, export_def_bones=True, export_optimize_animation_size=False)
    bpy.ops.export_scene.gltf(**kw)
    print('  →', path)

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for a in list(bpy.data.armatures): bpy.data.armatures.remove(a)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)

# ---------- Превью: лист моделей (Cycles на CPU) ----------
def contact_sheet(files, out, cols=6, cell=2.2, res=(1400, 800), elev=35, labels=None):
    """Импортировать .glb и разложить сеткой; рендер для проверки глазами"""
    reset()
    objs = []
    for i, group in enumerate(files): # элемент — файл или список файлов в одной ячейке (ствол + крона)
        x, y = (i % cols) * cell, -(i // cols) * cell
        for f in ([group] if isinstance(group, str) else group):
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=f)
            new = [o for o in bpy.data.objects if o not in before and o.parent is None]
            for o in new: o.location = (x + o.location.x, y + o.location.y, o.location.z)
            objs += new
    rows = (len(files) + cols - 1) // cols
    cx, cy = (cols - 1) * cell / 2, -(rows - 1) * cell / 2
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(cols, rows * res[0] / res[1]) * cell * 1.05
    d = 30; a = math.radians(elev)
    cam.location = (cx + d * math.cos(a) * 0.5, cy - d * math.cos(a) * 0.87, d * math.sin(a))
    look = Vector((cx, cy, 0.5)) - cam.location; cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); bpy.context.scene.collection.objects.link(sun)
    sun.data.energy = 3.2; sun.rotation_euler = (math.radians(50), 0, math.radians(35)); sun.data.color = (1, 0.95, 0.85)
    w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.72, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    g = bpy.data.objects.new('ground', bpy.data.meshes.new('ground')); bpy.context.scene.collection.objects.link(g)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=200); bm.to_mesh(g.data); bm.free()
    g.data.materials.append(mat('_ground', (0.42, 0.55, 0.3)))
    s = bpy.context.scene; s.render.engine = 'CYCLES'; s.cycles.samples = 24; s.cycles.device = 'CPU'; s.cycles.use_denoising = False
    s.render.resolution_x, s.render.resolution_y = res; s.render.filepath = out
    s.view_settings.view_transform = 'Standard'
    bpy.ops.render.render(write_still=True)
    print('превью →', out)
