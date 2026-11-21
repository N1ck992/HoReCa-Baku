#!/usr/bin/env python3
"""
PROJECT ABYSS — скелет из листа ОТДЕЛЬНЫХ деталей (каждая в своей клетке, части уже
вырезаны в out_dir). Суставы задаются в долях картинки каждой детали (tools/rigs/<RIG>.json):
  "joints": { "thigh_near": {"pivot": [x, y], "end": [x, y]}, ... ,
              "torso": {"pivot": [...], "end": [...], "shoulder_near": [...], "shoulder_far": [...]} }
Если x не задан (null) — берётся середина силуэта детали в этой строке.
    python3 tools/rig_from_parts.py tools/rigs/MARK2.json
"""
import json, math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main(cfg_path):
    cfg = json.load(open(cfg_path))
    d = os.path.join(ROOT, cfg['out_dir'], '01')
    imgs = {n: Image.open(os.path.join(d, f'{n}.png')) for n in cfg['joints']}
    def mid_x(name, fy):
        a = np.array(imgs[name])[:, :, 3] > 128
        H, W = a.shape
        row = a[min(H - 1, max(0, int(fy * H)))]
        xs = np.where(row)[0]
        return float(xs.mean() / W) if len(xs) else 0.5
    parts = {}
    for n, j in cfg['joints'].items():
        p = {}
        for k, v in j.items():
            x, y = v
            p[k] = [round(mid_x(n, y) if x is None else x, 4), round(y, 4)]
        parts[n] = p
    # длины костей в пикселях исходного листа → единицы игры
    def plen(n):
        W, H = imgs[n].size
        a, b = parts[n]['pivot'], parts[n]['end']
        return math.hypot((b[0] - a[0]) * W, (b[1] - a[1]) * H)
    def sole_below_ankle(n):
        a = np.array(imgs[n])[:, :, 3] > 128
        H = a.shape[0]; ys = np.where(a.any(axis=1))[0]
        return (ys.max() - parts[n]['end'][1] * H)
    # укоротить руки/ноги, не меняя их толщину (limb_scale: {"arm": 0.85, "leg": 0.8})
    ls = cfg.get('limb_scale', {})
    def k_of(n):
        if n.startswith(('upperarm', 'forearm')): return ls.get('arm', 1.0)
        if n.startswith(('thigh', 'shin')): return ls.get('leg', 1.0)
        return 1.0
    for n in parts:
        if k_of(n) != 1.0: parts[n]['scaleX'] = round(1 / k_of(n), 4)
    legs_px = (plen('thigh_near') + plen('shin_near') + sole_below_ankle('shin_near')) * ls.get('leg', 1.0)
    px_total = legs_px + plen('torso') + plen('head')
    upp = cfg['height_units'] / px_total
    bones = {n: round(plen(n) * k_of(n) * upp, 2) for n in parts}
    hipY = -round(legs_px * upp, 2)
    rig = {
        'source': os.path.relpath(cfg_path, ROOT), 'unitsPerPx': round(upp, 5),
        'parts': parts, 'bones': bones,
        'variants': {'01': {n: f"{cfg['out_dir']}/01/{n}.png" for n in parts}},
        'hipY': hipY, 'farDarken': cfg.get('far_darken', 0.55),
    }
    js = (f"// Создано tools/rig_from_parts.py — не редактировать вручную.\n// Разметка: {rig['source']}\n"
          f"AB.RIGS = AB.RIGS || {{}};\nAB.RIGS.{cfg['rig']} = {json.dumps(rig, ensure_ascii=False, indent=2)};\n")
    open(os.path.join(ROOT, cfg['js_out']), 'w').write(js)
    print('скелет →', cfg['js_out'], '| единиц на пиксель', rig['unitsPerPx'], '| таз', hipY)
    print(bones)

if __name__ == '__main__':
    main(sys.argv[1])
