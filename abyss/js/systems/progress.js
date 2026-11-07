// =====================================================================
// PROGRESS SYSTEM (дополнение №44). Опыт и уровни улучшений. Опыт дают
// испытания (за противника, за этап починки). Уровень: 6 опыта, затем 12,
// 24, 48… (каждый следующий — вдвое больше). Новый уровень — выбор одного
// из трёх улучшений (js/systems/perks.js). Опыт, уровни и улучшения
// действуют, пока герои на корабле; сохраняются.
// =====================================================================

AB.Progress = (() => {
  let xp = 0, level = 0, unspent = 0;   // unspent — уровни, за которые ещё не выбрано улучшение
  const need = (lv = level) => 6 * 2 ** lv;
  function add(n) {
    if (!n) return;
    xp += n;
    AB.Bus.emit('progress:xp', { xp, need: need(), level, gained: n });
    while (xp >= need()) {
      xp -= need();
      level++;
      unspent++;
      AB.Bus.emit('progress:level', { level });
    }
  }
  return {
    add, need,
    xp: () => xp, level: () => level, unspent: () => unspent,
    spend() { if (unspent > 0) unspent--; },
    serialize: () => ({ xp, level, unspent }),
    restore(d) { if (!d) return; xp = d.xp || 0; level = d.level || 0; unspent = d.unspent || 0; },
  };
})();
