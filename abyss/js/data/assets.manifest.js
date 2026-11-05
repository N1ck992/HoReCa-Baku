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

  // ---- ROOM-TMP-001: первый коридор (временный ID, ждёт утверждения) ----
  { id: 'ASSET-ROOMTMP001-01', owner: 'ROOM-TMP-001', type: 'background', src: null, desc: 'Фон: первый коридор' },

  // ---- Общие элементы ----
  { id: 'ASSET-SHARED-01', owner: null, type: 'prop', src: null, desc: 'Гермодверь' },
];

AB.ASSET_MANIFEST.forEach((a) => AB.ID.register(a.id, a));
