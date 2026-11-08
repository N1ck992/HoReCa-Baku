// =====================================================================
// ISO MAIN (этап 1 изометрии, дополнение №45). Точка входа тестовой
// изометрической сцены (iso.html): мир, отряд, камера, управление, интерфейс.
// Старая игра (index.html, вид сбоку) не меняется и работает как раньше.
// =====================================================================

(() => {
  const $ = (s) => document.querySelector(s);
  const SECTOR = 'SECTOR-001';
  const ui = { room: $('#iso-room'), party: $('#iso-party'), zoom: $('#iso-zoom'), prompt: $('#iso-prompt'), toast: $('#iso-toast') };
  const isTouch = matchMedia('(pointer: coarse)').matches;
  let lastParty = '', lastRoom = '', lastPrompt = '', toastT = null;

  function toast(text, kind = 'bad') {
    ui.toast.textContent = text;
    ui.toast.className = `show ${kind}`;
    clearTimeout(toastT);
    toastT = setTimeout(() => ui.toast.classList.remove('show'), 2400);
  }
  const itemName = (id) => AB.ID.get(id).name;
  // сообщения тех же систем, что в основной игре
  AB.Bus.on('item:pickup', ({ charId, by, itemId, added }) => {
    if (added) toast(`${charId !== by ? `${AB.ID.get(charId).name} несёт · ` : ''}${AB.ID.get(itemId).weapon ? 'В руках' : 'В рюкзаке'}: ${itemName(itemId)}`, 'good');
    else toast('Не помещается');
  });
  AB.Bus.on('equip:blocked', ({ text }) => toast(text, 'info'));
  AB.Bus.on('equip:info', ({ text }) => toast(text, 'good'));
  AB.Bus.on('equip:changed', ({ text }) => toast(text, 'good'));
  AB.Bus.on('equip:shared', ({ from, itemId }) => toast(`${itemName(itemId)} — из рюкзака: ${AB.ID.get(from).name}`, 'info'));
  AB.Bus.on('door:denied', ({ reason }) => toast(reason, 'info'));
  AB.Bus.on('iso:toast', ({ text, kind }) => toast(text, kind));
  AB.Bus.on('inventory:exchange', ({ toId, given, taken }) => {
    const to = AB.ID.get(toId).name;
    toast(given && taken ? `Обмен с ${to}: ${itemName(given)} ⇄ ${itemName(taken)}` : given ? `${to} получает: ${itemName(given)}` : `Взято у ${to}: ${itemName(taken)}`, 'good');
  });
  AB.Bus.on('iso:door', ({ state, name }) => toast(`${name}: ${state === 'open' ? 'открыта' : 'закрыта'}`, 'info'));
  AB.Bus.on('combat:noweapon', () => toast('Нечем драться: найдите что-нибудь тяжёлое', 'info'));
  AB.Bus.on('weapon:overheat', () => toast('Плазмомёт перегрет — пара секунд на остывание', 'info'));
  AB.Bus.on('enemy:dead', ({ name }) => toast(`${name} убит`, 'good'));
  // гибель Марка или Миры — конец, как в основной игре; остальные — отряд идёт дальше
  AB.Bus.on('char:dead', ({ charId }) => {
    if (charId !== 'CHAR-001' && charId !== 'CHAR-002') { toast(`${AB.ID.get(charId).name} погибла`); return; }
    $('#iso-death h2').textContent = charId === 'CHAR-001' ? 'Вы погибли' : 'Её больше нет';
    setTimeout(() => { $('#iso-death').hidden = false; }, 1400);
  });

  // подсказка действия; на телефоне она же — кнопка
  function updatePrompt() {
    const p = AB.IsoInteract.prompt();
    if (!p) { ui.prompt.classList.remove('show'); lastPrompt = ''; return; }
    const html = p.progress !== undefined
      ? `${p.label}<span class="bar"><i style="width:${Math.round(p.progress * 100)}%"></i></span>`
      : `${isTouch ? '' : `<kbd class="${p.ok ? '' : 'no'}">E</kbd> `}${p.label}`;
    ui.prompt.classList.toggle('no', !p.ok);
    if (html !== lastPrompt) { ui.prompt.innerHTML = html; lastPrompt = html; }
    ui.prompt.classList.add('show');
  }

  function updateHud() {
    const l = AB.IsoParty.lead();
    const room = AB.IsoWorld.room(l.x, l.y);
    if (room && room !== lastRoom) {
      const r = AB.ID.get(room);
      ui.room.innerHTML = `<b>${r ? r.name : room}</b><span>${room}</span>`;
      lastRoom = room;
    }
    const html = AB.IsoParty.members().map((m, i) => {
      const d = AB.ID.get(m.id), lead = i === AB.IsoParty.leaderIndex();
      // оружие и два места в рюкзаке — из инвентаря основной игры
      const chip = (sl) => (sl ? `<u title="${itemName(sl.item)}">${AB.ID.get(sl.item).short}${sl.qty > 1 ? `×${sl.qty}` : ''}</u>` : '<u class="empty">—</u>');
      const c = AB.Chars.get(m.id), hp = c ? Math.max(0, c.hp / d.stats.maxHp) : 1, dead = c && c.dead;
      const ht = AB.Inventory.heat(m.id);
      return `<button class="pm ${lead ? 'lead' : ''} ${dead ? 'dead' : ''}" data-i="${i}" aria-pressed="${lead}" title="${dead ? 'Погиб' : lead ? 'Ведёт отряд' : 'Передать управление (Q)'}"><b>${d.name}</b><span>${chip(AB.Inventory.weapon(m.id))}${AB.Inventory.packs(m.id).map(chip).join('')}</span>`
        + `<i class="hp" style="width:${Math.round(hp * 100)}%"></i>${ht ? `<i class="heat ${ht.over ? 'over' : ''}" style="width:${Math.round(ht.heat * 100)}%"></i>` : ''}</button>`;
    }).join('');
    if (html !== lastParty) { ui.party.innerHTML = html; lastParty = html; }
  }

  function boot() {
    AB.Assets.load();
    AB.IsoWorld.build(SECTOR);
    AB.IsoParty.init(AB.ISO_LAYOUTS[SECTOR].party);
    AB.IsoBridge.setup(AB.ISO_LAYOUTS[SECTOR]);          // старые системы: персонажи, инвентарь, оборудование
    AB.IsoInteract.init(AB.ISO_LAYOUTS[SECTOR]);
    AB.IsoInventory.init();
    AB.IsoRender.init($('#iso'));
    AB.IsoInput.init($('#iso'));
    ui.party.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) AB.IsoParty.setLeader(Number(b.dataset.i));
    });
    ui.zoom.addEventListener('click', (e) => {
      const b = e.target.closest('[data-z]');
      if (b) AB.IsoRender.zoom(parseFloat(b.dataset.z));
    });
    $('#iso-ids').addEventListener('click', () => { AB.isoShowIds = !AB.isoShowIds; });
    $('#iso-restart').addEventListener('click', () => location.reload());
    for (const el of [ui.party, ui.zoom]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    ui.prompt.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); AB.IsoInteract.actNearest(); });

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const input = AB.IsoInput.update(dt);
      AB.IsoParty.update(dt, AB.IsoInteract.working() ? { x: input.x, y: input.y, walk: input.walk } : input);
      AB.IsoBridge.sync();
      AB.IsoInteract.update(dt, input);
      AB.IsoEnemies.update(dt);
      AB.IsoCombat.update(dt, input);
      AB.Anim.update(dt);
      AB.IsoRender.frame(dt);
      updateHud();
      updatePrompt();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
