// =====================================================================
// МОДИФИКАЦИЯ ТЕХНИКИ (дополнение №161): какие детали стоят в слотах техники и что они дают.
// Данные деталей — js/data/vehicle-parts.js. Хранится в localStorage «abyss_mods»:
// { 'EQUIP-005': { chassis: 'ITEM-301', … } }. Поставить деталь — она уходит из вещей отряда;
// снять или заменить — прежняя возвращается в вещи. eff(id) — характеристики техники с деталями.
// =====================================================================

AB.VehMods = (() => {
  const KEY = 'abyss_mods';
  let st = null;
  const cache = {};
  const P = (id) => AB.VEHICLE_PARTS.find((p) => p.id === id) || null;
  function S() { if (!st) { try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; } if (!st || typeof st !== 'object') st = {}; } return st; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* без хранилища */ } for (const k of Object.keys(cache)) delete cache[k]; AB.Bus.emit('mods:changed', {}); }
  const parts = (vid) => ({ ...(S()[vid] || {}) });
  // все бонусы деталей техники — суммой
  function bonus(vid) {
    const b = { speed: 0, attack: 0, rate: 0, armorAdd: 0, hp: 0, crit: 0, shield: 0 };
    for (const id of Object.values(S()[vid] || {})) { const p = P(id); if (p) for (const [k, v] of Object.entries(p.bonus)) b[k] = (b[k] || 0) + v; }
    return b;
  }
  // характеристики техники с деталями (сама техника в AB.VEHICLES не меняется)
  function eff(vid) {
    if (cache[vid]) return cache[vid];
    const v = AB.VEHICLES[vid]; if (!v) return null;
    const b = bonus(vid);
    return (cache[vid] = { ...v, speed: v.speed * (1 + b.speed), attack: Math.round(v.attack * (1 + b.attack)), rate: +(v.rate * (1 + b.rate)).toFixed(2),
      armor: Math.min(0.8, v.armor + b.armorAdd), hpK: 1 + b.hp, crit: b.crit, shield0: b.shield, mods: b });
  }
  // поставить деталь из вещей отряда (прежнюю в этом слоте — вернуть в вещи)
  function install(vid, item) {
    const p = P(item); if (!p || !AB.VEHICLES[vid]) return { ok: false, why: 'Это не деталь техники' };
    if (!AB.IsoStash || AB.IsoStash.count(item) < 1) return { ok: false, why: 'Такой детали нет в вещах' };
    const s = S(), cur = (s[vid] || {})[p.slot];
    AB.IsoStash.remove(item, 1); if (cur) AB.IsoStash.add(cur, 1);
    s[vid] = { ...(s[vid] || {}), [p.slot]: item }; save();
    return { ok: true };
  }
  function remove(vid, slot) {
    const s = S(), cur = (s[vid] || {})[slot]; if (!cur) return { ok: false, why: 'Слот пуст' };
    if (AB.IsoStash) AB.IsoStash.add(cur, 1);
    delete s[vid][slot]; save();
    return { ok: true };
  }
  // детали в вещах для слота
  const available = (slot) => AB.VEHICLE_PARTS.filter((p) => p.slot === slot && AB.IsoStash && AB.IsoStash.count(p.id) > 0).map((p) => ({ ...p, n: AB.IsoStash.count(p.id) }));
  // случайные детали по правилу выпадения: rule = { chance, n, lvls }
  function roll(rule) {
    const out = []; if (!rule || Math.random() >= rule.chance) return out;
    for (let i = 0; i < (rule.n || 1); i++) {
      const lv = rule.lvls[Math.floor(Math.random() * rule.lvls.length)], pool = AB.VEHICLE_PARTS.filter((p) => p.lvl === lv);
      if (pool.length) out.push(pool[Math.floor(Math.random() * pool.length)].id);
    }
    return out;
  }
  const bonusText = (b) => {
    const t = [];
    if (b.speed) t.push(`скорость ${b.speed > 0 ? '+' : ''}${Math.round(b.speed * 100)}%`);
    if (b.attack) t.push(`урон +${Math.round(b.attack * 100)}%`);
    if (b.rate) t.push(`темп ${b.rate < 0 ? '+' : '−'}${Math.round(Math.abs(b.rate) * 100)}%`);
    if (b.armorAdd) t.push(`броня +${Math.round(b.armorAdd * 100)}%`);
    if (b.hp) t.push(`прочность +${Math.round(b.hp * 100)}%`);
    if (b.crit) t.push(`крит ${Math.round(b.crit * 100)}%`);
    if (b.shield) t.push(`щит ${b.shield} в начале боя`);
    return t.join(' · ');
  };
  return { parts, bonus, eff, install, remove, available, roll, part: P, bonusText, _reset: () => { st = {}; save(); } };
})();
