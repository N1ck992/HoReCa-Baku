// =====================================================================
// ISO OVERWORLD (дополнение №54, ПРОТОТИП). Выход за борт: дно океана вокруг
// «Абисса» — карта из шестиугольников, вид сверху. Марк в экзокостюме ходит
// по клеткам (нажать — проложить путь), туман открывается вокруг. Скалы и
// впадины не пройти. На клетке с точкой — её описание; на «Абиссе» — вернуться
// на корабль (состояние бункера сохраняется: это та же страница).
// Ресурсов, боя и базы пока нет — только карта и перемещение.
// =====================================================================

AB.IsoOverworld = (() => {
  const D = () => AB.OVERWORLD;
  const SQ3 = Math.sqrt(3);
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const key = (q, r) => `${q},${r}`;
  let open_ = false, cv, g, dpr = 1;
  const cells = new Map();             // q,r → { q, r, kind, seen }
  let pos = null, path = [], stepT = 0, anim = null, cam = { x: 0, y: 0 }, size = 34, time = 0, last = 0, onSite = null;
  // №61: бой прямо на карте — костюм занимает клетку и бьёт на 2 клетки; твари ходят по клеткам
  const mobs = [];                      // { id, q, r, hp, max, hunt, stepT, atkT, flash, anim, t }
  const loot = new Map();               // q,r → [item, qty] — что лежит на клетке
  let target = null, atk = null, suitAtkT = 0, suitFlash = 0, hpShow = 1;
  const SUIT = () => AB.RIGS.EXOSUIT;
  let mode = 'suit';
  let suitStride = 0, suitFace = 1;                    // №55: 'suit' — Марк в экзокостюме один (акт II), 'capsule' — база-капсула (акт III)
  const viewR = () => (AB.IsoActs ? AB.IsoActs.view() : 2);   // на сколько клеток видно вокруг (сонар базы — дальше)
  const shown = (s) => !AB.IsoActs || AB.IsoActs.siteVisible(s);

  const inside = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= D().radius;
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  // №58: карта под углом — дно сжато по вертикали (камера смотрит наискосок), у камней — объём
  const TILT = 0.6, STEP = 0.75;        // наклон; секунд на клетку (тяжёлый шаг, медленнее прежнего)
  const px = (q, r) => ({ x: size * SQ3 * (q + r / 2), y: size * 1.5 * r * TILT });
  const siteAt = (q, r) => D().sites.find((s) => s.q === q && s.r === r) || null;
  const passable = (q, r) => { const c = cells.get(key(q, r)); return !!c && c.kind !== 'rock' && c.kind !== 'trench'; };

  // ---------- рельеф: ил, скалы, впадины, кристаллы (детерминированно по seed) ----------
  function build() {
    const rng = AB.util.rng(D().seed), R = D().radius;
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
      if (!inside(q, r)) continue;
      const n = rng();
      cells.set(key(q, r), { q, r, kind: n < 0.13 ? 'rock' : n < 0.2 ? 'crystal' : 'silt', seen: false });
    }
    // впадина — изломанная линия поперёк карты
    let q = -R + 1, r = 4;
    for (let i = 0; i < R * 2; i++) {
      if (inside(q, r) && !siteAt(q, r) && cells.has(key(q, r))) cells.get(key(q, r)).kind = 'trench';
      q++; if (rng() < 0.4) r--;
    }
    // точки и путь к ним — проходимы
    for (const s of D().sites) {
      cells.get(key(s.q, s.r)).kind = s.kind === 'crystal' ? 'crystal' : 'silt';
      for (const [dq, dr] of DIRS) { const c = cells.get(key(s.q + dq, s.r + dr)); if (c && c.kind === 'rock') c.kind = 'silt'; }
    }
    // гарантируем дорогу от «Абисса» к каждой точке: где не дойти — пробиваем узкий проход
    for (const s of D().sites) if (!route(D().start, s)) carve(D().start, s);
    pos = { ...D().start };
    reveal();
  }
  function carve(a, b) {
    let c = { ...a };
    while (c.q !== b.q || c.r !== b.r) {
      const n = DIRS.map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr })).filter((x) => inside(x.q, x.r)).sort((x, y) => dist(x, b) - dist(y, b))[0];
      const cell = cells.get(key(n.q, n.r)); if (cell.kind === 'rock' || cell.kind === 'trench') cell.kind = 'silt';
      c = n;
    }
  }
  // поиск пути по клеткам (A*)
  function route(a, b) {
    if (!passable(b.q, b.r)) return null;
    const open = [{ ...a, g: 0, f: dist(a, b) }], from = new Map([[key(a.q, a.r), null]]), gs = new Map([[key(a.q, a.r), 0]]);
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
  function reveal() { for (const c of cells.values()) if (dist(c, pos) <= viewR()) c.seen = true; }

  // ---------- открыть / закрыть ----------
  function init() {
    cv = document.getElementById('ow-map'); g = cv.getContext('2d');
    build();
    cv.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const t = pick(e.clientX, e.clientY);
      if (!t || !cells.has(key(t.q, t.r))) return;
      const mb = mobAt(t.q, t.r);
      if (mb && mode === 'suit') {
        target = mb;
        if (dist(anim ? anim.to : pos, mb) <= SUIT().weapon.reachCells) { path = []; return; }
      } else target = null;
      const p = route(anim ? anim.to : pos, t);
      if (!p) { say('Туда не пройти'); return; }
      path = p;
    });
    document.getElementById('ow-back').addEventListener('click', back);
    document.getElementById('ow-act').addEventListener('click', () => {
      if (!onSite) return;
      if (onSite.key === 'abyss') back(); else if (AB.IsoActs) AB.IsoActs.doSite(onSite);
    });
    // база-капсула (акт III): экипаж, вещи, модули
    // №61: «База» — войти в капсулу (помещение с экипажем, снаряжением и модулями)
    document.getElementById('ow-base-btn').addEventListener('click', () => AB.IsoActs.enterBase());
    document.getElementById('ow-base').addEventListener('click', (e) => {
      if (e.target.closest('[data-base-close]') || e.target.id === 'ow-base') { baseOpen(false); return; }
      const b = e.target.closest('[data-build]');
      if (b && AB.IsoActs.build(b.dataset.build)) baseOpen(true);
    });
    window.addEventListener('keydown', (e) => { if (open_ && e.code === 'Escape') { const s = siteAt(pos.q, pos.r); if (s && s.key === 'abyss') back(); } });
    window.addEventListener('resize', () => { if (open_) fit(); });
  }
  function enter() {
    open_ = true;
    spawnMobs();
    reveal(); onSite = undefined;
    document.getElementById('ow').hidden = false;
    document.getElementById('ow-base-btn').hidden = mode !== 'capsule';
    fit(); last = performance.now();
    requestAnimationFrame(loop);
    AB.Bus.emit('ow:enter', {});
  }
  // вернуться на корабль: только с клетки «Абисса» — к шлюзу
  function back() {
    const s = siteAt(pos.q, pos.r);
    if (!s || s.key !== 'abyss') { say('Вернуться на корабль можно только у «Абисса»'); return; }
    close();
    AB.Bus.emit('ow:exit', {});
  }
  // закрыть карту без возвращения на корабль (схватка на дне — iso-acts.js)
  function close() { open_ = false; baseOpen(false); document.getElementById('ow').hidden = true; }
  function say(t) { const el = document.getElementById('ow-say'); el.textContent = t; el.classList.add('show'); clearTimeout(say.t); say.t = setTimeout(() => el.classList.remove('show'), 2000 + t.length * 40); }

  // ---------- база-капсула ----------
  function baseOpen(on) {
    const el = document.getElementById('ow-base');
    el.hidden = !on;
    if (!on) return;
    if (AB.IsoActs) AB.IsoActs.onBase();
    const nm = (id) => AB.ID.get(id).name;
    const crew = AB.IsoActs.crew().map((id) => { const c = AB.Chars.get(id), d = AB.ID.get(id), hp = c ? Math.round((c.hp / d.stats.maxHp) * 100) : 100;
      return `<div class="crew"><b>${d.name}</b><i style="width:${hp}%"></i></div>`; }).join('');
    const res = ['ITEM-001', 'ITEM-002', 'ITEM-003', 'ITEM-015'].map((i) => `<span>${nm(i)}: <b>${AB.IsoStash.count(i)}</b></span>`).join('');
    const mods = AB.ISO_MODULES.map((m) => {
      const done = AB.IsoActs.built(m.id), ok = AB.IsoActs.canBuild(m.id);
      const cost = (m.cost || []).map(([i, n]) => `<u class="${AB.IsoStash.count(i) >= n ? '' : 'no'}">${AB.ID.get(i).short} ${AB.IsoStash.count(i)}/${n}</u>`).join(' ');
      return `<div class="mod ${done ? 'on' : ''}"><b>${m.name}</b><p>${m.desc}</p>${done ? '<em>Пристыкован</em>' : `<div class="cost">${cost}</div><button data-build="${m.id}" ${ok ? '' : 'disabled'}>Пристыковать</button>`}</div>`;
    }).join('');
    el.innerHTML = `<div class="inv-card base-card" role="dialog" aria-label="База"><div class="inv-head"><div><h2>База-капсула</h2><div class="muted">Черновик: модули и экипаж ждут правки автора</div></div><button class="inv-x" data-base-close aria-label="Закрыть">✕</button></div>`
      + `<h3>Экипаж</h3><div class="crew-list">${crew}</div><h3>Ресурсы</h3><div class="res">${res}</div><h3>Модули</h3><div class="mods">${mods}</div></div>`;
  }

  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
    size = Math.max(22, Math.min(40, Math.min(cv.clientWidth, cv.clientHeight) / 11)) * dpr;
  }
  function pick(cx, cy) {
    const rc = cv.getBoundingClientRect();
    const x = ((cx - rc.left) * dpr - cv.width / 2 + cam.x) / size, y = ((cy - rc.top) * dpr - cv.height / 2 + cam.y) / size / TILT;
    // пиксель → осевые координаты, округление по кубу
    let q = (SQ3 / 3) * x - y / 3, r = (2 / 3) * y, s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  }

  // ---------- кадр ----------
  function loop(now) {
    if (!open_) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    // шаг экзокостюма: тяжёлый, STEP секунд на клетку
    if (AB.Render && AB.Render.tick) AB.Render.tick(dt);
    // идём к выбранной твари — остановиться, как только достаём
    if (target && target.hp > 0 && dist(anim ? anim.to : pos, target) <= SUIT().weapon.reachCells) path = [];
    else if (target && target.hp > 0 && !path.length && !anim) { const p = route(pos, target); if (p) path = p; }
    // в клетку с тварью не войти
    if (!anim && path.length && mobAt(path[0].q, path[0].r)) path = [];
    if (!anim && path.length) { anim = { from: { ...pos }, to: path.shift(), t: 0 }; }
    if (anim) {
      suitStride += dt / STEP * 78;                                   // шаг костюма: одна клетка — один шаг
      const a0 = px(anim.from.q, anim.from.r), a1 = px(anim.to.q, anim.to.r);
      if (Math.abs(a1.x - a0.x) > 1) suitFace = a1.x > a0.x ? 1 : -1;
      anim.t += dt / STEP;
      if (anim.t >= 1) { pos = anim.to; anim = null; reveal(); pickLoot(); }
    }
    const cur = anim ? lerpPos(anim.from, anim.to, anim.t) : px(pos.q, pos.r);
    cam.x += (cur.x - cam.x) * Math.min(1, dt * 6); cam.y += (cur.y - cam.y) * Math.min(1, dt * 6);
    if (mode === 'suit') fight(dt);
    draw(cur);
    hud();
    requestAnimationFrame(loop);
  }
  const lerpPos = (a, b, t) => { const p = px(a.q, a.r), q = px(b.q, b.r); return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; };

  const COLOR = { silt: '#1d3038', rock: '#2a3238', trench: '#020406', crystal: '#2a1f3a' };
  const hv = (x, y, s, i) => { const a = Math.PI / 180 * (60 * i - 30); return { x: x + s * Math.cos(a), y: y + s * Math.sin(a) * TILT }; };
  function hex(x, y, s) { g.beginPath(); for (let i = 0; i < 6; i++) { const v = hv(x, y, s, i); g.lineTo(v.x, v.y); } g.closePath(); }
  // боковые грани ближней к камере стороны (вершины 0,1,2 — правая, нижняя, левая)
  function sides(x, y, s, h, col) {
    for (const [a, b, shade] of [[0, 1, 0.75], [1, 2, 0.55], [2, 3, 0.65]]) {
      const v1 = hv(x, y, s, a), v2 = hv(x, y, s, b);
      g.beginPath(); g.moveTo(v1.x, v1.y); g.lineTo(v2.x, v2.y); g.lineTo(v2.x, v2.y + h); g.lineTo(v1.x, v1.y + h); g.closePath();
      g.fillStyle = col; g.fill(); g.fillStyle = `rgba(0,0,0,${1 - shade})`; g.fill();
    }
  }
  const LIFT = { rock: 0.42, crystal: 0.12, silt: 0.06, trench: -0.18 };   // высота клетки в долях size
  function draw(cur) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#010305'; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(1, 0, 0, 1, cv.width / 2 - cam.x, cv.height / 2 - cam.y);
    // дальние ряды — раньше (камера смотрит сверху-спереди)
    const order = [...cells.values()].filter((c) => c.seen).sort((a, b) => a.r - b.r || a.q - b.q);
    for (const c of order) {
      const p0 = px(c.q, c.r), near = dist(c, pos) <= viewR(), lift = LIFT[c.kind] * size;
      const p = { x: p0.x, y: p0.y - Math.max(0, lift) };
      if (lift > 0) sides(p.x, p.y, size * 0.97, lift + size * 0.06, c.kind === 'rock' ? '#1c2328' : '#1a2a30');
      hex(p.x, p.y, size * 0.97);
      g.fillStyle = COLOR[c.kind]; g.fill();
      if (c.kind === 'crystal') { g.fillStyle = `rgba(170,110,255,${0.12 + Math.sin(time * 2 + c.q) * 0.06})`; g.fill(); }
      if (c.kind === 'rock') { g.fillStyle = 'rgba(255,255,255,.04)'; g.fill(); }
      if (!near) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fill(); }        // видели раньше — в полутьме
      g.strokeStyle = 'rgba(120,180,200,.08)'; g.lineWidth = 1; g.stroke();
      if (c.kind === 'crystal') for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(190,140,255,.7)'; g.fillRect(p.x - size * 0.3 + i * size * 0.25, p.y - size * 0.15 - (i % 2) * 6, 3, 8); }
    }
    // путь
    if (path.length) {
      g.strokeStyle = 'rgba(94,230,255,.5)'; g.setLineDash([4, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(cur.x, cur.y);
      for (const s of path) { const p = px(s.q, s.r); g.lineTo(p.x, p.y); } g.stroke(); g.setLineDash([]);
    }
    // точки (видны, если клетку уже видели)
    for (const s of D().sites) {
      const c = cells.get(key(s.q, s.r)); if (!c.seen || !shown(s)) continue;
      const p = px(s.q, s.r);
      icon(s.kind, p.x, p.y);
      g.font = `${11 * dpr}px "Oswald", sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(230,220,200,.85)';
      g.fillText(s.name, p.x, p.y + size * 0.85);
    }
    // находки на клетках и твари
    for (const [k, [item]] of loot) { const [q, r] = k.split(',').map(Number); const c = cells.get(k); if (!c || !c.seen) continue; const p = px(q, r); g.fillStyle = `rgba(190,140,255,${0.6 + Math.sin(time * 4) * 0.3})`; g.beginPath(); g.moveTo(p.x, p.y - 14 * dpr); g.lineTo(p.x + 6 * dpr, p.y - 4 * dpr); g.lineTo(p.x, p.y + 4 * dpr); g.lineTo(p.x - 6 * dpr, p.y - 4 * dpr); g.closePath(); g.fill(); }
    for (const m of mobs) drawMob(m);
    // экзокостюм или капсула
    g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.ellipse(cur.x, cur.y + 6, (mode === 'capsule' ? 18 : 10) * dpr, 4 * dpr, 0, 0, 7); g.fill();
    if (mode === 'capsule') {
      g.fillStyle = '#c9a24a'; g.beginPath(); g.ellipse(cur.x, cur.y - 6, 16 * dpr, 9 * dpr, 0, 0, 7); g.fill();
      g.fillStyle = '#5ee6ff'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(cur.x + i * 7 * dpr, cur.y - 7, 2.4 * dpr, 0, 7); g.fill(); }
    } else {
      // №56: экзокостюм — та же фигура из частей, что в изометрии; занимает одну клетку
      const pose = { facing: suitFace, phase: suitStride / 78 * Math.PI * 2, moving: !!anim, attack: atk ? Math.min(1, atk.t / 0.8) : -1, hurt: suitFlash > 0 ? 1 : 0, dead: !!(AB.Chars.get('CHAR-001') || {}).dead, t: time };
      AB.IsoSuit.draw(g, pose, cur.x, cur.y + size * 0.2, (size * 1.3) / AB.RIGS.EXOSUIT.height);
      if (mobs.some((m) => m.hp > 0 && m.hunt)) bar(cur.x, cur.y - size * 1.25, hpShow, '#5ee6ff');
    }
    // свет нашлемных фонарей
    const lg = g.createRadialGradient(cur.x, cur.y, 0, cur.x, cur.y, size * 3.2);
    lg.addColorStop(0, 'rgba(120,200,220,.08)'); lg.addColorStop(1, 'rgba(120,200,220,0)');
    g.fillStyle = lg; g.fillRect(cur.x - size * 3.2, cur.y - size * 3.2, size * 6.4, size * 6.4);
  }
  // ---------- бой на карте (№61) ----------
  function mobAt(q, r) { return mobs.find((m) => m.hp > 0 && m.q === q && m.r === r) || null; }
  function bar(x, y, f, col) {
    const w = size * 0.9;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - w / 2, y, w, 4 * dpr);
    g.fillStyle = col; g.fillRect(x - w / 2, y, w * Math.max(0, f), 4 * dpr);
  }
  function drawMob(m) {
    const c = cells.get(key(m.q, m.r));
    if (!c || !c.seen || dist(m, pos) > viewR() + 1) return;
    let p = px(m.q, m.r);
    if (m.from && m.mt < 1) { const a = px(m.from.q, m.from.r); p = { x: a.x + (p.x - a.x) * m.mt, y: a.y + (p.y - a.y) * m.mt }; }
    const def = AB.ID.get(m.id), k = (size * 1.25) / (90 * (def.scale || 1));
    const e = { id: m.id, x: 0, state: m.hp <= 0 ? 'DEAD' : m.anim, facing: m.face, stride: m.stride, flash: m.flash, t: m.t, hp: m.hp, risen: true };
    if (m.hp <= 0) { m.fade = Math.max(0, (m.fade == null ? 1 : m.fade) - 0.01); g.globalAlpha = m.fade; }
    if (AB.Render && AB.Render.drawEnemyFigure) { try { AB.Render.drawEnemyFigure(g, e, p.x, p.y + size * 0.2, k); } catch (er) { /* без фигуры */ } }
    g.globalAlpha = 1;
    if (m.hp > 0 && m.hunt) bar(p.x, p.y - size * 1.2, m.hp / m.max, '#ff5a4a');
  }
  // твари этого акта на своих клетках (данные — js/data/iso-acts.js: ISO_SITES[].mob)
  function spawnMobs() {
    for (const s of D().sites) {
      const d = AB.ISO_SITES && AB.ISO_SITES[s.key];
      if (!d || !d.mob || mobs.some((m) => m.id === d.mob) || AB.Enemies.isDead(d.mob) || (AB.IsoActs && AB.IsoActs.act() < d.act)) continue;
      const def = AB.ID.get(d.mob);
      mobs.push({ id: d.mob, q: s.q, r: s.r, hp: def.hp, max: def.hp, hunt: false, stepT: 0, atkT: 1, flash: 0, anim: 'PATROL', t: 0, face: -1, stride: 0, mt: 1 });
    }
  }
  function fight(dt) {
    const sw = SUIT().weapon, me = AB.Chars.get('CHAR-001');
    if (me && me.dead) return;
    hpShow = me ? me.hp / AB.ID.get('CHAR-001').stats.maxHp : 1;
    suitFlash = Math.max(0, suitFlash - dt);
    suitAtkT = Math.max(0, suitAtkT - dt);
    const here = anim ? anim.to : pos;
    for (const m of mobs) {
      m.t += dt; m.flash = Math.max(0, m.flash - dt * 4);
      if (m.hp <= 0) continue;
      const d = dist(m, here), def = AB.ID.get(m.id);
      if (m.mt < 1) { m.mt = Math.min(1, m.mt + dt / 0.9); m.stride += dt * 80; }
      if (!m.hunt && d <= 3) { m.hunt = true; m.anim = 'ALERT'; m.t = 0; say('Мира: «Оно двинулось к тебе! Бей, как только подойдёт на две клетки»'); }
      if (!m.hunt) continue;
      m.face = px(here.q, here.r).x >= px(m.q, m.r).x ? 1 : -1;
      m.atkT = Math.max(0, m.atkT - dt);
      if (d <= 1) {
        // вплотную — бьёт
        if (m.atkT <= 0) { m.anim = 'ATTACK'; m.t = 0; m.atkT = def.attack.cooldown + def.attack.windup; m.hit = def.attack.windup; }
        if (m.hit != null) { m.hit -= dt; if (m.hit <= 0) { m.hit = null; suitFlash = 0.3; AB.IsoCombat.damageChar('CHAR-001', def.damage * SUIT().armor, null); } }
        if (m.anim === 'ATTACK' && m.t > 1) m.anim = 'CHASE';
      } else if (m.mt >= 1) {
        // шаг к костюму (тяжело, ~0,9 с на клетку)
        m.stepT -= dt; m.anim = 'CHASE';
        if (m.stepT <= 0) {
          const r = route(m, here);
          const nx = r && r[0];
          if (nx && !(nx.q === here.q && nx.r === here.r) && !mobAt(nx.q, nx.r)) { m.from = { q: m.q, r: m.r }; m.q = nx.q; m.r = nx.r; m.mt = 0; }
          m.stepT = 0.9;
        }
      }
    }
    // удар костюма: сам по ближайшей твари в досягаемости (или по выбранной)
    if (atk) {
      atk.t += dt;
      if (!atk.done && atk.t >= sw.hitAt * 2) {
        atk.done = true;
        const m = atk.m;
        if (m.hp > 0 && dist(m, here) <= sw.reachCells) {
          m.hp = Math.max(0, m.hp - sw.damage); m.flash = 1; m.hunt = true;
          if (m.hp <= 0) mobDead(m);
        }
      }
      if (atk.t > 0.8) atk = null;
    } else if (suitAtkT <= 0 && !anim) {
      const foe = (target && target.hp > 0 && dist(target, here) <= sw.reachCells) ? target : mobs.filter((m) => m.hp > 0 && m.hunt && dist(m, here) <= sw.reachCells).sort((a, b) => dist(a, here) - dist(b, here))[0];
      if (foe) { atk = { m: foe, t: 0 }; suitAtkT = sw.cooldown; suitFace = px(foe.q, foe.r).x >= px(here.q, here.r).x ? 1 : -1; path = []; }
    }
  }
  function mobDead(m) {
    m.anim = 'DEAD'; target = null;
    AB.IsoEnemies.markDead(m.id);
    AB.Bus.emit('enemy:dead', { id: m.id, name: AB.ID.get(m.id).name, q: m.q, r: m.r });
  }
  // предмет на клетку (кристалл с убитой твари) и подбор, когда костюм встал на клетку
  function dropLoot(q, r, item, qty) { loot.set(key(q, r), [item, qty]); }
  function pickLoot() {
    const k = key(pos.q, pos.r), l = loot.get(k);
    if (!l) return;
    const n = AB.IsoStash.add(l[0], l[1]);
    if (n) { loot.delete(k); say(`Подобрано: ${AB.ID.get(l[0]).name}`); }
  }

  function icon(kind, x, y) {
    const s = size * 0.42;
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
  // карточка точки, где стоит экзокостюм
  let topHtml = '';
  function hud() {
    // сверху: кто на карте и текущая цель задания
    const q = AB.Quests.active().map((x) => x.objectives.find((o) => !o.ok)).find(Boolean);
    const th = `<b>Дно океана</b><span>${mode === 'capsule' ? `Капсула-база · экипаж: ${AB.IsoActs.crew().length}` : 'Марк в экзокостюме · Мира на связи'}</span>${q ? `<em>▸ ${q.text}</em>` : ''}`;
    if (th !== topHtml) { document.getElementById('ow-top').innerHTML = th; topHtml = th; }
    let s = anim ? null : siteAt(pos.q, pos.r);
    if (s && !shown(s)) s = null;
    if (s === onSite) return;
    onSite = s;
    const card = document.getElementById('ow-card');
    card.hidden = !s;
    if (!s) return;
    card.querySelector('b').textContent = s.name;
    card.querySelector('p').textContent = s.desc;
    const act = document.getElementById('ow-act'), a = AB.IsoActs ? AB.IsoActs.siteAction(s) : { label: s.key === 'abyss' ? 'Вернуться на корабль' : 'Исследовать — появится позже', ok: s.key === 'abyss' };
    act.textContent = a.label;
    act.disabled = !a.ok;
  }

  return {
    init, enter, back, close, say, isOpen: () => open_,
    setMode(m) { mode = m; }, mode: () => mode, refresh() { onSite = undefined; },
    mobs: () => mobs.map((m) => ({ id: m.id, q: m.q, r: m.r, hp: m.hp, hunt: m.hunt })), dropLoot, attack(id) { target = mobs.find((m) => m.id === id) || null; },
    pos: () => ({ ...pos }), goTo(q, r) { const p = route(anim ? anim.to : pos, { q, r }); if (p) path = p; return !!p; },
    cell: (q, r) => cells.get(key(q, r)), seenCount: () => [...cells.values()].filter((c) => c.seen).length, total: () => cells.size,
    moving: () => !!anim || path.length > 0, route,
  };
})();
