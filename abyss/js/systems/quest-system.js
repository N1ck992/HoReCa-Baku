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
    // №55 (изометрия): сюжетное событие прошло; отметка прохождения
    if (o.done.event) return !!(AB.Story && AB.Story.isDone(o.done.event));
    if (o.done.flag) return !!(AB.Flags && AB.Flags.has(o.done.flag));
    // №82: собраны все вещи (или уже поставлены в оборудование — тогда тоже засчитано)
    if (o.done.items) return heldCount(o) >= o.done.items.length;
    if (o.done.equip) {
      const s = AB.Equip.state(o.done.equip);
      return o.done.state === 'inspected' ? s === 'inspected' || s === 'done' : s === o.done.state;
    }
    return false;
  }

  // №82: новое название задания (записи ID заморожены — переименование отдельно)
  const qname = (id) => (AB.QUEST_NAMES && AB.QUEST_NAMES[id]) || AB.ID.get(id).name;
  function heldCount(o) {
    if (o.done.usedBy && AB.Equip.state(o.done.usedBy) === 'done') return o.done.items.length;
    const lead = (AB.Party && AB.Party.members && AB.Party.members()[0]) || null;
    const who = lead ? lead.id : 'CHAR-001';
    return o.done.items.filter((i) => AB.Inventory.holderOf(who, i) || (AB.IsoStash && AB.IsoStash.count && AB.IsoStash.count(i) > 0)).length;
  }
  const textOf = (o) => (o.done && o.done.items ? o.text.replace('{n}', heldCount(o)).replace('{total}', o.done.items.length) : o.text);

  function start(id) {
    if (prog.has(id)) return;
    prog.set(id, { stage: 0, status: 'active' });
    AB.Bus.emit('quest:start', { id, name: qname(id) });
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
        AB.Bus.emit('quest:done', { id, name: qname(id) });
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
      return { id, name: qname(id), objectives: stage.objectives.map((o) => ({ ...o, ok: objectiveDone(o) })) };
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
    active: () => [...prog].filter(([, p]) => p.status === 'active').map(([id, p]) => { const q = AB.ID.get(id); return { id, name: qname(id), objectives: q.stages[p.stage].objectives.map((o) => ({ ...o, text: textOf(o), ok: objectiveDone(o) })) }; }),
    status: (id) => (prog.get(id) || {}).status || null,
    serialize: () => [...prog],
    restore(d) { (d || []).forEach(([id, p]) => prog.set(id, p)); },
  };
})();
