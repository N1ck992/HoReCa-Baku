// =====================================================================
// ISO STASH (дополнение №49). Общий инвентарь профиля игрока: 12 ячеек,
// одинаковые вещи складываются в стопку (размер стопки — stack из данных
// предмета). Живёт только на одно прохождение бункера: «Начать сначала»
// его очищает, сохранений нет (решение автора). У героев — только то, что
// надето: оружие в руках и одежда (текущий облик).
//
// Старые системы (оборудование, доступ к дверям, сюжет) по-прежнему
// обращаются к AB.Inventory: adapt() перенаправляет в общий инвентарь всё,
// кроме оружия в руках. Сама система инвентаря основной игры не менялась.
// =====================================================================

AB.IsoStash = (() => {
  const SIZE = 12;
  let cells = new Array(SIZE).fill(null);       // { item, qty }
  const stackOf = (id) => Math.max(1, AB.ID.get(id).stack || 1);

  function room(itemId) {
    let free = 0;
    for (const c of cells) {
      if (!c) free += stackOf(itemId);
      else if (c.item === itemId) free += stackOf(itemId) - c.qty;
    }
    return free;
  }
  // положить; возвращает, сколько поместилось
  function add(itemId, qty = 1) {
    let left = qty;
    for (const c of cells) if (left && c && c.item === itemId && c.qty < stackOf(itemId)) { const t = Math.min(left, stackOf(itemId) - c.qty); c.qty += t; left -= t; }
    for (let i = 0; i < SIZE && left; i++) if (!cells[i]) { const t = Math.min(left, stackOf(itemId)); cells[i] = { item: itemId, qty: t }; left -= t; }
    if (qty - left) AB.Bus.emit('inventory:changed', { charId: null, itemId, delta: qty - left });
    return qty - left;
  }
  function remove(itemId, qty = 1) {
    let left = qty;
    for (let i = SIZE - 1; i >= 0 && left; i--) {
      const c = cells[i];
      if (!c || c.item !== itemId) continue;
      const t = Math.min(left, c.qty); c.qty -= t; left -= t;
      if (!c.qty) cells[i] = null;
    }
    if (qty - left) AB.Bus.emit('inventory:changed', { charId: null, itemId, delta: -(qty - left) });
    return qty - left;
  }
  const count = (itemId) => cells.reduce((a, c) => a + (c && c.item === itemId ? c.qty : 0), 0);

  // использовать вещь из ячейки на герое (лечение — по данным предмета)
  function useBlock(i, charId) {
    const s = cells[i];
    if (!s) return 'Пусто';
    const d = AB.ID.get(s.item);
    if (d.weapon) return 'Это оружие — его берут в руки';
    if (!d.use) return 'Понадобится для ремонта';
    const c = AB.Chars.get(charId);
    if (!c || c.dead) return 'Погиб';
    if (d.use.type === 'heal' && c.hp >= AB.ID.get(charId).stats.maxHp) return 'Здоровье полное';
    return null;
  }
  function use(i, charId) {
    if (useBlock(i, charId)) return false;
    const d = AB.ID.get(cells[i].item);
    if (d.use.type === 'heal') AB.Chars.heal(charId, d.use.amount);
    cells[i].qty--; if (!cells[i].qty) cells[i] = null;
    AB.Bus.emit('item:used', { charId, itemId: d.id });
    AB.Bus.emit('inventory:changed', { charId: null, itemId: d.id, delta: -1 });
    return true;
  }
  // оружие из ячейки — в руки герою; то, что было в руках, — на это место
  function equip(i, charId) {
    const s = cells[i];
    if (!s || !AB.ID.get(s.item).weapon) return false;
    const h = AB.Inventory.weapon(charId), held = h && { item: h.item, qty: h.qty || 1 };   // копия: remove обнуляет ячейку
    if (held) AB.Inventory.remove(charId, held.item, held.qty);
    cells[i] = held ? { item: held.item, qty: held.qty } : null;
    AB.Inventory.add(charId, s.item, 1, { swap: false });
    AB.Bus.emit('inventory:exchange', { fromId: null, toId: charId, given: s.item, taken: held && held.item });
    return true;
  }
  // оружие из рук — в общий инвентарь
  function unequip(charId) {
    const h = AB.Inventory.weapon(charId), held = h && { item: h.item, qty: h.qty || 1 };
    if (!held || room(held.item) < 1) return false;
    AB.Inventory.remove(charId, held.item, held.qty);
    add(held.item, 1);
    return true;
  }
  function drop(i) {
    const s = cells[i];
    if (!s) return null;
    cells[i] = null;
    AB.Bus.emit('inventory:changed', { charId: null, itemId: s.item, delta: -s.qty });
    return s;
  }

  // ---------- переходник для старых систем ----------
  function adapt() {
    const I = AB.Inventory, orig = { add: I.add, remove: I.remove, count: I.count, addShared: I.addShared, holderOf: I.holderOf, partyHasRoom: I.partyHasRoom };
    const isWeapon = (id) => !!AB.ID.get(id).weapon;
    // взять с пола / получить: оружие — в руки, если они свободны; остальное — в общий инвентарь
    I.addShared = (charId, itemId, qty) => {
      if (isWeapon(itemId) && !I.weapon(charId)) return { taken: orig.add(charId, itemId, 1, { swap: false }), who: charId };
      return { taken: add(itemId, qty), who: charId };
    };
    I.add = (charId, itemId, qty = 1, o = {}) => (isWeapon(itemId) && !I.weapon(charId) ? orig.add(charId, itemId, qty, { ...o, swap: false }) : add(itemId, qty));
    I.remove = (charId, itemId, qty = 1) => {
      const w = I.weapon(charId);
      if (w && w.item === itemId) return orig.remove(charId, itemId, qty);
      return remove(itemId, qty);
    };
    I.count = (charId, itemId) => count(itemId) + (I.weapon(charId) && I.weapon(charId).item === itemId ? 1 : 0);
    I.holderOf = (charId, itemId) => (count(itemId) ? charId : null);
    I.partyHasRoom = (charId, itemId) => room(itemId) > 0;
    I.packs = () => [];
  }

  return {
    SIZE, add, remove, count, room, use, useBlock, equip, unequip, drop, adapt,
    cells: () => cells.slice(), slot: (i) => cells[i] || null,
    reset() { cells = new Array(SIZE).fill(null); },
  };
})();
