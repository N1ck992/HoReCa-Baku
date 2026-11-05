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
  { id: 'ASSET-CHAR001-01', owner: 'CHAR-001', type: 'rig', rig: 'MARK', variant: '01', src: null, desc: 'Основной внешний вид' },
  // Повреждённый костюм: пока та же картинка — ждём вариант 02 в той же позе.
  { id: 'ASSET-CHAR001-02', owner: 'CHAR-001', type: 'rig', rig: 'MARK', variant: '01', src: null, desc: 'Повреждённый костюм (временно как основной)' },

  // ---- CHAR-002: спутница — графика ждёт утверждения внешности ----
  { id: 'ASSET-CHAR002-01', owner: 'CHAR-002', type: 'sprite', src: null, desc: 'Спутница: основной вид' },

  // ---- ROOM-001: медицинский отсек ----
  { id: 'ASSET-ROOM001-01', owner: 'ROOM-001', type: 'background', src: null, desc: 'Фон: стены и пол медотсека' },
  { id: 'ASSET-ROOM001-02', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Аварийная криокапсула' },
  { id: 'ASSET-ROOM001-03', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Медицинская кушетка' },
  { id: 'ASSET-ROOM001-04', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Настенный монитор' },
  { id: 'ASSET-ROOM001-05', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Медицинский шкаф' },

  // ---- ROOM-011: первый коридор ----
  { id: 'ASSET-ROOM011-01', owner: 'ROOM-011', type: 'background', src: null, desc: 'Фон: первый коридор' },

  // ---- ROOM-002: жилой сектор ----
  { id: 'ASSET-ROOM002-01', owner: 'ROOM-002', type: 'background', src: null, desc: 'Фон: жилой сектор' },

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
  { id: 'ASSET-ENEMY001-01', owner: 'ENEMY-001', type: 'sprite', src: null, desc: 'Мутант: основной вид' },

  // ---- Общие элементы ----
  { id: 'ASSET-SHARED-01', owner: null, type: 'prop', src: null, desc: 'Гермодверь' },
];

AB.ASSET_MANIFEST.forEach((a) => AB.ID.register(a.id, a));
