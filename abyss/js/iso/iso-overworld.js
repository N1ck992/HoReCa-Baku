// =====================================================================
// ISO OVERWORLD (дополнения №54–63). Дно океана вокруг «Абисса» — карта из
// шестиугольников под углом. №63 (решение автора: «управление базой и
// отрядами вне базы — как в Warpath»):
//   • на карте — база (в акте II это «Абисс», в акте III — капсула, её можно
//     вести по дну) и отряды: герой в своём транспорте (Марк — экзокостюм);
//   • внизу справа — карточки: база и герои; у героя — его транспорт, здоровье,
//     что делает; «Выйти» — отряд выходит из базы, «Отозвать» — возвращается;
//   • выбранная карточка — тот, кто идёт по нажатию на клетку; нажать на тварь —
//     отряд подходит и бьёт (костюм — на 2 клетки, сам, как только достаёт);
//   • по дну бродят твари и исполины, они появляются снова; с них — добыча;
//   • разбитый костюм не гибнет: отряд отступает на базу и чинится там.
// Транспорт — только снаружи (№58): в базе и на корабле — герои пешком.
// =====================================================================

AB.IsoOverworld = (() => {
  const D = () => AB.OVERWORLD;
  const SQ3 = Math.sqrt(3);
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const key = (q, r) => `${q},${r}`;
  let open_ = false, cv, g, dpr = 1;
  const cells = new Map();             // q,r → { q, r, kind, seen }
  let cam = { x: 0, y: 0 }, size = 34, time = 0, last = 0, onSite = null;
  let mode = 'suit';                   // 'suit' — акт II (база — «Абисс»), 'capsule' — акт III (база — капсула)
  const viewR = () => (AB.IsoActs ? AB.IsoActs.view() : 2);
  const shown = (s) => !AB.IsoActs || AB.IsoActs.siteVisible(s);
  const SUIT = () => AB.RIGS.EXOSUIT;

  const inside = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= D().radius;
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  // №64: капсула по дну идёт медленно — 5 с на клетку (решение автора); костюм — 0,75 с
  const TILT = 0.6, STEP = 0.75, BASE_STEP = 5;
  const px = (q, r) => ({ x: size * SQ3 * (q + r / 2), y: size * 1.5 * r * TILT });
  const siteAt = (q, r) => D().sites.find((s) => s.q === q && s.r === r) || null;
  const passable = (q, r) => { const c = cells.get(key(q, r)); return !!c && c.kind !== 'rock' && c.kind !== 'trench'; };

  // ---------- рельеф ----------
  function build() {
    const rng = AB.util.rng(D().seed), R = D().radius;
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
      if (!inside(q, r)) continue;
      const n = rng();
      cells.set(key(q, r), { q, r, kind: n < 0.13 ? 'rock' : n < 0.2 ? 'crystal' : 'silt', seen: false });
    }
    let q = -R + 1, r = 4;
    for (let i = 0; i < R * 2; i++) {
      if (inside(q, r) && !siteAt(q, r) && cells.has(key(q, r))) cells.get(key(q, r)).kind = 'trench';
      q++; if (rng() < 0.4) r--;
    }
    for (const s of D().sites) {
      cells.get(key(s.q, s.r)).kind = s.kind === 'crystal' ? 'crystal' : 'silt';
      for (const [dq, dr] of DIRS) { const c = cells.get(key(s.q + dq, s.r + dr)); if (c && c.kind === 'rock') c.kind = 'silt'; }
    }
    for (const s of D().sites) if (!route(D().start, s)) carve(D().start, s);
  }
  function carve(a, b) {
    let c = { ...a };
    while (c.q !== b.q || c.r !== b.r) {
      const n = DIRS.map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr })).filter((x) => inside(x.q, x.r)).sort((x, y) => dist(x, b) - dist(y, b))[0];
      const cell = cells.get(key(n.q, n.r)); if (cell.kind === 'rock' || cell.kind === 'trench') cell.kind = 'silt';
      c = n;
    }
  }
  function route(a, b) {
    if (!passable(b.q, b.r)) return null;
    const open = [{ q: a.q, r: a.r, g: 0, f: dist(a, b) }], from = new Map([[key(a.q, a.r), null]]), gs = new Map([[key(a.q, a.r), 0]]);
    while (open.length) {
      open.sort((x, y) => x.f - y.f);
      const c = open.shift();
      if (c.q === b.q && c.r === b.r) {
        const out = []; let k = key(c.q, c.r);
        while (from.get(k)) { const [q, r] = k.split(',').map(Number); out.unshift({ q, r }); k = from.get(k); }
        return out;
      }
      for (const [dq, dr] of DIRS) {
        const n = { q: c.q + dq, r: c.r + dr }, k = key(n.q, n.r);
        if (!passable(n.q, n.r)) continue;
        const ng = c.g + 1;
        if (ng < (gs.has(k) ? gs.get(k) : 1e9)) { gs.set(k, ng); from.set(k, key(c.q, c.r)); open.push({ ...n, g: ng, f: ng + dist(n, b) }); }
      }
    }
    return null;
  }

  // ---------- база и отряды ----------
  // единица на карте: { id, kind: 'base'|'squad', q, r, path, anim, stride, face, ... }
  const base = { id: 'base', kind: 'base', q: 0, r: 0, path: [], anim: null, stride: 0, face: 1 };
  const squads = [];                    // { id (герой), vehicle, state: 'home'|'out'|'retreat', q, r, path, anim, target, atk, atkT, flash, stride, face }
  let sel = null;                       // кто выбран: 'base' или ID героя
  const unit = (id) => (id === 'base' ? base : squads.find((s) => s.id === id)) || null;
  const selU = () => unit(sel) || squads.find((s) => s.state !== 'home') || base;
  const at = (u) => (u.anim ? u.anim.to : { q: u.q, r: u.r });
  const outSquads = () => squads.filter((s) => s.state !== 'home');
  // у кого из экипажа есть транспорт (пока один экзокостюм — у Марка)
  function syncSquads() {
    const crew = AB.IsoActs ? AB.IsoActs.crew() : ['CHAR-001'];
    for (const id of crew) if (!squads.some((s) => s.id === id)) {
      const vehicle = id === 'CHAR-001' ? 'EQUIP-005' : null;
      squads.push({ id, kind: 'squad', vehicle, state: 'home', q: base.q, r: base.r, path: [], anim: null, target: null, atk: null, atkT: 0, flash: 0, stride: 0, face: 1 });
    }
  }
  function deploy(id) {
    const s = unit(id);
    if (!s || !s.vehicle || s.state !== 'home') return false;
    s.state = 'out'; s.q = base.q; s.r = base.r; s.path = []; s.anim = null;
    sel = id; reveal();
    say(`${AB.ID.get(id).name}: экзокостюм вышел из базы`);
    return true;
  }
  function recall(id) {
    const s = unit(id);
    if (!s || s.state === 'home') return;
    s.target = null;
    const p = route(at(s), base);
    if (p && p.length) { s.path = p; s.state = 'retreat'; s.recall = true; }
    else dock(s);
  }
  function dock(s) {
    s.state = 'home'; s.path = []; s.anim = null; s.target = null; s.recall = false;
    s.q = base.q; s.r = base.r;
    if (sel === s.id && mode === 'capsule') sel = 'base';
  }
  // разбитый костюм: отступает на базу (не гибнет, как раненые в Warpath)
  function retreat(s) {
    const c = AB.Chars.get(s.id); if (c) c.hp = Math.max(1, c.hp);
    s.target = null; s.atk = null; s.state = 'retreat';
    s.path = route(at(s), base) || [];
    say(`${AB.ID.get(s.id).name}: костюм разбит — отступление на базу, там починят`);
  }

  // ---------- открыть / закрыть ----------
  function init() {
    cv = document.getElementById('ow-map'); g = cv.getContext('2d');
    build();
    base.q = D().start.q; base.r = D().start.r;
    // №65: свободная камера — перетаскивание двигает обзор, колесо и щипок — масштаб;
    // короткое нажатие без сдвига — приказ (идти / бить)
    const ptrs = new Map();
    let drag = null, pinch = null;
    cv.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoomK }; drag = null; return; }
      drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d)); return; }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 8) drag.moved = true;
      if (drag.moved) { fly = null; cam.x = drag.cx - dx * dpr; cam.y = drag.cy - dy * dpr; clampCam(); }
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (drag && !drag.moved && e.type === 'pointerup') {
        const t = pick(e.clientX, e.clientY);
        if (t && cells.has(key(t.q, t.r))) tapCell(t);
      }
      drag = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoomK * (e.deltaY > 0 ? 0.9 : 1.1)); }, { passive: false });
    document.getElementById('ow-act').addEventListener('click', () => {
      if (!onSite) return;
      if (onSite.key === 'abyss') back(); else if (AB.IsoActs) AB.IsoActs.doSite(onSite);
    });
    // №68: нижняя панель как в Warpath. «Моя база» — войти в капсулу; меню — вести базу, вещи, все отряды, всплыть;
    // ячейки отрядов: нажатие — выйти из базы / выбрать и подлететь; у выбранного — «Отозвать»
    const bar = document.getElementById('ow-bar');
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.addEventListener('click', (e) => {
      const m = e.target.closest('[data-ow]'), b = e.target.closest('[data-do]'), c = e.target.closest('[data-u]');
      if (e.target.closest('#ow-mybase')) { if (mode !== 'capsule') { say('База появится вместе с капсулой'); return; } for (const s of squads) if (s.state !== 'home') dock(s); AB.IsoActs.enterBase(); return; }
      if (m) {
        const k = m.dataset.ow;
        if (k === 'drive') { selAll = false; sel = 'base'; flyTo(base); say('Капсула выбрана: нажмите на клетку — база поедет туда'); }
        if (k === 'items') AB.IsoInventory.open();
        if (k === 'all') { selAll = !selAll && outSquads().some((s) => s.state === 'out'); say(selAll ? 'Выбраны все отряды снаружи' : 'Выбор: один отряд'); }
        if (k === 'surface') AB.IsoActs.surface();
        squadsSig = ''; return;
      }
      if (b) { const id = b.closest('[data-u]').dataset.u; if (b.dataset.do === 'out') deploy(id); else recall(id); squadsSig = ''; flyTo(unit(id)); return; }
      if (c) {
        const u = unit(c.dataset.u); if (!u) return;
        selAll = false;
        if (u.state === 'home' && u.vehicle) deploy(u.id); else sel = u.id;
        squadsSig = ''; flyTo(selU());
      }
    });
    window.addEventListener('keydown', (e) => { if (open_ && e.code === 'Escape') { const s = siteAt(selU().q, selU().r); if (s && s.key === 'abyss') back(); } });
    window.addEventListener('resize', () => { if (open_) fit(); });
  }
  // нажали на клетку: выбранный отряд идёт туда (на тварь — подходит и бьёт); выбрана база — ведём капсулу
  let selAll = false;
  function tapCell(t) {
    // «Все отряды»: ведём всех снаружи разом
    if (selAll && !mobAt(t.q, t.r)) {
      let any = false;
      for (const s of outSquads()) if (s.state === 'out') { const p = route(at(s), t); if (p) { s.path = p; s.target = null; any = true; } }
      if (!any) say('Туда не пройти');
      return;
    }
    let u = selU();
    const mb = mobAt(t.q, t.r);
    if (mb) {
      if (u.kind === 'base') { const s = squads.find((q) => q.vehicle && q.state !== 'retreat'); if (s && s.state === 'home') deploy(s.id); u = s || u; }
      if (u.kind !== 'squad' || u.state === 'retreat') { say('Нужен отряд в транспорте: «Выйти» на карточке героя'); return; }
      u.target = mb; sel = u.id;
      if (dist(at(u), mb) <= SUIT().weapon.reachCells) { u.path = []; return; }
    } else if (u.kind === 'squad') u.target = null;
    if (u.kind === 'base' && mode !== 'capsule') { say('«Абисс» не сдвинуть — выберите отряд'); return; }
    if (u.kind === 'squad' && u.state === 'retreat') { say('Отряд отступает на базу'); return; }
    const p = route(at(u), t);
    if (!p) { say('Туда не пройти'); return; }
    u.path = p;
  }
  function enter() {
    open_ = true;
    syncSquads();
    // акт II: базы-капсулы нет, Марк выходит из «Абисса» сразу в костюме
    if (mode === 'suit') { const m = unit('CHAR-001'); if (m && m.state === 'home') { m.state = 'out'; m.q = base.q; m.r = base.r; } sel = 'CHAR-001'; }
    else if (!unit(sel)) sel = 'base';
    spawnMobs();
    reveal(); onSite = undefined; squadsSig = '';
    document.getElementById('ow').hidden = false;
    document.getElementById('ow-mybase').hidden = mode !== 'capsule';
    for (const b of document.querySelectorAll('#ow-menu [data-ow="drive"], #ow-menu [data-ow="all"]')) b.hidden = mode !== 'capsule';
    fit(); last = performance.now();
    const u = selU(), p = px(u.q, u.r); cam.x = p.x; cam.y = p.y; fly = null;
    requestAnimationFrame(loop);
    AB.Bus.emit('ow:enter', {});
  }
  // вернуться на корабль: выбранный (отряд или капсула) — у «Абисса»
  function back() {
    const u = selU(), s = siteAt(u.q, u.r);
    if (!s || s.key !== 'abyss') { say('Вернуться на корабль можно только у «Абисса»'); return; }
    if (mode === 'suit') { const m = unit('CHAR-001'); if (m) dock(m); }
    close();
    AB.Bus.emit('ow:exit', {});
  }
  function close() { open_ = false; document.getElementById('ow').hidden = true; }
  function say(t) { const el = document.getElementById('ow-say'); el.textContent = t; el.classList.add('show'); clearTimeout(say.t); say.t = setTimeout(() => el.classList.remove('show'), 2000 + t.length * 40); }

  // масштаб и свободная камера (№65)
  let zoomK = 1, baseSize = 34, fly = null;
  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
    baseSize = Math.max(22, Math.min(40, Math.min(cv.clientWidth, cv.clientHeight) / 11)) * dpr;
    size = baseSize * zoomK;
  }
  function setZoom(z) {
    const k0 = zoomK;
    zoomK = Math.max(0.55, Math.min(2, z));
    size = baseSize * zoomK;
    cam.x *= zoomK / k0; cam.y *= zoomK / k0;            // масштаб вокруг центра экрана
    if (fly) { const p = curPos(fly); fly.tx = p.x; fly.ty = p.y; }
    clampCam();
  }
  function clampCam() {
    const R = D().radius + 1, lim = size * SQ3 * R;
    cam.x = Math.max(-lim, Math.min(lim, cam.x)); cam.y = Math.max(-lim * TILT, Math.min(lim * TILT, cam.y));
  }
  // подлететь камерой к отряду или базе (один раз — дальше камера снова свободна)
  function flyTo(u) { if (u) fly = u; }
  function pick(cx, cy) {
    const rc = cv.getBoundingClientRect();
    const x = ((cx - rc.left) * dpr - cv.width / 2 + cam.x) / size, y = ((cy - rc.top) * dpr - cv.height / 2 + cam.y) / size / TILT;
    let q = (SQ3 / 3) * x - y / 3, r = (2 / 3) * y, s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  }
  function reveal() {
    const eyes = [base, ...outSquads()];
    for (const c of cells.values()) if (!c.seen && eyes.some((u) => dist(c, u) <= viewR())) c.seen = true;
  }
  const near = (c) => [base, ...outSquads()].some((u) => dist(c, u) <= viewR());

  // ---------- движение ----------
  function stepUnit(u, dt, secs) {
    if (u.kind === 'squad' && u.target && u.target.hp > 0 && u.state === 'out') {
      if (dist(at(u), u.target) <= SUIT().weapon.reachCells) u.path = [];
      else if (!u.path.length && !u.anim) { const p = route(u, u.target); if (p) u.path = p; }
    }
    if (!u.anim && u.path.length && u.kind === 'squad' && mobAt(u.path[0].q, u.path[0].r)) u.path = [];
    if (!u.anim && u.path.length) u.anim = { from: { q: u.q, r: u.r }, to: u.path.shift(), t: 0 };
    if (!u.anim) return;
    u.stride += dt / secs * 78;
    const a0 = px(u.anim.from.q, u.anim.from.r), a1 = px(u.anim.to.q, u.anim.to.r);
    if (Math.abs(a1.x - a0.x) > 1) u.face = a1.x > a0.x ? 1 : -1;
    u.anim.t += dt / secs;
    if (u.anim.t >= 1) {
      u.q = u.anim.to.q; u.r = u.anim.to.r; u.anim = null; reveal();
      if (u.kind === 'squad') {
        pickLoot(u);
        if (u.state === 'retreat' && !u.path.length && u.q === base.q && u.r === base.r) { if (mode === 'capsule') dock(u); else u.state = 'out'; }
      } else for (const s of squads) if (s.state === 'home') { s.q = base.q; s.r = base.r; }
    }
  }
  const curPos = (u) => (u.anim ? lerpPos(u.anim.from, u.anim.to, u.anim.t) : px(u.q, u.r));
  const lerpPos = (a, b, t) => { const p = px(a.q, a.r), q = px(b.q, b.r); return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; };

  // ---------- кадр ----------
  function loop(now) {
    if (!open_) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (AB.Render && AB.Render.tick) AB.Render.tick(dt);
    if (ascend) { ascendTick(dt); requestAnimationFrame(loop); return; }
    if (mode === 'capsule') stepUnit(base, dt, BASE_STEP);
    for (const s of outSquads()) { stepUnit(s, dt, STEP); if (!s.anim && loot.size) pickLoot(s); }
    heal(dt);
    fight(dt);
    wildTick(dt);
    if (fly) {
      const c = curPos(fly);
      cam.x += (c.x - cam.x) * Math.min(1, dt * 5); cam.y += (c.y - cam.y) * Math.min(1, dt * 5);
      if (Math.hypot(c.x - cam.x, c.y - cam.y) < 2 && !fly.anim) fly = null;
    }
    draw();
    hud();
    requestAnimationFrame(loop);
  }
  // ---------- №64: всплытие капсулы — финал акта III, переход к общей карте ----------
  let ascend = null;                     // { t, done }
  function surface(done) {
    for (const s of squads) if (s.state !== 'home') dock(s);
    base.path = []; base.anim = null; sel = 'base';
    ascend = { t: 0, done };
    say('Балласт сброшен. Капсула идёт вверх');
  }
  function ascendTick(dt) {
    ascend.t += dt;
    const k = Math.min(1, ascend.t / 5);
    const c = px(base.q, base.r);
    cam.x += (c.x - cam.x) * Math.min(1, dt * 6); cam.y += (c.y - size * 6 * k - cam.y) * Math.min(1, dt * 6);
    draw();
    // свет сверху и пузыри
    g.setTransform(1, 0, 0, 1, 0, 0);
    const lg = g.createLinearGradient(0, 0, 0, cv.height);
    lg.addColorStop(0, `rgba(150,210,230,${0.15 + k * 0.7})`); lg.addColorStop(1, `rgba(20,60,80,${k * 0.4})`);
    g.fillStyle = lg; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(220,240,255,.6)';
    for (let i = 0; i < 40; i++) { const x = ((i * 97) % 100) / 100 * cv.width, y = cv.height - ((ascend.t * 120 * dpr + i * 53) % cv.height); g.beginPath(); g.arc(x, y, (1 + (i % 3)) * dpr, 0, 7); g.fill(); }
    hud();
    if (ascend.t >= 5.5 && !ascend.fired) { ascend.fired = true; const f = ascend.done; ascend = null; setTimeout(() => f && f(), 0); }
  }

  // на базе (и в «Абиссе», и в капсуле) костюм чинят: здоровье понемногу возвращается
  function heal(dt) {
    for (const s of squads) {
      const c = AB.Chars.get(s.id), d = AB.ID.get(s.id);
      if (!c || c.dead) continue;
      const home = s.state === 'home' || (s.q === base.q && s.r === base.r && !s.anim);
      if (home) c.hp = Math.min(d.stats.maxHp, c.hp + dt * (AB.IsoActs && AB.IsoActs.built('MOD-003') ? 12 : 4));
    }
  }

  // ---------- твари ----------
  const mobs = [];                      // { id, kind, q, r, home, hp, max, hunt, stepT, atkT, flash, anim, t, face, stride, mt }
  const loot = new Map();               // q,r → [[item, qty], …]
  let wildSeq = 0;
  const wildT = { hunters: 0, giants: 0 };
  function mobAt(q, r) { return mobs.find((m) => m.hp > 0 && m.q === q && m.r === r) || null; }
  function addMob(id, q, r, kind) {
    const def = AB.ID.get(id);
    mobs.push({ id, kind, q, r, home: { q, r }, hp: def.hp, max: def.hp, hunt: false, stepT: 0, atkT: 1, flash: 0, anim: 'PATROL', t: Math.random() * 3, face: -1, stride: 0, mt: 1 });
  }
  // сюжетные твари на своих точках (ISO_SITES[].mob) и бродячие по случайным местам (OVERWORLD.wild)
  function spawnMobs() {
    const act = AB.IsoActs ? AB.IsoActs.act() : 2;
    for (const s of D().sites) {
      const d = AB.ISO_SITES && AB.ISO_SITES[s.key];
      if (!d || !d.mob || mobs.some((m) => m.id === d.mob) || AB.Enemies.isDead(d.mob) || act < d.act) continue;
      addMob(d.mob, s.q, s.r, 'story');
    }
    if (act < 2 || !D().wild) return;
    for (const [kind, w] of Object.entries(D().wild)) {
      while (mobs.filter((m) => m.kind === kind && m.hp > 0).length < w.count) if (!spawnWild(kind, w, true)) break;
    }
  }
  function spawnWild(kind, w, initial) {
    const free = [...cells.values()].filter((c) => passable(c.q, c.r) && !siteAt(c.q, c.r) && !mobAt(c.q, c.r) && !loot.has(key(c.q, c.r))
      && dist(c, D().start) >= w.minDist && dist(c, base) >= w.minDist - 1 && outSquads().every((s) => dist(c, s) > 3)
      && mobs.every((m) => m.hp <= 0 || dist(c, m) >= 2) && (initial || !near(c)));
    if (!free.length) return false;
    const c = free[Math.floor(Math.random() * free.length)];
    addMob(`${w.enemy}~w${++wildSeq}`, c.q, c.r, kind);
    return true;
  }
  function wildTick(dt) {
    if (!D().wild || (AB.IsoActs && AB.IsoActs.act() < 2)) return;
    for (const [kind, w] of Object.entries(D().wild)) {
      if (mobs.filter((m) => m.kind === kind && m.hp > 0).length >= w.count) { wildT[kind] = 0; continue; }
      wildT[kind] += dt;
      if (wildT[kind] >= w.respawn) { wildT[kind] = 0; spawnWild(kind, w, false); }
    }
  }
  const wildOf = (m) => (D().wild && D().wild[m.kind]) || { aggro: 3, leash: 99, loot: [] };

  function fight(dt) {
    const sw = SUIT().weapon;
    for (const s of squads) { s.flash = Math.max(0, s.flash - dt); s.atkT = Math.max(0, s.atkT - dt); }
    for (const m of mobs) {
      m.t += dt; m.flash = Math.max(0, m.flash - dt * 4);
      if (m.hp <= 0) continue;
      if (m.mt < 1) { m.mt = Math.min(1, m.mt + dt / (m.kind === 'giants' ? 1.4 : 0.9)); m.stride += dt * 80; }
      const w = wildOf(m), def = AB.ID.get(m.id);
      // цель — ближайший отряд снаружи (отступающих не трогают)
      const foes = squads.filter((s) => s.state === 'out' && !(AB.Chars.get(s.id) || {}).dead);
      const tgt = foes.sort((a, b) => dist(at(a), m) - dist(at(b), m))[0];
      const d = tgt ? dist(at(tgt), m) : 99;
      if (!m.hunt && tgt && d <= w.aggro) {
        m.hunt = true; m.anim = 'ALERT'; m.t = 0;
        if (m.kind === 'story') say('Мира: «Оно двинулось к тебе! Бей, как только подойдёт на две клетки»');
        else if (m.kind === 'giants') say('Исполин! Держитесь на расстоянии двух клеток');
      }
      if (m.hunt && (!tgt || dist(m, m.home) > w.leash + 1 || d > w.leash + 2)) { m.hunt = false; m.anim = 'PATROL'; }
      m.atkT = Math.max(0, m.atkT - dt);
      if (!m.hunt) {
        // без цели — назад на своё место
        if (m.mt >= 1 && (m.q !== m.home.q || m.r !== m.home.r)) {
          m.stepT -= dt;
          if (m.stepT <= 0) { const r = route(m, m.home), nx = r && r[0]; if (nx && !mobAt(nx.q, nx.r)) { m.from = { q: m.q, r: m.r }; m.q = nx.q; m.r = nx.r; m.mt = 0; } m.stepT = 1.2; }
        }
        continue;
      }
      const here = at(tgt);
      m.face = px(here.q, here.r).x >= px(m.q, m.r).x ? 1 : -1;
      if (d <= 1) {
        if (m.atkT <= 0) { m.anim = 'ATTACK'; m.t = 0; m.atkT = def.attack.cooldown + def.attack.windup; m.hit = def.attack.windup; m.victim = tgt; }
        if (m.hit != null) {
          m.hit -= dt;
          if (m.hit <= 0) {
            m.hit = null;
            const v = m.victim, c = v && AB.Chars.get(v.id);
            if (v && c && v.state === 'out' && dist(at(v), m) <= 1 && !(AB.IsoDev && AB.IsoDev.god())) {
              v.flash = 0.3;
              c.hp -= def.damage * SUIT().armor;
              AB.Bus.emit('char:hit', { charId: v.id, amount: def.damage * SUIT().armor });
              if (c.hp <= 1) retreat(v);
            }
          }
        }
        if (m.anim === 'ATTACK' && m.t > 1) m.anim = 'CHASE';
      } else if (m.mt >= 1) {
        m.stepT -= dt; m.anim = 'CHASE';
        if (m.stepT <= 0) {
          const r = route(m, here), nx = r && r[0];
          if (nx && !(nx.q === here.q && nx.r === here.r) && !mobAt(nx.q, nx.r) && !outSquads().some((s) => { const a = at(s); return (s.q === nx.q && s.r === nx.r) || (a.q === nx.q && a.r === nx.r); })) { m.from = { q: m.q, r: m.r }; m.q = nx.q; m.r = nx.r; m.mt = 0; }
          m.stepT = m.kind === 'giants' ? 1.4 : 0.9;
        }
      }
    }
    // удары отрядов: сам по ближайшей твари в досягаемости (или по выбранной цели)
    for (const s of outSquads()) {
      if (s.state !== 'out') continue;
      const here = at(s);
      if (s.atk) {
        s.atk.t += dt;
        if (!s.atk.done && s.atk.t >= sw.hitAt * 2) {
          s.atk.done = true;
          const m = s.atk.m;
          if (m.hp > 0 && dist(m, here) <= sw.reachCells) {
            m.hp = Math.max(0, m.hp - sw.damage); m.flash = 1; m.hunt = true;
            if (m.hp <= 0) mobDead(m, s);
          }
        }
        if (s.atk.t > 0.8) s.atk = null;
      } else if (s.atkT <= 0 && !s.anim && (!s.path.length || s.target)) {   // на марше приказ «иди» важнее: сам бьёт, когда стоит
        const foe = (s.target && s.target.hp > 0 && dist(s.target, here) <= sw.reachCells) ? s.target
          : mobs.filter((m) => m.hp > 0 && (m.hunt || s.target === m) && dist(m, here) <= sw.reachCells).sort((a, b) => dist(a, here) - dist(b, here))[0];
        if (foe) { s.atk = { m: foe, t: 0 }; s.atkT = sw.cooldown; s.face = px(foe.q, foe.r).x >= px(here.q, here.r).x ? 1 : -1; s.path = []; }
      }
    }
  }
  function mobDead(m, s) {
    m.anim = 'DEAD';
    for (const q of squads) if (q.target === m) q.target = null;
    if (m.kind === 'story') AB.IsoEnemies.markDead(m.id);
    else for (const [item, n] of wildOf(m).loot) dropLoot(m.q, m.r, item, n);
    AB.Bus.emit('enemy:dead', { id: m.id, name: AB.ID.get(m.id).name, q: m.q, r: m.r });
    if (m.kind !== 'story') say(`${AB.ID.get(m.id).name} убит — добыча на клетке`);
  }
  function dropLoot(q, r, item, qty) { const k = key(q, r); loot.set(k, [...(loot.get(k) || []), [item, qty]]); }
  function pickLoot(u) {
    const k = key(u.q, u.r), l = loot.get(k);
    if (!l) return;
    const got = [], left = [];
    for (const [item, qty] of l) { const n = AB.IsoStash.add(item, qty); if (n) got.push(`${AB.ID.get(item).name} ×${n}`); if (n < qty) left.push([item, qty - n]); }
    if (left.length) loot.set(k, left); else loot.delete(k);
    if (got.length) say(`Подобрано: ${got.join(', ')}`);
  }

  // ---------- рисование ----------
  const COLOR = { silt: '#1d3038', rock: '#2a3238', trench: '#020406', crystal: '#2a1f3a' };
  const hv = (x, y, s, i) => { const a = Math.PI / 180 * (60 * i - 30); return { x: x + s * Math.cos(a), y: y + s * Math.sin(a) * TILT }; };
  function hex(x, y, s) { g.beginPath(); for (let i = 0; i < 6; i++) { const v = hv(x, y, s, i); g.lineTo(v.x, v.y); } g.closePath(); }
  function sides(x, y, s, h, col) {
    for (const [a, b, shade] of [[0, 1, 0.75], [1, 2, 0.55], [2, 3, 0.65]]) {
      const v1 = hv(x, y, s, a), v2 = hv(x, y, s, b);
      g.beginPath(); g.moveTo(v1.x, v1.y); g.lineTo(v2.x, v2.y); g.lineTo(v2.x, v2.y + h); g.lineTo(v1.x, v1.y + h); g.closePath();
      g.fillStyle = col; g.fill(); g.fillStyle = `rgba(0,0,0,${1 - shade})`; g.fill();
    }
  }
  const LIFT = { rock: 0.42, crystal: 0.12, silt: 0.06, trench: -0.18 };
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#010305'; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(1, 0, 0, 1, cv.width / 2 - cam.x, cv.height / 2 - cam.y);
    const order = [...cells.values()].filter((c) => c.seen).sort((a, b) => a.r - b.r || a.q - b.q);
    for (const c of order) {
      const p0 = px(c.q, c.r), lit = near(c), lift = LIFT[c.kind] * size;
      const p = { x: p0.x, y: p0.y - Math.max(0, lift) };
      if (lift > 0) sides(p.x, p.y, size * 0.97, lift + size * 0.06, c.kind === 'rock' ? '#1c2328' : '#1a2a30');
      hex(p.x, p.y, size * 0.97);
      g.fillStyle = COLOR[c.kind]; g.fill();
      if (c.kind === 'crystal') { g.fillStyle = `rgba(170,110,255,${0.12 + Math.sin(time * 2 + c.q) * 0.06})`; g.fill(); }
      if (c.kind === 'rock') { g.fillStyle = 'rgba(255,255,255,.04)'; g.fill(); }
      if (!lit) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fill(); }
      g.strokeStyle = 'rgba(120,180,200,.08)'; g.lineWidth = 1; g.stroke();
      if (c.kind === 'crystal') for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(190,140,255,.7)'; g.fillRect(p.x - size * 0.3 + i * size * 0.25, p.y - size * 0.15 - (i % 2) * 6, 3, 8); }
    }
    // пути отрядов и капсулы
    for (const u of [base, ...outSquads()]) {
      if (!u.path.length) continue;
      const c = curPos(u);
      g.strokeStyle = u.kind === 'base' ? 'rgba(255,210,120,.5)' : u.state === 'retreat' ? 'rgba(255,120,90,.5)' : 'rgba(94,230,255,.5)';
      g.setLineDash([4, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(c.x, c.y);
      for (const s of u.path) { const p = px(s.q, s.r); g.lineTo(p.x, p.y); } g.stroke(); g.setLineDash([]);
    }
    for (const s of D().sites) {
      const c = cells.get(key(s.q, s.r)); if (!c.seen || !shown(s)) continue;
      const p = px(s.q, s.r);
      // №67: в клетке стоит база или отряд — значок точки меньше и в углу клетки
      const busy = cellUnits(s.q, s.r).length > 0;
      icon(s.kind, p.x, p.y + (busy ? -size * 0.75 : 0), busy ? 0.6 : 1);
      g.font = `${11 * dpr}px "Oswald", sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(230,220,200,.85)';
      g.fillText(s.name, p.x, p.y + size * 0.85);
    }
    for (const [k, items] of loot) {
      const c = cells.get(k); if (!c || !c.seen) continue;
      const p = px(c.q, c.r), col = items.some(([i]) => i === 'ITEM-015') ? '190,140,255' : '120,255,170';
      g.fillStyle = `rgba(${col},${0.6 + Math.sin(time * 4) * 0.3})`; g.beginPath(); g.moveTo(p.x, p.y - 14 * dpr); g.lineTo(p.x + 6 * dpr, p.y - 4 * dpr); g.lineTo(p.x, p.y + 4 * dpr); g.lineTo(p.x - 6 * dpr, p.y - 4 * dpr); g.closePath(); g.fill();
    }
    // выбранный — кольцо под ним
    const su = selU(), sp = slotPos(su);
    g.strokeStyle = `rgba(94,230,255,${0.55 + Math.sin(time * 4) * 0.2})`; g.lineWidth = 2 * dpr;
    g.beginPath(); g.ellipse(sp.x, sp.y + 2, size * 0.7, size * 0.7 * TILT, 0, 0, 7); g.stroke();
    // по глубине: твари, капсула, костюмы
    const things = [];
    for (const m of mobs) things.push({ y: curMob(m).y, f: () => drawMob(m) });
    if (mode === 'capsule') things.push({ y: curPos(base).y, f: drawBase });
    for (const s of outSquads()) things.push({ y: curPos(s).y, f: () => drawSquad(s) });
    things.sort((a, b) => a.y - b.y).forEach((t) => t.f());
    for (const u of [base, ...outSquads()]) {
      const c = curPos(u), lg = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, size * 3.2);
      lg.addColorStop(0, 'rgba(120,200,220,.07)'); lg.addColorStop(1, 'rgba(120,200,220,0)');
      g.fillStyle = lg; g.fillRect(c.x - size * 3.2, c.y - size * 3.2, size * 6.4, size * 6.4);
    }
  }
  function drawBase() {
    const c = slotPos(base);
    if (ascend) c.y -= size * 6 * Math.min(1, ascend.t / 5);          // капсула поднимается
    g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.ellipse(c.x, c.y + 6, 20 * dpr, 5 * dpr, 0, 0, 7); g.fill();
    g.fillStyle = '#c9a24a'; g.beginPath(); g.ellipse(c.x, c.y - 6, 18 * dpr, 10 * dpr, 0, 0, 7); g.fill();
    g.fillStyle = '#8a6e30'; g.fillRect(c.x - 14 * dpr, c.y - 2, 28 * dpr, 4 * dpr);
    g.fillStyle = '#5ee6ff'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(c.x + i * 8 * dpr, c.y - 8, 2.6 * dpr, 0, 7); g.fill(); }
  }
  function drawSquad(s) {
    const c = slotPos(s), me = AB.Chars.get(s.id);
    const pose = { facing: s.face, phase: s.stride / 78 * Math.PI * 2, moving: !!s.anim, attack: s.atk ? Math.min(1, s.atk.t / 0.8) : -1, hurt: s.flash > 0 ? 1 : 0, dead: false, t: time };
    if (s.state === 'retreat') g.globalAlpha = 0.75;
    AB.IsoSuit.draw(g, pose, c.x, c.y + size * 0.2, (size * 1.3) / SUIT().height);
    g.globalAlpha = 1;
    const hp = me ? me.hp / AB.ID.get(s.id).stats.maxHp : 1;
    if (hp < 0.999 || mobs.some((m) => m.hp > 0 && m.hunt)) bar(c.x, c.y - size * 1.25, hp, '#5ee6ff');
  }
  function bar(x, y, f, col) {
    const w = size * 0.9;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - w / 2, y, w, 4 * dpr);
    g.fillStyle = col; g.fillRect(x - w / 2, y, w * Math.max(0, f), 4 * dpr);
  }
  const curMob = (m) => { let p = px(m.q, m.r); if (m.from && m.mt < 1) { const a = px(m.from.q, m.from.r); p = { x: a.x + (p.x - a.x) * m.mt, y: a.y + (p.y - a.y) * m.mt }; } return p; };
  function drawMob(m) {
    const c = cells.get(key(m.q, m.r));
    if (!c || !c.seen || !near(c)) return;
    if (m.hp <= 0 && (m.fade == null ? 1 : m.fade) <= 0) return;
    const p = curMob(m);
    const def = AB.ID.get(m.id), k = (size * (m.kind === 'giants' ? 1.9 : 1.25)) / (90 * (def.scale || 1));
    const e = { id: m.id, x: 0, state: m.hp <= 0 ? 'DEAD' : m.anim, facing: m.face, stride: m.stride, flash: m.flash, t: m.t, hp: m.hp, risen: true };
    if (m.hp <= 0) { m.fade = Math.max(0, (m.fade == null ? 1 : m.fade) - 0.01); g.globalAlpha = m.fade; }
    if (AB.Render && AB.Render.drawEnemyFigure) { try { AB.Render.drawEnemyFigure(g, e, p.x, p.y + size * 0.2, k); } catch (er) { /* без фигуры */ } }
    g.globalAlpha = 1;
    if (m.hp > 0 && (m.hunt || m.hp < m.max)) bar(p.x, p.y - size * (m.kind === 'giants' ? 1.75 : 1.2), m.hp / m.max, m.kind === 'giants' ? '#ff9a3a' : '#ff5a4a');
  }
  // №67: кто стоит в клетке (база и отряды, не на ходу) — чтобы разводить их внутри клетки, а не рисовать друг на друге
  function cellUnits(q, r) {
    const out = [];
    if (mode === 'capsule' && !base.anim && base.q === q && base.r === r) out.push(base);
    for (const s of outSquads()) if (!s.anim && s.q === q && s.r === r) out.push(s);
    return out;
  }
  function slotPos(u) {
    const c = curPos(u);
    if (u.anim) return c;
    const list = cellUnits(u.q, u.r), n = list.length, i = list.indexOf(u);
    if (n < 2 || i < 0) return c;
    return { x: c.x + (i - (n - 1) / 2) * size * 0.75, y: c.y + (i % 2 ? size * 0.12 : -size * 0.05) };
  }
  function icon(kind, x, y, sc = 1) {
    const s = size * 0.42 * sc;
    g.save(); g.translate(x, y);
    const col = { ship: '#9fd4e6', wreck: '#b0a58f', crystal: '#c79bff', people: '#ffd27a', ancient: '#b48cff', machine: '#7fe0c0', swarm: '#ff6a5a' }[kind] || '#ddd';
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2 * dpr;
    if (kind === 'ship' || kind === 'wreck') { g.beginPath(); g.moveTo(-s, s * 0.3); g.lineTo(s, -s * 0.2); g.lineTo(s * 0.6, s * 0.5); g.closePath(); g.stroke(); }
    else if (kind === 'people') { g.beginPath(); g.arc(0, s * 0.2, s * 0.7, Math.PI, 0); g.stroke(); }
    else if (kind === 'ancient') { g.fillRect(-s * 0.15, -s, s * 0.3, s * 1.6); }
    else if (kind === 'machine') { g.strokeRect(-s * 0.5, -s * 0.5, s, s); g.beginPath(); g.arc(0, 0, s * 0.15, 0, 7); g.fill(); }
    else if (kind === 'swarm') { for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(i) * s, Math.sin(i) * s); g.stroke(); } }
    else { g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.4, 0); g.lineTo(0, s); g.lineTo(-s * 0.4, 0); g.closePath(); g.fill(); }
    g.restore();
  }

  // ---------- интерфейс: цель задания сверху, точка под выбранным, карточки отряда справа внизу ----------
  let topHtml = '', squadsSig = '';
  function hud() {
    const q = AB.Quests.active().map((x) => x.objectives.find((o) => !o.ok)).find(Boolean);
    const th = `<b>Дно океана</b><span>${mode === 'capsule' ? `База-капсула · экипаж: ${AB.IsoActs.crew().length}` : 'Марк в экзокостюме · Мира на связи'}</span>${q ? `<em>▸ ${q.text}</em>` : ''}`;
    if (th !== topHtml) { document.getElementById('ow-top').innerHTML = th; topHtml = th; }
    squadPanel();
    const u = selU();
    let s = u.anim ? null : siteAt(u.q, u.r);
    if (s && !shown(s)) s = null;
    if (s === onSite) return;
    onSite = s;
    const card = document.getElementById('ow-card');
    card.hidden = !s;
    if (!s) return;
    card.querySelector('b').textContent = s.name;
    card.querySelector('p').textContent = s.desc;
    const act = document.getElementById('ow-act'), a = AB.IsoActs ? AB.IsoActs.siteAction(s) : { label: 'Исследовать — появится позже', ok: false };
    act.textContent = a.label;
    act.disabled = !a.ok;
  }
  const STATE = { home: 'на базе', out: 'снаружи', retreat: 'возвращается' };
  function squadPanel() {
    // слева: «Моя база» (подсвечена, если выбрана для движения) и меню; справа — ячейки отрядов
    const mb = document.getElementById('ow-mybase'), up = mode === 'capsule' && AB.IsoActs && AB.IsoActs.canSurface() && !ascend;
    mb.classList.toggle('on', sel === 'base' && !selAll);
    mb.querySelector('span').textContent = ascend ? 'Всплывает' : base.anim || base.path.length ? 'База в пути' : 'Моя база';
    document.querySelector('#ow-menu [data-ow="surface"]').hidden = !up;
    document.querySelector('#ow-menu [data-ow="all"]').classList.toggle('on', selAll);
    const slots = [];
    for (const s of squads) {
      if (!s.vehicle || (mode === 'suit' && s.id !== 'CHAR-001')) continue;
      const c = AB.Chars.get(s.id), d = AB.ID.get(s.id), hp = c ? Math.round((c.hp / d.stats.maxHp) * 100) : 100;
      const st = s.state === 'out' && s.atk ? 'в бою' : s.state === 'out' && (s.anim || s.path.length) ? 'в пути' : STATE[s.state];
      const on = (selAll && s.state === 'out') || (!selAll && sel === s.id && s.state !== 'home');
      const recallBtn = on && mode !== 'suit' && s.state === 'out' ? '<button data-do="back" title="Отозвать на базу">↩</button>' : '';
      slots.push(`<div class="ow-slot ${on ? 'on' : ''} st-${s.state}" data-u="${s.id}" title="${d.name} · экзокостюм · ${st}"><canvas data-pt="${s.id}"></canvas><img src="assets/exosuit/v2/body.png" alt=""><b>${d.name}</b><span>${st}</span><u><i style="width:${hp}%"></i></u>${recallBtn}</div>`);
    }
    // ещё одна ячейка — когда появится второй транспорт; дальше — закрытые (черновик условия)
    slots.push('<div class="ow-slot add" title="Нужен ещё один транспорт (экзокостюм)">+</div>');
    slots.push('<div class="ow-slot lock"><span>Условие:</span><em>модуль «Ангар»</em></div>');
    slots.push('<div class="ow-slot lock"><i>🔒</i></div>');
    const sig = slots.join('') + sel + selAll + mb.className;
    if (sig === squadsSig) return;
    squadsSig = sig;
    const el = document.getElementById('ow-slots');
    el.innerHTML = slots.join('');
    for (const cv2 of el.querySelectorAll('canvas[data-pt]')) AB.IsoRender.portrait(cv2, cv2.dataset.pt, 1);
  }

  return {
    init, enter, back, close, say, isOpen: () => open_,
    setMode(m) { mode = m; if (m === 'capsule') { for (const s of squads) if (s.state !== 'home') dock(s); sel = 'base'; } }, mode: () => mode, refresh() { onSite = undefined; },
    mobs: () => mobs.filter((m) => m.hp > 0).map((m) => ({ id: m.id, kind: m.kind, q: m.q, r: m.r, hp: m.hp, hunt: m.hunt })), dropLoot,
    attack(id) { const m = mobs.find((q) => q.id === id), s = selU(); if (m && s.kind === 'squad') s.target = m; },
    pos: () => ({ q: selU().q, r: selU().r }),
    goTo(q, r) { const u = selU(); if (u.kind === 'base' && mode !== 'capsule') return false; const p = route(at(u), { q, r }); if (p) u.path = p; return !!p; },
    select(id) { if (unit(id)) { sel = id; squadsSig = ''; return true; } return false; },
    deploy, recall, surface, ascending: () => !!ascend, squads: () => squads.map((s) => ({ id: s.id, state: s.state, q: s.q, r: s.r, vehicle: s.vehicle })), base: () => ({ q: base.q, r: base.r }),
    revealAll() { for (const c of cells.values()) c.seen = true; },
    // админ-панель: убрать бродячих тварей (сюжетные не трогаем)
    clearWild() { let n = 0; for (const m of mobs) if (m.hp > 0 && m.kind !== 'story') { m.hp = 0; m.anim = 'DEAD'; m.fade = 0; n++; } return n; },
    lootAt: (q, r) => loot.get(key(q, r)) || null, time: () => time, _sq: () => squads,
    cell: (q, r) => cells.get(key(q, r)), seenCount: () => [...cells.values()].filter((c) => c.seen).length, total: () => cells.size,
    moving: () => { const u = selU(); return !!u.anim || u.path.length > 0; }, route,
  };
})();
