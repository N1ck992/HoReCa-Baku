// =====================================================================
// LOG SYSTEM: находки и записи экипажа (LOG-*, данные — js/data/logs.js).
// Где лежат, что уже найдено, открыть запись. Отображение — renderer и main.
// =====================================================================

AB.Logs = (() => {
  const found = new Set();

  // где находка сейчас: обычная — в своём помещении; жетон — на месте гибели противника
  function placeOf(l) {
    if (l.after && !AB.Story.isDone(l.after)) return null;
    if (l.from) {
      if (!AB.Enemies.isDead(l.from)) return null;
      const e = AB.Enemies.get(l.from), d = AB.ID.get(l.from);
      return { room: e ? e.room : d.spawn.room, x: e ? (e.deadX ?? e.x) + 26 : d.spawn.x, y: 0 };
    }
    return { room: l.room, x: l.x, y: l.y || 0 };
  }

  function inRoom(roomId) {
    const out = [];
    for (const l of AB.LOGS) {
      const p = placeOf(l);
      if (p && p.room === roomId) out.push({ log: l, x: p.x, y: p.y, read: found.has(l.id) });
    }
    return out;
  }

  // прочитать (первый раз — запись попадает в журнал)
  function read(id) {
    const l = AB.ID.get(id);
    if (!l) return false;
    const first = !found.has(id);
    if (first) { found.add(id); AB.Bus.emit('log:found', { id, title: l.title, count: found.size, total: AB.LOGS.length }); }
    AB.Bus.emit('log:open', { id, first });
    return true;
  }

  const VERB = { pad: 'Прочитать', terminal: 'Прочитать', audio: 'Прослушать', trace: 'Осмотреть', tag: 'Поднять' };

  return {
    inRoom, read,
    verb: (l) => VERB[l.form] || 'Осмотреть',
    isFound: (id) => found.has(id),
    found: () => AB.LOGS.filter((l) => found.has(l.id)),
    total: () => AB.LOGS.length,
    serialize: () => [...found],
    restore(d) { (d || []).forEach((id) => AB.ID.has(id) && found.add(id)); },
  };
})();
