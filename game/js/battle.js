// =====================================================================
// Боевая система: автобой армии игрока против защитников сектора.
// =====================================================================

const MAX_ROUNDS = 20;

function missionBlockReason(i) {
  if (i > S.missions.cleared + 1) return 'Сектор ещё не открыт';
  if (armySize() === 0) return 'Нет войск';
  if (S.res.food < missionDef(i).foodCost) return 'Не хватает провизии';
  return null;
}

function runMission(i) {
  if (missionBlockReason(i)) return null;
  const m = missionDef(i);
  S.res.food -= m.foodCost;

  const army = armyStats();
  let pHp = army.hp, eHp = m.hp;
  const rounds = [];
  const rnd = () => 0.85 + Math.random() * 0.3;

  for (let r = 1; r <= MAX_ROUNDS && pHp > 0 && eHp > 0; r++) {
    // сила падает вместе с потерями, но не ниже 30%
    const pDmg = Math.round(army.atk * Math.max(0.3, pHp / army.hp) * rnd());
    const eDmg = Math.round(m.atk * Math.max(0.3, eHp / m.hp) * rnd());
    eHp = Math.max(0, eHp - pDmg);
    pHp = Math.max(0, pHp - eDmg);
    rounds.push({ r, pDmg, eDmg, pHp, eHp });
  }

  const win = eHp <= 0 && pHp > 0;
  // потери: часть раненых возвращается в строй
  const lostShare = (1 - pHp / army.hp) * (win ? 0.5 : 0.8);
  const losses = {};
  for (const [id, n] of Object.entries(S.units)) {
    const lost = Math.min(n, Math.round(n * lostShare));
    if (lost > 0) {
      losses[id] = lost;
      S.units[id] -= lost;
    }
  }

  const result = { mission: m, win, rounds, army, losses, reward: null, crystals: 0, levelUps: [] };

  if (win) {
    const first = i > S.missions.cleared;
    // повторное прохождение даёт половину ресурсов и без кристаллов
    const reward = first ? m.reward : scaleCost(m.reward, 0.5);
    gain(reward);
    result.reward = reward;
    if (first) {
      S.res.crystals += m.crystals;
      result.crystals = m.crystals;
      S.missions.cleared = i;
    }
    const xp = first ? m.heroXp : Math.round(m.heroXp / 2);
    result.heroXp = xp;
    for (const id of S.squad) {
      if (addHeroXp(id, xp)) result.levelUps.push(id);
    }
    S.stats.battlesWon++;
  } else {
    S.stats.battlesLost++;
  }
  return result;
}
