// =====================================================================
// INVENTORY SYSTEM (GDD §13.5). Инвентарь у каждого персонажа свой (GDD §7).
// Ячейки с ограничением стака из данных предмета (ITEM-*.stack).
// =====================================================================

AB.Inventory = (() => {
  const SLOTS = 8;
  const bags = new Map(); // charId -> [ {item, qty} | null ]

  function bag(charId) {
    if (!bags.has(charId)) bags.set(charId, new Array(SLOTS).fill(null));
    return bags.get(charId);
  }

  // Добавляет сколько поместится. Возвращает, сколько добавлено.
  function add(charId, itemId, qty) {
    const def = AB.ID.get(itemId);
    if (!def) return 0;
    const b = bag(charId);
    let left = qty;
    for (const s of b) {
      if (left <= 0) break;
      if (s && s.item === itemId && s.qty < def.stack) {
        const n = Math.min(left, def.stack - s.qty);
        s.qty += n; left -= n;
      }
    }
    for (let i = 0; i < b.length && left > 0; i++) {
      if (!b[i]) {
        const n = Math.min(left, def.stack);
        b[i] = { item: itemId, qty: n }; left -= n;
      }
    }
    const added = qty - left;
    if (added) AB.Bus.emit('inventory:changed', { charId, itemId, delta: added });
    return added;
  }

  function count(charId, itemId) {
    return bag(charId).reduce((a, s) => a + (s && s.item === itemId ? s.qty : 0), 0);
  }

  // Убирает qty штук. Возвращает true, если хватило.
  function remove(charId, itemId, qty) {
    if (count(charId, itemId) < qty) return false;
    const b = bag(charId);
    let left = qty;
    for (let i = b.length - 1; i >= 0 && left > 0; i--) {
      const s = b[i];
      if (s && s.item === itemId) {
        const n = Math.min(left, s.qty);
        s.qty -= n; left -= n;
        if (!s.qty) b[i] = null;
      }
    }
    AB.Bus.emit('inventory:changed', { charId, itemId, delta: -qty });
    return true;
  }

  function slot(charId, i) {
    return bag(charId)[i] || null;
  }

  // Что мешает использовать предмет из ячейки (null — можно)
  function useBlock(charId, i) {
    const s = slot(charId, i);
    if (!s) return 'Пустая ячейка';
    const def = AB.ID.get(s.item);
    if (!def.use) return 'Используется при ремонте и изготовлении';
    if (def.use.type === 'heal') {
      const c = AB.Chars.get(charId), cd = AB.ID.get(charId);
      if (c && c.hp >= cd.stats.maxHp) return 'Здоровье полное';
    }
    return null;
  }

  function use(charId, i) {
    if (useBlock(charId, i)) return false;
    const s = slot(charId, i);
    const def = AB.ID.get(s.item);
    if (def.use.type === 'heal') AB.Chars.heal(charId, def.use.amount);
    remove(charId, s.item, 1);
    AB.Bus.emit('item:used', { charId, itemId: def.id });
    return true;
  }

  // Выбросить всю ячейку: предмет появляется на полу рядом с персонажем
  function drop(charId, i) {
    const s = slot(charId, i);
    const c = AB.Chars.get(charId);
    if (!s || !c) return false;
    const { item, qty } = s;
    bag(charId)[i] = null;
    AB.Rooms.dropItem(c.room, item, qty, c.x + c.facing * 30);
    AB.Bus.emit('inventory:changed', { charId, itemId: item, delta: -qty });
    return true;
  }

  return {
    SLOTS, add, remove, count, slot, use, useBlock, drop,
    slots: (charId) => bag(charId).slice(),
    serialize: () => [...bags].map(([id, b]) => [id, b]),
    restore(d) { (d || []).forEach(([id, b]) => bags.set(id, b.concat(new Array(Math.max(0, SLOTS - b.length)).fill(null)))); },
  };
})();
