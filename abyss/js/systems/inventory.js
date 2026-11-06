// =====================================================================
// INVENTORY SYSTEM (GDD §13.5). У каждого персонажа два слота (GDD §7,
// согласованное дополнение №12):
//   0 — оружие: отдельный слот, оружие сразу в руках;
//   1 — рюкзак: одна вещь, которую персонаж несёт с собой (ключ-карта,
//       предохранитель, аптечка). Её видно над головой по нажатию.
// Одинаковые вещи складываются в рюкзаке до предела стака (ITEM-*.stack).
// =====================================================================

AB.Inventory = (() => {
  const SLOTS = 2;
  const WEAPON = 0, PACK = 1;
  const bags = new Map(); // charId -> [weapon | null, backpack | null], ячейка = {item, qty}

  function bag(charId) {
    if (!bags.has(charId)) bags.set(charId, [null, null]);
    return bags.get(charId);
  }

  const slotFor = (itemId) => (AB.ID.get(itemId).weapon ? WEAPON : PACK);

  function syncHands(charId) {
    const w = bag(charId)[WEAPON];
    if (AB.Chars.get(charId)) AB.Chars.equip(charId, w ? w.item : null);
  }

  // Положить вещь. swap: true — если слот занят другой вещью, старая падает на пол
  // (подбор с пола); swap: false — не помещается, значит не берём (обыск).
  // Возвращает, сколько штук взято.
  // сколько гарпунов можно носить в ружье
  const AMMO_CAP = 18;

  function add(charId, itemId, qty, { swap = true } = {}) {
    const def = AB.ID.get(itemId);
    if (!def) return 0;
    // боеприпасы заряжаются прямо в оружие дальнего боя, если оно в руках
    const w = bag(charId)[WEAPON];
    if (def.category === 'ammo' && w && w.ammo != null && AB.ID.get(w.item).weapon.ranged) {
      const taken = Math.min(qty, AMMO_CAP - (w.ammo || 0));
      if (taken > 0) { w.ammo = (w.ammo || 0) + taken; AB.Bus.emit('inventory:changed', { charId, itemId, delta: taken }); }
      return taken;
    }
    const b = bag(charId), i = slotFor(itemId), cur = b[i];
    let taken = 0;
    if (!cur) {
      taken = Math.min(qty, def.stack);
      b[i] = { item: itemId, qty: taken };
      if (def.weapon && def.weapon.ranged && !def.weapon.energy) b[i].ammo = 0;
    } else if (cur.item === itemId) {
      taken = Math.min(qty, def.stack - cur.qty);
      cur.qty += taken;
    } else if (swap) {
      const c = AB.Chars.get(charId);
      if (c) AB.Rooms.dropItem(c.room, cur.item, cur.qty, c.x - c.facing * 18);
      AB.Bus.emit('inventory:swapped', { charId, dropped: cur.item, qty: cur.qty, taken: itemId });
      taken = Math.min(qty, def.stack);
      b[i] = { item: itemId, qty: taken };
      if (def.weapon && def.weapon.ranged && !def.weapon.energy) b[i].ammo = 0;
    }
    if (taken) {
      if (i === WEAPON) syncHands(charId);
      // взяли ружьё — гарпуны из рюкзака сразу уходят в магазин
      const pk = b[PACK];
      if (i === WEAPON && def.weapon.ranged && b[WEAPON].ammo != null && pk && AB.ID.get(pk.item).category === 'ammo') {
        const load = Math.min(pk.qty, AMMO_CAP - (b[WEAPON].ammo || 0));
        b[WEAPON].ammo = (b[WEAPON].ammo || 0) + load;
        pk.qty -= load;
        if (!pk.qty) b[PACK] = null;
        AB.Bus.emit('inventory:changed', { charId, itemId: pk.item, delta: -load });
      }
      AB.Bus.emit('inventory:changed', { charId, itemId, delta: taken });
    }
    return taken;
  }

  function count(charId, itemId) {
    return bag(charId).reduce((a, s) => a + (s && s.item === itemId ? s.qty : 0), 0);
  }

  // Убирает qty штук. Возвращает true, если хватило.
  function remove(charId, itemId, qty) {
    const b = bag(charId), i = slotFor(itemId), s = b[i];
    if (!s || s.item !== itemId || s.qty < qty) return false;
    s.qty -= qty;
    if (!s.qty) b[i] = null;
    if (i === WEAPON) syncHands(charId);
    AB.Bus.emit('inventory:changed', { charId, itemId, delta: -qty });
    return true;
  }

  function slot(charId, i) {
    return bag(charId)[i] || null;
  }

  // Что мешает использовать вещь из слота (null — можно)
  function useBlock(charId, i) {
    const s = slot(charId, i);
    if (!s) return 'Пусто';
    const def = AB.ID.get(s.item);
    if (def.weapon) return 'Оружие уже в руках';
    if (def.category === 'key') return 'Сработает сама, когда подойдёте к двери';
    if (!def.use) return 'Понадобится для ремонта';
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

  // Выбросить слот целиком: вещь падает на пол рядом с персонажем
  function drop(charId, i) {
    const s = slot(charId, i);
    const c = AB.Chars.get(charId);
    if (!s || !c) return false;
    const { item, qty } = s;
    bag(charId)[i] = null;
    if (i === WEAPON) syncHands(charId);
    AB.Rooms.dropItem(c.room, item, qty, c.x + c.facing * 30);
    AB.Bus.emit('inventory:changed', { charId, itemId: item, delta: -qty });
    return true;
  }

  // ---------- Энергетическое оружие: нагрев вместо боезапаса ----------
  // heat 0…1; на 1 — перегрев, стрелять нельзя, пока не остынет до 0
  function heat(charId) {
    const w = bag(charId)[WEAPON];
    const wd = w && AB.ID.get(w.item).weapon;
    if (!wd || !wd.energy) return null;
    return { heat: w.heat || 0, over: !!w.over };
  }
  function fire(charId) {
    const w = bag(charId)[WEAPON];
    const wd = w && AB.ID.get(w.item).weapon;
    if (!wd || !wd.energy || w.over) return false;
    w.heat = Math.min(1, (w.heat || 0) + wd.heatPerShot);
    w.coolT = wd.coolDelay;
    if (w.heat >= 0.999) { w.over = true; AB.Bus.emit('weapon:overheat', { charId }); }
    return true;
  }
  function cool(dt) {
    for (const [charId, b] of bags) {
      const w = b[WEAPON];
      const wd = w && AB.ID.get(w.item).weapon;
      if (!wd || !wd.energy || !w.heat) continue;
      if (w.coolT > 0) { w.coolT -= dt; continue; }
      w.heat = Math.max(0, w.heat - wd.coolRate * dt * (w.over ? 1.2 : 1));
      if (w.over && w.heat === 0) { w.over = false; AB.Bus.emit('weapon:cooled', { charId }); }
    }
  }

  // ---------- Обмен между участниками группы ----------
  // Слот целиком меняется местами (пустой — значит просто передать или взять).
  function exchangeBlock(fromId, toId, i) {
    const a = AB.Chars.get(fromId), c = AB.Chars.get(toId);
    if (!a || !c || c.dead || a.dead) return 'Некому передать';
    if (a.room !== c.room) return 'В другом помещении';
    if (Math.abs(a.x - c.x) > 240) return 'Слишком далеко — подойдите ближе';
    if (!bag(fromId)[i] && !bag(toId)[i]) return 'Нечего передавать';
    return null;
  }
  function exchange(fromId, toId, i) {
    if (exchangeBlock(fromId, toId, i)) return false;
    const a = bag(fromId), c = bag(toId);
    const given = a[i], taken = c[i];
    a[i] = taken; c[i] = given;
    if (i === WEAPON) { syncHands(fromId); syncHands(toId); }
    AB.Bus.emit('inventory:changed', { charId: fromId, itemId: (taken || given).item, delta: 0 });
    AB.Bus.emit('inventory:changed', { charId: toId, itemId: (given || taken).item, delta: 0 });
    AB.Bus.emit('inventory:exchange', { fromId, toId, slot: i, given: given && given.item, taken: taken && taken.item });
    return true;
  }

  return {
    heat, fire, cool, exchange, exchangeBlock,
    SLOTS, WEAPON, PACK, AMMO_CAP, add, remove, count, slot, use, useBlock, drop,
    ammo: (charId) => { const w = bag(charId)[WEAPON]; return w && w.ammo != null ? w.ammo : null; },
    spendAmmo: (charId) => { const w = bag(charId)[WEAPON]; if (!w || !w.ammo) return false; w.ammo--; return true; },
    weapon: (charId) => bag(charId)[WEAPON],
    pack: (charId) => bag(charId)[PACK],
    slots: (charId) => bag(charId).slice(),
    serialize: () => [...bags].map(([id, b]) => [id, b]),
    // Старые сохранения (8 ячеек): оружие — в слот оружия, первая другая вещь — в рюкзак,
    // остальное ложится на пол рядом с персонажем.
    restore(d) {
      for (const [id, old] of d || []) {
        const b = [null, null];
        const extra = [];
        for (const s of old || []) {
          if (!s || !AB.ID.get(s.item)) continue;
          const i = slotFor(s.item);
          if (!b[i]) b[i] = s; else extra.push(s);
        }
        bags.set(id, b);
        const c = AB.Chars.get(id);
        if (c) extra.forEach((s, k) => AB.Rooms.dropItem(c.room, s.item, s.qty, c.x + 25 + k * 22));
        if (c) syncHands(id);
      }
    },
  };
})();
