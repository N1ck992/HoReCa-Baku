// =====================================================================
// ISO ABILITIES (дополнение №131). Выдвижное меню способностей (Press, Hold & Drag).
//
// В правом нижнем углу — одна круглая иконка ведущего героя (портрет, кольцо здоровья,
// дуга нагрева оружия). Кнопки способностей скрыты.
//   • Нажать на иконку и, не отпуская, отвести палец/курсор — веером вверх-влево выезжают
//     кнопки способностей (удержание без сдвига ~0,22 с тоже раскрывает веер).
//   • Палец над кнопкой — она подсвечивается и подписывается; отпустили над ней — способность
//     срабатывает; отпустили мимо — меню закрывается без действия.
//   • Короткое нажатие без сдвига — окно снаряжения героя (как раньше нажатие на карточку).
// Способности те же, что были: удар (F/J), рывок (пробел), снаряжение героя, передать управление
// другому герою отряда (Q). Клавиатура работает как раньше. В базе-капсуле (мирная зона) — без удара и рывка.
// Заменяет карточки отряда (#iso-party) и кнопки ⚔ » (#iso-actbtns) — они скрыты, код их не удалён.
// =====================================================================

AB.IsoAbilities = (() => {
  const R = { radius: 96, arcFrom: 178, arcTo: 272, pick: 34, holdOpen: 0.22, tap: 0.25, move: 10 };
  const ICON = {
    attack: '<svg viewBox="0 0 24 24"><path d="M4 20 15 9M15 9l3-5 2 2-5 3M9 15l-3 3M3 21l2-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 20 9 9M9 9 6 4 4 6l5 3M15 15l3 3M21 21l-2-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    dash: '<svg viewBox="0 0 24 24"><path d="M5 6l6 6-6 6M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><rect x="5" y="7" width="14" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 7V5h6v2M5 12h14" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  let root = null, main = null, fan = null, label = null;
  let st = null;            // { id, x0, y0, t0, open, sel, items }
  let lastSig = '', tapPending = 0;
  const busy = () => AB.IsoStory.locked() || AB.IsoGame.busy();
  const inBase = () => document.body.classList.contains('in-base');

  // ---------- что в веере ----------
  function items() {
    const l = AB.IsoParty.lead(); if (!l) return [];
    const list = [];
    if (!inBase()) {
      list.push({ key: 'attack', name: 'Удар', hint: 'F / J', icon: ICON.attack, cls: 'atk', run: () => AB.IsoCombat.attackNearest() });
      const ready = !AB.IsoFX.dashReady || AB.IsoFX.dashReady();
      list.push({ key: 'dash', name: ready ? 'Рывок' : 'Рывок — перезарядка', hint: 'пробел', icon: ICON.dash, off: !ready, run: () => AB.IsoFX.dash(AB.IsoInput.update(0)) });
    }
    list.push({ key: 'gear', name: 'Снаряжение', hint: 'I', icon: ICON.gear, run: () => AB.IsoInventory.openHero(l.id) });
    AB.IsoParty.members().forEach((m, i) => {
      if (m === l) return;
      const c = AB.Chars.get(m.id), dead = c && c.dead;
      list.push({ key: `lead:${i}`, name: `Вести: ${AB.ID.get(m.id).name}`, hint: 'Q', icon: ICON.swap, who: m.id, off: dead, run: () => AB.IsoParty.setLeader(i) });
    });
    return list;
  }

  // ---------- разметка ----------
  function build() {
    root = document.createElement('div'); root.id = 'iso-ab';
    root.innerHTML = '<div class="ab-fan"></div><div class="ab-label" hidden></div><button class="ab-main" aria-label="Способности героя: нажмите и отведите палец"><canvas></canvas><b></b></button>';
    document.body.appendChild(root);
    main = root.querySelector('.ab-main'); fan = root.querySelector('.ab-fan'); label = root.querySelector('.ab-label');
    main.addEventListener('pointerdown', down);
    main.addEventListener('pointermove', move);
    main.addEventListener('pointerup', up);
    main.addEventListener('pointercancel', cancel);
    main.addEventListener('lostpointercapture', (e) => { if (st && st.id === e.pointerId) cancel(); });
    main.addEventListener('contextmenu', (e) => e.preventDefault());
    main.addEventListener('click', () => { if (tapPending && performance.now() - tapPending < 600) { tapPending = 0; const l = AB.IsoParty.lead(); if (l) AB.IsoInventory.openHero(l.id); } });
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (AB.Dialog && AB.Dialog.isOpen()) { AB.Dialog.next(); return; }
    main.setPointerCapture(e.pointerId);
    const r = main.getBoundingClientRect();
    st = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: r.left + r.width / 2, cy: r.top + r.height / 2, t0: performance.now(), open: false, sel: -1, moved: false, list: [] };
    main.classList.add('held');
    st.timer = setTimeout(() => { if (st && !st.open) openFan(); }, R.holdOpen * 1000);
  }
  function move(e) {
    if (!st || e.pointerId !== st.id) return;
    const d = Math.hypot(e.clientX - st.x0, e.clientY - st.y0);
    if (d > R.move) st.moved = true;
    if (st.moved && !st.open) openFan();
    if (st.open) pick(e.clientX, e.clientY);
  }
  function up(e) {
    if (!st || e.pointerId !== st.id) return;
    const s = st, quick = !s.moved && (performance.now() - s.t0) / 1000 < R.tap && !s.open;
    if (s.open) pick(e.clientX, e.clientY);
    const it = s.sel >= 0 ? s.list[s.sel] : null;
    close();
    if (quick) { tapPending = performance.now(); return; }   // короткое нажатие — снаряжение (откроется по «клику», иначе этот же клик закрыл бы окно)
    if (it && !it.off && !(busy() && it.key !== 'gear')) it.run();
  }
  function cancel() { close(); }

  function openFan() {
    if (!st) return;
    st.open = true; st.list = items();
    const n = st.list.length, a0 = R.arcFrom, a1 = R.arcTo;
    // веер — в свободную сторону (вверх-влево от угла экрана); один-два пункта — ближе к середине дуги
    const ang = (i) => (n === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * i) / (n - 1)) * Math.PI / 180;
    const rad = R.radius + Math.max(0, n - 4) * 14;
    fan.innerHTML = st.list.map((it, i) => {
      const x = Math.cos(ang(i)) * rad, y = Math.sin(ang(i)) * rad;
      return `<div class="ab-it ${it.cls || ''} ${it.off ? 'off' : ''}" data-i="${i}" style="--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px;--d:${i * 18}ms">${it.who ? `<canvas data-who="${it.who}"></canvas>` : ''}${it.icon}</div>`;
    }).join('');
    st.pos = st.list.map((_, i) => ({ x: st.cx + Math.cos(ang(i)) * rad, y: st.cy + Math.sin(ang(i)) * rad }));
    root.classList.add('open');
    requestAnimationFrame(() => {
      fan.querySelectorAll('canvas[data-who]').forEach((cv) => AB.IsoRender.portrait(cv, cv.dataset.who, 1));
      root.classList.add('shown');
    });
  }
  function pick(x, y) {
    let best = -1, bd = R.pick;
    st.pos.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
    if (best === st.sel) return;
    st.sel = best;
    fan.querySelectorAll('.ab-it').forEach((el, i) => el.classList.toggle('sel', i === best));
    if (best < 0) { label.hidden = true; return; }
    const it = st.list[best], p = st.pos[best];
    label.innerHTML = `<b>${it.name}</b>${it.hint ? `<i>${it.hint}</i>` : ''}`;
    label.hidden = false;
    const r = root.getBoundingClientRect();
    // подпись — снаружи веера, по направлению от иконки к выбранной кнопке (не закрывает соседей)
    const vx = p.x - st.cx, vy = p.y - st.cy, vn = Math.hypot(vx, vy) || 1;
    label.style.left = `${p.x + (vx / vn) * 44 - r.left}px`; label.style.top = `${p.y + (vy / vn) * 44 - r.top + 14}px`;
  }
  function close() {
    if (!st) return;
    clearTimeout(st.timer);
    try { main.releasePointerCapture(st.id); } catch (e) { /* уже отпущен */ }
    st = null;
    main.classList.remove('held');
    root.classList.remove('shown');
    label.hidden = true;
    setTimeout(() => { if (!st) { root.classList.remove('open'); fan.innerHTML = ''; } }, 140);
  }

  // ---------- кадр: портрет ведущего, здоровье, нагрев ----------
  function update() {
    if (!root) return;
    const l = AB.IsoParty.lead(); if (!l) return;
    const d = AB.ID.get(l.id), c = AB.Chars.get(l.id), hp = c ? Math.max(0, c.hp / d.stats.maxHp) : 1, ht = AB.Inventory.heat(l.id);
    const others = AB.IsoParty.members().filter((m) => m !== l).map((m) => { const cc = AB.Chars.get(m.id), dd = AB.ID.get(m.id); return cc && !cc.dead ? Math.max(0, cc.hp / dd.stats.maxHp) : 0; });
    const sig = `${l.id}|${hp.toFixed(2)}|${ht ? ht.heat.toFixed(2) + ht.over : ''}|${others.map((v) => v.toFixed(2)).join(',')}`;
    if (sig === lastSig) return;
    const newLead = !lastSig.startsWith(`${l.id}|`);
    lastSig = sig;
    main.style.setProperty('--hp', (hp * 100).toFixed(1));
    main.style.setProperty('--heat', ht ? (ht.heat * 100).toFixed(1) : '0');
    main.classList.toggle('over', !!(ht && ht.over));
    main.classList.toggle('low', hp < 0.3);
    main.querySelector('b').textContent = d.name;
    // остальные в отряде — точки здоровья у иконки
    root.dataset.others = others.length;
    root.style.setProperty('--o1', others[0] != null ? (others[0] * 100).toFixed(0) : '0');
    root.style.setProperty('--o2', others[1] != null ? (others[1] * 100).toFixed(0) : '0');
    if (newLead) requestAnimationFrame(() => AB.IsoRender.portrait(main.querySelector('canvas'), l.id, 1));
  }

  function init() {
    build();
    document.body.classList.add('ab-menu');
    // портрет перерисовываем, когда фигура уже загрузилась
    setTimeout(() => { lastSig = ''; }, 1500); setTimeout(() => { lastSig = ''; }, 4000);
    AB.Bus.on('iso:party', () => { lastSig = ''; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { update, isOpen: () => !!(st && st.open), RULES: R };
})();
