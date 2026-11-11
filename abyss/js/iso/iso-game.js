// =====================================================================
// ISO GAME (дополнение №49). Прохождение бункера в изометрии: начало с
// пробуждения в криоотсеке, переходы между секторами (затемнение и новая
// планировка), люки внутри сектора, «Начать сначала». Сохранений нет —
// бункер проходится за один раз (решение автора); перезапуск очищает всё.
// iso.html?scene=test — тестовая сцена прежних этапов (отряд из трёх, тестовые противники).
// =====================================================================

AB.IsoGame = (() => {
  let sid = null;
  let fadeV = 0, travel_ = null;      // затемнение перехода и куда идём
  const test = () => new URLSearchParams(location.search).get('scene') === 'test';

  function load(id) {
    sid = id;
    const lay = AB.ISO_LAYOUTS[id];
    AB.IsoWorld.build(id);
    AB.IsoInteract.init(lay, id);
    AB.IsoEnemies.spawnSector(id, lay, test() ? lay.testEnemies || [] : []);
    AB.IsoRender.snap();
  }

  // ---------- Контрольные точки (№59, решение автора) ----------
  // Сохранений нет, но проигранная оборона оружейной (или бой с Колоссом) не отбрасывает в начало:
  // герои появляются у входа в оружейную с теми вещами, что были при входе. Хранится только на время
  // вкладки (sessionStorage); «Заново» стирает точку.
  const CP_KEY = 'abyss_iso_cp', GO_KEY = 'abyss_iso_cp_go';
  const CP = {
    armory: { name: 'вход в оружейную', at: { x: 45.5, y: 14.5 } },
    colossus: { name: 'замок отсека жизнеобеспечения', at: { x: 50.5, y: 17.5 } },
  };
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* хранилище недоступно */ } } };
  let cpNow = (() => { try { return JSON.parse(ss.get(CP_KEY)); } catch (e) { return null; } })();
  function saveCheckpoint(id) {
    if (test() || (cpNow && cpNow.id === id)) return;
    cpNow = {
      id, stash: AB.IsoStash.cells(),
      weapons: AB.IsoParty.members().map((m) => [m.id, (AB.Inventory.weapon(m.id) || {}).item || null]),
      hp: AB.IsoParty.members().map((m) => [m.id, (AB.Chars.get(m.id) || {}).hp]),
      progress: AB.Progress.serialize(), perks: AB.Perks.serialize(),
    };
    ss.set(CP_KEY, JSON.stringify(cpNow));
    AB.Bus.emit('iso:checkpoint', { id, name: CP[id].name });
  }
  AB.Bus.on('room:enter', ({ roomId }) => { if (roomId === 'ROOM-006' && sid === 'SECTOR-003' && !AB.IsoNest.isDone() && !AB.IsoNest.state()) saveCheckpoint('armory'); });
  AB.Bus.on('nest:won', () => setTimeout(() => saveCheckpoint('colossus'), 1700));
  AB.Bus.on('enemy:dead', ({ id }) => { if (id === 'ENEMY-003') { cpNow = null; ss.set(CP_KEY, null); } });   // Колосс побеждён — точка больше не нужна

  // начать с контрольной точки: состояние мира — как после командного центра
  function bootCheckpoint(cp) {
    AB.IsoStash.adapt();
    const lay = AB.ISO_LAYOUTS['SECTOR-003'], at = CP[cp.id].at;
    sid = 'SECTOR-003';
    AB.IsoWorld.build(sid);
    const party = [{ id: 'CHAR-001', x: at.x, y: at.y }, { id: 'CHAR-002', x: at.x + 1, y: at.y + 0.6 }];
    AB.IsoParty.init(party);
    AB.IsoBridge.setup(party, {
      story: ['EVENT-001', 'EVENT-014', 'EVENT-003', 'EVENT-004', 'EVENT-002', 'EVENT-005', 'EVENT-006', 'EVENT-007', 'EVENT-008'],
      equipment: ['EQUIP-008', 'EQUIP-001', 'EQUIP-002', 'EQUIP-010', 'EQUIP-003'].map((id) => [id, 'done']),
      power: true, weapons: [],
    });
    load(sid);
    for (const id of ['ENEMY-004', 'ENEMY-005']) if (AB.IsoEnemies.get(id)) AB.IsoEnemies.damage(id, 99999, null);
    AB.IsoStash.reset();
    for (const c of cp.stash || []) if (c && c.qty > 0) AB.IsoStash.add(c.item, c.qty);
    for (const [id, item] of cp.weapons || []) if (item) AB.Inventory.add(id, item, 1, { swap: false });
    for (const [id, hp] of cp.hp || []) { const c = AB.Chars.get(id); if (c && hp > 0) c.hp = hp; }
    AB.Progress.restore(cp.progress); AB.Perks.restore(cp.perks);
    const done = (id) => [id, { stage: 99, status: 'done' }];
    const q = [done('QUEST-004'), done('QUEST-001'), done('QUEST-002'), ['QUEST-003', { stage: cp.id === 'colossus' ? 1 : 0, status: 'active' }]];
    if (cp.id === 'colossus') {
      q.push(done('QUEST-005'));
      AB.IsoNest.markDone();
      const k = AB.IsoInteract.doors().find((d) => d.key === 'K'); k.state = 'open'; k.hacked = true;
    }
    AB.Quests.restore(q);
    AB.IsoBridge.sync();
    AB.IsoRender.snap();
    setTimeout(() => AB.Bus.emit('iso:toast', { text: `Контрольная точка: ${CP[cp.id].name}`, kind: 'info' }), 300);
  }

  // №66: собрать мир сразу в заданном состоянии (переходы админ-панели, js/iso/iso-dev.js)
  function bootState(st) {
    AB.IsoStash.adapt();
    sid = st.sector;
    AB.IsoWorld.build(sid);
    const party = st.party.map((id, i) => ({ id, x: st.at.x + (i ? 1 : 0), y: st.at.y + (i ? 0.6 : 0) }));
    AB.IsoParty.init(party);
    AB.IsoBridge.setup(party, { story: st.story || [], equipment: (st.equipment || []).map((id) => [id, 'done']), power: !!st.power, weapons: [] });
    for (const id of st.dead || []) AB.IsoEnemies.markDead(id);
    load(sid);
    for (const e of AB.IsoEnemies.alive()) if ((st.dead || []).includes(e.id)) AB.IsoEnemies.damage(e.id, 99999, null);
    AB.IsoStash.reset();
    for (const [item, qty] of st.stash || []) AB.IsoStash.add(item, qty);
    for (const [id, item] of st.weapons || []) AB.Inventory.add(id, item, 1, { swap: false });
    if (st.nestDone) AB.IsoNest.markDone();
    for (const k of st.openDoors || []) { const d = AB.IsoInteract.doors().find((q) => q.key === k); if (d) { d.state = 'open'; if (d.def.hack) d.hacked = true; } }
    AB.Quests.restore(st.quests || []);
    for (const f of st.flags || []) AB.Flags.add(f);
    for (const n of st.npcs || []) {
      const m = AB.IsoParty.addNpc(n.id, n.x, n.y);
      const c = AB.Chars.spawn(n.id, { room: AB.IsoWorld.room(n.x, n.y), x: 0 }); if (c) c.controllable = false;
      if (n.weapon) AB.Inventory.add(n.id, n.weapon, 1, { swap: false });
      if (n.hidden) m.hidden = true;
    }
    AB.IsoBridge.sync();
    AB.IsoRender.snap();
    if (st.after) setTimeout(st.after, 200);
  }

  function start() {
    if (!test() && AB.IsoDev && AB.IsoDev.pending()) { AB.IsoDev.boot(); return; }
    if (!test() && cpNow && ss.get(GO_KEY)) { ss.set(GO_KEY, null); bootCheckpoint(cpNow); return; }
    AB.IsoStash.adapt();                                  // вещи — в общий инвентарь профиля
    if (test()) {
      AB.IsoStory.disable();                              // тестовая сцена — без сюжетных событий
      const lay = AB.ISO_LAYOUTS['SECTOR-001'];
      sid = 'SECTOR-001';
      AB.IsoWorld.build(sid);
      AB.IsoParty.init(lay.party);
      AB.IsoBridge.setup(lay.party, lay.testState);
      load(sid);
      AB.IsoBridge.sync();
      return;
    }
    const st = AB.ISO_START;
    sid = st.sector;
    AB.IsoWorld.build(sid);
    AB.IsoParty.init(st.party);
    AB.IsoBridge.setup(st.party, null);
    load(sid);
    AB.IsoBridge.sync();
    AB.IsoStory.trigger('new_game');
  }

  // переход: в другой сектор (sector) или внутри сектора (люк: sector = null)
  function travel(sector, x, y) {
    if (travel_) return;
    travel_ = { sector, x, y, phase: 'out' };
    AB.IsoParty.stop();
  }

  function update(dt) {
    if (!travel_) { fadeV = Math.max(0, fadeV - dt * 3); return; }
    if (travel_.phase === 'out') {
      fadeV = Math.min(1, fadeV + dt * 3);
      if (fadeV < 1) return;
      if (travel_.sector && travel_.sector !== sid) load(travel_.sector);
      AB.IsoParty.placeAll(travel_.x, travel_.y);
      AB.IsoRender.snap();
      AB.IsoBridge.sync();
      AB.Bus.emit('iso:travel', { sector: sid });
      travel_.phase = 'in';
      return;
    }
    fadeV = Math.max(0, fadeV - dt * 2.5);
    if (fadeV <= 0) travel_ = null;
  }

  return {
    start, update, travel, test,
    sector: () => sid,
    sectorName: (id) => (AB.ISO_LAYOUTS[id] ? AB.ISO_LAYOUTS[id].name : id),
    fade: () => fadeV,
    busy: () => !!travel_,
    restart() { ss.set(CP_KEY, null); ss.set(GO_KEY, null); location.reload(); },
    // контрольная точка: есть ли и начать с неё
    checkpoint: () => (cpNow ? { id: cpNow.id, name: CP[cpNow.id].name } : null), bootState,
    fromCheckpoint() { ss.set(GO_KEY, '1'); location.reload(); },
  };
})();
