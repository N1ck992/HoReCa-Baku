// Создано tools/cut_exosuit.py — не редактировать вручную (№62).
// Картинка экзокостюма, нарезанная на части: координаты — в пикселях исходника.
AB.RIGS = AB.RIGS || {};
AB.RIGS.EXOSUIT_HALE_ART = {
  "source": "assets/source/EXOSUIT-HALE-01.png",
  "scale": 0.5,
  "heightPx": 1485,
  "soleY": 1505,
  "joints": {
    "crown": [
      600,
      20
    ],
    "hip": [
      520,
      960
    ],
    "elbow": [
      470,
      565
    ],
    "wrist": [
      520,
      790
    ],
    "hand": [
      540,
      870
    ],
    "hip_near": [
      470,
      1000
    ],
    "knee_near": [
      420,
      1315
    ],
    "ankle_near": [
      450,
      1440
    ],
    "toe_near": [
      640,
      1480
    ],
    "hip_far": [
      580,
      970
    ],
    "knee_far": [
      585,
      1190
    ],
    "ankle_far": [
      630,
      1420
    ],
    "toe_far": [
      715,
      1470
    ]
  },
  "parts": {
    "forearm_near": {
      "file": "assets/exosuit/hale/forearm_near.png",
      "x": 380,
      "y": 475,
      "w": 251,
      "h": 486
    },
    "shin_near": {
      "file": "assets/exosuit/hale/shin_near.png",
      "x": 322,
      "y": 1190,
      "w": 396,
      "h": 329
    },
    "thigh_near": {
      "file": "assets/exosuit/hale/thigh_near.png",
      "x": 343,
      "y": 941,
      "w": 248,
      "h": 414
    },
    "body": {
      "file": "assets/exosuit/hale/body.png",
      "x": 187,
      "y": 16,
      "w": 570,
      "h": 949
    },
    "thigh_far": {
      "file": "assets/exosuit/hale/thigh_far.png",
      "x": 495,
      "y": 965,
      "w": 188,
      "h": 325
    },
    "shin_far": {
      "file": "assets/exosuit/hale/shin_far.png",
      "x": 501,
      "y": 1107,
      "w": 217,
      "h": 408
    }
  },
  "order": [
    "thigh_far",
    "shin_far",
    "body",
    "thigh_near",
    "shin_near",
    "forearm_near"
  ],
  "farFromNear": true
};
