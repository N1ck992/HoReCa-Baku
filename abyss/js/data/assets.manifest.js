// =====================================================================
// ASSET MANIFEST — единственный реестр графических ресурсов (GDD §2.4, §11).
//
// Чтобы подключить картинку: положите файл в abyss/assets/ и укажите путь в src.
// Пока src = null, игра рисует временную заглушку с этим ID (GDD §11).
// Случайные изображения вместо отсутствующих не используются (GDD §2.5).
// =====================================================================

AB.ASSET_MANIFEST = [
  // ---- CHAR-001: главный герой ----
  // Марк нарезан программой tools/rig_from_fullbody.py из одной фигуры в полный рост
  // (assets/source/CHAR001-01.png, разметка tools/rigs/MARK.json → js/data/rigs/MARK.js).
  // Откат на первую версию: rig: 'CHAR001' и parts из assets/char001/01|02 (см. git).
  { id: 'ASSET-CHAR001-01', owner: 'CHAR-001', type: 'rig', rig: 'MARK3', variant: '01', src: null, desc: 'Основной внешний вид (лист деталей v4; откат — rig: MARK2 или MARK)' },
  // Повреждённый костюм: пока та же картинка — ждём вариант 02 в той же позе.
  { id: 'ASSET-CHAR001-02', owner: 'CHAR-001', type: 'rig', rig: 'MARK3', variant: '01', src: null, desc: 'Повреждённый костюм (временно как основной)' },

  // ---- CHAR-002: спутница — графика ждёт утверждения внешности ----
  // спутница: из одной фигуры assets/source/CHAR002-01.png (разметка tools/rigs/COMPANION.json). Откат: type 'sprite', без rig.
  { id: 'ASSET-CHAR002-01', owner: 'CHAR-002', type: 'rig', rig: 'COMPANION', variant: '01', src: null, desc: 'Спутница: облик, который видит Марк' },
  { id: 'ASSET-CHAR002-02', owner: 'CHAR-002', type: 'sprite', src: 'assets/char002/true/full.png', desc: 'Истинный облик: глубоководный арахнид (docs/STORY.md §4); видят все, кроме Марка' },

  // ---- ENEMY-002: преследователь — графика ждёт утверждения ----
  { id: 'ASSET-ENEMY002-01', owner: 'ENEMY-002', type: 'sprite', src: null, desc: 'Преследователь: силуэт' },

  // ---- Первый акт, развязка: графика — заглушки, ждут генерации ----
  { id: 'ASSET-CHAR003-01', owner: 'CHAR-003', type: 'sprite', src: null, desc: 'Доктор Хейл' },
  { id: 'ASSET-ENEMY003-01', owner: 'ENEMY-003', type: 'sprite', src: null, desc: 'Колосс' },
  { id: 'ASSET-ITEM013-01', owner: 'ITEM-013', type: 'icon', src: null, desc: 'Водорослевая паста' },
  // №55, акты II–III (черновик): картинок пока нет — заглушки
  { id: 'ASSET-ITEM014-01', owner: 'ITEM-014', type: 'icon', src: null, desc: 'Жетон экспедиции' },
  { id: 'ASSET-ITEM015-01', owner: 'ITEM-015', type: 'icon', src: null, desc: 'Кристалл' },
  { id: 'ASSET-ITEM016-01', owner: 'ITEM-016', type: 'icon', src: null, desc: 'Реголит' },
  { id: 'ASSET-ITEM017-01', owner: 'ITEM-017', type: 'icon', src: null, desc: 'Стройматериал' },
  { id: 'ASSET-ENEMY008-01', owner: 'ENEMY-008', type: 'sprite', src: null, desc: 'Глубинный хищник' },
  { id: 'ASSET-CHAR004-01', owner: 'CHAR-004', type: 'sprite', src: null, desc: 'Сайлас' },
  { id: 'ASSET-ENEMY009-01', owner: 'ENEMY-009', type: 'sprite', src: null, desc: 'Исполин' },
  { id: 'ASSET-ROOM013-01', owner: 'ROOM-013', type: 'background', src: null, desc: 'Фон: гидропоника' },
  { id: 'ASSET-ROOM014-01', owner: 'ROOM-014', type: 'background', src: null, desc: 'Фон: технический коридор Б' },
  { id: 'ASSET-ROOM015-01', owner: 'ROOM-015', type: 'background', src: null, desc: 'Фон: насосная' },
  { id: 'ASSET-ROOM016-01', owner: 'ROOM-016', type: 'background', src: null, desc: 'Фон: резервуарный зал' },
  { id: 'ASSET-ITEM012-01', owner: 'ITEM-012', type: 'icon', src: null, desc: 'Дротиковый пистолет спутницы' },
  { id: 'ASSET-ITEM011-01', owner: 'ITEM-011', type: 'icon', src: 'assets/items/ITEM011-01.png', desc: 'Наручный плазмомёт (иконка и вид на руке; исходник assets/source/ITEM011-01.png)' },
  { id: 'ASSET-ROOM006-01', owner: 'ROOM-006', type: 'background', src: null, desc: 'Фон: оружейная' },
  { id: 'ASSET-ROOM007-01', owner: 'ROOM-007', type: 'background', src: null, desc: 'Фон: лаборатория' },
  { id: 'ASSET-ROOM009-01', owner: 'ROOM-009', type: 'background', src: null, desc: 'Фон: система жизнеобеспечения' },
  { id: 'ASSET-ROOM010-01', owner: 'ROOM-010', type: 'background', src: null, desc: 'Фон: шлюз' },
  { id: 'ASSET-ROOM012-01', owner: 'ROOM-012', type: 'background', src: null, desc: 'Фон: технический тоннель' },
  { id: 'ASSET-ROOM010-02', owner: 'EQUIP-005', type: 'prop', src: 'assets/props/exosuit-rack.png', desc: 'Экзокостюм в стойке (вырезан из assets/source/ACT1-PROPS-01.png)' },
  { id: 'ASSET-ROOM010-03', owner: 'ROOM-010', type: 'prop', src: 'assets/props/outer-hatch.png', desc: 'Внешний люк шлюза' },
  { id: 'ASSET-ROOM006-02', owner: 'ROOM-006', type: 'prop', src: 'assets/props/locker-closed.png', desc: 'Шкаф с оружием, закрыт' },
  { id: 'ASSET-ROOM006-03', owner: 'ROOM-006', type: 'prop', src: 'assets/props/locker-open.png', desc: 'Шкаф с оружием, открыт и пуст' },

  // ---- ROOM-001: медицинский отсек ----
  { id: 'ASSET-ROOM001-01', owner: 'ROOM-001', type: 'background', src: 'assets/rooms/ROOM001-01.jpg', desc: 'Фон: стены и пол медотсека' },
  { id: 'ASSET-ROOM001-02', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Аварийная криокапсула' },
  { id: 'ASSET-ROOM001-03', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Медицинская кушетка' },
  { id: 'ASSET-ROOM001-04', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Настенный монитор' },
  { id: 'ASSET-ROOM001-05', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Медицинский шкаф' },

  // ---- ROOM-011: первый коридор ----
  { id: 'ASSET-ROOM011-01', owner: 'ROOM-011', type: 'background', src: 'assets/rooms/ROOM011-01.jpg', desc: 'Фон: первый коридор' },

  // ---- ROOM-002: жилой сектор ----
  { id: 'ASSET-ROOM002-01', owner: 'ROOM-002', type: 'background', src: 'assets/rooms/ROOM002-01.jpg', desc: 'Фон: жилой сектор' },

  // ---- ROOM-005: склад, ROOM-008: командный центр ----
  { id: 'ASSET-ROOM002-02', owner: 'ROOM-002', type: 'prop', src: null, desc: 'Двухъярусная койка' },
  { id: 'ASSET-ROOM005-01', owner: 'ROOM-005', type: 'background', src: null, desc: 'Фон: склад' },
  { id: 'ASSET-ROOM008-01', owner: 'ROOM-008', type: 'background', src: null, desc: 'Фон: командный центр' },

  // ---- ROOM-003: энергетический отсек ----
  // Фон — концепт-арт целиком: генератор, щит, кабельный узел, пульт и двери нарисованы на нём.
  { id: 'ASSET-ROOM003-01', owner: 'ROOM-003', type: 'background', src: 'assets/rooms/ROOM003-01.jpg', desc: 'Фон энергоотсека (концепт-арт)' },
  { id: 'ASSET-ROOM003-02', owner: 'EQUIP-003', type: 'prop', src: null, desc: 'Генератор (пока на фоне; сердечник — эффект движка)' },
  { id: 'ASSET-ROOM003-03', owner: 'EQUIP-001', type: 'prop', src: null, desc: 'Электрощит (пока на фоне)' },
  { id: 'ASSET-ROOM003-04', owner: 'EQUIP-002', type: 'prop', src: null, desc: 'Кабельный узел (пока на фоне)' },
  { id: 'ASSET-ROOM003-05', owner: 'EQUIP-004', type: 'prop', src: null, desc: 'Пульт управления (пока на фоне)' },

  // ---- Предметы (GDD §9). Иконка в инвентаре и вид на полу ----
  { id: 'ASSET-ITEM001-01', owner: 'ITEM-001', type: 'icon', src: null, desc: 'Металлолом' },
  { id: 'ASSET-ITEM002-01', owner: 'ITEM-002', type: 'icon', src: null, desc: 'Электронные компоненты' },
  { id: 'ASSET-ITEM003-01', owner: 'ITEM-003', type: 'icon', src: null, desc: 'Провода' },
  { id: 'ASSET-ITEM004-01', owner: 'ITEM-004', type: 'icon', src: null, desc: 'Предохранитель' },
  { id: 'ASSET-ITEM005-01', owner: 'ITEM-005', type: 'icon', src: null, desc: 'Медикаменты' },
  { id: 'ASSET-ITEM006-01', owner: 'ITEM-006', type: 'icon', src: null, desc: 'Топливо' },
  { id: 'ASSET-ITEM007-01', owner: 'ITEM-007', type: 'icon', src: null, desc: 'Биоматериалы' },
  { id: 'ASSET-ITEM008-01', owner: 'ITEM-008', type: 'icon', src: null, desc: 'Боеприпасы' },
  { id: 'ASSET-ITEM009-01', owner: 'ITEM-009', type: 'icon', src: null, desc: 'Металлическая труба' },
  { id: 'ASSET-ITEM010-01', owner: 'ITEM-010', type: 'icon', src: null, desc: 'Ключ-карта' },

  // ---- ENEMY-001: первый мутант ----
  // мутант: из одной фигуры assets/source/ENEMY001-01.png (разметка tools/rigs/MUTANT.json → js/data/rigs/MUTANT.js).
  // Откат на процедурную заглушку: вернуть type: 'sprite' и убрать rig.
  { id: 'ASSET-ENEMY001-01', owner: 'ENEMY-001', type: 'rig', rig: 'MUTANT', variant: '01', src: null, desc: 'Мутант: основной вид (гуманоид)' },

  // ---- Общие элементы ----
  { id: 'ASSET-SHARED-01', owner: null, type: 'prop', src: null, desc: 'Гермодверь' },
];

AB.ASSET_MANIFEST.forEach((a) => AB.ID.register(a.id, a));
