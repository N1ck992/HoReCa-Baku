// =====================================================================
// Улучшения (PERK-*), дополнения №41, №44. Выбор одного из трёх — на каждом
// новом уровне опыта (js/systems/progress.js). Действуют, пока герои на
// корабле, и сохраняются; повторный выбор складывается.
//
// ЧЕРНОВИК (pending: true) — список предложен разработчиком по решению автора
// «предложи черновик»; меняют только то, что уже есть в игре. Автор утверждает
// или заменяет.
//
// mods — множители: rangedDamage, meleeDamage, damageTaken, moveSpeed,
//        doorTime (закрыть/укрепить), doorHp (прочность дверей), repairTime,
//        auraHeal (лечение дротикового пистолета), plasmaCool (остывание плазмы).
// =====================================================================

AB.PERKS = [
  { id: 'PERK-001', name: 'Тяжёлая рука', desc: 'Удары в ближнем бою на 25% сильнее.', mods: { meleeDamage: 1.25 }, pending: true },
  { id: 'PERK-002', name: 'Твёрдый прицел', desc: 'Выстрелы на 20% сильнее.', mods: { rangedDamage: 1.2 }, pending: true },
  { id: 'PERK-003', name: 'Толстая кожа', desc: 'Получаемый урон меньше на 15%.', mods: { damageTaken: 0.85 }, pending: true },
  { id: 'PERK-004', name: 'Лёгкий шаг', desc: 'Отряд двигается на 12% быстрее.', mods: { moveSpeed: 1.12 }, pending: true },
  { id: 'PERK-005', name: 'Золотые руки', desc: 'Починка на 25% быстрее.', mods: { repairTime: 0.75 }, pending: true },
  { id: 'PERK-006', name: 'Баррикадист', desc: 'Закрыть и укрепить дверь на 30% быстрее.', mods: { doorTime: 0.7 }, pending: true },
  { id: 'PERK-007', name: 'Крепкие засовы', desc: 'Двери держат на 30% дольше.', mods: { doorHp: 1.3 }, pending: true },
  { id: 'PERK-008', name: 'Полевая медицина', desc: 'Аура дротикового пистолета лечит на 40% сильнее.', mods: { auraHeal: 1.4 }, pending: true },
  { id: 'PERK-009', name: 'Теплоотвод', desc: 'Плазмомёт остывает на 30% быстрее.', mods: { plasmaCool: 1.3 }, pending: true },
];

AB.PERKS.forEach((p) => AB.ID.register(p.id, p));
