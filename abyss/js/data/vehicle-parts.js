// =====================================================================
// МОДИФИКАЦИЯ ТЕХНИКИ (дополнение №161, решение автора 2026-11-23: «приступай» — по плану после
// разбора референса: детали и чипы поверх базовой техники). У каждой техники 4 слота:
//   chassis — ходовая (скорость), armor — броня (броня, здоровье), weapon — орудие (урон, темп),
//   chip — чип (шанс крита, темп, щит в начале боя).
// Деталь — предмет ITEM-3xx в вещах отряда; поставить — в окне «Отряд» (витрина), снять — вернуть в вещи.
// Деталь не меняет саму технику: бонусы считаются поверх (AB.VehMods.eff). Уровни: 1 — обычная,
// 2 — редкая, 3 — трофейная. Выпадают с больших мобов, из лагерей и шахт, изредка с NPC.
// bonus: speed / attack / rate / armor / hp — доли (0.1 = +10%; rate −0.1 = бьёт на 10% чаще);
//   armorAdd — + к доле брони; crit — шанс ×1,5 урона; shield — щит в начале боя (ед.).
// Черновик баланса — ждёт автора.
// =====================================================================

AB.PART_SLOTS = {
  chassis: { name: 'Ходовая', icon: '⚙' },
  armor: { name: 'Броня', icon: '⛨' },
  weapon: { name: 'Орудие', icon: '✦' },
  chip: { name: 'Чип', icon: '▣' },
};

AB.VEHICLE_PARTS = [
  // ходовая
  { id: 'ITEM-301', slot: 'chassis', lvl: 1, name: 'Смазанные шарниры', bonus: { speed: 0.1 }, desc: 'Техника ходит на 10% быстрее.' },
  { id: 'ITEM-302', slot: 'chassis', lvl: 2, name: 'Гидроприводы', bonus: { speed: 0.2 }, desc: 'На 20% быстрее.' },
  { id: 'ITEM-303', slot: 'chassis', lvl: 3, name: 'Ходовая Стража', bonus: { speed: 0.25, hp: 0.1 }, desc: 'На 25% быстрее, +10% к прочности.' },
  // броня
  { id: 'ITEM-311', slot: 'armor', lvl: 1, name: 'Наварные листы', bonus: { armorAdd: 0.05 }, desc: 'Броня +5%.' },
  { id: 'ITEM-312', slot: 'armor', lvl: 2, name: 'Композитные плиты', bonus: { armorAdd: 0.1, hp: 0.1 }, desc: 'Броня +10%, прочность +10%.' },
  { id: 'ITEM-313', slot: 'armor', lvl: 3, name: 'Панцирь голема', bonus: { armorAdd: 0.15, hp: 0.2, speed: -0.05 }, desc: 'Броня +15%, прочность +20%, но на 5% медленнее.' },
  // орудие
  { id: 'ITEM-321', slot: 'weapon', lvl: 1, name: 'Калиброванный ствол', bonus: { attack: 0.1 }, desc: 'Урон +10%.' },
  { id: 'ITEM-322', slot: 'weapon', lvl: 2, name: 'Усиленный боёк', bonus: { attack: 0.15, rate: -0.05 }, desc: 'Урон +15%, бьёт на 5% чаще.' },
  { id: 'ITEM-323', slot: 'weapon', lvl: 3, name: 'Линза Архива', bonus: { attack: 0.25 }, desc: 'Урон +25%.' },
  // чипы
  { id: 'ITEM-331', slot: 'chip', lvl: 1, name: 'Чип прицела', bonus: { crit: 0.1 }, desc: 'Шанс 10% ударить на ×1,5.' },
  { id: 'ITEM-332', slot: 'chip', lvl: 2, name: 'Чип разгона', bonus: { rate: -0.12, crit: 0.05 }, desc: 'Бьёт на 12% чаще, крит 5%.' },
  { id: 'ITEM-333', slot: 'chip', lvl: 3, name: 'Чип щита', bonus: { shield: 20, crit: 0.08 }, desc: 'В начале боя — щит на 20 урона; крит 8%.' },
];
AB.VEHICLE_PARTS.forEach((p) => { if (!AB.ID.has(p.id)) AB.ID.register(p.id, { ...p, short: AB.PART_SLOTS[p.slot].icon, category: 'part', stack: 5, pending: true }); });

// откуда берутся детали: шанс и уровни
AB.PART_DROPS = {
  npc: { chance: 0.06, lvls: [1] },
  camp: { chance: 1, n: 2, lvls: [1, 2] },
  boss: { 1: { chance: 0.6, lvls: [1, 2] }, 2: { chance: 1, lvls: [2] }, 3: { chance: 1, n: 2, lvls: [2, 3] } },
  point: { chance: 1, lvls: [1, 2] },
};
