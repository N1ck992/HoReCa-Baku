// =====================================================================
// EQUIPMENT SYSTEM (GDD §13.6) и состояние корабля (питание).
//
// Состояния оборудования: 'broken' → 'inspected' (осмотрено) → 'done'
// (установлено / подключено / запущено). У пульта — только справка.
// =====================================================================

AB.World = (() => {
  let power = false;   // главное питание корабля
  let powerT = 0;      // плавный переход света 0..1 (для рендера)
  return {
    hasPower: () => power,
    setPower(on) {
      if (power === on) return;
      power = on;
      AB.Bus.emit('world:power', { on });
    },
    update(dt) { powerT = Math.max(0, Math.min(1, powerT + (power ? dt / 2.5 : -dt))); },
    powerT: () => powerT,
    serialize: () => ({ power }),
    restore(d) { if (d && d.power) { power = true; powerT = 1; } },
  };
})();

AB.Equip = (() => {
  const state = new Map(); // EQUIP-ID → 'broken' | 'inspected' | 'done'

  const st = (id) => state.get(id) || 'broken';
  const def = (id) => AB.ID.get(id);

  function inRoom(roomId) {
    const r = AB.ID.get(roomId);
    return ((r && r.equipment) || []).map((id) => def(id));
  }

  // Что произойдёт при действии: { label, ok, time?, kind }
  function action(id, charId) {
    const d = def(id), s = st(id);
    if (d.info) return { label: AB.World.hasPower() ? d.text.on : d.text.off, ok: true, kind: 'info' };
    if (s === 'done') return { label: d.text.done, ok: false, kind: 'done' };
    if (d.after && !d.after.every((r) => st(r) === 'done')) return { label: d.text.after || d.text.missing, ok: false, kind: 'blocked' };
    if (d.enemyDead && !AB.Enemies.isDead(d.enemyDead)) return { label: d.text.missing, ok: false, kind: 'blocked' };
    if (d.inspect && s === 'broken') return { label: d.text.inspect, ok: true, kind: 'inspect' };
    if (d.requires && !d.requires.every((r) => st(r) === 'done')) return { label: d.text.missing, ok: false, kind: 'blocked' };
    if (d.skill) {
      const c = AB.ID.get(charId);
      if (!c.skills || !c.skills[d.skill]) return { label: 'Нужен инженер', ok: false, kind: 'blocked' };
    }
    if (d.needs) {
      const p = AB.Inventory.pack(charId);
      if (!p || p.item !== d.needs) return { label: d.text.missing, ok: false, kind: 'blocked' };
    }
    return { label: d.text.ready, ok: true, time: d.time, kind: 'work' };
  }

  // Выполнить действие (для timed-действий вызывается по окончании)
  function apply(id, charId) {
    const d = def(id), a = action(id, charId);
    if (!a.ok) return a;
    if (a.kind === 'info') { AB.Bus.emit('equip:info', { id, text: a.label }); return a; }
    if (a.kind === 'inspect') {
      state.set(id, 'inspected');
      AB.Bus.emit('equip:changed', { id, state: 'inspected', text: d.inspect });
      return a;
    }
    if (d.needs) AB.Inventory.remove(charId, d.needs, 1);
    state.set(id, 'done');
    AB.Bus.emit('equip:changed', { id, state: 'done', text: d.text.done });
    return a;
  }

  return {
    inRoom, action, apply,
    state: st,
    serialize: () => [...state],
    restore(d) { (d || []).forEach(([id, s]) => state.set(id, s)); },
  };
})();
