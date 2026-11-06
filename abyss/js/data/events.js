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

// Развязка первого акта (дополнение №20): мостик и врач, иллюминатор, лаборатория,
// Колосс, шлюз и экзокостюм.
AB.EVENTS.push(
  {
    // канон (docs/STORY.md §5, §7): врач добра к Марку, но видит, кто рядом с ним, —
    // предупреждает и стреляет в спутницу транквилизатором. Марк считает это нападением.
    id: 'EVENT-006', name: 'Судовой врач', chapter: 1, room: 'ROOM-008',
    trigger: 'enter:ROOM-008', once: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.0, action: 'spawn', char: 'CHAR-003', room: 'ROOM-008', x: 1150, facing: -1 },
      { at: 0.9, action: 'walk_to', char: 'CHAR-003', near: 'CHAR-001', gap: 190, speed: 70 },
      { at: 0.9, action: 'wait_arrive', char: 'CHAR-003' },
      { at: 0.9, action: 'face', char: 'CHAR-001', target: 'CHAR-003' },
      { at: 0.9, action: 'face', char: 'CHAR-002', target: 'CHAR-003' },
      { at: 1.2, action: 'dialog', id: 'DIALOG-002' },
      { at: 1.3, action: 'give_item', char: 'CHAR-001', item: 'ITEM-005', qty: 1 },
      { at: 1.6, action: 'face', char: 'CHAR-003', target: 'CHAR-002' },
      // врач смотрит на спутницу — и мы на миг видим то, что видит она
      { at: 1.9, action: 'true_form', char: 'CHAR-002', duration: 0.9 },
      { at: 3.1, action: 'dialog', id: 'DIALOG-007' },
      { at: 3.3, action: 'true_form', char: 'CHAR-002', duration: 0.35 },
      { at: 3.5, action: 'tranq', from: 'CHAR-003', to: 'CHAR-002' },
      { at: 3.9, action: 'down', char: 'CHAR-002', on: true },
      { at: 5.1, action: 'dialog', id: 'DIALOG-006' },
      { at: 5.2, action: 'walk_to', char: 'CHAR-003', x: 1420, speed: 120 },
      { at: 5.2, action: 'wait_arrive', char: 'CHAR-003' },
      { at: 5.3, action: 'leave', char: 'CHAR-003' },
    ],
  },
  {
    id: 'EVENT-007', name: 'Она очнулась', chapter: 1, room: 'ROOM-008',
    trigger: 'after:EVENT-006', once: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.6, action: 'down', char: 'CHAR-002', on: false },
      { at: 1.4, action: 'face', char: 'CHAR-001', target: 'CHAR-002' },
      { at: 1.5, action: 'dialog', id: 'DIALOG-005' },
      { at: 1.5, action: 'unlock_input' },
    ],
  },
  {
    id: 'EVENT-008', name: 'Тень за стеклом', chapter: 1, room: 'ROOM-007',
    trigger: 'zone:ROOM-007:700', once: true,
    steps: [
      { at: 0.0, action: 'flicker', duration: 1.6 },
      { at: 0.2, action: 'spawn_enemy', enemy: 'ENEMY-002', room: 'ROOM-007', x: 1250, state: 'WATCH', facing: -1 },
      { at: 1.8, action: 'despawn_enemy', enemy: 'ENEMY-002' },
    ],
  },
  {
    id: 'EVENT-009', name: 'Колосс', chapter: 1, room: 'ROOM-009',
    trigger: 'zone:ROOM-009:600', once: true,
    steps: [
      { at: 0.0, action: 'flicker', duration: 2.0 },
      { at: 0.0, action: 'shake', power: 6, duration: 1.6 },
      { at: 0.4, action: 'flee', char: 'CHAR-002', on: true },
      { at: 0.6, action: 'enemy_state', enemy: 'ENEMY-003', state: 'ALERT' },
      { at: 0.8, action: 'hint', text: 'boss' },
    ],
  },
  {
    id: 'EVENT-011', name: 'Основное питание', chapter: 1, room: 'ROOM-009',
    trigger: 'equip:EQUIP-006', once: true,
    steps: [
      { at: 0.0, action: 'flicker', duration: 1.4 },
      { at: 0.0, action: 'shake', power: 3, duration: 1.2 },
    ],
  },
  {
    // первый большой поворот (docs/STORY.md §9): внешние камеры — корабль на дне океана
    id: 'EVENT-012', name: 'Внешние камеры', chapter: 1, room: 'ROOM-010',
    trigger: 'equip:EQUIP-007', once: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.3, action: 'window', open: true },
      { at: 2.0, action: 'leviathan' },
      { at: 4.6, action: 'dialog', id: 'DIALOG-003' },
      { at: 4.6, action: 'unlock_input' },
    ],
  },
  {
    id: 'EVENT-010', name: 'Экзокостюм', chapter: 1, room: 'ROOM-010',
    trigger: 'equip:EQUIP-005', once: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.6, action: 'dialog', id: 'DIALOG-004' },
      { at: 0.8, action: 'fade', from: 0, to: 1, duration: 2.5 },
      { at: 3.6, action: 'act_end', act: 1 },
    ],
  },
);

AB.EVENTS.forEach((e) => AB.ID.register(e.id, e));
