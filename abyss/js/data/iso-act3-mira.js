// =====================================================================
// Акт III: разоблачение Миры (дополнение №118, канон — docs/STORY.md §0,
// второе уточнение 2026-11-15). Этапы 1–3:
//   1. сбои ЭХО рядом с Мирой и маячок доктора Хейл (после первого устройства базы);
//   2. капсула возвращается к «Абиссу»: Хейл в коконе в лаборатории, раненый
//      преследователь отдаёт латунную линзу;
//   3. ангар: в линзе Мира — существо Роя; бой, фаза 1 «Иллюзия» (Мира и её копии).
// Фазы 2–3 («Паутина», «Разум») и финал со спорой — позже; сейчас после фазы 1
// Мира уходит в вентиляцию, Марк и Хейл уходят на капсуле (временная развязка).
// Логика — js/iso/iso-mira.js. Тексты — черновик, ждут правки автором.
// =====================================================================

// ---------- вещи, оборудование, противник ----------
AB.ITEMS.push({
  id: 'ITEM-022', name: 'Латунная линза', short: 'ЛНЗ', category: 'key', stack: 1, icon: null, use: null, pending: true,
  desc: 'Оптический прибор преследователя: латунь, круглое стекло, разъём как у наручного терминала Марка. Сквозь неё не действуют внушения — видно то, что есть на самом деле.',
});
AB.ID.register('ITEM-022', AB.ITEMS.find((i) => i.id === 'ITEM-022'));

AB.EQUIPMENT.push({
  id: 'EQUIP-017', name: 'Кокон из паутины', room: 'ROOM-007', asset: null, x: 600, y: -100, w: 160, h: 200,
  time: 2.0, pending: true,
  text: { ready: 'Разрезать кокон', done: 'Кокон вскрыт' },
});
AB.ID.register('EQUIP-017', AB.EQUIPMENT.find((e) => e.id === 'EQUIP-017'));

// Мира в бою. Облик — как у CHAR-002 (look); поведение — свой тип 'mira' (iso-mira.js).
// Копии — ENEMY-011~c1… (та же запись; 1 удар — и лопаются облаком спор).
AB.ENEMIES.push({
  id: 'ENEMY-011', name: 'Мира', type: 'mira', look: 'CHAR-002', pending: true,
  hp: 240, dart: 7, stats: { maxHp: 240, speed: 110, runSpeed: 150 }, behavior: { retreatBelow: 0 },
  anims: {}, carry: null, spawn: null,
});
AB.ID.register('ENEMY-011', AB.ENEMIES.find((e) => e.id === 'ENEMY-011'));

// ---------- сцены ----------
AB.EVENTS.push(
  {
    // этап 1: в базе после первого устройства — ЭХО сбоит рядом с Мирой и ловит маячок Хейл
    id: 'EVENT-024', name: 'Сбой ЭХО', chapter: 3, room: 'ROOM-021', trigger: 'act3:echo', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.0, action: 'flicker', duration: 0.8 },
      { at: 0.4, action: 'dialog', id: 'DIALOG-017' },
      { at: 0.5, action: 'unlock_input' },
      { at: 0.5, action: 'hint', text: 'Маячок доктора Хейл — на «Абиссе». Пульт базы → карта дна → «Абисс» → «Пристыковаться»' },
    ],
  },
  {
    // этап 2: Хейл в коконе (лаборатория)
    id: 'EVENT-025', name: 'Кокон', chapter: 3, room: 'ROOM-007', trigger: 'equip:EQUIP-017', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.1, action: 'run', fn: 'haleOut' },
      { at: 0.3, action: 'face', char: 'CHAR-001', target: 'CHAR-003' },
      { at: 0.5, action: 'dialog', id: 'DIALOG-018' },
      { at: 0.6, action: 'run', fn: 'haleJoin' },
      { at: 0.6, action: 'unlock_input' },
    ],
  },
  {
    // этап 2: раненый преследователь отдаёт линзу
    id: 'EVENT-026', name: 'Линза', chapter: 3, room: 'ROOM-007', trigger: 'after:EVENT-025', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.2, action: 'flicker', duration: 1.0 },
      { at: 0.4, action: 'spawn_enemy', enemy: 'ENEMY-002', room: 'ROOM-007', x: 'behind', state: 'WATCH', facing: -1 },
      { at: 0.8, action: 'face', char: 'CHAR-001', target: 'ENEMY-002' },
      { at: 0.9, action: 'dialog', id: 'DIALOG-019' },
      { at: 1.0, action: 'give_item', char: 'CHAR-001', item: 'ITEM-022' },
      { at: 1.0, action: 'flicker', duration: 0.8 },
      { at: 1.4, action: 'despawn_enemy', enemy: 'ENEMY-002' },
      { at: 1.5, action: 'run', fn: 'miraToHangar' },
      { at: 1.5, action: 'unlock_input' },
      { at: 1.5, action: 'hint', text: 'Капсула ждёт в нижнем ангаре (под архивом). Там — Мира' },
    ],
  },
  {
    // этап 3: ангар — Мира в линзе; бой, фаза «Иллюзия»
    id: 'EVENT-027', name: 'Сквозь линзу', chapter: 3, room: 'ROOM-018', trigger: 'enter:ROOM-018', needsFlag: 'lens', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.2, action: 'walk_to', char: 'CHAR-002', near: 'CHAR-001', gap: 220, speed: 110 },
      { at: 0.2, action: 'wait_arrive', char: 'CHAR-002' },
      { at: 0.3, action: 'face', char: 'CHAR-001', target: 'CHAR-002' },
      { at: 0.3, action: 'face', char: 'CHAR-002', target: 'CHAR-001' },
      { at: 0.4, action: 'dialog', id: 'DIALOG-020' },
      { at: 0.5, action: 'true_form', at_char: 'CHAR-002', duration: 2.4 },
      { at: 0.5, action: 'shake', power: 3, duration: 1.2 },
      { at: 2.6, action: 'dialog', id: 'DIALOG-021' },
      { at: 2.7, action: 'run', fn: 'miraFight' },
      { at: 2.7, action: 'unlock_input' },
      { at: 2.7, action: 'hint', text: 'Мира и её копии! В линзе настоящая обведена — бейте её. Копии лопаются спорами' },
    ],
  },
  {
    // временная развязка до фаз 2–3: Мира уходит, Марк и Хейл — в капсулу
    id: 'EVENT-028', name: 'Побег', chapter: 3, room: 'ROOM-018', trigger: 'mira:fled', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.0, action: 'shake', power: 5, duration: 1.6 },
      { at: 0.1, action: 'run', fn: 'miraGone' },
      { at: 0.3, action: 'dialog', id: 'DIALOG-022' },
      { at: 0.4, action: 'fade', from: 0, to: 1, duration: 1.6 },
      { at: 2.1, action: 'run', fn: 'escape' },
      { at: 2.1, action: 'unlock_input' },
    ],
  },
);

AB.DIALOGS.push(
  {
    id: 'DIALOG-017', name: 'Сбой ЭХО', event: 'EVENT-024', pending: true,
    lines: [
      { speaker: 'EQUIP-016', text: 'Внимание. Рядом с ведущим — неопознанная биомасса. Класс… не определён.' },
      { speaker: 'CHAR-001', text: 'Где? Здесь только мы с Мирой.' },
      { speaker: 'EQUIP-016', text: 'Повторный скан. …Ошибка. Камера отводится сама. Я не могу на неё смотреть.' },
      { speaker: 'CHAR-002', text: 'Он старый, Марк. Его надо перепрошить, пока он не начал видеть монстров в каждой тени.' },
      { speaker: 'EQUIP-016', text: 'Новый сигнал. Медицинский браслет экипажа «Абисса»: доктор Хейл. Пульс есть. Слабый.' },
      { speaker: 'CHAR-001', text: 'Хейл жива? Ты говорила, она сбежала… и, скорее всего, погибла.' },
      { speaker: 'CHAR-002', text: 'Это ловушка. Браслет мог остаться на ком угодно.' },
      { speaker: 'CHAR-001', text: 'Если там живой человек — я его не брошу. Возвращаемся к «Абиссу».' },
    ],
  },
  {
    id: 'DIALOG-018', name: 'Кокон', event: 'EVENT-025', pending: true,
    lines: [
      { speaker: 'CHAR-003', text: '…Свет. Кто… Марк? Ты живой.' },
      { speaker: 'CHAR-001', text: 'Доктор Хейл. Вы были в коконе. Кто это сделал?' },
      { speaker: 'CHAR-003', text: 'Та, что ходит рядом с тобой. Она усыпила меня на мостике и замотала в эту массу. Не съела — просто убрала с дороги.' },
      { speaker: 'CHAR-003', text: 'Ты видишь девушку, Марк. Я видела, что стоит за ней. Многоногое. Рой.' },
      { speaker: 'CHAR-001', text: 'Я не знаю, кому верить.' },
      { speaker: 'CHAR-003', text: 'Тогда держись рядом со мной. Мой пистолет со снотворным — его она боится.' },
    ],
  },
  {
    id: 'DIALOG-019', name: 'Линза', event: 'EVENT-026', pending: true,
    lines: [
      { speaker: 'CHAR-003', text: 'Марк… за тобой!' },
      { speaker: 'ENEMY-002', text: 'Не стреляйте. Я ранен. Я не за вами.' },
      { speaker: 'CHAR-001', text: 'Ты охотишься за Мирой с первого дня. Зачем?' },
      { speaker: 'ENEMY-002', text: 'Потому что однажды я её не остановил. Возьми.' },
      { speaker: 'ENEMY-002', text: 'Посмотри на неё моими глазами. Я однажды не посмотрел.' },
      { speaker: 'CHAR-001', text: 'Линза… разъём как у моего терминала. Кто ты такой?' },
      { speaker: 'ENEMY-002', text: 'Тот, кем ты станешь, если не посмотришь.' },
    ],
  },
  {
    id: 'DIALOG-020', name: 'Сквозь линзу', event: 'EVENT-027', pending: true,
    lines: [
      { speaker: 'CHAR-002', text: 'Марк! Ты вернулся. Капсула готова, уходим. …А она что здесь делает?' },
      { speaker: 'CHAR-001', text: 'Подожди, Мира. Я хочу кое-что проверить.' },
      { speaker: 'CHAR-002', text: 'Что это у тебя? Убери. Марк, пожалуйста, убери это.' },
    ],
  },
  {
    id: 'DIALOG-021', name: 'Рой', event: 'EVENT-027', pending: true,
    lines: [
      { speaker: 'CHAR-001', text: 'Ноги. Глаза. Всё это время…' },
      { speaker: 'CHAR-002', text: 'Почему ты так смотришь? Это же я. Я всегда была такой.' },
      { speaker: 'CHAR-002', text: 'Вы пугаетесь всего, что на вас не похоже. Лицо было для тебя — чтобы тебе было спокойнее. Не для меня.' },
      { speaker: 'CHAR-002', text: 'Я никогда не хотела тебе зла, Марк. Мне нужна поверхность — тебе тоже. Вместе мы выберемся.' },
      { speaker: 'CHAR-003', text: 'Она внушает тебе, Марк! Не слушай её — бей ту, что в линзе!' },
      { speaker: 'CHAR-002', text: 'Опусти оружие. Не заставляй меня тебя удерживать.' },
    ],
  },
  {
    id: 'DIALOG-022', name: 'Побег', event: 'EVENT-028', pending: true,
    lines: [
      { speaker: 'CHAR-002', text: 'Хватит! Я не хочу драться с тобой, Марк. Я просто заботилась о тебе.' },
      { speaker: 'CHAR-002', text: 'Подумай, кто вытащил тебя из темноты. Я найду тебя — и ты поймёшь.' },
      { speaker: 'CHAR-003', text: 'Она в вентиляции! В капсулу, быстро, пока она не вернулась!' },
    ],
  },
);

// ---------- задание ----------
AB.QUESTS.push({
  id: 'QUEST-010', name: 'Сигнал доктора Хейл', pending: true,
  desc: 'ЭХО поймал маячок доктора Хейл на «Абиссе». Мира говорит, что это ловушка.',
  start: { event: 'EVENT-024' }, requires: [], items: [], skills: [], rooms: ['ROOM-007', 'ROOM-018'],
  stages: [
    { id: 'dock', objectives: [{ id: 'dock', text: 'Привести капсулу к «Абиссу» и пристыковаться', done: { flag: 'abyss-back' } }] },
    { id: 'cocoon', objectives: [{ id: 'cocoon', text: 'Найти доктора Хейл: сигнал из лаборатории (за оружейной)', done: { equip: 'EQUIP-017', state: 'done' }, target: { equip: 'EQUIP-017' } }] },
    { id: 'lens', objectives: [{ id: 'lens', text: 'Выбраться из лаборатории', done: { flag: 'lens' } }] },
    { id: 'hangar', objectives: [{ id: 'hangar', text: 'Вернуться к капсуле — нижний ангар', done: { flag: 'mira-fight' }, target: { room: 'ROOM-018', x: 400 } }] },
    { id: 'fight', objectives: [{ id: 'fight', text: 'Мира: бей настоящую — она обведена в линзе', done: { flag: 'mira-fled' } }] },
  ],
  reward: {}, next: [],
});
AB.ID.register('QUEST-010', AB.QUESTS.find((q) => q.id === 'QUEST-010'));

['EVENT-024', 'EVENT-025', 'EVENT-026', 'EVENT-027', 'EVENT-028'].forEach((id) => AB.ID.register(id, AB.EVENTS.find((e) => e.id === id)));
['DIALOG-017', 'DIALOG-018', 'DIALOG-019', 'DIALOG-020', 'DIALOG-021', 'DIALOG-022'].forEach((id) => AB.ID.register(id, AB.DIALOGS.find((d) => d.id === id)));

// конец акта III — теперь без Миры (временно, до финала со спорой)
AB.ISO_ACTS[3].text = 'Капсула сбросила балласт и пошла вверх сквозь три тысячи метров чёрной воды. На борту — Марк и доктор Хейл. Миры нет. Над головой впервые за века — свет. Но в тишине Марку всё ещё слышится её голос.';
