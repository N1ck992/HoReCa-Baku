// =====================================================================
// Изометрические планировки (этап 1 перехода на изометрию, дополнение №45).
// Ключ — существующий сектор (js/data/sectors.js): новых ID нет, помещения
// те же (ROOM-*). Планировка — набор прямоугольников пола в клетках
// невидимой технической сетки; стены строятся сами по краю пола.
//
// areas  — пол: помещение или проход, room — чьё это место (ROOM-ID).
//          Касающиеся прямоугольники — один проход, без загрузки.
// props  — то, что мешает пройти: kind (вид заглушки), x, y, w, h в клетках;
//          asset — ID картинки из ASSET MANIFEST, если она уже заведена.
// lights — свет помещений: клетка, цвет, радиус в клетках.
// party  — где стоит отряд в начале тестовой сцены (существующие персонажи).
// doors  — двери сектора (ключи из sectors.js): клетки створки поперёк прохода.
//          Закрыта — не пройти; заперта, пока заперта дверь помещения (rooms.js).
// exits  — двери из сектора (rooms.js: room + door): переход в другой сектор.
// items  — где лежат предметы помещений: 'ROOM-ID:key' из rooms.js → клетка.
// у предмета-обстановки equip — оборудование (EQUIP-ID), с ним работают рядом;
//          container — тайник помещения (rooms.js: containers), его обыскивают.
// links  — люки и лестницы внутри сектора: переход между двумя точками (затемнение).
// exits.to — куда ведёт выход: { sector, x, y }; без to — сектор ещё не перенесён.
// Предмет без места в items ставится по его x из rooms.js вдоль помещения.
// party/testState/testEnemies — только для тестовой сцены (iso.html?scene=test).
// Планировка — тестовая: положение помещений условное, сюжет не меняется.
// =====================================================================

AB.ISO_LAYOUTS = {
  'SECTOR-001': {
    name: 'Жилая палуба и гидропоника',
    areas: [
      { room: 'ROOM-002', x: 2, y: 2, w: 20, h: 11 },     // жилой сектор
      { room: 'ROOM-002', x: 22, y: 6, w: 5, h: 3 },      // проход к складу
      { room: 'ROOM-005', x: 27, y: 2, w: 22, h: 15 },    // склад
      { room: 'ROOM-005', x: 40, y: 17, w: 3, h: 6 },     // спуск к гидропонике
      { room: 'ROOM-013', x: 30, y: 23, w: 22, h: 13 },   // гидропоника
      { room: 'ROOM-015', x: 39, y: 36, w: 4, h: 3 },     // проход в насосную
      { room: 'ROOM-015', x: 35, y: 39, w: 13, h: 6 },    // насосная
      { room: 'ROOM-014', x: 12, y: 27, w: 18, h: 4 },    // техкоридор Б
      { room: 'ROOM-016', x: 2, y: 22, w: 10, h: 14 },    // резервуарный зал
    ],
    props: [
      // жилой сектор: койки и шкафчики вдоль стены, стол
      { kind: 'bunk', x: 4, y: 3, w: 3, h: 1, asset: 'ASSET-ROOM002-02' },
      { kind: 'locker', x: 8, y: 3, w: 1, h: 1 },
      { kind: 'bunk', x: 10, y: 3, w: 3, h: 1, asset: 'ASSET-ROOM002-02' },
      { kind: 'locker', x: 14, y: 3, w: 1, h: 1 },
      { kind: 'bunk', x: 16, y: 3, w: 3, h: 1, asset: 'ASSET-ROOM002-02' },
      { kind: 'locker', x: 20, y: 3, w: 1, h: 1 },
      { kind: 'table', x: 9, y: 8, w: 2, h: 2 },
      { kind: 'bunk', x: 16, y: 10, w: 3, h: 1, asset: 'ASSET-ROOM002-02' },
      { kind: 'cabindoor', x: 13, y: 2, w: 1, h: 1, equip: 'EQUIP-008' },   // заклинившая каюта
      // склад: штабеля контейнеров и стеллажи
      { kind: 'crate', x: 30, y: 4, w: 2, h: 2 }, { kind: 'crate', x: 33, y: 4, w: 1, h: 2 },
      { kind: 'crate', x: 36, y: 9, w: 3, h: 2 }, { kind: 'crate', x: 30, y: 12, w: 2, h: 3 },
      { kind: 'crate', x: 42, y: 4, w: 2, h: 2 }, { kind: 'crate', x: 44, y: 11, w: 3, h: 3 },
      { kind: 'shelf', x: 34, y: 13, w: 6, h: 1 }, { kind: 'shelf', x: 39, y: 5, w: 1, h: 4 },
      // гидропоника: баки с водорослями рядами, ферма
      { kind: 'algaetank', x: 33, y: 26, w: 2, h: 2 }, { kind: 'algaetank', x: 37, y: 26, w: 2, h: 2 },
      { kind: 'algaetank', x: 41, y: 26, w: 2, h: 2 }, { kind: 'algaetank', x: 45, y: 26, w: 2, h: 2 },
      { kind: 'algaetank', x: 33, y: 31, w: 2, h: 2 }, { kind: 'algaetank', x: 37, y: 31, w: 2, h: 2 },
      { kind: 'algaefarm', x: 41, y: 31, w: 2, h: 2, equip: 'EQUIP-009' }, { kind: 'algaetank', x: 45, y: 31, w: 2, h: 2 },
      // техкоридор Б: трубы
      { kind: 'pipe', x: 17, y: 27, w: 1, h: 1 }, { kind: 'pipe', x: 23, y: 30, w: 1, h: 1 },
      // насосная: насосы
      { kind: 'pump', x: 37, y: 41, w: 2, h: 2 }, { kind: 'pump', x: 43, y: 41, w: 2, h: 2 },
      // резервуарный зал: резервуары
      { kind: 'reservoir', x: 4, y: 24, w: 3, h: 3 }, { kind: 'reservoir', x: 4, y: 30, w: 3, h: 3 },
      { kind: 'reservoir', x: 8, y: 32, w: 2, h: 2 },
    ],
    lights: [
      { x: 6, y: 6, color: [255, 60, 40], radius: 7 },
      { x: 17, y: 7, color: [255, 60, 40], radius: 6 },
      { x: 33, y: 8, color: [255, 214, 170], radius: 8 },
      { x: 44, y: 8, color: [255, 214, 170], radius: 7 },
      { x: 35, y: 29, color: [90, 230, 130], radius: 7 },
      { x: 45, y: 29, color: [90, 230, 130], radius: 7 },
      { x: 20, y: 29, color: [255, 60, 40], radius: 5 },
      { x: 41, y: 42, color: [255, 140, 60], radius: 6 },
      { x: 6, y: 28, color: [90, 230, 130], radius: 6 },
    ],
    doors: [
      { key: 'A', tiles: [[24, 6], [24, 7], [24, 8]], axis: 'x' },          // жилой сектор ↔ склад
      { key: 'D', tiles: [[29, 27], [29, 28], [29, 29], [29, 30]], axis: 'x' },   // гидропоника ↔ техкоридор Б
      // спуск со склада в гидропонику: в испытании «Гнездо» его заклинивает (№50)
      { key: 'H', tiles: [[40, 22], [41, 22], [42, 22]], axis: 'y', name: 'Спуск на склад', room: 'ROOM-005', state: 'open' },
    ],
    // испытание «Гнездо» (ARENA-001, №44/№50): откуда лезут мутанты на нижней палубе
    nest: {
      door: 'H', repairAt: { x: 41.5, y: 23.6 },
      spawns: [{ x: 12.5, y: 28.5 }, { x: 4.5, y: 28.5 }, { x: 8.5, y: 25.0 }, { x: 46.5, y: 43.5 }],
    },
    exits: [
      { room: 'ROOM-002', door: 'west', x: 2, y: 7, wall: 'w', to: { sector: 'SECTOR-002', x: 58.5, y: 7.5 } },        // в генераторную
      { room: 'ROOM-005', door: 'east', x: 48, y: 9, wall: 'e', to: { sector: 'SECTOR-003', x: 3.5, y: 12.5 } },        // к мостику (питание)
      { room: 'ROOM-002', door: 'hatch', x: 20, y: 11, floor: true, to: { sector: 'SECTOR-002', x: 47.5, y: 17.5 } },  // люк в технический тоннель
    ],
    items: {
      'ROOM-005:fuel': { x: 42.5, y: 8.5 },
      'ROOM-013:wires': { x: 32.5, y: 24.5 },
    },
    // состояние тестовой сцены: Мира уже встречена (EVENT-003), каюта вскрыта; питания нет
    testState: {
      story: ['EVENT-003'], equipment: [['EQUIP-008', 'done']], power: false,
      // оружие по канону: у Марка — труба, у Миры — дротиковый пистолет
      weapons: [['CHAR-001', 'ITEM-009'], ['CHAR-002', 'ITEM-012']],
    },
    // противники помещений (rooms.js: enemies) — где стоят в изометрии
    enemyPos: { 'ENEMY-007': { x: 44.5, y: 34.0 } },
    // для проверки боя в тестовой сцене: экземпляры обычного мутанта (как волны «Гнезда»)
    testEnemies: [
      { id: 'ENEMY-001~1', x: 6.5, y: 28.5 },
      { id: 'ENEMY-001~2', x: 21.5, y: 29.0 },
      { id: 'ENEMY-001~3', x: 41.5, y: 42.5 },
    ],
    // существующие персонажи; в отряде — не больше пяти
    party: [
      { id: 'CHAR-001', x: 12.5, y: 7.5 },
      { id: 'CHAR-002', x: 11.5, y: 8.5 },
      { id: 'CHAR-003', x: 12.5, y: 10.5 },
    ],
  },
  // Сектор начала сюжета (дополнение №49): криоотсек, коридор, генераторная и технический
  // тоннель под коридором. Только для изометрии — в основной игре это отдельные помещения.
  'SECTOR-002': {
    name: 'Криоотсек и коридор',
    areas: [
      { room: 'ROOM-001', x: 2, y: 2, w: 14, h: 9 },      // криоотсек
      { room: 'ROOM-001', x: 16, y: 5, w: 2, h: 3 },      // проход в коридор
      { room: 'ROOM-011', x: 18, y: 4, w: 30, h: 4 },     // коридор
      { room: 'ROOM-011', x: 48, y: 5, w: 1, h: 2 },      // дверь генераторной
      { room: 'ROOM-003', x: 49, y: 2, w: 12, h: 10 },    // генераторная
      { room: 'ROOM-012', x: 20, y: 16, w: 30, h: 3 },    // технический тоннель (под коридором)
    ],
    props: [
      { kind: 'cryopod', x: 3, y: 3, w: 2, h: 2, main: true, prop: 'cryopod-main', asset: 'ASSET-ROOM001-02' },
      { kind: 'cryopod', x: 6, y: 3, w: 2, h: 2, asset: 'ASSET-ROOM001-02' },
      { kind: 'cryopod', x: 9, y: 3, w: 2, h: 2, asset: 'ASSET-ROOM001-02' },
      { kind: 'console', x: 12, y: 2, w: 1, h: 1, asset: 'ASSET-ROOM001-04' },
      { kind: 'medbed', x: 11, y: 7, w: 2, h: 1, asset: 'ASSET-ROOM001-03' },
      { kind: 'locker', x: 14, y: 3, w: 1, h: 2, asset: 'ASSET-ROOM001-05', container: 'cabinet' },
      { kind: 'pipe', x: 26, y: 4, w: 1, h: 1 }, { kind: 'crate', x: 40, y: 7, w: 2, h: 1 },
      { kind: 'panel', x: 50, y: 2, w: 1, h: 1, equip: 'EQUIP-001', asset: 'ASSET-ROOM003-03' },
      { kind: 'cable', x: 54, y: 2, w: 2, h: 1, equip: 'EQUIP-002', asset: 'ASSET-ROOM003-04' },
      { kind: 'generator', x: 54, y: 5, w: 4, h: 3, equip: 'EQUIP-003', asset: 'ASSET-ROOM003-02' },
      { kind: 'console', x: 59, y: 3, w: 1, h: 2, equip: 'EQUIP-004', asset: 'ASSET-ROOM003-05' },
      { kind: 'fueltank', x: 51, y: 9, w: 2, h: 2, equip: 'EQUIP-010' },
      { kind: 'pipe', x: 30, y: 16, w: 1, h: 1 }, { kind: 'pipe', x: 42, y: 18, w: 1, h: 1 },
    ],
    doors: [
      // коридор → генераторная: кодовый замок (код знает Мира — EVENT-003)
      { key: 'G', tiles: [[48, 5], [48, 6]], axis: 'x', name: 'Дверь генераторной', room: 'ROOM-011', roomDoor: 'east', state: 'closed' },
    ],
    links: [
      { key: 'T', name: 'Люк в технический тоннель', a: { room: 'ROOM-011', door: 'hatch', x: 32, y: 6 }, b: { room: 'ROOM-012', door: 'up-west', x: 21, y: 17 } },
    ],
    exits: [
      { room: 'ROOM-003', door: 'east', x: 60, y: 7, wall: 'e', to: { sector: 'SECTOR-001', x: 3.5, y: 7.5 } },        // в жилой сектор (питание)
      { room: 'ROOM-012', door: 'up-east', x: 48, y: 17, floor: true, to: { sector: 'SECTOR-001', x: 19.5, y: 10.5 } }, // лестница в жилой сектор
    ],
    items: {
      'ROOM-011:pipe': { x: 24.5, y: 6.5 },
      'ROOM-011:fuse-lamp': { x: 29.5, y: 5.5 },
    },
    enemyPos: { 'ENEMY-001': { x: 38.5, y: 5.5 }, 'ENEMY-006': { x: 40.5, y: 17.5 } },
    lights: [
      { x: 4, y: 6, color: [120, 200, 255], radius: 6 },
      { x: 11, y: 5, color: [255, 60, 40], radius: 6 },
      { x: 24, y: 6, color: [255, 60, 40], radius: 5 },
      { x: 36, y: 6, color: [255, 60, 40], radius: 5 },
      { x: 55, y: 6, color: [255, 160, 70], radius: 8 },
      { x: 28, y: 17, color: [255, 60, 40], radius: 5 },
      { x: 42, y: 17, color: [255, 60, 40], radius: 5 },
    ],
  },
};

// Начало нового прохождения: Марк в главной капсуле криоотсека (EVENT-001)
AB.ISO_START = { sector: 'SECTOR-002', party: [{ id: 'CHAR-001', x: 4.0, y: 5.6 }] };

// Сектор только изометрии — в общем реестре ID (секторы основной игры — js/data/sectors.js)
AB.ID.register('SECTOR-002', { id: 'SECTOR-002', name: AB.ISO_LAYOUTS['SECTOR-002'].name, iso: true, doors: [] });

// Сектор конца акта I (дополнение №50): командный центр, лаборатория, оружейная,
// система жизнеобеспечения, шлюз. Только для изометрии; помещения и порядок — из rooms.js.
AB.ISO_LAYOUTS['SECTOR-003'] = {
  name: 'Мостик и лаборатория',
  areas: [
    { room: 'ROOM-008', x: 2, y: 8, w: 16, h: 10 },     // командный центр
    { room: 'ROOM-008', x: 18, y: 11, w: 2, h: 3 },     // дверь в лабораторию
    { room: 'ROOM-007', x: 20, y: 6, w: 22, h: 12 },    // лаборатория
    { room: 'ROOM-007', x: 42, y: 13, w: 2, h: 3 },     // проход в оружейную
    { room: 'ROOM-006', x: 44, y: 10, w: 12, h: 9 },    // оружейная
    { room: 'ROOM-006', x: 49, y: 19, w: 3, h: 2 },     // проход в жизнеобеспечение
    { room: 'ROOM-009', x: 40, y: 21, w: 24, h: 14 },   // система жизнеобеспечения
    { room: 'ROOM-009', x: 64, y: 26, w: 1, h: 3 },     // проход в шлюз
    { room: 'ROOM-010', x: 65, y: 24, w: 16, h: 8 },    // шлюз
  ],
  props: [
    { kind: 'console', x: 5, y: 8, w: 2, h: 1 }, { kind: 'console', x: 9, y: 8, w: 2, h: 1 }, { kind: 'console', x: 13, y: 8, w: 2, h: 1 },
    { kind: 'table', x: 8, y: 13, w: 3, h: 2 },
    { kind: 'algaetank', x: 23, y: 7, w: 2, h: 2 }, { kind: 'table', x: 27, y: 11, w: 3, h: 1 }, { kind: 'algaetank', x: 31, y: 7, w: 2, h: 2 },
    { kind: 'glass', x: 34, y: 9, w: 1, h: 5 }, { kind: 'algaetank', x: 37, y: 14, w: 2, h: 2 }, { kind: 'table', x: 39, y: 8, w: 2, h: 1 },
    { kind: 'shelf', x: 45, y: 11, w: 1, h: 4 }, { kind: 'locker', x: 49, y: 10, w: 2, h: 1, container: 'gun-locker', asset: 'ASSET-ROOM006-02' }, { kind: 'shelf', x: 54, y: 11, w: 1, h: 4 },
    { kind: 'reservoir', x: 43, y: 23, w: 3, h: 3 }, { kind: 'panel', x: 50, y: 21, w: 2, h: 1, equip: 'EQUIP-006' },
    { kind: 'reservoir', x: 55, y: 30, w: 3, h: 3 }, { kind: 'reservoir', x: 59, y: 23, w: 3, h: 3 },
    { kind: 'console', x: 67, y: 24, w: 2, h: 1, equip: 'EQUIP-007' },
    { kind: 'exorack', x: 71, y: 24, w: 2, h: 1, asset: 'ASSET-ROOM010-02' },
    { kind: 'exorack', x: 74, y: 24, w: 2, h: 1, asset: 'ASSET-ROOM010-02' },
    { kind: 'exorack', x: 77, y: 24, w: 2, h: 1, equip: 'EQUIP-005', asset: 'ASSET-ROOM010-02' },
  ],
  doors: [
    // командный центр → лаборатория: заблокировано изнутри, пока не закончится сцена с врачом
    { key: 'L', tiles: [[18, 11], [18, 12], [18, 13]], axis: 'x', name: 'Дверь в лабораторию', room: 'ROOM-008', roomDoor: 'east', state: 'closed' },
    // жизнеобеспечение → шлюз: проход держит Колосс
    { key: 'S', tiles: [[64, 26], [64, 27], [64, 28]], axis: 'x', name: 'Проход в шлюз', room: 'ROOM-009', roomDoor: 'east', state: 'closed' },
  ],
  exits: [
    { room: 'ROOM-008', door: 'west', x: 2, y: 12, wall: 'w', to: { sector: 'SECTOR-001', x: 46.5, y: 9.5 } },   // на склад
    { room: 'ROOM-010', door: 'east', x: 80, y: 28, wall: 'e' },                                                  // внешний люк: только в экзокостюме
  ],
  items: {},
  enemyPos: { 'ENEMY-004': { x: 28.5, y: 14.5 }, 'ENEMY-005': { x: 38.5, y: 11.5 }, 'ENEMY-003': { x: 52.5, y: 28.5 } },
  // где стоит врач, когда выходит навстречу (rooms.js: x 620 в командном центре)
  lights: [
    { x: 6, y: 12, color: [120, 200, 255], radius: 7 }, { x: 13, y: 12, color: [120, 200, 255], radius: 6 },
    { x: 25, y: 10, color: [90, 230, 130], radius: 6 }, { x: 33, y: 14, color: [255, 60, 40], radius: 6 },
    { x: 49, y: 14, color: [255, 214, 170], radius: 6 },
    { x: 46, y: 27, color: [255, 60, 40], radius: 7 }, { x: 57, y: 27, color: [255, 120, 60], radius: 8 },
    { x: 72, y: 28, color: [120, 200, 255], radius: 8 },
  ],
};
AB.ID.register('SECTOR-003', { id: 'SECTOR-003', name: AB.ISO_LAYOUTS['SECTOR-003'].name, iso: true, doors: [] });
