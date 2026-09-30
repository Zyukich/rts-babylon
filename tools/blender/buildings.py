# Здания первой (первобытной) эпохи: у каждого 3 стадии стройки — 0 разметка и материалы, 1 каркас, 2 готово.
# Файлы: assets/models/primitive/<здание>[_<вариант>]_s<стадия>.glb. Перед −Y — фасад (в игре это +Z).
# Размеры в метрах ≈ клетках: игра сама подгоняет модель под площадь здания (готовая стадия задаёт масштаб).
import math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import Mesh, T, export, clear

OUT = os.path.join(os.path.dirname(__file__), '../../assets/models/primitive')
FILES = []

def save(key, stage, m):
    ob = m.obj(f'{key}_s{stage}', lo=0.6, hi=1.0, face_jitter=0.06)
    path = os.path.join(OUT, f'{key}_s{stage}.glb')
    export([ob], path); clear(); FILES.append(path)

def ring(n, r, a0=0):
    return [(r * math.cos(a0 + i * 2 * math.pi / n), r * math.sin(a0 + i * 2 * math.pi / n)) for i in range(n)]

# ---------- общие куски ----------
def plot(m, w, d, mat='soil'): # вытоптанная земля под стройкой
    m.box((w, d, 0.04), mat, jitter=0.01)

def stakes(m, w, d, h=0.35): # колышки разметки по углам
    for x in (-w / 2, w / 2):
        for y in (-d / 2, d / 2):
            m.cyl(0.035, 0.02, h, 'wood_light', T((x, y, 0)), seg=5)

def logpile(m, x, y, n=3, L=0.8, r=0.07, rot=0): # штабель брёвен пирамидкой
    k = 0
    for row in range(n):
        for i in range(n - row):
            off = (i - (n - row - 1) / 2) * r * 2.05
            m.log(r, L * (0.9 + 0.1 * ((k * 7) % 3)), 'wood', T((x + off * math.sin(rot), y + off * math.cos(rot), r + row * r * 1.75), (0, 0, math.degrees(rot))), end_mat='wood_light')
            k += 1

def stones(m, x, y, n=5, r=0.12): # кучка камня
    for i in range(n):
        a = i * 2.4
        m.rock(r * (0.8 + 0.1 * (i % 3)), 'stone', T((x + math.cos(a) * r * 0.9 * (i > 0), y + math.sin(a) * r * 0.9 * (i > 0), (i > 3) * r * 0.8)), flat=0.75)

def thatch_cone(m, r, h, z, seg=12): # конусная соломенная крыша в два слоя + тёмный край
    m.cyl(r, r * 0.35, h * 0.55, 'thatch', T((0, 0, z)), seg=seg, jitter=0.03)
    m.cyl(r * 0.45, 0.06, h * 0.5, 'thatch_dark', T((0, 0, z + h * 0.5)), seg=seg, jitter=0.02)
    m.cyl(r + 0.03, r - 0.02, 0.07, 'thatch_dark', T((0, 0, z - 0.02)), seg=seg)

def smoke_sticks(m, z, n=4, L=0.35): # жерди, торчащие из дымового отверстия
    for i in range(n):
        a = i * 2 * math.pi / n + 0.4
        m.stick((0, 0, z - 0.2), (math.cos(a) * 0.14, math.sin(a) * 0.14, z + L), 0.02, 'wood_dark', seg=4)

def gable(m, L, D, z, h, mat='thatch', over=0.18): # двускатная крыша вдоль X
    D2 = D / 2 + over
    m.prism([(-D2, z), (D2, z), (D2, z + 0.1), (0, z + h + 0.08), (-D2, z + 0.1)], L + over * 2, mat)
    m.prism([(-0.09, z + h - 0.02), (0.09, z + h - 0.02), (0, z + h + 0.14)], L + over * 2 + 0.04, 'thatch_dark') # конёк

def horns(m, x, z, s=1.0): # скрещённые жерди на торце крыши
    for sy in (-1, 1):
        m.stick((x, 0, z - 0.15 * s), (x * 1.04, sy * 0.3 * s, z + 0.35 * s), 0.035 * s, 'wood_dark', seg=5)

def door(m, x, y, w=0.36, h=0.55, rot=0): # проём + косяки + шкура-полог
    R = T((x, y, 0), (0, 0, rot))
    m.box((w, 0.08, h), 'wood_dark', R @ T((0, 0, 0.02)))
    for sx in (-1, 1): m.box((0.06, 0.1, h + 0.06), 'wood', R @ T((sx * (w / 2 + 0.03), -0.01, 0)))
    m.box((w + 0.14, 0.11, 0.06), 'wood', R @ T((0, -0.01, h)))
    m.box((w * 0.5, 0.04, h * 0.75), 'hide', R @ T((-w * 0.2, -0.05, h * 0.25)), taper=0.9)

def pot(m, x, y, s=1.0):
    m.cyl(0.07 * s, 0.1 * s, 0.1 * s, 'clay', T((x, y, 0)), seg=8)
    m.cyl(0.1 * s, 0.06 * s, 0.08 * s, 'clay', T((x, y, 0.1 * s)), seg=8)

def firepit(m, x, y, lit=True):
    for px, py in ring(8, 0.2):
        m.rock(0.07, 'stone', T((x + px, y + py, 0)))
    if lit:
        for i in range(3): m.stick((x + math.cos(i * 2.1) * 0.15, y + math.sin(i * 2.1) * 0.15, 0.02), (x, y, 0.2), 0.025, 'wood_dark', seg=4)
        m.cyl(0.08, 0.0, 0.16, 'ember', T((x, y, 0.02)), seg=6)

def rack(m, x, y, w=0.7, h=0.6, rot=0, hides=2): # сушилка для шкур
    R = T((x, y, 0), (0, 0, rot))
    for sx in (-1, 1): m.cyl(0.03, 0.025, h, 'wood', R @ T((sx * w / 2, 0, 0)), seg=5)
    m.log(0.025, w + 0.12, 'wood', R @ T((0, 0, h - 0.03)))
    for i in range(hides):
        m.box((w / hides * 0.8, 0.02, h * 0.55), 'hide', R @ T(((i - (hides - 1) / 2) * w / hides, 0, h * 0.35)), taper=0.8)

def totem(m, x, y, h=1.3):
    m.cyl(0.09, 0.08, h, 'wood', T((x, y, 0)), seg=6)
    for i, c in enumerate(['wood_dark', 'clay', 'wood_dark']):
        m.box((0.2, 0.2, 0.18), c, T((x, y, h * (0.35 + i * 0.22)), (0, 0, i * 8)), taper=0.85)
    m.box((0.5, 0.06, 0.08), 'wood_dark', T((x, y, h * 0.8))) # «крылья»
    for sx in (-1, 1): m.cyl(0.02, 0.005, 0.25, 'bone', T((x + sx * 0.07, y, h + 0.02), (0, sx * 25, 0)), seg=4)
    m.box((0.12, 0.13, 0.08), 'bone', T((x, y - 0.02, h - 0.02)))

def fence_run(m, a, b, h=0.4, step=0.28, rails=True): # плетень/частокол между точками
    ax, ay = a; bx, by = b; L = math.hypot(bx - ax, by - ay); n = max(2, round(L / step))
    for i in range(n + 1):
        t = i / n
        m.cyl(0.03, 0.022, h * (0.9 + 0.2 * ((i * 5) % 3) / 2), 'wood', T((ax + (bx - ax) * t, ay + (by - ay) * t, 0)), seg=5)
    if rails:
        ang = math.degrees(math.atan2(by - ay, bx - ax))
        for z in (h * 0.4, h * 0.8):
            m.log(0.018, L, 'wood_light', T(((ax + bx) / 2, (ay + by) / 2, z), (0, 0, ang)))

def dummy(m, x, y): # чучело для тренировки
    m.cyl(0.03, 0.03, 0.75, 'wood', T((x, y, 0)), seg=5)
    m.log(0.025, 0.45, 'wood', T((x, y, 0.55)))
    m.ball(0.14, 'straw', T((x, y, 0.5)), squash=1.3, jitter=0.02)
    m.ball(0.09, 'straw', T((x, y, 0.75)), jitter=0.015)

def weapon_rack(m, x, y, rot=0):
    R = T((x, y, 0), (0, 0, rot))
    for sx in (-1, 1): m.cyl(0.03, 0.03, 0.5, 'wood', R @ T((sx * 0.3, 0, 0)), seg=5)
    m.log(0.025, 0.7, 'wood', R @ T((0, 0, 0.45)))
    for i in range(4): # дубины и копья, прислонённые к перекладине
        px = -0.22 + i * 0.15
        if i % 2: m.stick(R @ T((px, 0.12, 0)).to_translation(), R @ T((px, -0.02, 0.8)).to_translation(), 0.018, 'wood_light', seg=4)
        else: m.stick(R @ T((px, 0.14, 0)).to_translation(), R @ T((px, -0.02, 0.55)).to_translation(), 0.02, 'wood', seg=5, r2=0.045)

def drum(m, x, y):
    m.cyl(0.12, 0.1, 0.22, 'wood', T((x, y, 0)), seg=10)
    m.cyl(0.125, 0.125, 0.02, 'hide', T((x, y, 0.22)), seg=10)

# ---------- здания ----------
def round_hut(key, r=0.72, wall=0.72, roof=1.05, seed=1, extras=True):
    for st in range(3):
        m = Mesh(seed)
        plot(m, r * 2.6, r * 2.6)
        if st == 0:
            stakes(m, r * 2, r * 2); logpile(m, r * 0.9, -r * 1.0, 3, 0.7, 0.06, 0.3); stones(m, -r * 0.9, -r * 0.9, 4)
            for px, py in ring(10, r)[:6]: m.rock(0.08, 'stone', T((px, py, 0)))
        else:
            m.cyl(r + 0.08, r + 0.06, 0.16, 'stone', seg=12, jitter=0.025)                  # каменный цоколь
            for px, py in ring(8, r - 0.01, 0.2): m.cyl(0.04, 0.035, wall + 0.05, 'wood', T((px, py, 0.1)), seg=5) # столбы
            if st == 1:
                m.cyl(r, r - 0.02, wall * 0.45, 'mud', T((0, 0, 0.12)), seg=12, cap=False, jitter=0.01) # стены наполовину
                for px, py in ring(10, r + 0.04): m.stick((px, py, wall + 0.12), (0, 0, wall + roof), 0.025, 'wood_light', seg=4) # стропила
                logpile(m, r * 1.05, -r * 1.05, 2, 0.6, 0.06, 0.4)
            else:
                m.cyl(r, r - 0.03, wall, 'mud', T((0, 0, 0.12)), seg=12, jitter=0.012)
                m.cyl(r + 0.01, r + 0.01, 0.05, 'wood_dark', T((0, 0, 0.12 + wall * 0.55)), seg=12)  # обвязка
                thatch_cone(m, r + 0.3, roof, wall + 0.08)
                smoke_sticks(m, wall + roof + 0.05)
                door(m, 0, -r + 0.02, 0.34, 0.5)
                if extras:
                    pot(m, r * 0.75, -r * 0.85); pot(m, r * 0.95, -r * 0.6, 0.8)
                    logpile(m, -r * 1.05, -r * 0.55, 2, 0.5, 0.05, 1.3)
        save(key, st, m)

def tent_hut(key, seed=2): # вытянутая хижина: низкие бревенчатые стены и соломенная двускатная крыша
    L, D = 1.35, 1.05
    for st in range(3):
        m = Mesh(seed)
        plot(m, L + 0.6, D + 0.6)
        if st == 0:
            stakes(m, L, D); logpile(m, 0.2, -D * 0.75, 3, 0.8, 0.06); stones(m, -L * 0.55, -D * 0.6, 3)
        else:
            for sy in (-1, 1): # бревенчатые стены вдоль
                for i in range(3 if st == 2 else 1): m.log(0.06, L, 'wood', T((0, sy * D / 2, 0.06 + i * 0.11)), end_mat='wood_light')
            for sx in (-1, 1): m.box((0.1, D, 0.33 if st == 2 else 0.12), 'wood_dark', T((sx * L / 2, 0, 0)))
            if st == 1:
                for x in (-L / 2, 0, L / 2):
                    for sy in (-1, 1): m.stick((x, sy * (D / 2 + 0.1), 0.25), (x, 0, 1.15), 0.03, 'wood_light', seg=4)
                m.log(0.035, L + 0.2, 'wood', T((0, 0, 1.12)))
            else:
                gable(m, L, D, 0.3, 0.85)
                horns(m, L / 2 + 0.2, 1.1); horns(m, -L / 2 - 0.2, 1.1)
                m.box((0.34, 0.1, 0.46), 'wood_dark', T((-L / 2 - 0.03, 0, 0.03), (0, 0, 90))) # вход с торца
                m.box((0.3, 0.04, 0.38), 'hide', T((-L / 2 - 0.08, 0.02, 0.1), (0, 0, 90)), taper=0.85)
                rack(m, 0.25, -D / 2 - 0.35, 0.6, 0.55, 0, 2)
                pot(m, L / 2 + 0.05, -D / 2 - 0.2)
        save(key, st, m)

def town_center():
    L, D, W = 2.3, 1.35, 0.75
    for st in range(3):
        m = Mesh(7)
        plot(m, 3.1, 3.0)
        if st == 0:
            stakes(m, L, D, 0.45); logpile(m, -0.6, -1.2, 4, 1.0, 0.07, 0); logpile(m, 0.8, 1.15, 3, 0.9, 0.07, 0); stones(m, 1.1, -1.1, 6, 0.14)
            for x in (-L / 2, L / 2): m.box((0.12, D, 0.12), 'stone', T((x, 0, 0)), jitter=0.02)
        else:
            m.box((L + 0.2, D + 0.2, 0.2), 'stone', jitter=0.03) # каменное основание
            for x in (-L / 2, -L / 6, L / 6, L / 2):
                for sy in (-1, 1): m.cyl(0.06, 0.055, W + 0.1, 'wood', T((x, sy * D / 2, 0.18)), seg=6)
            if st == 1:
                for sy in (-1, 1): m.box((L, 0.08, W * 0.4), 'mud', T((0, sy * D / 2, 0.18)))
                for x in (-L / 2, -L / 6, L / 6, L / 2):
                    for sy in (-1, 1): m.stick((x, sy * (D / 2 + 0.12), W + 0.2), (x, 0, W + 1.2), 0.035, 'wood_light', seg=4)
                m.log(0.05, L + 0.3, 'wood', T((0, 0, W + 1.17)))
                logpile(m, 0.9, -1.25, 3, 0.8, 0.06, 0)
            else:
                for sy in (-1, 1): m.box((L, 0.1, W), 'mud', T((0, sy * D / 2, 0.18)), jitter=0.01)
                for sx in (-1, 1): m.box((0.1, D, W), 'mud', T((sx * L / 2, 0, 0.18)))
                for sy in (-1, 1): m.log(0.04, L + 0.1, 'wood_dark', T((0, sy * (D / 2 + 0.04), 0.18 + W * 0.55)))
                gable(m, L, D, W + 0.14, 1.1, over=0.28)
                horns(m, L / 2 + 0.3, W + 1.2, 1.3); horns(m, -L / 2 - 0.3, W + 1.2, 1.3)
                m.prism([(-0.28, W + 0.95), (0.28, W + 0.95), (0, W + 1.12)], 0.45, 'thatch_dark', T((0, -0.5, 0.0))) # дымник-«слуховое окно»
                door(m, 0, -D / 2 - 0.04, 0.46, 0.62)
                # навес над входом на двух жердях
                for sx in (-1, 1): m.cyl(0.035, 0.03, 0.78, 'wood', T((sx * 0.4, -D / 2 - 0.5, 0)), seg=5)
                m.box((1.0, 0.55, 0.05), 'hide', T((0, -D / 2 - 0.27, 0.78), (-18, 0, 0)))
                totem(m, -0.95, -1.2, 1.45)
                firepit(m, 0.95, -1.15)
                rack(m, 1.35, 0.1, 0.7, 0.6, math.radians(90), 2)
                for x, y in ((-1.3, 0.9), (-1.35, 0.45)): pot(m, x, y)
                logpile(m, 0.5, 1.2, 3, 0.9, 0.06, 0)
                fence_run(m, (-1.45, 1.4), (0.0, 1.45), 0.35, rails=False)
        save('town_center', st, m)

def farm():
    for st in range(3):
        m = Mesh(11)
        m.box((1.95, 1.95, 0.05), 'soil' if st else 'mud', jitter=0.01)
        if st == 0:
            stakes(m, 1.8, 1.8, 0.3)
            for sy in (-1, 1): m.log(0.012, 1.8, 'rope', T((0, sy * 0.9, 0.2)))
            m.box((0.08, 0.5, 0.02), 'wood_light', T((0.3, -0.4, 0.05), (0, 0, 25))) # мотыга
        else:
            for i in range(6): # борозды
                y = -0.78 + i * 0.312
                m.box((1.75, 0.13, 0.07), 'soil', T((0, y, 0.03)), taper=0.6, jitter=0.01)
                if st == 2:
                    for j in range(8):
                        x = -0.78 + j * 0.222 + ((i * 3 + j) % 3 - 1) * 0.02
                        for k in range(3):
                            a = (i * 8 + j) * 1.7 + k * 2.1
                            m.stick((x, y, 0.08), (x + math.cos(a) * 0.05, y + math.sin(a) * 0.05, 0.42 + ((j + k) % 3) * 0.04), 0.012, 'wheat_dark', seg=3)
                            m.cyl(0.018, 0.008, 0.08, 'wheat', T((x + math.cos(a) * 0.05, y + math.sin(a) * 0.05, 0.4 + ((j + k) % 3) * 0.04)), seg=4)
            fence_run(m, (-0.97, -0.97), (-0.97, 0.97), 0.3, 0.3)
            fence_run(m, (-0.97, 0.97), (0.97, 0.97), 0.3, 0.3)
            if st == 2: # пугало в углу
                m.cyl(0.02, 0.02, 0.7, 'wood', T((0.85, 0.8, 0)), seg=4); m.log(0.015, 0.35, 'wood', T((0.85, 0.8, 0.55)))
                m.box((0.16, 0.08, 0.22), 'cloth', T((0.85, 0.8, 0.4)), taper=0.8); m.ball(0.06, 'straw', T((0.85, 0.8, 0.7)))
        save('farm', st, m)

def pasture():
    S = 2.8
    for st in range(3):
        m = Mesh(13)
        plot(m, S + 0.1, S + 0.1, 'mud' if st == 2 else 'soil')
        h = S / 2
        if st == 0:
            stakes(m, S, S, 0.45); logpile(m, 0.3, -h + 0.3, 3, 0.9, 0.06); logpile(m, -0.6, 0.4, 2, 0.9, 0.06, 1.2)
        else:
            rails = st == 2
            fence_run(m, (-h, h), (h, h), 0.45, 0.35, rails); fence_run(m, (-h, -h), (-h, h), 0.45, 0.35, rails); fence_run(m, (h, -h), (h, h), 0.45, 0.35, rails)
            fence_run(m, (-h, -h), (-0.35, -h), 0.45, 0.35, rails); fence_run(m, (0.35, -h), (h, -h), 0.45, 0.35, rails) # проход спереди
            # навес для скота в дальнем левом углу
            for x, y, hh in ((-h + 0.2, h - 0.2, 0.95), (-h + 1.2, h - 0.2, 0.95), (-h + 0.2, h - 1.0, 0.7), (-h + 1.2, h - 1.0, 0.7)):
                m.cyl(0.04, 0.035, hh, 'wood', T((x, y, 0)), seg=5)
            if st == 2:
                m.box((1.3, 1.05, 0.07), 'thatch', T((-h + 0.7, h - 0.6, 0.78), (-14, 0, 0)), jitter=0.02)
                m.box((1.1, 0.35, 0.25), 'wood', T((0.5, -0.2, 0))); m.box((1.0, 0.27, 0.05), 'mud', T((0.5, -0.2, 0.2))) # корыто
                m.ball(0.35, 'straw', T((0.8, h - 0.55, 0)), squash=0.7, jitter=0.04); m.ball(0.25, 'thatch_dark', T((1.05, h - 0.95, 0)), squash=0.7, jitter=0.03)
                pot(m, -0.3, -h + 0.4)
        save('pasture', st, m)

def camp():
    for st in range(3):
        m = Mesh(17)
        plot(m, 2.0, 2.0)
        if st == 0:
            stakes(m, 1.6, 1.4); logpile(m, -0.3, -0.4, 3, 0.8, 0.06)
        else:
            # навес-заслон: высокие передние жерди, низкие задние
            for x in (-0.8, 0.0, 0.8):
                m.cyl(0.04, 0.035, 1.0, 'wood', T((x, 0.05, 0)), seg=5); m.cyl(0.04, 0.035, 0.45, 'wood', T((x, 0.8, 0)), seg=5)
            m.log(0.04, 1.8, 'wood', T((0, 0.05, 0.98))); m.log(0.04, 1.8, 'wood', T((0, 0.8, 0.43)))
            if st == 2:
                m.box((1.9, 0.95, 0.06), 'hide', T((0, 0.42, 0.66), (-36, 0, 0)))
                for x in (-0.6, 0.1, 0.7): m.log(0.03, 1.0, 'wood_dark', T((x, 0.42, 0.72), (0, -36, 90)))
                logpile(m, -0.45, -0.55, 4, 0.75, 0.055)
                stones(m, 0.55, -0.5, 6, 0.12)
                m.cyl(0.13, 0.15, 0.2, 'wood', T((0.2, 0.35, 0)), seg=8) # колода с топором
                m.stick((0.17, 0.35, 0.2), (0.05, 0.3, 0.45), 0.015, 'wood_light', seg=4); m.box((0.1, 0.03, 0.07), 'stone_dark', T((0.2, 0.36, 0.18), (0, 30, 0)))
                for x in (-0.5, -0.2): m.cyl(0.1, 0.08, 0.18, 'straw', T((x, 0.45, 0)), seg=8) # корзины
                firepit(m, 0.75, 0.25, False)
            else:
                logpile(m, -0.45, -0.55, 2, 0.75, 0.055)
        save('camp', st, m)

def barracks():
    for st in range(3):
        m = Mesh(19)
        plot(m, 3.0, 3.0)
        if st == 0:
            stakes(m, 2.6, 2.6, 0.45); logpile(m, 0.5, -0.9, 4, 0.9, 0.065); stones(m, -0.9, -0.9, 5)
            for px, py in ring(9, 0.85)[:5]: m.rock(0.09, 'stone', T((px - 0.3, py + 0.4, 0)))
        else:
            # большая круглая хижина воинов в глубине
            r, w, cx, cy = 0.9, 0.8, -0.3, 0.4
            m.cyl(r + 0.1, r + 0.08, 0.18, 'stone', T((cx, cy, 0)), seg=12, jitter=0.03)
            for px, py in ring(8, r, 0.2): m.cyl(0.045, 0.04, w + 0.05, 'wood', T((cx + px, cy + py, 0.1)), seg=5)
            if st == 1:
                for px, py in ring(10, r + 0.05): m.stick((cx + px, cy + py, w + 0.12), (cx, cy, w + 1.2), 0.03, 'wood_light', seg=4)
                weapon_rack(m, 0.9, -0.8, 0.3)
            else:
                m.cyl(r, r - 0.03, w, 'mud', T((cx, cy, 0.14)), seg=12, jitter=0.012)
                m.cyl(r + 0.01, r + 0.01, 0.05, 'wood_dark', T((cx, cy, 0.14 + w * 0.5)), seg=12)
                m.cyl(r + 0.35, r * 0.4, 0.62, 'thatch', T((cx, cy, w + 0.1)), seg=12, jitter=0.03)
                m.cyl(r * 0.42, 0.06, 0.55, 'thatch_dark', T((cx, cy, w + 0.68)), seg=12, jitter=0.02)
                m.cyl(r + 0.38, r + 0.33, 0.07, 'thatch_dark', T((cx, cy, w + 0.08)), seg=12)
                for i in range(6): # шипы-колья по краю крыши
                    a = i * 1.05 + 0.3
                    m.stick((cx + math.cos(a) * (r + 0.2), cy + math.sin(a) * (r + 0.2), w + 0.25), (cx + math.cos(a) * (r + 0.5), cy + math.sin(a) * (r + 0.5), w + 0.45), 0.025, 'wood_dark', seg=4, r2=0.005)
                smoke_sticks(m, w + 1.2)
                door(m, cx + 0.1, cy - r + 0.02, 0.38, 0.55)
                # двор: чучела, стойка с оружием, барабан, частокол сбоку
                dummy(m, 0.85, 0.3); dummy(m, 1.15, -0.2)
                weapon_rack(m, 0.8, -0.95, 0.3)
                drum(m, -1.05, -0.9)
                for px, py in ring(10, 0.45)[:10]: m.rock(0.06, 'stone', T((0.95 + px, 0.05 + py, 0)))
                fence_run(m, (1.4, 1.35), (1.4, -0.4), 0.55, rails=False)
                for sx in (-1, 1): # шесты со шкурами-знамёнами у входа
                    x = cx + 0.1 + sx * 0.45
                    m.cyl(0.03, 0.025, 1.3, 'wood', T((x, cy - r - 0.25, 0)), seg=5)
                    m.box((0.25, 0.03, 0.35), 'hide', T((x + sx * 0.12, cy - r - 0.25, 0.85)), taper=0.7)
                    m.cyl(0.05, 0.03, 0.08, 'bone', T((x, cy - r - 0.25, 1.28)), seg=5)
        save('barracks', st, m)

if __name__ == '__main__':
    only = sys.argv[1:]
    todo = {
        'town_center': town_center,
        'house': lambda: (round_hut('house_0'), round_hut('house_1', 0.66, 0.62, 0.95, seed=5), tent_hut('house_2')),
        'farm': farm, 'pasture': pasture, 'camp': camp, 'barracks': barracks,
    }
    for k, f in todo.items():
        if not only or k in only: f()
    print('готово:', len(FILES))
