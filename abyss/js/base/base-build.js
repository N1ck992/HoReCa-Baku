// =====================================================================
// БАЗА: РЕЖИМ СТРОЙКИ (дополнение №71). Как в Emperor: каталог чертежей,
// «призрак» постройки на сетке корпуса — зелёный, если можно поставить,
// красный с причиной, если нельзя. Цена видна до подтверждения. Поставленный
// чертёж — каркас: строители сами носят материалы и строят.
// Выбранное можно передвинуть, изменить размер (помещения), повернуть
// (устройства) или снести (часть материалов вернётся в приёмник).
// Телефон: нажатие — переставить призрак, перетаскивание — двигать его,
// кнопки — размер и поворот. Мышь: то же самое, R — повернуть.
// =====================================================================

AB.BaseBuild = (() => {
  const sim = () => AB.BaseSim;
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nm = (i) => (AB.ID.get(i) || {}).name || i;
  let on = false, ghost = null, sel = null, drag = null, delAsk = false, chk = null, chkKey = '';

  function toggle(v) {
    on = v == null ? !on : !!v;
    ghost = null; sel = null; drag = null; delAsk = false;
    if (on && AB.BaseView) AB.BaseView.close();
    render();
  }
  const cellAt = (cx, cy) => { const p = AB.IsoRender.pick(cx, cy); return { x: p.x, y: p.y }; };
  function centerCell() { const r = document.getElementById('iso').getBoundingClientRect(); return cellAt(r.left + r.width / 2, r.top + r.height * 0.32); }
  // призрак: новая постройка или правка существующей (uid)
  function startNew(bpId) {
    const b = sim().bp(bpId), c = centerCell();
    const cl = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
    const w = b.kind === 'cable' ? 1 : b.kind === 'room' ? cl(4, b.size.short) : b.w, h = b.kind === 'cable' ? 4 : b.kind === 'room' ? cl(4, b.size.long) : b.h;
    const grid = b.kind === 'room' ? 'GRID-001' : null;
    const g = snapG(grid).snap(c, w, h);
    ghost = { bp: bpId, x: g.x, y: g.y, w, h };
    if (grid) ghost.grid = grid;
    sel = null; delAsk = false;
    render();
  }
  const snapG = (id) => AB.BaseGrids.get(id || 'GRID-001');
  // №74: сменить сетку призрака (для помещений): размер подгоняется под правила сетки
  function setGrid(id) {
    if (!ghost) return;
    const G = snapG(id);
    ghost.grid = id;
    if (G.step === 3) { ghost.w = Math.max(3, Math.min(9, Math.round(ghost.w / 3) * 3)); ghost.h = Math.max(3, Math.min(9, Math.round(ghost.h / 3) * 3)); }
    if (id === 'GRID-002') { ghost.w = Math.max(4, ghost.w); ghost.h = Math.max(4, ghost.h); }
    const g = G.snap({ x: ghost.x + ghost.w / 2, y: ghost.y + ghost.h / 2 }, ghost.w, ghost.h); ghost.x = g.x; ghost.y = g.y;
    render();
  }
  function startEdit(uid) {
    const o = sim().obj(uid); if (!o || o.core) return;
    ghost = { bp: o.bp, uid, x: o.x, y: o.y, w: o.w, h: o.h };
    if (o.grid) ghost.grid = o.grid;
    delAsk = false;
    render();
  }
  function check() {
    if (!ghost) return null;
    const key = JSON.stringify(ghost) + sim().state().seq + sim().state().rooms.length + sim().state().devs.length;
    if (key === chkKey) return chk;
    chkKey = key;
    const o = ghost.uid && sim().obj(ghost.uid);
    const moveBy = o && o.w === ghost.w && o.h === ghost.h ? { x: ghost.x - o.x, y: ghost.y - o.y } : null;
    chk = sim().check({ ...ghost, moveBy });
    return chk;
  }
  function confirm() {
    if (!ghost) return;
    const r = ghost.uid ? sim().modify(ghost.uid, { x: ghost.x, y: ghost.y, w: ghost.w, h: ghost.h }) : sim().place(ghost);
    if (!r.ok) { AB.Bus.emit('iso:toast', { text: r.why, kind: 'info' }); return; }
    AB.Bus.emit('iso:toast', { text: ghost.uid ? 'Перестройка: строители доделают каркас' : 'Каркас поставлен: строители принесут материалы', kind: 'good' });
    const bp = ghost.bp, keep = !ghost.uid && sim().bp(bp).kind === 'device';
    ghost = null; sel = null;
    if (keep) startNew(bp);          // устройства часто ставят рядами — призрак остаётся
    sim().save();
    render();
  }
  function remove() {
    if (!sel) return;
    if (!delAsk) { delAsk = true; render(); return; }
    const r = sim().remove(sel);
    if (!r.ok) AB.Bus.emit('iso:toast', { text: r.why, kind: 'info' });
    else { const back = Object.entries(r.refund || {}).filter(([, n]) => n > 0).map(([i, n]) => `${nm(i)} ×${n}`).join(', '); AB.Bus.emit('iso:toast', { text: back ? `Снесено. В приёмник вернулось: ${back}` : 'Снесено', kind: 'good' }); sel = null; }
    delAsk = false; sim().save(); render();
  }
  function resize(dw, dh) {
    if (!ghost) return;
    const b = sim().bp(ghost.bp);
    if (b.kind === 'cable') { const d = dw + dh; if (ghost.w === 1) ghost.h = Math.max(1, Math.min(b.size.long[1], ghost.h + d)); else ghost.w = Math.max(1, Math.min(b.size.long[1], ghost.w + d)); render(); return; }
    if (b.kind !== 'room') return;
    const st = snapG(ghost.grid).step;
    ghost.w = Math.max(st, ghost.w + dw * st); ghost.h = Math.max(st, ghost.h + dh * st);
    render();
  }
  function rotate() { if (!ghost) return; [ghost.w, ghost.h] = [ghost.h, ghost.w]; render(); }

  // №86: выбрал чертёж — игра сама ставит его и тянет проводку; не хватает материалов — говорит ЭХО
  function auto(bpId) {
    const r = sim().autoPlace(bpId), b = sim().bp(bpId);
    if (r.ok) {
      AB.Bus.emit('iso:toast', { text: `${b.name}: каркас поставлен${r.cables ? `, проводка проложена (${r.cells} кл.)` : ''} — строители принесут материалы`, kind: 'good' });
      const o = sim().obj(r.uid); if (o) AB.IsoRender.focus({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
      sel = null; sim().save(); render(); return;
    }
    const nm2 = (i) => (AB.ID.get(i) || {}).name || i;
    const text = r.miss ? `Для «${b.name}» не хватает: ${r.miss.map(([i, n, h]) => `${nm2(i).toLowerCase()} — нужно ${n}, есть ${h}`).join('; ')}.${r.miss.some(([i]) => i === 'ITEM-017') ? ' Стройматериал печатает 3D-принтер из реголита.' : ''}${r.miss.some(([i]) => i === 'ITEM-003' || i === 'ITEM-001' || i === 'ITEM-002') ? ' Металлолом, электронику и провода ищите на карте дна.' : ''}` : `${b.name}: ${r.why}`;
    if (AB.IsoCompanion && AB.IsoCompanion.has()) AB.IsoCompanion.message(text); else AB.Bus.emit('iso:toast', { text, kind: 'info' });
  }

  // ---------- касания ----------
  function objAt(x, y) {
    const S = sim().state(), inR = (o) => x >= o.x && y >= o.y && x < o.x + o.w && y < o.y + o.h;
    return S.devs.find((d) => !d.core && inR(d)) || S.cables.find(inR) || S.rooms.find((r) => !r.core && inR(r)) || null;
  }
  function tap(cx, cy) {
    const c = cellAt(cx, cy);
    if (ghost) {
      const g = snapG(ghost.grid).snap(c, ghost.w, ghost.h);
      ghost.x = g.x; ghost.y = g.y; render(); return true;
    }
    const o = objAt(Math.floor(c.x), Math.floor(c.y));
    sel = o ? o.uid : null; delAsk = false;
    render();
    return true;
  }
  // перетаскивание призрака пальцем (iso-input.js): начать, если нажали на призрак
  function grab(cx, cy) {
    if (!on || !ghost) return false;
    const c = cellAt(cx, cy);
    if (c.x < ghost.x - 0.5 || c.y < ghost.y - 0.5 || c.x > ghost.x + ghost.w + 0.5 || c.y > ghost.y + ghost.h + 0.5) return false;
    drag = { ox: c.x - ghost.x, oy: c.y - ghost.y };
    return true;
  }
  function dragTo(cx, cy) {
    if (!drag || !ghost) return;
    const c = cellAt(cx, cy);
    let x = Math.round(c.x - drag.ox), y = Math.round(c.y - drag.oy);
    if (ghost.grid === 'GRID-003') { x = 1 + 3 * Math.round((x - 1) / 3); y = 1 + 3 * Math.round((y - 1) / 3); }
    if (x !== ghost.x || y !== ghost.y) { ghost.x = x; ghost.y = y; render(); }
  }
  function drop() { drag = null; }
  addEventListener('keydown', (e) => {
    if (!on) return;
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') rotate();
    if (e.key === 'Escape') { if (ghost) { ghost = null; render(); } else toggle(false); }
    if (e.key === 'Enter') confirm();
  });

  // ---------- рисование на полу ----------
  function drawFloor(ctx, toScreen, time, poly, rectPts) {
    const S = sim().state();
    if (sel && !ghost) { const o = sim().obj(sel); if (o) { poly(ctx, toScreen, rectPts(o)); ctx.fillStyle = 'rgba(255,226,168,.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,226,168,.9)'; ctx.lineWidth = 2; ctx.stroke(); } }
    if (!ghost) return;
    const c = check(), col = c && c.ok ? '120,255,170' : '255,110,90';
    if (ghost.uid) { const o = sim().obj(ghost.uid); if (o) { poly(ctx, toScreen, rectPts(o)); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); } }
    for (const [x, y] of AB.BaseGrids.cellsOf(ghost)) {
      poly(ctx, toScreen, rectPts({ x, y, w: 1, h: 1 }));
      ctx.fillStyle = `rgba(${col},${0.18 + Math.sin(time * 4) * 0.05})`; ctx.fill();
    }
    if (!ghost.grid || ghost.grid === 'GRID-001' || ghost.grid === 'GRID-003') { poly(ctx, toScreen, rectPts(ghost)); ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineWidth = 2; ctx.stroke(); }
    // будущие проходы к соседним помещениям
    if (sim().bp(ghost.bp).kind === 'room' && c && c.ok) {
      const g = AB.BaseGrids;
      for (const r of S.rooms) { if (r.uid === ghost.uid) continue; const d = g.door(ghost, r); if (d) for (const [x, y] of d) { poly(ctx, toScreen, rectPts({ x, y, w: 1, h: 1 })); ctx.fillStyle = 'rgba(255,226,168,.55)'; ctx.fill(); } }
    }
  }

  // ---------- панели ----------
  function costLine(cost) {
    return cost.map(([i, n]) => { const have = AB.BaseView.stock(i); return `<span class="${have < n ? 'bad' : ''}">${esc(nm(i))} ${n} <i>(есть ${have})</i></span>`; }).join(' · ');
  }
  function render() {
    const cat = el('bx-cat'), bar = el('bx-ghost');
    if (!cat || !bar) return;
    document.body.classList.toggle('base-build', on);
    cat.hidden = !on || !!ghost || !!sel;
    bar.hidden = !on || (!ghost && !sel);
    if (!on) return;
    if (!ghost && !sel) {
      const S = sim().state();
      cat.innerHTML = `<div class="bx-cat-head"><b>Стройка</b><span class="muted">Нажмите на чертёж — встанет сам, с проводкой · нажмите на постройку, чтобы передвинуть или снести</span><button class="bx-x" data-b="exit" aria-label="Выйти из стройки">✕</button></div>
        <div class="bx-cat-list">${S.unlocked.map((id) => sim().bp(id)).filter((b) => b && !b.core).map((b) => {
          const size = b.kind === 'cable' ? `линия до ${b.size.long[1]} клеток` : b.kind === 'room' ? `${b.size.short[0]}×${b.size.long[0]} … ${b.size.short[1]}×${b.size.long[1]}` : `${b.w}×${b.h}`;
          const cost = b.kind === 'cable' ? `${nm(b.costPer.item)} 1 на ${b.costPer.cells} клетки` : b.kind === 'room' ? b.costPerCell.map(([i, n]) => `${nm(i)} ${n} за клетку`).join(', ') : (b.cost || []).map(([i, n]) => `${nm(i)} ${n}`).join(', ');
          return `<button class="bx-bp" data-b="new|${b.id}"><b>${esc(b.name)}</b><span>${esc(b.kind === 'room' ? 'Помещение' : b.kind === 'cable' ? 'Электросеть' : 'Устройство')} · ${esc(size)}</span><span class="cost">${esc(cost)}</span><span class="muted">${esc(b.desc)}</span></button>`;
        }).join('')}</div>
        <div class="muted">Новые чертежи, сетки и расширение корпуса — в «Науке».</div>`;
      return;
    }
    if (ghost) {
      const b = sim().bp(ghost.bp), c = check(), room = b.kind === 'room';
      bar.innerHTML = `<div class="bx-head"><b>${esc(ghost.uid ? `Перестройка: ${AB.BaseView.title(sim().obj(ghost.uid))}` : b.name)}</b><span class="muted">${ghost.w}×${ghost.h}</span></div>
        ${room && (b.grids || []).length > 1 ? `<div class="bx-row"><span class="muted">Сетка:</span>${(b.grids || []).map((id) => { const G = snapG(id), has = sim().state().grids.includes(id); return `<button class="bx-chip${(ghost.grid || 'GRID-001') === id ? ' on' : ''}" data-b="grid|${id}" ${has ? '' : 'disabled'} title="${esc(G.desc)}">${esc(G.name)}${has ? '' : ' 🔒'}</button>`; }).join('')}</div><div class="muted">${esc(snapG(ghost.grid).desc)}</div>` : ''}
        <div class="bx-cost">Цена: ${costLine(c.cost)}${ghost.uid ? ' <i class="muted">(вложенное засчитывается)</i>' : ''}</div>
        <div class="bx-st ${c.ok ? 'ok' : 'bad'}">${c.ok ? 'Можно ставить — материалы принесут строители' : esc(c.why)}</div>
        <div class="bx-row">
          ${b.kind === 'cable' ? '<button class="bx-chip" data-b="h|-1">− короче</button><button class="bx-chip" data-b="h|1">+ длиннее</button>' : ''}
          ${room ? `<button class="bx-chip" data-b="w|-1">− ширина</button><button class="bx-chip" data-b="w|1">+ ширина</button><button class="bx-chip" data-b="h|-1">− длина</button><button class="bx-chip" data-b="h|1">+ длина</button>` : ''}
          <button class="bx-chip" data-b="rot">⟳ Повернуть</button>
          <button class="bx-chip go" data-b="ok" ${c.ok ? '' : 'disabled'}>✓ ${ghost.uid ? 'Перестроить' : 'Поставить'}</button>
          <button class="bx-chip" data-b="cancel">✕ Отмена</button>
        </div>
        <div class="muted">Нажмите на сетку — призрак переедет туда; можно тащить пальцем.</div>`;
      return;
    }
    const o = sim().obj(sel);
    if (!o) { sel = null; render(); return; }
    const b = sim().bp(o.bp);
    bar.innerHTML = `<div class="bx-head"><b>${esc(AB.BaseView.title(o))}</b><span class="muted">${o.w}×${o.h} · ${o.built ? 'построено' : 'каркас'}</span></div>
      <div class="bx-row">
        <button class="bx-chip" data-b="move">✥ ${b.kind === 'room' ? 'Передвинуть / размер' : 'Передвинуть / повернуть'}</button>
        ${b.kind === 'device' && o.built ? '<button class="bx-chip" data-b="info">Открыть устройство</button>' : ''}
        <button class="bx-chip ${delAsk ? 'bad' : ''}" data-b="del">${delAsk ? 'Точно снести? Нажмите ещё раз' : '🗑 Снести'}</button>
        <button class="bx-chip" data-b="unsel">Готово</button>
      </div>
      <div class="muted">${o.built ? `При сносе в приёмник вернётся половина материалов${b.kind === 'room' ? '; помещение должно быть пустым' : ''}.` : 'Каркас: при сносе всё принесённое вернётся в приёмник.'}</div>`;
  }
  function onClick(e) {
    const btn = e.target.closest('[data-b]'); if (!btn || btn.disabled) return;
    const [a, v] = btn.dataset.b.split('|');
    if (a === 'exit') toggle(false);
    else if (a === 'new') auto(v);
    else if (a === 'w') resize(+v, 0);
    else if (a === 'h') resize(0, +v);
    else if (a === 'rot') rotate();
    else if (a === 'grid') setGrid(v);
    else if (a === 'ok') confirm();
    else if (a === 'cancel') { ghost = null; render(); }
    else if (a === 'move') startEdit(sel);
    else if (a === 'del') remove();
    else if (a === 'unsel') { sel = null; delAsk = false; render(); }
    else if (a === 'info') { const u = sel; toggle(false); AB.BaseView.open(u); }
  }
  function init() {
    for (const id of ['bx-cat', 'bx-ghost']) { const n = el(id); if (n) n.addEventListener('click', onClick); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  AB.Bus.on('base:view', ({ on: v }) => { if (!v && on) toggle(false); });
  AB.Bus.on('base:plan', () => { if (on) render(); });

  return { auto, toggle, on: () => on, tap, grab, dragTo, drop, drawFloor, startNew, startEdit, confirm, ghost: () => ghost, render };
})();
