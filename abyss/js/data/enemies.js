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
    carry: null,                    // ключ-карта теперь у Миры (дополнение №37)
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
  // канон (docs/STORY.md §6): неизвестный человек в защитном костюме, лицо за щитком шлема
  look: { dark: '#14161a', mid: '#2c3036', light: '#454a50', helmet: true, build: 1.04 },
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

// Мутанты лаборатории — тот же вид, что ENEMY-001, свои экземпляры.
const MUTANT = AB.ENEMIES.find((e) => e.id === 'ENEMY-001');
AB.ENEMIES.push(
  { ...MUTANT, id: 'ENEMY-004', carry: null, spawn: { room: 'ROOM-007', x: 900, patrol: [700, 1150], requires: [] } },
  // тоннель под палубой (ROOM-012): затаился в темноте
  { ...MUTANT, id: 'ENEMY-006', carry: null, spawn: { room: 'ROOM-012', x: 1300, patrol: [900, 1550], requires: [] } },
  // гидропоника (ROOM-013): кормится у баков с водорослями
  { ...MUTANT, id: 'ENEMY-007', carry: null, spawn: { room: 'ROOM-013', x: 900, patrol: [500, 1350], requires: [] } },
  { ...MUTANT, id: 'ENEMY-005', carry: null, spawn: { room: 'ROOM-007', x: 1500, patrol: [1350, 1750], requires: [] } },
);

// ENEMY-003 — Колосс: огромный мутант в системе жизнеобеспечения (босс первого акта).
// Броня: удары трубой почти не берут (×0.25), гарпуны — в полную силу.
AB.ENEMIES.push({
  ...MUTANT,
  id: 'ENEMY-003',
  name: 'Колосс',
  type: 'boss',
  asset: 'ASSET-ENEMY003-01',
  scale: 2.15,
  tint: { flesh: '#6f5856', dark: '#2d2324', plate: '#2b3036' },
  hp: 420,
  damage: 28,
  speed: { patrol: 40, investigate: 60, chase: 120, retreat: 0 },
  attack: { range: 120, windup: 0.75, cooldown: 1.4 },
  detection: { sight: 900, behind: 1 },
  armor: { melee: 0.25, ranged: 1 },
  wakeEvent: 'EVENT-009', // после сцены пробуждения при загрузке не засыпает снова
  behavior: { start: 'DORMANT', retreatBelow: 0, retreatTime: 0, loseAfter: 99, investigateTime: 3 },
  carry: null,
  spawn: { room: 'ROOM-009', x: 1250, patrol: [900, 1500], requires: [] },
});

// ENEMY-008 — глубинный хищник (акт II, дополнение №55, черновик): первая тварь снаружи,
// на дне у «Абисса». Пока — фигура мутанта, крупнее и другой окраски.
AB.ENEMIES.push({
  ...MUTANT,
  id: 'ENEMY-008', name: 'Глубинный хищник', type: 'beast', pending: true,
  asset: 'ASSET-ENEMY008-01',
  scale: 1.6,
  tint: { flesh: '#3d5a66', dark: '#14232a', plate: '#2a4a52' },
  hp: 260, damage: 20,
  speed: { patrol: 50, investigate: 80, chase: 150, retreat: 0 },
  attack: { range: 80, windup: 0.6, cooldown: 1.2 },
  detection: { sight: 600, behind: 0.6 },
  behavior: { start: 'PATROL', retreatBelow: 0, retreatTime: 0, loseAfter: 99, investigateTime: 3 },
  carry: null,
  spawn: { room: 'ROOM-019', x: 1200, patrol: [900, 1500], requires: [] },
});

AB.ENEMIES.forEach((e) => AB.ID.register(e.id, e));
