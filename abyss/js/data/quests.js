// =====================================================================
// Задания (GDD §8). Только постоянные данные; ход выполнения хранит QUEST SYSTEM.
// Этапы выполняются по порядку; у этапа может быть несколько целей.
// Цель выполнена, когда выполнено её условие done:
//   { room }                — игрок вошёл в помещение;
//   { equip, state }        — оборудование в нужном состоянии.
// target — куда вести указатель «куда дальше».
// =====================================================================

AB.QUESTS = [
  {
    id: 'QUEST-001',
    name: 'Восстановление энергоснабжения',
    desc: 'Главный генератор корабля остановлен. Нужно запустить его, чтобы вернуть свет и питание.',
    start: { event: 'EVENT-003' },          // после встречи с Мирой (дополнение №37)
    requires: [],
    items: ['ITEM-004', 'ITEM-003', 'ITEM-006'],
    skills: ['repair'],
    rooms: ['ROOM-011', 'ROOM-003'],
    stages: [
      { id: 'door', objectives: [
        { id: 'door', text: 'Открыть генераторную — Мира знает код (дверь в конце коридора)', done: { room: 'ROOM-003' }, target: { room: 'ROOM-011', x: 2530 } },
      ] },
      { id: 'inspect', objectives: [
        { id: 'inspect', text: 'Осмотреть генератор', done: { equip: 'EQUIP-003', state: 'inspected' }, target: { equip: 'EQUIP-003' } },
      ] },
      { id: 'parts', objectives: [
        { id: 'fuse', text: 'Вставить предохранитель в электрощит', done: { equip: 'EQUIP-001', state: 'done' }, target: { equip: 'EQUIP-001' } },
        { id: 'wires', text: 'Подключить провода (гидропоника, под складом)', done: { equip: 'EQUIP-002', state: 'done' }, target: { equip: 'EQUIP-002' } },
        { id: 'fuel', text: 'Залить топливо (канистра на складе)', done: { equip: 'EQUIP-010', state: 'done' }, target: { equip: 'EQUIP-010' } },
      ] },
      { id: 'start', objectives: [
        { id: 'start', text: 'Запустить генератор', done: { equip: 'EQUIP-003', state: 'done' }, target: { equip: 'EQUIP-003' } },
      ] },
    ],
    reward: { power: true },
    next: [],
  },
];

// QUEST-002: довести спутницу до безопасной зоны (дополнение №18)
AB.QUESTS.push({
  id: 'QUEST-002',
  name: 'Безопасная зона',
  desc: 'Добраться вместе с Мирой до командного центра — его можно заблокировать изнутри.',
  start: { event: 'EVENT-005' },          // после нападения преследователя (уже при свете)
  requires: ['QUEST-001'],
  items: [],
  skills: [],
  rooms: ['ROOM-002', 'ROOM-005', 'ROOM-008'],
  stages: [
    { id: 'reach', objectives: [
      { id: 'reach', text: 'Добраться до командного центра вместе с Мирой', done: { room: 'ROOM-008', with: 'CHAR-002' }, target: { room: 'ROOM-005', x: 2030 } },
    ] },
  ],
  reward: {},
  next: [],
});

// QUEST-003: путь к шлюзу — финал первого акта (дополнение №20)
AB.QUESTS.push({
  id: 'QUEST-003',
  name: 'Путь к шлюзу',
  desc: 'Добраться до шлюза с экзокостюмами: найти оружие, пройти лабораторию и победить Колосса.',
  start: { event: 'EVENT-007' },
  requires: ['QUEST-002'],
  items: ['ITEM-011'],
  skills: [],
  rooms: ['ROOM-007', 'ROOM-006', 'ROOM-009', 'ROOM-010'],
  stages: [
    { id: 'gun', objectives: [
      { id: 'gun', text: 'Найти оружие в оружейной', done: { weapon: 'ITEM-011' }, target: { room: 'ROOM-006', x: 640 } },
    ] },
    { id: 'boss', objectives: [
      { id: 'boss', text: 'Победить Колосса', done: { enemyDead: 'ENEMY-003' }, target: { room: 'ROOM-009', x: 1250 } },
    ] },
    { id: 'power', objectives: [
      { id: 'power', text: 'Запустить основное питание (нужен инженер)', done: { equip: 'EQUIP-006', state: 'done' }, target: { equip: 'EQUIP-006' } },
    ] },
    { id: 'cams', objectives: [
      { id: 'cams', text: 'Включить внешние камеры в шлюзе', done: { equip: 'EQUIP-007', state: 'done' }, target: { equip: 'EQUIP-007' } },
    ] },
    { id: 'suit', objectives: [
      { id: 'suit', text: 'Осмотреть экзокостюм в шлюзе', done: { equip: 'EQUIP-005', state: 'inspected' }, target: { equip: 'EQUIP-005' } },
    ] },
  ],
  reward: {},
  next: [],
});

// QUEST-004: голос в темноте — найти выжившую до ремонта генератора (дополнение №37)
AB.QUESTS.push({
  id: 'QUEST-004',
  name: 'Голос в темноте',
  desc: 'Откуда-то снизу доносится стук. На корабле есть кто-то живой.',
  start: { room: 'ROOM-011' },
  requires: [],
  items: ['ITEM-009'],
  skills: ['repair'],
  rooms: ['ROOM-011', 'ROOM-012', 'ROOM-002'],
  stages: [
    { id: 'find', objectives: [
      { id: 'find', text: 'Найти, откуда стук (люк в полу коридора — нужен рычаг)', done: { room: 'ROOM-002' }, target: { room: 'ROOM-011', x: 1150 } },
    ] },
    { id: 'open', objectives: [
      { id: 'open', text: 'Вскрыть заклинившую каюту', done: { equip: 'EQUIP-008', state: 'done' }, target: { equip: 'EQUIP-008' } },
    ] },
  ],
  reward: {},
  next: ['QUEST-001'],
});

AB.QUESTS.forEach((q) => AB.ID.register(q.id, q));
