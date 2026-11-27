// =====================================================================
// Боевая система: автобой армии игрока против защитников сектора.
// =====================================================================

const MAX_ROUNDS = 20;

function missionBlockReason(i) {
  if (i > S.missions.cleared + 1) return 'Сектор ещё не открыт';
  if (S.march) return 'Отряд уже в походе';
  if (armySize() === 0) return 'Нет войск';
  if (S.res.food < missionDef(i).foodCost) return 'Не хватает провизии';
  return null;
}

// ---------- Поход ----------
// Отряд идёт к сектору, на месте происходит бой, затем отряд возвращается.
function launchMarch(i) {
  if (missionBlockReason(i)) return false;
  S.res.food -= missionDef(i).foodCost;
  const t = now(), travel = marchTime(i) * 1000;
  S.march = { target: i, departAt: t, arriveAt: t + travel, returnAt: t + travel * 2, phase: 'out', result: null };
  return true;
}

function recallMarch() {
  // отозвать отряд до боя: он разворачивается и идёт назад тем же путём
  const m = S.march;
  if (!m || m.phase !== 'out') return false;
  const t = now();
  const passed = t - m.departAt;
  m.phase = 'back';
  m.recalled = true;
  m.arriveAt = t - passed;       // точка разворота — текущая позиция
  m.turnAt = t;
  m.returnAt = t + passed;
  return true;
}

// Положение отряда на карте (доля пути от базы до цели, 0..1)
function marchProgress(t = now()) {
  const m = S.march;
  if (!m) return 0;
  if (m.phase === 'out') {
    return Math.min(1, (t - m.departAt) / (m.arriveAt - m.departAt));
  }
  if (m.recalled) {
    const peak = (m.turnAt - m.departAt) / (marchTime(m.target) * 1000);
    return Math.max(0, peak * (1 - (t - m.turnAt) / (m.returnAt - m.turnAt)));
  }
  return Math.max(0, 1 - (t - m.arriveAt) / (m.returnAt - m.arriveAt));
}

function tickMarch(t, events) {
  const m = S.march;
  if (!m) return;
  if (m.phase === 'out' && t >= m.arriveAt) {
    m.result = resolveBattle(m.target);
    m.phase = 'back';
    events.push({ type: 'battle', result: m.result });
  }
  if (m.phase === 'back' && t >= m.returnAt) {
    events.push({ type: 'returned', recalled: !!m.recalled, win: m.result && m.result.win });
    S.march = null;
  }
}

function resolveBattle(i) {
  const m = missionDef(i);

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
