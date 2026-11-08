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

  function start() {
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
    restart() { location.reload(); },
  };
})();
