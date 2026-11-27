// =====================================================================
// ОТРЯД: КТО В КАКОЙ ТЕХНИКЕ (дополнение №142). Общий для карт (дно, поверхность).
// Ячейка отряда = техника (js/data/vehicles.js) + герой, который в ней ходит.
// Окно «Отряд» (кнопка «◎ Отряд» над ячейками): менять героя и технику можно
// только у тех ячеек, чей герой сейчас в базе. Выбор героя, уже сидящего в другой
// ячейке, — обмен местами (если и та ячейка в базе); так же и с техникой.
// Хранится в localStorage «abyss_roster».
// =====================================================================

AB.IsoRoster = (() => {
  const KEY = 'abyss_roster';
  const MAX = 5;                          // №159: героев в активном отряде одновременно
  const DEFAULT = { 'EQUIP-005': 'CHAR-001', 'EQUIP-018': 'CHAR-003' };   // кто обычно в какой технике
  let slots = null;                       // [{ vehicle, hero }]
  let outFn = () => false;                // карта сообщает: этот герой снаружи (его менять нельзя)
  // №157: открытые заданиями герои и техника (localStorage «abyss_unlock»)
  const UKEY = 'abyss_unlock';
  let unl = null;
  function U() { if (!unl) { try { unl = JSON.parse(localStorage.getItem(UKEY) || 'null'); } catch (e) { unl = null; } if (!unl || !Array.isArray(unl.heroes)) unl = { heroes: [], vehicles: [] }; } return unl; }
  function unlock({ hero, vehicle } = {}) {
    const u = U(); let got = false;
    if (hero && !u.heroes.includes(hero)) { u.heroes.push(hero); got = true; ensureChar(hero); }
    if (vehicle && !u.vehicles.includes(vehicle)) { u.vehicles.push(vehicle); got = true; }
    try { localStorage.setItem(UKEY, JSON.stringify(u)); } catch (e) { /* без хранилища */ }
    if (got) { AB.Bus.emit('roster:changed', {}); AB.Bus.emit('roster:unlock', { hero, vehicle }); }
    return got;
  }
  // у нового героя — своё состояние (здоровье), как у экипажа; в мире корабля он не появляется
  function ensureChar(id) { if (AB.Chars && !AB.Chars.get(id) && AB.Chars.spawn && AB.ID.has(id)) { const c = AB.Chars.spawn(id, { room: null, x: 0 }); if (c) { c.hidden = true; c.controllable = false; } } }
  const baseCrew = () => (AB.IsoActs ? AB.IsoActs.crew() : ['CHAR-001']);
  const crew = () => { const c = [...baseCrew()]; for (const h of U().heroes) if (!c.includes(h)) { ensureChar(h); c.push(h); } return c; };
  // какая техника есть у отряда: экзокостюм «Абисса»; костюм Хейл — когда она в экипаже; №157: новая — за задания и больших мобов
  const owned = () => Object.keys(AB.VEHICLES).filter((v) => (v === 'EQUIP-005' ? true : v === 'EQUIP-018' ? crew().includes('CHAR-003') : U().vehicles.includes(v)));
  const V = (id) => AB.VEHICLES[id] || null;
  // №157: картинка техники — у новой своей ещё нет: значок класса (цвет роли и первая буква)
  const imgCache = {};
  function vimg(id) {
    const v = V(id); if (!v) return '';
    if (v.img) return v.img;
    if (imgCache[id]) return imgCache[id];
    const col = (AB.HERO_ROLES && AB.HERO_ROLES[v.class] || {}).col || '#ccc', ch = (v.short || v.name).replace(/[«»]/g, '')[0];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="6" y="14" width="52" height="34" rx="9" fill="#1c2228" stroke="${col}" stroke-width="3"/><circle cx="18" cy="52" r="6" fill="#333" stroke="${col}" stroke-width="2"/><circle cx="46" cy="52" r="6" fill="#333" stroke="${col}" stroke-width="2"/><text x="32" y="39" font-family="sans-serif" font-size="22" font-weight="700" fill="${col}" text-anchor="middle">${ch}</text></svg>`;
    return (imgCache[id] = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg));
  }
  // №157: портрет — у новых героев рисунка ещё нет: условный бюст по цветам из js/data/heroes.js
  function portrait(cv, id, facing) {
    const h = AB.HEROES && AB.HEROES[id];
    if (!h || !h.look) { if (AB.IsoRender && AB.IsoRender.portrait) AB.IsoRender.portrait(cv, id, facing); return; }
    const r = cv.getBoundingClientRect(), dp = Math.min(2, window.devicePixelRatio || 1), w = Math.round(r.width * dp) || 64, hh = Math.round(r.height * dp) || 64;
    cv.width = w; cv.height = hh; const c = cv.getContext('2d'); c.clearRect(0, 0, w, hh);
    const col = (AB.HERO_ROLES[h.role] || {}).col || '#ccc', u = Math.min(w, hh) / 64;
    c.fillStyle = h.look.body; c.beginPath(); c.ellipse(w / 2, hh + 6 * u, 26 * u, 24 * u, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#d8b090'; c.beginPath(); c.arc(w / 2, hh - 30 * u, 12 * u, 0, 7); c.fill();
    c.fillStyle = h.look.hair; c.beginPath(); c.arc(w / 2, hh - 33 * u, 12.5 * u, Math.PI * 1.05, Math.PI * 1.95); c.fill();
    c.fillStyle = '#1a1a1a'; c.fillRect(w / 2 - 6 * u, hh - 31 * u, 3 * u, 3 * u); c.fillRect(w / 2 + 3 * u, hh - 31 * u, 3 * u, 3 * u);
    c.strokeStyle = col; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(w / 2 - 14 * u, hh - 8 * u); c.lineTo(w / 2 + 14 * u, hh - 8 * u); c.stroke();
  }
  // способность героя работает только в технике своего класса; техники — всегда
  const heroInfo = (id) => (AB.HEROES && AB.HEROES[id]) || null;
  const roleName = (r) => (AB.HERO_ROLES && AB.HERO_ROLES[r] ? AB.HERO_ROLES[r].name : '');
  const abilityLine = (a) => (a ? `<p class="un-ab"><b>${a.name}</b> — ${a.text}</p>` : '');
  function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(s)) slots = s; } catch (e) { /* без хранилища */ } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(slots)); } catch (e) { /* без хранилища */ } }
  function sync() {
    if (!slots) load();
    if (!Array.isArray(slots)) slots = [];
    const vs = owned(), cr = crew();
    slots = slots.filter((s, i) => vs.includes(s.vehicle) && slots.findIndex((q) => q.vehicle === s.vehicle) === i);
    // №159: в активном отряде — не больше MAX ячеек (герой + техника); остальные герои и техника — в наличии
    if (slots.length > MAX) slots = [...slots.filter(locked), ...slots.filter((s) => !locked(s))].slice(0, MAX);
    for (const v of vs) if (slots.length < MAX && !slots.some((s) => s.vehicle === v)) slots.push({ vehicle: v, hero: undefined });
    const used = new Set();
    for (const s of slots) { if (s.hero && (!cr.includes(s.hero) || used.has(s.hero))) s.hero = undefined; if (s.hero) used.add(s.hero); }
    for (const s of slots) if (s.hero === undefined) {
      const pref = DEFAULT[s.vehicle], cls = (V(s.vehicle) || {}).class;
      // №157: новая техника — свободный герой её класса
      const free = (id) => !used.has(id) && !slots.some((q) => q.hero === id);
      const h = pref && cr.includes(pref) && !used.has(pref) ? pref : (!pref && cls && cr.find((id) => free(id) && AB.HEROES && AB.HEROES[id] && AB.HEROES[id].role === cls)) || (!pref && cr.find(free)) || null;
      s.hero = h; if (h) used.add(h);
    }
    return slots;
  }
  const list = () => sync().map((s) => ({ ...s }));
  const vehicleOf = (hero) => { const s = sync().find((q) => q.hero === hero); return s ? s.vehicle : null; };
  const locked = (s) => !!s.hero && outFn(s.hero);
  // поменять героя или технику в ячейке i (с обменом, если это занято в другой ячейке)
  function set(i, { hero, vehicle }) {
    sync(); const s = slots[i]; if (!s || locked(s)) return { ok: false, why: 'Герой снаружи — менять можно только в базе' };
    if (hero !== undefined && hero !== s.hero) {
      const j = hero ? slots.findIndex((q) => q.hero === hero) : -1;
      if (j >= 0 && locked(slots[j])) return { ok: false, why: `${AB.ID.get(hero).name} снаружи — сначала верните в базу` };
      if (j >= 0) slots[j].hero = s.hero;
      s.hero = hero;
    }
    if (vehicle !== undefined && vehicle !== s.vehicle) {
      const j = slots.findIndex((q) => q.vehicle === vehicle);
      if (j >= 0 && locked(slots[j])) return { ok: false, why: 'Эта техника снаружи' };
      if (j >= 0) slots[j].vehicle = s.vehicle;
      s.vehicle = vehicle;
    }
    save(); AB.Bus.emit('roster:changed', {});
    return { ok: true };
  }

  // ---------- окно «Отряд» ----------
  let el = null;
  const dmgLine = (v) => (AB.Damage ? ` · Урон: <b>${AB.Damage.name(v.dtype || 'kinetic')}</b> · Защита: <b>${AB.Damage.armorName(v.armorType)}</b>` : '');   // №152
  const stat = (v) => `Скорость <b>${Math.round(v.speed)}</b> кл/мин · Удар <b>${v.attack}</b> / ${v.rate} с · Броня <b>${Math.round(v.armor * 100)}%</b>${dmgLine(v)}`;
  // №160: окно «Отряд» — витрина: в центре во весь рост герой выбранной ячейки и рядом его техника;
  // переключать ячейки — кнопками в окне или нажатием на ячейку отряда внизу карты (она остаётся видна)
  let cur = 0;
  function fullFigure(cv, id) {
    const r = cv.getBoundingClientRect(), dp = Math.min(2, window.devicePixelRatio || 1), W = Math.round(r.width * dp), H = Math.round(r.height * dp);
    if (!W || !H) return;
    cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.clearRect(0, 0, W, H);
    if (!id) return;
    const h = AB.HEROES && AB.HEROES[id];
    if (h && h.look) {                                  // новый герой без рисунка — условная фигура в полный рост
      const u = H / 130, x = W / 2, col = (AB.HERO_ROLES[h.role] || {}).col || '#ccc';
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, H - 4 * u, 22 * u, 5 * u, 0, 0, 7); c.fill();
      c.fillStyle = '#2a2a30'; c.fillRect(x - 11 * u, H - 58 * u, 9 * u, 54 * u); c.fillRect(x + 2 * u, H - 58 * u, 9 * u, 54 * u);
      c.fillStyle = h.look.body; c.beginPath(); c.roundRect(x - 17 * u, H - 104 * u, 34 * u, 50 * u, 6 * u); c.fill();
      c.fillRect(x - 25 * u, H - 100 * u, 8 * u, 40 * u); c.fillRect(x + 17 * u, H - 100 * u, 8 * u, 40 * u);
      c.fillStyle = col; c.fillRect(x - 17 * u, H - 64 * u, 34 * u, 4 * u);
      c.fillStyle = '#d8b090'; c.beginPath(); c.arc(x, H - 115 * u, 11 * u, 0, 7); c.fill();
      c.fillStyle = h.look.hair; c.beginPath(); c.arc(x, H - 118 * u, 11.5 * u, Math.PI * 1.05, Math.PI * 1.95); c.fill();
      return;
    }
    const m = AB.IsoParty && AB.IsoParty.find(id), fig = { ...(m || { id, x: 0, y: 0 }), facing: 1, hidden: false, down: false, path: null };
    const k = (H / dp - 10) / 128;
    c.setTransform(dp, 0, 0, dp, 0, 0);
    try { AB.Render.drawFigure(c, fig, W / dp / 2, 4 + 126 * k, k); } catch (e) { /* фигуры нет */ }
  }
  // №161: детали техники — 4 слота под техникой; нажатие — выбор детали из вещей отряда
  let partPick = null;
  function partsRow(vid, lk) {
    if (!AB.VehMods || !AB.PART_SLOTS) return '';
    const cur = AB.VehMods.parts(vid);
    return `<div class="ro-parts">${Object.entries(AB.PART_SLOTS).map(([k, sl]) => { const p = cur[k] && AB.VehMods.part(cur[k]);
      return `<button class="ro-part ${p ? `lv${p.lvl}` : ''} ${partPick === k ? 'on' : ''}" data-part="${k}" ${lk ? 'disabled' : ''} title="${sl.name}${p ? `: ${p.name}` : ' — пусто'}"><i>${sl.icon}</i><span>${p ? p.name : sl.name}</span></button>`; }).join('')}</div>`;
  }
  function modsLine(vid) { const t = AB.VehMods ? AB.VehMods.bonusText(AB.VehMods.bonus(vid)) : ''; return t ? `<p class="ro-mods">Детали: ${t}</p>` : ''; }
  function pickerHtml(vid, slot) {
    const cur = AB.VehMods.parts(vid)[slot], cp = cur && AB.VehMods.part(cur), list = AB.VehMods.available(slot);
    return `<p><b>${AB.PART_SLOTS[slot].name}</b>${cp ? ` — стоит: «${cp.name}» (${cp.desc}) <button class="ro-pbtn" data-unpart="${slot}">Снять</button>` : ' — пусто'}</p>
      ${list.length ? list.map((p) => `<p class="ro-pl lv${p.lvl}"><button class="ro-pbtn" data-setpart="${p.id}">Поставить</button> <b>${p.name}</b> ×${p.n} — ${p.desc}</p>`).join('') : '<p class="ro-mods">В вещах нет деталей для этого слота. Детали выпадают с больших мобов, в лагерях и шахтах, изредка — с NPC.</p>'}
      <p><button class="ro-pbtn" data-part="${slot}">◀ Назад</button></p>`;
  }
  // №172: подробности — по нажатию на героя или технику (в «Отряде» и на странице техники в «Юнитах»)
  let infoMode = null;
  function heroDetail(id) {
    const d = AB.ID.get(id), h = heroInfo(id), c = AB.Chars && AB.Chars.get(id), max = (d.stats || {}).maxHp || 100, hp = c ? Math.round(c.hp) : max;
    const w = AB.Inventory && AB.Inventory.weapon ? AB.Inventory.weapon(id) : null, wd = w && AB.ID.get(w.item), vid = vehicleOf(id), v = vid && V(vid);
    return `<p><b>${d.name}</b> — ${h ? roleName(h.role) : d.role || ''}</p>${h && h.bio ? `<p>${h.bio}</p>` : d.role ? `<p>${d.role}</p>` : ''}
      <p>Здоровье <b>${hp}/${max}</b>${wd ? ` · в руках: <b>${wd.name}</b>` : ''}${AB.Damage && AB.DAMAGE.heroes && AB.DAMAGE.heroes[id] ? ` · своя защита: <b>${AB.Damage.armorName(AB.DAMAGE.heroes[id])}</b>` : ''}</p>
      ${h ? `${abilityLine(h.ability)}<p class="ro-mods">${v ? (v.class === h.role ? `Работает: техника «${v.short || v.name}» — его класса` : `Не работает: техника «${v.short || v.name}» — класс «${roleName(v.class)}», а нужна «${roleName(h.role)}»`) : 'Без техники'}</p>` : ''}
      <p class="un-where">${where(id)}</p>`;
  }
  function vehDetail(vid) {
    const v = V(vid), e = AB.VehMods ? AB.VehMods.eff(vid) : v, s = sync().find((q) => q.vehicle === vid), drv = s && s.hero ? AB.ID.get(s.hero).name : null;
    const diff = (a, b, f = (x) => x) => (Math.abs(a - b) > 0.001 ? ` <i class="ro-up">(${f(b)} → ${f(a)})</i>` : '');
    return `<p><b>${v.name}</b> — ${roleName(v.class)}</p><p>${v.desc || ''}</p>
      <p>Скорость <b>${Math.round(e.speed)}</b> кл/мин${diff(e.speed, v.speed, Math.round)} · Удар <b>${e.attack}</b>${diff(e.attack, v.attack)} раз в ${e.rate} с${diff(e.rate, v.rate)} · дальность ${v.reach}</p>
      <p>Броня <b>${Math.round(e.armor * 100)}%</b>${diff(e.armor, v.armor, (x) => `${Math.round(x * 100)}%`)}${e.hpK > 1 ? ` · прочность +${Math.round((e.hpK - 1) * 100)}%` : ''}${e.crit ? ` · крит ${Math.round(e.crit * 100)}%` : ''}${e.shield0 ? ` · щит ${e.shield0} в начале боя` : ''}</p>
      ${AB.Damage ? `<p>Урон: <b>${AB.Damage.name(v.dtype || 'kinetic')}</b> · Защита: <b>${AB.Damage.armorName(v.armorType)}</b></p>` : ''}
      ${v.gun ? `<p>Оружие: <b>${v.gun}</b></p>` : ''}${abilityLine(v.ability)}${modsLine(vid)}
      <p class="un-where">${!owned().includes(vid) ? 'Ещё не получена' : !s ? 'В наличии · не в активном отряде' : drv ? `Ведёт: ${drv}${outFn(s.hero) ? ' · снаружи' : ' · в базе'}` : 'Без экипажа · в базе'}</p>`;
  }
  function render() {
    const sl = sync(); if (cur >= sl.length) cur = 0;
    const s = sl[cur], v = V(s.vehicle), h = s.hero ? AB.ID.get(s.hero) : null, lk = locked(s), hi = heroInfo(s.hero);
    const tabs = sl.map((q, i) => `<button class="ro-tab ${i === cur ? 'on' : ''}" data-cur="${i}">${q.hero ? AB.ID.get(q.hero).name : '— пусто —'}</button>`).join('');
    el.querySelector('.ro-list').innerHTML = `<div class="ro-tabs">${tabs}</div>
      <div class="ro-show ${lk ? 'locked' : ''}" data-i="${cur}">
        <div class="ro-fig"><canvas data-full="${s.hero || ''}" data-info="hero" title="Подробнее о герое"></canvas>
          <small>Герой${hi ? ` · ${roleName(hi.role)}${hi.role === v.class ? ' ✓' : ''}` : ''}</small>${s.hero && AB.Levels ? AB.Levels.bar('h', s.hero) : ''}
          <div class="ro-sw"><button data-hero="-1" ${lk ? 'disabled' : ''}>◀</button><b>${h ? h.name : '— пусто —'}</b><button data-hero="1" ${lk ? 'disabled' : ''}>▶</button></div></div>
        <div class="ro-vfig"><img src="${vimg(s.vehicle)}" alt="" data-info="veh" title="Подробнее о технике">
          <small>Техника · ${roleName(v.class)}</small>${AB.Levels ? AB.Levels.bar('v', s.vehicle) : ''}
          <div class="ro-sw"><button data-veh="-1" ${lk ? 'disabled' : ''}>◀</button><b>${v.short || v.name}</b><button data-veh="1" ${lk ? 'disabled' : ''}>▶</button></div>
          ${partsRow(s.vehicle, lk)}</div>
        <div class="ro-info">${partPick ? pickerHtml(s.vehicle, partPick) : infoMode === 'hero' ? altsHtml('hero', s, lk) : infoMode === 'veh' ? altsHtml('veh', s, lk) : infoMode === 'herod' && s.hero ? `${heroDetail(s.hero)}<p><button class="ro-pbtn" data-info="hero">◀ Назад</button></p>` : infoMode === 'vehd' ? `${vehDetail(s.vehicle)}<p><button class="ro-pbtn" data-info="veh">◀ Назад</button></p>` : `<p class="ro-hint">Нажмите на героя или технику — выбрать замену.</p><p>${stat(AB.VehMods ? AB.VehMods.eff(s.vehicle) : v)}</p>${modsLine(s.vehicle)}${hi ? abilityLine(hi.ability) : ''}${abilityLine(v.ability)}`}
          <em>${lk ? 'Снаружи — менять можно, когда вернётся в базу' : s.hero ? 'В базе' : 'Техника стоит в базе без экипажа'}</em></div>
      </div>` + (AB.Synergy ? AB.Synergy.html() : '') + siegeHtml(sl) + `<p class="ro-note">Активный отряд: ${sl.filter((q) => q.hero).length}/${MAX}. Ячейку выбирают вкладками сверху или нажатием на ячейку отряда внизу. Нажмите на героя или технику — откроются иконки замены (занятые в другой ячейке поменяются местами); ◀ ▶ — листать по очереди. Способность героя работает только в технике его класса (✓); техники — всегда.</p>`;
    for (const c of el.querySelectorAll('canvas[data-full]')) fullFigure(c, c.dataset.full);
    for (const c of el.querySelectorAll('.ro-alts canvas[data-pt]')) portrait(c, c.dataset.pt, 1);
  }
  // показать в окне ячейку этого героя (нажатие на ячейку отряда внизу карты)
  function focus(hero) { const i = sync().findIndex((q) => q.hero === hero); if (i >= 0) { cur = i; partPick = null; infoMode = null; if (el && !el.hidden) render(); } }
  // №191: настройки осады — щитоносец (бьёт первым) и место в кольце: на максимальной дальности (по умолчанию) или вплотную
  function siegeHtml(sl) {
    const S2 = AB.IsoSurface; if (!S2 || !S2.siegeCfg) return '';
    const cfg = S2.siegeCfg();
    const rows = sl.filter((q) => q.hero).map((q) => { const v = V(q.vehicle), fr = cfg.form[q.hero] === 'front';
      return `<div class="ro-sg"><b>${AB.ID.get(q.hero).name}</b><small>${v.short || v.name} · дальность ${v.reach || 1}</small>
        <button class="ro-sgpos ${fr ? 'front' : ''}" data-fpos="${q.hero}">${fr ? '▲ Вплотную' : `◎ На дальности ${v.reach || 1}`}</button>
        <button class="ro-sgsh ${cfg.shield === q.hero ? 'on' : ''}" data-sgsh="${q.hero}" title="Щитоносец: в осаде бьёт первым">🛡</button></div>`; }).join('');
    return `<div class="ro-siege"><small>Осада — построение</small>${rows}<p class="ro-note">«Осада» на цели — техника встаёт кольцом на своей дальности (или вплотную), первым бьёт 🛡.</p></div>`;
  }
  // №199: замена в ячейке — сетка иконок, как в «Юнитах»: все герои (и «пусто») или вся техника; текущий — подсвечен,
  // занятый в другой ячейке — с подписью (поменяются местами), снаружи — недоступен
  function altsHtml(kind, s, lk) {
    const sl = sync(), here = (id) => sl.findIndex((q) => (kind === 'hero' ? q.hero : q.vehicle) === id);
    const tag = (id) => { const j = here(id); return j < 0 ? '' : j === cur ? 'сейчас' : `${sl[j].hero ? AB.ID.get(sl[j].hero).name : 'ячейка ' + (j + 1)}`; };
    const outJ = (id) => { const j = here(id); return j >= 0 && j !== cur && locked(sl[j]); };
    const tiles = kind === 'hero'
      ? [...crew().map((id) => { const h = heroInfo(id), ok = h && h.role === (V(s.vehicle) || {}).class;
          return `<button class="un-tile ${id === s.hero ? 'on' : ''} ${outJ(id) ? 'out' : ''}" data-alt-hero="${id}" ${lk || outJ(id) ? 'disabled' : ''} title="${AB.ID.get(id).name}"><canvas data-pt="${id}"></canvas><span>${AB.ID.get(id).name}${ok ? ' ✓' : ''}</span>${tag(id) ? `<em>${tag(id)}</em>` : ''}</button>`; }),
        `<button class="un-tile ${!s.hero ? 'on' : ''}" data-alt-hero="" ${lk ? 'disabled' : ''} title="Без героя"><i>∅</i><span>Пусто</span></button>`]
      : owned().map((vid) => `<button class="un-tile ${vid === s.vehicle ? 'on' : ''} ${outJ(vid) ? 'out' : ''}" data-alt-veh="${vid}" ${lk || outJ(vid) ? 'disabled' : ''} title="${V(vid).name}"><img src="${vimg(vid)}" alt=""><span>${V(vid).short || V(vid).name}</span>${tag(vid) ? `<em>${tag(vid)}</em>` : ''}</button>`);
    return `<p><b>${kind === 'hero' ? 'Герой в ячейку' : 'Техника в ячейку'}</b>${kind === 'hero' ? ' · ✓ — его класс, способность работает' : ''}</p>
      <div class="ro-alts un-list grid">${tiles.join('')}</div>
      <p><button class="ro-pbtn" data-info="${kind === 'hero' ? 'herod' : 'vehd'}">Подробнее</button> <button class="ro-pbtn" data-info="">◀ Назад</button></p>`;
  }
  // №159: кто и что в наличии (не в активном отряде) — устарело (№199: автор убрал надпись, замена — иконками)
  function reserveHtml() {
    const sl = sync(), hs = crew().filter((id) => !sl.some((q) => q.hero === id)), vs = owned().filter((v) => !sl.some((q) => q.vehicle === v));
    if (!hs.length && !vs.length) return '';
    return `<div class="ro-reserve"><small>В наличии (не в отряде)</small>${hs.length ? `<p>Герои: <b>${hs.map((id) => AB.ID.get(id).name).join(', ')}</b></p>` : ''}${vs.length ? `<p>Техника: <b>${vs.map((v) => V(v).short || V(v).name).join(', ')}</b></p>` : ''}</div>`;
  }
  function open() {
    if (!el) {
      el = document.getElementById('iso-roster');
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        if (e.target === el || e.target.closest('[data-ro-close]')) { el.hidden = true; return; }
        const tb = e.target.closest('[data-cur]'); if (tb) { cur = +tb.dataset.cur; partPick = null; infoMode = null; render(); return; }
        const fp = e.target.closest('[data-fpos]'); if (fp && AB.IsoSurface) { const id = fp.dataset.fpos; AB.IsoSurface.setForm(id, AB.IsoSurface.siegeCfg().form[id] === 'front' ? 'range' : 'front'); render(); return; }
        const sg = e.target.closest('[data-sgsh]'); if (sg && AB.IsoSurface) { AB.IsoSurface.setShield(sg.dataset.sgsh); render(); return; }
        const ah = e.target.closest('[data-alt-hero],[data-alt-veh]');
        if (ah) { const r = ah.dataset.altVeh !== undefined ? set(cur, { vehicle: ah.dataset.altVeh }) : set(cur, { hero: ah.dataset.altHero || null }); if (!r.ok) AB.Bus.emit('iso:toast', { text: r.why, kind: 'warn' }); render(); return; }   // №199
        const inf = e.target.closest('[data-info]'); if (inf) { infoMode = inf.dataset.info && infoMode !== inf.dataset.info ? inf.dataset.info : null; partPick = null; render(); return; }
        // №161: детали техники
        const pb = e.target.closest('[data-part]'); if (pb) { partPick = partPick === pb.dataset.part ? null : pb.dataset.part; render(); return; }
        const sp = e.target.closest('[data-setpart],[data-unpart]');
        if (sp) { const vid = sync()[cur].vehicle, r = sp.dataset.setpart ? AB.VehMods.install(vid, sp.dataset.setpart) : AB.VehMods.remove(vid, sp.dataset.unpart);
          AB.Bus.emit('iso:toast', { text: r.ok ? (sp.dataset.setpart ? 'Деталь поставлена' : 'Деталь снята — в вещах') : r.why, kind: r.ok ? 'good' : 'warn' }); if (r.ok) partPick = null; render(); return; }
        const b = e.target.closest('[data-hero],[data-veh]'), sl = e.target.closest('[data-i]'); if (!b || !sl) return;
        const i = +sl.dataset.i, s = sync()[i], d = +(b.dataset.hero || b.dataset.veh);
        let r;
        if (b.dataset.hero) { const opts = [...crew(), null], k = opts.indexOf(s.hero); r = set(i, { hero: opts[(k + d + opts.length) % opts.length] }); }
        else { const opts = owned(), k = opts.indexOf(s.vehicle); r = set(i, { vehicle: opts[(k + d + opts.length) % opts.length] }); }
        if (!r.ok) AB.Bus.emit('iso:toast', { text: r.why, kind: 'warn' });
        render();
      });
    }
    // №160: на карте окно не закрывает ячейки отряда внизу — по ним переключают, кто стоит в центре
    el.classList.toggle('over-bar', !!((AB.IsoSurface && AB.IsoSurface.isOpen()) || (AB.IsoOverworld && AB.IsoOverworld.isOpen())));
    el.hidden = false; render();          // сначала показать: портреты рисуются по размеру холста
  }
  // ---------- №144: окно «Юниты» — вкладки «Герои» и «Транспорт» (просмотр) ----------
  let uel = null, tab = 'heroes';
  const where = (id) => { const s = sync().find((q) => q.hero === id); return !s ? 'в наличии · не в активном отряде' : outFn(id) ? `снаружи · ${V(s.vehicle).name}` : `в базе · ${V(s.vehicle).name}`; };
  // №145: вкладка — сетка квадратных иконок; нажатие на иконку — карточка юнита (назад — к сетке)
  let pick = null;                                    // открытая карточка: ID героя или техники
  function heroCard(id) {
    const d = AB.ID.get(id), c = AB.Chars.get(id), max = (d.stats || {}).maxHp || 100, hp = c ? Math.round(c.hp) : max;
    const w = AB.Inventory && AB.Inventory.weapon ? AB.Inventory.weapon(id) : null, wd = w && AB.ID.get(w.item);
    return `<div class="un-detail"><canvas data-pt="${id}" class="big"></canvas><div><b>${d.name}</b><small>${d.role || ''}</small>
      ${AB.Levels ? `<p>${AB.Levels.bar('h', id)}</p>` : ''}
      <p>Здоровье <b>${hp}/${max}</b></p><p>В руках: <b>${wd ? wd.name : '—'}</b>${AB.Damage ? ` · урон: <b>${AB.Damage.name(AB.Damage.weaponType(w && w.item, wd && wd.weapon))}</b>` : ''}</p>
      ${AB.Damage ? `<p>Своя защита (без техники): <b>${AB.Damage.armorName(AB.DAMAGE.heroes[id])}</b></p>` : ''}${wd && wd.desc ? `<small>${wd.desc}</small>` : ''}
      ${heroInfo(id) ? `<p>Класс: <b>${roleName(heroInfo(id).role)}</b> — способность работает только в технике этого класса</p>${abilityLine(heroInfo(id).ability)}` : ''}
      <p class="un-where">${where(id)}</p></div></div>`;
  }
  function lockCard(id) {
    const d = AB.ID.get(id), h = heroInfo(id), q = (AB.SURFACE_A1_QUESTS || []).find((x) => x.id === h.unlock);
    return `<div class="un-detail"><canvas data-pt="${id}" class="big"></canvas><div><b>${d.name} 🔒</b><small>${roleName(h.role)}</small><p>${d.bio || ''}</p>${abilityLine(h.ability)}
      <p class="un-where">Откроется: задание «${q ? q.name : '?'}» (зона A1)</p></div></div>`;
  }
  // №172: страница техники в «Юнитах»: техника во весь рост, полное описание, детали (поставить/снять)
  // №195: страница техники — справа вкладки-иконки: «Подробнее», «Усиления», «Введение»
  let vtab = 'stats';
  const VTABS = [['stats', '☰', 'Подробнее'], ['mods', '⚙', 'Усиления'], ['intro', 'ℹ', 'Введение']];
  function vehStats(vid) {
    const v = V(vid), e = AB.VehMods ? AB.VehMods.eff(vid) : v, s = sync().find((q) => q.vehicle === vid), drv = s && s.hero ? AB.ID.get(s.hero).name : null;
    const diff = (a, b, f = (x) => x) => (Math.abs(a - b) > 0.001 ? ` <i class="ro-up">(${f(b)} → ${f(a)})</i>` : '');
    return `<p><b>${v.name}</b> — ${roleName(v.class)}</p>${AB.Levels ? `<p>${AB.Levels.bar('v', vid)} <i class="muted">урон +${Math.round((AB.Levels.level('v', vid) - 1) * AB.LEVELS.vehicle.attack * 100)}%, прочность +${Math.round((AB.Levels.level('v', vid) - 1) * AB.LEVELS.vehicle.hp * 100)}%</i></p>` : ''}
      <p>Скорость <b>${Math.round(e.speed)}</b> кл/мин${diff(e.speed, v.speed, Math.round)}</p>
      <p>Удар <b>${e.attack}</b>${diff(e.attack, v.attack)} раз в ${e.rate} с${diff(e.rate, v.rate)} · дальность <b>${v.reach}</b></p>
      <p>Броня <b>${Math.round(e.armor * 100)}%</b>${diff(e.armor, v.armor, (x) => `${Math.round(x * 100)}%`)}${e.hpK > 1 ? ` · прочность +${Math.round((e.hpK - 1) * 100)}%` : ''}${e.crit ? ` · крит ${Math.round(e.crit * 100)}%` : ''}${e.shield0 ? ` · щит ${e.shield0} в начале боя` : ''}</p>
      ${AB.Damage ? `<p>Урон: <b>${AB.Damage.name(v.dtype || 'kinetic')}</b> · Защита: <b>${AB.Damage.armorName(v.armorType)}</b></p>` : ''}
      ${v.gun ? `<p>Оружие: <b>${v.gun}</b></p>` : ''}${abilityLine(v.ability)}
      <p class="un-where">${!owned().includes(vid) ? 'Ещё не получена' : !s ? 'В наличии · не в активном отряде' : drv ? `Ведёт: ${drv}${outFn(s.hero) ? ' · снаружи' : ' · в базе'}` : 'Без экипажа · в базе'}</p>
      ${owned().includes(vid) ? '<p><button class="ro-pbtn" data-un-edit>◎ В окно «Отряд» — сменить водителя</button></p>' : ''}`;
  }
  function vehIntro(vid) {
    const v = V(vid), I = (AB.VEHICLE_INFO || {})[vid] || {}, R = (AB.VEHICLE_RARITY || {})[I.rarity] || null;
    return `<p class="un-vh">Введение</p>
      <p>Полное название: <b>${I.full || v.name}</b></p>
      <p>Редкость: ${R ? `<b style="color:${R.col}">${R.name}</b>` : '—'}</p>
      <p>Источник питания: <b>${(AB.VEHICLE_POWER || {})[I.power] || '—'}</b></p>
      <p>Класс: <b>${roleName(v.class)}</b></p>
      <p class="un-vh">Информация</p><p>${I.info || v.desc || ''}</p>`;
  }
  function vehCard(vid) {
    if (vid === 'base') return `<div class="un-detail"><i class="cap big"></i><div><b>Капсула-батискаф</b><small>База отряда: ездит по карте, внутри — трюм с устройствами. Из неё выходят герои в технике.</small><p>Скорость <b>${AB.VEHICLES_BASE.speed}</b> кл/мин</p></div></div>`;
    const s = sync().find((q) => q.vehicle === vid), lk = !!s && locked(s), have = owned().includes(vid);
    const body = vtab === 'mods'
      ? (have ? `<p class="un-vh">Усиления${lk ? ' — техника снаружи, менять можно в базе' : ''}</p>${partsRow(vid, lk)}${partPick ? `<div class="un-picker">${pickerHtml(vid, partPick)}</div>` : ''}${modsLine(vid) || '<p class="ro-mods">Детали не стоят. Нажмите на слот — поставить деталь из вещей.</p>'}` : '<p class="ro-mods">Техника ещё не получена — усиления недоступны.</p>')
      : vtab === 'intro' ? vehIntro(vid) : vehStats(vid);
    return `<div class="un-vpage"><div class="un-vfig"><img src="${vimg(vid)}" alt=""></div>
      <div class="un-vinfo">${body}</div>
      <div class="un-vtabs">${VTABS.map(([k, ic, nm]) => `<button class="${vtab === k ? 'on' : ''}" data-vtab="${k}" title="${nm}" aria-label="${nm}">${ic}</button>`).join('')}</div></div>`;
  }
  function unitsRender() {
    for (const b of uel.querySelectorAll('[data-utab]')) b.classList.toggle('on', b.dataset.utab === tab);
    const box = uel.querySelector('.un-list');
    if (tab === 'damage' && AB.DAMAGE) {         // №152: таблица «камень-ножницы-бумага»
      const D = AB.DAMAGE, arm = Object.keys(D.armors);
      const cell = (m) => `<td class="${m >= 1.24 ? 'hi' : m <= 0.76 ? 'lo' : ''}">×${String(m).replace('.', ',')}</td>`;
      box.className = 'un-list one';
      box.innerHTML = `<table class="dmg-tab"><tr><th>Урон \\ Защита</th>${arm.map((a) => `<th>${D.armors[a]}</th>`).join('')}</tr>${Object.keys(D.types).map((t) => `<tr><th>${D.types[t]}</th>${arm.map((a) => cell(D.mult[t][a])).join('')}</tr>`).join('')}</table>
        <p class="ro-note">Кинетика пробивает щит и вязнет в броне. Энергия прожигает броню и гасится щитом. Термальный — против брони и живой плоти, слаб против щитов.<br>Экзокостюм: энергоурон, кинетическая броня. Костюм Хейл: термальный, энергощит. Кланы Стали — броня, Наследники — щиты, органика — без защиты.</p>`;
      return;
    }
    if (pick) {
      box.className = 'un-list one';
      const lockedHero = tab === 'heroes' && !crew().includes(pick);
      box.innerHTML = `<button class="un-back" data-un-back>◀ Назад</button>` + (lockedHero ? lockCard(pick) : tab === 'heroes' ? heroCard(pick) : vehCard(pick));
    } else {
      box.className = 'un-list grid';
      const locked = (AB.HEROES ? Object.keys(AB.HEROES) : []).filter((id) => !crew().includes(id) && AB.ID.has(id));
      const tiles = tab === 'heroes'
        ? [...crew().map((id) => `<button class="un-tile ${outFn(id) ? 'out' : ''}" data-un="${id}" title="${AB.ID.get(id).name}"><canvas data-pt="${id}"></canvas><span>${AB.ID.get(id).name}</span></button>`),
          ...locked.map((id) => `<button class="un-tile lock" data-un="${id}" title="Откроется заданием"><i>🔒</i><span>${AB.ID.get(id).name}</span></button>`)]
        : [...owned().map((vid) => `<button class="un-tile ${(() => { const s = sync().find((q) => q.vehicle === vid); return s && s.hero && outFn(s.hero) ? 'out' : ''; })()}" data-un="${vid}" title="${V(vid).name}"><img src="${vimg(vid)}" alt=""><span>${V(vid).short || V(vid).name}</span></button>`),
          '<button class="un-tile" data-un="base" title="Капсула-батискаф"><i class="cap"></i><span>Капсула</span></button>',
          ...Object.keys(AB.VEHICLES).filter((v) => !owned().includes(v) && v !== 'EQUIP-018').map((vid) => `<button class="un-tile lock" data-un="${vid}" title="Откроется заданием или трофеем"><i>🔒</i><span>${V(vid).short || V(vid).name}</span></button>`)];
      box.innerHTML = tiles.join('') || '<p class="ro-note">Никого</p>';
    }
    for (const c of box.querySelectorAll('canvas[data-pt]')) portrait(c, c.dataset.pt, 1);
  }
  function units(t) {
    if (!uel) {
      uel = document.getElementById('iso-units');
      uel.addEventListener('pointerdown', (e) => e.stopPropagation());
      uel.addEventListener('click', (e) => {
        if (e.target === uel || e.target.closest('[data-un-close]')) { uel.hidden = true; return; }
        const b = e.target.closest('[data-utab]'); if (b) { tab = b.dataset.utab; pick = null; unitsRender(); return; }
        const vt = e.target.closest('[data-vtab]'); if (vt) { vtab = vt.dataset.vtab; partPick = null; unitsRender(); return; }   // №195
        const t = e.target.closest('[data-un]'); if (t) { pick = t.dataset.un; partPick = null; vtab = 'stats'; unitsRender(); return; }
        // №172: детали техники на её странице
        if (tab === 'vehicles' && pick && pick !== 'base') {
          const pb = e.target.closest('[data-part]'); if (pb) { partPick = partPick === pb.dataset.part ? null : pb.dataset.part; unitsRender(); return; }
          const sp = e.target.closest('[data-setpart],[data-unpart]');
          if (sp) { const r = sp.dataset.setpart ? AB.VehMods.install(pick, sp.dataset.setpart) : AB.VehMods.remove(pick, sp.dataset.unpart);
            AB.Bus.emit('iso:toast', { text: r.ok ? (sp.dataset.setpart ? 'Деталь поставлена' : 'Деталь снята — в вещах') : r.why, kind: r.ok ? 'good' : 'warn' }); if (r.ok) partPick = null; unitsRender(); return; }
        }
        if (e.target.closest('[data-un-back]')) { pick = null; partPick = null; unitsRender(); return; }
        if (e.target.closest('[data-un-edit]')) { const i = sync().findIndex((q) => q.vehicle === pick); if (i >= 0) cur = i; infoMode = null; partPick = null; uel.hidden = true; AB.IsoRoster.open(); }
      });
    }
    if (t) tab = t;
    pick = null; uel.hidden = false; unitsRender();
  }
  return { MAX, focus, unlock, unlocked: () => ({ heroes: [...U().heroes], vehicles: [...U().vehicles] }), vimg, portrait, crew, units, list, sync, set, vehicleOf, open, close: () => { if (el) el.hidden = true; }, isOpen: () => !!el && !el.hidden, setOutFn: (f) => { outFn = f || (() => false); }, V, owned };
})();
