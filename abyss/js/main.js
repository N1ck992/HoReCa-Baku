// =====================================================================
// Точка входа: запуск модулей, игровой цикл, интерфейс поверх canvas.
// =====================================================================

(() => {
  const $ = (s) => document.querySelector(s);
  const MARK = 'CHAR-001';
  const L = () => AB.Party.leader();   // кем сейчас управляет игрок (ведущий группы)
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
    quest: $('#hud-quest'),
    ammo: $('#hud-ammo'),
    boss: $('#bossbar'),
    actEnd: $('#act-end'),
    party: $('#party'),
    reader: $('#reader'),
    journal: $('#journal'),
    arena: $('#arena-hud'),
    doorMenu: $('#door-menu'),
    zoom: $('#zoom'),
    perks: $('#perks'),
  };
  ui.prompt.addEventListener('pointerdown', (e) => { e.preventDefault(); if (e.target.closest('[data-alt]')) AB.Input.queueAlt(); else AB.Input.queueAction(); });
  ui.party.addEventListener('click', (e) => {
    const ord = e.target.closest('[data-ord]');
    if (ord) { AB.Arena.order(ord.closest('[data-char]').dataset.char, { type: ord.dataset.ord }); return; }
    const b = e.target.closest('[data-char]');
    if (b && !AB.Party.isLeader(b.dataset.char)) switchLeader(b.dataset.char);
  });
  let toastTimer = null;

  function toast(text, kind = 'bad') {
    ui.toast.textContent = text;
    ui.toast.className = `show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2400);
  }

  function updateHp() {
    const h = AB.Chars.get(L());
    if (!h) return;
    const max = AB.ID.get(L()).stats.maxHp;
    ui.hp.innerHTML = `<i style="width:${(h.hp / max) * 100}%"></i><span>${Math.round(h.hp)} / ${max}</span>`;
    ui.hp.classList.toggle('low', h.hp / max < 0.35);
  }

  // ---------- Группа: кто ведёт, здоровье, оружие и рюкзак каждого ----------
  function switchLeader(id) {
    const list = AB.Party.members();
    if (list.length < 2) return;
    const to = id || list[1].id;
    const block = AB.Party.switchBlock(to);
    if (block) { toast(`${AB.ID.get(to).name}: ${block.charAt(0).toLowerCase()}${block.slice(1)}`, 'info'); return; }
    AB.Party.setLeader(to);
  }
  let lastParty = '';
  // в боевой локации на карточке ведомого — его приказ; нажатие: «за мной» ⇄ «стоять»
  function ordTag(c, lead) {
    if (lead || !AB.Arena.active()) return '';
    const o = c.order || { type: 'follow' };
    if (o.type === 'guard') {
      const d = AB.Arena.doors().find((q) => q.key === o.door);
      return ` <em class="ord guard" data-ord="follow" title="Снять с двери — за мной">${o.task ? '⚙' : '⛨'} ${d ? d.key : ''}</em>`;
    }
    return o.type === 'hold'
      ? ' <em class="ord hold" data-ord="follow" title="Стоит на месте. Нажмите — за мной">▣ стоит</em>'
      : ' <em class="ord" data-ord="hold" title="Идёт за ведущим. Нажмите — стоять здесь">» за мной</em>';
  }
  function updateParty() {
    const list = AB.Party.members();
    const chip = (s) => {
      if (!s) return '<u class="empty">—</u>';
      const d = AB.ID.get(s.item);
      return `<u title="${d.name}" class="${s.over ? 'hot' : ''}">${d.short}${s.ammo != null ? ` ${s.ammo}` : s.qty > 1 ? ` ×${s.qty}` : ''}</u>`;
    };
    const html = list.length < 2 ? '' : list.map((c) => {
      const d = AB.ID.get(c.id), lead = AB.Party.isLeader(c.id);
      return `<button class="pm ${lead ? 'lead' : ''}" data-char="${c.id}" aria-pressed="${lead}" title="${lead ? 'Ведёт группу' : `Передать управление (${isTouch ? 'нажмите' : 'Q'})`}">
        <b>${d.name}${ordTag(c, lead)}</b><span>${chip(AB.Inventory.weapon(c.id))}${AB.Inventory.packs(c.id).map(chip).join('')}</span>
        <i style="width:${Math.round((c.hp / d.stats.maxHp) * 100)}%"></i></button>`;
    }).join('');
    if (html !== lastParty) { ui.party.innerHTML = html; lastParty = html; }
    ui.party.hidden = !html;
    document.body.classList.toggle('has-party', !!html);
  }

  // ---------- Патроны дальнобойного оружия и полоса босса ----------
  function updateCombatHud() {
    // плазмомёт: шкала нагрева; старое оружие — счётчик зарядов
    const ht = AB.Inventory.heat(L()), a = AB.Inventory.ammo(L());
    ui.ammo.hidden = !ht && a == null;
    if (ht) {
      const html = ht.over ? '<span>ПЕРЕГРЕВ</span><i><b style="width:' + Math.round(ht.heat * 100) + '%"></b></i>'
        : '<span>Плазма</span><i><b style="width:' + Math.round(ht.heat * 100) + '%"></b></i>';
      if (ui.ammo.innerHTML !== html) ui.ammo.innerHTML = html;
      ui.ammo.classList.toggle('low', ht.over);
      ui.ammo.classList.add('heat');
    } else if (a != null) {
      const txt = `Заряды: ${a}`;
      if (ui.ammo.textContent !== txt) ui.ammo.textContent = txt;
      ui.ammo.classList.toggle('low', a === 0);
      ui.ammo.classList.remove('heat');
    }
    const boss = AB.Enemies.inRoom(AB.Rooms.current())
      .find((s) => AB.ID.get(s.id).type === 'boss' && s.state !== 'DORMANT' && s.state !== 'DEAD');
    ui.boss.hidden = !boss;
    if (boss) {
      const def = AB.ID.get(boss.id);
      ui.boss.querySelector('b').textContent = def.name;
      ui.boss.querySelector('i').style.width = `${Math.max(0, boss.hp / def.hp) * 100}%`;
    }
  }

  // ---------- Инвентарь: два слота — оружие и рюкзак ----------
  let selected = 1;
  const itemName = (id) => AB.ID.get(id).name;
  const SLOT_NAMES = ['Оружие', 'Рюкзак', 'Рюкзак'];

  function renderInventory() {
    const slots = AB.Inventory.slots(L());
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
    // обмен с остальными в группе: тот же слот у каждого
    const swaps = AB.Party.members().filter((m) => m.id !== L()).map((m) => {
      const os = AB.Inventory.slot(m.id, selected);
      if (!s && !os) return '';
      const name = AB.ID.get(m.id).name;
      const block = AB.Inventory.exchangeBlock(L(), m.id, selected);
      const label = s && os ? `Обменяться ⇄ ${name}: ${itemName(os.item)}` : s ? `Отдать → ${name}` : `Взять ← ${name}: ${itemName(os.item)}`;
      return `<button data-inv="give" data-to="${m.id}" ${block ? `disabled title="${block}"` : ''}>${label}</button>${block ? `<div class="muted">${block}</div>` : ''}`;
    }).join('');
    let detail = `<p class="muted">${selected === 0 ? 'Оружия нет. Подберите что-нибудь тяжёлое.' : 'Свободное место в рюкзаке. Вещи в рюкзаках общие: оборудование возьмёт нужную у любого из группы рядом.'}</p>${swaps ? `<div class="inv-actions">${swaps}</div>` : ''}`;
    if (s) {
      const def = AB.ID.get(s.item);
      const block = AB.Inventory.useBlock(L(), selected);
      detail = `
        <h3>${def.name}${s.qty > 1 ? ` ×${s.qty}` : ''}</h3>
        <p>${def.desc}</p>
        <div class="inv-actions">
          ${def.use ? `<button data-inv="use" ${block ? 'disabled' : ''}>Использовать</button>` : ''}
          <button data-inv="drop" class="ghost">Выбросить</button>
          ${swaps}
        </div>
        ${def.weapon ? `<div class="muted">В руках · урон ${def.weapon.damage}${def.weapon.energy ? ' · без боезапаса, перегрев после 5 выстрелов' : ''}${def.weapon.aura ? ' · лечит союзников рядом' : ''}${def.weapon.infinite ? ' · без боезапаса' : ''} · ${def.weapon.ranged ? 'выстрел' : 'удар'}: ${isTouch ? 'кнопка ⚔' : 'F, J, пробел или клик'}</div>` : ''}
        ${!def.weapon && block ? `<div class="muted">${block}</div>` : ''}`;
    }
    $('#inv-grid').innerHTML = grid;
    $('#inv-detail').innerHTML = detail;
    $('#inv-owner').textContent = `${AB.ID.get(L()).name} · оружие и две вещи в рюкзаке · рюкзаки группы общие`;
    updateHp();
  }

  function openInventory() {
    const h = AB.Chars.get(L());
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
      if (act.dataset.inv === 'use' && AB.Inventory.use(L(), selected)) toast('Медикаменты использованы', 'good');
      if (act.dataset.inv === 'give') AB.Inventory.exchange(L(), act.dataset.to, selected);
      if (act.dataset.inv === 'drop') {
        const s = AB.Inventory.slot(L(), selected);
        if (s && AB.Inventory.drop(L(), selected)) toast(`Выброшено: ${itemName(s.item)}${s.qty > 1 ? ` ×${s.qty}` : ''}`, 'info');
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
    if (!ui.reader.hidden && ['KeyE', 'Enter', 'Escape', 'Space'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); closeReader(); return; }
    if (e.code === 'Escape') { closeInventory(); closeMap(); closeJournal(); }
    if (e.code === 'KeyL') { e.preventDefault(); ui.journal.hidden ? openJournal() : closeJournal(); }
    if (e.code === 'KeyM') { e.preventDefault(); ui.map.hidden ? openMap() : closeMap(); }
  });

  // ---------- Мини-карта текущего помещения ----------
  const mctx = $('#minimap').getContext('2d');
  function drawMinimap() {
    const r = AB.Rooms.room();
    const hero = AB.Chars.get(L());
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
    for (const lg of AB.Logs.inRoom(r.id)) {
      if (lg.read) continue;
      mctx.fillStyle = '#5ee6ff';
      mctx.save(); mctx.translate(X(lg.x), mid); mctx.rotate(Math.PI / 4); mctx.fillRect(-2.5, -2.5, 5, 5); mctx.restore();
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
    const hero = AB.Chars.get(L());
    const show = h && hero && hero.controllable;
    const html = show ? `<b class="${h.kind}">${h.dir < 0 ? '◀' : '▶'}</b> ${h.text} · ${Math.round(h.dist / 10)} м` : '';
    if (html !== lastNav) { ui.nav.innerHTML = html; lastNav = html; }
    ui.nav.classList.toggle('show', !!show);
  }

  // ---------- Карта корабля ----------
  function openMap() {
    if (!ui.inv.hidden) closeInventory();
    const h = AB.Chars.get(L());
    if (!h || h.dead) return;
    // карта — прозрачная поверх игры, игра не останавливается (дополнение №38)
    ui.map.hidden = false;
    renderMap();
    clearInterval(mapTimer);
    mapTimer = setInterval(() => { if (!ui.map.hidden) renderMap(); }, 350);
  }
  let mapTimer = null;

  function closeMap() {
    if (ui.map.hidden) return;
    ui.map.hidden = true;
    clearInterval(mapTimer);
  }

  function renderMap() {
    const visited = AB.Rooms.visited();
    const cur = AB.Rooms.current();
    const hero = AB.Chars.get(L());
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
        if ((d.kind === 'hatch' || d.kind === 'ladder') && d.to) {
          // люк/лестница: вертикальная связь между палубами
          const tr = AB.ID.get(d.to), conn = (r.connections || []).find((c) => c.door === d.key);
          const td = tr && tr.map && conn && (tr.doors || []).find((q) => q.key === conn.toDoor);
          if (td && (visited.includes(tr.id) || st.kind !== 'locked')) {
            const tx = tr.map.x + (td.x / tr.width) * tr.map.w;
            const y1 = m.y + (d.kind === 'hatch' ? m.h : 0), y2 = tr.map.y + (d.kind === 'hatch' ? 0 : tr.map.h);
            parts.push(`<line class="shaft" x1="${dx}" y1="${y1}" x2="${tx}" y2="${y2}"/>`);
          }
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

  ui.map.addEventListener('click', (e) => { if (e.target.closest('[data-map-close]')) closeMap(); });
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
    const hero = AB.Chars.get(L());
    const p = hero && !AB.Rooms.inTransition() && ui.inv.hidden && (hero.controllable || AB.Interact.isSearching())
      ? AB.Interact.prompt(L()) : null;
    if (!p) { ui.prompt.classList.remove('show'); lastPrompt = ''; return; }
    // на телефоне подсказка — это и есть кнопка действия
    const html = p.progress !== undefined
      ? `${p.label}<span class="bar"><i style="width:${Math.round(p.progress * 100)}%"></i></span>`
      : (isTouch ? p.label : `<kbd class="${p.ok ? '' : 'no'}">E</kbd> ${p.label}`)
        + (p.alt ? ` <button class="alt" data-alt>${isTouch ? '' : '<kbd>R</kbd> '}${p.alt}</button>` : '');
    ui.prompt.classList.toggle('no', !p.ok);
    if (html !== lastPrompt) { ui.prompt.innerHTML = html; lastPrompt = html; }
    ui.prompt.classList.add('show');
  }

  // ---------- События модулей ----------
  AB.Bus.on('room:enter', ({ roomId }) => { showRoom(roomId); AB.Save.save(); });
  AB.Bus.on('door:denied', ({ reason }) => toast(reason));
  AB.Bus.on('equip:shared', ({ from, itemId }) => toast(`${itemName(itemId)} — из рюкзака: ${AB.ID.get(from).name}`, 'info'));
  AB.Bus.on('item:pickup', ({ charId, itemId, added, left }) => {
    if (added) toast(`${charId !== L() ? `${AB.ID.get(charId).name} несёт · ` : ''}${AB.ID.get(itemId).weapon ? 'В руках' : 'В рюкзаке'}: ${itemName(itemId)}${added > 1 ? ` ×${added}` : ''}`, 'good');
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
  // ---------- Находки: чтение и журнал ----------
  const LOG_KIND = { pad: 'Текстовая запись', terminal: 'Запись терминала', audio: 'Аудиозапись · расшифровка', trace: 'Находка', tag: 'Находка' };
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function openReader(id) {
    const l = AB.ID.get(id);
    const cat = AB.LOG_CATEGORIES.find((c) => c.id === l.cat);
    $('#reader-kind').textContent = `${LOG_KIND[l.form] || 'Запись'} · ${cat ? cat.name : ''}`;
    $('#reader-title').textContent = l.title;
    $('#reader-meta').textContent = [l.author, l.when].filter((v) => v && v !== '—').join(' · ');
    $('#reader-text').innerHTML = l.text.split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    $('#reader-foot').textContent = `${l.id} · найдено ${AB.Logs.found().length} из ${AB.Logs.total()}${l.pending ? ' · черновик текста' : ''}`;
    ui.reader.classList.toggle('audio', l.form === 'audio');
    ui.reader.hidden = false;
    AB.Input.lock();
  }
  function closeReader() {
    if (ui.reader.hidden) return;
    ui.reader.hidden = true;
    if (ui.journal.hidden) AB.Input.unlock();
  }
  function renderJournal() {
    const found = AB.Logs.found();
    $('#journal-count').textContent = `Найдено ${found.length} из ${AB.Logs.total()}`;
    $('#journal-list').innerHTML = AB.LOG_CATEGORIES.map((c) => {
      const all = AB.LOGS.filter((l) => l.cat === c.id), mine = all.filter((l) => AB.Logs.isFound(l.id));
      const rows = all.map((l) => AB.Logs.isFound(l.id)
        ? `<button class="jl" data-log="${l.id}"><b>${esc(l.title)}</b><span>${esc(AB.ID.get(l.room || AB.ID.get(l.from).spawn.room).name)}</span></button>`
        : '<div class="jl unknown">— не найдено —</div>').join('');
      return `<section><h3>${c.name} <em>${mine.length}/${all.length}</em></h3>${rows}</section>`;
    }).join('');
  }
  function openJournal() {
    const h = AB.Chars.get(L());
    if (!h || h.dead || !ui.inv.hidden || !ui.map.hidden) return;
    renderJournal();
    ui.journal.hidden = false;
    AB.Input.lock();
  }
  function closeJournal() {
    if (ui.journal.hidden) return;
    ui.journal.hidden = true;
    if (ui.reader.hidden) AB.Input.unlock();
  }
  AB.Bus.on('log:open', ({ id }) => setTimeout(() => openReader(id), 260));
  AB.Bus.on('log:found', ({ title, count, total }) => { toast(`Новая запись (${count}/${total}): ${title}`, 'good'); AB.Save.save(); });
  ui.reader.addEventListener('click', (e) => { if (e.target === ui.reader || e.target.closest('[data-reader-close]') || !ui.journal.hidden) closeReader(); });
  ui.journal.addEventListener('click', (e) => {
    const b = e.target.closest('[data-log]');
    if (b) { openReader(b.dataset.log); return; }
    if (e.target === ui.journal || e.target.closest('[data-journal-close]')) closeJournal();
  });
  $('#btn-logs').addEventListener('click', () => (ui.journal.hidden ? openJournal() : closeJournal()));

  AB.Bus.on('combat:noweapon', () => toast('Нечем драться: найдите что-нибудь тяжёлое', 'info'));
  AB.Bus.on('enemy:dead', ({ id, name }) => { if (String(id).includes('~')) return; toast(`${name} убит`, 'good'); setTimeout(() => AB.Save.save(), 1800); });
  AB.Bus.on('char:dead', ({ charId }) => {
    if (charId !== MARK && charId !== 'CHAR-002') return;
    // гибель Марка или спутницы — конец: загрузка последнего сохранения
    $('#death h2').textContent = charId === MARK ? 'Вы погибли' : 'Её больше нет';
    const h = AB.Chars.get(L()); if (h) h.controllable = false;
    setTimeout(() => { ui.death.hidden = false; }, 1600);
  });
  AB.Bus.on('party:leader', ({ id }) => {
    toast(`Ведёт группу: ${AB.ID.get(id).name}`, 'info');
    updateHp();
    if (!ui.inv.hidden) renderInventory();
  });
  AB.Bus.on('combat:noammo', ({ charId }) => charId === L() && toast('Зарядов нет — удар прикладом', 'info'));
  AB.Bus.on('weapon:overheat', ({ charId }) => charId === L() && toast('Плазмомёт перегрет — пара секунд на остывание', 'info'));
  AB.Bus.on('inventory:exchange', ({ fromId, toId, given, taken }) => {
    const to = AB.ID.get(toId).name;
    toast(given && taken ? `Обмен с ${to}: ${itemName(given)} ⇄ ${itemName(taken)}` : given ? `${to} получает: ${itemName(given)}` : `Взято у ${to}: ${itemName(taken)}`, 'good');
  });
  AB.Bus.on('item:given', ({ itemId, onFloor }) => setTimeout(() => toast(`Доктор Хейл: ${itemName(itemId)}${onFloor ? ' — рюкзак занят, оставлено рядом' : ' — в рюкзаке'}`, 'good'), 200));
  AB.Bus.on('npc:talk', ({ healed }) => { if (healed) toast('Доктор Хейл перевязал раны', 'good'); });
  // ---------- Конец акта ----------
  AB.Bus.on('act:end', ({ act }) => {
    const h = AB.Chars.get(L()); if (h) h.controllable = false;
    AB.Save.save();
    ui.actEnd.querySelector('.act-no').textContent = `Конец ${act === 1 ? 'первого' : act} акта`;
    ui.actEnd.hidden = false;
  });
  $('#btn-act-continue').addEventListener('click', () => {
    ui.actEnd.hidden = true;
    const h = AB.Chars.get(L()); if (h) h.controllable = true;
  });
  $('#btn-act-new').addEventListener('click', () => { AB.Save.clear(); location.reload(); });
  AB.Bus.on('enemy:retreat', ({ id }) => { if (AB.ID.get(id).type === 'pursuer') toast('Он отступил в темноту', 'info'); });
  AB.Bus.on('quest:done', ({ id }) => {
    if (id === 'QUEST-002') setTimeout(() => toast('Безопасная зона: переборки заблокированы изнутри', 'good'), 1400);
  });
  AB.Bus.on('item:pickup', ({ itemId, added }) => {
    const def = AB.ID.get(itemId);
    if (added && def.weapon) setTimeout(() => toast(`${def.name} в руках · удар: ${isTouch ? 'кнопка ⚔' : 'F или клик'}`, 'good'), 900);
  });
  // рюкзак на одну вещь: подобрали новую — старая осталась на полу
  AB.Bus.on('inventory:swapped', ({ dropped, taken }) => {
    setTimeout(() => toast(`${itemName(taken)} в ${AB.ID.get(taken).weapon ? 'руках' : 'рюкзаке'} · на полу: ${itemName(dropped)}`, 'info'), 50);
  });
  AB.Bus.on('transition:end', () => { const h = AB.Chars.get(L()); if (h) h.controllable = true; });
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
    if (kind === 'protect') {
      ui.hint.innerHTML = `Защитите её: бейте нападающего (${isTouch ? '⚔' : '<kbd>F</kbd>'}) или уведите её в командный центр`;
      ui.hint.classList.add('show');
      setTimeout(() => ui.hint.classList.remove('show'), 6000);
      return;
    }
    if (kind === 'boss') {
      ui.hint.innerHTML = `Колосс: броня держит удары трубы — стреляйте плазмой (${isTouch ? '⚔' : '<kbd>F</kbd>'}) и держите дистанцию`;
      ui.hint.classList.add('show');
      setTimeout(() => ui.hint.classList.remove('show'), 7000);
      return;
    }
    if (kind !== 'move') return;
    ui.hint.innerHTML = isTouch
      ? 'Джойстик слева — идти, дальше от центра — бег · подсказка по центру — действие · бой — сам (или <b>⚔</b>)'
      : '<kbd>A</kbd><kbd>D</kbd> — идти · <kbd>Shift</kbd> — бег · <kbd>E</kbd> — действие · <kbd>F</kbd> — удар (бой идёт и сам) · <kbd>I</kbd> — инвентарь · <kbd>M</kbd> — карта · <kbd>L</kbd> — записи';
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
  const afBtn = $('#btn-autofight');
  const afLabel = () => { afBtn.textContent = `Автобой: ${AB.Party.autoFight() ? 'включён' : 'выключен'}`; };
  afBtn.addEventListener('click', () => { AB.Party.setAutoFight(!AB.Party.autoFight()); afLabel(); });
  afLabel();
  // ---------- Графика героя: откат на заглушку и выбор костюма ----------
  const HERO_ART = ['ASSET-CHAR001-01', 'ASSET-CHAR001-02'];
  const PREF = 'abyss_hero_art';
  const artOff = () => { try { return localStorage.getItem(PREF) === 'off'; } catch (e) { return false; } };
  function applyHeroArt() {
    const off = artOff();
    HERO_ART.forEach((id) => AB.Assets.setDisabled(id, off));
    $('#btn-hero-art').textContent = `Графика героя: ${off ? 'заглушка' : 'новая'}`;
    const h = AB.Chars.get(MARK);
    $('#btn-hero-suit').textContent = `Костюм: ${h && h.appearance === 'ASSET-CHAR001-02' ? 'повреждённый' : 'обычный'}`;
    $('#btn-hero-suit').disabled = off;
  }
  $('#btn-hero-art').addEventListener('click', () => {
    try { localStorage.setItem(PREF, artOff() ? 'on' : 'off'); } catch (e) { /* без хранилища — только на эту сессию */ }
    applyHeroArt();
  });
  $('#btn-hero-suit').addEventListener('click', () => {
    const h = AB.Chars.get(MARK);
    AB.Chars.setAppearance(MARK, h.appearance === 'ASSET-CHAR001-02' ? 'ASSET-CHAR001-01' : 'ASSET-CHAR001-02');
    applyHeroArt();
    AB.Save.save();
  });
  $('#btn-menu').addEventListener('click', applyHeroArt);

  $('#btn-restart').addEventListener('click', () => {
    AB.Save.clear();
    location.reload();
  });
  if (isTouch) document.body.classList.add('touch');

  // ---------- Диалог ----------
  const dlg = $('#dialog');
  let typeTimer = null;
  function showLine(l) {
    dlg.hidden = false;
    dlg.classList.toggle('mark', l.speaker === MARK);
    dlg.querySelector('.dlg-name').textContent = l.name;
    const txt = dlg.querySelector('.dlg-text');
    // печатаем текст по буквам
    clearInterval(typeTimer);
    let n = 0;
    txt.textContent = '';
    dlg.dataset.typing = '1';
    typeTimer = setInterval(() => {
      n++;
      txt.textContent = l.text.slice(0, n);
      if (n >= l.text.length) { clearInterval(typeTimer); dlg.dataset.typing = ''; }
    }, 28);
    dlg.dataset.full = l.text;
    dlg.querySelector('.dlg-next').textContent = `${l.last ? 'закрыть' : 'дальше'}: ${isTouch ? 'нажмите' : 'E'}`;
  }
  function advanceDialog() {
    if (!AB.Dialog.isOpen()) return false;
    if (dlg.dataset.typing) {
      // сначала дописать строку целиком
      clearInterval(typeTimer);
      dlg.querySelector('.dlg-text').textContent = dlg.dataset.full;
      dlg.dataset.typing = '';
      return true;
    }
    AB.Dialog.next();
    return true;
  }
  AB.Bus.on('dialog:line', showLine);
  AB.Bus.on('dialog:end', () => { clearInterval(typeTimer); dlg.hidden = true; });
  dlg.addEventListener('click', advanceDialog);
  window.addEventListener('keydown', (e) => {
    if (!AB.Dialog.isOpen() || e.repeat) return;
    if (['KeyE', 'Enter', 'Space', 'KeyF'].includes(e.code)) { e.preventDefault(); advanceDialog(); }
  });
  document.querySelectorAll('[data-touch="action"]').forEach((b) => b.addEventListener('pointerdown', advanceDialog));

  // ---------- Задание в интерфейсе ----------
  let lastQuest = '';
  function updateQuest() {
    const q = AB.Quests.current();
    const html = q ? `<div class="q-name">${q.name}</div>${q.objectives.map((o) => `<div class="q-obj ${o.ok ? 'ok' : ''}">${o.text}</div>`).join('')}` : '';
    if (html !== lastQuest) { ui.quest.innerHTML = html; lastQuest = html; }
  }
  AB.Bus.on('quest:start', ({ name }) => { toast(`Новое задание: ${name}`, 'info'); updateQuest(); });
  AB.Bus.on('quest:stage', () => { updateQuest(); AB.Save.save(); });
  AB.Bus.on('quest:done', ({ name }) => { toast(`Задание выполнено: ${name}`, 'good'); updateQuest(); });
  AB.Bus.on('equip:changed', ({ text }) => { toast(text, 'good'); AB.Save.save(); });
  AB.Bus.on('equip:blocked', ({ text }) => toast(text, 'info'));
  AB.Bus.on('equip:info', ({ text }) => toast(text, 'info'));
  AB.Bus.on('door:unlocked', ({ roomId, door }) => {
    const d = (AB.ID.get(roomId).doors || []).find((q) => q.key === door);
    toast(d && d.access.lever ? 'Люк поддался рычагу' : 'Ключ-карта подошла: дверь открыта', 'good');
  });
  AB.Bus.on('world:power', ({ on }) => {
    if (!on) return;
    AB.Story.fx.alarm = false;   // тревога стихает, включается рабочий свет
    setTimeout(() => toast('Питание корабля восстановлено', 'good'), 1200);
    AB.Save.save();
  });

  // ---------- Нажатие на персонажа: что он несёт ----------
  AB.Input.onScreenTap = (cx, cy) => {
    if (doorMenu) { closeDoorMenu(); return true; }
    const dp = AB.Render.pickDoor(cx, cy);
    if (dp) { openDoorMenu(dp.door.key, dp.room, !!dp.ladder); return true; }
    const id = AB.Render.pick(cx, cy);
    if (!id) return false;
    AB.Render.showCarry(id, AB.Chars.carried(id));
    return true;
  };

  // ---------- Боевая локация: таймер, приказы отряду, выбор перка (дополнение №41) ----------
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  let lastArena = '';
  const ORDER_NAME = { follow: 'за мной', hold: 'стоит на месте', guard: 'охраняет дверь', repair: 'чинит люк' };
  const DOOR_STATE = { open: 'открыта', closed: 'закрыта', fortified: 'укреплена', broken: 'выбита' };
  const TASK_NAME = { close: 'закрыть', open: 'открыть', unfortify: 'снять укрепление' };
  function updateArenaHud() {
    const A = AB.Arena.get();
    ui.arena.hidden = !A;
    ui.zoom.hidden = !AB.Arena.seamless();
    document.body.classList.toggle('in-arena', !!A);
    if (!A) { lastArena = ''; if (doorMenu) closeDoorMenu(); return; }
    // время держимся · люк: этапы починки · опыт до следующего улучшения
    const rp = AB.Arena.repair(), P = AB.Progress;
    const pips = Array.from({ length: rp.stages }, (_, i) => `<u class="${i < rp.stage ? 'ok' : i === rp.stage ? 'cur' : ''}">${i === rp.stage && !A.over ? `<s style="width:${Math.round(rp.prog * 100)}%"></s>` : ''}</u>`).join('');
    const html = `<b>${A.def.name}</b><span class="t">${A.over ? 'Люк починен' : mmss(A.t)}</span>`
      + `<span class="rp" title="Починка люка">Люк ${pips}</span><span class="k">Убито: ${A.kills}</span>`
      + `<span class="xp" title="Опыт: ${P.xp()} из ${P.need()}">Ур. ${P.level()} <em><i style="width:${Math.round((P.xp() / P.need()) * 100)}%"></i></em></span>`;
    if (html !== lastArena) { ui.arena.innerHTML = html; lastArena = html; }
    if (doorMenu) placeDoorMenu();
  }

  // ---------- Меню двери: нажать на дверь → кому что сделать ----------
  let doorMenu = null;   // { key, room }
  function openDoorMenu(key, room, ladder = false) {
    doorMenu = { key, room, ladder };
    renderDoorMenu();
    ui.doorMenu.hidden = false;
    placeDoorMenu();
  }
  function closeDoorMenu() { doorMenu = null; ui.doorMenu.hidden = true; }
  function renderDoorMenu() {
    const helpers = AB.Party.members().filter((c) => !AB.Party.isLeader(c.id) && !c.dead && !c.down);
    if (doorMenu.ladder) {
      // заклинивший люк: кому чинить
      const rp = AB.Arena.repair();
      if (!rp || AB.Arena.jammed() !== doorMenu.key) { closeDoorMenu(); return; }
      const rows = helpers.map((c) => {
        const here = c.order && c.order.type === 'repair';
        return `<div class="dm-row"><b>${AB.ID.get(c.id).name}</b><div>${here ? `<button data-who="${c.id}" data-act="follow">Снять — за мной</button>` : `<button data-who="${c.id}" data-act="repair">Чинить люк</button>`}</div></div>`;
      }).join('');
      ui.doorMenu.innerHTML = `<div class="dm-head"><b>Люк на склад</b><span>заклинило · этап ${rp.stage + 1} из ${rp.stages}</span><button class="dm-x" data-close aria-label="Закрыть">×</button></div>`
        + (rows || `<p class="muted">Поручить некому — подойдите и ${isTouch ? 'нажмите подсказку' : 'нажмите E'}.</p>`);
      return;
    }
    const d = AB.Arena.doors().find((q) => q.key === doorMenu.key);
    if (!d) { closeDoorMenu(); return; }
    const max = d.state === 'fortified' ? d.fortHp : d.maxHp;
    const acts = d.state === 'broken' ? [] : d.state === 'open' ? ['guard', 'close'] : d.state === 'closed' ? ['guard', 'open'] : ['guard', 'unfortify', 'open'];
    const rows = helpers.map((c) => {
      const o = c.order || {};
      const here = o.type === 'guard' && o.door === d.key;
      const btns = acts.map((a) => `<button data-who="${c.id}" data-act="${a}" class="${here && !o.task && a === 'guard' ? 'on' : ''}">${a === 'guard' ? (d.state === 'fortified' ? 'Охранять' : 'Укрепить и охранять') : TASK_NAME[a]}</button>`).join('')
        + (here ? `<button data-who="${c.id}" data-act="follow">Снять — за мной</button>` : '');
      return `<div class="dm-row"><b>${AB.ID.get(c.id).name}</b><div>${btns}</div></div>`;
    }).join('');
    ui.doorMenu.innerHTML = `<div class="dm-head"><b>${d.name}</b><span>${DOOR_STATE[d.state]}${AB.Arena.passable(d) ? '' : ` · ${Math.ceil(d.hp)}/${max}`}</span><button class="dm-x" data-close aria-label="Закрыть">×</button></div>`
      + (d.state === 'broken' ? '<p class="muted">Выбитую дверь уже не закрыть.</p>'
        : rows || `<p class="muted">Поручить некому — ${isTouch ? 'подойдите и нажмите подсказку' : 'подойдите: E — закрыть/открыть, R — укрепить'}.</p>`);
  }
  function placeDoorMenu() {
    let x;
    if (doorMenu.ladder) {
      const l = AB.Arena.ladders().find((q) => q.key === doorMenu.key);
      if (!l) return;
      x = l.top.room === doorMenu.room ? l.top.x : l.bottom.x;
    } else {
      const d = AB.Arena.doors().find((q) => q.key === doorMenu.key);
      if (!d) return;
      x = d.room === doorMenu.room ? d.x : d.other.x;
    }
    const p = AB.Render.screenPos(x, -200, doorMenu.room);
    const w = ui.doorMenu.offsetWidth, h = ui.doorMenu.offsetHeight;
    ui.doorMenu.style.left = `${Math.round(clampN(p.x - w / 2, 8, innerWidth - w - 8))}px`;
    ui.doorMenu.style.top = `${Math.round(clampN(p.y - h - 6, 60, innerHeight - h - 8))}px`;
  }
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  ui.doorMenu.addEventListener('pointerdown', (e) => e.stopPropagation());
  ui.doorMenu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.close != null) { closeDoorMenu(); return; }
    const id = b.dataset.who, a = b.dataset.act;
    if (a === 'follow') AB.Arena.order(id, { type: 'follow' });
    else if (a === 'repair') AB.Arena.order(id, { type: 'repair' });
    else if (a === 'guard') AB.Arena.order(id, { type: 'guard', door: doorMenu.key });
    else AB.Arena.order(id, { type: 'guard', door: doorMenu.key, task: a });
    closeDoorMenu();
  });
  AB.Bus.on('arena:door', () => { if (doorMenu) renderDoorMenu(); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && doorMenu) closeDoorMenu();
    if (!AB.Arena.seamless()) return;
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') AB.Render.zoom(-0.05);
    if (e.code === 'Equal' || e.code === 'NumpadAdd') AB.Render.zoom(0.05);
  });
  // отдаление камеры: колесо мыши или кнопки −/+
  $('#screen').addEventListener('wheel', (e) => {
    if (!AB.Arena.seamless()) return;
    e.preventDefault();
    AB.Render.zoom(e.deltaY > 0 ? -0.04 : 0.04);
  }, { passive: false });
  ui.zoom.addEventListener('click', (e) => {
    const b = e.target.closest('[data-z]');
    if (b) AB.Render.zoom(parseFloat(b.dataset.z));
  });
  ui.zoom.addEventListener('pointerdown', (e) => e.stopPropagation());

  AB.Bus.on('arena:start', ({ name, stages }) => toast(`${name}: люк наверх заклинило — почините (${stages} этапа). Твари лезут из коридоров!`, 'bad'));
  AB.Bus.on('arena:door', ({ state, name }) => { if (state === 'broken') toast(`Выбита дверь: ${name}`); if (doorMenu) renderDoorMenu(); });
  AB.Bus.on('arena:repair', ({ stage, stages }) => { toast(stage < stages ? `Люк: этап ${stage} из ${stages} готов` : 'Люк починен!', 'good'); if (doorMenu) renderDoorMenu(); });
  AB.Bus.on('arena:order', ({ id, order }) => {
    const door = order.type === 'guard' && AB.Arena.doors().find((q) => q.key === order.door);
    toast(`${AB.ID.get(id).name}: ${door ? (order.task ? `${TASK_NAME[order.task]} — «${door.name}»` : `укрепить и охранять «${door.name}»`) : ORDER_NAME[order.type]}`, 'info');
  });
  // испытание пройдено: люк починен — снова исследование
  AB.Bus.on('arena:won', () => {
    toast('Люк починен — гнездо затихло', 'good');
    setTimeout(() => AB.Arena.exit(), 1500);
  });
  // новый уровень: пауза и выбор одного из трёх улучшений
  AB.Bus.on('progress:level', () => setTimeout(showPerks, 300));
  function showPerks() {
    if (paused || AB.Progress.unspent() <= 0) return;
    const cards = AB.Perks.offer(3);
    AB.Input.lock();
    paused = true;
    ui.perks.querySelector('h2').textContent = `Уровень ${AB.Progress.level() - AB.Progress.unspent() + 1}: улучшение`;
    ui.perks.querySelector('.act-no').textContent = 'Новый уровень';
    ui.perks.querySelector('.perk-list').innerHTML = cards.length
      ? cards.map((p) => `<button class="perk" data-perk="${p.id}"><b>${p.name}</b><span>${p.desc}</span></button>`).join('')
      : '<p class="muted">Список улучшений пуст.</p><button class="perk" data-perk="">Продолжить</button>';
    ui.perks.hidden = false;
  }
  ui.perks.addEventListener('click', (e) => {
    const b = e.target.closest('[data-perk]');
    if (!b) return;
    if (b.dataset.perk) AB.Perks.choose(b.dataset.perk);
    AB.Progress.spend();
    ui.perks.hidden = true;
    paused = false;
    AB.Input.unlock();
    if (b.dataset.perk) toast(`Улучшение: ${AB.ID.get(b.dataset.perk).name}`, 'good');
    if (AB.Progress.unspent() > 0) setTimeout(showPerks, 400);   // набралось сразу на несколько уровней
  });
  let paused = false;

  // ---------- Запуск ----------
  function boot() {
    AB.Assets.load();
    AB.Input.init();
    AB.Quests.init();
    AB.Render.init($('#screen'));

    const save = AB.Save.load();
    if (save) {
      AB.Chars.restore(save.chars);
      AB.Rooms.restore(save.rooms);
      AB.Story.restore(save.story);
      AB.Inventory.restore(save.inventory);
      AB.Enemies.restore(save.enemies);
      AB.Quests.restore(save.quests);
      AB.Equip.restore(save.equipment);
      AB.World.restore(save.world);
      AB.Party.restore(save.party);
      AB.Logs.restore(save.logs);
      AB.Barks.restore(save.barks);
      AB.Arena.restore(save.arena);
      AB.Perks.restore(save.perks);
      AB.Progress.restore(save.progress);
      // старые сохранения: у спутницы должен быть её дротиковый пистолет
      { const c = AB.Chars.get('CHAR-002'); if (c && !AB.Chars.all().some((m) => AB.Inventory.count(m.id, 'ITEM-012'))) AB.Inventory.add('CHAR-002', 'ITEM-012', 1, { swap: false }); }
      const hero = AB.Chars.get(L());
      AB.Rooms.enter(save.rooms.current || 'ROOM-001', { x: hero ? hero.x : null });
      if (hero) hero.controllable = true;
      ui.title.remove();
    } else {
      const start = AB.ID.get('ROOM-001');
      AB.Chars.spawn(MARK, { room: start.id, x: start.spawn.x });
      AB.Rooms.setPropState('ROOM-001:cryopod-main', 'closed');
      AB.Rooms.enter('ROOM-001');
      AB.Story.trigger('new_game');
      ui.title.classList.add('play');
      setTimeout(() => ui.title.remove(), 6500);
    }
    // задания, которые должны были начаться в уже посещённых помещениях (старые сохранения)
    for (const q of AB.QUESTS) {
      if (q.start && q.start.room && AB.Rooms.visited().includes(q.start.room)) AB.Quests.start(q.id);
      if (q.start && q.start.event && AB.Story.isDone(q.start.event)) AB.Quests.start(q.id);
    }
    AB.Quests.check();
    // загрузка во время испытания: оно начинается заново
    if (AB.Arena.pending()) setTimeout(() => AB.Arena.start(AB.Arena.pending()), 1200);
    if (AB.Progress.unspent() > 0) setTimeout(showPerks, 1500);
    AB.Render.snapCamera();
    applyHeroArt();
    ui.ids.classList.toggle('on', AB.Render.idsShown());
    updateHp();

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (paused) { AB.Render.frame(0); requestAnimationFrame(loop); return; }
      AB.Story.update(dt);
      AB.World.update(dt);
      { const h = AB.Chars.get(L()); if (h && !AB.Rooms.inTransition() && !AB.Arena.active()) AB.Story.zone(AB.Rooms.current(), h.x); }
      if (skipRequested) { skipRequested = false; finishWake(MARK); }

      const hero = AB.Chars.get(L());
      if (hero && hero.controllable && !AB.Rooms.inTransition() && AB.Input.consumeAction()) {
        AB.Interact.act(L());
      }
      if (hero && hero.controllable && !AB.Rooms.inTransition() && AB.Input.consumeAttack()) {
        AB.Combat.attack(L());
      }
      if (AB.Input.consumeAlt() && hero && hero.controllable && !AB.Rooms.inTransition()) AB.Interact.actAlt(L());
      if (AB.Input.consumeLead()) switchLeader();
      AB.Party.update(dt);
      AB.Barks.update(dt);
      AB.Interact.update(dt);
      AB.Combat.update(dt);
      if (!AB.Rooms.inTransition()) {
        if (AB.Arena.seamless()) for (const sg of AB.Arena.segments()) AB.Enemies.update(dt, sg.room);
        else AB.Enemies.update(dt);
      }

      if (AB.Arena.seamless() && !AB.Rooms.inTransition()) {
        // сектор: живут все его помещения сразу, двери — проходы между ними
        AB.Arena.update(dt);
        for (const sg of AB.Arena.segments()) AB.Chars.update(dt, AB.Arena.bounds(sg.room), sg.room);
        AB.Arena.afterMove();
      } else AB.Chars.update(dt, AB.Rooms.bounds());
      AB.Anim.update(dt);
      AB.Rooms.update(dt);
      AB.Rooms.tickProps(dt);
      AB.Render.frame(dt);
      updatePrompt();
      drawMinimap();
      updateNav();
      updateQuest();
      updateCombatHud();
      updateParty();
      updateArenaHud();
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
