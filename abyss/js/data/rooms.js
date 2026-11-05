// =====================================================================
// Помещения (GDD §6). Каждое помещение: ID, название, описание, связи,
// условия доступа, предметы, противники, оборудование, события, состояние.
//
// Геометрия и реквизит — только для отрисовки; логика их не читает.
// Координаты: x — по длине помещения, пол на y = 0, вверх — отрицательный y.
//
// items      — предметы на полу: { key, item, qty, x }
// containers — что можно обыскать: { key, x, prop, label, loot: [[ITEM, qty]] }
// key — постоянный ключ внутри помещения (для сохранений, не менять).
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
    connections: [{ door: 'east', to: 'ROOM-011', toDoor: 'west' }],
    access: { type: 'open' },
    items: [
      { key: 'scrap-pod', item: 'ITEM-001', qty: 2, x: 470 },
    ],
    map: { x: 0, y: 0, w: 150, h: 46 },   // положение на карте корабля
    containers: [
      { key: 'cabinet', x: 1200, prop: 'cabinet', label: 'Медицинский шкаф', loot: [['ITEM-005', 2], ['ITEM-003', 1]] },
    ],
    enemies: [],      // этап 5
    equipment: [],    // этап 6+
    events: ['EVENT-001'],
    state: 'emergency_power',
    spawn: { x: 230 },
    doors: [
      { key: 'east', x: 1430, to: 'ROOM-011', access: { type: 'open' } },
    ],
    props: [
      { kind: 'cryopod', x: 230, asset: 'ASSET-ROOM001-02', main: true },
      { kind: 'cryopod', x: 420, asset: 'ASSET-ROOM001-02', broken: true },
      { kind: 'cryopod', x: 600, asset: 'ASSET-ROOM001-02', empty: true },
      { kind: 'monitor', x: 790, y: -250, asset: 'ASSET-ROOM001-04' },
      { kind: 'medbed', x: 960, asset: 'ASSET-ROOM001-03' },
      { kind: 'cabinet', x: 1200, asset: 'ASSET-ROOM001-05', container: 'cabinet' },
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
    id: 'ROOM-011',
    name: 'Коридор',
    desc: 'Первый коридор за медицинским отсеком. Аварийное освещение.',
    width: 2600,
    height: 340,
    background: 'ASSET-ROOM011-01',
    theme: 'corridor',
    connections: [{ door: 'west', to: 'ROOM-001', toDoor: 'east' }, { door: 'east', to: 'ROOM-003', toDoor: 'west' }],
    access: { type: 'open' },
    map: { x: 150, y: 8, w: 260, h: 30 },
    items: [
      { key: 'pipe', item: 'ITEM-009', qty: 1, x: 560 },
      { key: 'fuse-lamp', item: 'ITEM-004', qty: 1, x: 960 },
      { key: 'scrap-mid', item: 'ITEM-001', qty: 1, x: 1620 },
      { key: 'parts-end', item: 'ITEM-002', qty: 1, x: 2280 },
    ],
    containers: [],
    enemies: ['ENEMY-001'],
    equipment: [],
    events: [],
    state: 'emergency_power',
    spawn: { x: 120 },
    doors: [
      { key: 'west', x: 70, to: 'ROOM-001', access: { type: 'open' } },
      // Дверь в энергетический отсек открывается ключ-картой, которую несёт мутант (ENEMY-001)
      { key: 'east', x: 2530, to: 'ROOM-003', access: { type: 'key', item: 'ITEM-010', reason: 'Нужна ключ-карта' } },
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

// ROOM-003 — энергетический отсек (этап 6, QUEST-001). Фон — концепт-арт
// (assets/rooms/ROOM003-01.jpg): оборудование и двери нарисованы на нём, игра накладывает
// поверх только эффекты. Высота картинки 410 единиц (дверь ≈ 2 роста Марка),
// 1 px картинки = 0,5663 единицы; координаты сняты с картинки.
AB.ROOMS.push({
  id: 'ROOM-003',
  name: 'Энергетический отсек',
  desc: 'Машинный зал с главным генератором корабля. Генератор остановлен, работает аварийное освещение.',
  width: 1230,
  height: 420,
  background: 'ASSET-ROOM003-01',
  bgFloor: 0.85,          // доля высоты картинки, где стоят персонажи
  bgHeight: 410,          // высота картинки в единицах мира; над ней — продолжение потолка
  artDoors: true,         // двери нарисованы на фоне
  theme: 'power',
  map: { x: 410, y: 0, w: 150, h: 46 },
  connections: [{ door: 'west', to: 'ROOM-011', toDoor: 'east' }, { door: 'east', to: 'ROOM-002', toDoor: 'west' }],
  access: { type: 'key', item: 'ITEM-010' },
  items: [],
  containers: [],
  enemies: [],
  equipment: ['EQUIP-001', 'EQUIP-002', 'EQUIP-003', 'EQUIP-004'],
  events: [],
  state: 'emergency_power',
  spawn: { x: 116 },
  doors: [
    { key: 'west', x: 54, to: 'ROOM-011', access: { type: 'open' } },
    // в жилой сектор: дверь оживает, когда есть питание (после QUEST-001)
    { key: 'east', x: 1163, to: 'ROOM-002', access: { type: 'power', reason: 'Нет питания' } },
  ],
  props: [],
  lights: [
    { x: 268, y: -276, color: [255, 40, 30], radius: 400, flicker: 0.15 },
    { x: 614, y: -276, color: [255, 40, 30], radius: 440, flicker: 0.25 },
    { x: 974, y: -276, color: [255, 40, 30], radius: 400, flicker: 0.45 },
  ],
  fx: { steam: [611], sparks: [], drips: [347, 925] },
});

// ROOM-002 — жилой сектор. Здесь Марк встречает спутницу (EVENT-003).
// Графики пока нет — рисуется заглушкой. Дальний конец отсека тёмный: свет там не горит.
AB.ROOMS.push({
  id: 'ROOM-002',
  name: 'Жилой сектор',
  desc: 'Каюты экипажа. Свет горит только у входа, дальше темнота.',
  width: 1900,
  height: 360,
  background: 'ASSET-ROOM002-01',
  theme: 'living',
  map: { x: 570, y: 6, w: 190, h: 34 },
  connections: [{ door: 'west', to: 'ROOM-003', toDoor: 'east' }, { door: 'east', to: 'ROOM-005', toDoor: 'west' }],
  access: { type: 'open' },
  items: [],
  containers: [],
  enemies: [],
  equipment: [],
  events: ['EVENT-003'],
  state: 'dark',
  spawn: { x: 140 },
  doors: [
    { key: 'west', x: 70, to: 'ROOM-003', access: { type: 'open' } },
    // открывается после встречи со спутницей (EVENT-003)
    { key: 'east', x: 1830, to: 'ROOM-005', access: { type: 'event', event: 'EVENT-003', reason: 'Заблокировано' } },
  ],
  props: [
    { kind: 'bunk', x: 420 }, { kind: 'locker', x: 560 },
    { kind: 'bunk', x: 820 }, { kind: 'locker', x: 960 },
    { kind: 'bunk', x: 1220 }, { kind: 'bunk', x: 1560 },
  ],
  lights: [
    { x: 260, y: -330, color: [255, 40, 30], radius: 380, flicker: 0.12 },
    { x: 760, y: -330, color: [255, 40, 30], radius: 300, flicker: 0.7, broken: true },
  ],
  fx: { steam: [1100], sparks: [760], drips: [600, 1400] },
});

// ROOM-005 — склад. Здесь преследователь впервые показывается (EVENT-004)
// и нападает (EVENT-005). Графики пока нет — заглушка.
AB.ROOMS.push({
  id: 'ROOM-005',
  name: 'Склад',
  desc: 'Длинный складской отсек: стеллажи, контейнеры, погрузочные тележки.',
  width: 2100,
  height: 380,
  background: 'ASSET-ROOM005-01',
  theme: 'storage',
  map: { x: 770, y: 4, w: 210, h: 38 },
  connections: [{ door: 'west', to: 'ROOM-002', toDoor: 'east' }, { door: 'east', to: 'ROOM-008', toDoor: 'west' }],
  access: { type: 'open' },
  items: [], containers: [], enemies: [], equipment: [],
  events: ['EVENT-004', 'EVENT-005'],
  state: 'damaged',
  spawn: { x: 140 },
  doors: [
    { key: 'west', x: 70, to: 'ROOM-002', access: { type: 'open' } },
    { key: 'east', x: 2030, to: 'ROOM-008', access: { type: 'open' } },
  ],
  props: [
    { kind: 'crates', x: 380 }, { kind: 'locker', x: 640 }, { kind: 'crates', x: 900 },
    { kind: 'crates', x: 1260 }, { kind: 'locker', x: 1480 }, { kind: 'crates', x: 1720 },
  ],
  lights: [
    { x: 260, y: -350, color: [255, 40, 30], radius: 380, flicker: 0.2 },
    { x: 1000, y: -350, color: [255, 40, 30], radius: 380, flicker: 0.5, broken: true },
    { x: 1700, y: -350, color: [255, 40, 30], radius: 380, flicker: 0.2 },
  ],
  fx: { steam: [820, 1560], sparks: [1000], drips: [500, 1300, 1900] },
});

// ROOM-008 — командный центр: безопасная зона. Здесь будут медик (CHAR-003)
// и иллюминатор, за которым откроется океан. Графики пока нет — заглушка.
AB.ROOMS.push({
  id: 'ROOM-008',
  name: 'Командный центр',
  desc: 'Мостик корабля. Переборки можно заблокировать изнутри.',
  width: 1500,
  height: 420,
  background: 'ASSET-ROOM008-01',
  theme: 'bridge',
  safe: true,                     // безопасная зона: преследователь сюда не проходит
  map: { x: 980, y: -6, w: 170, h: 58 },
  connections: [{ door: 'west', to: 'ROOM-005', toDoor: 'east' }],
  access: { type: 'open' },
  items: [], containers: [], enemies: [], equipment: [],
  events: [],
  state: 'safe',
  spawn: { x: 140 },
  doors: [
    { key: 'west', x: 70, to: 'ROOM-005', access: { type: 'open' } },
  ],
  props: [
    { kind: 'console', x: 520 }, { kind: 'console', x: 760 }, { kind: 'console', x: 1000 },
  ],
  lights: [
    { x: 300, y: -380, color: [255, 40, 30], radius: 420, flicker: 0.05 },
    { x: 800, y: -380, color: [255, 40, 30], radius: 460, flicker: 0.05 },
    { x: 1250, y: -380, color: [255, 40, 30], radius: 420, flicker: 0.05 },
  ],
  fx: { steam: [], sparks: [], drips: [] },
});

// Остальные помещения из GDD §6: зарегистрированы, но ещё не построены.
const ROOM_STUBS = [
  ['ROOM-004', 'Инженерная мастерская'],
  ['ROOM-006', 'Оружейная'],
  ['ROOM-007', 'Лаборатория'],
  ['ROOM-009', 'Система жизнеобеспечения'],
  ['ROOM-010', 'Шлюз'],
];

AB.ROOMS.forEach((r) => AB.ID.register(r.id, r));
ROOM_STUBS.forEach(([id, name]) => AB.ID.register(id, { name, stub: true, connections: [], access: { type: 'locked' } }));
