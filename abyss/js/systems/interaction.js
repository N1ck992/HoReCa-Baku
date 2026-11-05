// =====================================================================
// Взаимодействие: что находится рядом с персонажем и что сделает
// кнопка действия. Двери, предметы на полу, контейнеры для обыска.
// =====================================================================

AB.Interact = (() => {
  const RANGE = { door: 80, item: 55, container: 75 };
  const SEARCH_TIME = 1.3;
  let search = null; // { charId, roomId, container, t }

  // Ближайший объект в досягаемости; объекты по направлению взгляда в приоритете
  function target(charId) {
    const c = AB.Chars.get(charId);
    const r = AB.Rooms.room();
    if (!c || !r || search) return null;
    const list = [];
    for (const d of r.doors) list.push({ kind: 'door', x: d.x, ref: d });
    for (const it of AB.Rooms.worldItems(r.id)) list.push({ kind: 'item', x: it.x, ref: it });
    for (const ct of r.containers || []) list.push({ kind: 'container', x: ct.x, ref: ct });
    let best = null, bestScore = Infinity;
    for (const o of list) {
      const dx = o.x - c.x;
      if (Math.abs(dx) > RANGE[o.kind]) continue;
      let score = Math.abs(dx) - (Math.sign(dx) === c.facing ? 15 : 0);
      // предметы на полу важнее; уже обысканный контейнер — в последнюю очередь
      if (o.kind === 'item') score -= 20;
      if (o.kind === 'container' && AB.Rooms.isSearched(r.id, o.ref.key)) score += 80;
      if (score < bestScore) { best = o; bestScore = score; }
    }
    return best;
  }

  // Подсказка для интерфейса
  function prompt(charId) {
    if (search) return { label: 'Обыск…', ok: true, progress: search.t / SEARCH_TIME };
    const t = target(charId);
    if (!t) return null;
    if (t.kind === 'door') {
      const pass = AB.Rooms.canPass(t.ref);
      return { label: pass.ok ? 'Открыть дверь' : pass.reason, ok: pass.ok };
    }
    if (t.kind === 'item') {
      const def = AB.ID.get(t.ref.item);
      return { label: `Подобрать: ${def.name}${t.ref.qty > 1 ? ` ×${t.ref.qty}` : ''}`, ok: true };
    }
    const searched = AB.Rooms.isSearched(AB.Rooms.current(), t.ref.key);
    return { label: searched ? `${t.ref.label}: пусто` : `Обыскать: ${t.ref.label}`, ok: !searched };
  }

  function act(charId) {
    const c = AB.Chars.get(charId);
    const t = target(charId);
    if (!c || !t) return false;
    c.facing = t.x >= c.x ? 1 : -1;

    if (t.kind === 'door') {
      c.reachLow = false;
      AB.Chars.playAction(charId, 'interact');
      if (AB.Rooms.useDoor(t.ref)) c.controllable = false;
      return true;
    }

    if (t.kind === 'item') {
      c.reachLow = true;
      AB.Chars.playAction(charId, 'interact');
      const added = AB.Inventory.add(charId, t.ref.item, t.ref.qty);
      if (added) AB.Rooms.takeItem(AB.Rooms.current(), t.ref.key, added);
      AB.Bus.emit('item:pickup', { charId, itemId: t.ref.item, added, left: t.ref.qty - added });
      return true;
    }

    const roomId = AB.Rooms.current();
    if (AB.Rooms.isSearched(roomId, t.ref.key)) {
      AB.Bus.emit('container:empty', { label: t.ref.label });
      return true;
    }
    c.reachLow = false;
    c.controllable = false;
    search = { charId, roomId, container: t.ref, t: 0 };
    AB.Chars.playAction(charId, 'interact');
    AB.Bus.emit('container:search', { key: t.ref.key });
    return true;
  }

  function update(dt) {
    if (!search) return;
    const prev = search.t;
    search.t += dt;
    // рука тянется к полкам несколько раз, пока идёт обыск
    if (Math.floor(prev / 0.65) !== Math.floor(search.t / 0.65) && search.t < SEARCH_TIME) {
      AB.Chars.playAction(search.charId, 'interact');
    }
    if (search.t < SEARCH_TIME) return;
    const { charId, roomId, container } = search;
    search = null;
    AB.Rooms.markSearched(roomId, container.key);
    const found = [];
    let full = false;
    const c = AB.Chars.get(charId);
    for (const [itemId, qty] of container.loot) {
      const added = AB.Inventory.add(charId, itemId, qty, { swap: false });
      if (added) found.push([itemId, added]);
      // что не поместилось — остаётся лежать рядом с контейнером
      if (qty - added > 0) { full = true; AB.Rooms.dropItem(roomId, itemId, qty - added, container.x - 40); }
    }
    if (c) c.controllable = true;
    AB.Bus.emit('container:looted', { label: container.label, found, full });
  }

  return { target, prompt, act, update, isSearching: () => !!search };
})();
