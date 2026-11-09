// =====================================================================
// QUEST SYSTEM (GDD §13.4, §8). Многоэтапные задания по данным QUEST-*.
// Этапы идут по порядку; этап выполнен, когда выполнены все его цели.
// Цели проверяются по состоянию мира (помещение, оборудование), поэтому
// действие, сделанное заранее, засчитывается, когда до него дойдёт очередь.
// =====================================================================

AB.Quests = (() => {
  const prog = new Map(); // QUEST-ID → { stage, status: 'active' | 'done' }

  function objectiveDone(o) {
    if (o.done.room && o.done.with) {
      const c = AB.Chars.get(o.done.with);
      return AB.Rooms.current() === o.done.room && c && c.room === o.done.room && !c.dead;
    }
    if (o.done.room) return AB.Rooms.visited().includes(o.done.room);
    if (o.done.weapon) return AB.Chars.all().some((c) => { const w = AB.Inventory.weapon(c.id); return !!w && w.item === o.done.weapon; });
    if (o.done.enemyDead) return AB.Enemies.isDead(o.done.enemyDead);
    if (o.done.equip) {
      const s = AB.Equip.state(o.done.equip);
      return o.done.state === 'inspected' ? s === 'inspected' || s === 'done' : s === o.done.state;
    }
    return false;
  }

  function start(id) {
    if (prog.has(id)) return;
    prog.set(id, { stage: 0, status: 'active' });
    AB.Bus.emit('quest:start', { id, name: AB.ID.get(id).name });
    check();
  }

  // Проверить продвижение всех активных заданий
  function check() {
    for (const [id, p] of prog) {
      if (p.status !== 'active') continue;
      const q = AB.ID.get(id);
      while (p.stage < q.stages.length && q.stages[p.stage].objectives.every(objectiveDone)) {
        p.stage++;
        if (p.stage < q.stages.length) AB.Bus.emit('quest:stage', { id, stage: p.stage });
      }
      if (p.stage >= q.stages.length) {
        p.status = 'done';
        if (q.reward && q.reward.power) AB.World.setPower(true);
        AB.Bus.emit('quest:done', { id, name: q.name });
        (q.next || []).forEach(start);
      }
    }
  }

  // Активное задание и его текущие цели (для интерфейса и навигации)
  function current() {
    for (const [id, p] of prog) {
      if (p.status !== 'active') continue;
      const q = AB.ID.get(id);
      const stage = q.stages[p.stage];
      return { id, name: q.name, objectives: stage.objectives.map((o) => ({ ...o, ok: objectiveDone(o) })) };
    }
    return null;
  }

  // Куда вести игрока: первая невыполненная цель → { room, x }
  function target() {
    const c = current();
    if (!c) return null;
    const o = c.objectives.find((x) => !x.ok);
    if (!o || !o.target) return null;
    if (o.target.equip) {
      const e = AB.ID.get(o.target.equip);
      return { room: e.room, x: e.x, text: o.text };
    }
    return { room: o.target.room, x: o.target.x, text: o.text };
  }

  function init() {
    AB.Bus.on('room:enter', ({ roomId }) => {
      for (const q of AB.QUESTS) if (q.start && q.start.room === roomId) start(q.id);
      check();
    });
    AB.Bus.on('equip:changed', check);
    AB.Bus.on('inventory:changed', check);
    AB.Bus.on('enemy:dead', check);
    AB.Bus.on('event:end', (eventId) => {
      for (const q of AB.QUESTS) if (q.start && q.start.event === eventId) start(q.id);
    });
  }

  return {
    init, start, check, current, target,
    // все активные задания (изометрия показывает несколько сразу)
    active: () => [...prog].filter(([, p]) => p.status === 'active').map(([id, p]) => { const q = AB.ID.get(id); return { id, name: q.name, objectives: q.stages[p.stage].objectives.map((o) => ({ ...o, ok: objectiveDone(o) })) }; }),
    status: (id) => (prog.get(id) || {}).status || null,
    serialize: () => [...prog],
    restore(d) { (d || []).forEach(([id, p]) => prog.set(id, p)); },
  };
})();
