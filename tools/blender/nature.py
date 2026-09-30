# Природа и ресурсы: деревья (ствол и крона — отдельные файлы: крону качает ветер), кусты, камень, руда, золото,
# пшеница, пашня, мелочи на земле и быт у построек. Цвет — в вершинах (colors='full'): в игре их красит шейдер ветра.
import math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import Mesh, T, mat, export, clear, reset, PAL

OUT = os.path.join(os.path.dirname(__file__), '../../assets/models/nature')
out = lambda k: os.path.join(OUT, k + '.glb')
FULL = dict(colors='full')

def save(key, m, lo=0.62, hi=1.05, h0=0.0, h1=None, jit=0.07):
    ob = m.obj(key, colors='full', lo=lo, hi=hi, h0=h0, h1=h1, face_jitter=jit)
    export([ob], out(key)); clear()

# ---------- Деревья ----------
def trunk(key, h, r0, r1, color='bark', seed=0, branches=0, bands=False):
    m = Mesh(seed)
    m.cyl(r0, r1, h, color, seg=7, jitter=r0 * 0.12)
    m.cyl(r0 * 1.6, r0 * 0.9, 0.12, color, seg=7, jitter=0.02) # корневой «сапог»
    for i in range(branches): # сучья к кроне
        a = i * 137 + 40
        m.cyl(r1 * 0.7, r1 * 0.35, h * 0.35, color, T((0, 0, h * (0.62 + 0.1 * i)), (35, 0, a)), seg=5)
    if bands: # берёза: тёмные чёрточки на коре
        for i in range(6):
            z = 0.15 + i * h * 0.13
            m.box((r0 * 1.2, r0 * 0.5, 0.03), 'wood_dark', T((0, -r0 * 0.75, z), (0, 0, i * 60)))
    save(key, m, lo=0.55, hi=1.05, h1=h)

def pine_crown(key, seed=0):
    m = Mesh(seed)
    tiers = [(0.64, 0.6, 0.38), (0.56, 0.55, 0.64), (0.47, 0.5, 0.9), (0.37, 0.46, 1.14), (0.26, 0.44, 1.38), (0.14, 0.34, 1.62)]
    for i, (r, h, z) in enumerate(tiers): # ярусы лап, чуть разного оттенка
        m.cyl(r, 0.03, h, 'pine' if i % 2 == 0 else 'pine_light', T((0, 0, z), (m.rnd.uniform(-4, 4), m.rnd.uniform(-4, 4), i * 23)), seg=10, jitter=0.03)
    save(key, m, lo=0.45, hi=1.25, h0=0.4, h1=1.95, jit=0.09)

def crown(key, colors, seed=0, k=1.0, z=1.0):
    m = Mesh(seed); rnd = m.rnd
    blobs = [(0.42, 0, 0, 0.2), (0.33, 0.34, 0.08, 0.04), (0.33, -0.32, -0.1, 0.06), (0.3, 0.05, 0.3, 0.1), (0.3, -0.06, -0.34, 0.08),
             (0.28, 0.22, -0.2, 0.36), (0.27, -0.2, 0.18, 0.4), (0.25, 0.05, 0.02, 0.58), (0.22, 0.36, 0.26, 0.24), (0.22, -0.36, 0.22, 0.22)]
    for r, x, y, dz in blobs: # много кластеров листвы разных оттенков — «пятнистая» крона
        m.ball(r * k, rnd.choice(colors), T((x * k, y * k, z + dz * k), (0, 0, rnd.uniform(0, 360))), sub=1, jitter=0.04 * k, squash=0.8)
    save(key, m, lo=0.5, hi=1.2, h0=z - 0.4 * k, h1=z + 0.8 * k, jit=0.1)

# ---------- Кусты, ягоды ----------
def bush():
    m = Mesh(3)
    for r, x, y, z in [(0.22, 0, 0, 0.16), (0.17, 0.16, 0.06, 0.12), (0.16, -0.14, -0.07, 0.13), (0.15, 0.02, 0.05, 0.3), (0.14, -0.05, 0.16, 0.12)]:
        m.ball(r, 'leaf', T((x, y, z)), sub=1, jitter=0.02, squash=0.85)
    save('bush', m, lo=0.5, hi=1.15, h1=0.45)
    m = Mesh(4)
    rnd = m.rnd
    for i in range(12):
        a = rnd.uniform(0, 6.28); r = rnd.uniform(0.13, 0.24)
        m.ball(0.035, 'berry', T((math.cos(a) * r, math.sin(a) * r, rnd.uniform(0.14, 0.36))), sub=1)
    save('berry', m, lo=0.8, hi=1.15)

# ---------- Камень, руда, золото ----------
def rocks(kind, v):
    m = Mesh(10 + v + {'rock': 0, 'ore': 20, 'gold': 40}[kind])
    rnd = m.rnd
    base = 'stone' if kind == 'rock' else 'stone_ore'
    n = 3 + v
    for i in range(n):
        a = i * 2.4 + v; d = 0 if i == 0 else rnd.uniform(0.18, 0.32)
        r = 0.3 if i == 0 else rnd.uniform(0.12, 0.2)
        m.rock(r, base, T((math.cos(a) * d, math.sin(a) * d, 0), (0, 0, rnd.uniform(0, 360))), flat=rnd.uniform(0.55, 0.85))
    if kind != 'rock': # прожилки руды / самородки: вкрапления на поверхности
        vein = 'ore_vein' if kind == 'ore' else 'gold'
        for i in range(7 + v * 2):
            a = rnd.uniform(0, 6.28); d = rnd.uniform(0.05, 0.3)
            m.rock(rnd.uniform(0.045, 0.08), vein, T((math.cos(a) * d, math.sin(a) * d, rnd.uniform(0.12, 0.3))), flat=0.8, rough=0.35, sub=0)
    save(f'{kind}{v}', m, lo=0.55, hi=1.1, h1=0.5)

# ---------- Пшеница и пашня ----------
def wheat():
    m = Mesh(7); rnd = m.rnd
    for row in range(5):
        for i in range(7):
            x = -0.4 + i * 0.133 + rnd.uniform(-0.03, 0.03); y = -0.38 + row * 0.19 + rnd.uniform(-0.02, 0.02)
            h = rnd.uniform(0.34, 0.46); lean = rnd.uniform(-8, 8)
            M = T((x, y, 0), (lean, rnd.uniform(-8, 8), rnd.uniform(0, 90)))
            m.box((0.018, 0.018, h), 'wheat_dark', M)
            m.cyl(0.028, 0.012, 0.11, 'wheat', M @ T((0, 0, h)), seg=4)
    save('wheat', m, lo=0.6, hi=1.15, h1=0.55, jit=0.1)
    m = Mesh(8)
    m.box((0.96, 0.96, 0.015), 'soil')
    for row in range(5): # борозды
        m.box((0.92, 0.07, 0.035), 'mud', T((0, -0.38 + row * 0.19, 0.01)), jitter=0.004)
    save('soil', m, lo=0.8, hi=1.1)

# ---------- Мелочи на земле ----------
def decor():
    m = Mesh(20)
    m.cyl(0.14, 0.12, 0.16, 'bark', seg=7, jitter=0.01); m.cyl(0.12, 0.12, 0.012, 'wood_light', T((0, 0, 0.16)), seg=7)
    m.cyl(0.05, 0.02, 0.14, 'bark', T((0.12, 0, 0.02), (0, 70, 0)), seg=5)
    save('stump', m, lo=0.6, hi=1.1)
    m = Mesh(21)
    m.log(0.08, 0.7, 'bark', T((0, 0, 0.08), (0, 0, 20)), end_mat='wood_light')
    save('log', m, lo=0.6, hi=1.1)
    m = Mesh(22)
    for i in range(7): # листья папоротника — вытянутые пластины веером
        m.box((0.07, 0.34, 0.012), 'leaf', T((0, 0, 0.02), (38, 0, i * 51)) @ T((0, 0.17, 0)), taper=0.3)
    save('fern', m, lo=0.55, hi=1.2)
    m = Mesh(23)
    for x, y, s in [(0, 0, 1), (0.1, 0.06, 0.7), (-0.07, 0.08, 0.55)]:
        m.cyl(0.025 * s, 0.03 * s, 0.09 * s, 'bone', T((x, y, 0)), seg=6)
        m.ball(0.07 * s, 'berry', T((x, y, 0.09 * s)), sub=1, squash=0.55)
    save('mushroom', m, lo=0.7, hi=1.1)
    m = Mesh(24)
    for i in range(6):
        a = i * 1.1; m.rock(m.rnd.uniform(0.03, 0.06), 'stone', T((math.cos(a) * 0.14 * (i % 3), math.sin(a) * 0.14 * (i % 3), 0)), flat=0.6, sub=0)
    save('pebbles', m, lo=0.6, hi=1.1)

# ---------- Быт у построек ----------
def props():
    m = Mesh(30) # ящик: доски и тёмные рёбра
    m.box((0.28, 0.28, 0.26), 'wood', jitter=0.004)
    for z in (0.03, 0.23): m.box((0.29, 0.29, 0.035), 'wood_dark', T((0, 0, z - 0.017)))
    save('crate', m, lo=0.65, hi=1.08)
    m = Mesh(31) # бочка
    m.cyl(0.1, 0.1, 0.3, 'wood', seg=10); m.cyl(0.12, 0.1, 0.15, 'wood', T((0, 0, 0.07)), seg=10)
    for z in (0.05, 0.25): m.cyl(0.118, 0.118, 0.025, 'iron', T((0, 0, z)), seg=10)
    save('barrel', m, lo=0.65, hi=1.08)
    m = Mesh(32) # мешок
    m.ball(0.12, 'cloth', T((0, 0, 0.1)), sub=1, squash=1.1, jitter=0.015); m.cyl(0.04, 0.02, 0.08, 'cloth', T((0, 0, 0.2)), seg=5); m.cyl(0.045, 0.045, 0.02, 'rope', T((0, 0, 0.2)), seg=6)
    save('sack', m, lo=0.65, hi=1.08)
    m = Mesh(33) # телега: кузов, колёса, оглобли
    m.box((0.5, 0.3, 0.12), 'wood', T((0, 0, 0.16))); m.box((0.5, 0.03, 0.1), 'wood_dark', T((0, 0.15, 0.24))); m.box((0.5, 0.03, 0.1), 'wood_dark', T((0, -0.15, 0.24)))
    for y in (-0.19, 0.19): m.cyl(0.13, 0.13, 0.04, 'wood_dark', T((0.05, y + (0.02 if y < 0 else -0.02), 0.13), (90, 0, 0)), seg=8)
    for y in (-0.08, 0.08): m.box((0.4, 0.03, 0.03), 'wood', T((-0.42, y, 0.17), (0, -8, 0)))
    m.box((0.4, 0.22, 0.08), 'straw', T((0, 0, 0.26)), jitter=0.01)
    save('cart', m, lo=0.65, hi=1.08)
    m = Mesh(34) # плетень
    for x in (-0.3, 0, 0.3): m.cyl(0.025, 0.02, 0.32, 'wood_dark', T((x, 0, 0)), seg=5)
    for z in (0.1, 0.2): m.box((0.66, 0.025, 0.04), 'wood', T((0, 0, z)), jitter=0.004)
    save('fence', m, lo=0.65, hi=1.08)
    m = Mesh(35) # поленница
    for row in range(3):
        for i in range(4 - row):
            m.log(0.045, 0.34, 'bark', T((0, -0.14 + i * 0.09 + row * 0.045, 0.045 + row * 0.08), (0, 0, 90)), seg=6, end_mat='wood_light')
    save('woodpile', m, lo=0.65, hi=1.08)
    m = Mesh(36) # стог
    m.cyl(0.2, 0.05, 0.36, 'straw', seg=9, jitter=0.02); m.cyl(0.21, 0.2, 0.06, 'thatch_dark', seg=9, jitter=0.01)
    save('hay', m, lo=0.6, hi=1.12)

if __name__ == '__main__':
    reset()
    trunk('pineT', 1.0, 0.08, 0.035, seed=1)
    pine_crown('pineL', seed=2)
    trunk('oakT', 0.95, 0.1, 0.055, seed=3, branches=3)
    crown('oakL', ['leaf_dark', 'leaf', 'leaf_mid'], seed=4)
    crown('oakY', ['autumn_y', 'autumn_y2', 'leaf_mid'], seed=5)
    crown('oakO', ['autumn_o', 'autumn_o2', 'autumn_r', 'autumn_y'], seed=6)
    trunk('birchT', 1.15, 0.06, 0.035, color='birch', seed=7, bands=True)
    crown('birchL', ['leaf_light', 'leaf_mid', 'leaf_light'], seed=8, k=0.8, z=1.15)
    bush()
    for v in range(3):
        for kind in ('rock', 'ore', 'gold'): rocks(kind, v)
    wheat(); decor(); props()
    print('природа готова')
