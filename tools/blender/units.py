# Юниты первой эпохи: житель, дубинщик, охотник, корова. Модель — жёсткие части на шарнирах (таз → торс → голова/руки, таз → ноги),
# анимации — дорожки NLA по именам (idle, walk, attack, work, die, shoot): в glTF каждая становится отдельной анимацией.
# Перед −Y (в игре +Z). Цвет игрока — материал «Team». Файлы: assets/models/units/<юнит>.glb
import math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from lib import Mesh, T, export, clear

OUT = os.path.join(os.path.dirname(__file__), '../../assets/models/units')
R = math.radians

def part(name, m, parent=None, loc=(0, 0, 0)):
    ob = m.obj(name, lo=0.75, hi=1.0, face_jitter=0.04) if m else bpy.data.objects.new(name, None)
    if not m: bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent; ob.location = loc; ob.rotation_mode = 'XYZ'
    return ob

class Anim:
    """Анимации: для каждой — кадры поворотов частей; все части ключуются в каждой анимации (иначе поза прошлой «прилипнет»)"""
    def __init__(self, parts): self.parts = parts; self.rest = {p.name: (tuple(p.location), tuple(p.rotation_euler)) for p in parts}
    def make(self, name, frames, keys):
        """keys: {кадр: {часть: (rx, ry, rz[, dx, dy, dz])}} — градусы и сдвиг от покоя"""
        for p in self.parts:
            p.animation_data_create()
            act = bpy.data.actions.new(f'{name}_{p.name}')
            p.animation_data.action = act
            for f in sorted(keys):
                loc0, _ = self.rest[p.name]
                v = keys[f].get(p.name, (0, 0, 0))
                p.rotation_euler = (R(v[0]), R(v[1]), R(v[2]))
                d = v[3:] if len(v) > 3 else (0, 0, 0)
                p.location = (loc0[0] + d[0], loc0[1] + d[1], loc0[2] + d[2])
                p.keyframe_insert('rotation_euler', frame=f); p.keyframe_insert('location', frame=f)
            tr = p.animation_data.nla_tracks.new(); tr.name = name
            tr.strips.new(name, 0, act)
            p.animation_data.action = None
        for p in self.parts: # вернуть в покой
            p.location, p.rotation_euler = self.rest[p.name][0], self.rest[p.name][1]

# ---------- человечек ----------
def human(kind):
    team = 'Team'
    skin = 'skin' if kind != 'clubman' else 'skin_dark'
    root = part('root', None)
    # таз и набедренная повязка
    m = Mesh(1)
    m.box((0.32, 0.2, 0.2), 'hide' if kind != 'villager' else 'cloth', T((0, 0, -0.16)), taper=1.1)
    m.box((0.34, 0.22, 0.05), 'rope', T((0, 0, -0.02)))
    m.box((0.14, 0.03, 0.2), team if kind == 'villager' else 'hide_dark', T((0, -0.1, -0.3)), taper=0.8) # передник
    pelvis = part('pelvis', m, root, (0, 0, 0.86))
    # торс
    m = Mesh(2)
    if kind == 'villager':
        m.box((0.34, 0.22, 0.46), team, taper=1.18)                    # рубаха цвета игрока
        m.box((0.36, 0.24, 0.06), 'rope', T((0, 0, 0.02)))
        m.box((0.2, 0.08, 0.3), 'straw', T((0, 0.14, 0.12)), taper=1.2)  # заплечная корзина
    else:
        m.box((0.34, 0.22, 0.46), skin, taper=1.2)                      # голый торс
        m.box((0.4, 0.26, 0.2), 'fur' if kind == 'clubman' else 'hide', T((0, 0, 0.3)), taper=0.85, jitter=0.015) # меховая накидка на плечах
        m.stick((-0.17, -0.12, 0.44), (0.15, -0.12, 0.02), 0.04, team, seg=5) # перевязь цвета игрока
        if kind == 'clubman':
            for i in range(5): m.cyl(0.018, 0.005, 0.06, 'bone', T((-0.1 + i * 0.05, -0.13, 0.38 - abs(i - 2) * 0.03), (90, 0, 0)), seg=4) # ожерелье из клыков
    torso = part('torso', m, pelvis, (0, 0, 0.0))
    # голова
    m = Mesh(3)
    m.cyl(0.055, 0.055, 0.08, skin, seg=6)
    m.ball(0.15, skin, T((0, 0, 0.18)), sub=2, squash=1.1)
    m.box((0.05, 0.05, 0.06), skin, T((0, -0.14, 0.14)))              # нос
    for sx in (-1, 1): m.box((0.035, 0.02, 0.03), 'hair', T((sx * 0.055, -0.135, 0.19)))  # глаза
    if kind == 'villager':
        m.ball(0.155, 'hair', T((0, 0.02, 0.22)), sub=2, squash=0.8)    # волосы
        m.box((0.3, 0.1, 0.08), 'hair', T((0, 0.1, 0.1)), taper=0.7)    # хвост/коса
    elif kind == 'clubman':
        m.ball(0.16, 'hair', T((0, 0.03, 0.23)), sub=1, squash=0.85, jitter=0.02)
        m.box((0.18, 0.08, 0.14), 'hair', T((0, -0.1, 0.02)), taper=0.6, jitter=0.01)  # борода
        for sx in (-1, 1): m.stick((sx * 0.1, 0, 0.3), (sx * 0.2, 0.02, 0.45), 0.025, 'bone', seg=4, r2=0.006) # рога-украшения
    else: # охотник: меховая шапка с хвостом
        m.cyl(0.165, 0.12, 0.14, 'fur', T((0, 0.01, 0.22)), seg=8, jitter=0.01)
        m.stick((0, 0.12, 0.3), (0.02, 0.3, 0.05), 0.04, 'fur_light', seg=5, r2=0.02)
        m.box((0.24, 0.02, 0.03), team, T((0, -0.15, 0.24)))           # повязка цвета игрока
    head = part('head', m, torso, (0, 0, 0.5))
    arms, legs = [], []
    for s, nm in ((1, 'armL'), (-1, 'armR')):
        m = Mesh(4)
        m.box((0.13, 0.13, 0.12), 'fur' if kind == 'clubman' else (team if kind == 'villager' else 'hide'), T((0, 0, -0.1)))
        m.stick((0, 0, 0), (0, 0, -0.3), 0.06, skin, seg=6, r2=0.052)
        m.stick((0, 0, -0.28), (0, -0.02, -0.52), 0.052, skin, seg=6, r2=0.045)
        m.box((0.12, 0.12, 0.07), 'hide_dark', T((0, -0.01, -0.44)))    # наруч
        m.ball(0.058, skin, T((0, -0.02, -0.56)))
        arms.append(part(nm, m, torso, (s * 0.23, 0, 0.44)))
    armR = arms[1]
    for s, nm in ((1, 'legL'), (-1, 'legR')):
        m = Mesh(5)
        m.stick((0, 0, 0), (0, 0, -0.44), 0.075, skin, seg=6, r2=0.06)
        m.stick((0, 0, -0.42), (0, 0, -0.8), 0.06, 'hide' if kind != 'clubman' else skin, seg=6, r2=0.055)
        m.box((0.13, 0.12, 0.1), 'hide', T((0, 0, -0.44)))              # обмотка колена
        m.box((0.11, 0.2, 0.07), 'hide_dark', T((0, -0.05, -0.86)))     # стопа
        legs.append(part(nm, m, pelvis, (s * 0.1, 0, -0.04)))
    # оружие/инструмент в правой руке (кисть — на -0.56 по Z от плеча)
    m = Mesh(6)
    if kind == 'villager': # каменный топор
        m.stick((0, 0.08, -0.56), (0, -0.28, -0.52), 0.02, 'wood_light', seg=5)
        m.box((0.05, 0.1, 0.12), 'stone', T((0, -0.26, -0.58)), jitter=0.01)
        m.box((0.06, 0.03, 0.04), 'rope', T((0, -0.24, -0.53)))
    elif kind == 'clubman': # дубина
        m.stick((0, 0.1, -0.56), (0, -0.45, -0.45), 0.025, 'wood', seg=6, r2=0.07, jitter=0.008)
        for i in range(3): m.cyl(0.012, 0.004, 0.05, 'bone', T((0, -0.35 - i * 0.04, -0.44 + (i % 2) * 0.04), (90 if i % 2 else -90, 0, 0)), seg=4)
    else: # копьё
        m.stick((0, 0.45, -0.58), (0, -0.75, -0.52), 0.018, 'wood_light', seg=5)
        m.cyl(0.035, 0.0, 0.14, 'stone_dark', T((0, -0.75, -0.52), (90, 0, 0)), seg=4)
        m.box((0.05, 0.04, 0.05), 'rope', T((0, -0.72, -0.545)))
    tool = part('tool', m, armR, (0, 0, 0))
    parts = [root, pelvis, torso, head, *arms, *legs, tool]
    A = Anim(parts)
    # покой: чуть согнутые руки
    base = {'armL': (-5, 0, 6), 'armR': (-20, 0, -6)}
    def pose(extra): d = dict(base); d.update(extra); return d
    A.make('idle', 48, {0: pose({}), 24: pose({'torso': (2, 0, 0), 'head': (0, 0, 8), 'armL': (-8, 0, 8)}), 48: pose({})})
    A.make('walk', 24, {f: pose({'legL': (-28 * c, 0, 0), 'legR': (28 * c, 0, 0), 'armL': (26 * c, 0, 6), 'armR': (-20 - 18 * c, 0, -6),
                                  'pelvis': (0, 0, 4 * c, 0, 0, 0.03 * abs(c)), 'torso': (4, 0, -4 * c)})
                         for f, c in ((0, 1), (6, 0), (12, -1), (18, 0), (24, 1))})
    A.make('attack', 24, {0: pose({}), 8: pose({'armR': (-160, 0, -10), 'torso': (-8, 0, 15), 'armL': (-30, 0, 20)}),
                          13: pose({'armR': (-40, 0, 0), 'torso': (18, 0, -10), 'armL': (10, 0, 6), 'legL': (-15, 0, 0)}), 24: pose({})})
    A.make('work', 24, {0: pose({'armR': (-150, 0, -5), 'armL': (-130, 0, 5), 'torso': (-5, 0, 0)}),
                        10: pose({'armR': (-60, 0, 0), 'armL': (-55, 0, 0), 'torso': (28, 0, 0), 'head': (-10, 0, 0)}),
                        24: pose({'armR': (-150, 0, -5), 'armL': (-130, 0, 5), 'torso': (-5, 0, 0)})})
    if kind == 'hunter':
        A.make('shoot', 24, {0: pose({}), 9: pose({'armR': (-170, 0, -20), 'torso': (-6, 0, 25), 'armL': (-80, 0, 10)}),
                             14: pose({'armR': (-70, 0, 0), 'torso': (12, 0, -15), 'armL': (-20, 0, 0)}), 24: pose({})})
    A.make('die', 30, {0: pose({}), 8: pose({'torso': (-15, 0, 0), 'armL': (-60, 0, 30), 'armR': (-60, 0, -30)}),
                       22: pose({'root': (84, 0, 0, 0, 0.1, 0.12), 'armL': (-120, 0, 40), 'armR': (-110, 0, -40), 'legL': (-20, 0, 0), 'head': (-20, 0, 15)}),
                       30: pose({'root': (90, 0, 0, 0, 0.12, 0.1), 'armL': (-130, 0, 50), 'armR': (-120, 0, -45), 'legL': (-15, 0, 0), 'head': (-15, 0, 20)})})
    return root

# ---------- корова ----------
def cow():
    root = part('root', None)
    m = Mesh(10)
    m.box((0.44, 0.92, 0.42), 'cow', T((0, 0, -0.2)), jitter=0.012, taper=0.95)
    m.box((0.45, 0.3, 0.3), 'cow_light', T((0.01, 0.1, -0.12)), jitter=0.01) # пятна
    m.box((0.3, 0.32, 0.2), 'cow_light', T((-0.08, -0.25, -0.02)), jitter=0.01)
    m.box((0.26, 0.3, 0.1), 'cow_light', T((0, 0.15, -0.26)))                  # вымя-брюхо
    m.stick((0, 0.46, 0.18), (0, 0.55, -0.2), 0.022, 'cow', seg=4)             # хвост
    m.ball(0.04, 'hair', T((0, 0.56, -0.24)))
    body = part('body', m, root, (0, 0, 0.8))
    m = Mesh(11)
    m.box((0.24, 0.34, 0.26), 'cow', T((0, -0.12, -0.12)), taper=0.9)
    m.box((0.2, 0.12, 0.16), 'cow_light', T((0, -0.3, -0.14)))               # морда
    for sx in (-1, 1):
        m.stick((sx * 0.1, -0.04, 0.12), (sx * 0.22, -0.02, 0.2), 0.03, 'horn', seg=5, r2=0.01)
        m.box((0.12, 0.04, 0.06), 'cow', T((sx * 0.16, 0.0, 0.03), (0, sx * 20, 0)))
        m.box((0.03, 0.02, 0.03), 'hair', T((sx * 0.08, -0.24, 0.05)))
    m.box((0.28, 0.1, 0.05), 'Team', T((0, 0.04, -0.2)))                    # ошейник цвета игрока
    m.box((0.06, 0.06, 0.07), 'gold', T((0, -0.03, -0.26)))                  # колокольчик
    head = part('head', m, body, (0, -0.44, 0.1))
    legs = []
    for nm, x, y in (('legFL', 0.14, -0.32), ('legFR', -0.14, -0.32), ('legBL', 0.14, 0.32), ('legBR', -0.14, 0.32)):
        m = Mesh(12)
        m.stick((0, 0, 0), (0, 0, -0.5), 0.06, 'cow', seg=6, r2=0.045)
        m.box((0.1, 0.11, 0.08), 'hoof', T((0, -0.01, -0.58)))
        legs.append(part(nm, m, body, (x, y, -0.22)))
    A = Anim([root, body, head, *legs])
    A.make('idle', 48, {0: {}, 20: {'head': (8, 0, 12)}, 34: {'head': (4, 0, -6)}, 48: {}})
    A.make('walk', 24, {f: {'legFL': (-24 * c, 0, 0), 'legBR': (-24 * c, 0, 0), 'legFR': (24 * c, 0, 0), 'legBL': (24 * c, 0, 0),
                            'body': (0, 3 * c, 0, 0, 0, 0.015 * abs(c)), 'head': (4 * c, 0, 0)} for f, c in ((0, 1), (6, 0), (12, -1), (18, 0), (24, 1))})
    A.make('work', 36, {0: {}, 10: {'head': (55, 0, 0)}, 18: {'head': (60, 0, 8)}, 26: {'head': (55, 0, -6)}, 36: {}}) # щиплет траву
    A.make('attack', 24, {0: {}, 8: {'head': (-25, 0, 0), 'body': (-6, 0, 0, 0, 0.05, 0)}, 13: {'head': (35, 0, 0), 'body': (4, 0, 0, 0, -0.1, 0)}, 24: {}})
    A.make('die', 30, {0: {}, 10: {'legFL': (-40, 0, 0), 'legFR': (-40, 0, 0), 'body': (10, 0, 0, 0, 0, -0.2)},
                       30: {'root': (0, 88, 0, 0.1, 0, 0.32), 'legFL': (-20, 0, 0), 'legBR': (15, 0, 0), 'head': (20, 0, 20)}})
    return root

if __name__ == '__main__':
    only = sys.argv[1:]
    for k, f in (('villager', lambda: human('villager')), ('clubman', lambda: human('clubman')), ('hunter', lambda: human('hunter')), ('cow', cow)):
        if only and k not in only: continue
        root = f()
        bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, 48
        export([root], os.path.join(OUT, k + '.glb'), anims=True)
        clear()
