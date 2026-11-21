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
  const DEFAULT = { 'EQUIP-005': 'CHAR-001', 'EQUIP-018': 'CHAR-003' };   // кто обычно в какой технике
  let slots = null;                       // [{ vehicle, hero }]
  let outFn = () => false;                // карта сообщает: этот герой снаружи (его менять нельзя)
  const crew = () => (AB.IsoActs ? AB.IsoActs.crew() : ['CHAR-001']);
  // какая техника есть у отряда: экзокостюм «Абисса»; костюм Хейл — когда она в экипаже
  const owned = () => Object.keys(AB.VEHICLES).filter((v) => v !== 'EQUIP-018' || crew().includes('CHAR-003'));
  const V = (id) => AB.VEHICLES[id] || null;
  function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(s)) slots = s; } catch (e) { /* без хранилища */ } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(slots)); } catch (e) { /* без хранилища */ } }
  function sync() {
    if (!slots) load();
    if (!Array.isArray(slots)) slots = [];
    const vs = owned(), cr = crew();
    slots = slots.filter((s) => vs.includes(s.vehicle));
    for (const v of vs) if (!slots.some((s) => s.vehicle === v)) slots.push({ vehicle: v, hero: undefined });
    const used = new Set();
    for (const s of slots) { if (s.hero && (!cr.includes(s.hero) || used.has(s.hero))) s.hero = undefined; if (s.hero) used.add(s.hero); }
    for (const s of slots) if (s.hero === undefined) {
      const pref = DEFAULT[s.vehicle], h = pref && cr.includes(pref) && !used.has(pref) ? pref : null;
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
  const stat = (v) => `Скорость <b>${v.speed}</b> кл/мин · Удар <b>${v.attack}</b> / ${v.rate} с · Броня <b>${Math.round(v.armor * 100)}%</b>`;
  function render() {
    const cr = crew();
    el.querySelector('.ro-list').innerHTML = sync().map((s, i) => {
      const v = V(s.vehicle), h = s.hero ? AB.ID.get(s.hero) : null, lk = locked(s);
      return `<div class="ro-slot ${lk ? 'locked' : ''}" data-i="${i}">
        <div class="ro-hero"><canvas data-pt="${s.hero || ''}"></canvas>
          <div><small>Герой</small><b>${h ? h.name : '— пусто —'}</b>
          <div class="ro-sw"><button data-hero="-1" ${lk ? 'disabled' : ''}>◀</button><button data-hero="1" ${lk ? 'disabled' : ''}>▶</button></div></div></div>
        <div class="ro-veh"><img src="${v.img}" alt="">
          <div><small>Техника</small><b>${v.name}</b><p>${stat(v)}</p>
          <div class="ro-sw"><button data-veh="-1" ${lk ? 'disabled' : ''}>◀</button><button data-veh="1" ${lk ? 'disabled' : ''}>▶</button></div></div></div>
        <em>${lk ? 'Снаружи — менять можно, когда вернётся в базу' : s.hero ? 'В базе' : 'Техника стоит в базе без экипажа'}</em>
      </div>`;
    }).join('') + `<p class="ro-note">В экипаже: ${cr.map((id) => AB.ID.get(id).name).join(', ')}. Менять героя или технику можно только у того, кто в базе.</p>`;
    for (const c of el.querySelectorAll('canvas[data-pt]')) if (c.dataset.pt && AB.IsoRender && AB.IsoRender.portrait) AB.IsoRender.portrait(c, c.dataset.pt, 1);
  }
  function open() {
    if (!el) {
      el = document.getElementById('iso-roster');
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        if (e.target === el || e.target.closest('[data-ro-close]')) { el.hidden = true; return; }
        const b = e.target.closest('[data-hero],[data-veh]'), sl = e.target.closest('[data-i]'); if (!b || !sl) return;
        const i = +sl.dataset.i, s = sync()[i], d = +(b.dataset.hero || b.dataset.veh);
        let r;
        if (b.dataset.hero) { const opts = [...crew(), null], k = opts.indexOf(s.hero); r = set(i, { hero: opts[(k + d + opts.length) % opts.length] }); }
        else { const opts = owned(), k = opts.indexOf(s.vehicle); r = set(i, { vehicle: opts[(k + d + opts.length) % opts.length] }); }
        if (!r.ok) AB.Bus.emit('iso:toast', { text: r.why, kind: 'warn' });
        render();
      });
    }
    el.hidden = false; render();          // сначала показать: портреты рисуются по размеру холста
  }
  // ---------- №144: окно «Юниты» — вкладки «Герои» и «Транспорт» (просмотр) ----------
  let uel = null, tab = 'heroes';
  const where = (id) => { const s = sync().find((q) => q.hero === id); return !s ? 'без техники' : outFn(id) ? `снаружи · ${V(s.vehicle).name}` : `в базе · ${V(s.vehicle).name}`; };
  function unitsRender() {
    for (const b of uel.querySelectorAll('[data-utab]')) b.classList.toggle('on', b.dataset.utab === tab);
    const box = uel.querySelector('.un-list');
    if (tab === 'heroes') {
      box.innerHTML = crew().map((id) => {
        const d = AB.ID.get(id), c = AB.Chars.get(id), max = (d.stats || {}).maxHp || 100, hp = c ? Math.round(c.hp) : max;
        const w = AB.Inventory && AB.Inventory.weapon ? AB.Inventory.weapon(id) : null, wd = w && AB.ID.get(w.item);
        return `<div class="un-card"><canvas data-pt="${id}"></canvas><div><b>${d.name}</b><small>${d.role || ''}</small>
          <p>Здоровье <b>${hp}/${max}</b> · В руках: <b>${wd ? wd.name : '—'}</b></p><p class="un-where">${where(id)}</p></div></div>`;
      }).join('') || '<p class="ro-note">В экипаже никого</p>';
    } else {
      box.innerHTML = owned().map((vid) => {
        const v = V(vid), s = sync().find((q) => q.vehicle === vid), h = s && s.hero ? AB.ID.get(s.hero).name : null;
        return `<div class="un-card"><img src="${v.img}" alt=""><div><b>${v.name}</b><small>${v.desc || ''}</small>
          <p>Скорость <b>${v.speed}</b> кл/мин · Удар <b>${v.attack}</b> / ${v.rate} с · Броня <b>${Math.round(v.armor * 100)}%</b></p>
          <p class="un-where">${h ? `Ведёт: ${h}${outFn(s.hero) ? ' · снаружи' : ' · в базе'}` : 'Без экипажа · в базе'}</p></div></div>`;
      }).join('') + `<div class="un-card un-base"><i class="cap"></i><div><b>Капсула-батискаф</b><small>База отряда: ездит по карте, внутри — трюм с устройствами.</small><p>Скорость <b>${AB.VEHICLES_BASE.speed}</b> кл/мин</p></div></div>`;
    }
    for (const c of box.querySelectorAll('canvas[data-pt]')) if (AB.IsoRender && AB.IsoRender.portrait) AB.IsoRender.portrait(c, c.dataset.pt, 1);
  }
  function units(t) {
    if (!uel) {
      uel = document.getElementById('iso-units');
      uel.addEventListener('pointerdown', (e) => e.stopPropagation());
      uel.addEventListener('click', (e) => {
        if (e.target === uel || e.target.closest('[data-un-close]')) { uel.hidden = true; return; }
        const b = e.target.closest('[data-utab]'); if (b) { tab = b.dataset.utab; unitsRender(); }
        if (e.target.closest('[data-un-edit]')) { uel.hidden = true; open(); }
      });
    }
    if (t) tab = t;
    uel.hidden = false; unitsRender();
  }
  return { units, list, sync, set, vehicleOf, open, close: () => { if (el) el.hidden = true; }, isOpen: () => !!el && !el.hidden, setOutFn: (f) => { outFn = f || (() => false); }, V, owned };
})();
