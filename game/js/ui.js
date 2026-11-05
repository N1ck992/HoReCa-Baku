// =====================================================================
// Интерфейс: отрисовка вкладок, модальные окна, уведомления.
// =====================================================================

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let currentTab = 'base';
const trainCounts = { trooper: 5, drone: 5, crawler: 1 };

// ---------- Форматирование ----------
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace('.0', '') + 'k';
  return String(n);
}

function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}ч ${m}м`;
  if (m) return `${m}м ${String(s).padStart(2, '0')}с`;
  return `${s}с`;
}

function pct(v) {
  return Math.round(v * 100) + '%';
}

function costHtml(cost) {
  return `<div class="cost">${Object.entries(cost)
    .map(([k, v]) => `<span class="cost-item" data-cost-res="${k}" data-cost-val="${v}">${RESOURCES[k].icon} ${fmt(v)}</span>`)
    .join('')}</div>`;
}

// ---------- Верхняя панель ресурсов ----------
function renderResBar() {
  $('#resbar').innerHTML = ['metal', 'energy', 'food', 'crystals']
    .map((r) => `
      <div class="res" title="${RESOURCES[r].name}">
        <span class="res-icon">${RESOURCES[r].icon}</span>
        <div class="res-text">
          <b data-res="${r}">0</b>
          ${r !== 'crystals' ? `<small data-rate="${r}"></small>` : '<small>премиум</small>'}
        </div>
        ${r !== 'crystals' ? `<div class="res-fill"><i data-fill="${r}"></i></div>` : ''}
      </div>`)
    .join('');
}

// ---------- Вкладка: База ----------
function buildingCard(id) {
  const b = BUILDINGS[id];
  const L = S.buildings[id];
  const isMax = L >= b.maxLevel;
  const building = S.build && S.build.id === id;
  let effect = '';
  if (b.produces) {
    effect = `${RESOURCES[b.produces].icon} ${fmt(prodRate(b.produces) * 60)}/мин`;
  } else if (id === 'storage') {
    effect = `Лимит: ${fmt(storageCap())}`;
  } else if (id === 'barracks') {
    effect = `Армия до ${unitCap()}`;
  } else if (id === 'hq') {
    effect = `Слоты героев: ${squadSlots()}`;
  }
  return `
    <div class="card building ${building ? 'is-busy' : ''}">
      <div class="card-head">
        <div class="b-icon">${b.icon}</div>
        <div class="grow">
          <div class="card-title">${b.name}</div>
          <div class="muted">Уровень ${L}${isMax ? ' (макс.)' : ''} · ${effect}</div>
        </div>
      </div>
      <p class="desc">${b.desc}</p>
      ${building ? `
        <div class="progress"><i data-progress="build"></i></div>
        <div class="row between">
          <span class="muted">До ур. ${L + 1}: <b data-timer="build"></b></span>
          <button class="btn small accent" data-action="speedup-build" data-check="speedup-build">
            Ускорить 💎 <span data-speedcost="build"></span>
          </button>
        </div>` : isMax ? '' : `
        <div class="row between wrap">
          ${costHtml(upgradeCost(id))}
          <span class="muted">⏱ ${fmtTime(upgradeTime(id))}</span>
        </div>
        <button class="btn full" data-action="upgrade" data-id="${id}" data-check="upgrade:${id}">
          Улучшить до ур. ${L + 1}
        </button>
        <div class="reason" data-reason="upgrade:${id}"></div>`}
    </div>`;
}

function renderBase() {
  const sel = BaseScene.getSelected();
  const chips = Object.entries(BUILDINGS).map(([id, b]) => `
    <button class="chip ${id === sel ? 'active' : ''} ${S.build && S.build.id === id ? 'busy' : ''}"
      data-action="select-building" data-id="${id}" title="${b.name}">
      <span>${b.icon}</span>${S.buildings[id]}
    </button>`).join('');
  return `
    <section class="panel">
      <h2>Колония «Рубеж-7»</h2>
      <div class="scene-wrap">
        <canvas id="base-canvas" class="scene base-scene" aria-label="Вид базы"></canvas>
        <div class="scene-hint">Нажмите на постройку</div>
        ${S.march ? '<div class="scene-badge">🚩 Отряд в походе</div>' : ''}
      </div>
      <div class="chips">${chips}</div>
      <div id="base-panel">${buildingCard(sel)}</div>
    </section>`;
}

// ---------- Вкладка: Армия ----------
function renderArmy() {
  const st = armyStats();
  const tr = S.training;
  const units = Object.entries(UNITS).map(([id, u]) => {
    const locked = S.buildings.barracks < u.req;
    const c = trainCounts[id];
    return `
      <div class="card unit ${locked ? 'is-locked' : ''}">
        <div class="card-head">
          <div class="b-icon">${u.icon}</div>
          <div class="grow">
            <div class="card-title">${u.name} <span class="badge">×${S.units[id]}</span></div>
            <div class="muted">⚔ ${u.atk} · ❤ ${u.hp} · ⏱ ${trainTime(id).toFixed(1)}с</div>
          </div>
        </div>
        <p class="desc">${u.desc}</p>
        ${locked ? `<div class="reason show">🔒 Нужны Казармы ур. ${u.req}</div>` : `
          <div class="row between wrap">
            <span class="muted">За 1:</span>${costHtml(u.cost)}
          </div>
          <div class="stepper">
            <button class="btn small ghost" data-action="count" data-id="${id}" data-delta="-5">−5</button>
            <button class="btn small ghost" data-action="count" data-id="${id}" data-delta="-1">−1</button>
            <b class="count" data-count="${id}">${c}</b>
            <button class="btn small ghost" data-action="count" data-id="${id}" data-delta="1">+1</button>
            <button class="btn small ghost" data-action="count" data-id="${id}" data-delta="5">+5</button>
            <button class="btn small ghost" data-action="count-max" data-id="${id}">Макс</button>
          </div>
          <button class="btn full" data-action="train" data-id="${id}" data-check="train:${id}">
            Обучить ${c} шт.
          </button>
          <div class="reason" data-reason="train:${id}"></div>`}
      </div>`;
  });

  return `
    <section class="panel">
      <h2>Армия</h2>
      <div class="card summary">
        <div class="stat"><span>Численность</span><b>${armySize()} / ${unitCap()}</b></div>
        <div class="stat"><span>Атака</span><b>⚔ ${fmt(st.atk)}</b></div>
        <div class="stat"><span>Прочность</span><b>❤ ${fmt(st.hp)}</b></div>
      </div>
      ${tr ? `
        <div class="card training">
          <div class="row between">
            <b>${UNITS[tr.unit].icon} Обучение: ${UNITS[tr.unit].name}</b>
            <span class="muted"><span data-train-left></span> из ${tr.total}</span>
          </div>
          <div class="progress"><i data-progress="train"></i></div>
          <div class="row between">
            <span class="muted">Осталось: <b data-timer="train"></b></span>
            <button class="btn small accent" data-action="speedup-train" data-check="speedup-train">
              Завершить 💎 <span data-speedcost="train"></span>
            </button>
          </div>
        </div>` : ''}
      <div class="grid">${units.join('')}</div>
    </section>`;
}

// ---------- Вкладка: Герои ----------
function renderHeroes() {
  const b = squadBonus();
  const owned = Object.keys(HEROES).filter((id) => S.heroes[id]);
  const unknown = Object.keys(HEROES).filter((id) => !S.heroes[id]);

  const heroCard = (id) => {
    const h = HEROES[id], st = S.heroes[id], hb = heroBonus(id);
    const inSquad = S.squad.includes(id);
    const maxed = st.level >= HERO_MAX_LEVEL;
    return `
      <div class="card hero ${inSquad ? 'in-squad' : ''}" style="--rar:${RARITY[h.rarity].color}">
        <div class="card-head">
          <div class="h-portrait">${h.icon}</div>
          <div class="grow">
            <div class="card-title">${h.name}</div>
            <div class="muted"><span class="rar">${RARITY[h.rarity].name}</span> · ${h.role}</div>
          </div>
          <div class="lvl">ур. ${st.level}</div>
        </div>
        <div class="progress thin"><i style="width:${maxed ? 100 : (st.xp / xpNeed(st.level)) * 100}%"></i></div>
        <div class="row between">
          <span class="muted">${maxed ? 'Макс. уровень' : `Опыт ${st.xp} / ${xpNeed(st.level)}`}</span>
          <span>⚔ +${pct(hb.atk)} · ❤ +${pct(hb.hp)}</span>
        </div>
        <button class="btn full ${inSquad ? 'ghost' : ''}" data-action="squad" data-id="${id}">
          ${inSquad ? 'Убрать из отряда' : 'В отряд'}
        </button>
      </div>`;
  };

  return `
    <section class="panel">
      <h2>Герои</h2>
      <div class="card summary">
        <div class="stat"><span>Отряд</span><b>${S.squad.length} / ${squadSlots()}</b></div>
        <div class="stat"><span>Бонус атаки</span><b>⚔ +${pct(b.atk)}</b></div>
        <div class="stat"><span>Бонус прочности</span><b>❤ +${pct(b.hp)}</b></div>
      </div>
      <div class="card recruit">
        <div class="grow">
          <div class="card-title">📡 Сигнал вербовки</div>
          <div class="muted">Случайный герой. Повтор превращается в опыт.
            Шансы: ${Object.values(RARITY).map((r) => `<span style="color:${r.color}">${r.weight}%</span>`).join(' / ')}</div>
        </div>
        <button class="btn accent" data-action="recruit" data-check="recruit">💎 ${RECRUIT_COST}</button>
      </div>
      <p class="muted">Слоты отряда открываются на 3 и 6 уровне Командного центра.</p>
      <div class="grid">${owned.map(heroCard).join('')}</div>
      ${unknown.length ? `
        <h3>Не найдены</h3>
        <div class="grid">${unknown.map((id) => `
          <div class="card hero locked" style="--rar:${RARITY[HEROES[id].rarity].color}">
            <div class="card-head">
              <div class="h-portrait">❔</div>
              <div class="grow"><div class="card-title">???</div>
              <div class="muted"><span class="rar">${RARITY[HEROES[id].rarity].name}</span></div></div>
            </div>
          </div>`).join('')}</div>` : ''}
    </section>`;
}

// ---------- Вкладка: Карта ----------
function winChance(m) {
  const a = armyStats();
  if (a.atk === 0) return { label: 'Нет войск', cls: 'bad' };
  const roundsToWin = m.hp / a.atk;
  const roundsToLose = a.hp / m.atk;
  const ratio = roundsToLose / roundsToWin;
  if (ratio > 2) return { label: 'Высокий', cls: 'good' };
  if (ratio > 1.1) return { label: 'Средний', cls: 'mid' };
  return { label: 'Низкий', cls: 'bad' };
}

function missionCard(i) {
  const m = missionDef(i);
  const cleared = i <= S.missions.cleared;
  const ch = winChance(m);
  const marchingHere = S.march && S.march.target === i;
  return `
    <div class="card mission ${cleared ? 'cleared' : 'current'} ${m.boss ? 'boss' : ''}">
      <div class="card-head">
        <div class="b-icon">${m.boss ? '💀' : cleared ? '✅' : '🎯'}</div>
        <div class="grow">
          <div class="card-title">${m.name}${m.boss ? ' · Босс' : ''}</div>
          <div class="muted">${m.enemy} · ⚔ ${fmt(m.atk)} · ❤ ${fmt(m.hp)}</div>
        </div>
        <span class="chance ${ch.cls}">${ch.label}</span>
      </div>
      <div class="row between wrap">
        <span class="muted">Награда${cleared ? ' (повтор, ×0.5)' : ''}:</span>
        ${costHtml(cleared ? scaleCost(m.reward, 0.5) : m.reward).replace(/data-cost-res="\w+"/g, '')}
        ${cleared ? '' : `<span class="cost-item">💎 ${m.crystals}</span>`}
      </div>
      <div class="row between wrap">
        <span class="cost">
          <span class="cost-item" data-cost-res="food" data-cost-val="${m.foodCost}">🌾 ${m.foodCost}</span>
          <span class="cost-item">🕒 ${fmtTime(marchTime(i))} в пути</span>
        </span>
        ${marchingHere ? '' : `
        <button class="btn ${cleared ? 'ghost' : 'accent'}" data-action="mission" data-id="${i}" data-check="mission:${i}">
          ${cleared ? 'Отправить снова' : 'Отправить отряд'}
        </button>`}
      </div>
      <div class="reason" data-reason="mission:${i}"></div>
    </div>`;
}

function marchCard() {
  const m = S.march;
  if (!m) return '';
  const def = missionDef(m.target);
  const back = m.phase === 'back';
  let status;
  if (!back) status = `Идёт к сектору ${m.target}: ${def.enemy}`;
  else if (m.recalled) status = 'Отозван, возвращается на базу';
  else status = m.result && m.result.win ? '🏆 Победа! Возвращается с трофеями' : '☠ Отступает после поражения';
  return `
    <div class="card march ${back ? 'back' : ''}">
      <b>🚩 ${status}</b>
      <div class="progress"><i data-progress="march"></i></div>
      <div class="row between wrap">
        <span class="muted">${back ? 'До базы' : 'До цели'}: <b data-timer="march"></b></span>
        <span class="row">
          <button class="btn small ghost" data-action="map-follow">Показать</button>
          ${back ? (m.result ? '<button class="btn small ghost" data-action="battle-report">Отчёт о бою</button>' : '')
                 : '<button class="btn small ghost" data-action="recall">Отозвать</button>'}
        </span>
      </div>
    </div>`;
}

function renderMap() {
  const sel = Math.min(MapScene.getSelected(), S.missions.cleared + 1, MISSION_COUNT);
  MapScene.select(sel);
  const done = S.missions.cleared >= MISSION_COUNT;
  return `
    <section class="panel">
      <h2>Карта секторов</h2>
      <div class="card summary">
        <div class="stat"><span>Пройдено</span><b>${S.missions.cleared} / ${MISSION_COUNT}</b></div>
        <div class="stat"><span>Победы</span><b>${S.stats.battlesWon}</b></div>
        <div class="stat"><span>Сила армии</span><b>⚔ ${fmt(armyStats().atk)}</b></div>
      </div>
      <div class="scene-wrap">
        <canvas id="map-canvas" class="scene map-scene" aria-label="Карта мира"></canvas>
        <div class="map-tools">
          <button class="icon-btn" data-action="map-zoom" data-delta="in" aria-label="Приблизить">＋</button>
          <button class="icon-btn" data-action="map-zoom" data-delta="out" aria-label="Отдалить">－</button>
          <button class="icon-btn" data-action="map-home" aria-label="К базе">⌂</button>
        </div>
        <div class="scene-hint">Двигайте карту, нажмите на сектор</div>
      </div>
      ${done ? '<div class="card"><b>🏆 Все сектора зачищены!</b> Новые территории появятся в следующих обновлениях.</div>' : ''}
      <div id="march-panel">${marchCard()}</div>
      <div id="map-panel">${missionCard(sel)}</div>
    </section>`;
}

// ---------- Общая отрисовка ----------
const VIEWS = { base: renderBase, army: renderArmy, heroes: renderHeroes, map: renderMap };

function render() {
  $('#view').innerHTML = VIEWS[currentTab]();
  const bc = $('#base-canvas');
  if (bc) BaseScene.mount(bc, (id) => { $('#base-panel').innerHTML = buildingCard(id); markChips(id); refresh(); });
  const mc = $('#map-canvas');
  if (mc) MapScene.mount(mc, (i) => { $('#map-panel').innerHTML = missionCard(i); refresh(); });
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
  refresh();
}

function markChips(id) {
  $$('.chip').forEach((c) => c.classList.toggle('active', c.dataset.id === id));
}

function setTab(tab) {
  currentTab = tab;
  render();
  window.scrollTo(0, 0);
}

// Лёгкое обновление без перерисовки: числа, таймеры, доступность кнопок.
function refresh() {
  const cap = storageCap();
  for (const r of Object.keys(RESOURCES)) {
    const el = $(`[data-res="${r}"]`);
    if (el) el.textContent = fmt(S.res[r]);
    const rate = $(`[data-rate="${r}"]`);
    if (rate) rate.textContent = S.res[r] >= cap ? 'склад полон' : `+${fmt(prodRate(r) * 60)}/мин`;
    const fill = $(`[data-fill="${r}"]`);
    if (fill) {
      fill.style.width = Math.min(100, (S.res[r] / cap) * 100) + '%';
      fill.classList.toggle('full', S.res[r] >= cap);
    }
  }

  const t = now();
  if (S.build) {
    const p = (t - S.build.startAt) / (S.build.endAt - S.build.startAt);
    $$('[data-progress="build"]').forEach((e) => (e.style.width = Math.min(100, p * 100) + '%'));
    $$('[data-timer="build"]').forEach((e) => (e.textContent = fmtTime((S.build.endAt - t) / 1000)));
    $$('[data-speedcost="build"]').forEach((e) => (e.textContent = speedupCost(S.build.endAt)));
  }
  if (S.training) {
    const tr = S.training;
    const endAt = tr.nextAt + (tr.remaining - 1) * tr.each * 1000;
    const startAt = endAt - tr.total * tr.each * 1000;
    $$('[data-progress="train"]').forEach((e) => (e.style.width = Math.min(100, ((t - startAt) / (endAt - startAt)) * 100) + '%'));
    $$('[data-timer="train"]').forEach((e) => (e.textContent = fmtTime((endAt - t) / 1000)));
    $$('[data-speedcost="train"]').forEach((e) => (e.textContent = speedupCost(endAt)));
    $$('[data-train-left]').forEach((e) => (e.textContent = tr.total - tr.remaining));
  }

  if (S.march) {
    const m = S.march;
    const k = marchProgress(t);
    const back = m.phase === 'back';
    $$('[data-progress="march"]').forEach((e) => (e.style.width = (back ? 100 - k * 100 : k * 100) + '%'));
    $$('[data-timer="march"]').forEach((e) => (e.textContent = fmtTime(((back ? m.returnAt : m.arriveAt) - t) / 1000)));
  }

  $$('[data-cost-res]').forEach((e) => {
    e.classList.toggle('lack', S.res[e.dataset.costRes] < Number(e.dataset.costVal));
  });

  $$('[data-check]').forEach((btn) => {
    const reason = checkReason(btn.dataset.check);
    btn.disabled = !!reason;
    const rEl = $(`[data-reason="${btn.dataset.check}"]`);
    if (rEl) {
      const show = reason && reason !== 'Не хватает ресурсов' && reason !== 'Не хватает провизии';
      rEl.textContent = show ? reason : '';
      rEl.classList.toggle('show', !!show);
    }
  });
}

function checkReason(key) {
  const [kind, arg] = key.split(':');
  switch (kind) {
    case 'upgrade': return upgradeBlockReason(arg);
    case 'train': return trainBlockReason(arg, trainCounts[arg]);
    case 'mission': return missionBlockReason(Number(arg));
    case 'recruit': return S.res.crystals < RECRUIT_COST ? 'Мало кристаллов' : null;
    case 'speedup-build': return S.build && S.res.crystals >= speedupCost(S.build.endAt) ? null : 'Мало кристаллов';
    case 'speedup-train': {
      if (!S.training) return 'Нет';
      const tr = S.training;
      return S.res.crystals >= speedupCost(tr.nextAt + (tr.remaining - 1) * tr.each * 1000) ? null : 'Мало кристаллов';
    }
  }
  return null;
}

// ---------- Уведомления ----------
function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('hide'), 2600);
  setTimeout(() => el.remove(), 3100);
}

// ---------- Модальные окна ----------
function openModal(html) {
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
}

function closeModal() {
  $('#modal').hidden = true;
  $('#modal-body').innerHTML = '';
  if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
  render();
}

let battleTimer = null;

function showBattle(res) {
  const m = res.mission;
  openModal(`
    <h2>${m.name}: ${m.enemy}</h2>
    <div class="battle">
      <div class="side">
        <div class="side-name">🛡 Ваша армия</div>
        <div class="hpbar"><i id="b-php" style="width:100%"></i></div>
        <small id="b-php-t">${fmt(res.army.hp)}</small>
      </div>
      <div class="vs">VS</div>
      <div class="side">
        <div class="side-name">${m.boss ? '💀' : '👾'} ${m.enemy}</div>
        <div class="hpbar enemy"><i id="b-ehp" style="width:100%"></i></div>
        <small id="b-ehp-t">${fmt(m.hp)}</small>
      </div>
    </div>
    <div class="battle-log" id="b-log"></div>
    <div id="b-result"></div>
    <div class="row end">
      <button class="btn ghost" data-action="skip-battle" id="b-skip">Пропустить</button>
    </div>`);

  let idx = 0;
  const step = () => {
    if (idx >= res.rounds.length) return finishBattle(res);
    const r = res.rounds[idx++];
    $('#b-php').style.width = (r.pHp / res.army.hp) * 100 + '%';
    $('#b-ehp').style.width = (r.eHp / m.hp) * 100 + '%';
    $('#b-php-t').textContent = fmt(r.pHp);
    $('#b-ehp-t').textContent = fmt(r.eHp);
    const line = document.createElement('div');
    line.innerHTML = `<b>Раунд ${r.r}:</b> вы нанесли <span class="good">${fmt(r.pDmg)}</span>, получили <span class="bad">${fmt(r.eDmg)}</span>`;
    $('#b-log').prepend(line);
  };
  battleTimer = setInterval(step, 450);
  step();
  showBattle.skip = () => {
    while (idx < res.rounds.length) step();
    finishBattle(res);
  };
}

function finishBattle(res) {
  if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
  if ($('#b-result').innerHTML) return;
  const lossText = Object.entries(res.losses).map(([id, n]) => `${UNITS[id].icon} ${n}`).join(' ') || 'нет';
  let html = `<div class="result ${res.win ? 'win' : 'lose'}">
    <h3>${res.win ? '🏆 Победа!' : '☠ Поражение'}</h3>
    <div>Потери: ${lossText}</div>`;
  if (res.win) {
    html += `<div>Награда: ${Object.entries(res.reward).map(([k, v]) => `${RESOURCES[k].icon} ${fmt(v)}`).join(' ')}
      ${res.crystals ? ` 💎 ${res.crystals}` : ''}</div>
      <div>Опыт героям: +${res.heroXp}${res.levelUps.length ? ' · Новый уровень: ' + res.levelUps.map((id) => HEROES[id].name).join(', ') : ''}</div>`;
  } else {
    html += '<div class="muted">Усильте армию, улучшите казармы или прокачайте героев.</div>';
  }
  html += '</div>';
  $('#b-result').innerHTML = html;
  const skip = $('#b-skip');
  skip.textContent = 'Закрыть';
  skip.dataset.action = 'close-modal';
  skip.classList.remove('ghost');
}

function showRecruit(res) {
  const h = HEROES[res.id];
  openModal(`
    <div class="recruit-result" style="--rar:${RARITY[h.rarity].color}">
      <div class="big-portrait">${h.icon}</div>
      <div class="rar">${RARITY[h.rarity].name}</div>
      <h2>${h.name}</h2>
      <div class="muted">${h.role} · ⚔ +${pct(h.atk)} · ❤ +${pct(h.hp)}</div>
      <p>${res.dup ? `Уже в команде — получено <b>${res.xp} опыта</b>.` : 'Новый герой присоединился к колонии!'}</p>
      <button class="btn full" data-action="close-modal">Отлично</button>
    </div>`);
}

function showSettings() {
  const days = Math.floor((now() - S.createdAt) / 86400000);
  openModal(`
    <h2>⚙ Настройки</h2>
    <div class="card summary">
      <div class="stat"><span>В игре</span><b>${days} дн.</b></div>
      <div class="stat"><span>Победы</span><b>${S.stats.battlesWon}</b></div>
      <div class="stat"><span>Героев</span><b>${Object.keys(S.heroes).length}/${Object.keys(HEROES).length}</b></div>
    </div>
    <p class="muted">Прогресс сохраняется автоматически на этом устройстве.
      Аккаунты и облачные сохранения появятся в следующих версиях.</p>
    <div class="row between">
      <button class="btn danger" data-action="reset">Сбросить прогресс</button>
      <button class="btn" data-action="close-modal">Закрыть</button>
    </div>`);
}
