// =====================================================================
// Игровая логика: экономика, строительство, армия, герои.
// =====================================================================

let S = null; // текущее состояние игры

const now = () => Date.now();
const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);

// ---------- Ресурсы ----------
function storageCap() {
  return Math.round(1000 * Math.pow(1.7, S.buildings.storage - 1));
}

function prodRate(res) {
  // единиц в секунду
  const id = Object.keys(BUILDINGS).find((b) => BUILDINGS[b].produces === res);
  if (!id) return 0;
  const L = S.buildings[id];
  return L * 0.5 * Math.pow(1.18, L - 1);
}

function canAfford(cost) {
  return Object.entries(cost).every(([k, v]) => S.res[k] >= v);
}

function pay(cost) {
  for (const [k, v] of Object.entries(cost)) S.res[k] -= v;
}

function gain(rew) {
  const cap = storageCap();
  for (const [k, v] of Object.entries(rew)) {
    S.res[k] = k === 'crystals' ? S.res[k] + v : Math.min(cap, S.res[k] + v);
  }
}

function scaleCost(cost, mult) {
  const out = {};
  for (const [k, v] of Object.entries(cost)) out[k] = Math.round(v * mult);
  return out;
}

// ---------- Постройки ----------
function upgradeCost(id) {
  const m = Math.pow(COST_GROWTH, S.buildings[id] - 1);
  const out = {};
  for (const [k, v] of Object.entries(BUILDINGS[id].cost)) out[k] = round5(v * m);
  return out;
}

function upgradeTime(id) {
  return Math.round(BUILDINGS[id].time * Math.pow(TIME_GROWTH, S.buildings[id] - 1));
}

function upgradeBlockReason(id) {
  const L = S.buildings[id];
  if (L >= BUILDINGS[id].maxLevel) return 'Максимальный уровень';
  if (S.build) return S.build.id === id ? 'Идёт улучшение' : 'Строители заняты';
  // остальные постройки могут быть максимум на 1 уровень выше Командного центра
  if (id !== 'hq' && L > S.buildings.hq) return `Нужен Командный центр ур. ${L}`;
  if (!canAfford(upgradeCost(id))) return 'Не хватает ресурсов';
  return null;
}

function startUpgrade(id) {
  if (upgradeBlockReason(id)) return false;
  pay(upgradeCost(id));
  const t = now();
  S.build = { id, startAt: t, endAt: t + upgradeTime(id) * 1000 };
  return true;
}

function speedupCost(endAt) {
  return Math.max(1, Math.ceil((endAt - now()) / 1000 / 10));
}

function speedupBuild() {
  if (!S.build) return false;
  const c = speedupCost(S.build.endAt);
  if (S.res.crystals < c) return false;
  S.res.crystals -= c;
  S.build.endAt = now();
  return true;
}

// ---------- Армия ----------
function unitCap() {
  return 20 + 15 * S.buildings.barracks;
}

function armySize() {
  return Object.values(S.units).reduce((a, b) => a + b, 0);
}

function queuedUnits() {
  return S.training ? S.training.remaining : 0;
}

function trainTime(unitId) {
  // казармы ускоряют обучение на 5% за уровень
  return UNITS[unitId].time * Math.max(0.4, 1 - 0.05 * (S.buildings.barracks - 1));
}

function maxTrainable(unitId) {
  const free = unitCap() - armySize() - queuedUnits();
  let n = Math.max(0, free);
  for (const [k, v] of Object.entries(UNITS[unitId].cost)) n = Math.min(n, Math.floor(S.res[k] / v));
  return n;
}

function trainBlockReason(unitId, count) {
  const u = UNITS[unitId];
  if (S.buildings.barracks < u.req) return `Нужны Казармы ур. ${u.req}`;
  if (S.training) return 'Казармы заняты';
  if (count <= 0) return 'Укажите количество';
  if (armySize() + count > unitCap()) return 'Не хватает места в армии';
  if (!canAfford(scaleCost(u.cost, count))) return 'Не хватает ресурсов';
  return null;
}

function startTraining(unitId, count) {
  if (trainBlockReason(unitId, count)) return false;
  pay(scaleCost(UNITS[unitId].cost, count));
  const each = trainTime(unitId);
  S.training = { unit: unitId, remaining: count, total: count, each, nextAt: now() + each * 1000 };
  return true;
}

function speedupTraining() {
  if (!S.training) return false;
  const t = S.training;
  const endAt = t.nextAt + (t.remaining - 1) * t.each * 1000;
  const c = speedupCost(endAt);
  if (S.res.crystals < c) return false;
  S.res.crystals -= c;
  S.units[t.unit] += t.remaining;
  S.training = null;
  return true;
}

function armyStats() {
  let atk = 0, hp = 0;
  for (const [id, n] of Object.entries(S.units)) {
    atk += UNITS[id].atk * n;
    hp += UNITS[id].hp * n;
  }
  const b = squadBonus();
  return { atk: Math.round(atk * (1 + b.atk)), hp: Math.round(hp * (1 + b.hp)) };
}

// ---------- Герои ----------
function heroBonus(id) {
  const def = HEROES[id];
  const lvl = S.heroes[id].level;
  const m = 1 + HERO_LEVEL_BONUS * (lvl - 1);
  return { atk: def.atk * m, hp: def.hp * m };
}

function squadBonus() {
  const out = { atk: 0, hp: 0 };
  for (const id of S.squad) {
    const b = heroBonus(id);
    out.atk += b.atk;
    out.hp += b.hp;
  }
  return out;
}

function squadSlots() {
  return Math.min(3, 1 + Math.floor(S.buildings.hq / 3));
}

function xpNeed(level) {
  return 100 * level;
}

function addHeroXp(id, xp) {
  const h = S.heroes[id];
  let ups = 0;
  h.xp += xp;
  while (h.level < HERO_MAX_LEVEL && h.xp >= xpNeed(h.level)) {
    h.xp -= xpNeed(h.level);
    h.level++;
    ups++;
  }
  if (h.level >= HERO_MAX_LEVEL) h.xp = 0;
  return ups;
}

function toggleSquad(id) {
  const i = S.squad.indexOf(id);
  if (i >= 0) {
    S.squad.splice(i, 1);
    return true;
  }
  if (S.squad.length >= squadSlots()) return false;
  S.squad.push(id);
  return true;
}

function recruit() {
  if (S.res.crystals < RECRUIT_COST) return null;
  S.res.crystals -= RECRUIT_COST;
  const total = Object.values(RARITY).reduce((a, r) => a + r.weight, 0);
  let roll = Math.random() * total;
  let rarity = 'common';
  for (const [k, r] of Object.entries(RARITY)) {
    if ((roll -= r.weight) < 0) { rarity = k; break; }
  }
  const pool = Object.keys(HEROES).filter((h) => HEROES[h].rarity === rarity);
  const id = pool[Math.floor(Math.random() * pool.length)];
  if (S.heroes[id]) {
    const xp = RARITY[rarity].dupXp;
    addHeroXp(id, xp);
    return { id, dup: true, xp };
  }
  S.heroes[id] = { level: 1, xp: 0 };
  if (S.squad.length < squadSlots()) S.squad.push(id);
  return { id, dup: false };
}

// ---------- Игровой цикл ----------
// Возвращает список событий, чтобы интерфейс мог показать уведомления.
function tick() {
  const t = now();
  const dt = Math.max(0, (t - S.lastTick) / 1000);
  S.lastTick = t;
  const events = [];

  const cap = storageCap();
  for (const r of ['metal', 'energy', 'food']) {
    if (S.res[r] < cap) S.res[r] = Math.min(cap, S.res[r] + prodRate(r) * dt);
  }

  if (S.build && t >= S.build.endAt) {
    const id = S.build.id;
    S.buildings[id]++;
    S.build = null;
    events.push({ type: 'built', id, level: S.buildings[id] });
  }

  if (S.training) {
    const tr = S.training;
    let done = 0;
    while (tr.remaining > 0 && t >= tr.nextAt) {
      S.units[tr.unit]++;
      tr.remaining--;
      tr.nextAt += tr.each * 1000;
      done++;
    }
    if (tr.remaining <= 0) {
      events.push({ type: 'trained', unit: tr.unit, count: tr.total });
      S.training = null;
    } else if (done) {
      events.push({ type: 'unit' });
    }
  }

  tickMarch(t, events);
  return events;
}
