// =====================================================================
// ТИПЫ УРОНА (дополнение №152). Считает множитель «камень-ножницы-бумага» по таблице js/data/damage.js.
// Используют: бой в отсеках (iso-enemies.js, iso-combat.js), дно (iso-overworld.js), поверхность
// (iso-surface.js). Последний удар запоминается (AB.Damage.last) — для цифр урона и подсказок.
// =====================================================================

AB.Damage = (() => {
  const T = () => AB.DAMAGE;
  const mult = (dtype, armor) => { const row = T().mult[dtype || 'kinetic']; return row ? (row[armor || 'none'] ?? 1) : 1; };
  // тип урона оружия героя (предмет в руках); w — параметры оружия (если есть)
  function weaponType(itemId, w) {
    if (itemId && T().weapons[itemId]) return T().weapons[itemId];
    if (w && w.energy) return 'energy';
    if (w && w.cutter) return 'thermal';
    return T().melee;
  }
  const enemy = (id) => T().enemies[String(id || '').split('~')[0]] || T().enemyDefault;
  // защита героя: в экзокостюме — защита техники, иначе своя
  function heroArmor(id, suited) {
    if (suited && AB.VEHICLES) { const v = AB.VEHICLES['EQUIP-005']; return (v && v.armorType) || 'kinetic'; }
    return T().heroes[id] || 'none';
  }
  // подпись эффекта: «сильно» / «слабо» / ''
  const verdict = (m) => (m >= 1.24 ? 'strong' : m <= 0.76 ? 'weak' : '');
  const name = (dtype) => T().types[dtype] || dtype;
  const armorName = (a) => T().armors[a || 'none'] || a;
  return { mult, weaponType, enemy, heroArmor, verdict, name, armorName, last: null };
})();
