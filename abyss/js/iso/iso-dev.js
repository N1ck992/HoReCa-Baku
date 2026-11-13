// =====================================================================
// ISO DEV (дополнение №66). Админ-панель для автора: кнопка «DEV» сверху
// (и на карте дна). Включается «Режим разработчика»; в нём:
//   • переходы по сюжету — страница перезагружается и мир сразу собирается
//     в нужном состоянии (без прохождения сначала);
//   • бессмертие, ресурсы, вылечить отряд, убить врагов рядом, открыть карту.
// Режим помнится в этом браузере (localStorage); на игру без него не влияет.
// =====================================================================

AB.IsoDev = (() => {
  const JUMP_KEY = 'abyss_iso_jump', DEV_KEY = 'abyss_dev';
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* нет хранилища */ } } };
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* нет хранилища */ } } };
  let god = false;
  const on = () => ls.get(DEV_KEY) === '1';

  // ---------- состояния сюжета ----------
  const done = (id) => [id, { stage: 99, status: 'done' }];
  const A1 = ['EVENT-001', 'EVENT-014', 'EVENT-003', 'EVENT-004', 'EVENT-002', 'EVENT-005', 'EVENT-006', 'EVENT-007', 'EVENT-008'];
  const A1END = [...A1, 'EVENT-009', 'EVENT-011', 'EVENT-012'];
  const A2 = [...A1END, 'EVENT-015', 'EVENT-016', 'EVENT-017', 'EVENT-018', 'EVENT-019'];
  const A2END = [...A2, 'EVENT-020'];
  const A3 = [...A2END, 'EVENT-021', 'EVENT-022'];
  const EQ1 = ['EQUIP-008', 'EQUIP-001', 'EQUIP-002', 'EQUIP-010', 'EQUIP-003'];
  const EQ1END = [...EQ1, 'EQUIP-006', 'EQUIP-007'];
  const EQ2 = [...EQ1END, 'EQUIP-011', 'EQUIP-012', 'EQUIP-005'];
  const EQ3 = [...EQ2, 'EQUIP-013', 'EQUIP-014'];
  const DEAD1 = ['ENEMY-001', 'ENEMY-006', 'ENEMY-007', 'ENEMY-004', 'ENEMY-005'];
  const Q1 = [done('QUEST-004'), done('QUEST-001'), done('QUEST-002')];
  const Q1END = [...Q1, done('QUEST-003'), done('QUEST-005')];
  const ARMS = [['CHAR-001', 'ITEM-011'], ['CHAR-002', 'ITEM-012']];
  const RES = [['ITEM-001', 9], ['ITEM-002', 4], ['ITEM-003', 2], ['ITEM-015', 2]];

  const JUMPS = [
    { id: 'a1', group: 'Акт I', name: 'Пробуждение (с самого начала)' },
    { id: 'a1-armory', group: 'Акт I', name: 'Вход в оружейную (перед обороной)', st: () => ({
      sector: 'SECTOR-003', at: { x: 45.5, y: 14.5 }, party: ['CHAR-001', 'CHAR-002'], story: A1, equipment: EQ1, power: true,
      weapons: [['CHAR-001', 'ITEM-009'], ['CHAR-002', 'ITEM-012']], stash: [['ITEM-005', 2]], dead: DEAD1,
      quests: [...Q1, ['QUEST-003', { stage: 0, status: 'active' }]],
    }) },
    { id: 'a1-colossus', group: 'Акт I', name: 'Перед Колоссом (замок взломан)', st: () => ({
      sector: 'SECTOR-003', at: { x: 50.5, y: 17.5 }, party: ['CHAR-001', 'CHAR-002'], story: A1, equipment: EQ1, power: true,
      weapons: ARMS, stash: [['ITEM-005', 2], ['ITEM-009', 1], ['ITEM-007', 3]], dead: DEAD1, nestDone: true, openDoors: ['K', 'N1', 'N2'],
      quests: [...Q1, done('QUEST-005'), ['QUEST-003', { stage: 1, status: 'active' }]],
    }) },
    { id: 'a2', group: 'Акт II', name: 'Начало акта II (шлюз, «Петля»)', st: () => ({
      sector: 'SECTOR-003', at: { x: 72.5, y: 28.5 }, party: ['CHAR-001', 'CHAR-002'], story: A1END, equipment: EQ1END, power: true,
      weapons: ARMS, stash: [['ITEM-005', 2], ['ITEM-009', 1]], dead: [...DEAD1, 'ENEMY-003'], nestDone: true, openDoors: ['K', 'S'],
      quests: Q1END, after: () => { AB.IsoActs.devSet({ act: 1 }); AB.IsoActs.next(1); },
    }) },
    { id: 'a2-out', group: 'Акт II', name: 'Выход за борт (Марк один, Мира у пульта)', st: () => ({
      sector: 'SECTOR-003', at: { x: 79.2, y: 28.5 }, party: ['CHAR-001'], story: A2, equipment: EQ2, power: true,
      weapons: [['CHAR-001', 'ITEM-011']], stash: [['ITEM-005', 2], ['ITEM-009', 1], ['ITEM-014', 1], ['ITEM-001', 3], ['ITEM-002', 1]],
      dead: [...DEAD1, 'ENEMY-003'], nestDone: true, openDoors: ['K', 'S', 'W', 'R', 'V'],
      npcs: [{ id: 'CHAR-002', x: 68.5, y: 25.6, weapon: 'ITEM-012' }],
      quests: [...Q1END, done('QUEST-006'), ['QUEST-007', { stage: 0, status: 'active' }]],
      after: () => { AB.IsoActs.devSet({ act: 2 }); AB.IsoOverworld.setMode('suit'); AB.IsoOverworld.enter(); },
    }) },
    { id: 'a3', group: 'Акт III', name: 'Начало акта III («Капсула»)', st: () => ({
      sector: 'SECTOR-003', at: { x: 72.5, y: 28.5 }, party: ['CHAR-001', 'CHAR-002'], story: A2END, equipment: EQ2, power: true,
      weapons: ARMS, stash: [['ITEM-005', 2], ['ITEM-009', 1], ['ITEM-014', 1], ['ITEM-015', 1], ['ITEM-001', 3], ['ITEM-002', 1]],
      dead: [...DEAD1, 'ENEMY-003', 'ENEMY-008'], nestDone: true, openDoors: ['K', 'S', 'W', 'R', 'V'],
      quests: [...Q1END, done('QUEST-006'), done('QUEST-007')],
      after: () => { AB.IsoActs.devSet({ act: 2 }); AB.IsoActs.next(2); },
    }) },
    { id: 'a3-base', group: 'Акт III', name: 'База-капсула (отстыкована, карта дна)', st: () => ({
      sector: 'SECTOR-003', at: { x: 72.5, y: 28.5 }, party: ['CHAR-001', 'CHAR-002'], story: A3, equipment: EQ3, power: true,
      weapons: ARMS, stash: [['ITEM-005', 2], ['ITEM-009', 1], ['ITEM-014', 1], ...RES],
      dead: [...DEAD1, 'ENEMY-003', 'ENEMY-008'], nestDone: true, openDoors: ['K', 'S', 'W', 'R', 'V', 'X'], flags: ['undocked'],
      quests: [...Q1END, done('QUEST-006'), done('QUEST-007'), done('QUEST-008'), ['QUEST-009', { stage: 0, status: 'active' }]],
      after: () => { AB.IsoActs.devSet({ act: 3 }); AB.IsoOverworld.setMode('capsule'); AB.IsoOverworld.enter(); },
    }) },
    { id: 'a3-up', group: 'Акт III', name: 'Перед всплытием (экипаж и модуль есть)', st: () => ({
      sector: 'SECTOR-003', at: { x: 72.5, y: 28.5 }, party: ['CHAR-001', 'CHAR-002'], story: A3, equipment: EQ3, power: true,
      weapons: ARMS, stash: [['ITEM-005', 2], ['ITEM-009', 1], ...RES],
      dead: [...DEAD1, 'ENEMY-003', 'ENEMY-008'], nestDone: true, openDoors: ['K', 'S', 'W', 'R', 'V', 'X'], flags: ['undocked', 'recruit', 'module'],
      quests: [...Q1END, done('QUEST-006'), done('QUEST-007'), done('QUEST-008'), ['QUEST-009', { stage: 1, status: 'active' }]],
      after: () => { AB.IsoActs.devSet({ act: 3, crew: ['CHAR-001', 'CHAR-002'], built: ['MOD-003'] }); AB.IsoCompanion.give(); AB.Flags.add('surface-ready'); AB.IsoOverworld.setMode('capsule'); AB.IsoOverworld.enter(); },
    }) },
  ];

  function jump(id) {
    if (!on()) return;
    if (id === 'a1') { ss.set(JUMP_KEY, null); location.reload(); return; }
    ss.set(JUMP_KEY, id);
    location.reload();
  }
  // при загрузке страницы (iso-game.js): есть ли отложенный переход — и выполнить его
  function pending() { return !!ss.get(JUMP_KEY) && on(); }
  function boot() {
    const id = ss.get(JUMP_KEY); ss.set(JUMP_KEY, null);
    const j = JUMPS.find((q) => q.id === id);
    AB.IsoGame.bootState(j.st());
    setTimeout(() => AB.Bus.emit('iso:toast', { text: `DEV: ${j.group} — ${j.name}`, kind: 'info' }), 400);
  }

  // ---------- инструменты ----------
  const TOOLS = {
    god() { god = !god; return god ? 'Бессмертие: ВКЛ' : 'Бессмертие: выкл'; },
    res() { for (const [i, n] of [['ITEM-001', 10], ['ITEM-002', 5], ['ITEM-003', 5], ['ITEM-015', 3], ['ITEM-007', 6], ['ITEM-005', 3]]) AB.IsoStash.add(i, n); return 'Ресурсы добавлены'; },
    heal() { for (const id of ['CHAR-001', 'CHAR-002', 'CHAR-003', 'CHAR-004']) { const c = AB.Chars.get(id); if (c && !c.dead) c.hp = AB.ID.get(id).stats.maxHp; } return 'Отряд вылечен'; },
    kill() {
      if (AB.IsoOverworld.isOpen()) return `Тварей на карте убрано: ${AB.IsoOverworld.clearWild()}`;
      let n = 0; for (const e of AB.IsoEnemies.alive()) if (!e.story && AB.ID.get(e.id).type !== 'pursuer') { AB.IsoEnemies.damage(e.id, 99999, null); n++; } return `Убито рядом: ${n}`;
    },
    map() { if (AB.IsoOverworld.revealAll) AB.IsoOverworld.revealAll(); return 'Карта дна открыта'; },
    // №71: конструктор базы
    regolith() { if (!AB.BaseSim.on()) return 'База ещё не отстыкована'; AB.BaseSim.receive('ITEM-016', 30); return 'Реголит ×30 — в приёмник шлюза'; },
    hour() { if (!AB.BaseSim.on()) return 'База ещё не отстыкована'; AB.BaseSim.catchUp(3600); AB.BaseSim.save(); return 'База прожила час (как будто вас не было)'; },
    baseReset() { AB.BaseSim.reset(); return 'База сброшена: при следующем входе — пустой корпус'; },
    terminal() { AB.IsoStash.add('ITEM-011', 1); return 'Наручный терминал — в вещах (или сразу в руках)'; },
  };

  // ---------- панель ----------
  function render() {
    const el = document.getElementById('iso-dev');
    const groups = [...new Set(JUMPS.map((j) => j.group))];
    el.innerHTML = `<div class="inv-card dev-card" role="dialog" aria-label="Админ-панель">
      <div class="inv-head"><div><h2>Админ-панель</h2><div class="muted">Только для разработки: переходы по сюжету и помощь в тестах</div></div><button class="inv-x" data-dev-close aria-label="Закрыть">✕</button></div>
      <label class="dev-sw"><input type="checkbox" data-dev-on ${on() ? 'checked' : ''}> Режим разработчика</label>
      ${on() ? `${groups.map((g) => `<h3>${g}</h3><div class="dev-row">${JUMPS.filter((j) => j.group === g).map((j) => `<button data-jump="${j.id}">${j.name}</button>`).join('')}</div>`).join('')}
      <h3>Инструменты</h3><div class="dev-row">
        <button data-tool="god">${god ? 'Бессмертие: ВКЛ' : 'Бессмертие: выкл'}</button><button data-tool="heal">Вылечить отряд</button>
        <button data-tool="res">+ Ресурсы</button><button data-tool="terminal">+ Наручный терминал</button>
        <button data-tool="kill">Убить врагов рядом</button><button data-tool="map">Открыть карту дна</button>
        <button data-tool="regolith">База: + реголит ×30</button><button data-tool="hour">База: прожить час</button><button data-tool="baseReset">База: сбросить</button></div>
      <p class="muted">Переход перезагружает страницу и сразу ставит героев в выбранное место сюжета с нужными вещами.</p>` : '<p class="muted">Включите режим — появятся переходы по актам и инструменты.</p>'}
    </div>`;
  }
  function open() { const el = document.getElementById('iso-dev'); render(); el.hidden = false; }
  function init() {
    const el = document.getElementById('iso-dev');
    for (const b of document.querySelectorAll('[data-dev-open]')) {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', open);
    }
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-dev-close]') || e.target === el) { el.hidden = true; return; }
      const j = e.target.closest('[data-jump]'); if (j) { jump(j.dataset.jump); return; }
      const t = e.target.closest('[data-tool]');
      if (t) { const msg = TOOLS[t.dataset.tool](); AB.Bus.emit('iso:toast', { text: `DEV: ${msg}`, kind: 'info' }); if (AB.IsoOverworld.isOpen()) AB.IsoOverworld.say(`DEV: ${msg}`); render(); }
    });
    el.addEventListener('change', (e) => { if (e.target.matches('[data-dev-on]')) { ls.set(DEV_KEY, e.target.checked ? '1' : null); if (!e.target.checked) god = false; render(); } });
    // бессмертие: урон по отряду не проходит
    const orig = AB.IsoCombat.damageChar;
    AB.IsoCombat.damageChar = (id, amount, from) => (god ? undefined : orig(id, amount, from));
  }

  return { init, pending, boot, jump, god: () => god, on, JUMPS };
})();
