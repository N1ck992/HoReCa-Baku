// =====================================================================
// Сюжетные события (GDD §3). Только утверждённые сюжетом.
// steps — сценарий для STORY EVENT MANAGER; время в секундах.
// =====================================================================

AB.EVENTS = [
  {
    id: 'EVENT-001',
    name: 'Пробуждение',
    chapter: 1,
    room: 'ROOM-001',
    trigger: 'new_game',
    once: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.0, action: 'fade', from: 1, to: 1 },
      { at: 0.0, action: 'place', char: 'CHAR-001', inProp: 'cryopod-main' },
      { at: 1.2, action: 'fade', from: 1, to: 0, duration: 3.0 },
      { at: 2.5, action: 'alarm', on: true },
      { at: 4.0, action: 'prop_state', prop: 'cryopod-main', state: 'opening' },
      { at: 5.6, action: 'play_anim', char: 'CHAR-001', anim: 'wake' },
      { at: 8.8, action: 'unlock_input' },
      { at: 8.8, action: 'hint', text: 'move' },
    ],
  },
];

// EVENT-002 и EVENT-003 утверждены (дополнение №16): спутница появляется после
// восстановления питания — сначала силуэт на пульте, затем встреча в жилом секторе.
AB.EVENTS.push(
  {
    id: 'EVENT-002',
    name: 'Силуэт на пульте',
    chapter: 1,
    room: 'ROOM-003',
    trigger: 'power_on',
    once: true,
    steps: [
      { at: 3.5, action: 'console_ghost', duration: 1.8 },
    ],
  },
  {
    id: 'EVENT-003',
    name: 'Встреча',
    chapter: 1,
    room: 'ROOM-002',
    trigger: 'enter:ROOM-002',
    once: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.0, action: 'spawn', char: 'CHAR-002', room: 'ROOM-002', x: 980, facing: -1 },
      { at: 1.4, action: 'walk_to', char: 'CHAR-002', near: 'CHAR-001', gap: 150, speed: 55 },
      { at: 1.4, action: 'wait_arrive', char: 'CHAR-002' },
      { at: 1.4, action: 'face', char: 'CHAR-001', target: 'CHAR-002' },
      { at: 1.9, action: 'dialog', id: 'DIALOG-001' },
      { at: 1.9, action: 'follow', char: 'CHAR-002', leader: 'CHAR-001' },
      { at: 1.9, action: 'unlock_input' },
    ],
  },
);

// EVENT-004 и EVENT-005 утверждены (дополнение №18): сначала намёк, потом нападение.
AB.EVENTS.push(
  {
    id: 'EVENT-004',
    name: 'Кто-то в темноте',
    chapter: 1,
    room: 'ROOM-005',
    trigger: 'enter:ROOM-005',
    once: true,
    steps: [
      { at: 0.8, action: 'flicker', duration: 2.2 },
      { at: 1.0, action: 'spawn_enemy', enemy: 'ENEMY-002', room: 'ROOM-005', x: 1650, state: 'WATCH', facing: -1 },
      { at: 1.1, action: 'face', char: 'CHAR-002', target: 'ENEMY-002' },
      { at: 2.9, action: 'despawn_enemy', enemy: 'ENEMY-002' },
    ],
  },
  {
    id: 'EVENT-005',
    name: 'Нападение',
    chapter: 1,
    room: 'ROOM-005',
    trigger: 'zone:ROOM-005:1050',   // когда Марк проходит середину склада
    once: true,
    steps: [
      { at: 0.0, action: 'flicker', duration: 1.2 },
      { at: 0.2, action: 'spawn_enemy', enemy: 'ENEMY-002', room: 'ROOM-005', x: 'behind', state: 'APPEAR', facing: 1 },
      { at: 0.4, action: 'flee', char: 'CHAR-002', on: true },
      { at: 0.4, action: 'hint', text: 'protect' },
    ],
  },
);

AB.EVENTS.forEach((e) => AB.ID.register(e.id, e));
