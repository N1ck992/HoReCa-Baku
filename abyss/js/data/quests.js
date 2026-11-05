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
    start: { room: 'ROOM-011' },            // начинается при входе в коридор
    requires: [],
    items: ['ITEM-010', 'ITEM-004', 'ITEM-003'],
    skills: ['repair'],
    rooms: ['ROOM-011', 'ROOM-003'],
    stages: [
      { id: 'door', objectives: [
        { id: 'door', text: 'Открыть дверь в конце коридора', done: { room: 'ROOM-003' }, target: { room: 'ROOM-011', x: 2530 } },
      ] },
      { id: 'inspect', objectives: [
        { id: 'inspect', text: 'Осмотреть генератор', done: { equip: 'EQUIP-003', state: 'inspected' }, target: { equip: 'EQUIP-003' } },
      ] },
      { id: 'parts', objectives: [
        { id: 'fuse', text: 'Вставить предохранитель в электрощит', done: { equip: 'EQUIP-001', state: 'done' }, target: { equip: 'EQUIP-001' } },
        { id: 'wires', text: 'Подключить провода к кабельному узлу', done: { equip: 'EQUIP-002', state: 'done' }, target: { equip: 'EQUIP-002' } },
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
  desc: 'Добраться вместе со спутницей до командного центра — его можно заблокировать изнутри.',
  start: { event: 'EVENT-003' },
  requires: ['QUEST-001'],
  items: [],
  skills: [],
  rooms: ['ROOM-002', 'ROOM-005', 'ROOM-008'],
  stages: [
    { id: 'reach', objectives: [
      { id: 'reach', text: 'Добраться до командного центра вместе со спутницей', done: { room: 'ROOM-008', with: 'CHAR-002' }, target: { room: 'ROOM-005', x: 2030 } },
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
    { id: 'suit', objectives: [
      { id: 'suit', text: 'Осмотреть экзокостюм в шлюзе', done: { equip: 'EQUIP-005', state: 'inspected' }, target: { equip: 'EQUIP-005' } },
    ] },
  ],
  reward: {},
  next: [],
});

AB.QUESTS.forEach((q) => AB.ID.register(q.id, q));
