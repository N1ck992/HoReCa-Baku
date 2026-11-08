// =====================================================================
// ISO BRIDGE (этап 2 изометрии, дополнение №46). Связь изометрической сцены
// со старыми системами, которые переносятся как есть: персонажи (AB.Chars),
// отряд (AB.Party), инвентарь (AB.Inventory), оборудование (AB.Equip,
// AB.World), состояние помещений — предметы и доступ к дверям (AB.Rooms).
// Сюжет и противники ещё не перенесены: вместо них — простые заглушки,
// которые отвечают «событие было / не было» по состоянию тестовой сцены.
// =====================================================================

AB.IsoBridge = (() => {
  const storyDone = new Set();
  // заглушки систем, которых в изометрии пока нет (не подменяют настоящие, если те загружены)
  if (!AB.Story) AB.Story = { isDone: (id) => storyDone.has(id), isRunning: () => false, fx: {}, trigger() {}, zone() {} };
  if (!AB.Enemies) AB.Enemies = { isDead: () => false, inRoom: () => [], inCombat: () => false, threatFor: () => null };
  if (!AB.Dialog) AB.Dialog = { isOpen: () => false };

  let lastRoom = null;

  // персонажи отряда — в реестре старой системы (инвентарь, навыки, здоровье — там)
  function setup(layout) {
    const st = layout.testState || {};
    (st.story || []).forEach((id) => storyDone.add(id));
    AB.Equip.restore(st.equipment || []);
    if (st.power) AB.World.setPower(true);
    const lead = layout.party[0].id;
    for (const p of layout.party.slice(0, AB.IsoParty.MAX)) {
      const c = AB.Chars.spawn(p.id, { room: AB.IsoWorld.room(p.x, p.y), x: 0 });
      c.follow = p.id === lead ? null : lead;
      c.controllable = p.id === lead;
    }
    sync();
  }

  // после движения: в каком помещении каждый (инвентарь считает «рядом» по помещению)
  function sync() {
    for (const m of AB.IsoParty.members()) {
      const c = AB.Chars.get(m.id), room = AB.IsoWorld.room(m.x, m.y);
      if (c && room) c.room = room;
    }
    const l = AB.IsoParty.lead();
    const room = l && AB.IsoWorld.room(l.x, l.y);
    if (room && room !== lastRoom) { AB.Rooms.setCurrent(room); lastRoom = room; }
  }

  // смена управляемого — и в старом реестре отряда
  AB.Bus.on('iso:party', ({ leader }) => { if (AB.Party.leader() !== leader) AB.Party.setLeader(leader, { force: true }); });

  return { setup, sync, storyDone: (id) => storyDone.has(id) };
})();
