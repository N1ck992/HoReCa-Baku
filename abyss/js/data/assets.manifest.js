// =====================================================================
// ASSET MANIFEST — единственный реестр графических ресурсов (GDD §2.4, §11).
//
// Чтобы подключить картинку: положите файл в abyss/assets/ и укажите путь в src.
// Пока src = null, игра рисует временную заглушку с этим ID (GDD §11).
// Случайные изображения вместо отсутствующих не используются (GDD §2.5).
// =====================================================================

AB.ASSET_MANIFEST = [
  // ---- CHAR-001: главный герой ----
  { id: 'ASSET-CHAR001-01', owner: 'CHAR-001', type: 'sprite', src: null, desc: 'Основной внешний вид' },
  { id: 'ASSET-CHAR001-02', owner: 'CHAR-001', type: 'sprite', src: null, desc: 'Повреждённый костюм' },

  // ---- ROOM-001: медицинский отсек ----
  { id: 'ASSET-ROOM001-01', owner: 'ROOM-001', type: 'background', src: null, desc: 'Фон: стены и пол медотсека' },
  { id: 'ASSET-ROOM001-02', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Аварийная криокапсула' },
  { id: 'ASSET-ROOM001-03', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Медицинская кушетка' },
  { id: 'ASSET-ROOM001-04', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Настенный монитор' },
  { id: 'ASSET-ROOM001-05', owner: 'ROOM-001', type: 'prop', src: null, desc: 'Медицинский шкаф' },

  // ---- ROOM-011: первый коридор ----
  { id: 'ASSET-ROOM011-01', owner: 'ROOM-011', type: 'background', src: null, desc: 'Фон: первый коридор' },

  // ---- Предметы (GDD §9). Иконка в инвентаре и вид на полу ----
  { id: 'ASSET-ITEM001-01', owner: 'ITEM-001', type: 'icon', src: null, desc: 'Металлолом' },
  { id: 'ASSET-ITEM002-01', owner: 'ITEM-002', type: 'icon', src: null, desc: 'Электронные компоненты' },
  { id: 'ASSET-ITEM003-01', owner: 'ITEM-003', type: 'icon', src: null, desc: 'Провода' },
  { id: 'ASSET-ITEM004-01', owner: 'ITEM-004', type: 'icon', src: null, desc: 'Предохранитель' },
  { id: 'ASSET-ITEM005-01', owner: 'ITEM-005', type: 'icon', src: null, desc: 'Медикаменты' },
  { id: 'ASSET-ITEM006-01', owner: 'ITEM-006', type: 'icon', src: null, desc: 'Топливо' },
  { id: 'ASSET-ITEM007-01', owner: 'ITEM-007', type: 'icon', src: null, desc: 'Биоматериалы' },
  { id: 'ASSET-ITEM008-01', owner: 'ITEM-008', type: 'icon', src: null, desc: 'Боеприпасы' },

  // ---- Общие элементы ----
  { id: 'ASSET-SHARED-01', owner: null, type: 'prop', src: null, desc: 'Гермодверь' },
];

AB.ASSET_MANIFEST.forEach((a) => AB.ID.register(a.id, a));
