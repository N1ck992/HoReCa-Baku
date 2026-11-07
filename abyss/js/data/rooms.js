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
    bgFloor: 0.94, bgHeight: 392, bgTile: true,   // фон из картинки: пол на 94% высоты, плитка с зеркалом
    theme: 'medbay',
    connections: [{ door: 'east', to: 'ROOM-011', toDoor: 'west' }],
    access: { type: 'open' },
    items: [
      { key: 'scrap-pod', item: 'ITEM-001', qty: 2, x: 470 },
    ],
    map: { x: 0, y: 0, w: 150, h: 46 },   // положение на карте корабля
    containers: [
      { key: 'cabinet', x: 1200, prop: 'cabinet', label: 'Медицинский шкаф', loot: [['ITEM-005', 2]] },
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
    bgFloor: 0.9, bgHeight: 445, bgTile: true,
    theme: 'corridor',
    connections: [{ door: 'west', to: 'ROOM-001', toDoor: 'east' }, { door: 'east', to: 'ROOM-003', toDoor: 'west' }, { door: 'hatch', to: 'ROOM-012', toDoor: 'up-west' }],
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
      // Дверь в генераторную — кодовый замок; код знает Мира (дополнение №37)
      { key: 'east', x: 2530, to: 'ROOM-003', access: { type: 'event', event: 'EVENT-003', reason: 'Кодовый замок: нужен код доступа' } },
      // люк в полу: технический тоннель под палубой (дополнение №35)
      { key: 'hatch', kind: 'hatch', x: 1150, to: 'ROOM-012', access: { type: 'key', item: 'ITEM-009', reason: 'Люк заклинило: нужен рычаг — что-нибудь тяжёлое', lever: true } },
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
  equipment: ['EQUIP-001', 'EQUIP-010', 'EQUIP-002', 'EQUIP-003', 'EQUIP-004'],
  events: [],
  state: 'emergency_power',
  spawn: { x: 116 },
  doors: [
    { key: 'west', x: 54, to: 'ROOM-011', access: { type: 'open' } },
    // в жилой сектор: дверь оживает, когда есть питание (после QUEST-001)
    { key: 'east', x: 1163, to: 'ROOM-002', access: { type: 'power', reason: 'Нет питания' } },
  ],
  props: [{ kind: 'fueltank', x: 372, equip: 'EQUIP-010' }],
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
    bgFloor: 0.9, bgHeight: 400, bgTile: true,
  theme: 'living',
  map: { x: 570, y: 6, w: 190, h: 34 },
  connections: [{ door: 'west', to: 'ROOM-003', toDoor: 'east' }, { door: 'east', to: 'ROOM-005', toDoor: 'west' }, { door: 'hatch', to: 'ROOM-012', toDoor: 'up-east' }],
  access: { type: 'open' },
  items: [],
  containers: [],
  enemies: [],
  equipment: ['EQUIP-008'],
  events: ['EVENT-014', 'EVENT-003'],
  state: 'dark',
  spawn: { x: 140 },
  doors: [
    { key: 'west', x: 70, to: 'ROOM-003', access: { type: 'power', reason: 'Дверь обесточена' } },
    // открывается после встречи с Мирой (EVENT-003)
    { key: 'east', x: 1830, to: 'ROOM-005', access: { type: 'event', event: 'EVENT-003', reason: 'Заблокировано' } },
    // люк в полу в технический тоннель (ROOM-012)
    { key: 'hatch', kind: 'hatch', x: 1690, to: 'ROOM-012', access: { type: 'open' } },
  ],
  props: [
    { kind: 'bunk', x: 420, assetSlot: 'ASSET-ROOM002-02' }, { kind: 'locker', x: 560 },
    { kind: 'bunk', x: 820, assetSlot: 'ASSET-ROOM002-02' }, { kind: 'locker', x: 960 },
    { kind: 'cabindoor', x: 1100, equip: 'EQUIP-008' },
    { kind: 'bunk', x: 1290, assetSlot: 'ASSET-ROOM002-02' }, { kind: 'bunk', x: 1560, assetSlot: 'ASSET-ROOM002-02' },
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
  connections: [{ door: 'west', to: 'ROOM-002', toDoor: 'east' }, { door: 'east', to: 'ROOM-008', toDoor: 'west' }, { door: 'hatch', to: 'ROOM-013', toDoor: 'up' }],
  access: { type: 'open' },
  items: [{ key: 'fuel', item: 'ITEM-006', qty: 1, x: 1100 }], containers: [], enemies: [], equipment: [],
  events: ['EVENT-004', 'EVENT-005'],
  state: 'damaged',
  spawn: { x: 140 },
  doors: [
    { key: 'west', x: 70, to: 'ROOM-002', access: { type: 'open' } },
    { key: 'east', x: 2030, to: 'ROOM-008', access: { type: 'power', reason: 'Переборка обесточена' } },
    // грузовой люк вниз — гидропоника (ROOM-013)
    { key: 'hatch', kind: 'hatch', x: 1880, to: 'ROOM-013', access: { type: 'open' } },
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
  connections: [{ door: 'west', to: 'ROOM-005', toDoor: 'east' }, { door: 'east', to: 'ROOM-007', toDoor: 'west' }],
  access: { type: 'open' },
  items: [], containers: [], enemies: [], equipment: [],
  events: ['EVENT-006', 'EVENT-007'],
  state: 'safe',
  spawn: { x: 140 },
  doors: [
    { key: 'west', x: 70, to: 'ROOM-005', access: { type: 'open' } },
    // дальше — лаборатория; открывается после разговора с доктором
    { key: 'east', x: 1430, to: 'ROOM-007', access: { type: 'event', event: 'EVENT-007', reason: 'Заблокировано изнутри' } },
  ],
  props: [
    { kind: 'window', x: 760, w: 760 },
    { kind: 'console', x: 470 }, { kind: 'console', x: 760 }, { kind: 'console', x: 1050 },
  ],
  lights: [
    { x: 300, y: -380, color: [255, 40, 30], radius: 420, flicker: 0.05 },
    { x: 800, y: -380, color: [255, 40, 30], radius: 460, flicker: 0.05 },
    { x: 1250, y: -380, color: [255, 40, 30], radius: 420, flicker: 0.05 },
  ],
  fx: { steam: [], sparks: [], drips: [] },
});

// ---- Путь к шлюзу (QUEST-003): лаборатория → оружейная → жизнеобеспечение → шлюз ----
AB.ROOMS.push(
  {
    id: 'ROOM-007', name: 'Лаборатория',
    desc: 'Исследовательская лаборатория: разбитые резервуары, следы гнезда.',
    width: 2000, height: 380, background: 'ASSET-ROOM007-01', theme: 'lab',
    map: { x: 1160, y: 4, w: 200, h: 38 },
    connections: [{ door: 'west', to: 'ROOM-008', toDoor: 'east' }, { door: 'east', to: 'ROOM-006', toDoor: 'west' }],
    access: { type: 'open' },
    items: [{ key: 'meds-lab', item: 'ITEM-005', qty: 1, x: 1880 }],
    containers: [], enemies: ['ENEMY-004', 'ENEMY-005'], equipment: [],
    events: ['EVENT-008'], state: 'infested', spawn: { x: 140 },
    doors: [
      { key: 'west', x: 70, to: 'ROOM-008', access: { type: 'open' } },
      { key: 'east', x: 1930, to: 'ROOM-006', access: { type: 'open' } },
    ],
    props: [
      { kind: 'tank', x: 420, broken: true }, { kind: 'table', x: 640 }, { kind: 'tank', x: 860 },
      { kind: 'glass', x: 1250, w: 200 }, { kind: 'tank', x: 1600, broken: true }, { kind: 'table', x: 1780 },
    ],
    lights: [
      { x: 300, y: -350, color: [255, 40, 30], radius: 360, flicker: 0.2 },
      { x: 1000, y: -350, color: [255, 40, 30], radius: 360, flicker: 0.55, broken: true },
      { x: 1700, y: -350, color: [255, 40, 30], radius: 360, flicker: 0.2 },
      { x: 860, y: -150, color: [110, 255, 160], radius: 170, flicker: 0.1, source: 'tank' },
    ],
    fx: { steam: [600, 1400], sparks: [1000], drips: [450, 1200, 1650] },
  },
  {
    id: 'ROOM-006', name: 'Оружейная',
    desc: 'Склад снаряжения охраны и исследовательского оборудования.',
    width: 1200, height: 360, background: 'ASSET-ROOM006-01', theme: 'armory',
    map: { x: 1360, y: 10, w: 120, h: 26 },
    connections: [{ door: 'west', to: 'ROOM-007', toDoor: 'east' }, { door: 'east', to: 'ROOM-009', toDoor: 'west' }],
    access: { type: 'open' },
    items: [],
    containers: [
      { key: 'gun-locker', x: 640, prop: 'cabinet', label: 'Шкаф с оружием', loot: [['ITEM-011', 1]] },
    ],
    enemies: [], equipment: [], events: [], state: 'sealed', spawn: { x: 140 },
    doors: [
      { key: 'west', x: 70, to: 'ROOM-007', access: { type: 'open' } },
      { key: 'east', x: 1130, to: 'ROOM-009', access: { type: 'open' } },
    ],
    props: [
      { kind: 'rack', x: 380 }, { kind: 'cabinet', x: 640, asset: 'ASSET-ROOM006-02', assetOpen: 'ASSET-ROOM006-03', h: 200, container: 'gun-locker' }, { kind: 'rack', x: 880 },
    ],
    lights: [{ x: 600, y: -330, color: [255, 40, 30], radius: 420, flicker: 0.05 }],
    fx: { steam: [], sparks: [], drips: [300] },
  },
  {
    id: 'ROOM-009', name: 'Система жизнеобеспечения',
    desc: 'Затопленный зал с резервуарами. Здесь логово Колосса.',
    width: 2000, height: 440, background: 'ASSET-ROOM009-01', theme: 'lifesupport',
    map: { x: 1480, y: -6, w: 200, h: 58 },
    connections: [{ door: 'west', to: 'ROOM-006', toDoor: 'east' }, { door: 'east', to: 'ROOM-010', toDoor: 'west' }],
    access: { type: 'open' },
    items: [{ key: 'meds-ls', item: 'ITEM-005', qty: 1, x: 420 }],
    containers: [], enemies: ['ENEMY-003'], equipment: ['EQUIP-006'],
    events: ['EVENT-009'], state: 'flooded', spawn: { x: 140 },
    doors: [
      { key: 'west', x: 70, to: 'ROOM-006', access: { type: 'open' } },
      // проход в шлюз перекрыт, пока жив Колосс
      { key: 'east', x: 1930, to: 'ROOM-010', access: { type: 'enemy', enemy: 'ENEMY-003', reason: 'Проход перекрыт: дорогу держит Колосс' } },
    ],
    props: [
      { kind: 'bigtank', x: 640 }, { kind: 'powerpanel', x: 945, equip: 'EQUIP-006' }, { kind: 'bigtank', x: 1250, broken: true }, { kind: 'bigtank', x: 1700 },
    ],
    lights: [
      { x: 350, y: -400, color: [255, 40, 30], radius: 420, flicker: 0.15 },
      { x: 1000, y: -400, color: [255, 40, 30], radius: 460, flicker: 0.3 },
      { x: 1650, y: -400, color: [255, 40, 30], radius: 420, flicker: 0.15 },
    ],
    fx: { steam: [500, 1000, 1500], sparks: [], drips: [300, 800, 1300, 1800] },
  },
  {
    id: 'ROOM-010', name: 'Шлюз',
    desc: 'Шлюзовая камера с глубоководными экзокостюмами. Отсюда можно выйти на дно.',
    width: 1500, height: 420, background: 'ASSET-ROOM010-01', theme: 'airlock',
    map: { x: 1690, y: 0, w: 150, h: 46 },
    connections: [{ door: 'west', to: 'ROOM-009', toDoor: 'east' }],
    access: { type: 'open' },
    items: [], containers: [], enemies: [], equipment: ['EQUIP-007', 'EQUIP-005'],
    events: ['EVENT-010'], state: 'ready', spawn: { x: 140 },
    doors: [
      { key: 'west', x: 70, to: 'ROOM-009', access: { type: 'open' } },
      { key: 'east', x: 1430, to: null, art: 'ASSET-ROOM010-03', access: { type: 'locked', reason: 'Внешний люк: только в экзокостюме' } },
    ],
    props: [
      // пульт и экран внешних камер (EQUIP-007, EVENT-012)
      { kind: 'window', x: 245, w: 210, top: -300, h: 120, camera: true }, { kind: 'console', x: 245 },
      // одна картинка ASSET-ROOM010-02: целый костюм и два разбитых (затемнены, без света визора)
      { kind: 'exorack', x: 480, broken: true, asset: 'ASSET-ROOM010-02', h: 300, dim: true },
      { kind: 'exorack', x: 980, asset: 'ASSET-ROOM010-02', h: 300, visor: [50, -246] },
      { kind: 'exorack', x: 730, broken: true, asset: 'ASSET-ROOM010-02', h: 300, dim: true },
    ],
    lights: [
      { x: 400, y: -380, color: [255, 40, 30], radius: 420, flicker: 0.05 },
      { x: 1000, y: -380, color: [255, 40, 30], radius: 460, flicker: 0.05 },
      { x: 1370, y: -300, color: [255, 40, 30], radius: 300, flicker: 0.03 },   // над внешним люком
    ],
    fx: { steam: [1300], sparks: [], drips: [] },
  },
);

// Остальные помещения из GDD §6: зарегистрированы, но ещё не построены.
const ROOM_STUBS = [
  ['ROOM-004', 'Инженерная мастерская'],
];

// ROOM-012 — технический тоннель под жилыми палубами (дополнение №35): не прямой коридор слева
// направо, а проход под палубой — спуск по люку из коридора ROOM-011, выход по лестнице в жилой
// сектор ROOM-002. Низкий потолок, вода на полу, мутант и схрон выживших.
AB.ROOMS.push({
  id: 'ROOM-012', name: 'Технический тоннель', desc: 'Низкий тоннель под палубами: трубы, вода, следы выживших.',
  width: 1800, height: 215, background: 'ASSET-ROOM012-01', theme: 'tunnel',
  connections: [{ door: 'up-west', to: 'ROOM-011', toDoor: 'hatch' }, { door: 'up-east', to: 'ROOM-002', toDoor: 'hatch' }],
  access: { type: 'open' },
  map: { x: 230, y: 78, w: 540, h: 18 },
  items: [{ key: 'meds-tunnel', item: 'ITEM-005', qty: 1, x: 1020 }],
  containers: [], enemies: ['ENEMY-006'], equipment: [], events: [], state: 'flooded', spawn: { x: 200 },
  doors: [
    { key: 'up-west', kind: 'ladder', x: 110, to: 'ROOM-011', access: { type: 'open' } },
    { key: 'up-east', kind: 'ladder', x: 1690, to: 'ROOM-002', access: { type: 'open' } },
  ],
  props: [],
  lights: [
    { x: 420, y: -190, color: [255, 40, 30], radius: 250, flicker: 0.35 },
    { x: 1240, y: -190, color: [255, 40, 30], radius: 250, flicker: 0.2 },
  ],
  fx: { steam: [760], sparks: [], drips: [300, 900, 1480] },
});

// ROOM-013 — гидропоника (дополнение №37): продовольственный отсек, где выжившие выращивали
// водоросли. Баки светятся — единственный свет на корабле без питания. Вход — люк со склада.
AB.ROOMS.push({
  id: 'ROOM-013', name: 'Гидропоника', desc: 'Продовольственный отсек: баки с водорослями светятся в темноте.',
  width: 1900, height: 330, background: 'ASSET-ROOM013-01', theme: 'hydroponics',
  connections: [{ door: 'up', to: 'ROOM-005', toDoor: 'hatch' }, { door: 'west', to: 'ROOM-014', toDoor: 'east' }, { door: 'hatch', to: 'ROOM-015', toDoor: 'up' }],
  access: { type: 'open' },
  map: { x: 760, y: 80, w: 240, h: 22 },
  items: [{ key: 'wires', item: 'ITEM-003', qty: 1, x: 260 }],
  containers: [], enemies: ['ENEMY-007'], equipment: ['EQUIP-009'], events: [], state: 'flooded', spawn: { x: 1700 },
  doors: [
    { key: 'up', kind: 'ladder', x: 1790, to: 'ROOM-005', access: { type: 'open' } },
    // нижняя палуба (дополнение №44): техкоридор слева, люк вниз в насосную
    { key: 'west', x: 70, to: 'ROOM-014', access: { type: 'open' } },
    { key: 'hatch', kind: 'hatch', x: 1450, to: 'ROOM-015', access: { type: 'open' } },
  ],
  props: [
    { kind: 'algaetank', x: 480 }, { kind: 'algaetank', x: 760, broken: true },
    { kind: 'algaefarm', x: 1040, equip: 'EQUIP-009' },
    { kind: 'algaetank', x: 1320 }, { kind: 'algaetank', x: 1560 },
  ],
  lights: [
    { x: 480, y: -200, color: [90, 230, 130], radius: 300, flicker: 0.04, source: true },
    { x: 1040, y: -200, color: [90, 230, 130], radius: 340, flicker: 0.04, source: true },
    { x: 1440, y: -200, color: [90, 230, 130], radius: 300, flicker: 0.04, source: true },
  ],
  fx: { steam: [1200], sparks: [], drips: [600, 1500] },
});


// ---------------------------------------------------------------------
// Нижняя палуба вокруг гидропоники (дополнение №44, черновик — названия и вид
// поправит автор). Всё — сектор SECTOR-001, без загрузок. Кольцо для бегства:
// гидропоника → техкоридор Б → люк вниз → резервуарный зал → насосная → лестница наверх.
// ---------------------------------------------------------------------
AB.ROOMS.push({
  id: 'ROOM-014', name: 'Технический коридор Б', desc: 'Длинный служебный коридор вдоль гидропоники. В конце — разорванная вентиляция.',
  width: 1400, height: 230, background: 'ASSET-ROOM014-01', theme: 'tunnel',
  connections: [{ door: 'east', to: 'ROOM-013', toDoor: 'west' }, { door: 'hatch', to: 'ROOM-016', toDoor: 'up' }],
  access: { type: 'open' },
  map: { x: 590, y: 80, w: 160, h: 22 },
  items: [], containers: [], enemies: [], equipment: [], events: [], state: 'dark', spawn: { x: 1200 },
  doors: [
    { key: 'east', x: 1330, to: 'ROOM-013', access: { type: 'open' } },
    { key: 'hatch', kind: 'hatch', x: 250, to: 'ROOM-016', access: { type: 'open' } },
  ],
  props: [],
  lights: [
    { x: 520, y: -200, color: [255, 40, 30], radius: 240, flicker: 0.4 },
    { x: 1050, y: -200, color: [255, 40, 30], radius: 240, flicker: 0.15 },
  ],
  fx: { steam: [130], sparks: [], drips: [700] },
});

AB.ROOMS.push({
  id: 'ROOM-015', name: 'Насосная', desc: 'Насосы подачи воды к бакам гидропоники. Тесно, шумно, пол в воде.',
  width: 1300, height: 300, background: 'ASSET-ROOM015-01', theme: 'tunnel',
  connections: [{ door: 'up', to: 'ROOM-013', toDoor: 'hatch' }, { door: 'west', to: 'ROOM-016', toDoor: 'east' }],
  access: { type: 'open' },
  map: { x: 820, y: 108, w: 160, h: 20 },
  items: [], containers: [], enemies: [], equipment: [], events: [], state: 'flooded', spawn: { x: 1000 },
  doors: [
    { key: 'up', kind: 'ladder', x: 1100, to: 'ROOM-013', access: { type: 'open' } },
    { key: 'west', x: 70, to: 'ROOM-016', access: { type: 'open' } },
  ],
  props: [],
  lights: [
    { x: 400, y: -240, color: [255, 120, 40], radius: 260, flicker: 0.25 },
    { x: 950, y: -240, color: [255, 40, 30], radius: 240, flicker: 0.1 },
  ],
  fx: { steam: [620], sparks: [300], drips: [500, 1150] },
});

AB.ROOMS.push({
  id: 'ROOM-016', name: 'Резервуарный зал', desc: 'Затопленный зал с резервуарами питательного раствора. Здесь гнездо.',
  width: 1700, height: 320, background: 'ASSET-ROOM016-01', theme: 'tunnel',
  connections: [{ door: 'up', to: 'ROOM-014', toDoor: 'hatch' }, { door: 'east', to: 'ROOM-015', toDoor: 'west' }],
  access: { type: 'open' },
  map: { x: 600, y: 108, w: 210, h: 20 },
  items: [], containers: [], enemies: [], equipment: [], events: [], state: 'flooded', spawn: { x: 400 },
  doors: [
    { key: 'up', kind: 'ladder', x: 200, to: 'ROOM-014', access: { type: 'open' } },
    { key: 'east', x: 1630, to: 'ROOM-015', access: { type: 'open' } },
  ],
  props: [],
  lights: [
    { x: 600, y: -260, color: [90, 230, 130], radius: 300, flicker: 0.1, source: true },
    { x: 1250, y: -260, color: [255, 40, 30], radius: 260, flicker: 0.3 },
  ],
  fx: { steam: [900], sparks: [], drips: [350, 800, 1400] },
});

AB.ROOMS.forEach((r) => AB.ID.register(r.id, r));
ROOM_STUBS.forEach(([id, name]) => AB.ID.register(id, { name, stub: true, connections: [], access: { type: 'locked' } }));
