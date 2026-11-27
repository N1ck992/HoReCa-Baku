// Создано tools/cut_exosuit.py — не редактировать вручную (№62).
// Картинка экзокостюма, нарезанная на части: координаты — в пикселях исходника.
AB.RIGS = AB.RIGS || {};
AB.RIGS.EXOSUIT_ART = {
  "source": "assets/source/EXOSUIT-01.png",
  "scale": 0.5,
  "heightPx": 1430,
  "soleY": 1490,
  "joints": {
    "crown": [
      655,
      60
    ],
    "hip": [
      515,
      905
    ],
    "elbow": [
      485,
      545
    ],
    "wrist": [
      640,
      715
    ],
    "hand": [
      690,
      800
    ],
    "hip_near": [
      520,
      960
    ],
    "knee_near": [
      515,
      1160
    ],
    "ankle_near": [
      530,
      1310
    ],
    "toe_near": [
      790,
      1450
    ],
    "hip_far": [
      470,
      950
    ],
    "knee_far": [
      370,
      1140
    ],
    "ankle_far": [
      320,
      1300
    ],
    "toe_far": [
      430,
      1440
    ]
  },
  "parts": {
    "forearm_near": {
      "file": "assets/exosuit/v2/forearm_near.png",
      "x": 390,
      "y": 450,
      "w": 328,
      "h": 439
    },
    "shin_near": {
      "file": "assets/exosuit/v2/shin_near.png",
      "x": 395,
      "y": 1040,
      "w": 425,
      "h": 453
    },
    "thigh_near": {
      "file": "assets/exosuit/v2/thigh_near.png",
      "x": 401,
      "y": 901,
      "w": 305,
      "h": 299
    },
    "body": {
      "file": "assets/exosuit/v2/body.png",
      "x": 202,
      "y": 36,
      "w": 583,
      "h": 894
    },
    "thigh_far": {
      "file": "assets/exosuit/v2/thigh_far.png",
      "x": 279,
      "y": 930,
      "w": 281,
      "h": 316
    },
    "shin_far": {
      "file": "assets/exosuit/v2/shin_far.png",
      "x": 195,
      "y": 1055,
      "w": 364,
      "h": 436
    }
  },
  "order": [
    "thigh_far",
    "shin_far",
    "body",
    "thigh_near",
    "shin_near",
    "forearm_near"
  ]
};
