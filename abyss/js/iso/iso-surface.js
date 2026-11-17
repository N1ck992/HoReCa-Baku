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

  // ---------- отряд ----------
  const party = { c: 0, r: 0, path: [], anim: null, face: 1 };
  const cap = { c: 0, r: 0 };
  let pendSite = null, follow = true;
  function spawn() {
    const home = sites.find((s) => s.kind === 'capital');
    const reach = new Set(); const q = [cell(home.c, home.r)]; reach.add(q[0]);
    while (q.length) { const k = q.pop(); for (const nb of nbrs(k)) if (passable(nb) && !reach.has(nb)) { reach.add(nb); q.push(nb); } }
    const ok = [...reach].filter((k) => !k.site && k.kind !== 'ford' && k.kind !== 'bridge' && k.r >= 4 && k.r <= H - 4 && k.c >= 3 && k.c <= W - 4 && sites.every((s) => dist(s, k) >= 2));
    const k = ok[Math.floor(Math.random() * ok.length)];
    cap.c = k.c; cap.r = k.r;
    const nb = nbrs(k).find((m) => passable(m) && !m.site) || k;
    party.c = nb.c; party.r = nb.r; party.path = []; party.anim = null;
    reveal();
    return k;
  }
  function reveal() {
    const found = [];
    for (let r = Math.max(0, party.r - VIEW - 1); r <= Math.min(H - 1, party.r + VIEW + 1); r++) {
      for (let c = Math.max(0, party.c - VIEW - 1); c <= Math.min(W - 1, party.c + VIEW + 1); c++) {
        const k = cell(c, r);
        if (!k.seen && dist(k, party) <= VIEW) { k.seen = true; clearFog(k); if (k.site) found.push(k.site); }
      }
    }
    if (found.length) say(`Найдено: ${found.map((s) => s.name).join(', ')}`);
  }
  function goTo(k) {
    if (!passable(k)) { say(K[k.kind].block); return false; }
    const from = party.anim ? cell(party.anim.to.c, party.anim.to.r) : cell(party.c, party.r);
    if (from === k) { party.path = []; if (k.site) showSite(k.site); return true; }
    const p = search(from, (m) => m === k, (m) => (passable(m) ? cost(m) : Infinity));
    if (!p) { say('Туда не дойти'); return false; }
    party.path = p; follow = true;
    return true;
  }
  function step(dt) {
    if (!party.anim && party.path.length) {
      const nx = party.path.shift();
      party.face = upx(nx.c, nx.r).x >= upx(party.c, party.r).x ? 1 : -1;
      party.anim = { to: { c: nx.c, r: nx.r }, t: 0, dur: 0.24 * cost(nx) };
    }
    if (!party.anim) return;
    party.anim.t += dt / party.anim.dur;
    if (party.anim.t >= 1) {
      party.c = party.anim.to.c; party.r = party.anim.to.r; party.anim = null;
      reveal();
      if (!party.path.length) { save(); if (pendSite && pendSite.c === party.c && pendSite.r === party.r) { showSite(pendSite); pendSite = null; } }
    }
  }
  const partyPos = () => {
    const a = bpx(party.c, party.r);
    if (!party.anim) return a;
    const b = bpx(party.anim.to.c, party.anim.to.r), t = party.anim.t;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  // ---------- карточка точки ----------
  const ACT = { capital: 'Предстать перед Хранителем — скоро', village: 'Войти в деревню — скоро', ford: 'Зайти на брод — скоро', shrine: 'Подойти к купели — скоро' };
  let popSite = null;
  function showSite(s) {
    popSite = s;
    const el = document.getElementById('sf-pop'), f = D().factions[s.side];
    el.querySelector('b').textContent = s.name;
    el.querySelector('i').textContent = f ? `${f.tag} · ${f.name}` : `Выход · зона ${s.to}`;
    el.querySelector('i').className = `sf-side ${s.side}`;
    el.querySelector('p').textContent = s.text;
    el.querySelector('small').textContent = f ? f.text : 'Эта зона ещё не открыта — появится в следующих обновлениях.';
    const btn = el.querySelector('[data-sf-act]');
    btn.textContent = f ? ACT[s.kind] : `Перейти в зону ${s.to} — закрыто`;
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
    // капсула
    { const p = bpx(cap.c, cap.r); drawCapsule(p.x, p.y); }
    g.drawImage(fogCv, 0, 0);
    // память: всё, что дальше обзора, — приглушено
    const pp = partyPos();
    const gr = g.createRadialGradient(pp.x, pp.y, S0 * VIEW * 1.2, pp.x, pp.y, S0 * VIEW * 2.1);
    gr.addColorStop(0, 'rgba(4,6,10,0)'); gr.addColorStop(1, 'rgba(4,6,10,.42)');
    g.fillStyle = gr; g.fillRect(cam.x - cv.width / k, cam.y - cv.height / k, cv.width * 2 / k, cv.height * 2 / k);
    // точки (только открытые)
    for (const s of sites) if (cell(s.c, s.r).seen) drawSite(s);
    // путь
    if (party.path.length) {
      g.strokeStyle = 'rgba(255,226,140,.6)'; g.setLineDash([5, 6]); g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(pp.x, pp.y); for (const m of party.path) { const p = bpx(m.c, m.r); g.lineTo(p.x, p.y); } g.stroke(); g.setLineDash([]);
      const e = party.path[party.path.length - 1], p = bpx(e.c, e.r);
      g.strokeStyle = 'rgba(255,226,140,.9)'; hexPath(p.x, p.y, S0 * 0.7, g); g.stroke();
    }
    drawParty(pp.x, pp.y);
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
  function drawCapsule(x, y) {
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, y + 6, S0 * 0.7, S0 * 0.22, 0, 0, 7); g.fill();
    g.fillStyle = '#c9a24a'; g.beginPath(); g.ellipse(x, y, S0 * 0.62, S0 * 0.32, -0.25, 0, 7); g.fill();
    g.fillStyle = '#8a6e30'; g.beginPath(); g.ellipse(x, y + 4, S0 * 0.62, S0 * 0.16, -0.25, 0, Math.PI); g.fill();
    for (let i = -1; i <= 1; i++) { g.fillStyle = `rgba(94,230,255,${0.5 + 0.4 * Math.sin(time * 3 + i)})`; g.beginPath(); g.arc(x + i * S0 * 0.22, y - 2 - i * 3, 2.4, 0, 7); g.fill(); }
  }
  function drawParty(x, y) {
    const moving = !!party.anim, bob = moving ? Math.abs(Math.sin(time * 10)) * 2.5 : 0;
    g.strokeStyle = 'rgba(255,226,140,.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y + 4, S0 * 0.62, S0 * 0.26, 0, 0, 7); g.stroke();
    const fig = (dx, body, visor, h, ph) => {
      const b = moving ? Math.abs(Math.sin(time * 10 + ph)) * 2.5 : bob;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + dx, y + 4, 7, 3, 0, 0, 7); g.fill();
      g.fillStyle = body; g.beginPath(); g.roundRect(x + dx - 6, y - h - b, 12, h, 4); g.fill();
      g.fillStyle = '#20262a'; g.fillRect(x + dx - 5, y - 4 - b, 4, 6); g.fillRect(x + dx + 1, y - 4 - b, 4, 6);
      g.fillStyle = body; g.beginPath(); g.arc(x + dx, y - h - 4 - b, 6.5, 0, 7); g.fill();
      g.fillStyle = visor; g.beginPath(); g.ellipse(x + dx + 2 * party.face, y - h - 4 - b, 3.6, 2.6, 0, 0, 7); g.fill();
    };
    fig(-7 * party.face, '#d8dde0', '#9fe7ff', 16, 1.3);      // доктор Хейл
    fig(6 * party.face, '#c9853a', '#5ee6ff', 20, 0);         // Марк
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
        g.strokeStyle = 'rgba(255,120,100,.9)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 6, y - 12); g.lineTo(x + 6, y); g.moveTo(x + 6, y - 12); g.lineTo(x - 6, y); g.stroke();
        break;
      }
      default:
    }
  }

  // ---------- цикл ----------
  function loop(now) {
    if (!open_) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    step(dt);
    if (follow) { const p = partyPos(); cam.x += (p.x - cam.x) * Math.min(1, dt * 5); cam.y += (p.y - cam.y) * Math.min(1, dt * 5); clampCam(); }
    draw();
    requestAnimationFrame(loop);
  }
  function setZoom(z) { zoomK = Math.max(minZoom(), Math.min(2.2, z)); fit(); clampCam(); }
  function pick(cx, cy) {
    const rc2 = cv.getBoundingClientRect(), k = kScale();
    const bx = ((cx - rc2.left) * dpr - cv.width / 2) / k + cam.x, by = ((cy - rc2.top) * dpr - cv.height / 2) / k + cam.y;
    const u = unitCell((bx - org.x) / S0, (by - org.y) / S0);
    return cell(u.c, u.r);
  }
  function tap(k) {
    hidePop();
    if (!k) return;
    if (k.c === cap.c && k.r === cap.r && dist(k, party) <= 1 && !party.path.length) { say('Капсула — спасательный модуль. Уйти обратно под воду пока нельзя'); return; }
    if (k.site) {                 // точка (даже ещё не открытая) — подойти и показать карточку
      pendSite = k.site;
      if (!party.anim && party.c === k.c && party.r === k.r) { showSite(k.site); pendSite = null; return; }
      goTo(k); return;
    }
    pendSite = null;
    if (!k.seen && !passable(k)) { say('Там ещё никто не был'); return; }
    goTo(k);
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
      if (drag && !drag.moved && e.type === 'pointerup') tap(pick(e.clientX, e.clientY));
      drag = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoomK * (e.deltaY > 0 ? 0.9 : 1.1)); }, { passive: false });
    const root = document.getElementById('sf');
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-sf-x]')) hidePop();
      if (e.target.closest('[data-sf-me]')) { follow = true; if (zoomK < 0.9) setZoom(1); }
      if (e.target.closest('[data-sf-all]')) { if (zoomK > minZoom() + 0.01) { follow = false; setZoom(0); } else { setZoom(1); follow = true; } }
      if (e.target.closest('[data-sf-items]')) AB.IsoInventory.open();
    });
    window.addEventListener('resize', () => { if (open_) fit(); });
  }
  function say(t) { const el = document.getElementById('sf-say'); if (!el) return; el.textContent = t; el.classList.add('show'); clearTimeout(say.t); say.t = setTimeout(() => el.classList.remove('show'), 2200 + t.length * 40); }

  // ---------- сохранение (только эта зона) ----------
  function save() {
    try { localStorage.setItem(SAVE, JSON.stringify({ p: [party.c, party.r], cap: [cap.c, cap.r], seen: cells.filter((k) => k.seen).map((k) => idx(k.c, k.r)) })); } catch (e) { /* нет хранилища — не беда */ }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE) || 'null'); if (!s) return false;
      party.c = s.p[0]; party.r = s.p[1]; cap.c = s.cap[0]; cap.r = s.cap[1];
      for (const i of s.seen) if (cells[i] && !cells[i].seen) { cells[i].seen = true; clearFog(cells[i]); }
      return passable(cell(party.c, party.r));
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
    save();
    hidePop();
    open_ = true; document.getElementById('sf').hidden = false;
    document.body.classList.add('sf-on');
    fit(); const p = partyPos(); cam.x = p.x; cam.y = p.y; follow = true;
    last = performance.now(); requestAnimationFrame(loop);
    if (AB.Flags) AB.Flags.add('zone-a1');
    AB.Bus.emit('surface:enter', { zone: D().id });
    const hereSide = cell(party.c, party.r).side === 'desert' ? 'пустыня Домов Песка' : 'болота Детей Хора';
    if (fresh) say(`Капсулу вынесло на сушу — зона A1. Вокруг ${hereSide}. На западе — Цитадель Кадзэ, на востоке — Купель Хора`);
  }
  function close() { open_ = false; const el = document.getElementById('sf'); if (el) el.hidden = true; document.body.classList.remove('sf-on'); }

  return {
    enter, close, isOpen: () => open_, say,
    revealAll() { for (const k of cells) if (!k.seen) { k.seen = true; clearFog(k); } save(); },
    zoom: (z) => setZoom(z),
    // для проверок
    _cells: () => cells, _sites: () => sites, _lanes: () => lanes, _party: () => party, _cap: () => cap,
    _goTo: (c, r) => goTo(cell(c, r)), _tap: (c, r) => tap(cell(c, r)), _pop: () => popSite, _passable: (c, r) => passable(cell(c, r)),
    _path: (a, b) => search(cell(a[0], a[1]), (m) => m.c === b[0] && m.r === b[1], (m) => (passable(m) ? cost(m) : Infinity)),
  };
})();
