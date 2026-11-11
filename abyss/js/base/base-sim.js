// =====================================================================
// БАЗА: СИМУЛЯЦИЯ (дополнение №71). Сердце конструктора базы — план
// (помещения, устройства, проходы), склады и работа экипажа. Без экрана,
// без DOM и без мира изометрии: только данные и время. Поэтому тот же код
// может считать базу на сервере, пока игрок не в игре (офлайн-ход): состояние
// — простой JSON, а время — секунды реального мира.
//
// Связь с остальной игрой — только через адаптер ext (setExt):
//   count(item) / take(item, n) / give(item, n) — шкафчики экипажа (общий
//   инвентарь, металлолом, электроника…); present() — кто из экипажа сейчас
//   на базе (герой в отряде на карте дна не работает).
//
// Работа героя — как в Kenshi: у каждого свой список работ по приоритету
// (устройство, «Переноска», «Стройка»); герой берёт первое дело, где есть
// работа. Все перемещения — по клеткам плана, время пути = длина / скорость.
// =====================================================================

AB.BaseSim = (() => {
  const D = () => AB.BASE_DATA;
  const KEY = 'abyss_base_v1';
  const STEP_ACT = 0.5;                 // секунды: взять / положить
  let S = null, G = null;               // состояние и кэш геометрии
  let ext = { count: () => 0, take: () => 0, give: () => 0, present: null };
  const emit = (ev, data) => { if (AB.Bus) AB.Bus.emit(ev, data); };

  const BP = new Map();
  const bp = (id) => { if (!BP.size) D().blueprints.forEach((b) => BP.set(b.id, b)); return BP.get(id); };
  const grid = () => AB.BaseGrids.get(S.grid);
  const nm = (item) => { const d = AB.ID.get(item); return d ? d.name.toLowerCase() : item; };

  // ---------- состояние ----------
  function fresh() {
    const c = D().core;
    return {
      v: 1, t: 0, seq: 0, savedAt: Date.now(), grid: D().grid, hull: { ...D().hull },
      rooms: c.rooms.map((r) => ({ ...r, bp: null, core: true, built: true })),
      devs: [{ uid: 'pile', bp: 'BLD-100', core: true, ...c.pile, built: true }],
      pile: {}, crew: {}, orders: [], present: [],
      unlocked: D().blueprints.filter((b) => b.start).map((b) => b.id),
      done: {},                          // какие чертежи уже хоть раз построены
    };
  }
  const uid = (p) => `${p}${++S.seq}`;
  const room = (u) => S.rooms.find((r) => r.uid === u);
  const dev = (u) => S.devs.find((d) => d.uid === u);
  const obj = (u) => room(u) || dev(u);
  const racks = () => S.devs.filter((d) => d.built && bp(d.bp).store);
  const frames = () => [...S.rooms, ...S.devs].filter((o) => !o.built).sort((a, b) => a.seq - b.seq);
  function dirty() { G = null; emit('base:plan', {}); }

  // ---------- геометрия: где пол, проходы, что занято ----------
  function geom() {
    if (G) return G;
    const { w, h } = S.hull, walk = new Uint8Array(w * h), roomAt = new Array(w * h).fill(null);
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h) walk[y * w + x] = v; };
    for (const r of S.rooms) if (r.built) for (const [x, y] of grid().cells(r)) { set(x, y, 1); roomAt[y * w + x] = r.uid; }
    const doors = [];
    for (let i = 0; i < S.rooms.length; i++) for (let j = i + 1; j < S.rooms.length; j++) {
      const a = S.rooms[i], b = S.rooms[j], cells = grid().door(a, b);
      if (!cells) continue;
      doors.push({ a: a.uid, b: b.uid, cells, open: a.built || b.built });
      if (a.built || b.built) for (const [x, y] of cells) { set(x, y, 1); roomAt[y * w + x] = a.built ? a.uid : b.uid; }
    }
    for (const p of D().core.props) for (const [x, y] of grid().cells(p)) set(x, y, 0);
    for (const d of S.devs) for (const [x, y] of grid().cells(d)) set(x, y, 0);
    G = { w, h, walk, roomAt, doors };
    return G;
  }
  const walkable = (x, y) => { const g = geom(); return x >= 0 && y >= 0 && x < g.w && y < g.h && g.walk[y * g.w + x] === 1; };

  // клетки, откуда можно работать с предметом: соседние с ним проходимые (у помещения-каркаса — его проходы)
  function access(o) {
    const out = [], g = geom();
    const r = o.rect || o;
    for (let x = r.x - 1; x <= r.x + r.w; x++) for (let y = r.y - 1; y <= r.y + r.h; y++) {
      const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h, corner = (x < r.x || x >= r.x + r.w) && (y < r.y || y >= r.y + r.h);
      if (!inside && !corner && walkable(x, y)) out.push(y * g.w + x);
    }
    return out;
  }
  function targetsOf(ref) {
    const g = geom();
    if (ref.rest) { const p = restOf(ref.rest), c = nearestWalk(Math.floor(p.x), Math.floor(p.y)); return c ? [c[1] * g.w + c[0]] : []; }
    if (ref.enter) { const p = D().core.enter; return [Math.floor(p.y) * g.w + Math.floor(p.x)]; }
    if (ref.locker) return access(D().core.props.find((p) => p.locker));
    if (ref.pile) return access(dev('pile'));
    const o = obj(ref.uid);
    return o ? access(o) : [];
  }
  // место отдыха героя: у каждого своё (номер в экипаже)
  function restOf(id) { const list = D().core.rest, i = Math.max(0, Object.keys(S.crew).indexOf(id)); return list[i % list.length]; }
  function nearestWalk(x, y) {
    if (walkable(x, y)) return [x, y];
    for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && walkable(x + dx, y + dy)) return [x + dx, y + dy];
    }
    return null;
  }
  // путь по клеткам (8 направлений, углы не срезать) до любой из целей → { pts, len }
  function route(px, py, targets) {
    const g = geom(), s = nearestWalk(Math.floor(px), Math.floor(py));
    if (!s || !targets.length) return null;
    const goal = new Set(targets), start = s[1] * g.w + s[0];
    const prev = new Int32Array(g.w * g.h).fill(-2);
    prev[start] = -1;
    const q = [start];
    let hit = goal.has(start) ? start : -1;
    for (let qi = 0; qi < q.length && hit < 0; qi++) {
      const c = q[qi], cx = c % g.w, cy = (c / g.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!walkable(nx, ny)) continue;
        if (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
        const n = ny * g.w + nx;
        if (prev[n] !== -2) continue;
        prev[n] = c; q.push(n);
        if (goal.has(n)) { hit = n; break; }
      }
    }
    if (hit < 0) return null;
    const cells = [];
    for (let c = hit; c !== -1; c = prev[c]) cells.push(c);
    cells.reverse();
    const pts = [{ x: px, y: py }, ...cells.map((c) => ({ x: (c % g.w) + 0.5, y: ((c / g.w) | 0) + 0.5 }))];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return { pts, len };
  }
  const reach = (ref, from) => { const p = from || D().core.enter; return !!route(p.x, p.y, targetsOf(ref)); };

  // ---------- склады и запасы ----------
  const CARRY = () => D().carry;
  function amount(ref, item) {
    if (ref.pile) return S.pile[item] || 0;
    if (ref.locker) return ext.count(item);
    const d = dev(ref.uid); if (!d) return 0;
    if (ref.slot === 'store') return d.mat === item ? d.n || 0 : 0;
    return (d[ref.slot] || {})[item] || 0;
  }
  function space(ref, item) {
    if (ref.pile) return Infinity;
    const o = obj(ref.uid); if (!o) return 0;
    if (ref.slot === 'frame') { const need = (o.need.find(([i]) => i === item) || [0, 0])[1]; return Math.max(0, need - (o.got[item] || 0)); }
    const b = bp(o.bp);
    if (ref.slot === 'store') return o.mat && o.mat !== item ? 0 : b.store.cap - (o.n || 0);
    if (ref.slot === 'in') return b.recipe && b.recipe.in === item ? b.recipe.inCap - ((o.in || {})[item] || 0) : 0;
    return 0;
  }
  function takeFrom(ref, item, n) {
    n = Math.min(n, amount(ref, item));
    if (n <= 0) return 0;
    if (ref.pile) { S.pile[item] -= n; if (!S.pile[item]) delete S.pile[item]; return n; }
    if (ref.locker) return ext.take(item, n);
    const d = dev(ref.uid);
    if (ref.slot === 'store') { d.n -= n; return n; }
    d[ref.slot][item] -= n; return n;
  }
  function putTo(ref, item, n) {
    n = Math.min(n, space(ref, item));
    if (n <= 0) return 0;
    if (ref.pile) { S.pile[item] = (S.pile[item] || 0) + n; return n; }
    const o = obj(ref.uid);
    if (ref.slot === 'frame') { o.got[item] = (o.got[item] || 0) + n; return n; }
    if (ref.slot === 'store') { o.mat = item; o.n = (o.n || 0) + n; return n; }
    o.in = o.in || {}; o.in[item] = (o.in[item] || 0) + n; return n;
  }
  // сколько уже несут к цели (чтобы двое не таскали одно и то же)
  function reserved(uidTo, item) {
    let n = 0;
    for (const w of Object.values(S.crew)) if (w.task && w.task.res && w.task.res.to === uidTo && w.task.res.item === item) n += w.task.res.n;
    return n;
  }
  function dist(w, ref) { const r = route(w.x, w.y, targetsOf(ref)); return r ? r.len : Infinity; }
  // откуда брать материал для стройки: стеллажи с этим материалом, шкафчики экипажа
  function sourceOf(w, item) {
    const opts = racks().filter((d) => d.mat === item && d.n > 0).map((d) => ({ uid: d.uid, slot: 'store' }));
    if (ext.count(item) > 0) opts.push({ locker: true });
    let best = null, bd = Infinity;
    for (const o of opts) { const d = dist(w, o); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  function rackFor(w, item, autoOnly) {
    let best = null, bd = Infinity;
    for (const d of racks()) {
      if (d.mat !== item || (autoOnly && !d.auto)) continue;
      if (space({ uid: d.uid, slot: 'store' }, item) - reserved(d.uid, item) <= 0) continue;
      const k = dist(w, { uid: d.uid }); if (k < bd) { bd = k; best = d; }
    }
    return best;
  }

  // ---------- задачи героев ----------
  // задача — список шагов (только данные, чтобы её можно было сохранить):
  // go {ref} · take {ref,item,n} · put {ref,item} · craft {uid} · build {uid} · idle {secs}
  const haulTask = (label, from, item, n, to, res) => ({ kind: 'haul', label, res, steps: [
    { go: from }, { take: { ref: from, item, n } }, { go: { uid: to.uid } }, { put: { ref: to, item } }] });

  function planDeposit(w) {
    const item = w.carry.item;
    if (w.jobs.includes('build')) for (const f of frames()) {
      const need = (f.need.find(([i]) => i === item) || [0, 0])[1];
      if (need - (f.got[item] || 0) - reserved(f.uid, item) > 0 && reach({ uid: f.uid }, w)) {
        return { kind: 'build', label: `несёт ${nm(item)} на стройку`, res: { to: f.uid, item, n: w.carry.n }, steps: [{ go: { uid: f.uid } }, { put: { ref: { uid: f.uid, slot: 'frame' }, item } }] };
      }
    }
    for (const u of w.jobs) {
      const d = dev(u); if (!d || !d.built || !bp(d.bp).recipe || bp(d.bp).recipe.in !== item) continue;
      if (space({ uid: u, slot: 'in' }, item) - reserved(u, item) > 0) return { kind: 'op', label: `загружает ${nm(item)}`, res: { to: u, item, n: w.carry.n }, steps: [{ go: { uid: u } }, { put: { ref: { uid: u, slot: 'in' }, item } }] };
    }
    const r = rackFor(w, item, false);
    if (r) return { kind: 'haul', label: `несёт ${nm(item)} на склад`, res: { to: r.uid, item, n: w.carry.n }, steps: [{ go: { uid: r.uid } }, { put: { ref: { uid: r.uid, slot: 'store' }, item } }] };
    return { kind: 'haul', label: `относит ${nm(item)} в приёмник`, steps: [{ go: { pile: true } }, { put: { ref: { pile: true }, item } }] };
  }
  function planOrder(id, w) {
    for (const o of [...S.orders]) {
      const to = dev(o.to);
      const left = amount(o.from, o.item), room_ = to ? space({ uid: o.to, slot: 'store' }, o.item) - reserved(o.to, o.item) : 0;
      if (!to || left <= 0 || room_ <= 0) { if (!to || left <= 0 || space({ uid: o.to, slot: 'store' }, o.item) <= 0) S.orders.splice(S.orders.indexOf(o), 1); continue; }
      if (!(w.jobs.includes('haul') || (o.from.uid && w.jobs.includes(o.from.uid)))) continue;
      const n = Math.min(CARRY(), left, room_);
      return haulTask(`несёт ${nm(o.item)} на склад (приказ)`, o.from, o.item, n, { uid: o.to, slot: 'store' }, { to: o.to, item: o.item, n });
    }
    return null;
  }
  function planOperate(id, w, d) {
    if (!d || !d.built) return null;
    const r = bp(d.bp).recipe; if (!r) return null;
    d.in = d.in || {}; d.out = d.out || {};
    if ((d.out[r.out] || 0) >= r.outCap) {
      const rk = rackFor(w, r.out, true);
      if (rk) { d.block = null; const n = Math.min(CARRY(), d.out[r.out], space({ uid: rk.uid, slot: 'store' }, r.out)); return haulTask(`уносит ${nm(r.out)} на склад`, { uid: d.uid, slot: 'out' }, r.out, n, { uid: rk.uid, slot: 'store' }, { to: rk.uid, item: r.out, n }); }
      d.block = 'full';
      return null;
    }
    if ((d.in[r.in] || 0) < r.inN) {
      const want = r.inCap - (d.in[r.in] || 0) - reserved(d.uid, r.in);
      if (want <= 0) return null;
      const src = racks().filter((k) => k.mat === r.in && k.n > 0).map((k) => ({ uid: k.uid, slot: 'store' })).sort((a, b) => dist(w, a) - dist(w, b))[0];
      if (!src) { d.block = 'noinput'; return null; }
      d.block = null;
      const n = Math.min(CARRY(), want, amount(src, r.in));
      return haulTask(`несёт ${nm(r.in)} к станку`, src, r.in, n, { uid: d.uid, slot: 'in' }, { to: d.uid, item: r.in, n });
    }
    if (d.crafter && d.crafter !== id && S.crew[d.crafter] && S.crew[d.crafter].task && S.crew[d.crafter].task.kind === 'craft') return null;
    d.block = null;
    return { kind: 'craft', label: `работает: ${bp(d.bp).name}`, steps: [{ go: { uid: d.uid } }, { craft: { uid: d.uid } }] };
  }
  function planHaul(w) {
    for (const item of Object.keys(S.pile)) {
      if (!(S.pile[item] > 0)) continue;
      const rk = rackFor(w, item, true); if (!rk) continue;
      const n = Math.min(CARRY(), S.pile[item], space({ uid: rk.uid, slot: 'store' }, item) - reserved(rk.uid, item));
      return haulTask(`разносит ${nm(item)} из приёмника`, { pile: true }, item, n, { uid: rk.uid, slot: 'store' }, { to: rk.uid, item, n });
    }
    for (const d of S.devs) {
      const r = d.built && bp(d.bp).recipe; if (!r || !((d.out || {})[r.out] > 0)) continue;
      const rk = rackFor(w, r.out, true); if (!rk) continue;
      const n = Math.min(CARRY(), d.out[r.out], space({ uid: rk.uid, slot: 'store' }, r.out) - reserved(rk.uid, r.out));
      return haulTask(`уносит ${nm(r.out)} от станка`, { uid: d.uid, slot: 'out' }, r.out, n, { uid: rk.uid, slot: 'store' }, { to: rk.uid, item: r.out, n });
    }
    return null;
  }
  function planBuild(w) {
    for (const f of frames()) {
      if (!reach({ uid: f.uid }, w)) continue;
      let all = true;
      for (const [item, need] of f.need) {
        const m = need - (f.got[item] || 0);
        if (m <= 0) continue;
        all = false;
        const left = m - reserved(f.uid, item);
        if (left <= 0) continue;
        const src = sourceOf(w, item); if (!src) continue;
        const n = Math.min(CARRY(), left, amount(src, item));
        return haulTask(`несёт ${nm(item)} на стройку`, src, item, n, { uid: f.uid, slot: 'frame' }, { to: f.uid, item, n });
      }
      if (all && f.work > 0) return { kind: 'build', label: `строит: ${f.name}`, steps: [{ go: { uid: f.uid } }, { build: { uid: f.uid, secs: 10 } }] };
    }
    return null;
  }
  function plan(id, w) {
    if (w.carry) return planDeposit(w);
    const o = planOrder(id, w); if (o) return o;
    for (const j of w.jobs) {
      const t = j === 'build' ? planBuild(w) : j === 'haul' ? planHaul(w) : planOperate(id, w, dev(j));
      if (t) return t;
    }
    const rp = restOf(id);
    if (Math.hypot(w.x - rp.x, w.y - rp.y) > 1.5) return { kind: 'rest', label: 'отдыхает', steps: [{ go: { rest: id } }, { idle: { secs: 3 } }] };
    return { kind: 'rest', label: 'отдыхает', steps: [{ idle: { secs: 2 } }] };
  }

  // ---------- выполнение шагов ----------
  function abort(w, why) {
    const t = w.task;
    if (t) for (const s of t.steps) if (s.craft) { const d = dev(s.craft.uid); if (d && d.crafter === w.id) d.crafter = null; }
    w.task = null; w.wait = 1.5; w.why = why || null;
  }
  function begin(w) {
    const s = w.task.steps[w.task.i];
    w.el = 0;
    if (s.go) {
      const r = route(w.x, w.y, targetsOf(s.go));
      if (!r) { abort(w, 'нет пути'); return false; }
      w.path = r.pts; w.dur = r.len / D().speed;
    }
    if (s.craft) {
      const d = dev(s.craft.uid), r = d && bp(d.bp).recipe;
      if (!r || (d.in[r.in] || 0) < r.inN || (d.out[r.out] || 0) >= r.outCap) { abort(w); return false; }
      d.crafter = w.id; d.prog = d.prog || 0;
    }
    return true;
  }
  function next(w) {
    w.task.i++; w.path = null;
    if (w.task.i >= w.task.steps.length) { w.task = null; w.wait = 0; return; }
    begin(w);
  }
  function stepWorker(w, dt) {
    if (!w.task) {
      if (w.wait > 0) { w.wait -= dt; return; }
      w.task = plan(w.id, w); w.why = null;
      if (!w.task) { w.wait = 1; return; }
      w.task.i = 0;
      if (!begin(w)) return;
    }
    const s = w.task.steps[w.task.i];
    w.el += dt;
    if (s.go) {
      const pts = w.path || [];
      let d = Math.min(w.el, w.dur) * D().speed;
      for (let i = 1; i < pts.length; i++) {
        const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (d <= L || i === pts.length - 1) { const k = L ? Math.min(1, d / L) : 1; w.x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k; w.y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k; break; }
        d -= L;
      }
      if (w.el >= w.dur) next(w);
    } else if (s.take) {
      if (w.el < STEP_ACT) return;
      if (w.carry && w.carry.item !== s.take.item) { abort(w); return; }
      const n = takeFrom(s.take.ref, s.take.item, Math.min(s.take.n, CARRY() - (w.carry ? w.carry.n : 0)));
      if (n <= 0) { abort(w, 'пусто'); return; }
      w.carry = { item: s.take.item, n: (w.carry ? w.carry.n : 0) + n };
      if (w.task.res) w.task.res.n = w.carry.n;
      next(w);
    } else if (s.put) {
      if (w.el < STEP_ACT) return;
      if (w.carry) {
        const n = putTo(s.put.ref, s.put.item, w.carry.n);
        w.carry.n -= n;
        if (w.carry.n <= 0) w.carry = null;
        if (s.put.ref.slot === 'frame') checkFrame(obj(s.put.ref.uid));
      }
      w.task.res = null;
      next(w);
    } else if (s.craft) {
      const d = dev(s.craft.uid), r = d && bp(d.bp).recipe;
      if (!r) { abort(w); return; }
      d.prog += dt;
      if (d.prog >= r.time) {
        d.prog = 0; d.crafter = null;
        d.in[r.in] -= r.inN; d.out[r.out] = (d.out[r.out] || 0) + r.outN;
        d.made = (d.made || 0) + r.outN;
        next(w);
      }
    } else if (s.build) {
      const f = obj(s.build.uid);
      if (!f || f.built) { next(w); return; }
      f.work -= dt;
      if (f.work <= 0) complete(f);
      if (f.built || w.el >= s.build.secs) next(w);
    } else if (s.idle) {
      if (w.el >= s.idle.secs) next(w);
    }
  }

  // ---------- стройка ----------
  function costOf(b, r) {
    if (b.kind === 'room') return b.costPerCell.map(([i, n]) => [i, n * r.w * r.h]);
    return (b.cost || []).map(([i, n]) => [i, n]);
  }
  const workOf = (b, r) => (b.kind === 'room' ? Math.round(b.workPerCell * r.w * r.h) : b.work);
  function checkFrame(f) { if (f && !f.built && f.need.every(([i, n]) => (f.got[i] || 0) >= n) && f.work <= 0) complete(f); }
  function complete(f) {
    f.built = true; f.work = 0; f.got = {};
    const first = !S.done[f.bp];
    S.done[f.bp] = (S.done[f.bp] || 0) + 1;
    dirty();
    emit('base:built', { uid: f.uid, bp: f.bp, name: f.name, first });
  }
  // помещения связаны проходами с ядром капсулы?
  function connected(rooms) {
    const seen = new Set(rooms.filter((r) => r.core).map((r) => r.uid)), q = [...seen];
    while (q.length) {
      const u = q.shift(), a = rooms.find((r) => r.uid === u);
      for (const b of rooms) if (!seen.has(b.uid) && grid().door(a, b)) { seen.add(b.uid); q.push(b.uid); }
    }
    return rooms.every((r) => seen.has(r.uid));
  }
  // можно ли поставить (или передвинуть / изменить) — { ok, why, cost }
  function check(spec) {
    const b = bp(spec.bp), g = grid(), H = S.hull;
    const r = { x: spec.x, y: spec.y, w: spec.w, h: spec.h };
    const self = spec.uid ? obj(spec.uid) : null;
    const res = (ok, why) => ({ ok, why, cost: costOf(b, r) });
    if (!b) return res(false, 'Нет такого чертежа');
    if (!S.unlocked.includes(b.id) && !self) return res(false, 'Чертёж не изучен');
    if (b.kind === 'room') {
      const s = Math.min(r.w, r.h), l = Math.max(r.w, r.h);
      if (s < b.size.short[0] || s > b.size.short[1] || l < b.size.long[0] || l > b.size.long[1]) return res(false, `Размер: от ${b.size.short[0]}×${b.size.long[0]} до ${b.size.short[1]}×${b.size.long[1]}`);
      if (r.x < H.x + 1 || r.y < H.y + 1 || r.x + r.w > H.x + H.w - 1 || r.y + r.h > H.y + H.h - 1) return res(false, 'За пределами корпуса');
      if ((D().reserved || []).some((z) => g.overlap(r, z))) return res(false, 'Здесь выход из шлюза');
      const others = S.rooms.filter((o) => o !== self);
      if (others.some((o) => !g.apart(r, o))) return res(false, 'Нужна стена между помещениями (клетка зазора)');
      if (!others.some((o) => g.door(r, o))) return res(false, 'Нужно примкнуть к помещению через одну клетку стены — там будет проход');
      const next_ = [...others, { ...r, uid: '__new' }];
      if (!connected(next_)) return res(false, 'Другие помещения останутся без прохода к шлюзу');
      if (self) {
        const inside = (d) => d.x >= r.x && d.y >= r.y && d.x + d.w <= r.x + r.w && d.y + d.h <= r.y + r.h;
        const moved = spec.moveBy;
        for (const d of S.devs.filter((q) => q.room === self.uid)) {
          const nd = moved ? { ...d, x: d.x + moved.x, y: d.y + moved.y } : d;
          if (!inside(nd)) return res(false, 'Устройства не помещаются — сначала уберите их');
        }
      }
      return res(true, null);
    }
    // устройство: внутри одного построенного помещения, на свободном полу
    const cells = g.cells(r), gm = geom();
    const host = cells.length && gm.roomAt[cells[0][1] * gm.w + cells[0][0]];
    const hostRoom = host && room(host);
    if (!hostRoom || !hostRoom.built) return res(false, 'Ставится внутри построенного помещения');
    for (const [x, y] of cells) {
      if (x < hostRoom.x || y < hostRoom.y || x >= hostRoom.x + hostRoom.w || y >= hostRoom.y + hostRoom.h) return res(false, 'Не помещается в помещение');
      if (!walkable(x, y) && !(self && x >= self.x && y >= self.y && x < self.x + self.w && y < self.y + self.h)) return res(false, 'Место занято');
    }
    // не перекрыть проходы: после установки всё должно оставаться доступным
    const saved = S.devs, tmp = { ...r, uid: '__new' };
    S.devs = [...saved.filter((d) => d !== self), tmp]; G = null;
    const p = D().core.enter;
    const bad = !targetsOf({ uid: '__new' }).length || [...S.devs.map((d) => ({ uid: d.uid })), { locker: true }, ...S.rooms.filter((q) => !q.built).map((q) => ({ uid: q.uid }))]
      .some((ref) => !route(p.x, p.y, targetsOf(ref)));
    const roomsCut = S.rooms.filter((q) => q.built).some((q) => !route(p.x, p.y, grid().cells(q).filter(([x, y]) => walkable(x, y)).map(([x, y]) => y * geom().w + x)));
    S.devs = saved; G = null;
    if (bad || roomsCut) return res(false, 'Перекроет проход');
    return { ...res(true, null), room: hostRoom.uid };
  }
  function place(spec) {
    const c = check(spec);
    if (!c.ok) return c;
    const b = bp(spec.bp), r = { x: spec.x, y: spec.y, w: spec.w, h: spec.h };
    const o = { uid: uid(b.kind === 'room' ? 'r' : 'd'), bp: b.id, name: b.name, ...r, seq: S.seq, built: false, need: costOf(b, r), got: {}, work: workOf(b, r) };
    if (b.kind === 'room') { o.look = b.look; S.rooms.push(o); } else { o.room = c.room; S.devs.push(o); if (b.store) { o.mat = null; o.n = 0; o.auto = false; o.no = S.devs.filter((d) => d.bp === b.id).length; } }
    dirty();
    return { ...c, uid: o.uid };
  }
  // передвинуть или изменить размер. Каркас — бесплатно; построенное снова становится каркасом:
  // уже вложенное засчитывается, недостающее довезут, работы — треть от новой постройки
  function modify(uidX, rect) {
    const o = obj(uidX); if (!o || o.core) return { ok: false, why: 'Ядро капсулы не перестраивается' };
    const b = bp(o.bp);
    const moveBy = rect.w === o.w && rect.h === o.h ? { x: rect.x - o.x, y: rect.y - o.y } : null;
    const c = check({ bp: o.bp, uid: uidX, ...rect, moveBy });
    if (!c.ok) return c;
    if (b.kind === 'device' && o.built) {   // устройство переносят целиком
      Object.assign(o, rect, { room: c.room }); dirty(); return c;
    }
    const credit = o.built ? Object.fromEntries(o.need) : { ...o.got };
    const was = { ...o };
    Object.assign(o, rect);
    o.need = costOf(b, o);
    o.got = {};
    for (const [i, n] of o.need) o.got[i] = Math.min(n, credit[i] || 0);
    for (const [i, n] of Object.entries(credit)) { const extra = n - (o.got[i] || 0); if (extra > 0) S.pile[i] = (S.pile[i] || 0) + extra; }
    o.work = was.built ? Math.max(2, Math.round(workOf(b, o) / 3)) : workOf(b, o);
    o.built = false;
    o.seq = ++S.seq;
    if (moveBy) for (const d of S.devs.filter((q) => q.room === o.uid)) { d.x += moveBy.x; d.y += moveBy.y; }
    dirty();
    return c;
  }
  function remove(uidX) {
    const o = obj(uidX);
    if (!o || o.core) return { ok: false, why: 'Ядро капсулы не сносится' };
    const b = bp(o.bp);
    if (b.kind === 'room') {
      if (S.devs.some((d) => d.room === o.uid)) return { ok: false, why: 'Сначала уберите устройства из помещения' };
      if (!connected(S.rooms.filter((r) => r !== o))) return { ok: false, why: 'Другие помещения останутся без прохода' };
    }
    const back = {};
    if (o.built) for (const [i, n] of o.need || costOf(b, o)) back[i] = Math.floor(n * D().refund);
    else Object.assign(back, o.got);
    if (o.in) for (const [i, n] of Object.entries(o.in)) back[i] = (back[i] || 0) + n;
    if (o.out) for (const [i, n] of Object.entries(o.out)) back[i] = (back[i] || 0) + n;
    if (o.mat && o.n) back[o.mat] = (back[o.mat] || 0) + o.n;
    for (const [i, n] of Object.entries(back)) if (n > 0) S.pile[i] = (S.pile[i] || 0) + n;
    if (b.kind === 'room') S.rooms.splice(S.rooms.indexOf(o), 1); else S.devs.splice(S.devs.indexOf(o), 1);
    for (const w of Object.values(S.crew)) {
      w.jobs = w.jobs.filter((j) => j !== o.uid);
      if (w.task && JSON.stringify(w.task).includes(`"${o.uid}"`)) abort(w);
    }
    S.orders = S.orders.filter((q) => q.to !== o.uid && q.from.uid !== o.uid);
    dirty();
    return { ok: true, refund: back };
  }

  // ---------- экипаж ----------
  function worker(id) {
    if (!S.crew[id]) { const p = D().core.enter; S.crew[id] = { id, jobs: ['build', 'haul'], x: p.x, y: p.y, task: null, carry: null, wait: 0, el: 0, away: false }; }
    return S.crew[id];
  }
  function setJobs(id, jobs) { worker(id).jobs = jobs.filter((j, i) => jobs.indexOf(j) === i); }
  // назначить героя на устройство (в начало списка работ) или снять
  function assign(id, uidDev, on) {
    const w = worker(id);
    w.jobs = w.jobs.filter((j) => j !== uidDev);
    if (on) w.jobs.unshift(uidDev);
    if (!on && w.task && JSON.stringify(w.task).includes(`"${uidDev}"`)) abort(w);
  }
  const workers = (uidDev) => Object.values(S.crew).filter((w) => w.jobs.includes(uidDev)).map((w) => w.id);
  // приказ: отнести материал (из приёмника или с выхода станка) на выбранный стеллаж; стеллаж запоминает материал
  function order(from, item, to) {
    const r = dev(to);
    if (!r || !bp(r.bp).store) return { ok: false, why: 'Это не склад' };
    if (r.mat && r.mat !== item) return { ok: false, why: `Этот стеллаж хранит: ${nm(r.mat)}` };
    if (amount(from, item) <= 0) return { ok: false, why: 'Нечего нести' };
    r.mat = item;
    S.orders = S.orders.filter((o) => !(o.to === to && o.item === item && JSON.stringify(o.from) === JSON.stringify(from)));
    S.orders.push({ from, item, to });
    return { ok: true };
  }
  function setRack(uidR, patch) {
    const r = dev(uidR); if (!r) return false;
    if ('mat' in patch) { if (r.n > 0 && patch.mat !== r.mat) return false; r.mat = patch.mat; if (!r.mat) r.auto = false; }
    if ('auto' in patch) { if (!r.mat) return false; r.auto = !!patch.auto; }
    return true;
  }

  // ---------- время ----------
  function tick(dt) {
    if (!S) return;
    S.t += dt;
    const present = ext.present && !catching ? ext.present() : S.present;   // при досчёте — кто был на базе, когда игрок ушёл
    S.present = present;
    for (const w of Object.values(S.crew)) if (!present.includes(w.id) && !w.away) { w.away = true; if (w.task) abort(w); }
    for (const id of present) {
      const w = worker(id);
      if (w.away) { w.away = false; const p = D().core.enter; w.x = p.x; w.y = p.y; w.task = null; w.wait = 0; }
      // герой оказался на занятой клетке (поставили устройство) — шаг на свободную
      if (!w.task && !walkable(Math.floor(w.x), Math.floor(w.y))) { const n = nearestWalk(Math.floor(w.x), Math.floor(w.y)); if (n) { w.x = n[0] + 0.5; w.y = n[1] + 0.5; } }
      stepWorker(w, dt);
    }
  }
  // досчитать время, пока игрока не было (офлайн-ход): шагами по секунде
  let catching = false;
  function catchUp(secs) {
    const n = Math.min(secs, D().catchupMax);
    catching = true;
    try { for (let t = 0; t < n; t += 1) tick(Math.min(1, n - t)); } finally { catching = false; }
    return n;
  }

  // ---------- сохранение (сейчас — браузер; позже то же состояние хранит сервер) ----------
  const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set(v) { try { if (v == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch (e) { /* хранилище недоступно */ } } };
  function save() { if (!S) return; S.savedAt = Date.now(); store.set(JSON.stringify(S)); }
  function load() {
    let raw = null;
    try { raw = JSON.parse(store.get()); } catch (e) { raw = null; }
    if (!raw || raw.v !== 1) return 0;
    S = raw; G = null;
    const away = Math.max(0, (Date.now() - (S.savedAt || Date.now())) / 1000);
    const done = catchUp(away);
    dirty();
    return done;
  }
  // база появляется, когда капсулу отстыковали; если сохранение есть — досчитать отсутствие
  function ensure() {
    if (S) return S;
    if (!load() && !S) {
      S = fresh();
      for (const [i, n] of D().starter || []) ext.give(i, n);      // ремкомплект капсулы — в шкафчики экипажа
      S.starter = true;
      dirty();
      emit('base:new', {});
    }
    return S;
  }

  return {
    ensure, tick, catchUp, save, load, reset() { S = null; G = null; store.set(null); },
    setExt(e) { ext = { ...ext, ...e }; },
    state: () => S, on: () => !!S, bp, room, dev, obj, racks, frames, geom, walkable, route, targetsOf, access,
    check, place, modify, remove, assign, workers, setJobs, worker, order, setRack, amount,
    receive(item, n) { ensure(); S.pile[item] = (S.pile[item] || 0) + n; },
    costOf, workOf,
  };
})();
