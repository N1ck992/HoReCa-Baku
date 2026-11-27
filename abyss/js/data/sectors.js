// =====================================================================
// Секторы корабля (SECTOR-*), дополнение №43. Помещения сектора всегда —
// одно пространство без загрузок: этажи друг над другом, помещения этажа —
// рядом. Загрузка — только при переходе в другой сектор (шахты, шлюзы,
// обесточенные переборки). Только данные; логика — js/systems/arena.js.
//
// rooms  — помещение, этаж (0 — верхний), x0 — где начинается в мире сектора;
//          x0 подобраны так, чтобы двери и люки соседних помещений совпали.
// doors  — двери сектора. С other — проход между помещениями сектора
//          (открыть/закрыть; заперта, пока заперта дверь помещения в rooms.js).
//          Без other — дверь из сектора: в исследовании — обычный переход с
//          загрузкой, в испытании — баррикада, за которой ломятся враги.
//          roomDoor — какая дверь помещения (из rooms.js) это и есть.
// ladders — переходы между этажами (люк сверху + лестница снизу).
// =====================================================================

AB.SECTORS = [
  {
    id: 'SECTOR-001',
    name: 'Жилая палуба и гидропоника',
    rooms: [
      { room: 'ROOM-002', floor: 0, x0: 0 },
      { room: 'ROOM-005', floor: 0, x0: 1760 },
      { room: 'ROOM-013', floor: 1, x0: 1850 },
      // нижняя палуба (№44)
      { room: 'ROOM-014', floor: 1, x0: 590 },
      { room: 'ROOM-016', floor: 2, x0: 640 },
      { room: 'ROOM-015', floor: 2, x0: 2200 },
    ],
    doors: [
      { key: 'A', name: 'Жилой сектор ↔ склад', room: 'ROOM-002', roomDoor: 'east', x: 1830,
        other: { room: 'ROOM-005', roomDoor: 'west', x: 70 }, hp: 120, fortHp: 300, state: 'open' },
      { key: 'B', name: 'Склад → коридор к мостику', room: 'ROOM-005', roomDoor: 'east', x: 2030, hp: 120, fortHp: 300 },
      { key: 'C', name: 'Жилой сектор → генераторная', room: 'ROOM-002', roomDoor: 'west', x: 70, hp: 120, fortHp: 300 },
      { key: 'D', name: 'Гидропоника ↔ техкоридор Б', room: 'ROOM-013', roomDoor: 'west', x: 70,
        other: { room: 'ROOM-014', roomDoor: 'east', x: 1330 }, hp: 120, fortHp: 300, state: 'closed' },
      { key: 'E', name: 'Насосная ↔ резервуарный зал', room: 'ROOM-015', roomDoor: 'west', x: 70,
        other: { room: 'ROOM-016', roomDoor: 'east', x: 1630 }, hp: 120, fortHp: 300, state: 'open' },
    ],
    ladders: [
      { key: 'H', name: 'Люк на склад', top: { room: 'ROOM-005', roomDoor: 'hatch', x: 1880 }, bottom: { room: 'ROOM-013', roomDoor: 'up', x: 1790 } },
      { key: 'P', name: 'Люк в насосную', top: { room: 'ROOM-013', roomDoor: 'hatch', x: 1450 }, bottom: { room: 'ROOM-015', roomDoor: 'up', x: 1100 } },
      { key: 'R', name: 'Люк в резервуарный зал', top: { room: 'ROOM-014', roomDoor: 'hatch', x: 250 }, bottom: { room: 'ROOM-016', roomDoor: 'up', x: 200 } },
    ],
  },
];

AB.SECTORS.forEach((s) => AB.ID.register(s.id, s));
