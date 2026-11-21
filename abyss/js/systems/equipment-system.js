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
  // №82: дополнения поверх замороженных записей (изометрия меняет генератор: одно действие, две детали)
  const def = (id) => { const d = AB.ID.get(id), x = AB.EQUIP_EXTRA && AB.EQUIP_EXTRA[id]; if (!x) return d; const o = { ...d, ...x }; if (x.noInspect) delete o.inspect; return o; };

  function inRoom(roomId) {
    const r = AB.ID.get(roomId);
    return ((r && r.equipment) || []).map((id) => def(id));
  }

  // Что произойдёт при действии: { label, ok, time?, kind }
  function action(id, charId) {
    const d = def(id), s = st(id);
    if (d.info) return { label: AB.World.hasPower() ? d.text.on : d.text.off, ok: true, kind: 'info' };
    if (d.gives) {
      return AB.Inventory.partyHasRoom(charId, d.gives) ? { label: d.text.ready, ok: true, time: d.time, kind: 'work' } : { label: d.text.full, ok: false, kind: 'blocked' };
    }
    if (s === 'done') return { label: d.text.done, ok: false, kind: 'done' };
    if (d.guard && AB.IsoGuard && AB.IsoGuard.state()) return { label: 'Мира настраивает капсулу — прикрывай её', ok: false, kind: 'blocked' };
    if (d.after && !d.after.every((r) => st(r) === 'done')) return { label: d.text.after || d.text.missing, ok: false, kind: 'blocked' };
    if (d.enemyDead && !AB.Enemies.isDead(d.enemyDead)) return { label: d.text.missing, ok: false, kind: 'blocked' };
    if (d.inspect && s === 'broken') return { label: d.text.inspect, ok: true, kind: 'inspect' };
    if (d.requires && !d.requires.every((r) => st(r) === 'done')) return { label: d.text.missing, ok: false, kind: 'blocked' };
    if (d.skill) {
      const c = AB.ID.get(charId);
      if (!c.skills || !c.skills[d.skill]) return { label: 'Нужен инженер', ok: false, kind: 'blocked' };
    }
    if (d.needs && !AB.Inventory.holderOf(charId, d.needs)) return { label: d.text.missing, ok: false, kind: 'blocked' };
    // №82: нужно сразу несколько вещей (генератор: предохранитель и топливо) — ставятся за одно действие
    if (d.needsAll && !d.needsAll.every((i) => AB.Inventory.holderOf(charId, i))) return { label: d.text.missing, ok: false, kind: 'blocked' };
    return { label: d.text.ready, ok: true, time: d.time, kind: 'work' };
  }

  // Выполнить действие (для timed-действий вызывается по окончании)
  function apply(id, charId) {
    const d = def(id), a = action(id, charId);
    if (!a.ok) return a;
    if (a.kind === 'info') { AB.Bus.emit('equip:info', { id, text: a.label }); return a; }
    // №86: сначала оборона (Мира настраивает капсулу), отстыковка — после неё
    if (d.guard && AB.IsoGuard && !AB.IsoGuard.isDone()) { AB.IsoGuard.start(); return { ...a, kind: 'guard' }; }
    if (d.gives) {
      AB.Inventory.addShared(charId, d.gives, 1, { swap: false });
      AB.Bus.emit('equip:info', { id, text: d.text.gave });
      return a;
    }
    if (a.kind === 'inspect') {
      state.set(id, 'inspected');
      AB.Bus.emit('equip:changed', { id, state: 'inspected', text: d.inspect });
      return a;
    }
    if (d.needs) {
      // вещь берётся у того, у кого она есть в группе (Марк жмёт — предохранитель у Миры)
      const holder = AB.Inventory.holderOf(charId, d.needs);
      AB.Inventory.remove(holder, d.needs, 1);
      if (holder !== charId) AB.Bus.emit('equip:shared', { id, from: holder, itemId: d.needs });
    }
    for (const i of d.needsAll || []) { const h = AB.Inventory.holderOf(charId, i); if (h) AB.Inventory.remove(h, i, 1); }
    for (const o of d.alsoDone || []) state.set(o, 'done');
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
