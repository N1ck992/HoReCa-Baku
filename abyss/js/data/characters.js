// =====================================================================
// Персонажи (GDD §7). Здесь только постоянные данные.
// Изменяемое состояние (здоровье, позиция) хранит CHARACTER SYSTEM.
//
// Смена внешнего вида = смена поля appearance, а не новый персонаж (GDD §2.3).
// =====================================================================

AB.CHARACTERS = [
  {
    id: 'CHAR-001',
    name: 'Главный герой',        // имя в GDD v0.1 не задано
    role: 'Участник экипажа',
    specialization: null,         // не задана в GDD v0.1
    crew: true,                   // обычный участник экипажа (GDD §7)
    stats: { maxHp: 100, speed: 140, runSpeed: 260 },
    skills: {},
    appearances: ['ASSET-CHAR001-01', 'ASSET-CHAR001-02'],
    anims: {
      idle: 'ANIM-CHAR001-05',
      walk: 'ANIM-CHAR001-01',
      run: 'ANIM-CHAR001-02',
      interact: 'ANIM-CHAR001-03',
      hurt: 'ANIM-CHAR001-04',
      wake: 'ANIM-CHAR001-06',
    },
  },
];

AB.CHARACTERS.forEach((c) => AB.ID.register(c.id, c));
