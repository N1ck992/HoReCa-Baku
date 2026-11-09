// =====================================================================
// Акты I–III в изометрии (дополнение №55). Только iso.html — основная игра
// (вид сбоку) этот файл не загружает и работает как раньше.
//
// 1. Правки акта I под линейный маршрут (решение автора: первая локация —
//    обучение, без возвратов): генераторная — за гидропоникой, «Гнездо» —
//    взлом электронного замка наручным терминалом, конец акта — внешние камеры.
// 2. Акт II «Петля» и акт III «Капсула» — ЧЕРНОВИК разработчика по решению
//    автора: «во втором акте продумай сюжет на своё усмотрение… к концу второго
//    акта Марк выходит в костюме один, Мира прикрывает его изнутри через
//    компьютер; он бьёт на карте какого-то моба и возвращается. В третьем акте
//    находим капсулу, она отстыковывается и становится базой: новый герой,
//    новые модули». Все тексты — pending, ждут правки автором.
// =====================================================================

// ---------- Карточки конца актов ----------
AB.ISO_ACTS = {
  1: {
    no: 'Конец первого акта', title: 'Тишина на дне',
    text: 'Внешние камеры показали чёрную воду. «Абисс» лежит на дне чужого океана, на глубине трёх тысяч метров. Портал выбросил корабль неизвестно куда — и неизвестно, сколько веков назад.',
    next: 'Акт II · «Петля» — бортовой журнал и первый выход за борт', cont: 'Продолжить: акт II',
  },
  2: {
    no: 'Конец второго акта', title: 'Петля',
    text: 'Марк вернулся с первым трофеем чужого мира — тёплым кристаллом. А в кармане у него лежит жетон с его собственным номером, который обронил преследователь.',
    next: 'Акт III · «Капсула» — дом, который может двигаться', cont: 'Продолжить: акт III',
  },
  3: {
    no: 'Конец третьего акта', title: 'Дом на дне',
    text: 'Капсула отстыкована и стала базой. На борту — новый член экипажа, к корпусу пристыкован первый модуль. Впереди — поселения, Древние и сигнал машин из глубины.',
    next: 'Продолжение следует', cont: 'Остаться на дне',
  },
};

// ---------- Акт I: линейный маршрут ----------
// нападение преследователя — сразу после запуска генератора (раньше — на складе при свете)
AB.ISO_TRIGGER = { 'EVENT-005': 'after:EVENT-002' };

(() => {
  // конец акта I — внешние камеры (поворот §9): после разговора — затемнение и карточка
  AB.ID.get('EVENT-012').steps.push(
    { at: 4.7, action: 'fade', from: 0, to: 1, duration: 2.0 },
    { at: 6.8, action: 'act_end', act: 1 },
  );
  // Мира: генераторная теперь за гидропоникой
  const d1 = AB.ID.get('DIALOG-001').lines;
  d1[4].text = 'Неважно. Без света мы здесь не выживем. Генераторная — внизу, за гидропоникой. Я знаю код от её двери.';
  d1[5].text = 'Генератору нужны предохранитель, провода и топливо. Топливо — на складе, провода — в гидропонике. Всё по пути.';
  AB.ID.get('DIALOG-005').lines[3].text = 'Там гнездо. И замок там электронный — без наручного терминала из оружейной не открыть. Держись рядом: мои дротики подлатают тебя в бою.';
  // задания акта I
  const q1 = AB.ID.get('QUEST-001').stages.flatMap((s) => s.objectives).find((o) => o.id === 'door');
  q1.text = 'Открыть генераторную — Мира знает код (за гидропоникой, в конце техкоридора)';
  q1.target.room = 'ROOM-014'; q1.target.x = 100;
  const q2 = AB.ID.get('QUEST-002').stages[0].objectives[0];
  q2.text = 'Увести Миру в командный центр — дверь из генераторной';
  q2.target.room = 'ROOM-008'; q2.target.x = 140;
  const q3 = AB.ID.get('QUEST-003').stages;
  q3[0].objectives[0].text = 'Найти наручный терминал в оружейной (шкаф с оружием)';
  const si = q3.findIndex((s) => s.id === 'suit');
  if (si >= 0) q3.splice(si, 1);                       // экзокостюм — уже акт II
  // экзокостюм: сначала ремонт шлема в мастерской (акт II)
  const suit = AB.ID.get('EQUIP-005');
  suit.after.push('EQUIP-011');
  suit.text.after = 'Шлем треснул: уплотнители нужно починить в мастерской';
  suit.text.ready = 'Надеть экзокостюм';
})();

// ---------- Акт II «Петля» (черновик) ----------
AB.EVENTS.push(
  {
    id: 'EVENT-015', name: 'Петля', chapter: 2, room: 'ROOM-010', trigger: 'act:2', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.0, action: 'fade', from: 1, to: 0, duration: 1.6 },
      { at: 0.4, action: 'face', char: 'CHAR-001', target: 'CHAR-002' },
      { at: 1.0, action: 'dialog', id: 'DIALOG-009' },
      { at: 1.1, action: 'unlock_input' },
      { at: 1.1, action: 'hint', text: 'Грузовой лифт в шлюзе открыт: вниз, в мастерскую' },
    ],
  },
  {
    id: 'EVENT-016', name: 'Запись из прошлого', chapter: 2, room: 'ROOM-017', trigger: 'equip:EQUIP-012', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.0, action: 'flicker', duration: 1.0 },
      { at: 0.4, action: 'dialog', id: 'DIALOG-010' },
      { at: 0.5, action: 'unlock_input' },
    ],
  },
  {
    // преследователь снова здесь — и в этот раз он что-то роняет (iso-acts.js)
    id: 'EVENT-017', name: 'Засада в архиве', chapter: 2, room: 'ROOM-017', trigger: 'after:EVENT-016', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'flicker', duration: 1.2 },
      { at: 0.2, action: 'spawn_enemy', enemy: 'ENEMY-002', room: 'ROOM-017', x: 'behind', state: 'APPEAR', facing: 1 },
      { at: 0.4, action: 'flee', char: 'CHAR-002', on: true },
      { at: 0.4, action: 'hint', text: 'Он снова здесь! Защитите Миру' },
    ],
  },
  {
    id: 'EVENT-018', name: 'Жетон', chapter: 2, room: 'ROOM-017', trigger: 'item:ITEM-014', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.2, action: 'face', char: 'CHAR-001', target: 'CHAR-002' },
      { at: 0.3, action: 'dialog', id: 'DIALOG-011' },
      { at: 0.4, action: 'unlock_input' },
      { at: 0.4, action: 'hint', text: 'Переборка открыта: лестница наверх, в шлюз' },
    ],
  },
  {
    // Мира остаётся у пульта внешних камер: Марк выходит один
    id: 'EVENT-019', name: 'Я прикрою', chapter: 2, room: 'ROOM-010', trigger: 'equip:EQUIP-005', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.1, action: 'face', char: 'CHAR-001', target: 'CHAR-002' },
      { at: 0.2, action: 'dialog', id: 'DIALOG-012' },
      { at: 0.3, action: 'equip_apply', equip: 'EQUIP-005' },
      { at: 0.3, action: 'stay', char: 'CHAR-002' },
      { at: 0.4, action: 'walk_equip', char: 'CHAR-002', equip: 'EQUIP-007' },
      { at: 0.5, action: 'unlock_input' },
      { at: 0.5, action: 'hint', text: 'Внешний люк шлюза — выход на дно. Мира на связи' },
    ],
  },
  {
    id: 'EVENT-020', name: 'Возвращение', chapter: 2, room: 'ROOM-010', trigger: 'act2:back', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.2, action: 'walk_to', char: 'CHAR-002', near: 'CHAR-001', gap: 90, speed: 120 },
      { at: 0.2, action: 'wait_arrive', char: 'CHAR-002' },
      { at: 0.3, action: 'face', char: 'CHAR-001', target: 'CHAR-002' },
      { at: 0.4, action: 'dialog', id: 'DIALOG-013' },
      { at: 0.5, action: 'follow', char: 'CHAR-002', leader: 'CHAR-001' },
      { at: 0.6, action: 'fade', from: 0, to: 1, duration: 2.0 },
      { at: 2.7, action: 'act_end', act: 2 },
    ],
  },
);

AB.DIALOGS.push(
  {
    id: 'DIALOG-009', name: 'Петля', event: 'EVENT-015', pending: true,
    lines: [
      { speaker: 'CHAR-001', text: 'Три тысячи метров. Корабль лежит на дне… и, похоже, не один век.' },
      { speaker: 'CHAR-002', text: 'Нам нужно знать, что снаружи. Костюм — единственный выход.' },
      { speaker: 'CHAR-001', text: 'Шлем треснул, уплотнители никуда не годятся. В таком я и десяти метров не пройду.' },
      { speaker: 'CHAR-002', text: 'Под шлюзом — инженерная палуба. Грузовой лифт снова под током, там мастерская.' },
      { speaker: 'CHAR-002', text: 'И архив экспедиции. Бортовой журнал. Я хочу знать, что здесь случилось, Марк.' },
      { speaker: 'CHAR-001', text: 'Я тоже.' },
    ],
  },
  {
    // запись в журнале — намёк на Миру и на время, без прямых ответов (канон §0, §10)
    id: 'DIALOG-010', name: 'Бортовой журнал', event: 'EVENT-016', pending: true,
    lines: [
      { speaker: 'Бортовой журнал', text: 'Запись капитана. День первый после перехода. Портал выбросил нас не туда. Звёзды чужие. Мы падаем.' },
      { speaker: 'Бортовой журнал', text: 'День сороковой. Корабль на дне океана. Шлюзы держат. Половина экипажа в криосне — будим по очереди.' },
      { speaker: 'Бортовой журнал', text: 'День двести двенадцатый. Водоросли из гидропоники кормят всех. Люди стали… другими. Слышат то, чего нет.' },
      { speaker: 'Бортовой журнал', text: 'Год третий. …запись повреждена… …в жилом секторе кто-то есть. Камера видит у кают что-то большое, многоногое. А люди — видят девушку…' },
      { speaker: 'CHAR-001', text: 'Последняя запись — триста двенадцать лет назад. Мы проспали три века.' },
      { speaker: 'CHAR-002', text: 'Там одни помехи, Марк. Журнал битый. Не верь всему, что видишь.' },
    ],
  },
  {
    id: 'DIALOG-011', name: 'Жетон', event: 'EVENT-018', pending: true,
    lines: [
      { speaker: 'CHAR-001', text: 'Жетон экспедиции «Абисса». Номер… это мой номер.' },
      { speaker: 'CHAR-002', text: 'Подделка. Он хочет, чтобы ты сомневался.' },
      { speaker: 'CHAR-001', text: 'Он двигается как я. Бьёт как я. Кто он, Мира?' },
      { speaker: 'CHAR-002', text: 'Тот, кто охотится на меня с первого дня. Пожалуйста, Марк. Костюм.' },
    ],
  },
  {
    id: 'DIALOG-012', name: 'Я прикрою', event: 'EVENT-019', pending: true,
    lines: [
      { speaker: 'CHAR-001', text: 'Готово. Шлем держит.' },
      { speaker: 'CHAR-002', text: 'Я иду с тобой.' },
      { speaker: 'CHAR-001', text: 'Костюм один, Мира. Без него там и минуты не прожить.' },
      { speaker: 'CHAR-002', text: 'Тогда я останусь у пульта. Внешние камеры, сонар, связь — я буду твоими глазами.' },
      { speaker: 'CHAR-002', text: 'Сонар видит что-то крупное у обломков, к северо-востоку. Иди туда — и сразу назад.' },
      { speaker: 'CHAR-001', text: 'Если что-то пойдёт не так…' },
      { speaker: 'CHAR-002', text: 'Не пойдёт. Я прикрою тебя отсюда.' },
    ],
  },
  {
    id: 'DIALOG-013', name: 'Возвращение', event: 'EVENT-020', pending: true,
    lines: [
      { speaker: 'CHAR-002', text: 'Ты вернулся. Сигнал пропал — я думала…' },
      { speaker: 'CHAR-001', text: 'Оно мертво. А под ним лежало вот это.' },
      { speaker: 'CHAR-002', text: 'Кристалл… Он тёплый. Чувствуешь? Как будто дышит.' },
      { speaker: 'CHAR-001', text: 'Там, снаружи, — целый мир. И мы в нём не первые.' },
      { speaker: 'CHAR-002', text: 'Тогда нам нужен не только костюм. Нам нужен дом, который может двигаться.' },
    ],
  },
);

// ---------- Акт III «Капсула» (черновик) ----------
AB.EVENTS.push(
  {
    id: 'EVENT-021', name: 'Капсула', chapter: 3, room: 'ROOM-010', trigger: 'act:3', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.0, action: 'fade', from: 1, to: 0, duration: 1.6 },
      { at: 0.4, action: 'face', char: 'CHAR-001', target: 'CHAR-002' },
      { at: 1.0, action: 'dialog', id: 'DIALOG-014' },
      { at: 1.1, action: 'unlock_input' },
      { at: 1.1, action: 'hint', text: 'Нижний ангар — через мастерскую и архив' },
    ],
  },
  {
    id: 'EVENT-022', name: 'Отстыковка', chapter: 3, room: 'ROOM-018', trigger: 'equip:EQUIP-014', once: true, pending: true,
    steps: [
      { at: 0.0, action: 'lock_input' },
      { at: 0.0, action: 'shake', power: 4, duration: 2.0 },
      { at: 0.2, action: 'dialog', id: 'DIALOG-015' },
      { at: 0.3, action: 'fade', from: 0, to: 1, duration: 1.8 },
      { at: 2.2, action: 'run', fn: 'undock' },
      { at: 2.2, action: 'unlock_input' },
    ],
  },
);

AB.DIALOGS.push(
  {
    id: 'DIALOG-014', name: 'Капсула', event: 'EVENT-021', pending: true,
    lines: [
      { speaker: 'CHAR-002', text: 'Пока тебя не было, я читала журнал. Под архивом — нижний ангар.' },
      { speaker: 'CHAR-002', text: 'Там исследовательская капсула. На ней экспедиция выходила к порталам.' },
      { speaker: 'CHAR-001', text: 'Её можно отстыковать?' },
      { speaker: 'CHAR-002', text: 'Если дать ей энергию. Реактор пуст — но кристалл светится сильнее любой батареи.' },
      { speaker: 'CHAR-001', text: 'Дом, который может двигаться. Идём.' },
    ],
  },
  {
    id: 'DIALOG-015', name: 'Отстыковка', event: 'EVENT-022', pending: true,
    lines: [
      { speaker: 'CHAR-001', text: 'Захваты отпущены. Держись!' },
      { speaker: 'CHAR-002', text: 'Мы свободны… Марк, мы правда свободны.' },
      { speaker: 'CHAR-001', text: 'Это теперь наш дом. Отсюда и начнём.' },
    ],
  },
);

// ---------- Задания актов II–III ----------
AB.QUESTS.push(
  {
    id: 'QUEST-006', name: 'Ремонт экзокостюма', pending: true,
    desc: 'Шлем экзокостюма треснул. Запчасти — в инженерной мастерской под шлюзом.',
    start: { event: 'EVENT-015' }, requires: [], items: ['ITEM-002'], skills: ['repair'], rooms: ['ROOM-004', 'ROOM-017'],
    stages: [
      { id: 'down', objectives: [{ id: 'down', text: 'Спуститься грузовым лифтом в мастерскую', done: { room: 'ROOM-004' }, target: { room: 'ROOM-004', x: 300 } }] },
      { id: 'bench', objectives: [{ id: 'bench', text: 'Починить уплотнители на верстаке (запчасти — в ящике)', done: { equip: 'EQUIP-011', state: 'done' }, target: { equip: 'EQUIP-011' } }] },
      { id: 'log', objectives: [{ id: 'log', text: 'Открыть бортовой журнал в архиве', done: { equip: 'EQUIP-012', state: 'done' }, target: { equip: 'EQUIP-012' } }] },
      { id: 'tag', objectives: [{ id: 'tag', text: 'Отбиться от преследователя', done: { event: 'EVENT-018' }, target: { room: 'ROOM-017', x: 500 } }] },
      { id: 'suit', objectives: [{ id: 'suit', text: 'Вернуться в шлюз и надеть экзокостюм', done: { equip: 'EQUIP-005', state: 'done' }, target: { equip: 'EQUIP-005' } }] },
    ],
    reward: {}, next: [],
  },
  {
    id: 'QUEST-007', name: 'Первый выход', pending: true,
    desc: 'Марк выходит за борт один. Мира у пульта: камеры, сонар, связь.',
    start: { event: 'EVENT-019' }, requires: [], items: [], skills: [], rooms: ['ROOM-010', 'ROOM-019'],
    stages: [
      { id: 'out', objectives: [{ id: 'out', text: 'Выйти за борт через внешний люк шлюза', done: { flag: 'ow-out' }, target: { room: 'ROOM-010', x: 1430 } }] },
      { id: 'hunt', objectives: [{ id: 'hunt', text: 'Найти то, что засёк сонар, — и убить', done: { enemyDead: 'ENEMY-008' } }] },
      { id: 'home', objectives: [{ id: 'home', text: 'Вернуться на «Абисс»', done: { flag: 'ow-back' } }] },
    ],
    reward: {}, next: [],
  },
  {
    id: 'QUEST-008', name: 'Капсула', pending: true,
    desc: 'В нижнем ангаре — исследовательская капсула. С кристаллом её реактор оживёт.',
    start: { event: 'EVENT-021' }, requires: [], items: ['ITEM-015'], skills: ['repair'], rooms: ['ROOM-018'],
    stages: [
      { id: 'hangar', objectives: [{ id: 'hangar', text: 'Спуститься в нижний ангар (через мастерскую и архив)', done: { room: 'ROOM-018' }, target: { room: 'ROOM-018', x: 400 } }] },
      { id: 'reactor', objectives: [{ id: 'reactor', text: 'Зарядить реактор капсулы кристаллом', done: { equip: 'EQUIP-013', state: 'done' }, target: { equip: 'EQUIP-013' } }] },
      { id: 'undock', objectives: [{ id: 'undock', text: 'Отстыковать капсулу с пульта', done: { equip: 'EQUIP-014', state: 'done' }, target: { equip: 'EQUIP-014' } }] },
    ],
    reward: {}, next: [],
  },
  {
    id: 'QUEST-009', name: 'Дом на дне', pending: true,
    desc: 'Капсула — база экипажа. Нужны люди и модули.',
    start: { event: 'EVENT-022' }, requires: [], items: [], skills: [], rooms: [],
    stages: [
      { id: 'base', objectives: [
        { id: 'crew', text: 'Найти выжившего — сигнал из «Отсека на склоне»', done: { flag: 'recruit' } },
        { id: 'module', text: 'Собрать ресурсы и пристроить к капсуле модуль (кнопка «База»)', done: { flag: 'module' } },
      ] },
    ],
    reward: {}, next: [],
  },
);

// ---------- База-капсула: модули (черновик) ----------
AB.ISO_MODULES = [
  { id: 'MOD-001', name: 'Жилой отсек', built: true, desc: 'Сердце капсулы: койки, пульт, шлюз. Здесь живёт экипаж.' },
  { id: 'MOD-002', name: 'Сонар', cost: [['ITEM-002', 2], ['ITEM-015', 1]], effect: 'view', desc: 'Капсула видит дальше: туман на карте открывается на 4 клетки вместо 2.' },
  { id: 'MOD-003', name: 'Лазарет', cost: [['ITEM-001', 3], ['ITEM-002', 1]], effect: 'heal', desc: 'Экипаж залечивает раны: на базе здоровье восстанавливается полностью.' },
  { id: 'MOD-004', name: 'Мастерская', cost: [['ITEM-001', 4], ['ITEM-003', 2]], effect: 'craft', desc: 'Верстак и станок. Здесь будут чинить снаряжение и собирать новое.' },
];

// ---------- Что можно сделать в точках карты дна (черновик) ----------
// act — с какого акта точка видна; encounter — бой в изометрии; loot — находки (один раз);
// recruit — кто присоединяется к экипажу базы; say — что говорит Мира по связи.
AB.ISO_SITES = {
  contact: { act: 2, encounter: 'SECTOR-004', label: 'Подойти ближе', say: 'Мира: «Цель прямо перед тобой. Осторожно, Марк»' },
  'wreck-a': { act: 3, loot: [['ITEM-001', 6], ['ITEM-002', 3]], label: 'Разобрать обломки', say: 'Обшивка чужого корабля: металлолом и электроника' },
  crystals: { act: 3, loot: [['ITEM-015', 2]], label: 'Собрать кристаллы', say: 'Два кристалла — тёплые, светятся изнутри' },
  beacon: { act: 3, loot: [['ITEM-002', 2], ['ITEM-003', 2]], label: 'Снять оборудование', say: 'Старый маяк машин: электроника и провода' },
  'wreck-b': { act: 3, recruit: 'CHAR-004', loot: [['ITEM-003', 2]], label: 'Войти в отсек',
    say: 'В отсеке — живой. Наполовину машина: «Мой корабль упал сюда задолго до вашего. Возьмите меня с собой — я знаю это дно»' },
  settlement: { act: 3, label: 'Подойти к куполам', say: 'Из динамиков: «Люди с нового корабля? Уходите. Древние не любят чужих»', repeat: true },
};

// точка, которую засёк сонар Миры (акт II): к северо-востоку от «Абисса»
AB.OVERWORLD.sites.push({ key: 'contact', q: 2, r: -2, kind: 'swarm', name: 'Сигнал сонара', pending: true,
  desc: 'Мира: «Крупная цель у обломков. Почти не двигается — будто ждёт».' });

// регистрация новых ID
['EVENT-015', 'EVENT-016', 'EVENT-017', 'EVENT-018', 'EVENT-019', 'EVENT-020', 'EVENT-021', 'EVENT-022']
  .forEach((id) => AB.ID.register(id, AB.EVENTS.find((e) => e.id === id)));
['DIALOG-009', 'DIALOG-010', 'DIALOG-011', 'DIALOG-012', 'DIALOG-013', 'DIALOG-014', 'DIALOG-015']
  .forEach((id) => AB.ID.register(id, AB.DIALOGS.find((d) => d.id === id)));
['QUEST-006', 'QUEST-007', 'QUEST-008', 'QUEST-009'].forEach((id) => AB.ID.register(id, AB.QUESTS.find((q) => q.id === id)));
AB.ISO_MODULES.forEach((m) => AB.ID.register(m.id, { ...m, pending: true }));
