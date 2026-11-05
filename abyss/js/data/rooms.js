// =====================================================================
// Помещения (GDD §6). Каждое помещение: ID, название, описание, связи,
// условия доступа, предметы, противники, оборудование, события, состояние.
//
// Геометрия и реквизит — только для отрисовки; логика их не читает.
// Координаты: x — по длине помещения, пол на y = 0, вверх — отрицательный y.
// =====================================================================

AB.ROOMS = [
  {
    id: 'ROOM-001',
    name: 'Медицинский отсек',
    desc: 'Отсек с аварийными криокапсулами. Основное питание отключено.',
    width: 1500,
    height: 420,
    background: 'ASSET-ROOM001-01',
    theme: 'medbay',
    connections: [{ door: 'east', to: 'ROOM-TMP-001', toDoor: 'west' }],
    access: { type: 'open' },
    items: [],        // этап 4
    enemies: [],      // этап 5
    equipment: [],    // этап 6+
    events: ['EVENT-001'],
    state: 'emergency_power',
    spawn: { x: 230 },
    doors: [
      { key: 'east', x: 1430, to: 'ROOM-TMP-001', access: { type: 'open' } },
    ],
    props: [
      { kind: 'cryopod', x: 230, asset: 'ASSET-ROOM001-02', main: true },
      { kind: 'cryopod', x: 420, asset: 'ASSET-ROOM001-02', broken: true },
      { kind: 'cryopod', x: 600, asset: 'ASSET-ROOM001-02', empty: true },
      { kind: 'monitor', x: 790, y: -250, asset: 'ASSET-ROOM001-04' },
      { kind: 'medbed', x: 960, asset: 'ASSET-ROOM001-03' },
      { kind: 'cabinet', x: 1200, asset: 'ASSET-ROOM001-05' },
    ],
    lights: [
      { x: 330, y: -380, color: [255, 40, 30], radius: 420, flicker: 0.15 },
      { x: 1050, y: -380, color: [255, 40, 30], radius: 420, flicker: 0.4 },
      { x: 230, y: -160, color: [80, 200, 255], radius: 200, flicker: 0.05, source: 'pod' },
      { x: 790, y: -250, color: [90, 255, 200], radius: 160, flicker: 0.25, source: 'monitor' },
    ],
    fx: { steam: [520, 1310], sparks: [], drips: [700, 1120] },
  },
  {
    id: 'ROOM-TMP-001',
    temp: true,       // временный ID: в GDD v0.1 коридора нет в списке помещений
    name: 'Коридор',
    desc: 'Первый коридор за медицинским отсеком. Аварийное освещение.',
    width: 2600,
    height: 340,
    background: 'ASSET-ROOMTMP001-01',
    theme: 'corridor',
    connections: [{ door: 'west', to: 'ROOM-001', toDoor: 'east' }],
    access: { type: 'open' },
    items: [],
    enemies: [],
    equipment: [],
    events: [],
    state: 'emergency_power',
    spawn: { x: 120 },
    doors: [
      { key: 'west', x: 70, to: 'ROOM-001', access: { type: 'open' } },
      // Куда ведёт эта дверь, в GDD не указано: пока она обесточена.
      { key: 'east', x: 2530, to: null, access: { type: 'locked', reason: 'Дверь обесточена' } },
    ],
    props: [],
    lights: [
      { x: 300, y: -320, color: [255, 40, 30], radius: 380, flicker: 0.1 },
      { x: 900, y: -320, color: [255, 40, 30], radius: 380, flicker: 0.6, broken: true },
      { x: 1500, y: -320, color: [255, 40, 30], radius: 380, flicker: 0.15 },
      { x: 2150, y: -320, color: [255, 40, 30], radius: 380, flicker: 0.3 },
    ],
    fx: { steam: [640, 1780], sparks: [900], drips: [1250, 2000] },
  },
];

// Остальные помещения из GDD §6: зарегистрированы, но ещё не построены.
const ROOM_STUBS = [
  ['ROOM-002', 'Жилой сектор'],
  ['ROOM-003', 'Энергетический отсек'],
  ['ROOM-004', 'Инженерная мастерская'],
  ['ROOM-005', 'Склад'],
  ['ROOM-006', 'Оружейная'],
  ['ROOM-007', 'Лаборатория'],
  ['ROOM-008', 'Командный центр'],
  ['ROOM-009', 'Система жизнеобеспечения'],
  ['ROOM-010', 'Шлюз'],
];

AB.ROOMS.forEach((r) => AB.ID.register(r.id, r));
ROOM_STUBS.forEach(([id, name]) => AB.ID.register(id, { name, stub: true, connections: [], access: { type: 'locked' } }));
