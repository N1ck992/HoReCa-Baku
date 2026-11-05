// =====================================================================
// Точка входа: запуск модулей, игровой цикл, интерфейс поверх canvas.
// =====================================================================

(() => {
  const $ = (s) => document.querySelector(s);
  const HERO = 'CHAR-001';
  const isTouch = matchMedia('(pointer: coarse)').matches;

  // ---------- Интерфейс ----------
  const ui = {
    room: $('#hud-room'),
    prompt: $('#prompt'),
    hint: $('#hint'),
    toast: $('#toast'),
    skip: $('#btn-skip'),
    ids: $('#btn-ids'),
    title: $('#title'),
    hp: $('#hud-hp'),
    inv: $('#inventory'),
  };
  let toastTimer = null;

  function toast(text, kind = 'bad') {
    ui.toast.textContent = text;
    ui.toast.className = `show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2400);
  }

  function updateHp() {
    const h = AB.Chars.get(HERO);
    if (!h) return;
    const max = AB.ID.get(HERO).stats.maxHp;
    ui.hp.innerHTML = `<i style="width:${(h.hp / max) * 100}%"></i><span>${Math.round(h.hp)} / ${max}</span>`;
    ui.hp.classList.toggle('low', h.hp / max < 0.35);
  }

  // ---------- Инвентарь ----------
  let selected = 0;
  const itemName = (id) => AB.ID.get(id).name;

  function renderInventory() {
    const slots = AB.Inventory.slots(HERO);
    const grid = slots.map((s, i) => {
      if (!s) return `<button class="slot empty ${i === selected ? 'sel' : ''}" data-slot="${i}" aria-label="Пустая ячейка"></button>`;
      const def = AB.ID.get(s.item);
      const icon = AB.Assets.get(def.icon);
      const face = icon.status === 'ready'
        ? `<img src="${AB.ID.get(def.icon).src}" alt="">`
        : `<b>${def.short}</b><small>${def.icon}</small>`;
      return `<button class="slot cat-${def.category} ${i === selected ? 'sel' : ''}" data-slot="${i}" aria-label="${def.name}, ${s.qty} шт.">
        ${face}<em>${s.qty}</em></button>`;
    }).join('');
    const s = slots[selected];
    let detail = '<p class="muted">Ячейка пуста.</p>';
    if (s) {
      const def = AB.ID.get(s.item);
      const block = AB.Inventory.useBlock(HERO, selected);
      detail = `
        <h3>${def.name}</h3>
        <div class="muted ids">${def.id} · ${def.icon}</div>
        <p>${def.desc}</p>
        <div class="muted">В ячейке: ${s.qty} из ${def.stack} · всего: ${AB.Inventory.count(HERO, s.item)}</div>
        <div class="inv-actions">
          <button data-inv="use" ${block ? 'disabled' : ''}>Использовать</button>
          <button data-inv="drop" class="ghost">Выбросить</button>
        </div>
        ${block && def.use ? `<div class="muted">${block}</div>` : ''}`;
    }
    $('#inv-grid').innerHTML = grid;
    $('#inv-detail').innerHTML = detail;
    $('#inv-owner').textContent = `${AB.ID.get(HERO).name} · ${HERO}`;
    updateHp();
  }

  function openInventory() {
    const h = AB.Chars.get(HERO);
    if (!h || !h.controllable || AB.Rooms.inTransition() || AB.Interact.isSearching()) return;
    ui.inv.hidden = false;
    AB.Input.lock();
    renderInventory();
  }

  function closeInventory() {
    if (ui.inv.hidden) return;
    ui.inv.hidden = true;
    AB.Input.unlock();
  }

  ui.inv.addEventListener('click', (e) => {
    const slot = e.target.closest('[data-slot]');
    if (slot) { selected = Number(slot.dataset.slot); renderInventory(); return; }
    const act = e.target.closest('[data-inv]');
    if (act && !act.disabled) {
      if (act.dataset.inv === 'use' && AB.Inventory.use(HERO, selected)) toast('Медикаменты использованы', 'good');
      if (act.dataset.inv === 'drop') {
        const s = AB.Inventory.slot(HERO, selected);
        if (s && AB.Inventory.drop(HERO, selected)) toast(`Выброшено: ${itemName(s.item)} ×${s.qty}`, 'info');
      }
      renderInventory();
      AB.Save.save();
      return;
    }
    if (e.target === ui.inv || e.target.closest('[data-inv-close]')) closeInventory();
  });
  $('#btn-inv').addEventListener('click', () => (ui.inv.hidden ? openInventory() : closeInventory()));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); ui.inv.hidden ? openInventory() : closeInventory(); }
    if (e.code === 'Escape') closeInventory();
  });

  function showRoom(roomId) {
    const r = AB.ID.get(roomId);
    ui.room.innerHTML = `<b>${r.name}</b><span>${r.id}</span>`;
    ui.room.classList.remove('flash');
    void ui.room.offsetWidth;
    ui.room.classList.add('flash');
  }

  let lastPrompt = '';
  function updatePrompt() {
    const hero = AB.Chars.get(HERO);
    const p = hero && !AB.Rooms.inTransition() && ui.inv.hidden && (hero.controllable || AB.Interact.isSearching())
      ? AB.Interact.prompt(HERO) : null;
    if (!p) { ui.prompt.classList.remove('show'); lastPrompt = ''; return; }
    const key = isTouch ? '◉' : 'E';
    const html = p.progress !== undefined
      ? `${p.label}<span class="bar"><i style="width:${Math.round(p.progress * 100)}%"></i></span>`
      : `<kbd class="${p.ok ? '' : 'no'}">${key}</kbd> ${p.label}`;
    if (html !== lastPrompt) { ui.prompt.innerHTML = html; lastPrompt = html; }
    ui.prompt.classList.add('show');
  }

  // ---------- События модулей ----------
  AB.Bus.on('room:enter', ({ roomId }) => { showRoom(roomId); AB.Save.save(); });
  AB.Bus.on('door:denied', ({ reason }) => toast(reason));
  AB.Bus.on('item:pickup', ({ itemId, added, left }) => {
    if (added) toast(`+${added} ${itemName(itemId)}${left ? ' · инвентарь заполнен' : ''}`, left ? 'info' : 'good');
    else toast('Инвентарь заполнен');
    AB.Save.save();
  });
  AB.Bus.on('container:looted', ({ label, found, full }) => {
    const list = found.map(([id, n]) => `${itemName(id)} ×${n}`).join(', ');
    toast(found.length ? `${label}: ${list}${full ? ' · не всё поместилось' : ''}` : `${label}: инвентарь заполнен`, found.length ? 'good' : 'bad');
    AB.Save.save();
  });
  AB.Bus.on('container:empty', ({ label }) => toast(`${label}: пусто`, 'info'));
  AB.Bus.on('char:hp', updateHp);
  AB.Bus.on('transition:end', () => { const h = AB.Chars.get(HERO); if (h) h.controllable = true; });
  // после выхода из капсулы герой остаётся там, где закончилась анимация
  function finishWake(charId) {
    const h = AB.Chars.get(charId);
    const tr = AB.Anim.current(charId);
    if (!h || !tr || tr.action !== 'wake' || h.wakeDone) return;
    h.wakeDone = true;
    h.x += 70 * h.facing;
    h.action = 'idle';
    AB.Anim.play(charId, 'idle', { restart: true });
  }
  AB.Bus.on('anim:end', ({ charId, action }) => { if (action === 'wake') finishWake(charId); });
  let skipRequested = false;
  AB.Bus.on('ui:hint', (kind) => {
    if (kind !== 'move') return;
    ui.hint.innerHTML = isTouch
      ? 'Кнопки ◀ ▶ — идти · <b>»</b> — бег · <b>◉</b> — действие'
      : '<kbd>A</kbd><kbd>D</kbd> или <kbd>←</kbd><kbd>→</kbd> — идти · <kbd>Shift</kbd> — бег · <kbd>E</kbd> — действие';
    ui.hint.classList.add('show');
    setTimeout(() => ui.hint.classList.remove('show'), 7000);
  });
  AB.Bus.on('event:start', () => ui.skip.hidden = false);
  AB.Bus.on('event:end', () => { ui.skip.hidden = true; AB.Save.save(); });

  ui.skip.addEventListener('click', () => { AB.Story.skip(); skipRequested = true; ui.title.remove(); });
  ui.ids.addEventListener('click', () => {
    const on = AB.Render.toggleIds();
    ui.ids.classList.toggle('on', on);
  });
  $('#btn-menu').addEventListener('click', () => $('#menu').hidden = false);
  $('#btn-close-menu').addEventListener('click', () => $('#menu').hidden = true);
  $('#btn-restart').addEventListener('click', () => {
    AB.Save.clear();
    location.reload();
  });
  if (isTouch) document.body.classList.add('touch');

  // ---------- Запуск ----------
  function boot() {
    AB.Assets.load();
    AB.Input.init();
    AB.Render.init($('#screen'));

    const save = AB.Save.load();
    if (save) {
      AB.Chars.restore(save.chars);
      AB.Rooms.restore(save.rooms);
      AB.Story.restore(save.story);
      AB.Inventory.restore(save.inventory);
      const hero = AB.Chars.get(HERO);
      AB.Rooms.enter(save.rooms.current || 'ROOM-001', { x: hero ? hero.x : null });
      if (hero) hero.controllable = true;
      ui.title.remove();
    } else {
      const start = AB.ID.get('ROOM-001');
      AB.Chars.spawn(HERO, { room: start.id, x: start.spawn.x });
      AB.Rooms.setPropState('ROOM-001:cryopod-main', 'closed');
      AB.Rooms.enter('ROOM-001');
      AB.Story.trigger('new_game');
      ui.title.classList.add('play');
      setTimeout(() => ui.title.remove(), 6500);
    }
    AB.Render.snapCamera();
    ui.ids.classList.toggle('on', AB.Render.idsShown());
    updateHp();

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      AB.Story.update(dt);
      if (skipRequested) { skipRequested = false; finishWake(HERO); }

      const hero = AB.Chars.get(HERO);
      if (hero && hero.controllable && !AB.Rooms.inTransition() && AB.Input.consumeAction()) {
        AB.Interact.act(HERO);
      }
      AB.Interact.update(dt);

      AB.Chars.update(dt, AB.Rooms.bounds());
      AB.Anim.update(dt);
      AB.Rooms.update(dt);
      AB.Rooms.tickProps(dt);
      AB.Render.frame(dt);
      updatePrompt();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    setInterval(() => AB.Save.save(), 10000);
    window.addEventListener('pagehide', () => AB.Save.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) AB.Save.save(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
