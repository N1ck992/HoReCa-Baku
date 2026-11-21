// =====================================================================
// ПОВЕРХНОСТЬ · ЗОНА A1 (дополнение №135). Карта из шестиугольников
// (строки со сдвигом, «odd-r»), строится процедурно по js/data/surface-a1.js:
// слева пустыня (песок, дюны, столовые скалы, оазисы), справа болота
// (топь, тростник, бездонные окна, живая органика Хора), посередине река
// с бродами. Три петляющих тракта от цитадели к купели, деревни на них и
// между ними. Сверху — ущелье с тремя мостами в Б1, по краям — выходы в
// A4 (запад) и A2 (восток), пока закрыты. Отряд (Марк и Хейл) появляется
// в случайной точке, ходит по нажатию; дорога быстрее бездорожья; туман.
// =====================================================================

AB.IsoSurface = (() => {
  const D = () => AB.SURFACE_A1;
  const SQ3 = Math.sqrt(3), TILT = 0.776, S0 = 34, VIEW = 3;
  const SAVE = 'abyss_a1';
  let W = 0, H = 0, cells = [], built = false;
  let open_ = false, cv, g, dpr = 1, time = 0, last = 0;
  let bake = null, fogCv = null, fg = null, org = { x: 0, y: 0 };
  const sites = [];                       // { ...данные, c, r }
  const lanes = {};                       // имя → [клетки]

  // ---------- геометрия ----------
  const idx = (c, r) => r * W + c;
  const inMap = (c, r) => c >= 0 && r >= 0 && c < W && r < H;
  const cell = (c, r) => (inMap(c, r) ? cells[idx(c, r)] : null);
  const NB = [[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]];
  const nbrs = (k) => NB[k.r & 1].map(([dc, dr]) => cell(k.c + dc, k.r + dr)).filter(Boolean);
  const cube = (c, r) => { const q = c - (r - (r & 1)) / 2; return [q, r, -q - r]; };
  const dist = (a, b) => { const A = cube(a.c, a.r), B = cube(b.c, b.r); return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2])); };
  const upx = (c, r) => ({ x: SQ3 * (c + 0.5 * (r & 1)), y: 1.5 * r * TILT });          // в размерах клетки
  const bpx = (c, r) => { const p = upx(c, r); return { x: org.x + p.x * S0, y: org.y + p.y * S0 }; };   // в пикселях запечённой карты
  function unitCell(x, y) {
    y /= TILT;
    const q = (SQ3 / 3) * x - y / 3, r = (2 / 3) * y, s = -q - r;
    let rq = Math.round(q), rr = Math.round(r); const rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return { c: rq + (rr - (rr & 1)) / 2, r: rr };
  }

  // ---------- виды местности ----------
  // cost — сколько «шагов» занимает клетка (дорога — 1); block — не пройти
  const K = {
    sand: { cost: 1.6, col: [184, 154, 98], name: 'песок' },
    dune: { cost: 2.6, col: [201, 168, 106], name: 'дюны' },
    mesa: { block: 'Столовая скала — не забраться', col: [138, 84, 56], lift: 0.5 },
    oasis: { cost: 2, col: [118, 150, 84], name: 'оазис' },
    scrub: { cost: 1.8, col: [118, 116, 74], name: 'кустарник' },
    marsh: { cost: 2.2, col: [58, 86, 54], name: 'топь' },
    reeds: { cost: 2.8, col: [78, 104, 52], name: 'тростник' },
    bog: { block: 'Бездонное окно топи — утонешь', col: [24, 52, 54] },
    growth: { block: 'Живая органика Хора — сквозь неё не пройти', col: [96, 44, 82], lift: 0.28 },
    river: { block: 'Река — переходить только вброд', col: [44, 94, 122] },
    ford: { cost: 1.6, col: [92, 136, 146], name: 'брод' },
    gorge: { block: 'Ущелье — только по мостам', col: [10, 9, 9] },
    bridge: { cost: 1, col: [107, 74, 42], name: 'мост' },
    cliff: { block: 'Край зоны — обрыв', col: [92, 72, 52], lift: 0.55 },
  };
  const passable = (k) => !!k && !K[k.kind].block;
  const cost = (k) => (k.road ? (k.kind === 'ford' ? 1.3 : 1) : K[k.kind].cost || 99);

  // ---------- случайность (с зерном — карта всегда одна и та же) ----------
  function rng(seed) {
    return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function noise(rand, sc) {
    const gw = Math.ceil(W / sc) + 2, gh = Math.ceil(H / sc) + 2, v = Array.from({ length: gw * gh }, rand);
    const sm = (t) => t * t * (3 - 2 * t);
    return (c, r) => {
      const x = c / sc, y = r / sc, x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
      const a = v[y0 * gw + x0], b = v[y0 * gw + x0 + 1], cc = v[(y0 + 1) * gw + x0], d = v[(y0 + 1) * gw + x0 + 1];
      return (a + (b - a) * fx) * (1 - fy) + (cc + (d - cc) * fx) * fy;
    };
  }

  // ---------- поиск пути (Дейкстра на куче) ----------
  function search(start, goal, costOf) {
    const n = W * H, best = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
    const heap = []; const push = (i, d) => { heap.push([d, i]); let j = heap.length - 1; while (j) { const p = (j - 1) >> 1; if (heap[p][0] <= heap[j][0]) break; [heap[p], heap[j]] = [heap[j], heap[p]]; j = p; } };
    const pop = () => { const top = heap[0], end = heap.pop(); if (heap.length) { heap[0] = end; let j = 0; for (;;) { const l = 2 * j + 1, r = l + 1; let m = j; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === j) break; [heap[m], heap[j]] = [heap[j], heap[m]]; j = m; } } return top; };
    const s = idx(start.c, start.r); best[s] = 0; push(s, 0);
    while (heap.length) {
      const [d, i] = pop(); if (d > best[i]) continue;
      const k = cells[i];
      if (i !== s && goal(k)) { const path = []; for (let j = i; j !== s; j = from[j]) path.push(cells[j]); return path.reverse(); }
      for (const nb of nbrs(k)) {
        const c = costOf(nb); if (!isFinite(c)) continue;
        const j = idx(nb.c, nb.r), nd = d + c;
        if (nd < best[j]) { best[j] = nd; from[j] = i; push(j, nd); }
      }
    }
    return null;
  }

  // ---------- постройка карты ----------
  let rc = [];                            // столбец реки по строкам
  function build() {
    const d = D(); W = d.w; H = d.h;
    const rand = rng(d.seed), n1 = noise(rand, 4), n2 = noise(rand, 3), n3 = noise(rand, 2.2), nw = noise(rand, 5);
    rc = Array.from({ length: H }, (_, r) => d.river.col + d.river.amp * Math.sin(r * 0.33 + 0.8) + (nw(3, r) - 0.5) * 1.6);
    cells = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const dx = c + 0.5 * (r & 1) - rc[r], side = dx < 0 ? 'desert' : 'swamp';
      const a = n1(c, r), b = n2(c, r), e = n3(c, r);
      let kind;
      if (r <= 1) kind = 'gorge';
      else if (r === H - 1 || c === 0 || c === W - 1) kind = 'cliff';
      else if (Math.abs(dx) <= 0.6 + b * 0.5) kind = 'river';
      else if (Math.abs(dx) < 2.6) kind = a > 0.55 ? (side === 'desert' ? 'dune' : 'reeds') : 'scrub';
      else if (side === 'desert') kind = b > 0.68 ? 'mesa' : a > 0.6 ? 'dune' : b < 0.14 ? 'oasis' : 'sand';
      else kind = b > 0.7 ? 'bog' : e > 0.76 ? 'growth' : a > 0.56 ? 'reeds' : 'marsh';
      cells.push({ c, r, kind, side, road: false, seen: false, site: null, v: rand() });
    }
    const ground = (k) => (k.side === 'desert' ? 'sand' : 'marsh');
    const pave = (k) => {
      k.road = true;
      if (k.kind === 'river') k.kind = 'ford';
      else if (k.kind === 'gorge') k.kind = 'bridge';
      else if (K[k.kind].block) k.kind = ground(k);
    };
    // тракты: сплайн через опорные точки → клетки
    for (const [name, pts] of Object.entries(d.lanes)) {
      const P = pts.map(([c, r]) => upx(c, r)), path = [];
      const add = (k) => {
        const prev = path[path.length - 1];
        if (prev === k) return;
        if (prev && dist(prev, k) > 1) {         // прошли через угол — достроить промежуточные клетки
          const a = upx(prev.c, prev.r), b = upx(k.c, k.r), n = dist(prev, k);
          for (let i = 1; i < n; i++) { const u = unitCell(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n); const m = cell(u.c, u.r); if (m && m !== path[path.length - 1]) path.push(m); }
        }
        path.push(k);
      };
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
        for (let t = 0; t < 1; t += 0.04) {
          const t2 = t * t, t3 = t2 * t;
          const f = (a, b, c2, e2) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - e2) * t2 + (-a + 3 * b - 3 * c2 + e2) * t3);
          const u = unitCell(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y)); const k = cell(u.c, u.r); if (k) add(k);
        }
      }
      const endC = cell(pts[pts.length - 1][0], pts[pts.length - 1][1]); if (endC) add(endC);
      path.forEach(pave); lanes[name] = path;
    }
    // проложить дорогу от клетки до ближайшей дороги
    const carve = (k) => {
      const p = search(k, (m) => m.road && m.r >= 2, (m) => (m.kind === 'gorge' ? Infinity : m.road ? 0.5 : K[m.kind].block ? (m.kind === 'river' ? 5 : 7) : 1));
      pave(k); if (p) p.forEach(pave);
    };
    // точки
    sites.length = 0;
    for (const s of d.sites) {
      let k;
      if (s.lane) {
        const path = lanes[s.lane]; let i = Math.round(s.t * (path.length - 1));
        if (s.kind === 'ford') { let bi = i, bd = 1e9; path.forEach((m, j) => { if (m.kind === 'ford' && Math.abs(j - i) < bd) { bd = Math.abs(j - i); bi = j; } }); i = bi; }
        k = path[i];
      } else k = cell(s.at[0], s.at[1]);
      if (!k) continue;
      if (s.kind === 'bridge') { carve(cell(k.c, 2)); const top = cell(k.c, 0); top.kind = 'bridge'; top.road = true; k.kind = 'bridge'; k.road = true; }
      else if (s.kind === 'exit') { const edge = cell(s.dir < 0 ? 0 : W - 1, k.r); edge.kind = ground(k); edge.road = true; carve(k); }
      else carve(k);
      if (s.kind === 'village' || s.kind === 'capital' || s.kind === 'shrine') for (const nb of nbrs(k)) if (K[nb.kind].block && nb.kind !== 'river' && nb.kind !== 'gorge' && nb.kind !== 'cliff') nb.kind = ground(nb);
      const site = { ...s, c: k.c, r: k.r };
      k.site = site; sites.push(site);
      if (s.kind === 'capital' || s.kind === 'shrine') k.seen = true;     // о цитадели и купели все слышали — видны сразу
    }
    built = true;
    bakeMap();
  }

  // ---------- рисунок карты (один раз — в запасной холст) ----------
  const rgb = (c, m = 1, a = 1) => `rgba(${Math.round(c[0] * m)},${Math.round(c[1] * m)},${Math.round(c[2] * m)},${a})`;
  function hexPath(x, y, s, ctx) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); ctx.lineTo(x + s * Math.cos(a), y + s * Math.sin(a) * TILT); } ctx.closePath(); }
  function bakeMap() {
    const s = S0;
    bake = document.createElement('canvas');
    org = { x: s * 1.2, y: s * 1.4 };
    bake.width = Math.ceil(org.x * 2 + s * SQ3 * (W + 0.5)); bake.height = Math.ceil(org.y * 2 + s * 1.5 * TILT * (H - 1));
    const b = bake.getContext('2d');
    b.fillStyle = '#07090b'; b.fillRect(0, 0, bake.width, bake.height);
    const R = rng(77);
    // плоские клетки
    for (const k of cells) {
      const p = bpx(k.c, k.r), t = K[k.kind], m = 0.9 + k.v * 0.2;
      hexPath(p.x, p.y, s * 1.02, b); b.fillStyle = rgb(t.col, m); b.fill();
      b.strokeStyle = 'rgba(0,0,0,.08)'; b.lineWidth = 1; b.stroke();
      deco(b, k, p, s, R);
    }
    // дороги: от центра к центру соседних дорожных клеток
    const roadCol = (k) => (k.kind === 'bridge' ? '#7a5634' : k.kind === 'ford' ? '#8fb2b6' : k.side === 'desert' ? '#e2c88e' : '#5b4a30');
    for (const pass of [0, 1]) for (const k of cells) {
      if (!k.road) continue;
      const p = bpx(k.c, k.r);
      for (const nb of nbrs(k)) {
        if (!nb.road || idx(nb.c, nb.r) < idx(k.c, k.r)) continue;
        const q = bpx(nb.c, nb.r);
        b.strokeStyle = pass ? roadCol(k) : 'rgba(0,0,0,.35)'; b.lineWidth = pass ? s * 0.34 : s * 0.48; b.lineCap = 'round';
        b.beginPath(); b.moveTo(p.x, p.y); b.lineTo(q.x, q.y); b.stroke();
      }
      if (k.kind === 'bridge') {                 // доски моста
        b.strokeStyle = '#3a2614'; b.lineWidth = 2;
        for (let i = -2; i <= 2; i++) { b.beginPath(); b.moveTo(p.x - s * 0.35, p.y + i * s * 0.18); b.lineTo(p.x + s * 0.35, p.y + i * s * 0.18); b.stroke(); }
        b.strokeStyle = '#2a1a0c'; b.lineWidth = 3; for (const sx of [-1, 1]) { b.beginPath(); b.moveTo(p.x + sx * s * 0.4, p.y - s * 0.6); b.lineTo(p.x + sx * s * 0.4, p.y + s * 0.6); b.stroke(); }
      }
      if (k.kind === 'ford') { b.fillStyle = 'rgba(210,220,210,.5)'; for (let i = 0; i < 5; i++) { b.beginPath(); b.ellipse(p.x + (R() - 0.5) * s, p.y + (R() - 0.5) * s * 0.6, s * 0.09, s * 0.06, 0, 0, 7); b.fill(); } }
    }
    // поднятые клетки (скалы, обрывы, органика) — по строкам сверху вниз
    for (const k of cells) {
      const t = K[k.kind]; if (!t.lift) continue;
      const p = bpx(k.c, k.r), h = s * t.lift * (0.8 + k.v * 0.4);
      b.fillStyle = rgb(t.col, 0.55);
      b.beginPath();
      for (let i = 0; i <= 3; i++) { const a = Math.PI / 180 * (60 * i - 30 + 0); const x = p.x + s * Math.cos(a), y = p.y + s * Math.sin(a) * TILT; if (i === 0) b.moveTo(x, y); else b.lineTo(x, y); }
      for (let i = 3; i >= 0; i--) { const a = Math.PI / 180 * (60 * i - 30); b.lineTo(p.x + s * Math.cos(a), p.y + s * Math.sin(a) * TILT - h); }
      b.closePath(); b.fill();
      hexPath(p.x, p.y - h, s, b); b.fillStyle = rgb(t.col, 1.05 + k.v * 0.1); b.fill();
      b.strokeStyle = rgb(t.col, 1.35, 0.5); b.lineWidth = 1.5; b.stroke();
      if (k.kind === 'growth') {                  // пузыри органики
        for (let i = 0; i < 4; i++) { b.fillStyle = `rgba(${200 + R() * 55},${90 + R() * 60},${170 + R() * 60},.75)`; b.beginPath(); b.arc(p.x + (R() - 0.5) * s, p.y - h + (R() - 0.5) * s * 0.6, s * (0.08 + R() * 0.12), 0, 7); b.fill(); }
      }
      if (k.kind === 'mesa') { b.strokeStyle = 'rgba(60,30,18,.5)'; b.lineWidth = 1; for (let i = 0; i < 3; i++) { const y = p.y - h + s * 0.35 + i * h * 0.25; b.beginPath(); b.moveTo(p.x - s * 0.8, y + h * 0.1); b.lineTo(p.x + s * 0.8, y + h * 0.1); b.stroke(); } }
    }
    fogCv = document.createElement('canvas'); fogCv.width = bake.width; fogCv.height = bake.height;
    fg = fogCv.getContext('2d'); fg.fillStyle = '#05070a'; fg.fillRect(0, 0, fogCv.width, fogCv.height);
    for (const k of cells) if (k.seen) clearFog(k);
  }
  function deco(b, k, p, s, R) {
    switch (k.kind) {
      case 'sand': b.fillStyle = 'rgba(120,90,50,.35)'; for (let i = 0; i < 4; i++) b.fillRect(p.x + (R() - 0.5) * s * 1.2, p.y + (R() - 0.5) * s * 0.8, 2, 2); break;
      case 'dune': b.strokeStyle = 'rgba(250,225,170,.55)'; b.lineWidth = 2; for (let i = -1; i <= 1; i++) { b.beginPath(); b.arc(p.x + i * s * 0.25, p.y + s * 0.5 + i * 3, s * 0.55, Math.PI * 1.15, Math.PI * 1.85); b.stroke(); } break;
      case 'oasis': b.fillStyle = '#3f86a0'; b.beginPath(); b.ellipse(p.x, p.y, s * 0.42, s * 0.26, 0, 0, 7); b.fill(); b.fillStyle = '#2f6a2a'; for (let i = 0; i < 3; i++) { b.beginPath(); b.arc(p.x + (R() - 0.5) * s, p.y - s * 0.3 + R() * 4, s * 0.14, 0, 7); b.fill(); } break;
      case 'scrub': b.fillStyle = 'rgba(60,70,36,.7)'; for (let i = 0; i < 4; i++) { b.beginPath(); b.arc(p.x + (R() - 0.5) * s * 1.1, p.y + (R() - 0.5) * s * 0.7, s * 0.1, 0, 7); b.fill(); } break;
      case 'marsh': b.fillStyle = 'rgba(30,60,64,.7)'; for (let i = 0; i < 3; i++) { b.beginPath(); b.ellipse(p.x + (R() - 0.5) * s, p.y + (R() - 0.5) * s * 0.6, s * 0.2, s * 0.08, 0, 0, 7); b.fill(); } break;
      case 'reeds': b.strokeStyle = 'rgba(150,170,80,.75)'; b.lineWidth = 1.5; for (let i = 0; i < 9; i++) { const x = p.x + (R() - 0.5) * s * 1.2, y = p.y + (R() - 0.3) * s * 0.6; b.beginPath(); b.moveTo(x, y); b.lineTo(x + (R() - 0.5) * 4, y - s * 0.35); b.stroke(); } break;
      case 'bog': b.strokeStyle = 'rgba(90,140,130,.35)'; b.lineWidth = 1; for (let i = 0; i < 2; i++) { b.beginPath(); b.ellipse(p.x + (R() - 0.5) * s * 0.5, p.y, s * (0.25 + i * 0.2), s * (0.1 + i * 0.08), 0, 0, 7); b.stroke(); } break;
      case 'river': b.strokeStyle = 'rgba(170,215,230,.3)'; b.lineWidth = 1.5; for (let i = 0; i < 2; i++) { const y = p.y + (R() - 0.5) * s * 0.6; b.beginPath(); b.moveTo(p.x - s * 0.4, y); b.quadraticCurveTo(p.x, y - 4, p.x + s * 0.4, y); b.stroke(); } break;
      case 'gorge': b.fillStyle = 'rgba(40,30,24,.6)'; b.fillRect(p.x - s * 0.8, p.y + s * 0.3, s * 1.6, 2); break;
      default:
    }
  }
  function clearFog(k) {
    const p = bpx(k.c, k.r);
    fg.save(); fg.globalCompositeOperation = 'destination-out';
    const gr = fg.createRadialGradient(p.x, p.y, S0 * 0.5, p.x, p.y, S0 * 1.4);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    fg.fillStyle = gr; fg.fillRect(p.x - S0 * 1.5, p.y - S0 * 1.5, S0 * 3, S0 * 3);
    fg.restore();
  }

  // ---------- отряды и база (№140: как на дне) ----------
  // капсула-батискаф — база: ездит по карте («Вести базу»), внутрь можно войти («Моя база»);
  // герои выходят из неё в своих экзокостюмах, ходят, возвращаются и стыкуются рядом
  // №142: скорость — у техники (js/data/vehicles.js, клеток в минуту по дороге); бездорожье — дольше по цене клетки
  const devFast = () => (AB.IsoDev && AB.IsoDev.speed ? AB.IsoDev.speed() : 1);      // DEV: «Скорость ×5»
  const STEP_OF = (u) => 60 / (u.kind === 'base' ? AB.VEHICLES_BASE.speed : (AB.VEHICLES[u.vehicle] || { speed: 30 }).speed) / devFast();
  const base = { id: 'base', kind: 'base', c: 0, r: 0, path: [], anim: null, face: 1, stride: 0 };
  const squads = [];                                 // { id, kind: 'squad', vehicle, state: 'home'|'out'|'retreat', c, r, path, anim, face, stride }
  let sel = 'base', drive = false, selAll = false, pendSite = null, follow = true, flyU = null;
  const unit = (id) => (id === 'base' ? base : squads.find((s) => s.id === id)) || null;
  const outSquads = () => squads.filter((s) => s.state !== 'home');
  const selU = () => { const u = unit(sel); return u && (u === base || u.state !== 'home') ? u : base; };
  const curCell = (u) => (u.anim ? cell(u.anim.to.c, u.anim.to.r) : cell(u.c, u.r));
  // №142: кто в какой технике — окно «Отряд» (js/iso/iso-roster.js); в базе можно пересаживаться
  function syncSquads() {
    const ro = AB.IsoRoster ? AB.IsoRoster.list() : [];
    for (const sl of ro) {
      if (!sl.hero) continue;
      let s = squads.find((q) => q.id === sl.hero);
      if (!s) { s = { id: sl.hero, kind: 'squad', vehicle: sl.vehicle, state: 'home', c: base.c, r: base.r, path: [], anim: null, face: 1, stride: 0, mode: 'follow', target: null }; squads.push(s); }
      if (s.state === 'home') s.vehicle = sl.vehicle;
    }
    for (let i = squads.length - 1; i >= 0; i--) if (squads[i].state === 'home' && !ro.some((sl) => sl.hero === squads[i].id)) squads.splice(i, 1);
    squads.sort((a, b) => ro.findIndex((sl) => sl.hero === a.id) - ro.findIndex((sl) => sl.hero === b.id));
    for (const s of squads) if (s.state === 'home') { s.c = base.c; s.r = base.r; }
  }
  AB.Bus.on('roster:changed', () => { if (built) { syncSquads(); barSig = ''; } });
  const taken = (k, self) => (k.c === base.c && k.r === base.r) || outSquads().some((s) => s !== self && curCell(s) === k);
  const besideBase = (self) => nbrs(curCell(base)).find((k) => passable(k) && !taken(k, self)) || null;
  function deploy(id) {
    const s = unit(id); if (!s || s.state !== 'home') return false;
    if (base.anim) { say('Капсула в пути — выйти можно, когда остановится'); return false; }
    const k = besideBase(s); if (!k) { say('Вокруг капсулы нет свободной клетки'); return false; }
    Object.assign(s, { state: 'out', c: k.c, r: k.r, path: [], anim: null });
    sel = id; drive = false; flyU = s; follow = true; barSig = '';
    say(`${AB.ID.get(id).name}: экзокостюм вышел из капсулы`);
    reveal(); return true;
  }
  function dock(s) { Object.assign(s, { state: 'home', path: [], anim: null, c: base.c, r: base.r }); if (sel === s.id) sel = 'base'; barSig = ''; }
  function recall(id) {
    const s = unit(id); if (!s || s.state === 'home') return;
    if (dist(curCell(s), curCell(base)) <= 1 && !s.anim) { dock(s); say(`${AB.ID.get(id).name} — в капсуле`); return; }
    const p = search(curCell(s), (m) => dist(m, curCell(base)) === 1 && passable(m), (m) => (passable(m) ? cost(m) : Infinity));
    if (!p) { say('Путь к капсуле перекрыт'); return; }
    s.path = p; s.state = 'retreat'; barSig = '';
  }
  function spawn() {
    const home = sites.find((s) => s.kind === 'capital');
    const reach = new Set(); const q = [cell(home.c, home.r)]; reach.add(q[0]);
    while (q.length) { const k = q.pop(); for (const nb of nbrs(k)) if (passable(nb) && !reach.has(nb)) { reach.add(nb); q.push(nb); } }
    const ok = [...reach].filter((k) => !k.site && k.kind !== 'ford' && k.kind !== 'bridge' && k.r >= 4 && k.r <= H - 4 && k.c >= 3 && k.c <= W - 4 && sites.every((s) => dist(s, k) >= 2));
    const k = ok[Math.floor(Math.random() * ok.length)];
    Object.assign(base, { c: k.c, r: k.r, path: [], anim: null });
    squads.length = 0; syncSquads(); sel = 'base'; drive = false;
    reveal();
    return k;
  }
  function reveal() {
    const found = [];
    for (const u of [base, ...outSquads()]) {
      for (let r = Math.max(0, u.r - VIEW - 1); r <= Math.min(H - 1, u.r + VIEW + 1); r++) {
        for (let c = Math.max(0, u.c - VIEW - 1); c <= Math.min(W - 1, u.c + VIEW + 1); c++) {
          const k = cell(c, r);
          if (!k.seen && dist(k, u) <= VIEW) { k.seen = true; clearFog(k); if (k.site) found.push(k.site); }
        }
      }
    }
    if (found.length) say(`Найдено: ${found.map((s) => s.name).join(', ')}`);
  }
  function goTo(u, k, keep) {
    if (!passable(k)) { say(K[k.kind].block); return false; }
    if (!keep && u.kind === 'squad') { u.mode = 'follow'; u.target = null; u.zone = k; }
    const from = curCell(u);
    if (from === k) { u.path = []; if (k.site) showSite(k.site); return true; }
    const p = search(from, (m) => m === k, (m) => (passable(m) ? cost(m) : Infinity));
    if (!p) { say('Туда не дойти'); return false; }
    if (u.state === 'retreat') u.state = 'out';
    u.path = p; flyU = u; follow = true; barSig = '';
    return true;
  }
  function stepUnit(u, dt) {
    if (!u.anim && u.path.length) {
      const nx = u.path.shift();
      u.face = upx(nx.c, nx.r).x >= upx(u.c, u.r).x ? 1 : -1;
      u.anim = { to: { c: nx.c, r: nx.r }, t: 0, dur: STEP_OF(u) * cost(nx) };
    }
    if (!u.anim) return;
    u.anim.t += dt / u.anim.dur; u.stride += dt * 90;
    if (u.anim.t < 1) return;
    u.c = u.anim.to.c; u.r = u.anim.to.r; u.anim = null;
    if (u === base) for (const s of squads) if (s.state === 'home') { s.c = base.c; s.r = base.r; }
    reveal();
    if (u.path.length) return;
    barSig = ''; save();
    if (u.state === 'retreat' && dist(curCell(u), curCell(base)) <= 1) { dock(u); say(`${AB.ID.get(u.id).name} — в капсуле`); return; }
    if (pendSite && pendSite.u === u && pendSite.s.c === u.c && pendSite.s.r === u.r) { showSite(pendSite.s); pendSite = null; }
  }
  const posOf = (u) => {
    const a = bpx(u.c, u.r);
    if (!u.anim) return a;
    const b = bpx(u.anim.to.c, u.anim.to.r), t = u.anim.t;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  // кто идёт по нажатию: «Вести базу» — капсула; иначе выбранный отряд; нет никого снаружи — выходит первый
  function mover() {
    if (drive) return base;
    const u = selU(); if (u.kind === 'squad') return u;
    const out = outSquads()[0]; if (out) { sel = out.id; return out; }
    const s = squads.find((q) => q.state === 'home');
    if (s && deploy(s.id)) return s;
    return base;
  }

  // ---------- №142: нейтральные NPC и бой ----------
  // группы стоят в случайных местах; сами не нападают; ударили одного — вступается вся группа;
  // за убийство — награда в вещи отряда. Отряд в «Автобое» бьёт тех, кто нападает на него или
  // на союзников рядом (3 клетки); «Атаковать» — напасть на выбранного.
  const NPC = () => D().npcs;
  const NK = (m) => NPC().kinds[m.kind];
  const mobs = [], floats = [];
  let mobSeq = 0, respawnT = [];
  const alive = () => mobs.filter((m) => m.hp > 0);
  const mobAt = (k) => alive().find((m) => curCell(m) === k) || null;
  const eyesNear = (k) => [base, ...outSquads()].some((u) => dist(k, curCell(u)) <= VIEW + 1);
  const visibleMob = (m) => { const k = curCell(m); return k.seen && eyesNear(k); };
  const pathTo = (from, goal) => search(from, goal, (x) => (passable(x) && x !== curCell(base) && !(mobAt(x) && !goal(x)) ? cost(x) : Infinity));
  const floatText = (p, text, col) => floats.push({ x: p.x, y: p.y - S0 * 0.9, t: 0, text, col });
  function spawnGroup() {
    const B = curCell(base);
    const all = cells.filter((k) => passable(k) && !k.site && !k.road && k.r > 2 && k.r < H - 2 && sites.every((s) => dist(s, k) >= 3) && dist(k, B) >= 5 && alive().every((m) => dist(curCell(m), k) >= 4));
    if (!all.length) return;
    const k = all[Math.floor(Math.random() * all.length)];
    const kinds = Object.keys(NPC().kinds).filter((id) => NPC().kinds[id].side === k.side);
    const kind = kinds[Math.floor(Math.random() * kinds.length)], d = NPC().kinds[kind];
    const [a, b] = NPC().perGroup, n = a + Math.floor(Math.random() * (b - a + 1)), grp = ++mobSeq;
    const spots = [k, ...nbrs(k).filter((x) => passable(x) && !x.site)];
    for (let i = 0; i < n && i < spots.length; i++) {
      mobs.push({ id: `npc${++mobSeq}`, kind: 'npc', type: kind, grp, c: spots[i].c, r: spots[i].r, home: { c: k.c, r: k.r }, hp: d.hp, max: d.hp,
        aggro: null, atkT: 0, atk: null, path: [], anim: null, face: Math.random() < 0.5 ? 1 : -1, stride: 0, flash: 0, wanderT: 2 + Math.random() * 6, repath: 0, deadT: 0 });
      mobs[mobs.length - 1].kind = kind;
    }
  }
  function spawnMobs() { mobs.length = 0; respawnT = []; for (let i = 0; i < NPC().groups; i++) spawnGroup(); }
  function mobStep(m, dt) {
    const d = NK(m);
    if (!m.anim && m.path.length) {
      const nx = m.path.shift();
      const busy = (mobAt(nx) && mobAt(nx) !== m) || nx === curCell(base) || outSquads().some((s) => curCell(s) === nx);
      if (busy || !passable(nx)) m.path = [];
      else { m.face = upx(nx.c, nx.r).x >= upx(m.c, m.r).x ? 1 : -1; m.anim = { to: { c: nx.c, r: nx.r }, t: 0, dur: 60 / d.speed * cost(nx) }; }
    }
    if (!m.anim) return;
    m.anim.t += dt / m.anim.dur; m.stride += dt * 90;
    if (m.anim.t >= 1) { m.c = m.anim.to.c; m.r = m.anim.to.r; m.anim = null; }
  }
  const herName = (id) => AB.ID.get(id).name;
  const fem = (id) => id === 'CHAR-002' || id === 'CHAR-003';
  function hurtSquad(s, dmg, m) {
    const c = AB.Chars.get(s.id), v = AB.VEHICLES[s.vehicle] || { armor: 0 };
    const real = Math.max(1, Math.round(dmg * (1 - v.armor)));
    AB.Bus.emit('surface:hit', { npc: false });
    if (c) c.hp = Math.max(0, c.hp - real);
    s.flash = 0.25; floatText(posOf(s), `−${real}`, '#ff8a6a');
    if (s.mode === 'auto' && !s.target) s.target = m;          // автобой: ответный удар
    barSig = '';
    if (c && c.hp <= 0) squadDown(s);
  }
  // костюм разбит — герой очнулся в батискафе (как на дне), здоровье восстановлено
  function squadDown(s) {
    const c = AB.Chars.get(s.id), max = (AB.ID.get(s.id).stats || {}).maxHp || 100;
    if (c) { c.hp = max; c.dead = false; }
    for (const m of mobs) if (m.aggro === s) m.aggro = null;
    Object.assign(s, { state: 'home', path: [], anim: null, target: null, zone: null, c: base.c, r: base.r });
    if (sel === s.id) sel = 'base';
    barSig = '';
    say(`${herName(s.id)}: костюм разбит — очнул${fem(s.id) ? 'ась' : 'ся'} в батискафе`);
  }
  function hurtMob(m, dmg, s) {
    const d = NK(m), real = Math.max(1, Math.round(dmg * (1 - d.armor)));
    AB.Bus.emit('surface:hit', { npc: true });
    m.hp -= real; m.flash = 0.25; floatText(posOf(m), `−${real}`, '#ffe2a8');
    for (const o of alive()) if (o.grp === m.grp && !o.aggro) o.aggro = s;   // за своего вступается вся группа
    m.aggro = m.aggro || s;
    if (m.hp <= 0) mobDead(m);
  }
  function mobDead(m) {
    m.hp = 0; m.deadT = 1.4; m.path = []; m.anim = null;
    const d = NK(m), got = [];
    for (const [item, n, ch] of d.reward) if (Math.random() < ch) { if (AB.IsoStash) AB.IsoStash.add(item, n); got.push(`${AB.ID.get(item).name} ×${n}`); }
    floatText(posOf(m), got.length ? `+ ${got.join(', ')}` : d.name, '#ffd27a');
    say(`${d.name} повержен. Награда: ${got.join(', ') || 'ничего'}`);
    AB.Bus.emit('surface:kill', { kind: m.kind, reward: got });
    for (const q of squads) if (q.target === m) q.target = null;
    if (!alive().some((o) => o.grp === m.grp)) respawnT.push(NPC().respawn);
  }
  function mobTick(m, dt) {
    const d = NK(m);
    m.flash = Math.max(0, m.flash - dt); m.atkT = Math.max(0, m.atkT - dt);
    if (m.atk) { m.atk.t += dt; if (m.atk.t > 0.6) m.atk = null; }
    const home = cell(m.home.c, m.home.r), t = m.aggro;
    if (t && (t.state === 'home' || dist(curCell(m), home) > 7)) {      // ушёл в базу или увёл далеко — назад, домой
      m.aggro = null; m.path = curCell(m) === home ? [] : pathTo(curCell(m), (x) => x === home) || [];
    } else if (t) {
      if (dist(curCell(m), curCell(t)) <= 1) {
        if (!m.anim) { m.path = []; if (m.atkT <= 0) { m.atkT = d.rate; m.atk = { t: 0 }; m.face = posOf(t).x >= posOf(m).x ? 1 : -1; hurtSquad(t, d.attack, m); } }
      } else if (!m.anim && ((m.repath -= dt) <= 0 || !m.path.length)) {
        m.repath = 0.6; m.path = pathTo(curCell(m), (x) => dist(x, curCell(t)) <= 1) || [];
      }
    } else if (!m.anim && !m.path.length && (m.wanderT -= dt) <= 0) {      // бродит возле своего места
      m.wanderT = 4 + Math.random() * 8;
      const opts = nbrs(curCell(m)).filter((x) => passable(x) && !mobAt(x) && !x.site && x !== curCell(base) && dist(x, home) <= 2);
      if (opts.length) m.path = [opts[Math.floor(Math.random() * opts.length)]];
    }
    mobStep(m, dt);
  }
  function squadTick(s, dt) {
    s.flash = Math.max(0, (s.flash || 0) - dt); s.atkT = Math.max(0, (s.atkT || 0) - dt);
    if (s.atk) { s.atk.t += dt; if (s.atk.t > 0.8) s.atk = null; }
    if (s.state !== 'out') return;
    if (s.target && s.target.hp <= 0) { s.target = null; if (s.mode === 'auto' && s.zone && curCell(s) !== s.zone) s.resume = true; }
    // автобой: бьёт тех, кто нападает на него или на союзников рядом
    if (!s.target && s.mode === 'auto') {
      const foe = alive().filter((m) => m.aggro && m.aggro.kind === 'squad' && dist(curCell(m), curCell(s)) <= 3)
        .sort((a, b) => dist(curCell(a), curCell(s)) - dist(curCell(b), curCell(s)))[0];
      if (foe) { s.target = foe; if (s.zone) s.resume = true; }
    }
    const m = s.target;
    if (!m) { if (s.resume && !s.anim) { s.resume = false; if (s.zone && curCell(s) !== s.zone) goTo(s, s.zone, true); } return; }
    const v = AB.VEHICLES[s.vehicle] || { attack: 10, rate: 1.2, reach: 1 };
    if (dist(curCell(s), curCell(m)) <= v.reach) {
      if (!s.anim) { s.path = []; if (s.atkT <= 0) { s.atkT = v.rate; s.atk = { t: 0 }; s.face = posOf(m).x >= posOf(s).x ? 1 : -1; hurtMob(m, v.attack, s); } }
    } else if (!s.anim && ((s.repath = (s.repath || 0) - dt) <= 0 || !s.path.length)) {
      s.repath = 0.6; s.path = pathTo(curCell(s), (x) => dist(x, curCell(m)) <= v.reach) || [];
    }
  }
  function combatTick(dt) {
    for (const m of mobs) if (m.hp > 0) mobTick(m, dt); else m.deadT -= dt;
    for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].hp <= 0 && mobs[i].deadT <= 0) mobs.splice(i, 1);
    for (const s of squads) squadTick(s, dt);
    for (let i = respawnT.length - 1; i >= 0; i--) { respawnT[i] -= dt; if (respawnT[i] <= 0) { respawnT.splice(i, 1); spawnGroup(); } }
    for (const f of floats) f.t += dt;
    for (let i = floats.length - 1; i >= 0; i--) if (floats[i].t > 1.4) floats.splice(i, 1);
  }
  // рисунок NPC (условный, до картинок автора): u — размер клетки
  function drawMob(m) {
    if (!visibleMob(m)) return;
    const p = posOf(m), x = p.x, y = p.y + S0 * 0.15, f = m.face || 1;
    const a = m.hp > 0 ? 1 : Math.max(0, m.deadT / 1.4); if (a <= 0) return;
    const bob = m.anim ? Math.abs(Math.sin(m.stride / 10)) * 2 : 0, lunge = m.atk ? Math.sin(Math.min(1, m.atk.t / 0.6) * Math.PI) * 5 * f : 0;
    g.save(); g.globalAlpha = a; g.translate(x + lunge, y);
    if (m.hp <= 0) g.rotate(1.2 * f);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, 2, 11, 4, 0, 0, 7); g.fill();
    const K = m.kind;
    if (K === 'raider') {
      g.fillStyle = '#3a2c1c'; g.fillRect(-5, -8 - bob, 3, 8); g.fillRect(2, -8 - bob, 3, 8);
      g.fillStyle = '#b88a50'; g.beginPath(); g.moveTo(-8, -6 - bob); g.lineTo(8, -6 - bob); g.lineTo(5, -24 - bob); g.lineTo(-5, -24 - bob); g.fill();
      g.fillStyle = '#a3302a'; g.fillRect(-6, -14 - bob, 12, 3);
      g.fillStyle = '#c08a5a'; g.beginPath(); g.arc(0, -28 - bob, 5, 0, 7); g.fill();
      g.fillStyle = '#e8dcc0'; g.beginPath(); g.ellipse(0, -31 - bob, 6, 3.5, 0, 0, 7); g.fill();
      g.strokeStyle = '#d8dde0'; g.lineWidth = 2; g.beginPath(); g.moveTo(5 * f, -16 - bob); g.lineTo((m.atk ? 18 : 10) * f, (m.atk ? -22 : -30) - bob); g.stroke();
    } else if (K === 'shellback') {
      g.fillStyle = '#5a4430'; for (const lx of [-9, -3, 3, 9]) g.fillRect(lx - 1.5, -6, 3, 7);
      g.fillStyle = '#8a6a48'; g.beginPath(); g.ellipse(0, -11 - bob, 15, 10, 0, Math.PI, 0); g.fill();
      g.strokeStyle = '#5a4430'; g.lineWidth = 1.5; for (const lx of [-6, 0, 6]) { g.beginPath(); g.moveTo(lx, -20 - bob); g.lineTo(lx * 1.4, -11 - bob); g.stroke(); }
      g.fillStyle = '#6a5038'; g.beginPath(); g.ellipse(14 * f, -9 - bob, 5, 4, 0, 0, 7); g.fill();
    } else if (K === 'thrall') {
      g.fillStyle = '#3a4434'; g.fillRect(-5, -8 - bob, 3, 8); g.fillRect(2, -8 - bob, 3, 8);
      g.fillStyle = '#6a7a5a'; g.beginPath(); g.ellipse(2 * f, -17 - bob, 7, 10, 0.35 * f, 0, 7); g.fill();
      g.fillStyle = '#8a9a78'; g.beginPath(); g.arc(7 * f, -27 - bob, 5, 0, 7); g.fill();
      for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(240,130,210,${0.5 + 0.4 * Math.sin(time * 3 + i + m.grp)})`; g.beginPath(); g.arc(-3 + i * 3, -24 + (i % 2) * 6 - bob, 1.6, 0, 7); g.fill(); }
    } else {                                                            // топляк
      g.fillStyle = '#2f4436'; g.beginPath(); g.ellipse(0, -7 - bob, 15, 8, 0, Math.PI, 0); g.lineTo(15, -6); g.lineTo(-15, -6); g.fill();
      g.strokeStyle = '#3f5a48'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { const ax = -10 + i * 7; g.beginPath(); g.moveTo(ax, -6); g.quadraticCurveTo(ax + Math.sin(time * 2 + i) * 4, -1, ax + 3, 2); g.stroke(); }
      for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(160,255,150,${0.5 + 0.4 * Math.sin(time * 2.4 + i)})`; g.beginPath(); g.arc(-6 + i * 6, -11 - bob, 1.8, 0, 7); g.fill(); }
    }
    if (m.flash > 0) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,80,60,.45)'; g.fillRect(-20, -40, 40, 44); g.globalCompositeOperation = 'source-over'; }
    g.restore();
    if (m.hp > 0) {
      if (m.hp < m.max || m.aggro) hpBar(x, y - S0 * 1.25, m.hp / m.max, m.aggro ? '#ff5a4a' : '#e0c080');
      if (m.aggro) { g.fillStyle = '#ff5a4a'; g.font = `700 ${12}px "Oswald", sans-serif`; g.textAlign = 'center'; g.fillText('!', x, y - S0 * 1.35); }
    }
  }
  function hpBar(x, y, f, col) {
    const w = S0 * 0.9;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - w / 2, y, w, 4);
    g.fillStyle = col; g.fillRect(x - w / 2, y, w * Math.max(0, f), 4);
  }
  function drawFloats() {
    const k = kScale(), fs = 11 * dpr / k;
    g.textAlign = 'center'; g.font = `700 ${fs}px "Share Tech Mono", monospace`;
    for (const f of floats) {
      const y = f.y - f.t * S0 * 0.6; g.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      g.lineWidth = 3 * dpr / k; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(f.text, f.x, y); g.fillStyle = f.col; g.fillText(f.text, f.x, y);
    }
    g.globalAlpha = 1;
  }

  // ---------- №142: приказ по нажатию — «Автобой», «Следовать» (на NPC — «Атаковать») ----------
  let cmd = null;                      // { k, m }
  function hideCmd() { cmd = null; const el = document.getElementById('sf-cmd'); if (el) el.hidden = true; }
  function showCmd(cx, cy, k, m) {
    cmd = { k, m };
    const el = document.getElementById('sf-cmd');
    el.querySelector('[data-cmd="auto"]').hidden = !!m;
    el.querySelector('[data-cmd="follow"]').hidden = !!m;
    el.querySelector('[data-cmd="attack"]').hidden = !m;
    el.hidden = false;
    placeCmd();
  }
  // №143: кнопки — над нажатой клеткой (или над NPC); едут вместе с картой
  function placeCmd() {
    if (!cmd) return;
    const el = document.getElementById('sf-cmd'), kk = kScale();
    const p = cmd.m ? posOf(cmd.m) : bpx(cmd.k.c, cmd.k.r);
    const x = ((p.x - cam.x) * kk + cv.width / 2) / dpr, y = ((p.y - cam.y) * kk + cv.height / 2) / dpr;
    AB.IsoMapUI.placeCmd(el, x, y, cv.clientWidth, cv.clientHeight);
  }
  // кто выполняет приказ: «Выбрать всех» — все герои снаружи (нет никого — выходят все); иначе — выбранный
  function movers() {
    if (selAll) {
      for (const q of squads) if (q.state === 'home') deploy(q.id);     // весь отряд: кто в капсуле — тоже выходит
      const outs = outSquads();
      if (outs.length) return outs;
    }
    const u = mover(); return u.kind === 'squad' ? [u] : [];
  }
  function command(kind) {
    if (!cmd) return; const { k, m } = cmd; hideCmd();
    const us = movers(); if (!us.length) { say('Некому идти — выпустите героя из капсулы'); return; }
    if (kind === 'attack') {
      if (!m || m.hp <= 0) return;
      for (const s of us) { s.mode = 'auto'; s.target = m; s.zone = null; s.path = []; s.repath = 0; if (s.state === 'retreat') s.state = 'out'; }
      flyU = us[0]; follow = true; barSig = '';
      say(`${us.length > 1 ? 'Отряд' : herName(us[0].id)}: атака — ${NK(m).name}`);
      return;
    }
    const spots = [k, ...nbrs(k).filter((x) => passable(x) && x !== curCell(base) && !mobAt(x))];
    us.forEach((s, i) => { s.mode = kind === 'auto' ? 'auto' : 'follow'; s.target = null; s.zone = spots[i % spots.length]; goTo(s, s.zone, true); });
    pendSite = k.site ? { s: k.site, u: us[0] } : null;
    flyU = us[0]; follow = true; barSig = '';
    say(kind === 'auto' ? 'Автобой: идут туда и отвечают всем, кто нападёт на отряд' : 'Следовать: идут, не ввязываясь в бой');
  }

  // ---------- №145: цепочка «Дорога на север» (js/data/surface-a1-story.js) — открывает мосты в Б1 ----------
  const STORY_KEY = 'abyss_a1_story';
  const ST = () => AB.SURFACE_A1_STORY;
  let story = null;                                   // { stage, kills: { вид: n } }
  function storyLoad() { if (story) return; try { story = JSON.parse(localStorage.getItem(STORY_KEY) || 'null'); } catch (e) { story = null; } if (!story || typeof story.stage !== 'number') story = { stage: 0, kills: {} }; }
  function storySave() { try { localStorage.setItem(STORY_KEY, JSON.stringify(story)); } catch (e) { /* без хранилища */ } }
  const stageNow = () => (ST() ? ST().stages[story.stage] || null : null);
  const bridgesOpen = () => !!story && !!ST() && story.stage >= ST().stages.length;
  function goalText() {
    const st = stageNow(); if (!st) return ST() ? ST().done.goal : '';
    if (st.kills) { const [k, n] = Object.entries(st.kills)[0]; return `${st.goal}: ${Math.min(n, story.kills[k] || 0)}/${n}`; }
    return st.goal;
  }
  function goalUi() { const el = document.getElementById('sf-goal'); if (el) el.textContent = ST() ? `▸ ${goalText()}` : ''; }
  function storyAdvance() {
    const st = stageNow(); if (!st) return;
    for (const [item, n] of st.reward || []) if (AB.IsoStash) { AB.IsoStash.add(item, n); floatText(posOf(selU()), `+ ${AB.ID.get(item).name} ×${n}`, '#ffd27a'); }
    story.stage++; story.kills = {}; storySave();
    const nx = stageNow();
    if (nx && nx.say) say(nx.say);
    if (!nx) { say(ST().done.say); if (AB.Flags) AB.Flags.add('a1-bridges'); AB.Bus.emit('surface:bridges', {}); }
    else if (!nx.say) say(`Задание: ${nx.goal}`);
    if (AB.Bus) AB.Bus.emit('quest:start', {});
    goalUi();
  }
  function storyEnter() {
    storyLoad();
    if (story.stage === 0 && ST()) { const s0 = ST().stages[0]; story.stage = 1; storySave(); setTimeout(() => say(s0.say), 1800); }
    goalUi();
  }
  AB.Bus.on('surface:kill', ({ kind }) => {
    if (!story) return; const st = stageNow(); if (!st || !st.kills || !st.kills[kind]) return;
    story.kills[kind] = (story.kills[kind] || 0) + 1; storySave(); goalUi();
    if (Object.entries(st.kills).every(([k, n]) => (story.kills[k] || 0) >= n)) setTimeout(storyAdvance, 800);
  });
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // нужный герой стоит на точке (или рядом)
  const heroAt = (id, site) => outSquads().some((q) => q.id === id && !q.anim && dist(curCell(q), site) <= 1);
  let storyCard = null;
  function showStory(s, st) {
    const el = document.getElementById('sf-pop'), ok = !st.hero || heroAt(st.hero, s);
    storyCard = ok ? st : null;
    el.querySelector('b').textContent = s.name;
    el.querySelector('i').textContent = `Задание · ${ST().name}`;
    el.querySelector('i').className = 'sf-side story';
    el.querySelector('p').innerHTML = ok ? st.lines.map(([who, t]) => (who ? `<span class="who">${esc(who)}</span> ${esc(t)}` : `<em>${esc(t)}</em>`)).join('<br>') : esc(st.wait || '');
    el.querySelector('small').textContent = '';
    const btn = el.querySelector('[data-sf-act]');
    btn.textContent = ok ? st.button : 'Нужна доктор Хейл';
    btn.disabled = !ok;
    el.hidden = false;
  }

  // ---------- карточка точки ----------
  const ACT = { capital: 'Предстать перед Хранителем — скоро', village: 'Войти в деревню — скоро', ford: 'Зайти на брод — скоро', shrine: 'Подойти к купели — скоро' };
  let popSite = null;
  function showSite(s) {
    popSite = s; storyCard = null;
    { const st = stageNow(); if (st && st.at === s.key) { showStory(s, st); return; } }
    const el = document.getElementById('sf-pop'), f = D().factions[s.side];
    el.querySelector('b').textContent = s.name;
    el.querySelector('i').textContent = f ? `${f.tag} · ${f.name}` : `Выход · зона ${s.to}`;
    el.querySelector('i').className = `sf-side ${s.side}`;
    el.querySelector('p').textContent = s.text;
    el.querySelector('small').textContent = f ? f.text : 'Эта зона ещё не открыта — появится в следующих обновлениях.';
    const btn = el.querySelector('[data-sf-act]');
    const open = s.kind === 'bridge' && bridgesOpen();
    if (open) { el.querySelector('i').textContent = 'Мост открыт · зона Б1'; el.querySelector('small').textContent = 'За ущельем — «Железный Предел», земли синтетиков и киборгов. Сама зона — следующий этап.'; }
    btn.textContent = f ? ACT[s.kind] : open ? 'Перейти в зону Б1 — скоро' : s.kind === 'bridge' ? 'Мост закрыт — нужна печать Кадзэ' : `Перейти в зону ${s.to} — закрыто`;
    btn.disabled = true;
    el.hidden = false;
  }
  function hidePop() { popSite = null; document.getElementById('sf-pop').hidden = true; }

  // ---------- рисование кадра ----------
  let cam = { x: 0, y: 0 }, zoomK = 1, size = S0;
  let baseSz = S0;
  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
    baseSz = Math.max(20, Math.min(36, Math.min(cv.clientWidth, cv.clientHeight) / 11)) * dpr;
    zoomK = Math.max(minZoom(), zoomK);
    size = baseSz * zoomK;
  }
  // самый мелкий масштаб — вся зона на экране
  const minZoom = () => (bake ? Math.min(1, Math.min(cv.width / bake.width, cv.height / bake.height) * S0 / baseSz * 0.98) : 0.5);
  const kScale = () => size / S0;
  function clampCam() {
    const k = kScale(), hw = cv.width / 2 / k, hh = cv.height / 2 / k;
    cam.x = hw * 2 >= bake.width ? bake.width / 2 : Math.max(hw, Math.min(bake.width - hw, cam.x));
    cam.y = hh * 2 >= bake.height ? bake.height / 2 : Math.max(hh, Math.min(bake.height - hh, cam.y));
  }
  function draw() {
    const k = kScale();
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#05070a'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true;
    g.setTransform(k, 0, 0, k, cv.width / 2 - cam.x * k, cv.height / 2 - cam.y * k);
    g.drawImage(bake, 0, 0);
    g.drawImage(fogCv, 0, 0);
    // память: всё, что дальше обзора, — приглушено (вокруг выбранного)
    const pp = posOf(selU());
    const gr = g.createRadialGradient(pp.x, pp.y, S0 * VIEW * 1.2, pp.x, pp.y, S0 * VIEW * 2.1);
    gr.addColorStop(0, 'rgba(4,6,10,0)'); gr.addColorStop(1, 'rgba(4,6,10,.42)');
    g.fillStyle = gr; g.fillRect(cam.x - cv.width / k, cam.y - cv.height / k, cv.width * 2 / k, cv.height * 2 / k);
    // точки (только открытые)
    for (const s of sites) if (cell(s.c, s.r).seen) drawSite(s);
    // пути: у выбранного — ярче
    for (const u of [base, ...outSquads()]) {
      if (!u.path.length) continue;
      const me = u === selU(), from = posOf(u);
      g.strokeStyle = me ? 'rgba(255,226,140,.65)' : 'rgba(255,226,140,.25)'; g.setLineDash([5, 6]); g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(from.x, from.y); for (const m of u.path) { const p = bpx(m.c, m.r); g.lineTo(p.x, p.y); } g.stroke(); g.setLineDash([]);
      const e = u.path[u.path.length - 1], p = bpx(e.c, e.r);
      g.strokeStyle = me ? 'rgba(255,226,140,.9)' : 'rgba(255,226,140,.35)'; hexPath(p.x, p.y, S0 * 0.7, g); g.stroke();
    }
    // кольцо под выбранным
    { const u = selU(), p = posOf(u); g.strokeStyle = drive ? 'rgba(255,210,120,.95)' : 'rgba(94,230,255,.9)'; g.lineWidth = 2; g.beginPath(); g.ellipse(p.x, p.y + 4, S0 * (u === base ? 0.85 : 0.5), S0 * (u === base ? 0.36 : 0.22), 0, 0, 7); g.stroke(); }
    // база и отряды — сверху вниз, чтобы ближние перекрывали дальних
    [base, ...outSquads(), ...mobs].map((u) => ({ u, p: posOf(u) })).sort((a, b) => a.p.y - b.p.y).forEach(({ u, p }) => (u === base ? drawBase(p.x, p.y) : u.kind === 'squad' ? drawSquad(u, p.x, p.y) : drawMob(u)));
    drawFloats();
    if (cmd) { const p = cmd.m ? posOf(cmd.m) : bpx(cmd.k.c, cmd.k.r); g.strokeStyle = cmd.m ? 'rgba(255,120,90,.95)' : 'rgba(255,226,140,.95)'; g.lineWidth = 2.5; hexPath(p.x, p.y, S0 * 0.82, g); g.stroke(); }
    // подписи — постоянного размера на экране
    const fs = 11 * dpr / k;
    g.textAlign = 'center'; g.font = `600 ${fs}px "Share Tech Mono", monospace`;
    for (const s of sites) {
      if (!cell(s.c, s.r).seen) continue;
      const p = bpx(s.c, s.r), y = s.kind === 'exit' ? p.y - S0 * 0.75 : p.y + S0 * 0.95;
      const t = s.kind === 'bridge' || s.kind === 'exit' ? `${s.name} → ${s.to}` : s.name;
      g.lineWidth = 3 * dpr / k; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(t, p.x, y);
      g.fillStyle = s.side === 'desert' ? '#ffe2a8' : s.side === 'swamp' ? '#c6f0a8' : s.side === 'exit' ? '#9fe7ff' : '#e6e0d6'; g.fillText(t, p.x, y);
    }
  }
  // №140: батискаф-база — та же картинка, что на дне (assets/seabed/base-capsule*.webp)
  const baseImg = new Image(); baseImg.src = 'assets/seabed/base-capsule.webp';
  const moveImg = new Image(); moveImg.src = 'assets/seabed/base-capsule-move.webp';
  function drawBase(x, y) {
    if (baseImg.complete && baseImg.naturalWidth) {
      const w = S0 * SQ3 * 1.55, h = baseImg.naturalHeight * w / baseImg.naturalWidth;
      const bob = base.anim ? Math.sin(time * 3) * S0 * 0.04 : 0;
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(x, y + S0 * 0.1, w * 0.4, w * 0.4 * TILT * 0.45, 0, 0, 7); g.fill();
      const x0 = x - w / 2, y0 = y + S0 * 0.25 - h * 0.99 + bob, k = w / 1376;
      if ((base.anim || base.path.length) && moveImg.complete && moveImg.naturalWidth) g.drawImage(moveImg, x0 - 50 * k, y0 - 2 * k, 1536 * k, 1024 * k);
      else g.drawImage(baseImg, x0, y0, w, h);
      return;
    }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, y + 6, S0 * 0.7, S0 * 0.22, 0, 0, 7); g.fill();
    g.fillStyle = '#c9a24a'; g.beginPath(); g.ellipse(x, y, S0 * 0.62, S0 * 0.32, -0.25, 0, 7); g.fill();
    for (let i = -1; i <= 1; i++) { g.fillStyle = '#5ee6ff'; g.beginPath(); g.arc(x + i * S0 * 0.22, y - 2 - i * 3, 2.4, 0, 7); g.fill(); }
  }
  // герой в экзокостюме — той же фигурой, что на дне (AB.IsoSuit)
  function drawSquad(s, x, y) {
    if (s.state === 'retreat') g.globalAlpha = 0.8;
    const look = (AB.VEHICLES[s.vehicle] || {}).look || s.id;
    const pose = { id: look, facing: s.face, phase: s.stride / 78 * Math.PI * 2, moving: !!s.anim, attack: s.atk ? Math.min(1, s.atk.t / 0.8) : -1, hurt: s.flash > 0 ? 1 : 0, dead: false, t: time };
    if (AB.IsoSuit && AB.RIGS && AB.RIGS.EXOSUIT) AB.IsoSuit.draw(g, pose, x, y + S0 * 0.2, (S0 * 1.3) / AB.RIGS.EXOSUIT.height);
    else { g.fillStyle = '#c9853a'; g.beginPath(); g.arc(x, y - 10, 8, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    const c = AB.Chars.get(s.id), max = (AB.ID.get(s.id).stats || {}).maxHp || 100;
    if (c && (c.hp < max || s.target)) hpBar(x, y - S0 * 1.45, c.hp / max, '#5ee6ff');
  }
  function drawSite(s) {
    const p = bpx(s.c, s.r), x = p.x, y = p.y, u = S0;
    const box = (bx, by, w, h, top, side) => { g.fillStyle = side; g.fillRect(bx - w / 2, by - h, w, h); g.fillStyle = top; g.fillRect(bx - w / 2 - 1, by - h - 3, w + 2, 4); };
    const flag = (fx, fy, col) => { g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx, fy - 18); g.stroke(); g.fillStyle = col; g.beginPath(); g.moveTo(fx, fy - 18); g.lineTo(fx + 9 + Math.sin(time * 4 + fx) * 1.5, fy - 15); g.lineTo(fx, fy - 12); g.fill(); };
    const hut = (hx, hy) => {
      g.strokeStyle = '#2a1e12'; g.lineWidth = 1.5; for (const sx of [-4, 4]) { g.beginPath(); g.moveTo(hx + sx, hy); g.lineTo(hx + sx, hy - 7); g.stroke(); }
      g.fillStyle = '#4a3622'; g.fillRect(hx - 7, hy - 14, 14, 7);
      g.fillStyle = '#6b6a3a'; g.beginPath(); g.moveTo(hx - 9, hy - 13); g.lineTo(hx, hy - 24); g.lineTo(hx + 9, hy - 13); g.fill();
    };
    const glow = (gx, gy, r, col) => { const a = 0.5 + 0.3 * Math.sin(time * 2.2 + gx); const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, r, 0, 7); g.fill(); };
    switch (s.kind) {
      case 'capital': {
        hexPath(x, y, u * 0.95, g); g.fillStyle = 'rgba(120,90,60,.5)'; g.fill(); g.strokeStyle = '#6a5038'; g.lineWidth = 4; g.stroke();
        for (let i = 0; i < 3; i++) { const w = 26 - i * 7, yy = y - 4 - i * 11; g.fillStyle = '#d8c39a'; g.fillRect(x - w / 2 + 3, yy - 9, w - 6, 9); g.fillStyle = '#7a2a20'; g.beginPath(); g.moveTo(x - w / 2 - 3, yy - 8); g.lineTo(x, yy - 15); g.lineTo(x + w / 2 + 3, yy - 8); g.fill(); }
        flag(x - 16, y + 4, '#b8342a'); flag(x + 16, y + 4, '#b8342a');
        break;
      }
      case 'village':
        if (s.side === 'desert') { box(x - 9, y + 2, 12, 9, '#efd9ae', '#c8a878'); box(x + 6, y - 2, 14, 11, '#efd9ae', '#c0a070'); box(x - 1, y + 9, 10, 7, '#efd9ae', '#b8986a'); flag(x + 14, y + 6, '#b8342a'); }
        else { glow(x, y - 6, 18, 'rgba(150,255,140,A)'); hut(x - 8, y + 6); hut(x + 8, y + 2); hut(x, y + 12); }
        break;
      case 'ford':
        g.fillStyle = '#6b4a2a'; g.fillRect(x - 13, y - 3, 26, 9);
        g.fillStyle = '#d8b26a'; g.beginPath(); g.moveTo(x - 10, y - 2); g.lineTo(x - 4, y - 12); g.lineTo(x + 2, y - 2); g.fill();
        g.fillStyle = '#7fb28a'; g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x + 6, y - 12); g.lineTo(x + 12, y - 2); g.fill();
        break;
      case 'shrine': {
        glow(x, y - 8, u * 1.3, 'rgba(230,110,200,A)');
        g.strokeStyle = '#5a2e4e'; g.lineWidth = 3;
        for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + Math.sin(time + i) * 0.2; g.beginPath(); g.moveTo(x, y - 8); g.quadraticCurveTo(x + Math.cos(a) * 14, y - 8 + Math.sin(a) * 10 - 10, x + Math.cos(a) * 26, y - 4 + Math.sin(a) * 14); g.stroke(); }
        const pulse = 1 + 0.08 * Math.sin(time * 2.6);
        g.fillStyle = '#b24a8e'; g.beginPath(); g.ellipse(x, y - 10, 14 * pulse, 11 * pulse, 0, 0, 7); g.fill();
        g.fillStyle = '#f0a0d8'; g.beginPath(); g.ellipse(x - 3, y - 14, 5 * pulse, 3.5 * pulse, 0, 0, 7); g.fill();
        break;
      }
      case 'bridge': case 'exit': {
        const dir = s.kind === 'bridge' ? [0, -1] : [s.dir, 0], bob2 = Math.sin(time * 3) * 2;
        g.fillStyle = 'rgba(94,230,255,.85)'; g.save(); g.translate(x + dir[0] * (8 + bob2), y - 6 + dir[1] * (8 + bob2)); g.rotate(Math.atan2(dir[1], dir[0]));
        g.beginPath(); g.moveTo(9, 0); g.lineTo(-4, -7); g.lineTo(-4, 7); g.closePath(); g.fill(); g.restore();
        if (s.kind === 'bridge' && bridgesOpen()) { g.strokeStyle = 'rgba(140,255,160,.95)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x - 1, y); g.lineTo(x + 7, y - 12); g.stroke(); }
        else { g.strokeStyle = 'rgba(255,120,100,.9)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 6, y - 12); g.lineTo(x + 6, y); g.moveTo(x + 6, y - 12); g.lineTo(x - 6, y); g.stroke(); }
        break;
      }
      default:
    }
  }

  // ---------- цикл ----------
  function loop(now) {
    if (!open_) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    stepUnit(base, dt); for (const s of outSquads()) stepUnit(s, dt);
    combatTick(dt);
    if (AB.IsoAudio && AB.IsoAudio.surfaceTick) AB.IsoAudio.surfaceTick(dt);
    barUi();
    if (follow) { const p = posOf(flyU || selU()); cam.x += (p.x - cam.x) * Math.min(1, dt * 5); cam.y += (p.y - cam.y) * Math.min(1, dt * 5); clampCam(); }
    draw();
    placeCmd();
    requestAnimationFrame(loop);
  }
  function setZoom(z) { zoomK = Math.max(minZoom(), Math.min(2.2, z)); fit(); clampCam(); farUi(); }
  // №145: заголовок зоны и подписи сторон — только издалека («Город», «Мир»); цель задания видна всегда
  function farUi() { const el = document.getElementById('sf'); if (el) el.classList.toggle('map-far', zoomK < 0.8); }
  function pick(cx, cy) {
    const rc2 = cv.getBoundingClientRect(), k = kScale();
    const bx = ((cx - rc2.left) * dpr - cv.width / 2) / k + cam.x, by = ((cy - rc2.top) * dpr - cv.height / 2) / k + cam.y;
    const u = unitCell((bx - org.x) / S0, (by - org.y) / S0);
    return cell(u.c, u.r);
  }
  function tap(k, cx, cy) {
    hidePop(); hideCmd();
    if (!k) return;
    // нажали на капсулу: выбран отряд снаружи — вернуть его; иначе — выбрать капсулу
    if (k === curCell(base)) {
      const u = selU();
      if (u.kind === 'squad' && !selAll) { recall(u.id); return; }
      if (selAll && outSquads().length) { for (const q of outSquads()) recall(q.id); return; }
      sel = 'base'; flyU = base; follow = true; barSig = ''; say('Капсула. «Вести базу» — ехать на ней; удерживайте «Моя база» — масштаб карты'); return;
    }
    // нажали на своего героя — выбрать его
    const s = outSquads().find((q) => curCell(q) === k);
    if (s) { sel = s.id; drive = false; selAll = false; flyU = s; follow = true; barSig = ''; return; }
    // NPC — «Атаковать»
    const m = mobAt(k);
    if (m && visibleMob(m) && !drive) { showCmd(cx, cy, k, m); return; }
    if (!k.site && !k.seen && !passable(k)) { say('Там ещё никто не был'); return; }
    if (!passable(k)) { say(K[k.kind].block); return; }
    // «Вести базу» — капсула едет сразу
    if (drive) { pendSite = k.site ? { s: k.site, u: base } : null; goTo(base, k); return; }
    showCmd(cx, cy, k, null);
  }
  // ---------- нижняя панель: «Моя база» (с веером масштаба), «Вести базу», ячейки отрядов ----------
  const STATE = { home: 'в капсуле', out: 'снаружи', retreat: 'возвращается' };
  let barSig = '';
  function barUi() {
    const mb = document.getElementById('sf-mybase'); if (!mb) return;
    mb.classList.toggle('on', drive);
    mb.querySelector('span').textContent = base.anim || base.path.length ? 'База в пути' : 'Моя база';
    const dr = document.querySelector('[data-sf-drive]'); dr.classList.toggle('on', drive);
    const slots = [];
    for (const q of squads) {
      const c = AB.Chars.get(q.id), d = AB.ID.get(q.id), hp = c && d.stats ? Math.round((c.hp / d.stats.maxHp) * 100) : 100;
      const st = q.state === 'out' && q.target ? 'в бою' : q.state === 'out' && (q.anim || q.path.length) ? (q.mode === 'auto' ? 'автобой' : 'в пути') : STATE[q.state];
      const on = (selAll && q.state === 'out') || (!selAll && sel === q.id && q.state !== 'home');
      const back = on && q.state === 'out' ? '<button data-do="back" title="Вернуть в капсулу">↩</button>' : '';
      slots.push(`<div class="ow-slot ${on ? 'on' : ''} st-${q.state}" data-u="${q.id}" title="${d.name} · ${(AB.VEHICLES[q.vehicle] || {}).name || 'экзокостюм'} · скорость ${(AB.VEHICLES[q.vehicle] || {}).speed || '?'} кл/мин · ${st}"><canvas data-pt="${q.id}"></canvas><img src="${(AB.VEHICLES[q.vehicle] || {}).img || 'assets/exosuit/v2/body.png'}" alt=""><b>${d.name}</b><span>${st}</span><u><i style="width:${hp}%"></i></u>${back}</div>`);
    }
    // как на дне: место под следующий транспорт и закрытые ячейки
    slots.push('<div class="ow-slot add" title="Нужен ещё один транспорт (экзокостюм)">+</div>');
    slots.push('<div class="ow-slot lock"><span>Условие:</span><em>модуль «Ангар»</em></div>');
    slots.push('<div class="ow-slot lock"><i>🔒</i></div>');
    const allB = document.querySelector('[data-sf-allsel]'); if (allB) allB.classList.toggle('on', selAll);
    const sig = slots.join('') + sel + drive + selAll;
    if (sig === barSig) return;
    barSig = sig;
    const el = document.getElementById('sf-slots'); el.innerHTML = slots.join('');
    if (AB.IsoRender && AB.IsoRender.portrait) for (const c2 of el.querySelectorAll('canvas[data-pt]')) AB.IsoRender.portrait(c2, c2.dataset.pt, 1);
  }
  // войти в капсулу: отряды стыкуются, карта закрывается; выйдя из капсулы — снова здесь (iso-acts: leaveBase)
  function enterBase() {
    for (const q of squads) if (q.state !== 'home') dock(q);
    save(); close();
    AB.IsoActs.enterBase();
  }
  function myBaseTap() {
    const c = posOf(base), centred = Math.hypot(c.x - cam.x, c.y - cam.y) < S0 * 0.8 && follow && flyU === base;
    if (!centred) { sel = drive ? 'base' : sel; flyU = base; follow = true; barSig = ''; return; }
    enterBase();
  }
  // №140–141: веер на «Моя база» (общий для карт — js/iso/iso-mapui.js): масштаб карты
  const SCALE = { troops: 1.7, village: 1.05, city: 0.62, world: 0 };
  function scaleTo(key) {
    if (key === 'world') { follow = false; setZoom(0); }
    else { setZoom(SCALE[key]); follow = true; flyU = key === 'troops' ? selU() : flyU; }
    say(`Масштаб: ${AB.IsoMapUI.label(key)}`);
  }
  let inited = false;
  function init() {
    if (inited) return; inited = true;
    cv = document.getElementById('sf-map'); g = cv.getContext('2d');
    const ptrs = new Map(); let drag = null, pinch = null;
    cv.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); cv.setPointerCapture(e.pointerId);
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
      if (drag.moved) { follow = false; const k = kScale(); cam.x = drag.cx - dx * dpr / k; cam.y = drag.cy - dy * dpr / k; clampCam(); }
    });
    const up = (e) => {
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
      if (drag && !drag.moved && e.type === 'pointerup') tap(pick(e.clientX, e.clientY), e.clientX, e.clientY);
      drag = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoomK * (e.deltaY > 0 ? 0.9 : 1.1)); }, { passive: false });
    const root = document.getElementById('sf');
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-sf-x]')) hidePop();
      if (e.target.closest('[data-sf-act]') && storyCard) { storyCard = null; hidePop(); storyAdvance(); return; }
      if (e.target.closest('[data-sf-allsel]')) { selAll = !selAll; if (selAll) drive = false; barSig = ''; say(selAll ? 'Все: приказ получает весь отряд' : 'Приказ получает выбранный герой'); }
      if (e.target.closest('[data-sf-squad]')) { AB.IsoRoster.open(); }
      const cb = e.target.closest('[data-cmd]'); if (cb) { command(cb.dataset.cmd); return; }
      if (e.target.closest('[data-sf-items]')) AB.IsoInventory.open();
      if (e.target.closest('[data-sf-units]')) AB.IsoRoster.units();
      if (e.target.closest('[data-sf-drive]')) { drive = !drive; selAll = false; if (drive) { sel = 'base'; flyU = base; say('Вести базу: вкл — нажмите на клетку, капсула поедет туда'); } else say('Вести базу: выкл'); barSig = ''; }
      const bk = e.target.closest('[data-do="back"]'), sl = e.target.closest('[data-u]');
      if (bk && sl) { recall(sl.dataset.u); return; }
      if (sl) { const q = unit(sl.dataset.u); if (!q) return; drive = false; selAll = false; if (q.state === 'home') deploy(q.id); else { sel = q.id; flyU = q; follow = true; barSig = ''; } }
    });
    window.addEventListener('resize', () => { if (open_) fit(); });
    AB.IsoMapUI.fan(document.getElementById('sf-mybase'), document.getElementById('sf-fan'), { tap: myBaseTap, pick: scaleTo });
  }
  function say(t) { const el = document.getElementById('sf-say'); if (!el) return; el.textContent = t; el.classList.add('show'); clearTimeout(say.t); say.t = setTimeout(() => el.classList.remove('show'), 2200 + t.length * 40); }

  // ---------- сохранение (только эта зона) ----------
  function save() {
    try { localStorage.setItem(SAVE, JSON.stringify({ base: [base.c, base.r], sq: squads.map((q) => [q.id, q.state === 'home' ? 'home' : 'out', curCell(q).c, curCell(q).r]), seen: cells.filter((k) => k.seen).map((k) => idx(k.c, k.r)) })); } catch (e) { /* нет хранилища — не беда */ }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE) || 'null'); if (!s || !s.base) return false;
      Object.assign(base, { c: s.base[0], r: s.base[1], path: [], anim: null });
      squads.length = 0; syncSquads();
      for (const [id, state, c, r] of s.sq || []) { const q = unit(id); if (q && state === 'out' && passable(cell(c, r))) Object.assign(q, { state: 'out', c, r }); }
      for (const i of s.seen) if (cells[i] && !cells[i].seen) { cells[i].seen = true; clearFog(cells[i]); }
      return passable(cell(base.c, base.r));
    } catch (e) { return false; }
  }

  // ---------- вход в зону ----------
  // fresh — после всплытия: новая случайная точка, туман заново
  function enter(fresh = true) {
    init();
    if (!built || fresh) { built = false; build(); }
    if (AB.IsoOverworld && AB.IsoOverworld.isOpen()) AB.IsoOverworld.close();
    for (const id of ['iso-act', 'iso-inv']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    if (fresh || !load()) spawn();
    syncSquads(); barSig = '';
    if (fresh || !mobs.length) spawnMobs();
    hideCmd();
    if (AB.IsoRoster) AB.IsoRoster.setOutFn((id) => { const q = unit(id); return !!q && q.state !== 'home'; });
    save();
    hidePop();
    open_ = true; document.getElementById('sf').hidden = false;
    document.body.classList.add('sf-on');
    fit(); farUi(); flyU = selU(); const p = posOf(flyU); cam.x = p.x; cam.y = p.y; follow = true; inZone = true;
    last = performance.now(); requestAnimationFrame(loop);
    if (AB.Flags) AB.Flags.add('zone-a1');
    storyEnter();
    AB.Bus.emit('surface:enter', { zone: D().id });
    const hereSide = cell(base.c, base.r).side === 'desert' ? 'пустыня Домов Песка' : 'болота Детей Хора';
    if (fresh) say(`Капсулу вынесло на сушу — зона A1, вокруг ${hereSide}. Нажмите на клетку — герой выйдет в экзокостюме; «Вести базу» — ехать капсулой`);
  }
  let inZone = false;           // отряд уже на поверхности: из капсулы выходим сюда, а не на дно
  function close() { if (open_) setTimeout(() => AB.Bus.emit('surface:close', {}), 0); open_ = false; const el = document.getElementById('sf'); if (el) el.hidden = true; document.body.classList.remove('sf-on'); }

  return {
    enter, close, isOpen: () => open_, say,
    // №142: для звука — сколько вокруг выбранного пустыни и болота (0…1)
    ambMix() {
      if (!built) return { desert: 1, swamp: 0 };
      const u = curCell(selU()); let d = 0, w = 0;
      for (const k of cells) if (dist(k, u) <= 3) { if (k.side === 'desert') d++; else w++; }
      const n = Math.max(1, d + w); return { desert: d / n, swamp: w / n };
    }, active: () => inZone, enterBase, deploy, recall,
    revealAll() { for (const k of cells) if (!k.seen) { k.seen = true; clearFog(k); } save(); },
    zoom: (z) => setZoom(z),
    // для проверок
    _cells: () => cells, _sites: () => sites, _lanes: () => lanes, _party: () => selU(), _base: () => base, _squads: () => squads, _drive: (v) => { drive = v; },
    _goTo: (c, r) => goTo(mover(), cell(c, r)), _sel: (id) => { sel = id; }, _tap: (c, r) => tap(cell(c, r)), _pop: () => popSite, _zoom: () => zoomK, _fan: (key) => scaleTo(key), _mobs: () => mobs, _cmd: (kind) => command(kind), _tapAt: (c, r) => tap(cell(c, r), 400, 200), _selAll: (v) => { selAll = v; }, _story: () => story, _storyNext: () => storyAdvance(), _act: () => document.querySelector('#sf-pop [data-sf-act]').click(), _passable: (c, r) => passable(cell(c, r)),
    _path: (a, b) => search(cell(a[0], a[1]), (m) => m.c === b[0] && m.r === b[1], (m) => (passable(m) ? cost(m) : Infinity)),
  };
})();
