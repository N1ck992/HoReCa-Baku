// =====================================================================
// Нулевой Рубеж — игровые данные (баланс, постройки, юниты, герои)
// Все числа баланса собраны здесь, чтобы их было легко править.
// =====================================================================

const GAME_TITLE = 'Нулевой Рубеж';
const SAVE_VERSION = 1;

const RESOURCES = {
  metal:    { name: 'Металл',   icon: '🔩' },
  energy:   { name: 'Энергия',  icon: '⚡' },
  food:     { name: 'Провизия', icon: '🌾' },
  crystals: { name: 'Кристаллы', icon: '💎' },
};

// Постройки базы. cost/time — стоимость и время улучшения с 1 на 2 уровень,
// дальше растут по множителям COST_GROWTH / TIME_GROWTH.
const BUILDINGS = {
  hq: {
    name: 'Командный центр', icon: '🛰️', maxLevel: 10, time: 30,
    cost: { metal: 300, energy: 200, food: 150 },
    desc: 'Сердце колонии. Ограничивает уровень остальных построек и открывает слоты героев.',
  },
  mine: {
    name: 'Рудная шахта', icon: '⛏️', maxLevel: 10, time: 10, produces: 'metal',
    cost: { metal: 60, energy: 80, food: 40 },
    desc: 'Добывает металл из коры планеты.',
  },
  reactor: {
    name: 'Реактор', icon: '⚛️', maxLevel: 10, time: 10, produces: 'energy',
    cost: { metal: 90, energy: 40, food: 40 },
    desc: 'Вырабатывает энергию для дронов и построек.',
  },
  farm: {
    name: 'Гидропонная ферма', icon: '🌱', maxLevel: 10, time: 10, produces: 'food',
    cost: { metal: 70, energy: 70, food: 20 },
    desc: 'Выращивает провизию для колонистов и солдат.',
  },
  storage: {
    name: 'Хранилище', icon: '📦', maxLevel: 10, time: 15,
    cost: { metal: 120, energy: 60, food: 60 },
    desc: 'Увеличивает лимит хранения ресурсов.',
  },
  barracks: {
    name: 'Казармы', icon: '🪖', maxLevel: 10, time: 20,
    cost: { metal: 150, energy: 100, food: 120 },
    desc: 'Увеличивают размер армии и открывают новые типы войск.',
  },
};

const COST_GROWTH = 1.55;
const TIME_GROWTH = 1.6;

// Войска. req — требуемый уровень казарм.
const UNITS = {
  trooper: {
    name: 'Штурмовик', icon: '🧑‍🚀', atk: 6, hp: 25, time: 3, req: 1,
    cost: { metal: 25, food: 15 },
    desc: 'Базовая пехота. Дёшево и надёжно.',
  },
  drone: {
    name: 'Дрон-охотник', icon: '🛸', atk: 11, hp: 14, time: 4, req: 2,
    cost: { metal: 15, energy: 30 },
    desc: 'Высокий урон, но хрупкий корпус.',
  },
  crawler: {
    name: 'Краулер', icon: '🚜', atk: 22, hp: 90, time: 10, req: 4,
    cost: { metal: 90, energy: 50, food: 30 },
    desc: 'Тяжёлая гусеничная машина. Держит удар.',
  },
};

const RARITY = {
  common:    { name: 'Обычный',    weight: 60, color: '#9aa7b8', dupXp: 80 },
  rare:      { name: 'Редкий',     weight: 28, color: '#4fa3ff', dupXp: 150 },
  epic:      { name: 'Эпический',  weight: 10, color: '#b46bff', dupXp: 300 },
  legendary: { name: 'Легендарный', weight: 2, color: '#ffb83d', dupXp: 600 },
};

// Герои. atk/hp — бонус к армии (доля) на 1 уровне.
const HEROES = {
  orin:  { name: 'Орин Кейд',   role: 'Штурмовик',    rarity: 'common',    icon: '🎖️', atk: 0.08, hp: 0.04 },
  nyala: { name: 'Ньяла Ро',    role: 'Полевой медик', rarity: 'common',    icon: '⚕️', atk: 0.02, hp: 0.10 },
  dex:   { name: 'Декс Мерро',  role: 'Разведчик',    rarity: 'common',    icon: '🔭', atk: 0.06, hp: 0.06 },
  veil:  { name: 'Ирис Вейл',   role: 'Снайпер',      rarity: 'rare',      icon: '🎯', atk: 0.15, hp: 0.03 },
  krow:  { name: 'Сабра Кроу',  role: 'Инженер',      rarity: 'rare',      icon: '🔧', atk: 0.08, hp: 0.10 },
  holt:  { name: 'Арвен Холт',  role: 'Командир',     rarity: 'epic',      icon: '⭐', atk: 0.15, hp: 0.15 },
  ash:   { name: 'Эш',          role: 'Ксено-оракул', rarity: 'legendary', icon: '🔮', atk: 0.25, hp: 0.20 },
};

const HERO_MAX_LEVEL = 20;
const HERO_LEVEL_BONUS = 0.15;   // +15% к базовому бонусу за уровень
const RECRUIT_COST = 100;        // кристаллов за вербовку

// Миссии (сектора). Генерируются по формуле — легко расширять.
const ENEMY_NAMES = [
  'Мародёры пустошей', 'Рой дронов', 'Мутанты каньона', 'Сторожевой бастион',
  'Бродячий мех', 'Культ Сигнала', 'Ржавый легион', 'Ксено-улей',
];
const MISSION_COUNT = 20;

function missionDef(i) {
  // i — номер с 1
  const g = (base, k) => Math.round(base * Math.pow(k, i - 1));
  return {
    id: i,
    name: `Сектор ${i}`,
    enemy: ENEMY_NAMES[(i - 1) % ENEMY_NAMES.length] + (i > ENEMY_NAMES.length ? ' II' : ''),
    hp: g(150, 1.45),
    atk: g(18, 1.42),
    foodCost: 20 + 10 * i,
    reward: { metal: g(120, 1.38), energy: g(100, 1.38), food: g(80, 1.38) },
    crystals: 30 + 5 * i,
    heroXp: 40 * i,
    boss: i % 5 === 0,
  };
}

const START_STATE = () => ({
  version: SAVE_VERSION,
  createdAt: Date.now(),
  lastTick: Date.now(),
  res: { metal: 500, energy: 500, food: 500, crystals: 150 },
  buildings: { hq: 1, mine: 1, reactor: 1, farm: 1, storage: 1, barracks: 1 },
  build: null,          // { id, startAt, endAt }
  units: { trooper: 10, drone: 0, crawler: 0 },
  training: null,       // { unit, remaining, total, each, nextAt }
  heroes: { orin: { level: 1, xp: 0 } },
  squad: ['orin'],
  missions: { cleared: 0 },
  stats: { battlesWon: 0, battlesLost: 0 },
});
