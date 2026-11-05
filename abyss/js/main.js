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
    map: $('#map'),
    nav: $('#nav'),
    mini: $('#minimap'),
    death: $('#death'),
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

  // ---------- Инвентарь: два слота — оружие и рюкзак ----------
  let selected = 1;
  const itemName = (id) => AB.ID.get(id).name;
  const SLOT_NAMES = ['Оружие', 'Рюкзак'];

  function renderInventory() {
    const slots = AB.Inventory.slots(HERO);
    const grid = slots.map((s, i) => {
      const label = `<span class="slot-label">${SLOT_NAMES[i]}</span>`;
      if (!s) return `<button class="slot empty ${i === selected ? 'sel' : ''}" data-slot="${i}" aria-label="${SLOT_NAMES[i]}: пусто">${label}</button>`;
      const def = AB.ID.get(s.item);
      const icon = AB.Assets.get(def.icon);
      const face = icon.status === 'ready'
        ? `<img src="${AB.ID.get(def.icon).src}" alt="">`
        : `<b>${def.short}</b>`;
      return `<button class="slot cat-${def.category} ${i === selected ? 'sel' : ''}" data-slot="${i}" aria-label="${SLOT_NAMES[i]}: ${def.name}${s.qty > 1 ? `, ${s.qty} шт.` : ''}">
        ${label}${face}${s.qty > 1 ? `<em>${s.qty}</em>` : ''}</button>`;
    }).join('');
    const s = slots[selected];
    let detail = `<p class="muted">${selected === 0 ? 'Оружия нет. Подберите что-нибудь тяжёлое.' : 'Рюкзак пуст. В нём помещается одна вещь.'}</p>`;
    if (s) {
      const def = AB.ID.get(s.item);
      const block = AB.Inventory.useBlock(HERO, selected);
      detail = `
        <h3>${def.name}${s.qty > 1 ? ` ×${s.qty}` : ''}</h3>
        <p>${def.desc}</p>
        <div class="inv-actions">
          ${def.use ? `<button data-inv="use" ${block ? 'disabled' : ''}>Использовать</button>` : ''}
          <button data-inv="drop" class="ghost">Выбросить</button>
        </div>
        ${def.weapon ? `<div class="muted">В руках · урон ${def.weapon.damage} · удар: ${isTouch ? 'кнопка ⚔' : 'F, J, пробел или клик'}</div>` : ''}
        ${!def.weapon && block ? `<div class="muted">${block}</div>` : ''}`;
    }
    $('#inv-grid').innerHTML = grid;
    $('#inv-detail').innerHTML = detail;
    $('#inv-owner').textContent = `${AB.ID.get(HERO).name} · одна вещь в рюкзаке, оружие отдельно`;
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
        if (s && AB.Inventory.drop(HERO, selected)) toast(`Выброшено: ${itemName(s.item)}${s.qty > 1 ? ` ×${s.qty}` : ''}`, 'info');
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
    if (e.code === 'Escape') { closeInventory(); closeMap(); }
    if (e.code === 'KeyM') { e.preventDefault(); ui.map.hidden ? openMap() : closeMap(); }
  });

  // ---------- Мини-карта текущего помещения ----------
  const mctx = $('#minimap').getContext('2d');
  function drawMinimap() {
    const r = AB.Rooms.room();
    const hero = AB.Chars.get(HERO);
    if (!r || !hero) return;
    const cv = mctx.canvas, dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, W, H);
    const X = (x) => 6 + (x / r.width) * (W - 12);
    const mid = H / 2, t = performance.now() / 1000;
    mctx.fillStyle = 'rgba(255,255,255,.08)';
    mctx.fillRect(6, mid - 4, W - 12, 8);
    for (const d of r.doors) {
      const st = AB.Nav.doorStatus(r.id, d);
      mctx.fillStyle = st.kind === 'locked' ? '#ff4a3a' : st.kind === 'unexplored' ? '#5ee6ff' : '#4bd88a';
      mctx.fillRect(X(d.x) - 2, mid - 8, 4, 16);
    }
    for (const c of r.containers || []) {
      mctx.fillStyle = AB.Rooms.isSearched(r.id, c.key) ? 'rgba(255,255,255,.25)' : '#5ee6ff';
      mctx.fillRect(X(c.x) - 3, mid - 3, 6, 6);
    }
    for (const it of AB.Rooms.worldItems(r.id)) {
      mctx.fillStyle = '#9ff3ff';
      mctx.beginPath(); mctx.arc(X(it.x), mid, 2, 0, 7); mctx.fill();
    }
    for (const e of AB.Enemies.inRoom(r.id)) {
      // противника видно на мини-карте, только когда он обнаружен
      if (e.state === 'DEAD') {
        mctx.strokeStyle = 'rgba(255,255,255,.35)';
        mctx.beginPath(); mctx.moveTo(X(e.x) - 3, mid - 3); mctx.lineTo(X(e.x) + 3, mid + 3); mctx.moveTo(X(e.x) + 3, mid - 3); mctx.lineTo(X(e.x) - 3, mid + 3); mctx.stroke();
      } else if (['ALERT', 'CHASE', 'ATTACK', 'RETREAT', 'INVESTIGATE'].includes(e.state)) {
        mctx.fillStyle = `rgba(255,60,40,${0.6 + Math.sin(t * 8) * 0.4})`;
        mctx.beginPath(); mctx.arc(X(e.x), mid, 4, 0, 7); mctx.fill();
      }
    }
    const hx = X(hero.x);
    mctx.fillStyle = '#fff';
    mctx.beginPath(); mctx.moveTo(hx + hero.facing * 5, mid); mctx.lineTo(hx - hero.facing * 3, mid - 5); mctx.lineTo(hx - hero.facing * 3, mid + 5); mctx.fill();
  }

  let lastNav = '';
  function updateNav() {
    const h = AB.Nav.hint();
    const hero = AB.Chars.get(HERO);
    const show = h && hero && hero.controllable;
    const html = show ? `<b class="${h.kind}">${h.dir < 0 ? '◀' : '▶'}</b> ${h.text} · ${Math.round(h.dist / 10)} м` : '';
    if (html !== lastNav) { ui.nav.innerHTML = html; lastNav = html; }
    ui.nav.classList.toggle('show', !!show);
  }

  // ---------- Карта корабля ----------
  function openMap() {
    if (!ui.inv.hidden) closeInventory();
    const h = AB.Chars.get(HERO);
    if (!h || h.dead) return;
    ui.map.hidden = false;
    AB.Input.lock();
    renderMap();
  }

  function closeMap() {
    if (ui.map.hidden) return;
    ui.map.hidden = true;
    AB.Input.unlock();
  }

  function renderMap() {
    const visited = AB.Rooms.visited();
    const cur = AB.Rooms.current();
    const hero = AB.Chars.get(HERO);
    const goal = AB.Nav.goal();
    const parts = [];
    const rooms = AB.ROOMS.filter((r) => r.map);
    let maxX = 0, maxY = 0;
    const box = (r) => r.map;
    for (const r of rooms) {
      const known = visited.includes(r.id);
      // помещение видно на карте, если в нём были или в него ведёт дверь из посещённого
      const adjacent = !known && rooms.some((o) => visited.includes(o.id) && o.doors.some((d) => d.to === r.id));
      if (!known && !adjacent) continue;
      const m = box(r);
      maxX = Math.max(maxX, m.x + m.w + 70); maxY = Math.max(maxY, m.y + m.h);
      const isCur = r.id === cur;
      parts.push(`<g class="room ${known ? 'known' : 'unknown'} ${isCur ? 'cur' : ''}">
        <rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="3"/>
        <text x="${m.x + m.w / 2}" y="${m.y + m.h / 2 + 1}">${known ? r.name : '?'}</text>
        <text class="id" x="${m.x + m.w / 2}" y="${m.y + m.h + 11}">${known ? r.id : 'не исследовано'}</text>
        ${known ? `<text class="cnt" x="${m.x + 4}" y="${m.y + 9}">${AB.Rooms.worldItems(r.id).length ? `предметов: ${AB.Rooms.worldItems(r.id).length}` : ''}</text>` : ''}
      </g>`);
      if (!known) continue;
      for (const d of r.doors) {
        const dx = m.x + (d.x / r.width) * m.w;
        const st = AB.Nav.doorStatus(r.id, d);
        parts.push(`<rect class="door ${st.kind}" x="${dx - 2}" y="${m.y + m.h / 2 - 7}" width="4" height="14"/>`);
        if (!d.to) {
          // дверь в неизвестность: заглушка справа от помещения
          parts.push(`<g class="room unknown stub"><rect x="${m.x + m.w + 10}" y="${m.y + 4}" width="50" height="${m.h - 8}" rx="3"/>
            <text x="${m.x + m.w + 35}" y="${m.y + m.h / 2 + 1}">?</text></g>
            <line class="link" x1="${dx + 2}" y1="${m.y + m.h / 2}" x2="${m.x + m.w + 10}" y2="${m.y + m.h / 2}"/>`);
        }
        if (goal && goal.roomId === r.id && goal.door.key === d.key) {
          parts.push(`<circle class="goal" cx="${dx}" cy="${m.y + m.h / 2}" r="9"/>`);
        }
      }
      if (isCur && hero) {
        const hx = m.x + (hero.x / r.width) * m.w;
        parts.push(`<circle class="hero" cx="${hx}" cy="${m.y + m.h / 2}" r="3.5"/>`);
      }
    }
    $('#map-svg').setAttribute('viewBox', `-10 -10 ${maxX + 20} ${maxY + 34}`);
    $('#map-svg').innerHTML = parts.join('');
    const h = AB.Nav.hint();
    $('#map-goal').textContent = h ? `Куда дальше: ${h.text}` : 'Все известные проходы исследованы';
  }

  ui.map.addEventListener('click', (e) => { if (e.target === ui.map || e.target.closest('[data-map-close]')) closeMap(); });
  $('#btn-map').addEventListener('click', () => (ui.map.hidden ? openMap() : closeMap()));
  $('#btn-load').addEventListener('click', () => location.reload());
  $('#btn-new').addEventListener('click', () => { AB.Save.clear(); location.reload(); });

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
    if (added) toast(`${AB.ID.get(itemId).weapon ? 'В руках' : 'В рюкзаке'}: ${itemName(itemId)}${added > 1 ? ` ×${added}` : ''}`, 'good');
    else toast('Не помещается');
    AB.Save.save();
  });
  AB.Bus.on('container:looted', ({ label, found, full }) => {
    const list = found.map(([id, n]) => `${itemName(id)} ×${n}`).join(', ');
    toast(found.length ? `${label}: ${list}${full ? ' · остальное оставлено рядом' : ''}` : `${label}: рюкзак занят — находки оставлены рядом`, found.length ? 'good' : 'info');
    AB.Save.save();
  });
  AB.Bus.on('container:empty', ({ label }) => toast(`${label}: пусто`, 'info'));
  AB.Bus.on('char:hp', updateHp);
  AB.Bus.on('combat:noweapon', () => toast('Нечем драться: найдите что-нибудь тяжёлое', 'info'));
  AB.Bus.on('enemy:dead', ({ name }) => { toast(`${name} убит`, 'good'); setTimeout(() => AB.Save.save(), 1800); });
  AB.Bus.on('char:dead', ({ charId }) => {
    if (charId !== HERO) return;
    setTimeout(() => { ui.death.hidden = false; }, 1600);
  });
  AB.Bus.on('item:pickup', ({ itemId, added }) => {
    const def = AB.ID.get(itemId);
    if (added && def.weapon) setTimeout(() => toast(`${def.name} в руках · удар: ${isTouch ? 'кнопка ⚔' : 'F или клик'}`, 'good'), 900);
  });
  // рюкзак на одну вещь: подобрали новую — старая осталась на полу
  AB.Bus.on('inventory:swapped', ({ dropped, taken }) => {
    setTimeout(() => toast(`${itemName(taken)} в ${AB.ID.get(taken).weapon ? 'руках' : 'рюкзаке'} · ${itemName(dropped)} оставлен на полу`, 'info'), 50);
  });
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
      ? '◀ ▶ — идти · <b>»</b> — бег · <b>◉</b> — действие · <b>⚔</b> — удар'
      : '<kbd>A</kbd><kbd>D</kbd> — идти · <kbd>Shift</kbd> — бег · <kbd>E</kbd> — действие · <kbd>F</kbd> — удар · <kbd>I</kbd> — инвентарь · <kbd>M</kbd> — карта';
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
  // ---------- Графика героя: откат на заглушку и выбор костюма ----------
  const HERO_ART = ['ASSET-CHAR001-01', 'ASSET-CHAR001-02'];
  const PREF = 'abyss_hero_art';
  const artOff = () => { try { return localStorage.getItem(PREF) === 'off'; } catch (e) { return false; } };
  function applyHeroArt() {
    const off = artOff();
    HERO_ART.forEach((id) => AB.Assets.setDisabled(id, off));
    $('#btn-hero-art').textContent = `Графика героя: ${off ? 'заглушка' : 'новая'}`;
    const h = AB.Chars.get(HERO);
    $('#btn-hero-suit').textContent = `Костюм: ${h && h.appearance === 'ASSET-CHAR001-02' ? 'повреждённый' : 'обычный'}`;
    $('#btn-hero-suit').disabled = off;
  }
  $('#btn-hero-art').addEventListener('click', () => {
    try { localStorage.setItem(PREF, artOff() ? 'on' : 'off'); } catch (e) { /* без хранилища — только на эту сессию */ }
    applyHeroArt();
  });
  $('#btn-hero-suit').addEventListener('click', () => {
    const h = AB.Chars.get(HERO);
    AB.Chars.setAppearance(HERO, h.appearance === 'ASSET-CHAR001-02' ? 'ASSET-CHAR001-01' : 'ASSET-CHAR001-02');
    applyHeroArt();
    AB.Save.save();
  });
  $('#btn-menu').addEventListener('click', applyHeroArt);

  $('#btn-restart').addEventListener('click', () => {
    AB.Save.clear();
    location.reload();
  });
  if (isTouch) document.body.classList.add('touch');

  // ---------- Нажатие на персонажа: что он несёт ----------
  AB.Input.onScreenTap = (cx, cy) => {
    const id = AB.Render.pick(cx, cy);
    if (!id) return false;
    AB.Render.showCarry(id, AB.Chars.carried(id));
    return true;
  };

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
      AB.Enemies.restore(save.enemies);
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
    applyHeroArt();
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
      if (hero && hero.controllable && !AB.Rooms.inTransition() && AB.Input.consumeAttack()) {
        AB.Combat.attack(HERO);
      }
      AB.Interact.update(dt);
      AB.Combat.update(dt);
      if (!AB.Rooms.inTransition()) AB.Enemies.update(dt);

      AB.Chars.update(dt, AB.Rooms.bounds());
      AB.Anim.update(dt);
      AB.Rooms.update(dt);
      AB.Rooms.tickProps(dt);
      AB.Render.frame(dt);
      updatePrompt();
      drawMinimap();
      updateNav();
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
