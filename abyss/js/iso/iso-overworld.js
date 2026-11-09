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
  let mode = 'suit';                    // №55: 'suit' — Марк в экзокостюме один (акт II), 'capsule' — база-капсула (акт III)
  const viewR = () => (AB.IsoActs ? AB.IsoActs.view() : 2);   // на сколько клеток видно вокруг (сонар базы — дальше)
  const shown = (s) => !AB.IsoActs || AB.IsoActs.siteVisible(s);

  const inside = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= D().radius;
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const px = (q, r) => ({ x: size * SQ3 * (q + r / 2), y: size * 1.5 * r });
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
    document.getElementById('ow-base-btn').addEventListener('click', () => baseOpen(true));
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
    const x = ((cx - rc.left) * dpr - cv.width / 2 + cam.x) / size, y = ((cy - rc.top) * dpr - cv.height / 2 + cam.y) / size;
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
    // шаг экзокостюма: тяжёлый, ~0,45 с на клетку
    if (!anim && path.length) { anim = { from: { ...pos }, to: path.shift(), t: 0 }; }
    if (anim) {
      anim.t += dt / 0.45;
      if (anim.t >= 1) { pos = anim.to; anim = null; reveal(); }
    }
    const cur = anim ? lerpPos(anim.from, anim.to, anim.t) : px(pos.q, pos.r);
    cam.x += (cur.x - cam.x) * Math.min(1, dt * 6); cam.y += (cur.y - cam.y) * Math.min(1, dt * 6);
    draw(cur);
    hud();
    requestAnimationFrame(loop);
  }
  const lerpPos = (a, b, t) => { const p = px(a.q, a.r), q = px(b.q, b.r); return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; };

  const COLOR = { silt: '#16242a', rock: '#0b0f12', trench: '#020406', crystal: '#2a1f3a' };
  function hex(x, y, s) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); g.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)); } g.closePath(); }
  function draw(cur) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#010305'; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(1, 0, 0, 1, cv.width / 2 - cam.x, cv.height / 2 - cam.y);
    for (const c of cells.values()) {
      if (!c.seen) continue;
      const p = px(c.q, c.r), near = dist(c, pos) <= viewR();
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
    // экзокостюм или капсула
    g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.ellipse(cur.x, cur.y + 6, (mode === 'capsule' ? 18 : 10) * dpr, 4 * dpr, 0, 0, 7); g.fill();
    if (mode === 'capsule') {
      g.fillStyle = '#c9a24a'; g.beginPath(); g.ellipse(cur.x, cur.y - 6, 16 * dpr, 9 * dpr, 0, 0, 7); g.fill();
      g.fillStyle = '#5ee6ff'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(cur.x + i * 7 * dpr, cur.y - 7, 2.4 * dpr, 0, 7); g.fill(); }
    } else {
      g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(cur.x, cur.y - 4, 8 * dpr, 0, 7); g.fill();
      g.fillStyle = '#5ee6ff'; g.beginPath(); g.arc(cur.x + 2 * dpr, cur.y - 6, 3.2 * dpr, 0, 7); g.fill();
    }
    // свет нашлемных фонарей
    const lg = g.createRadialGradient(cur.x, cur.y, 0, cur.x, cur.y, size * 3.2);
    lg.addColorStop(0, 'rgba(120,200,220,.08)'); lg.addColorStop(1, 'rgba(120,200,220,0)');
    g.fillStyle = lg; g.fillRect(cur.x - size * 3.2, cur.y - size * 3.2, size * 6.4, size * 6.4);
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
    pos: () => ({ ...pos }), goTo(q, r) { const p = route(anim ? anim.to : pos, { q, r }); if (p) path = p; return !!p; },
    cell: (q, r) => cells.get(key(q, r)), seenCount: () => [...cells.values()].filter((c) => c.seen).length, total: () => cells.size,
    moving: () => !!anim || path.length > 0, route,
  };
})();
