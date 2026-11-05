// =====================================================================
// Предметы (GDD §9 — система ресурсов). Только постоянные данные.
// stack — сколько штук помещается в одну ячейку инвентаря.
// use   — что делает «Использовать»; null — предмет нужен для ремонта
//         и изготовления (этап 6 и дальше).
// =====================================================================

AB.ITEMS = [
  { id: 'ITEM-001', name: 'Металлолом', short: 'ЛОМ', category: 'resource', stack: 20, icon: 'ASSET-ITEM001-01', use: null,
    desc: 'Обломки обшивки и конструкций. Пригодятся для ремонта.' },
  { id: 'ITEM-002', name: 'Электронные компоненты', short: 'ЭЛК', category: 'resource', stack: 10, icon: 'ASSET-ITEM002-01', use: null,
    desc: 'Платы, микросхемы, разъёмы. Нужны для ремонта оборудования.' },
  { id: 'ITEM-003', name: 'Провода', short: 'ПРВ', category: 'resource', stack: 10, icon: 'ASSET-ITEM003-01', use: null,
    desc: 'Моток изолированного кабеля.' },
  { id: 'ITEM-004', name: 'Предохранитель', short: 'ПРД', category: 'resource', stack: 5, icon: 'ASSET-ITEM004-01', use: null,
    desc: 'Силовой предохранитель для электрощитов.' },
  { id: 'ITEM-005', name: 'Медикаменты', short: 'МЕД', category: 'medical', stack: 5, icon: 'ASSET-ITEM005-01', use: { type: 'heal', amount: 30 },
    desc: 'Стимулятор и перевязочный набор. Восстанавливает 30 здоровья.' },
  { id: 'ITEM-006', name: 'Топливо', short: 'ТПЛ', category: 'resource', stack: 3, icon: 'ASSET-ITEM006-01', use: null,
    desc: 'Канистра с топливом для генераторов.' },
  { id: 'ITEM-007', name: 'Биоматериалы', short: 'БИО', category: 'resource', stack: 10, icon: 'ASSET-ITEM007-01', use: null,
    desc: 'Образцы органики. Нужны для исследований.' },
  { id: 'ITEM-009', name: 'Металлическая труба', short: 'ТРБ', category: 'weapon', stack: 1, icon: 'ASSET-ITEM009-01', use: null,
    weapon: { damage: 26, range: 64, cooldown: 0.65, hitAt: 0.21 },
    desc: 'Обрезок трубы. Тяжёлый и надёжный. Можно взять в руки как оружие.' },
  { id: 'ITEM-008', name: 'Боеприпасы', short: 'БП', category: 'ammo', stack: 60, icon: 'ASSET-ITEM008-01', use: null,
    desc: 'Патроны. Понадобятся, когда появится оружие.' },
];

AB.ITEMS.forEach((i) => AB.ID.register(i.id, i));
