// =====================================================================
// ISO BRIDGE (этап 2 изометрии, дополнение №46). Связь изометрической сцены
// со старыми системами, которые переносятся как есть: персонажи (AB.Chars),
// отряд (AB.Party), инвентарь (AB.Inventory), оборудование (AB.Equip,
// AB.World), состояние помещений — предметы и доступ к дверям (AB.Rooms).
// Сюжет и противники ещё не перенесены: вместо них — простые заглушки,
// которые отвечают «событие было / не было» по состоянию тестовой сцены.
// =====================================================================

AB.IsoBridge = (() => {
  // заглушки систем, которых в изометрии нет (сюжет — AB.IsoStory, он задаёт AB.Story сам)
  // противники — изометрические (AB.IsoEnemies); старый интерфейс «погиб ли» для оборудования
  // ARENA-001 — испытание «Гнездо»: «погибло» = пройдено (цель задания QUEST-005)
  if (!AB.Enemies) AB.Enemies = { isDead: (id) => (id === 'ARENA-001' ? !!(AB.IsoNest && AB.IsoNest.isDone()) : !!(AB.IsoEnemies && AB.IsoEnemies.isDead(id))), inRoom: () => [], inCombat: () => false, threatFor: () => null };
  if (!AB.Dialog) AB.Dialog = { isOpen: () => false };

  let lastRoom = null;

  // персонажи отряда — в реестре старой системы (здоровье, навыки, оружие в руках — там)
  // st — состояние тестовой сцены (iso.html?scene=test), в прохождении — нет
  function setup(party, st) {
    if (!AB.Combat && AB.IsoCombat) AB.Combat = AB.IsoCombat;   // фигура с оружием спрашивает про ауру и перегрев
    if (st) {
      (st.story || []).forEach((id) => AB.IsoStory.markDone(id));
      AB.Equip.restore(st.equipment || []);
      if (st.power) AB.World.setPower(true);
    }
    const lead = party[0].id;
    for (const p of party.slice(0, AB.IsoParty.MAX)) {
      const c = AB.Chars.spawn(p.id, { room: AB.IsoWorld.room(p.x, p.y), x: 0 });
      c.follow = p.id === lead ? null : lead;
      c.controllable = p.id === lead;
    }
    if (st) for (const [id, item] of st.weapons || []) AB.Inventory.add(id, item, 1, { swap: false });
  }

  // после движения: в каком помещении каждый (инвентарь считает «рядом» по помещению)
  function sync() {
    for (const m of AB.IsoParty.members()) {
      const c = AB.Chars.get(m.id), room = AB.IsoWorld.room(m.x, m.y);
      if (c && room) c.room = room;
      const w = AB.Inventory.weapon(m.id);
      m.equipped = w ? w.item : null;              // оружие в руках фигуры
    }
    // обмен вещами в старой системе меряет расстояние по горизонтали вида сбоку:
    // подставляем настоящее расстояние до ведущего на карте (в тех же единицах: 50 на клетку)
    const ld = AB.IsoParty.lead();
    for (const m of AB.IsoParty.members()) {
      const c = AB.Chars.get(m.id);
      if (c && ld) c.x = Math.hypot(m.x - ld.x, m.y - ld.y) * 50;
    }
    const l = AB.IsoParty.lead();
    const room = l && AB.IsoWorld.room(l.x, l.y);
    if (room && room !== lastRoom) {
      // вошли в помещение: задания и сюжет узнают об этом так же, как в основной игре
      AB.Rooms.setCurrent(room); lastRoom = room;
      AB.Bus.emit('room:enter', { roomId: room, iso: true });
    }
  }

  // смена управляемого — и в старом реестре отряда
  AB.Bus.on('iso:party', ({ leader }) => { if (AB.Party.leader() !== leader) AB.Party.setLeader(leader, { force: true }); });

  return { setup, sync };
})();
