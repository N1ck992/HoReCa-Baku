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

AB.EVENTS.forEach((e) => AB.ID.register(e.id, e));
