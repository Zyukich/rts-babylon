# Превью набора: python tools/blender/preview.py <набор> <out.png>. Наборы: nature, buildings, units
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import contact_sheet
R = os.path.join(os.path.dirname(__file__), '../../assets/models')
N = lambda k: os.path.join(R, 'nature', k + '.glb')
SETS = {
    'nature': [[N('pineT'), N('pineL')], [N('oakT'), N('oakL')], [N('oakT'), N('oakY')], [N('oakT'), N('oakO')], [N('birchT'), N('birchL')], [N('bush'), N('berry')],
               N('rock0'), N('rock1'), N('rock2'), N('ore0'), N('ore1'), N('ore2'), N('gold0'), N('gold1'), N('gold2'), [N('soil'), N('wheat')],
               N('stump'), N('log'), N('fern'), N('mushroom'), N('pebbles'), N('crate'), N('barrel'), N('sack'), N('cart'), N('fence'), N('woodpile'), N('hay')],
    'primitive': [os.path.join(R, 'primitive', f'{b}_s{st}.glb') for b in ('town_center', 'house_0', 'house_2', 'barracks', 'pasture', 'camp', 'farm') for st in (0, 1, 2)],
}
COLS = {'primitive': 3}
kind, out = sys.argv[1], sys.argv[2]
cell = float(sys.argv[3]) if len(sys.argv) > 3 else 1.6
contact_sheet(SETS[kind], out, cols=COLS.get(kind, 7), cell=cell, res=(1600, 1000) if kind != 'primitive' else (1200, 2400))
