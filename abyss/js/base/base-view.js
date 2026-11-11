// =====================================================================
// БАЗА: ПОКАЗ И КАРТОЧКИ (дополнение №71). Связывает симуляцию базы с игрой:
//  · адаптер: шкафчики экипажа (общий инвентарь) и кто из экипажа на базе;
//  · время: база живёт по реальным часам — и когда игрок в капсуле, и когда
//    он на карте дна; сохранение каждые 5 с, при возвращении — досчёт;
//  · капсула изнутри собирается из плана (помещения, проходы, устройства);
//  · поверх сцены: каркасы строек, состояние станков и складов, груз в руках;
//  · карточки: устройство, стеллаж, приёмник, стройка, экипаж и списки работ.
// =====================================================================

AB.BaseView = (() => {
  const SEC = 'SECTOR-005';
  const sim = () => AB.BaseSim;
  const D = () => AB.BASE_DATA;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nm = (i) => (AB.ID.get(i) || {}).name || i;
  const short = (i) => (AB.ID.get(i) || {}).short || i;
  const toast = (text, kind = 'info') => AB.Bus.emit('iso:toast', { text, kind });

  // ---------- адаптер: шкафчики и кто дома ----------
  function present() {
    if (!AB.Flags.has('undocked')) return [];
    const sq = AB.IsoOverworld.squads ? AB.IsoOverworld.squads() : [];
    const here = AB.IsoGame.sector() === SEC || AB.IsoOverworld.isOpen();
    return AB.IsoActs.crew().filter((id) => {
      const s = sq.find((q) => q.id === id);
      if (s && s.vehicle && s.state !== 'home') return false;                    // отряд на карте дна
      if (!here && AB.IsoParty.members().some((m) => m.id === id)) return false;  // ушёл с отрядом в здание
      const c = AB.Chars.get(id); return !(c && c.dead);
    });
  }
  sim().setExt({
    count: (i) => AB.IsoStash.count(i),
    take: (i, n) => { n = Math.min(n, AB.IsoStash.count(i)); if (n > 0) AB.IsoStash.remove(i, n); return n; },
    give: (i, n) => AB.IsoStash.add(i, n),
    present,
  });

  // ---------- время: реальные часы ----------
  let last = Date.now(), saveT = 0;
  function pump() {
    const now = Date.now(), dt = (now - last) / 1000;
    last = now;
    if (!sim().on()) { if (AB.Flags && AB.Flags.has('undocked')) { const n = sim().load() || 0; sim().ensure(); if (n > 60) setTimeout(() => toast(`Пока вас не было, база работала ${Math.round(n / 60)} мин`, 'good'), 800); } return; }
    if (dt <= 0) return;
    if (dt > 3) sim().catchUp(dt); else sim().tick(dt);
    saveT += dt;
    if (saveT > 5) { saveT = 0; sim().save(); }
  }
  setInterval(() => { if (Date.now() - last > 180) pump(); }, 200);
  addEventListener('pagehide', () => sim().save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) sim().save(); });

  // ---------- капсула из плана ----------
  let rebuild = false;
  function layout() {
    const S = sim().state(), g = sim().geom(), L = AB.ISO_LAYOUTS[SEC];
    const look = (u) => (sim().room(u) || {}).look || 'ROOM-021';
    L.areas = S.rooms.filter((r) => r.built).map((r) => ({ room: r.look, x: r.x, y: r.y, w: r.w, h: r.h }));
    for (const d of g.doors) if (d.open) {
      const side = sim().room(d.a).built ? d.a : d.b;
      for (const [x, y] of d.cells) L.areas.push({ room: look(side), x, y, w: 1, h: 1 });
    }
    L.props = D().core.props.map((p) => ({ ...p }));
    for (const d of S.devs) {
      const b = sim().bp(d.bp);
      L.props.push({ kind: d.built || d.upTo ? b.prop : 'devframe', x: d.x, y: d.y, w: d.w, h: d.h, dev: d.uid });
    }
    L.lights = S.rooms.filter((r) => r.built).map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, color: r.core ? [255, 214, 170] : [190, 220, 255], radius: Math.max(4, Math.min(8, Math.max(r.w, r.h))) }));
    L.lights.push({ x: 25, y: 7, color: [120, 200, 255], radius: 5 });
  }
  AB.Bus.on('base:plan', () => { if (!sim().on()) return; layout(); rebuild = true; });
  AB.Bus.on('base:new', () => setTimeout(() => toast('В шкафчиках капсулы — ремкомплект: металлолом ×6, электроника ×2. Хватит на 3D-принтер и стеллаж', 'good'), 2500));
  AB.Bus.on('base:built', ({ bp, name, first }) => {
    toast(`Построено: ${name}`, 'good');
    if (bp === 'BLD-101' && first) AB.Flags.add('module');   // задание акта III: первый 3D-принтер
  });
  function frame() {
    pump();
    if (rebuild && AB.IsoGame.sector() === SEC && !AB.IsoGame.busy()) {
      rebuild = false;
      const L = AB.ISO_LAYOUTS[SEC];
      AB.IsoWorld.build(SEC);
      AB.IsoInteract.init(L, SEC);
    }
    if (card && performance.now() - cardT > 400) renderCard();
    hud();
  }

  // ---------- имена устройств: «Стеллаж 2» ----------
  function title(o) {
    if (!o) return '';
    if (o.uid === 'pile') return 'Приёмник шлюза';
    if (o.uid === 'reactor') return 'Реактор капсулы';
    const b = sim().bp(o.bp);
    if (!b) return o.name || '';
    if (b.kind === 'room') return o.core ? (AB.ID.get(o.look) || {}).name : b.name;
    const same = sim().state().devs.filter((d) => d.bp === o.bp);
    return same.length > 1 ? `${b.name} ${same.indexOf(o) + 1}` : b.name;
  }
  const crewName = (id) => (AB.ID.get(id) || {}).name || id;
  // всего материала на базе: стеллажи + приёмник (+ шкафчики для старых ресурсов)
  function stock(item) {
    const S = sim().state();
    let n = S.pile[item] || 0;
    for (const d of sim().racks()) if (d.mat === item) n += d.n;
    return n + (AB.ID.get(item) && AB.ID.get(item).base ? 0 : AB.IsoStash.count(item));
  }

  // ---------- состояние станка словами ----------
  // №72: электросеть устройства: { net, st } — номер сети и её состояние
  function netOf(d) { const n = sim().networks().of.get(d.uid); const ps = sim().state().power; return n == null ? null : { n, st: ps && ps.nets[n] }; }
  function powerState(d) {
    const p = sim().par(d);
    if (!p.draw) return null;
    const nt = netOf(d);
    if (!nt || !nt.st || (nt.st.gen < 0.01 && nt.st.cap === 0)) return { t: 'Нет сети — проведите кабель от реактора', c: 'bad', k: 'none' };
    if (!sim().canPower(d)) return { t: 'Сеть без энергии: выработки нет, батареи пусты', c: 'bad', k: 'dry' };
    if (d.crafter && !d.powered) return { t: 'Не хватает энергии — сеть перегружена (приоритет ниже)', c: 'bad', k: 'short' };
    return { t: 'В сети', c: 'ok', k: 'ok' };
  }
  function status(d) {
    if (d.upTo) return { t: `Улучшается до уровня ${d.upTo}`, c: 'wait' };
    if (!d.built) return { t: 'Строится', c: 'wait' };
    const r = sim().bp(d.bp).recipe ? sim().par(d) : null;
    if (!r) return null;
    const pw = powerState(d);
    if (pw && pw.c === 'bad') return pw;
    const ws = sim().workers(d.uid);
    if (!ws.length) return { t: 'Нет работника — назначьте героя', c: 'bad' };
    if (!ws.some((id) => sim().state().present.includes(id))) return { t: 'Работник не на базе', c: 'bad' };
    if (d.block === 'full') return { t: 'Выход полон — отнесите на склад', c: 'bad' };
    if (d.block === 'nopower') return { t: 'Нет энергии', c: 'bad' };
    if (d.block === 'noinput') return { t: `Нет сырья: ${nm(r.in).toLowerCase()} на стеллажах`, c: 'bad' };
    if (d.crafter) return { t: 'Работает', c: 'ok' };
    return { t: 'Ждёт работника', c: 'wait' };
  }

  // ---------- рисование поверх сцены ----------
  const COL = { ok: '120,255,170', bad: '255,120,90', wait: '255,210,120', info: '94,230,255' };
  function poly(ctx, toScreen, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => { const p = toScreen(x, y); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); }
  const rectPts = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  // на полу: каркасы помещений, проходы к ним, режим стройки (сетка корпуса, призрак)
  function drawFloor(ctx, toScreen, time) {
    if (!sim().on() || AB.IsoGame.sector() !== SEC) return;
    const S = sim().state(), build = AB.BaseBuild && AB.BaseBuild.on();
    if (build) {
      const H = S.hull;
      ctx.strokeStyle = 'rgba(94,230,255,.07)'; ctx.lineWidth = 1;
      for (let x = H.x + 1; x <= H.x + H.w - 1; x++) { const a = toScreen(x, H.y + 1), b = toScreen(x, H.y + H.h - 1); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      for (let y = H.y + 1; y <= H.y + H.h - 1; y++) { const a = toScreen(H.x + 1, y), b = toScreen(H.x + H.w - 1, y); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      poly(ctx, toScreen, rectPts({ x: H.x + 1, y: H.y + 1, w: H.w - 2, h: H.h - 2 }));
      ctx.strokeStyle = 'rgba(94,230,255,.35)'; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
      for (const z of D().reserved || []) { poly(ctx, toScreen, rectPts(z)); ctx.fillStyle = 'rgba(255,120,90,.06)'; ctx.fill(); }
    }
    for (const r of S.rooms) if (!r.built) {
      poly(ctx, toScreen, rectPts(r));
      ctx.fillStyle = `rgba(94,230,255,${0.08 + Math.sin(time * 2) * 0.03})`; ctx.fill();
      ctx.strokeStyle = 'rgba(94,230,255,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      // строительные леса: диагонали по клеткам
      ctx.strokeStyle = 'rgba(94,230,255,.12)';
      for (let i = 0; i < r.w + r.h; i += 2) { const a = toScreen(r.x + Math.min(i, r.w), r.y + Math.max(0, i - r.w)), b = toScreen(r.x + Math.max(0, i - r.h), r.y + Math.min(i, r.h)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    // №72: кабели — по полу; светятся, если в сети есть энергия
    const nets = sim().networks(), ps = S.power || { nets: [] };
    for (const c of S.cables) {
      const n = nets.of.get(c.uid), st = n != null && ps.nets[n], live = c.built && st && (st.gen > 0.01 || st.store > 0.5);
      const a = toScreen(c.x + 0.5, c.y + 0.5), z = toScreen(c.x + c.w - 0.5, c.y + c.h - 0.5);
      ctx.lineCap = 'round';
      ctx.strokeStyle = !c.built ? 'rgba(94,230,255,.45)' : live ? `rgba(255,200,90,${0.55 + Math.sin(time * 3 + c.x) * 0.15})` : 'rgba(150,140,130,.55)';
      ctx.lineWidth = live ? 4 : 3;
      if (!c.built) ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.stroke(); ctx.setLineDash([]);
      if (live) { const k = (time * 0.6 + c.x * 0.1) % 1; ctx.fillStyle = 'rgba(255,240,180,.9)'; ctx.beginPath(); ctx.arc(a.x + (z.x - a.x) * k, a.y + (z.y - a.y) * k, 2.2, 0, 7); ctx.fill(); }
    }
    for (const d of sim().geom().doors) if (!d.open) for (const [x, y] of d.cells) { poly(ctx, toScreen, rectPts({ x, y, w: 1, h: 1 })); ctx.fillStyle = 'rgba(94,230,255,.18)'; ctx.fill(); }
    if (build) AB.BaseBuild.drawFloor(ctx, toScreen, time, poly, rectPts);
    const sel = card && card.uid && sim().obj(card.uid);
    if (sel) { poly(ctx, toScreen, rectPts(sel)); ctx.strokeStyle = 'rgba(255,226,168,.8)'; ctx.lineWidth = 2; ctx.stroke(); }
  }
  function label(ctx, x, y, text, col, size = 10) {
    ctx.font = `${size}px "Share Tech Mono", monospace`; ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(6,8,10,.78)'; ctx.fillRect(x - w / 2, y - size - 3, w, size + 6);
    ctx.fillStyle = `rgba(${col},.95)`; ctx.fillText(text, x, y);
  }
  function bar(ctx, x, y, w, f, col) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = `rgba(${col},.95)`; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), 4);
  }
  // сверху: подписи станков, складов и строек; груз в руках героев
  function drawTop(ctx, toScreen, time) {
    if (!sim().on() || AB.IsoGame.sector() !== SEC) return;
    drawFloor(ctx, toScreen, time);       // каркасы и стройка — поверх света, чтобы их было видно и в тёмной части корпуса
    const S = sim().state();
    for (const d of S.devs) {
      const b = sim().bp(d.bp), c = toScreen(d.x + d.w / 2, d.y + d.h / 2), top = c.y - 70;
      if (!d.built) { frameTag(ctx, d, c.x, c.y - 30); continue; }
      const p = sim().par(d), lv = (d.lvl || 1) > 1 ? ` ур.${d.lvl}` : '';
      if (p.gen) { label(ctx, c.x, top + 4, `⚡ ${sim().genOf(d).toFixed(1)}/с${lv}`, '255,210,120'); continue; }
      if (p.battery) { const f = (d.charge || 0) / p.battery; label(ctx, c.x, top + 18, `АКБ ${Math.round(d.charge || 0)}/${p.battery}${lv}`, f > 0.05 ? COL.ok : COL.bad); bar(ctx, c.x, top + 24, 40, f, COL.ok); if (!netOf(d)) { ctx.fillStyle = 'rgba(255,120,90,.9)'; ctx.font = 'bold 13px "Oswald", sans-serif'; ctx.fillText('⚡✕', c.x, top - 2); } continue; }
      if (d.uid === 'pile') {
        const items = Object.entries(S.pile).filter(([, n]) => n > 0);
        if (items.length) label(ctx, c.x, c.y - 26, items.map(([i, n]) => `${short(i)} ${n}`).join(' · '), COL.wait);
        continue;
      }
      if (b.store) { label(ctx, c.x, top + 10, d.mat ? `${short(d.mat)} ${d.n}/${p.cap}${d.auto ? ' · авто' : ''}${lv}` : `пусто${lv}`, d.mat ? (d.auto ? COL.ok : COL.info) : '170,170,170'); continue; }
      if (b.recipe) {
        const r = p, st = status(d), pw = powerState(d);
        label(ctx, c.x, top, `${short(r.in)} ${(d.in || {})[r.in] || 0} → ${short(r.out)} ${(d.out || {})[r.out] || 0}/${r.outCap}${lv}`, st.c === 'ok' ? COL.ok : st.c === 'bad' ? COL.bad : COL.wait);
        if (d.crafter) bar(ctx, c.x, top + 6, 50, (d.prog || 0) / r.time, COL.ok);
        if (st.c === 'bad') { const a = 0.6 + Math.sin(time * 5) * 0.35; ctx.fillStyle = `rgba(255,120,90,${a})`; ctx.font = 'bold 16px "Oswald", sans-serif'; ctx.fillText(pw && pw.c === 'bad' ? '⚡✕' : '!', c.x, top - 16); }
        else if (d.crafter && d.powered) { ctx.fillStyle = 'rgba(255,210,120,.85)'; ctx.font = '12px "Oswald", sans-serif'; ctx.fillText(`⚡${p.draw}`, c.x + 34, top - 2); }
      }
    }
    for (const r of S.rooms) if (!r.built) { const c = toScreen(r.x + r.w / 2, r.y + r.h / 2); frameTag(ctx, r, c.x, c.y); }
    for (const r of S.cables) if (!r.built) { const c = toScreen(r.x + r.w / 2, r.y + r.h / 2); frameTag(ctx, r, c.x, c.y - 8); }
    // груз в руках
    for (const w of Object.values(S.crew)) {
      if (w.away || !w.carry) continue;
      const c = toScreen(w.x, w.y);
      label(ctx, c.x, c.y - 84, `${short(w.carry.item)} ×${w.carry.n}`, COL.wait, 9);
    }
  }
  function frameTag(ctx, f, x, y) {
    const need = f.need.reduce((a, [, n]) => a + n, 0), got = f.need.reduce((a, [i, n]) => a + Math.min(n, f.got[i] || 0), 0);
    const total = sim().workOf(sim().bp(f.bp), f);
    const done = got >= need;
    const what = f.upTo ? `${title(f)} → ур.${f.upTo}` : title(f), tot = f.upTo ? ((sim().bp(f.bp).levels || [])[f.upTo - 1] || {}).work || total : total;
    label(ctx, x, y - 6, done ? `${what}: строят` : `${what}: ${got}/${need} материала`, done ? COL.ok : COL.info);
    bar(ctx, x, y, 56, done ? 1 - f.work / Math.max(1, tot) : got / Math.max(1, need), done ? COL.ok : COL.info);
  }

  // ---------- нажатие в капсуле ----------
  function cellAt(cx, cy) { const p = AB.IsoRender.pick(cx, cy); return { x: Math.floor(p.x), y: Math.floor(p.y), fx: p.x, fy: p.y }; }
  function objAt(x, y) {
    const S = sim().state(), inR = (o) => x >= o.x && y >= o.y && x < o.x + o.w && y < o.y + o.h;
    return S.devs.find(inR) || S.cables.find((c) => !c.built && inR(c)) || S.rooms.find((r) => !r.built && inR(r)) || S.rooms.find(inR) || null;
  }
  function tap(cx, cy) {
    if (!sim().on() || AB.IsoGame.sector() !== SEC) return false;
    if (AB.BaseBuild && AB.BaseBuild.on()) return AB.BaseBuild.tap(cx, cy);
    const c = cellAt(cx, cy);
    // устройства — по клетке и чуть выше (высокие предметы нажимают по корпусу)
    let o = null;
    for (const k of [0, 1, 2]) { o = objAt(c.x + k, c.y + k); if (o && (k === 0 || !sim().room(o.uid))) break; o = null; }
    if (!o) o = objAt(c.x, c.y);
    if (o && (sim().dev(o.uid) || !o.built)) { open(o.uid); return true; }
    if (card && card.uid) { close(); }
    return false;          // пульт, шкафчики — как раньше
  }

  // ---------- карточки ----------
  let card = null, cardT = 0, cardHtml = '';
  const el = (id) => document.getElementById(id);
  function open(uid) { card = { uid }; cardHtml = ''; renderCard(); }
  function openCrew(id) { card = { crew: id || null }; cardHtml = ''; renderCard(); }
  function close() { card = null; cardHtml = ''; const c = el('bx-card'); if (c) c.hidden = true; }
  function chips(list) { return list.map(([act, text, on, dis]) => `<button class="bx-chip${on ? ' on' : ''}" data-act="${esc(act)}"${dis ? ' disabled' : ''}>${text}</button>`).join(''); }
  function renderCard() {
    cardT = performance.now();
    const box = el('bx-card'); if (!box) return;
    if (!card || !sim().on() || AB.IsoGame.sector() !== SEC || AB.IsoOverworld.isOpen()) { box.hidden = true; return; }
    const html = card.crew !== undefined ? crewCard() : objCard();
    if (html == null) { close(); return; }
    if (html !== cardHtml) { box.innerHTML = html; cardHtml = html; }
    box.hidden = false;
  }
  function matLine(items) { return items.map(([i, n, have]) => `<span class="${have != null && have < n ? 'bad' : ''}">${esc(nm(i))} ${have != null ? `${Math.min(have, n)}/` : ''}${n}</span>`).join(' · '); }
  function objCard() {
    const S = sim().state(), o = sim().obj(card.uid);
    if (!o) return null;
    const b = sim().bp(o.bp);
    const head = (sub) => `<div class="bx-head"><b>${esc(title(o))}</b><button class="bx-x" data-act="close" aria-label="Закрыть">✕</button></div>${sub ? `<div class="muted">${sub}</div>` : ''}`;
    if (!o.built) {
      const builders = Object.values(S.crew).filter((w) => w.jobs.includes('build')).map((w) => crewName(w.id));
      const need = o.need.map(([i, n]) => [i, n, o.got[i] || 0]);
      const delivered = o.need.every(([i, n]) => (o.got[i] || 0) >= n);
      return `${head(o.upTo ? `Улучшение до уровня ${o.upTo}: устройство стоит, пока строители не закончат` : `Каркас · ${o.w}×${o.h}`)}
        <div>Материалы: ${matLine(need)}</div>
        <div>${delivered ? `Строят: осталось ${Math.ceil(o.work)} с работы` : 'Ждёт материалы: строители носят их со стеллажей и из шкафчиков'}</div>
        <div class="muted">Строители (работа «Стройка»): ${builders.length ? esc(builders.join(', ')) : '<span class="bad">никого</span> — откройте «Экипаж»'}</div>
        <div class="bx-row">${chips([['build', 'Перестроить или снести → режим стройки']])}</div>`;
    }
    if (o.uid === 'pile') {
      const items = Object.entries(S.pile).filter(([, n]) => n > 0);
      const rows = items.map(([i, n]) => `<div class="bx-line"><span>${esc(nm(i))} ×${n}</span>${rackPick(`pile|${i}`, i)}</div>`).join('');
      return `${head('Сюда отряды сгружают добычу с карты дна. Отсюда её разносят по стеллажам.')}
        ${rows || '<div class="muted">Пусто. Добудьте реголит на карте дна: отряд встаёт на россыпь и копает, а у базы сгружает.</div>'}
        <div class="muted">Первый раз укажите стеллаж сами. Потом включите на нём «Автохранение» — герои с работой «Переноска» будут разносить сами.</div>`;
    }
    if (b.store) {
      const mats = ['ITEM-016', 'ITEM-017', 'ITEM-001', 'ITEM-002', 'ITEM-003'];
      const cap = sim().par(o).cap;
      return `${head(`Склад одного материала · вмещает ${cap}`)}
        <div>${o.mat ? `Хранит: <b class="v">${esc(nm(o.mat))}</b> — ${o.n} из ${cap}` : 'Материал не назначен'}</div>
        ${upLine(o)}
        <div class="bx-row">${chips([['auto', `Автохранение: ${o.auto ? 'ВКЛ' : 'выкл'}`, o.auto, !o.mat]])}</div>
        <div class="muted">${o.mat ? (o.auto ? 'Герои сами приносят сюда этот материал: из приёмника и с выхода станков.' : 'Включите автохранение — и материал будут приносить сюда без приказов.') : 'Назначьте материал или отнесите сюда груз из приёмника или со станка.'}</div>
        ${o.n === 0 ? `<div class="bx-row">${chips(mats.map((i) => [`mat|${i}`, esc(nm(i)), o.mat === i]))}${o.mat ? chips([['mat|', 'Снять назначение']]) : ''}</div>` : ''}`;
    }
    if (b.gen || b.battery) {
      const p = sim().par(o), nt = netOf(o), st = nt && nt.st;
      return `${head(b.desc)}
        ${p.gen ? `<div>Выработка сейчас: <b class="v">${sim().genOf(o).toFixed(1)}</b> энергии/с${b.wave ? ` (в среднем ${p.gen}, течение меняется)` : ''}</div>` : ''}
        ${p.battery ? `<div>Заряд: <b class="v">${Math.round(o.charge || 0)}</b> из ${p.battery}</div>` : ''}
        ${netLine(o)}
        ${o.core ? '' : upLine(o)}`;
    }
    if (b.recipe) {
      const r = sim().par(o), st = status(o), crewIds = AB.IsoActs.crew();
      const ws = sim().workers(o.uid);
      const outN = (o.out || {})[r.out] || 0;
      return `${head(`${esc(nm(r.in))} ×${r.inN} → ${esc(nm(r.out))} ×${r.outN} за ${r.time} с`)}
        <div class="bx-st ${st.c}">${esc(st.t)}</div>
        <div>Вход: ${esc(nm(r.in))} ${(o.in || {})[r.in] || 0}/${r.inCap} · Выход: ${esc(nm(r.out))} ${outN}/${r.outCap} · сделано всего: ${o.made || 0}</div>
        <div>Энергия: ${r.draw} в секунду, пока работает · приоритет:</div>
        <div class="bx-row">${chips([[`prio|3`, 'высокий', o.prio === 3], [`prio|2`, 'обычный', (o.prio || 2) === 2], [`prio|1`, 'низкий', o.prio === 1]])}</div>
        ${netLine(o)}
        ${upLine(o)}
        <div class="muted">Работники (нужен хотя бы один):</div>
        <div class="bx-row">${chips(crewIds.map((id) => [`work|${id}`, esc(crewName(id)), ws.includes(id)]))}</div>
        ${outN ? `<div class="bx-line"><span>Отнести ${esc(nm(r.out).toLowerCase())} (${outN}) на склад:</span>${rackPick(`out|${o.uid}|${r.out}`, r.out)}</div>` : ''}
        <div class="muted">Работник сам носит ${esc(nm(r.in).toLowerCase())} со стеллажа. Готовое уносит на стеллаж с автохранением этого материала — пока его нет, станок встанет, когда выход заполнится.</div>`;
    }
    return head(b.desc || '');
  }
  // №72: строка про сеть устройства и улучшение
  function netLine(o) {
    const nt = netOf(o);
    if (!nt || !nt.st) return '<div class="bad">Не подключено: к устройству должен примыкать кабель сети</div>';
    const st = nt.st;
    return `<div class="muted">Сеть: выработка ${st.gen.toFixed(1)}/с · расход ${st.use.toFixed(1)}/с${st.short ? ` <span class="bad">(нужно ${st.need.toFixed(1)} — не хватает)</span>` : ''} · батареи ${Math.round(st.store)}/${st.cap} · устройств и кабелей: ${st.members}</div>`;
  }
  function upLine(o) {
    const b = sim().bp(o.bp), L = b.levels || [], lv = o.lvl || 1;
    if (!L.length) return '';
    if (lv >= L.length) return `<div class="muted">Уровень ${lv} — наивысший</div>`;
    const next = L[lv], cur = sim().par(o), nx = sim().par({ ...o, lvl: lv + 1 });
    const fx = [];
    if (nx.time !== cur.time) fx.push(`цикл ${cur.time} → ${nx.time} с`);
    if (nx.outCap !== cur.outCap) fx.push(`выход ${cur.outCap} → ${nx.outCap}`);
    if (nx.cap !== cur.cap) fx.push(`вмещает ${cur.cap} → ${nx.cap}`);
    if (nx.battery !== cur.battery) fx.push(`ёмкость ${cur.battery} → ${nx.battery}`);
    if (nx.gen !== cur.gen) fx.push(`выработка ${cur.gen} → ${nx.gen}`);
    if (nx.draw !== cur.draw) fx.push(`<span class="bad">энергия ${cur.draw} → ${nx.draw}/с</span>`);
    const cost = next.up.map(([i, n]) => [i, n, stock(i)]);
    return `<div class="bx-line"><span>Уровень ${lv} → ${lv + 1}: ${fx.join(' · ')}</span></div>
      <div class="bx-line"><span class="muted">Цена: ${matLine(cost)} · работа ${next.work} с</span>${chips([['upg', 'Улучшить']])}</div>`;
  }
  // выбор стеллажа для приказа «отнести»: подходящие — пустые или с этим же материалом
  function rackPick(key, item) {
    const list = sim().racks().filter((d) => !d.mat || d.mat === item);
    if (!list.length) return '<span class="bad">Нет стеллажа — постройте в режиме стройки</span>';
    return `<span class="bx-row">${list.map((d) => `<button class="bx-chip" data-act="give|${esc(key)}|${d.uid}">${esc(title(d))}${d.mat ? ` (${d.n})` : ' (пусто)'}</button>`).join('')}</span>`;
  }
  const JOB_NAME = { build: 'Стройка', haul: 'Переноска' };
  const jobName = (j) => JOB_NAME[j] || title(sim().dev(j)) || j;
  function crewCard() {
    const S = sim().state(), ids = AB.IsoActs.crew();
    const rows = ids.map((id) => {
      const w = sim().worker(id), here = S.present.includes(id);
      const task = !here ? 'не на базе' : w.task ? w.task.label : 'свободен';
      const jobs = w.jobs.map((j, i) => `<span class="bx-job"><i>${i + 1}</i>${esc(jobName(j))}<button data-act="up|${id}|${i}" ${i ? '' : 'disabled'} aria-label="Выше">▲</button><button data-act="del|${id}|${i}" aria-label="Убрать">✕</button></span>`).join('');
      const can = [['build', 'Стройка'], ['haul', 'Переноска'], ...S.devs.filter((d) => d.built && sim().bp(d.bp).recipe).map((d) => [d.uid, title(d)])].filter(([j]) => !w.jobs.includes(j));
      return `<div class="bx-crew"><div class="bx-line"><b>${esc(crewName(id))}</b><span class="muted">${esc(task)}${w.carry ? ` · несёт ${esc(nm(w.carry.item).toLowerCase())} ×${w.carry.n}` : ''}</span></div>
        <div class="bx-jobs">${jobs || '<span class="muted">Нет работ — герой отдыхает</span>'}</div>
        <div class="bx-row">${can.map(([j, t]) => `<button class="bx-chip" data-act="add|${id}|${esc(j)}">+ ${esc(t)}</button>`).join('')}</div></div>`;
    }).join('');
    return `<div class="bx-head"><b>Экипаж и работы</b><button class="bx-x" data-act="close" aria-label="Закрыть">✕</button></div>
      <div class="muted">Герой делает первую работу в своём списке, где есть дело; если там пусто — переходит к следующей.</div>${rows}`;
  }
  function onCard(e) {
    const btn = e.target.closest('[data-act]'); if (!btn || btn.disabled) return;
    const [a, x, y, z] = btn.dataset.act.split('|');
    const o = card && card.uid && sim().obj(card.uid);
    if (a === 'close') { close(); return; }
    if (a === 'build') { close(); AB.BaseBuild.toggle(true); return; }
    if (a === 'auto' && o) sim().setRack(o.uid, { auto: !o.auto });
    if (a === 'prio' && o) sim().setPrio(o.uid, +x);
    if (a === 'upg' && o) { const r = sim().upgrade(o.uid); toast(r.ok ? 'Улучшение: строители принесут материалы — пока устройство стоит' : r.why, r.ok ? 'good' : 'info'); }
    if (a === 'mat' && o) sim().setRack(o.uid, { mat: x || null });
    if (a === 'work' && o) sim().assign(x, o.uid, !sim().workers(o.uid).includes(x));
    if (a === 'give') {
      // give|pile|ITEM|rack  или  give|out|dev|ITEM|rack
      const parts = btn.dataset.act.split('|');
      const r = parts[1] === 'pile' ? sim().order({ pile: true }, parts[2], parts[3]) : sim().order({ uid: parts[2], slot: 'out' }, parts[3], parts[4]);
      toast(r.ok ? 'Приказ отдан: герой отнесёт груз на стеллаж' : r.why, r.ok ? 'good' : 'info');
    }
    if (a === 'up') { const w = sim().worker(x), i = +y; const j = w.jobs.slice(); [j[i - 1], j[i]] = [j[i], j[i - 1]]; sim().setJobs(x, j); }
    if (a === 'del') { const w = sim().worker(x), j = w.jobs.slice(); const [gone] = j.splice(+y, 1); if (sim().dev(gone)) sim().assign(x, gone, false); else sim().setJobs(x, j); }
    if (a === 'add') { if (sim().dev(y)) sim().assign(x, y, true); else sim().setJobs(x, [...sim().worker(x).jobs, y]); }
    cardHtml = ''; renderCard();
    sim().save();
  }

  // ---------- панель базы: ресурсы, стройка, экипаж ----------
  let hudHtml = '';
  function hud() {
    const box = el('bx'); if (!box) return;
    const show = sim().on() && AB.IsoGame.sector() === SEC && !AB.IsoOverworld.isOpen();
    box.hidden = !show;
    if (!show) return;
    const res = el('bx-res');
    const items = [['ITEM-016'], ['ITEM-017'], ['ITEM-001'], ['ITEM-002']];
    const ps = sim().state().power, nets = (ps && ps.nets || []).filter((n) => n && (n.gen > 0.01 || n.cap));
    const gen = nets.reduce((a, n) => a + n.gen, 0), use = nets.reduce((a, n) => a + n.use, 0), stv = nets.reduce((a, n) => a + n.store, 0), cap = nets.reduce((a, n) => a + n.cap, 0), short_ = nets.some((n) => n.short);
    const html = items.map(([i]) => `<span title="${esc(nm(i))}"><i>${esc(short(i))}</i>${stock(i)}</span>`).join('')
      + `<span class="${short_ ? 'bad' : ''}" title="Энергия: расход / выработка в секунду · заряд батарей"><i>⚡</i>${use.toFixed(0)}/${gen.toFixed(0)}${cap ? ` <i>АКБ</i>${Math.round(stv)}/${cap}` : ''}</span>`;
    if (html !== hudHtml) { res.innerHTML = html; hudHtml = html; }
    el('bx-build').classList.toggle('on', !!(AB.BaseBuild && AB.BaseBuild.on()));
  }
  function init() {
    const c = el('bx-card');
    if (c) c.addEventListener('click', onCard);
    const b = el('bx-build'); if (b) b.addEventListener('click', () => { close(); AB.BaseBuild.toggle(); });
    const k = el('bx-crew'); if (k) k.addEventListener('click', () => { if (card && card.crew !== undefined) close(); else openCrew(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  AB.Bus.on('iso:travel', ({ sector }) => { if (sector === SEC && sim().on()) { layout(); rebuild = true; } else close(); });

  return { frame, drawFloor, drawTop, tap, open, openCrew, close, title, stock, layout, present, pump, card: () => card };
})();
