// =====================================================================
// ISO INVENTORY (дополнения №48–49). Два окна:
//   • «Вещи» (I, Tab) — общий инвентарь профиля: 12 ячеек (AB.IsoStash).
//     Использовать на выбранном герое, дать оружие в руки, выбросить.
//   • Окно героя — нажатие на карточку героя внизу справа: здоровье,
//     надето (оружие в руках, одежда — текущий облик), «Вести отряд».
// Лечение, оружие и их числа — из данных предметов, как в основной игре.
// =====================================================================

AB.IsoInventory = (() => {
  const $ = (s) => document.querySelector(s);
  const isTouch = matchMedia('(pointer: coarse)').matches;
  let ui = null, selected = 0, hero = null, lastHtml = '';
  const itemName = (id) => AB.ID.get(id).name;
  const S = () => AB.IsoStash;

  function init() {
    ui = { box: $('#iso-inv'), grid: $('#iso-inv-grid'), detail: $('#iso-inv-detail'), owner: $('#iso-inv-owner'), hero: $('#iso-hero'), heroBody: $('#iso-hero-body') };
    for (const el of [ui.box, ui.hero]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    ui.box.addEventListener('click', onClick);
    ui.hero.addEventListener('click', onHeroClick);
    $('#iso-inv-btn').addEventListener('click', toggle);
    $('#iso-inv-btn').addEventListener('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); toggle(); }
      if (e.code === 'Escape') { close(); closeHero(); }
    });
    for (const ev of ['inventory:changed', 'inventory:exchange', 'item:pickup', 'item:used', 'char:hp', 'iso:party', 'char:dead']) AB.Bus.on(ev, () => { if (isOpen()) render(); if (heroOpen()) renderHero(); });
  }

  const isOpen = () => ui && !ui.box.hidden;
  const heroOpen = () => ui && !ui.hero.hidden;
  function open() { closeHero(); ui.box.hidden = false; AB.IsoParty.stop(); render(); }
  function close() { if (ui) ui.box.hidden = true; }
  function toggle() { isOpen() ? close() : open(); }

  // ---------- Общий инвентарь ----------
  // №65: отделения — оружие, медикаменты, ресурсы, особое (ключи, жетоны, боеприпасы)
  const SECTIONS = [
    { id: 'weapon', name: 'Оружие', cats: ['weapon'] },
    { id: 'medical', name: 'Медикаменты', cats: ['medical'] },
    { id: 'resource', name: 'Ресурсы', cats: ['resource'] },
    { id: 'special', name: 'Особое', cats: ['key', 'ammo'] },
  ];
  const sectionOf = (def) => (SECTIONS.find((s) => s.cats.includes(def.category)) || SECTIONS[3]).id;
  function render() {
    const cells = S().cells();
    if (!cells[selected]) { const f = cells.findIndex(Boolean); if (f >= 0) selected = f; }
    const slot = (s, i) => {
      const def = AB.ID.get(s.item), icon = AB.Assets.get(def.icon);
      const face = icon.status === 'ready' ? `<img src="${AB.ID.get(def.icon).src}" alt="">` : `<b>${def.short}</b>`;
      return `<button class="slot cat-${def.category} ${i === selected ? 'sel' : ''}" data-slot="${i}" aria-label="${def.name}${s.qty > 1 ? `, ${s.qty} шт.` : ''}">${face}${s.qty > 1 ? `<em>${s.qty}</em>` : ''}</button>`;
    };
    const free = cells.filter((c) => !c).length;
    const grid = SECTIONS.map((sec) => {
      const list = cells.map((s, i) => [s, i]).filter(([s]) => s && sectionOf(AB.ID.get(s.item)) === sec.id);
      return `<div class="inv-sec"><span>${sec.name}</span><em>${list.length ? list.reduce((a, [s]) => a + 1, 0) : 'пусто'}</em></div>${list.map(([s, i]) => slot(s, i)).join('')}`;
    }).join('') + `<div class="inv-sec free"><span>Свободных ячеек</span><em>${free} из ${S().SIZE}</em></div>`;
    const s = cells[selected];
    const alive = AB.IsoParty.members().filter((m) => !(AB.Chars.get(m.id) || {}).dead);
    let detail = '<p class="muted">Пустая ячейка. Всё найденное в бункере ложится сюда — в общий инвентарь отряда. У героев — только то, что надето: оружие и одежда (нажмите на героя внизу справа).</p>';
    if (s) {
      const def = AB.ID.get(s.item);
      let acts = '';
      if (def.weapon) acts = alive.map((m) => `<button data-inv="equip" data-to="${m.id}">В руки: ${AB.ID.get(m.id).name}${AB.Inventory.weapon(m.id) ? ` (⇄ ${AB.ID.get(AB.Inventory.weapon(m.id).item).short})` : ''}</button>`).join('');
      else if (def.use) acts = alive.map((m) => { const b = S().useBlock(selected, m.id); return `<button data-inv="use" data-to="${m.id}" ${b ? `disabled title="${b}"` : ''}>Использовать: ${AB.ID.get(m.id).name}${b ? ` — ${b.toLowerCase()}` : ''}</button>`; }).join('');
      detail = `<h3>${def.name}${s.qty > 1 ? ` ×${s.qty}` : ''}</h3><p>${def.desc}</p>
        <div class="inv-actions">${acts}<button data-inv="drop" class="ghost">Выбросить</button></div>
        ${def.weapon ? `<div class="muted">Урон ${def.weapon.damage}${def.weapon.energy ? ' · без боезапаса, перегрев после 5 выстрелов' : ''}${def.weapon.aura ? ' · лечит союзников рядом' : ''}${def.weapon.infinite ? ' · без боезапаса' : ''} · ${def.weapon.ranged ? 'выстрел' : 'удар'}</div>` : ''}
        ${!def.weapon && !def.use ? '<div class="muted">Понадобится для ремонта: оборудование возьмёт её отсюда само.</div>' : ''}`;
    }
    const html = grid + '|' + detail;
    if (html !== lastHtml) { ui.grid.innerHTML = grid; ui.detail.innerHTML = detail; lastHtml = html; }
    const used = cells.filter(Boolean).length;
    ui.owner.textContent = `Общий инвентарь отряда · занято ${used} из ${S().SIZE} · на это прохождение`;
  }

  function onClick(e) {
    const slot = e.target.closest('[data-slot]');
    if (slot) { selected = Number(slot.dataset.slot); render(); return; }
    const act = e.target.closest('[data-inv]');
    if (act && !act.disabled) {
      const s = S().slot(selected);
      if (act.dataset.inv === 'use' && s && S().use(selected, act.dataset.to)) AB.Bus.emit('iso:toast', { text: `${AB.ID.get(act.dataset.to).name}: ${itemName(s.item)}`, kind: 'good' });
      if (act.dataset.inv === 'equip' && s) S().equip(selected, act.dataset.to);
      if (act.dataset.inv === 'drop' && s) {
        const d = S().drop(selected), l = AB.IsoParty.lead(), room = AB.IsoWorld.room(l.x, l.y);
        AB.Rooms.dropItem(room, d.item, d.qty, 0);
        AB.Bus.emit('iso:toast', { text: `Выброшено: ${itemName(d.item)}${d.qty > 1 ? ` ×${d.qty}` : ''}`, kind: 'info' });
      }
      render();
      return;
    }
    if (e.target === ui.box || e.target.closest('[data-inv-close]')) close();
  }

  // ---------- Окно героя ----------
  function openHero(id) { close(); hero = id; ui.hero.hidden = false; renderHero(); }
  function closeHero() { if (ui) ui.hero.hidden = true; hero = null; }
  function renderHero() {
    const id = hero, d = AB.ID.get(id), c = AB.Chars.get(id), m = AB.IsoParty.find(id);
    if (!d || !c) { closeHero(); return; }
    const w = AB.Inventory.weapon(id), wd = w && AB.ID.get(w.item);
    const lead = AB.IsoParty.lead().id === id;
    const skills = Object.keys(d.skills || {}).map((k) => ({ repair: 'инженер — чинит оборудование' }[k] || k)).join(', ');
    ui.heroBody.innerHTML = `
      <div class="inv-head"><div><h2>${d.name}</h2><div class="muted">${c.dead ? 'Погиб' : `здоровье ${Math.round(c.hp)} / ${d.stats.maxHp}`}${skills ? ` · ${skills}` : ''}</div></div>
        <button class="inv-x" data-hero-close aria-label="Закрыть">✕</button></div>
      <div class="hero-hp"><i style="width:${Math.round(Math.max(0, c.hp / d.stats.maxHp) * 100)}%"></i></div>
      <div class="hero-gear">
        <div class="gear"><span class="slot-label">Оружие</span><div class="slot ${wd ? '' : 'empty'}">${wd ? `<b>${wd.short}</b>` : ''}</div>
          <div class="gear-text">${wd ? `<b>${wd.name}</b><span>урон ${wd.weapon.damage}${wd.weapon.aura ? ' · лечит рядом' : ''}${wd.weapon.energy ? ' · перегрев' : ''}</span>` : '<span class="muted">Руки пусты</span>'}
          ${wd ? '<button data-hero="unequip">Убрать в инвентарь</button>' : ''}</div></div>
        <div class="gear"><span class="slot-label">Одежда</span><div class="slot"><b>⌂</b></div>
          <div class="gear-text"><b>Текущий облик</b><span class="muted">${m ? m.appearance : ''} · одежды-вещей пока нет</span></div></div>
      </div>
      <div class="inv-actions">${lead ? '<span class="muted">Ведёт отряд</span>' : `<button data-hero="lead" ${c.dead ? 'disabled' : ''}>Вести отряд</button>`}
        ${!lead && AB.IsoNest.active() && !c.dead ? (m && m.repair ? '<button data-hero="follow">Отойти от замка — за мной</button>' : '<button data-hero="repair">Помогать у замка</button>') : ''}</div>`;
  }
  function onHeroClick(e) {
    const b = e.target.closest('[data-hero]');
    if (b && !b.disabled) {
      if (b.dataset.hero === 'unequip' && !S().unequip(hero)) AB.Bus.emit('iso:toast', { text: 'В общем инвентаре нет места', kind: 'info' });
      if (b.dataset.hero === 'repair') AB.IsoNest.order(hero, true);
      if (b.dataset.hero === 'follow') AB.IsoNest.order(hero, false);
      if (b.dataset.hero === 'lead') { const i = AB.IsoParty.members().findIndex((m) => m.id === hero); AB.IsoParty.setLeader(i); }
      renderHero();
      return;
    }
    if (e.target === ui.hero || e.target.closest('[data-hero-close]')) closeHero();
  }

  return { init, open, close, toggle, isOpen, render, openHero, closeHero, heroOpen, select: (i) => { selected = i; if (isOpen()) render(); } };
})();
