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

AB.ENEMIES.forEach((e) => AB.ID.register(e.id, e));
