// =====================================================================
// Противники (GDD §10). Только постоянные данные.
// Состояния: IDLE, PATROL, INVESTIGATE, ALERT, CHASE, ATTACK, RETREAT, DEAD.
// =====================================================================

AB.ENEMIES = [
  {
    id: 'ENEMY-001',
    name: 'Мутант',
    type: 'mutant',
    asset: 'ASSET-ENEMY001-01',
    hp: 80,
    damage: 14,
    speed: { patrol: 55, investigate: 85, chase: 165, retreat: 120 },
    attack: { range: 58, windup: 0.55, cooldown: 1.1 },
    // Радиус обнаружения: впереди полностью, сзади — треть
    detection: { sight: 260, behind: 0.35 },
    // Реакция на шум: с какого расстояния слышит шаги, бег и удары
    noise: { walk: 130, run: 330, combat: 380 },
    // Реакция на свет: в освещённых зонах замечает героя в 1,5 раза дальше
    light: { litMultiplier: 1.5, litRadius: 190 },
    behavior: {
      start: 'PATROL',
      retreatBelow: 0.3,       // при здоровье ниже 30% ненадолго отступает
      retreatTime: 2.2,
      loseAfter: 4,            // теряет героя, если не видит и не слышит 4 с
      investigateTime: 3,
    },
    anims: {
      idle: 'ANIM-ENEMY001-01',
      walk: 'ANIM-ENEMY001-02',
      run: 'ANIM-ENEMY001-03',
      alert: 'ANIM-ENEMY001-04',
      attack: 'ANIM-ENEMY001-05',
      hurt: 'ANIM-ENEMY001-06',
      death: 'ANIM-ENEMY001-07',
    },
    // Каждый персонаж несёт одну вещь (видна над головой по нажатию); после гибели выпадает
    carry: 'ITEM-010',
    // Условия появления
    spawn: { room: 'ROOM-011', x: 1650, patrol: [1250, 2000], requires: [] },
  },
];

// ENEMY-002 — преследователь (GDD §3). В главе 1 игрок не знает, кто он.
// Нападает только на спутницу; убить нельзя — после нескольких ударов отступает.
AB.ENEMIES.push({
  id: 'ENEMY-002',
  name: '???',
  type: 'pursuer',
  humanoid: true,                 // рисуется как человек (заглушка-силуэт)
  immortal: true,
  asset: 'ASSET-ENEMY002-01',
  appearance: 'ASSET-ENEMY002-01',
  // силуэт: рваный обгоревший комбинезон, лицо скрыто
  look: { dark: '#0d0d0f', mid: '#1b1a1c', light: '#2a2725', hood: true, build: 1 },
  hp: 999,
  damage: 20,                     // по спутнице
  shove: 8,                       // по Марку, если тот встал на пути
  hitsToRetreat: 3,
  speed: { chase: 150, retreat: 210 },
  attack: { range: 52, windup: 0.5, cooldown: 1.2 },
  target: 'CHAR-002',
  stats: { maxHp: 999, speed: 150, runSpeed: 150 },
  anims: {
    idle: 'ANIM-ENEMY002-01',
    walk: 'ANIM-ENEMY002-02',
    run: 'ANIM-ENEMY002-03',
    attack: 'ANIM-ENEMY002-04',
    hurt: 'ANIM-ENEMY002-05',
  },
  carry: null,
  spawn: null,                    // появляется только по сюжетным событиям
});

AB.ENEMIES.forEach((e) => AB.ID.register(e.id, e));
