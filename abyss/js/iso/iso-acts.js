// =====================================================================
// ISO ACTS (дополнение №55). Связка актов I–III в изометрии: какой сейчас
// акт, переходы между актами (карточка → следующий акт), отметки прохождения
// (AB.Flags — для заданий), выход Марка за борт одного (акт II), схватка на
// дне, база-капсула (акт III): находки в точках карты, новый член экипажа,
// модули. Данные — js/data/iso-acts.js (черновик, ждёт автора).
// =====================================================================

AB.Flags = (() => { const f = new Set(); return { has: (k) => f.has(k), add: (k) => { f.add(k); AB.Quests && AB.Quests.check(); } }; })();

AB.IsoActs = (() => {
  let act = 1;
  const crew = ['CHAR-001', 'CHAR-002'];          // экипаж базы
  const built = new Set(AB.ISO_MODULES.filter((m) => m.built).map((m) => m.id));
  const visited = new Set();                      // точки карты, где уже всё взяли
  let pendingBack = false;
  const toast = (text, kind = 'info') => AB.Bus.emit('iso:toast', { text, kind });

  // ---------- переходы между актами ----------
  AB.Bus.on('act:end', ({ act: a }) => { act = Math.max(act, a); });
  function next(a) {
    if (a === 1) { act = 2; AB.IsoStory.trigger('act:2'); }
    else if (a === 2) { act = 3; AB.IsoStory.trigger('act:3'); }
  }

  // ---------- Акт II: архив, жетон, выход за борт ----------
  // преследователь отступил после засады в архиве — роняет жетон
  AB.Bus.on('enemy:retreat', ({ id }) => {
    if (id !== 'ENEMY-002' || !AB.IsoStory.isDone('EVENT-017') || AB.IsoStory.isDone('EVENT-018') || AB.Flags.has('tag-dropped')) return;
    AB.Flags.add('tag-dropped');
    const m = AB.IsoParty.find('CHAR-002'); if (m) m.flee = false;
    AB.Rooms.dropItem('ROOM-017', 'ITEM-014', 1, 500);
    setTimeout(() => toast('Он что-то обронил, когда уходил'), 600);
  });
  AB.Bus.on('inventory:changed', ({ itemId, delta }) => { if (itemId === 'ITEM-014' && delta > 0) AB.IsoStory.trigger('item:ITEM-014'); });

  AB.Bus.on('ow:enter', () => {
    if (AB.Quests.status('QUEST-007') === 'active') AB.Flags.add('ow-out');
    // Мира остаётся на корабле: на дне её не рисуем
    const mira = AB.IsoParty.allNpcs().find((m) => m.id === 'CHAR-002'); if (mira) mira.hidden = true;
  });
  // тварь на дне убита (бой на карте, №61) — на её клетке кристалл; Мира на связи
  AB.Bus.on('enemy:dead', ({ id, q, r }) => {
    if (id !== 'ENEMY-008') return;
    visited.add('contact');
    if (q != null) AB.IsoOverworld.dropLoot(q, r, 'ITEM-015', 1);
    setTimeout(() => AB.IsoOverworld.say('Мира: «Цель не двигается… Ты цел? Там что-то светится — подбери и возвращайся на «Абисс»»'), 900);
  });
  // вернулись на корабль с карты (iso-main.js переносит отряд в шлюз)
  AB.Bus.on('ow:exit', () => {
    const mira = AB.IsoParty.allNpcs().find((m) => m.id === 'CHAR-002'); if (mira) mira.hidden = false;
    if (AB.Quests.status('QUEST-007') === 'active' && AB.Enemies.isDead('ENEMY-008')) { AB.Flags.add('ow-back'); pendingBack = true; setTimeout(afterBack, 500); }
  });
  AB.Bus.on('iso:travel', ({ sector }) => {
    const mira = AB.IsoParty.allNpcs().find((m) => m.id === 'CHAR-002');
    if (mira) mira.hidden = sector !== 'SECTOR-003';
    if (pendingBack && sector === 'SECTOR-003') { pendingBack = false; setTimeout(() => AB.IsoStory.trigger('act2:back'), 400); }
  });
  function afterBack() { if (pendingBack && !AB.IsoGame.busy() && AB.IsoGame.sector() === 'SECTOR-003') { pendingBack = false; setTimeout(() => AB.IsoStory.trigger('act2:back'), 400); } }

  // ---------- Акт III: ангар, отстыковка, база ----------
  AB.Bus.on('event:end', (id) => {
    // в ангаре завелись мутанты — пока экипаж был снаружи
    if (id === 'EVENT-021') {
      AB.IsoEnemies.spawn('ENEMY-001~h1', 72.5, 54.5);
      AB.IsoEnemies.spawn('ENEMY-001~h2', 82.5, 49.5);
    }
  });
  const RUN = {
    // выживший в «Отсеке на склоне» — в экипаже базы (№69)
    recruit() {
      if (!crew.includes('CHAR-004')) crew.push('CHAR-004');
      AB.Flags.add('recruit');
      const m = AB.IsoParty.find('CHAR-004'); if (m) { m.hidden = true; m.sector = 'SECTOR-005'; }
      toast('Сайлас идёт к капсуле — теперь он в экипаже базы', 'good');
      checkEnd();
    },
    // капсула отстыкована: экипаж на борту, дальше — карта дна в режиме базы
    undock() {
      AB.Flags.add('undocked');
      AB.IsoOverworld.setMode('capsule');
      enterBase();                                  // экипаж на борту: сразу внутри капсулы (№61)
    },
  };

  // что можно сделать в точке карты: { label, ok, why }
  function siteAction(site) {
    const d = AB.ISO_SITES[site.key];
    if (site.key === 'abyss') return { label: 'Войти на «Абисс» через шлюз', ok: true };   // №65: «Абисс» — обычная локация
    if (!d) return { label: 'Исследовать — появится позже', ok: false };
    if (visited.has(site.key) && !d.repeat) return { label: 'Здесь уже всё сделано', ok: false };
    if (act < d.act) return { label: act === 2 ? 'Мира: «Не уходи далеко — сначала сигнал»' : 'Позже', ok: false };
    if (d.mob) return { label: AB.Enemies.isDead(d.mob) ? 'Здесь уже всё сделано' : d.label, ok: false };
    if (act === 2) return { label: 'Мира: «Не уходи далеко — сначала сигнал»', ok: false };
    if (d.act === 3 && !AB.Flags.has('undocked')) return { label: 'Сначала — капсула', ok: false };
    if (d.interior && AB.IsoOverworld.selectedKind() !== 'squad') return { label: 'Подведите отряд в транспорте ко входу', ok: false };
    return { label: d.label, ok: true };
  }
  // войти в здание: транспорт у входа, внутрь — только герой этого отряда; остальной экипаж — на базе
  function enterInterior(sector) {
    const hero = AB.IsoOverworld.enterBuilding();
    if (!hero) { AB.IsoOverworld.say('Подведите отряд в транспорте ко входу (выберите героя)'); return; }
    Object.assign(AB.IsoStory.fx, { fade: 0, fadeTo: 0, fadeDur: 0, fadeFrom: 0, actEnd: 0 });
    for (const m of [...AB.IsoParty.members()]) if (m.id !== hero && AB.IsoParty.leave(m.id)) { const n = AB.IsoParty.allNpcs().find((q) => q.id === m.id); if (n) n.sector = 'SECTOR-005'; }
    const i = AB.IsoParty.members().findIndex((m) => m.id === hero); if (i >= 0) AB.IsoParty.setLeader(i);
    const L = AB.ISO_LAYOUTS[sector];
    AB.IsoGame.travel(sector, L.enter.x, L.enter.y);
  }
  AB.Bus.on('iso:travel', ({ sector }) => {
    if (sector !== 'SECTOR-006' || AB.Flags.has('recruit')) return;
    const p = AB.ISO_LAYOUTS['SECTOR-006'].survivor;
    const m = AB.IsoParty.addNpc('CHAR-004', p.x, p.y); m.hidden = false; m.facing = -1;
    if (!AB.Chars.get('CHAR-004') && AB.Chars.spawn) { const c = AB.Chars.spawn('CHAR-004', { room: 'ROOM-024', x: 0 }); if (c) c.controllable = false; }
  });
  function siteVisible(site) { const d = AB.ISO_SITES[site.key]; return !d || !d.act || site.key !== 'contact' || act >= 2; }
  function doSite(site) {
    const d = AB.ISO_SITES[site.key], a = siteAction(site);
    if (!a.ok || !d) return;
    if (d.interior) { enterInterior(d.interior); return; }
    if (d.say) AB.IsoOverworld.say(d.say);
    if (d.repeat) return;
    visited.add(site.key);
    const got = [];
    for (const [item, qty] of d.loot || []) { const n = AB.IsoStash.add(item, qty); if (n) got.push(`${AB.ID.get(item).name} ×${n}`); }
    if (d.recruit && !crew.includes(d.recruit)) {
      crew.push(d.recruit);
      AB.Flags.add('recruit');
      setTimeout(() => AB.IsoOverworld.say(`${AB.ID.get(d.recruit).name} — теперь в экипаже базы`), 2600);
    }
    if (got.length) setTimeout(() => AB.IsoOverworld.say(`Найдено: ${got.join(', ')}`), d.say ? 2300 : 0);
    AB.IsoOverworld.refresh();
    checkEnd();
  }

  // ---------- модули базы ----------
  const has = (cost) => (cost || []).every(([i, n]) => AB.IsoStash.count(i) >= n);
  function build(id) {
    const m = AB.ISO_MODULES.find((q) => q.id === id);
    if (!m || built.has(id) || !has(m.cost)) return false;
    for (const [i, n] of m.cost) AB.IsoStash.remove(i, n);
    built.add(id);
    AB.Flags.add('module');
    if (m.effect === 'heal') healCrew();
    const msg = `Модуль пристыкован: ${m.name}`;
    if (AB.IsoOverworld.isOpen()) AB.IsoOverworld.say(msg); else toast(msg, 'good');
    checkEnd();
    return true;
  }
  function healCrew() { for (const id of crew) { const c = AB.Chars.get(id); if (c && !c.dead) c.hp = AB.ID.get(id).stats.maxHp; } }
  // №64: экипаж и модуль есть — капсула готова всплыть; всплытие (кнопка на карточке базы) — конец акта III
  const canSurface = () => act === 3 && AB.Flags.has('recruit') && AB.Flags.has('module') && !AB.Flags.has('surfaced');
  function checkEnd() {
    if (canSurface() && !AB.Flags.has('surface-ready')) {
      AB.Flags.add('surface-ready');
      setTimeout(() => { const t = 'Мира: «Капсула готова к всплытию. Наверху — поверхность и другие люди. Нажми «Всплыть» на карточке базы»'; if (AB.IsoOverworld.isOpen()) AB.IsoOverworld.say(t); else toast(t, 'good'); }, 1500);
    }
  }
  function surface() {
    if (!canSurface()) return false;
    if (!AB.IsoOverworld.isOpen()) { AB.IsoOverworld.setMode('capsule'); AB.IsoOverworld.enter(); }
    AB.IsoOverworld.surface(() => { AB.Flags.add('surfaced'); AB.Bus.emit('act:end', { act: 3 }); });
    return true;
  }

  // ---------- база-капсула изнутри (№61) ----------
  // войти: карта закрывается, отряд — в шлюзе капсулы; остальной экипаж — на своих местах
  let pendingCrew = false;
  function enterBase() {
    AB.IsoOverworld.close();
    Object.assign(AB.IsoStory.fx, { fade: 0, fadeTo: 0, fadeDur: 0, fadeFrom: 0, actEnd: 0 });
    const L = AB.ISO_LAYOUTS['SECTOR-005'];
    pendingCrew = true;
    if (AB.IsoGame.sector() === 'SECTOR-005') { AB.IsoParty.placeAll(L.enter.x, L.enter.y); AB.IsoRender.snap(); placeCrew(); }
    else AB.IsoGame.travel('SECTOR-005', L.enter.x, L.enter.y);
    if (built.has('MOD-003')) healCrew();
  }
  function placeCrew() {
    if (!pendingCrew) return;
    pendingCrew = false;
    const L = AB.ISO_LAYOUTS['SECTOR-005'];
    for (const id of crew) {
      if (AB.IsoParty.members().some((m) => m.id === id)) continue;
      const at = L.crewAt[id]; if (!at) continue;
      const m = AB.IsoParty.find(id) || AB.IsoParty.addNpc(id, at.x, at.y);
      m.hidden = false; m.facing = -1;
      if (!AB.Chars.get(id) && AB.Chars.spawn) { const c = AB.Chars.spawn(id, { room: 'ROOM-021', x: 0 }); if (c) c.controllable = false; }
    }
    toast('База-капсула. Пульт в кабине — вести капсулу; шкафчики — вещи; модульный отсек — гнёзда модулей', 'info');
  }
  AB.Bus.on('iso:travel', ({ sector }) => { if (sector === 'SECTOR-005') placeCrew(); });
  function leaveBase() { AB.IsoOverworld.setMode('capsule'); AB.IsoOverworld.enter(); }

  return {
    enterBase, leaveBase, surface, canSurface,
    act: () => act, next, run: (fn) => RUN[fn] && RUN[fn](), afterBack,
    // админ-панель (№66): сразу выставить акт и экипаж
    devSet({ act: a, crew: list, built: mods } = {}) { if (a) act = a; if (list) { crew.length = 0; crew.push(...list); } for (const m of mods || []) built.add(m); },
    siteAction, siteVisible, doSite, build, canBuild: (id) => { const m = AB.ISO_MODULES.find((q) => q.id === id); return !!m && !built.has(id) && has(m.cost); },
    built: (id) => built.has(id), crew: () => crew.slice(), visited: (k) => visited.has(k),
    view: () => (built.has('MOD-002') ? 4 : 2),
    onBase: () => { if (built.has('MOD-003')) healCrew(); },
  };
})();
