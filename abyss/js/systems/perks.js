// =====================================================================
// PERK SYSTEM (дополнение №41). После боевой локации — выбор одного из трёх
// случайных перков (js/data/perks.js). Выбранные действуют до конца корабля
// и сохраняются. Другие системы спрашивают множитель: AB.Perks.mod('rangedDamage').
// =====================================================================

AB.Perks = (() => {
  const chosen = [];   // ID выбранных перков (могут повторяться — эффект складывается)

  function mod(key) {
    let k = 1;
    for (const id of chosen) { const p = AB.ID.get(id); if (p && p.mods && p.mods[key] != null) k *= p.mods[key]; }
    return k;
  }
  // три случайных из списка (без повторов в одной тройке)
  function offer(n = 3) {
    const pool = AB.PERKS.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, n);
  }
  function choose(id) {
    if (!AB.ID.has(id)) return false;
    chosen.push(id);
    AB.Bus.emit('perk:chosen', { id, name: AB.ID.get(id).name });
    return true;
  }
  return {
    mod, offer, choose, chosen: () => chosen.slice(),
    serialize: () => chosen.slice(),
    restore(d) { (d || []).forEach((id) => AB.ID.has(id) && chosen.push(id)); },
  };
})();
