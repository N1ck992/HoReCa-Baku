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

AB.EVENTS.forEach((e) => AB.ID.register(e.id, e));
