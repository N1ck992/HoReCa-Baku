// =====================================================================
// ОРУЖИЕ (дополнение №130). Единый реестр: у каждого оружия — параметры боя, звуки и описание дизайна.
// Источник истины для параметров: при загрузке они записываются в предмет (item.weapon), поэтому
// остальной код читает их как раньше. Здесь же — привязка звуков: AB.Weapons.sound(id, 'shot').
//
// Как добавить оружие:
//   1. предмет в js/data/items.js (category: 'weapon'; поле — пустое `weapon: {}`, его наполнит этот реестр);
//   2. запись здесь: params (урон, дальность, перезарядка…), sound (группы из assets/audio/sounds.json),
//      design (картинка/иконка/как рисуется в руке);
//   3. файлы — в папку assets/weapons/<имя>/ (source — исходники звуков и картинок, design — рисунки);
//   4. строка в docs/GDD-CHANGES.md и в таблице assets/weapons/README.md.
//
// params — единицы как у всего боя: damage — урон за попадание, range — px (50 px = 1 клетка),
// cooldown — секунды между выстрелами, hitAt — когда в замахе происходит попадание, ranged — дальний бой,
// infinite — без боезапаса, energy/heatPerShot/coolRate/coolDelay — перегрев плазмы, dart/cutter/inArt —
// как рисуется выстрел и оружие в руке (см. renderer.js drawWeapon, iso-render.js), aura — лечение рядом,
// vuln — «уязвимость» цели (множитель урона, секунды), bash — удар вплотную при пустом выстреле.
// sound — имена групп звуков: shot (выстрел), hit (попадание); null — используется общий звук по умолчанию.
// =====================================================================

AB.WEAPONS = {
  'ITEM-009': {
    name: 'Ручной резак', kind: 'ranged', folder: 'assets/weapons/cutter',
    params: { damage: 40, range: 480, cooldown: 0.75, hitAt: 0.08, ranged: true, infinite: true, cutter: true, bash: 12 },
    sound: { shot: 'cutter_shot', hit: null },
    design: { icon: 'ASSET-ITEM009-01', held: 'заглушка в коде (renderer.js, cutter)', status: 'картинка — ждёт автора' },
    notes: 'Раньше — труба. Дуга на расстоянии, по одной цели; мутанту (80) хватает двух попаданий. Звук — лазерный выстрел от автора.',
  },
  'ITEM-011': {
    name: 'Наручный терминал', kind: 'energy', folder: 'assets/weapons/terminal',
    params: { damage: 40, range: 680, cooldown: 0.55, hitAt: 0.1, ranged: true, energy: true, heatPerShot: 0.2, coolRate: 0.4, coolDelay: 0.6, bash: 10 },
    sound: { shot: null, hit: null },
    design: { icon: 'ASSET-ITEM011-01', held: 'картинка на предплечье (ASSET-ITEM011-01)', status: 'готово' },
    notes: 'Плазмомёт без боезапаса, перегревается; взлом электронных замков.',
  },
  'ITEM-012': {
    name: 'Дротиковый пистолет', kind: 'ranged', folder: 'assets/weapons/dart-pistol',
    params: { damage: 7, range: 560, cooldown: 0.85, hitAt: 0.1, ranged: true, infinite: true, dart: true, bash: 4, aura: { radius: 230, heal: 1.6 } },
    sound: { shot: null, hit: null },
    design: { icon: 'ASSET-ITEM012-01', held: 'заглушка в коде (renderer.js, dart)', status: 'картинка — ждёт автора' },
    notes: 'Оружие Миры: слабый выстрел, лечит союзников рядом. Звук — синтезированный «dart» (iso-audio.js).',
  },
  'ITEM-023': {
    name: 'Инжектор уязвимости', kind: 'ranged', folder: 'assets/weapons/injector',
    params: { damage: 3, range: 520, cooldown: 1.3, hitAt: 0.1, ranged: true, infinite: true, dart: true, bash: 3, vuln: { mult: 1.5, time: 6 }, aura: { radius: 200, heal: 0.8 }, inArt: true },
    sound: { shot: null, hit: null },
    design: { icon: null, held: 'нарисован на картинке профессора Хейл (assets/source/CHAR003-01.png)', status: 'готово (на картинке героя)' },
    notes: 'Оружие профессора Хейл: ампула делает цель уязвимее — 6 с любой урон ×1,5.',
  },
  'EQUIP-005': {
    name: 'Манипуляторы экзокостюма', kind: 'melee', folder: 'assets/weapons/exosuit-arms',
    params: null,   // параметры — в скелете костюма (js/data/rigs/EXOSUIT.js, weapon)
    sound: { shot: null, hit: null },
    design: { icon: null, held: 'часть картинки костюма (assets/exosuit)', status: 'готово' },
    notes: 'Бьёт на 2 клетки; не предмет — параметры лежат в скелете EXOSUIT.',
  },
};

AB.Weapons = (() => {
  // записать параметры в предметы (вызывается при загрузке; пропускает предметы, которых в этой версии игры нет)
  function apply() {
    for (const [id, w] of Object.entries(AB.WEAPONS)) {
      if (!w.params || !AB.ID.has(id)) continue;
      // запись предмета в реестре ID заморожена, поэтому наполняем объект weapon, заданный в предмете (пустой `weapon: {}`)
      const it = AB.ID.get(id);
      if (!it.weapon) { console.warn(`[Weapons] у ${id} нет поля weapon: {} в предмете`); continue; }
      Object.assign(it.weapon, JSON.parse(JSON.stringify(w.params)));
    }
  }
  apply();
  return {
    apply,
    get: (id) => AB.WEAPONS[id] || null,
    // имя группы звука для оружия: kind — 'shot' | 'hit'; null — звук по умолчанию
    sound: (id, kind = 'shot') => (AB.WEAPONS[id] && AB.WEAPONS[id].sound && AB.WEAPONS[id].sound[kind]) || null,
    list: () => Object.entries(AB.WEAPONS).map(([id, w]) => ({ id, ...w })),
  };
})();
