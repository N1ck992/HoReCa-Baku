// =====================================================================
// ISO INVENTORY (этап 4 изометрии, дополнение №48). Окно инвентаря в
// изометрической сцене. Правила — система основной игры без изменений
// (AB.Inventory): у каждого оружие и два места в рюкзаке, рюкзаки отряда
// общие; использовать (лечение), выбросить, отдать / взять / обменяться
// слотом с тем, кто рядом. Открыть — I, Tab или кнопка «Вещи»; Esc — закрыть.
// Пока окно открыто, мир идёт дальше (как в Diablo), но герой стоит.
// =====================================================================

AB.IsoInventory = (() => {
  const $ = (s) => document.querySelector(s);
  const SLOT_NAMES = ['Оружие', 'Рюкзак', 'Рюкзак'];
  const isTouch = matchMedia('(pointer: coarse)').matches;
  let ui = null, selected = 1, lastHtml = '';
  const L = () => AB.IsoParty.lead().id;
  const itemName = (id) => AB.ID.get(id).name;

  function init() {
    ui = { box: $('#iso-inv'), grid: $('#iso-inv-grid'), detail: $('#iso-inv-detail'), owner: $('#iso-inv-owner') };
    ui.box.addEventListener('pointerdown', (e) => e.stopPropagation());
    ui.box.addEventListener('click', onClick);
    $('#iso-inv-btn').addEventListener('click', toggle);
    $('#iso-inv-btn').addEventListener('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); toggle(); }
      if (e.code === 'Escape') close();
    });
    // что изменилось в рюкзаках — перерисовать открытое окно
    for (const ev of ['inventory:changed', 'inventory:exchange', 'item:pickup', 'item:used', 'char:hp', 'iso:party']) AB.Bus.on(ev, () => { if (isOpen()) render(); });
  }

  const isOpen = () => ui && !ui.box.hidden;
  function open() {
    const c = AB.Chars.get(L());
    if (!c || c.dead) return;
    ui.box.hidden = false; AB.IsoParty.stop(); render();
  }
  function close() { if (ui) ui.box.hidden = true; }
  function toggle() { isOpen() ? close() : open(); }

  function render() {
    const lead = L(), slots = AB.Inventory.slots(lead);
    const grid = slots.map((s, i) => {
      const label = `<span class="slot-label">${SLOT_NAMES[i]}</span>`;
      if (!s) return `<button class="slot empty ${i === selected ? 'sel' : ''}" data-slot="${i}" aria-label="${SLOT_NAMES[i]}: пусто">${label}</button>`;
      const def = AB.ID.get(s.item), icon = AB.Assets.get(def.icon);
      const face = icon.status === 'ready' ? `<img src="${AB.ID.get(def.icon).src}" alt="">` : `<b>${def.short}</b>`;
      return `<button class="slot cat-${def.category} ${i === selected ? 'sel' : ''}" data-slot="${i}" aria-label="${SLOT_NAMES[i]}: ${def.name}${s.qty > 1 ? `, ${s.qty} шт.` : ''}">${label}${face}${s.qty > 1 ? `<em>${s.qty}</em>` : ''}</button>`;
    }).join('');
    const s = slots[selected];
    // обмен с остальными в отряде: тот же слот у каждого
    const swaps = AB.IsoParty.members().filter((m) => m.id !== lead).map((m) => {
      const os = AB.Inventory.slot(m.id, selected);
      if (!s && !os) return '';
      const name = AB.ID.get(m.id).name, block = AB.Inventory.exchangeBlock(lead, m.id, selected);
      const label = s && os ? `Обменяться ⇄ ${name}: ${itemName(os.item)}` : s ? `Отдать → ${name}` : `Взять ← ${name}: ${itemName(os.item)}`;
      return `<button data-inv="give" data-to="${m.id}" ${block ? `disabled title="${block}"` : ''}>${label}</button>${block ? `<div class="muted">${name}: ${block.charAt(0).toLowerCase()}${block.slice(1)}</div>` : ''}`;
    }).join('');
    let detail = `<p class="muted">${selected === 0 ? 'Оружия нет. Подберите что-нибудь тяжёлое.' : 'Свободное место в рюкзаке. Вещи в рюкзаках общие: оборудование возьмёт нужную у любого из отряда рядом.'}</p>${swaps ? `<div class="inv-actions">${swaps}</div>` : ''}`;
    if (s) {
      const def = AB.ID.get(s.item), block = AB.Inventory.useBlock(lead, selected);
      detail = `<h3>${def.name}${s.qty > 1 ? ` ×${s.qty}` : ''}</h3><p>${def.desc}</p>
        <div class="inv-actions">
          ${def.use ? `<button data-inv="use" ${block ? 'disabled' : ''}>Использовать</button>` : ''}
          <button data-inv="drop" class="ghost">Выбросить</button>
          ${swaps}
        </div>
        ${def.weapon ? `<div class="muted">В руках · урон ${def.weapon.damage}${def.weapon.energy ? ' · без боезапаса, перегрев после 5 выстрелов' : ''}${def.weapon.aura ? ' · лечит союзников рядом' : ''}${def.weapon.infinite ? ' · без боезапаса' : ''} · ${def.weapon.ranged ? 'выстрел' : 'удар'}: ${isTouch ? 'коснитесь противника' : 'нажмите на противника или F'}</div>` : ''}
        ${!def.weapon && block ? `<div class="muted">${block}</div>` : ''}`;
    }
    const c = AB.Chars.get(lead), max = AB.ID.get(lead).stats.maxHp;
    const html = grid + '|' + detail;
    if (html !== lastHtml) { ui.grid.innerHTML = grid; ui.detail.innerHTML = detail; lastHtml = html; }
    ui.owner.textContent = `${AB.ID.get(lead).name} · здоровье ${Math.round(c.hp)} / ${max} · оружие и две вещи в рюкзаке · рюкзаки отряда общие`;
  }

  function onClick(e) {
    const slot = e.target.closest('[data-slot]');
    if (slot) { selected = Number(slot.dataset.slot); render(); return; }
    const act = e.target.closest('[data-inv]');
    if (act && !act.disabled) {
      const lead = L(), s = AB.Inventory.slot(lead, selected);
      if (act.dataset.inv === 'use' && s && AB.Inventory.use(lead, selected)) AB.Bus.emit('iso:toast', { text: `Использовано: ${itemName(s.item)}`, kind: 'good' });
      if (act.dataset.inv === 'give') AB.Inventory.exchange(lead, act.dataset.to, selected);
      if (act.dataset.inv === 'drop' && s && AB.Inventory.drop(lead, selected)) AB.Bus.emit('iso:toast', { text: `Выброшено: ${itemName(s.item)}${s.qty > 1 ? ` ×${s.qty}` : ''}`, kind: 'info' });
      render();
      return;
    }
    if (e.target === ui.box || e.target.closest('[data-inv-close]')) close();
  }

  return { init, open, close, toggle, isOpen, render, select: (i) => { selected = i; if (isOpen()) render(); } };
})();
