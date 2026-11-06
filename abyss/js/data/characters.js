// =====================================================================
// Персонажи (GDD §7). Здесь только постоянные данные.
// Изменяемое состояние (здоровье, позиция) хранит CHARACTER SYSTEM.
//
// Смена внешнего вида = смена поля appearance, а не новый персонаж (GDD §2.3).
// =====================================================================

AB.CHARACTERS = [
  {
    id: 'CHAR-001',
    name: 'Марк',                 // утверждено (дополнение к GDD, docs/GDD-CHANGES.md)
    role: 'Инженер, участник экипажа',
    specialization: 'engineer',   // инженер: ремонт оборудования (GDD §7)
    crew: true,                   // обычный участник экипажа (GDD §7)
    stats: { maxHp: 100, speed: 140, runSpeed: 260 },
    skills: { repair: true },    // инженер: чинит оборудование (GDD §7)
    appearances: ['ASSET-CHAR001-01', 'ASSET-CHAR001-02'],
    anims: {
      idle: 'ANIM-CHAR001-05',
      walk: 'ANIM-CHAR001-01',
      run: 'ANIM-CHAR001-02',
      interact: 'ANIM-CHAR001-03',
      hurt: 'ANIM-CHAR001-04',
      wake: 'ANIM-CHAR001-06',
      attack: 'ANIM-CHAR001-07',
      death: 'ANIM-CHAR001-08',
    },
  },
];

// CHAR-002 — спутница (GDD §3). Имя, внешность и реплики ждут утверждения:
// пока имя-заглушка и графика-заглушка (силуэт) с ID ресурса.
AB.CHARACTERS.push({
  id: 'CHAR-002',
  name: 'Спутница',           // заглушка: представляется коллегой Марка по экспедиции — имя не задано
  role: 'Говорит, что раньше работала с Марком (на самом деле — неизвестный организм, docs/STORY.md §4)',
  specialization: null,
  crew: false,
  stats: { maxHp: 80, speed: 120, runSpeed: 230 },
  skills: {},
  appearances: ['ASSET-CHAR002-01'],
  // цвета силуэта-заглушки
  look: { dark: '#221c22', mid: '#3c3038', light: '#55464e', hair: '#1a1416', build: 0.92 },
  anims: {
    idle: 'ANIM-CHAR002-05',
    walk: 'ANIM-CHAR002-01',
    run: 'ANIM-CHAR002-02',
    interact: 'ANIM-CHAR002-03',
    hurt: 'ANIM-CHAR002-04',
    death: 'ANIM-CHAR002-06',
    attack: 'ANIM-CHAR002-07',
  },
});

// CHAR-003 — медик (дополнение №6). Имя и внешность — предложение, ждут правки.
AB.CHARACTERS.push({
  id: 'CHAR-003',
  name: 'Доктор Хейл',          // судовой врач, женщина (docs/STORY.md §5); имя — ждёт утверждения
  role: 'Медик',
  specialization: 'medic',
  crew: true,
  stats: { maxHp: 90, speed: 110, runSpeed: 210 },
  skills: { heal: true },
  appearances: ['ASSET-CHAR003-01'],
  look: { dark: '#2b2d2f', mid: '#6e7372', light: '#8f9493', hair: '#3a2e28', build: 0.94 },
  // разговор лечит Марка и спутницу (пока он в безопасной зоне)
  npc: { action: 'Поговорить с доктором', heal: true },
  anims: {
    idle: 'ANIM-CHAR003-05',
    walk: 'ANIM-CHAR003-01',
    run: 'ANIM-CHAR003-02',
    interact: 'ANIM-CHAR003-03',
    hurt: 'ANIM-CHAR003-04',
  },
});

AB.CHARACTERS.forEach((c) => AB.ID.register(c.id, c));
