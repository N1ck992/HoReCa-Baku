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
  const SAVE = 'abyss_a1_v2';            // №150: регион «Треугольник» (новая карта)
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
    // №150: регион «Треугольник»
    meadow: { cost: 1.4, col: [104, 134, 74], name: 'луга' },
    forest: { cost: 2.4, col: [50, 82, 52], name: 'лес' },
    mountain: { block: 'Горы — только по перевалам', col: [112, 118, 128], lift: 0.62 },
    thicket: { cost: 2.7, col: [78, 70, 78], name: 'заросли' },
    mistwood: { cost: 2.4, col: [66, 92, 84], name: 'Туманный лес' },
    salt: { cost: 1.3, col: [212, 210, 196], name: 'Солончаки' },
    rustfoot: { cost: 2.0, col: [126, 94, 68], name: 'Ржавые предгорья' },
    ruin: { cost: 2.2, col: [150, 132, 104], name: 'руины' },
    plaza: { cost: 1.1, col: [150, 140, 118], name: 'Меновой Узел' },
  };
  const passable = (k) => !!k && !K[k.kind].block;
  const cost = (k) => (k.road ? (k.kind === 'ford' ? 1.3 : 1) : K[k.kind].cost || 99);
  // №182: на здания (город, посёлок, Узел, Купель, лагерь, шахта/укрепление) не наступает никто — к ним подходят вплотную
  const BUILD = new Set(['capital', 'village', 'hub', 'shrine']);
  const blockSite = (k) => !!k && ((k.site && BUILD.has(k.site.kind)) || !!k.camp);
  const walk = (k) => passable(k) && !blockSite(k);
  // №185: прямая видимость — горы, столовые скалы, обрывы и стены органики закрывают выстрел
  function los(a, b) {
    if (dist(a, b) <= 1) return true;
    const pa = bpx(a.c, a.r), pb = bpx(b.c, b.r), n = dist(a, b) * 4;
    for (let i = 1; i < n; i++) {
      const t = i / n, u = unitCell((pa.x + (pb.x - pa.x) * t - org.x) / S0, (pa.y + (pb.y - pa.y) * t - org.y) / S0), k = cell(u.c, u.r);
      if (!k || k === a || k === b) continue;
      const kk = K[k.kind]; if (kk.block && kk.lift) return false;
    }
    return true;
  }
  const canShoot = (from, to, reach) => dist(from, to) <= reach && (reach <= 1 || los(from, to));

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
    rc = !d.river ? [] : Array.from({ length: H }, (_, r) => d.river.col + d.river.amp * Math.sin(r * 0.33 + 0.8) + (nw(3, r) - 0.5) * 1.6);
    cells = [];
    if (d.regions) buildRegions(d, rand, n1, n2, n3, nw);
    else for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
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
    const ground = (k) => ({ desert: 'sand', east: 'meadow', organic: 'marsh', hub: 'plaza', swamp: 'marsh' }[k.side] || 'sand');
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
      if (s.kind === 'village' || s.kind === 'capital' || s.kind === 'shrine' || s.kind === 'hub') for (const nb of nbrs(k)) if (K[nb.kind].block && nb.kind !== 'river' && nb.kind !== 'gorge' && nb.kind !== 'cliff') nb.kind = ground(nb);
      const site = { ...s, c: k.c, r: k.r };
      k.site = site; sites.push(site);
      if (s.kind === 'capital' || s.kind === 'shrine' || s.kind === 'hub') k.seen = true;     // столицы и Узел все знают — видны сразу
    }
    built = true;
    bakeMap();
  }

  // №150: земли треугольника — по ближайшей «столице» (расстояние с шумом и весом), на стыке двух
  // земель — пограничный пояс; вокруг Узла — площадь; сверху — ущелье, по краям — обрыв
  function buildRegions(d, rand, n1, n2, n3, nw) {
    const R = d.regions, sides = ['east', 'organic', 'desert'];
    const pos = (c, r) => upx(c, r), hub = pos(...R.hub.at);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const p = pos(c, r), a = n1(c, r), b = n2(c, r), e = n3(c, r), wob = (nw(c, r) - 0.5) * 6;
      const ds = sides.map((sd) => { const q = pos(...R[sd].at); return { sd, v: Math.hypot(p.x - q.x, p.y - q.y) / SQ3 / R[sd].w + wob * (sd === 'organic' ? 1 : -0.6) }; }).sort((x, y) => x.v - y.v);
      let side = ds[0].sd, kind, belt = null;
      const toHub = Math.hypot(p.x - hub.x, p.y - hub.y) / SQ3;
      if (r <= 1) kind = 'gorge';
      else if (r === H - 1 || c === 0 || c === W - 1) kind = 'cliff';
      else if (toHub < R.hub.radius + (a - 0.5)) { side = 'hub'; kind = b > 0.75 ? 'scrub' : 'plaza'; }
      else if (ds[1].v - ds[0].v < d.belts.width) { belt = [ds[0].sd, ds[1].sd].sort().join('_'); kind = d.belts[belt] || 'scrub'; }
      else if (side === 'east') kind = b > 0.64 || e > 0.82 ? 'mountain' : a > 0.52 ? 'forest' : 'meadow';
      else if (side === 'organic') kind = b > 0.7 ? 'bog' : e > 0.74 ? 'growth' : a > 0.6 ? 'thicket' : a > 0.48 ? 'reeds' : 'marsh';
      else kind = b > 0.68 ? 'mesa' : e > 0.8 ? 'ruin' : a > 0.6 ? 'dune' : 'sand';
      cells.push({ c, r, kind, side, belt, road: false, seen: false, site: null, v: rand() });
    }
  }

  // ---------- рисунок карты (один раз — в запасной холст) ----------
  const rgb = (c, m = 1, a = 1) => `rgba(${Math.round(c[0] * m)},${Math.round(c[1] * m)},${Math.round(c[2] * m)},${a})`;
  function hexPath(x, y, s, ctx) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); ctx.lineTo(x + s * Math.cos(a), y + s * Math.sin(a) * TILT); } ctx.closePath(); }
  // №167: текстуры местности (assets/surface/tex — Poly Haven, CC0): клетка залита текстурой своего вида,
  // сверху — тон цвета земли (texTint), чтобы стороны треугольника отличались; пока не загрузились — просто цвет
  const TEX_KINDS = ['sand', 'dune', 'mesa', 'oasis', 'scrub', 'marsh', 'reeds', 'bog', 'growth', 'ford', 'meadow', 'forest', 'mountain', 'thicket', 'mistwood', 'salt', 'rustfoot', 'ruin', 'plaza', 'cliff'];
  const texImg = {};
  let texReady = false;
  const texTint = 0.38;
  (function loadTex() {
    let left = TEX_KINDS.length;
    for (const k of TEX_KINDS) {
      const im = new Image();
      im.onload = im.onerror = () => { if (im.naturalWidth) texImg[k] = im; if (--left === 0) { texReady = true; if (built && bake) { bakeMap(); } } };
      im.src = `assets/surface/tex/${k}.webp`;
    }
  })();
  function fillTex(b, k, p, r, pats) {
    const t = K[k.kind], m = 0.9 + k.v * 0.2;
    hexPath(p.x, p.y, r, b);
    const pat = pats[k.kind];
    if (pat) { b.fillStyle = pat; b.fill(); b.globalAlpha = texTint; b.fillStyle = rgb(t.col, m); b.fill(); b.globalAlpha = 1; }
    else { b.fillStyle = rgb(t.col, m); b.fill(); }
  }
  function bakeMap() {
    const s = S0;
    bake = document.createElement('canvas');
    org = { x: s * 1.2, y: s * 1.4 };
    bake.width = Math.ceil(org.x * 2 + s * SQ3 * (W + 0.5)); bake.height = Math.ceil(org.y * 2 + s * 1.5 * TILT * (H - 1));
    const b = bake.getContext('2d');
    b.fillStyle = '#07090b'; b.fillRect(0, 0, bake.width, bake.height);
    const R = rng(77);
    // узоры текстур: одна текстура ~2,5 клетки, приплюснута как карта (TILT)
    const pats = {};
    if (texReady) for (const [kk, im] of Object.entries(texImg)) { const pt = b.createPattern(im, 'repeat'); const sc = (s * 2.5) / im.naturalWidth; if (pt.setTransform) pt.setTransform(new DOMMatrix([sc, 0, 0, sc * TILT, 0, 0])); pats[kk] = pt; }
    // плоские клетки
    for (const k of cells) {
      const p = bpx(k.c, k.r), t = K[k.kind];
      fillTex(b, k, p, s * 1.02, pats);
      b.strokeStyle = 'rgba(0,0,0,.08)'; b.lineWidth = 1; b.stroke();
      deco(b, k, p, s, R);
    }
    // дороги: от центра к центру соседних дорожных клеток
    const roadCol = (k) => (k.kind === 'bridge' ? '#7a5634' : k.kind === 'ford' ? '#8fb2b6' : k.kind === 'salt' ? '#c8c2ae' : k.side === 'desert' ? '#e2c88e' : k.side === 'east' ? '#a89a7a' : k.side === 'hub' ? '#bba886' : '#5b4a30');
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
      if (pats[k.kind]) { fillTex(b, k, { x: p.x, y: p.y - h }, s, pats); b.globalAlpha = 0.12; b.fillStyle = '#fff'; b.fill(); b.globalAlpha = 1; }   // №167: верх скалы — текстура, чуть светлее
      else { hexPath(p.x, p.y - h, s, b); b.fillStyle = rgb(t.col, 1.05 + k.v * 0.1); b.fill(); }
      b.strokeStyle = rgb(t.col, 1.35, 0.5); b.lineWidth = 1.5; b.stroke();
      if (k.kind === 'growth') {                  // пузыри органики
        for (let i = 0; i < 4; i++) { b.fillStyle = `rgba(${200 + R() * 55},${90 + R() * 60},${170 + R() * 60},.75)`; b.beginPath(); b.arc(p.x + (R() - 0.5) * s, p.y - h + (R() - 0.5) * s * 0.6, s * (0.08 + R() * 0.12), 0, 7); b.fill(); }
      }
      if (k.kind === 'mountain') { b.fillStyle = 'rgba(240,244,250,.9)'; b.beginPath(); b.moveTo(p.x - s * 0.45, p.y - h - s * 0.05); b.lineTo(p.x, p.y - h - s * 0.42); b.lineTo(p.x + s * 0.45, p.y - h - s * 0.05); b.lineTo(p.x + s * 0.15, p.y - h + s * 0.06); b.lineTo(p.x - s * 0.1, p.y - h - s * 0.08); b.closePath(); b.fill(); }
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
      case 'meadow': b.strokeStyle = 'rgba(160,190,110,.55)'; b.lineWidth = 1.2; for (let i = 0; i < 6; i++) { const x = p.x + (R() - 0.5) * s * 1.2, y = p.y + (R() - 0.3) * s * 0.6; b.beginPath(); b.moveTo(x, y); b.lineTo(x + 1.5, y - s * 0.18); b.stroke(); } break;
      case 'forest': case 'mistwood': for (let i = 0; i < 4; i++) { const x = p.x + (R() - 0.5) * s * 1.1, y = p.y + (R() - 0.4) * s * 0.6; b.fillStyle = 'rgba(20,40,22,.6)'; b.beginPath(); b.arc(x + 2, y + 3, s * 0.2, 0, 7); b.fill(); b.fillStyle = k.kind === 'forest' ? '#2f5a34' : '#3f6a5a'; b.beginPath(); b.arc(x, y, s * 0.2, 0, 7); b.fill(); if (k.kind === 'mistwood' && R() < 0.6) { b.fillStyle = 'rgba(240,140,210,.7)'; b.beginPath(); b.arc(x + 3, y - 3, 2.2, 0, 7); b.fill(); } } if (k.kind === 'mistwood') { b.fillStyle = 'rgba(220,235,235,.12)'; b.beginPath(); b.ellipse(p.x, p.y, s * 0.8, s * 0.4, 0, 0, 7); b.fill(); } break;
      case 'thicket': b.strokeStyle = 'rgba(120,70,110,.7)'; b.lineWidth = 2; for (let i = 0; i < 4; i++) { const x = p.x + (R() - 0.5) * s; b.beginPath(); b.moveTo(x, p.y + s * 0.3); b.quadraticCurveTo(x + 6, p.y, x - 2, p.y - s * 0.3); b.stroke(); } b.fillStyle = 'rgba(220,120,200,.6)'; for (let i = 0; i < 3; i++) { b.beginPath(); b.arc(p.x + (R() - 0.5) * s, p.y + (R() - 0.5) * s * 0.5, 2.5, 0, 7); b.fill(); } break;
      case 'salt': b.strokeStyle = 'rgba(150,145,130,.5)'; b.lineWidth = 1; for (let i = 0; i < 4; i++) { const x = p.x + (R() - 0.5) * s, y = p.y + (R() - 0.5) * s * 0.6; b.beginPath(); b.moveTo(x, y); b.lineTo(x + (R() - 0.5) * 12, y + (R() - 0.5) * 6); b.lineTo(x + (R() - 0.5) * 14, y + (R() - 0.5) * 8); b.stroke(); } break;
      case 'rustfoot': for (let i = 0; i < 3; i++) { b.fillStyle = R() < 0.5 ? '#7a4a2a' : '#5a5f64'; b.save(); b.translate(p.x + (R() - 0.5) * s, p.y + (R() - 0.5) * s * 0.5); b.rotate(R() * 3); b.fillRect(-5, -2, 10, 4); b.restore(); } break;
      case 'ruin': b.fillStyle = 'rgba(110,96,76,.9)'; for (let i = 0; i < 3; i++) { const x = p.x + (R() - 0.5) * s, y = p.y + (R() - 0.5) * s * 0.4; b.fillRect(x - 5, y - 8, 10, 8); b.fillStyle = 'rgba(80,70,56,.9)'; } break;
      case 'plaza': b.strokeStyle = 'rgba(100,92,76,.4)'; b.lineWidth = 1; for (let i = -1; i <= 1; i++) { b.beginPath(); b.moveTo(p.x - s * 0.6, p.y + i * s * 0.25); b.lineTo(p.x + s * 0.6, p.y + i * s * 0.25); b.stroke(); } break;
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
  // №193: «Следовать» — отряд идёт вместе, со скоростью самого медленного (u.capSpeed)
  const STEP_OF = (u) => 60 / (u.kind === 'base' ? AB.VEHICLES_BASE.speed : Math.min((VEFF(u.vehicle) || { speed: 30 }).speed, u.capSpeed || Infinity)) / devFast();
  // №161: техника с деталями (js/iso/iso-mods.js) — скорость, урон, темп, броня, прочность, крит
  // №165: и исследования ветки «Бой» (AB.BaseSim.fx) — урон и броня всей техники отряда
  const TFX = (key) => (AB.BaseSim && AB.BaseSim.fx ? AB.BaseSim.fx(key) : 0);
  const VEFF = (vid) => {
    const v = (AB.VehMods ? AB.VehMods.eff(vid) : AB.VEHICLES[vid]) || null; if (!v) return null;
    const a = TFX('sqAtk'), ar = TFX('sqArmor');
    const w = a || ar ? { ...v, attack: Math.round(v.attack * (1 + a)), armor: Math.min(0.8, v.armor + ar) } : v;
    return AB.Synergy ? AB.Synergy.apply(w, vid) : w;   // №199: связки отряда
  };
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
  const taken = (k, self) => (k.c === base.c && k.r === base.r) || outSquads().some((s) => s !== self && curCell(s) === k) || alive().some((m) => curCell(m) === k);
  const besideBase = (self) => nbrs(curCell(base)).find((k) => walk(k) && !taken(k, self)) || null;
  function deploy(id) {
    const s = unit(id); if (!s || s.state !== 'home') return false;
    if (broken[s.vehicle]) { restore(id); return false; }          // №157: разбитая техника — сперва восстановить за энергию
    if (base.anim) { say('Капсула в пути — выйти можно, когда остановится'); return false; }
    const k = besideBase(s); if (!k) { say('Вокруг капсулы нет свободной клетки'); return false; }
    Object.assign(s, { state: 'out', c: k.c, r: k.r, path: [], anim: null });
    sel = id; drive = false; flyU = s; follow = true; barSig = '';
    say(`${AB.ID.get(id).name}: ${(AB.VEHICLES[s.vehicle] || {}).name || 'экзокостюм'} вышел из капсулы`);
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
    // здание — встать рядом с ним (ближайшая свободная клетка)
    if (blockSite(k)) {
      if (dist(from, k) <= 1 && !u.anim) { u.path = []; if (k.site) showSite(k.site); return true; }
      const p2 = search(from, (m) => dist(m, k) === 1 && walk(m) && !occupiedBy(m, u), (m) => (walk(m) ? cost(m) + (occupiedBy(m, u) ? 6 : 0) : Infinity));
      if (!p2) { say('Туда не подойти'); return false; }
      if (u.state === 'retreat') u.state = 'out';
      u.path = p2; follow = false; barSig = ''; return true;   // №198: после команды камера не прыгает к отряду — в открытом мире она свободна
    }
    if (from === k) { u.path = []; if (k.site) showSite(k.site); return true; }
    const p = search(from, (m) => m === k, (m) => (walk(m) ? cost(m) + (occupiedBy(m, u) ? 6 : 0) : Infinity));
    if (!p) { say('Туда не дойти'); return false; }
    if (u.state === 'retreat') u.state = 'out';
    u.path = p; follow = false; barSig = '';
    return true;
  }
  // №182: в клетке — один юнит (капсула, отряд, NPC, патруль, союзник); занято — подождать и обойти
  function occupiedBy(k, self) {
    if (self !== base && curCell(base) === k) return true;
    if (outSquads().some((q) => q !== self && curCell(q) === k)) return true;
    if (alive().some((m) => m !== self && curCell(m) === k)) return true;
    return allies.some((a) => a !== self && a.state === 'out' && curCell(a) === k);
  }
  function stepUnit(u, dt) {
    if (!u.anim && u.path.length && (occupiedBy(u.path[0], u) || blockSite(u.path[0]))) {
      u.waitT = (u.waitT || 0) + dt;
      if (u.waitT < 0.5) return;                                       // подождать — может, уйдёт
      u.waitT = 0; const goal = u.path[u.path.length - 1];
      const p = goal && search(curCell(u), (m) => (occupiedBy(goal, u) || blockSite(goal) ? dist(m, goal) <= 1 && walk(m) && !occupiedBy(m, u) : m === goal), (m) => (walk(m) && !occupiedBy(m, u) ? cost(m) : Infinity));
      if (p && p.length) u.path = p; else { u.path = []; if (u === base) say('Путь занят — капсула остановилась'); }
      return;
    }
    u.waitT = 0;
    if (!u.anim && u.path.length) {
      const nx = u.path.shift();
      u.face = upx(nx.c, nx.r).x >= upx(u.c, u.r).x ? 1 : -1;
      u.anim = { to: { c: nx.c, r: nx.r }, t: 0, dur: STEP_OF(u) * cost(nx) }; u.atk = null;
    }
    if (!u.anim) return;
    u.anim.t += dt / u.anim.dur; u.stride += dt * 90;
    if (u.anim.t < 1) return;
    u.c = u.anim.to.c; u.r = u.anim.to.r; u.anim = null;
    if (u === base) for (const s of squads) if (s.state === 'home') { s.c = base.c; s.r = base.r; }
    reveal();
    if (u.path.length) return;
    u.capSpeed = null;
    barSig = ''; save();
    if (u.state === 'retreat' && dist(curCell(u), curCell(base)) <= 1) { dock(u); say(`${AB.ID.get(u.id).name} — в капсуле`); return; }
    if (pendSite && pendSite.u === u && dist(cell(pendSite.s.c, pendSite.s.r), curCell(u)) <= (blockSite(cell(pendSite.s.c, pendSite.s.r)) ? 1 : 0)) { showSite(pendSite.s); pendSite = null; }
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
  // №147: эффекты атаки техники (энергосгустки экзокостюма) — js/iso/iso-vfx.js
  const vfx = AB.IsoVFX ? AB.IsoVFX.create() : null;
  let frameDt = 0;
  const suitK = () => (S0 * 1.3) / ((AB.RIGS && AB.RIGS.EXOSUIT && AB.RIGS.EXOSUIT.height) || 100);
  const poseOf = (s) => ({ id: (AB.VEHICLES[s.vehicle] || {}).look || s.id, facing: s.face, phase: s.stride / 78 * Math.PI * 2, moving: !!s.anim, attack: s.atk ? Math.min(1, s.atk.t / 0.8) : -1, hurt: s.flash > 0 ? 1 : 0, dead: false, t: time, gun: !!(AB.VEHICLES[s.vehicle] || {}).gun });
  const muzzleOf = (s) => { const p = posOf(s); return AB.IsoSuit && AB.IsoSuit.muzzle ? AB.IsoSuit.muzzle(poseOf(s), p.x, p.y + S0 * 0.2, suitK()) : { x: p.x, y: p.y - S0 * 0.6 }; };
  const NPC = () => D().npcs;
  const PAT = () => D().patrols;
  const NK = (m) => m.d || NPC().kinds[m.kind] || (PAT() && PAT().kinds[m.kind]);   // №157: у боссов и союзников — свои данные   // №154: и бойцы патрулей
  const mobs = [], floats = [];
  let mobSeq = 0, respawnT = [];
  const alive = () => mobs.filter((m) => m.hp > 0);
  const mobAt = (k) => alive().find((m) => curCell(m) === k) || null;
  const eyesNear = (k) => [base, ...outSquads()].some((u) => dist(k, curCell(u)) <= VIEW + 1);
  const visibleMob = (m) => { const k = curCell(m); return k.seen && eyesNear(k); };
  const pathTo = (from, goal) => search(from, goal, (x) => (walk(x) && x !== curCell(base) && !(mobAt(x) && !goal(x)) ? cost(x) + (outSquads().some((q) => curCell(q) === x) ? 4 : 0) : Infinity));
  const floatText = (p, text, col) => floats.push({ x: p.x, y: p.y - S0 * 0.9, t: 0, text, col });
  function spawnGroup() {
    const B = curCell(base);
    const all = cells.filter((k) => passable(k) && !k.site && !k.road && k.r > 2 && k.r < H - 2 && sites.every((s) => dist(s, k) >= 3) && dist(k, B) >= 5 && camps.every((cp) => dist(cell(cp.c, cp.r), k) >= 4) && alive().filter((m) => !m.patrol).every((m) => dist(curCell(m), k) >= 4));
    if (!all.length) return;
    const k = all[Math.floor(Math.random() * all.length)];
    const kinds = Object.keys(NPC().kinds).filter((id) => NPC().kinds[id].side === k.side);
    if (!kinds.length) return;                                       // ничьи земли (пояса, Узел) — без группы
    const kind = kinds[Math.floor(Math.random() * kinds.length)], d = NPC().kinds[kind];
    const [a, b] = NPC().perGroup, n = a + Math.floor(Math.random() * (b - a + 1)), grp = ++mobSeq;
    const spots = [k, ...nbrs(k).filter((x) => passable(x) && !x.site)];
    for (let i = 0; i < n && i < spots.length; i++) {
      mobs.push({ id: `npc${++mobSeq}`, kind: 'npc', type: kind, grp, c: spots[i].c, r: spots[i].r, home: { c: k.c, r: k.r }, hp: d.hp, max: d.hp,
        aggro: null, atkT: 0, atk: null, path: [], anim: null, face: Math.random() < 0.5 ? 1 : -1, stride: 0, flash: 0, wanderT: 2 + Math.random() * 6, repath: 0, deadT: 0 });
      mobs[mobs.length - 1].kind = kind;
    }
  }
  function spawnMobs() { mobs.length = 0; respawnT = []; allies.length = 0; loot.length = 0; spawnCamps(); spawnBosses(); for (let i = 0; i < NPC().groups; i++) spawnGroup(); spawnPatrols(); }
  function mobStep(m, dt) {
    const d = NK(m);
    if (!m.anim && m.path.length) {
      const nx = m.path.shift();
      const busy = occupiedBy(nx, m);
      if (busy || !walk(nx)) m.path = [];
      else { m.face = upx(nx.c, nx.r).x >= upx(m.c, m.r).x ? 1 : -1; m.anim = { to: { c: nx.c, r: nx.r }, t: 0, dur: 60 / d.speed * cost(nx) }; }
    }
    if (!m.anim) return;
    m.anim.t += dt / m.anim.dur; m.stride += dt * 90;
    if (m.anim.t >= 1) { m.c = m.anim.to.c; m.r = m.anim.to.r; m.anim = null; }
  }
  const herName = (id) => AB.ID.get(id).name;
  const fem = (id) => id === 'CHAR-002' || id === 'CHAR-003';
  function hurtSquad(s, dmg, m, opt = {}) {
    if (s.ally) { const r = Math.max(1, Math.round(dmg * (1 - (s.d.armor || 0)))); s.hp -= r; if (repOn()) repRow(s).taken += r; m.hitSq = s; m.hitAt = time; /* №190: союзника бьют — отряд рядом ответит */ s.flash = 0.25; floatText(posOf(s), `−${r}`, '#ff8a6a'); if (s.hp <= 0) { s.hp = 0; s.state = 'home'; } return; }   // №157: союзник
    const c = AB.Chars.get(s.id), v = VEFF(s.vehicle) || { armor: 0 }, d = NK(m);
    const mul = AB.Damage ? AB.Damage.mult(d.dtype, v.armorType) : 1;          // №152: тип урона × защита
    let a, k = 1;
    if ((a = hasAb(s, 'plates')) && (d.reach || 1) > 1) k *= a.mult;            // №157: бронелисты — меньше урона издалека
    let real = Math.max(1, Math.round(dmg * mul * k * (1 - v.armor) / (v.hpK || 1)));   // №161: прочность деталей
    m.hitSq = s; m.hitAt = time;                                      // №196: кто бил — запомнить сразу (даже если всё погасил щит)
    if (!s.target && !s.siege && s.state === 'out' && (s.mode === 'auto' || (!s.anim && !s.path.length))) s.target = m;   // №196: стоит или в автобое — сразу в ответ
    if (s.shield > 0) { const take = Math.min(s.shield, real); s.shield -= take; real -= take; if (repOn()) repRow(s).shield += take; floatText(posOf(s), `🛡−${take}`, '#8cff9a'); if (!real) { s.flash = 0.1; return; } }   // №157: щит гасит урон
    AB.Bus.emit('surface:hit', { npc: false });
    if (repOn()) repRow(s).taken += real;
    m.hitSq = s; m.hitAt = time;                                      // №184: кто бил этого героя — ему можно ответить
    if (c) c.hp = Math.max(0, c.hp - real);
    s.flash = 0.25; floatText(posOf(s), `−${real}${mul >= 1.24 ? '!' : ''}`, mul >= 1.24 ? '#ff5a3a' : mul <= 0.76 ? '#9fb4bc' : '#ff8a6a');
    if (!opt.dot && m.hp > 0 && (d.reach || 1) <= 1 && (a = hasAb(s, 'hotarmor'))) hurtMob(m, dmg * a.part, s, { reflect: true });        // раскалённая броня
    if (!opt.dot && m.hp > 0 && (a = hasAb(s, 'riposte')) && Math.random() < a.chance && dist(curCell(s), curCell(m)) <= (v.reach || 1)) { floatText(posOf(s), 'ответ!', '#ffd27a'); hurtMob(m, v.attack, s); }
    if (s.mode === 'auto' && !s.target && !s.siege) s.target = m;          // автобой: ответный удар
    barSig = '';
    if (c && c.hp <= 0) squadDown(s);
  }
  // костюм разбит — герой очнулся в батискафе (как на дне), здоровье восстановлено
  function squadDown(s) {
    const c = AB.Chars.get(s.id), max = (AB.ID.get(s.id).stats || {}).maxHp || 100;
    if (c) { c.hp = max; c.dead = false; }
    for (const m of mobs) if (m.aggro === s) m.aggro = null;
    Object.assign(s, { state: 'home', path: [], anim: null, target: null, zone: null, siege: null, pick: null, shield: 0, poison: null, c: base.c, r: base.r });
    if (sel === s.id) sel = 'base';
    if (repOn()) { repRow(s); rep.down.push(s.id); }
    broken[s.vehicle] = true;                                   // №157: технику восстанавливают за энергию отряда
    barSig = ''; save();
    say(`${herName(s.id)}: ${(AB.VEHICLES[s.vehicle] || {}).name || 'костюм'} разбит — очнул${fem(s.id) ? 'ась' : 'ся'} в батискафе. Восстановить — ⚡${E().restore}`);
  }
  function hurtMob(m, dmg, s, opt = {}) {
    if (m.hp <= 0) return;
    const d = NK(m), v = s.ally ? { dtype: s.dtype } : AB.VEHICLES[s.vehicle] || {}, dt = opt.dot ? 'thermal' : v.dtype, mul = AB.Damage ? AB.Damage.mult(dt, d.armorType) : 1;   // №152
    const pierce = !s.ally && hasAb(s, 'thermite');                 // №157: термит не замечает броню цели
    let real = Math.max(1, Math.round(dmg * mul * (1 - (pierce ? 0 : d.armor || 0))));
    if (m.shield > 0) { const take = Math.min(m.shield, real); m.shield -= take; real -= take; if (!real) { floatText(posOf(m), '🛡', '#5ee6ff'); m.aggro = m.aggro || s; return; } }   // щит Архива
    AB.Bus.emit('surface:hit', { npc: true });
    if (repOn()) { const r = repRow(s); r.dealt += Math.min(real, m.hp); if (m.hp - real <= 0) r.kills++; }   // №162
    m.hp -= real; m.flash = 0.25; floatText(posOf(m), `−${real}${mul >= 1.24 ? '!' : ''}`, mul >= 1.24 ? '#ffb040' : mul <= 0.76 ? '#9fb4bc' : '#ffe2a8');
    for (const o of alive()) if (o.grp === m.grp && !o.aggro && !o.boss) { o.aggro = s; if (o.patrol) o.home = { c: curCell(o).c, r: curCell(o).r }; }   // за своего вступается вся группа
    m.aggro = m.aggro || s;
    if (m.hp <= 0) mobDead(m);
  }
  function mobDead(m) {
    m.hp = 0; m.deadT = 1.4; m.path = []; m.anim = null; m.burn = null;
    for (const q of squads) if (q.target === m) q.target = null;
    if (m.boss) { bossDead(m); return; }
    const d = NK(m), got = [], items = [];
    // №157: добыча падает на землю — поднять за энергию отряда
    for (const [item, n, ch] of d.reward) if (Math.random() < ch) { items.push([item, n]); got.push(`${AB.ID.get(item).name} ×${n}`); }
    if (AB.VehMods) for (const id of AB.VehMods.roll(AB.PART_DROPS.npc)) { items.push([id, 1]); got.push(AB.ID.get(id).name); }   // №161: изредка — деталь
    dropLoot(m, items, null);
    floatText(posOf(m), got.length ? 'добыча на земле' : d.name, '#ffd27a');
    say(`${d.name} повержен. ${got.length ? `На земле: ${got.join(', ')} — поднять за ⚡${E().pick}` : 'Ничего не выпало'}`);
    AB.Bus.emit('surface:kill', { kind: m.kind, reward: got });
    if (m.camp) { if (!campLeft(m.camp)) campCleared(m.camp); return; }
    if (m.raid) return;                                             // №164: набег — без возрождения
    if (m.patrol) { if (!alive().some((o) => o.grp === m.grp)) patrolT.push({ gi: m.patrol.gi, t: PAT().respawn }); }
    else if (!alive().some((o) => o.grp === m.grp)) respawnT.push(NPC().respawn);
  }
  // ---------- №154: патрули фракций ----------
  let patrolT = [];
  const siteCell = (key) => { const st = sites.find((x) => x.key === key); return st ? cell(st.c, st.r) : null; };
  function spawnPatrol(gi) {
    const G = PAT().groups[gi], d = PAT().kinds[G.kind], start = siteCell(G.route[0]); if (!start) return;
    const around = (c0) => cells.filter((x) => walk(x) && !occupiedBy(x, null) && dist(x, c0) >= 1 && dist(x, c0) <= 2).sort((a, b) => dist(a, c0) - dist(b, c0));
    const grp = ++mobSeq, spots = around(start);   // №182: выходят рядом со столицей, не в ней
    for (let i = 0; i < G.n && i < spots.length; i++) {
      mobs.push({ id: `pat${++mobSeq}`, kind: G.kind, grp, c: spots[i].c, r: spots[i].r, home: { c: spots[i].c, r: spots[i].r }, hp: d.hp, max: d.hp,
        aggro: null, atkT: Math.random(), atk: null, path: [], anim: null, face: 1, stride: 0, flash: 0, wanderT: 0, repath: 0, deadT: 0,
        patrol: { gi, lead: i === 0, wp: 1 } });
    }
  }
  function spawnPatrols() { patrolT = []; if (!PAT()) return; PAT().groups.forEach((_, gi) => spawnPatrol(gi)); }
  // идти по маршруту: ведущий — к следующей точке; остальные — следом, рядом с ведущим
  function patrolMove(m, dt) {
    if (m.anim || m.path.length) return;
    const G = PAT().groups[m.patrol.gi];
    if (m.patrol.lead) {
      let tgt = siteCell(G.route[m.patrol.wp % G.route.length]);
      if (tgt && dist(curCell(m), tgt) <= 1) { m.patrol.wp++; tgt = siteCell(G.route[m.patrol.wp % G.route.length]); m.wanderT = 2 + Math.random() * 3; }
      if ((m.wanderT -= dt) > 0) return;
      if (tgt) m.path = pathTo(curCell(m), (x) => dist(x, tgt) <= 1) || [];
    } else {
      const L = mobs.find((o) => o.grp === m.grp && o.hp > 0 && o.patrol && o.patrol.lead) || mobs.find((o) => o.grp === m.grp && o.hp > 0 && o !== m);
      if (!L) return;
      if (!L.patrol.lead) L.patrol.lead = true;                       // ведущий пал — ведёт следующий
      if (dist(curCell(m), curCell(L)) > 1) m.path = (pathTo(curCell(m), (x) => dist(x, curCell(L)) <= 1) || []).slice(0, 3);
    }
  }
  // снаряды патрулей: пуля / луч / спора; урон — по прилёте
  const shots = [];
  function patrolShot(m, t) {
    const d = NK(m), a = posOf(m), b = posOf(t), len = Math.hypot(b.x - a.x, b.y - a.y) / S0;
    shots.push({ kind: d.shot, from: { x: a.x + (b.x > a.x ? 8 : -8), y: a.y - S0 * 0.55 }, to: () => { const q = posOf(t); return { x: q.x, y: q.y - S0 * 0.4 }; }, t: 0, dur: d.shot === 'beam' ? 0.12 : d.shot === 'spore' ? 0.18 + len * 0.09 : 0.08 + len * 0.04,
      hit: () => { if (t.state === 'out' && m.hp > 0) hurtSquad(t, d.attack, m); } });
  }
  // №157: выстрел новой техники (урон уже нанесён — это только след): луч, трассер, огонь
  function vehShot(s, m) {
    const a = posOf(s), b = posOf(m), cls = VD(s).class, kind = cls === 'energy' ? 'zap' : cls === 'thermal' ? 'flame' : 'bullet';
    shots.push({ kind, from: { x: a.x, y: a.y - S0 * 0.5 }, to: () => { const q = posOf(m); return { x: q.x, y: q.y - S0 * 0.35 }; }, t: 0, dur: 0.12, hit: () => {} });
  }
  function shotsTick(dt) { for (let i = shots.length - 1; i >= 0; i--) { const sh = shots[i]; sh.t += dt; if (sh.t >= sh.dur && !sh.done) { sh.done = true; sh.hit(); } if (sh.t > sh.dur + 0.25) shots.splice(i, 1); } }
  function drawShots() {
    for (const sh of shots) {
      const to = sh.to(), u = Math.min(1, sh.t / sh.dur), fade = sh.t > sh.dur ? 1 - (sh.t - sh.dur) / 0.25 : 1;
      if (sh.kind === 'swave' || sh.kind === 'swavehit') {       // №189: волна самурая
        if (sh.t < 0) continue;
        const W2 = WAVE.set, H0 = S0 * 1.25;
        const put = (im, x, y, ang, sc, a) => { const h = H0 * sc, w = im.naturalWidth * h / im.naturalHeight; g.save(); g.globalAlpha = a; g.globalCompositeOperation = 'lighter'; g.translate(x, y); g.rotate(ang); g.drawImage(im, -w * 0.6, -h / 2, w, h); g.restore(); };
        if (sh.kind === 'swavehit') { const i = Math.min(5, Math.floor(sh.t / sh.dur * 6)); if (sh.t < sh.dur) put(W2.hit[i], sh.from.x + S0 * 0.3, sh.from.y, 0, 1.3, 1); continue; }
        if (sh.done) continue;
        const u2 = Math.min(1, sh.t / sh.dur), x0 = sh.from.x + (to.x - sh.from.x) * u2, y0 = sh.from.y + (to.y - sh.from.y) * u2, ang = Math.atan2(to.y - sh.from.y, to.x - sh.from.x);
        if (sh.t < 0.15) put(W2.launch[Math.min(5, Math.floor(sh.t / 0.15 * 6))], sh.from.x, sh.from.y, ang, 1, 1);       // вспышка у клинка
        if (sh.t > 0.05) put(W2.fly[Math.floor(time * 18) % 6], x0, y0, ang, 0.9 + 0.2 * u2, Math.min(1, sh.t / 0.08));   // летит к цели
        continue;
      }
      if (sh.kind === 'crescent') {                // №186: светящийся след полумесяца перед мечником
        if (sh.t < 0) continue;
        const u2 = Math.min(1, sh.t / 0.3), a2 = 1 - u2, F = sh.from, R0 = S0 * 1.35, base0 = -1.9;
        g.save(); g.translate(F.x, F.y); g.scale(F.f, 0.62);             // смотрит влево — полумесяц зеркально
        for (let i = 0; i < 6; i++) {
          const w = (6 - i) * 3.2 * (0.5 + a2), r = R0 - i * 3;
          g.strokeStyle = i < 2 ? `rgba(255,255,255,${0.9 * a2})` : `rgba(140,220,255,${0.5 * a2 * (1 - i / 6)})`; g.lineWidth = w;
          g.beginPath(); g.arc(0, 0, r, base0, base0 + 2.3 * (0.4 + 0.6 * Math.min(1, u2 * 3))); g.stroke();
        }
        g.restore();
        if (sh.t > 0.3) sh.done = true;
        continue;
      }
      if (sh.kind === 'impact') {                  // №181: удар кулаком — ударная волна и искры
        if (!sh.done) continue;
        const u2 = Math.min(1, (sh.t - sh.dur) / 0.25), a2 = 1 - u2;
        g.strokeStyle = `rgba(255,230,180,${0.9 * a2})`; g.lineWidth = 4 * a2 + 1; g.beginPath(); g.ellipse(to.x, to.y, 8 + u2 * 34, 5 + u2 * 20, 0, 0, 7); g.stroke();
        g.fillStyle = `rgba(255,250,220,${0.8 * a2})`; g.beginPath(); g.arc(to.x, to.y, 10 * a2 + 2, 0, 7); g.fill();
        for (let i = 0; i < 9; i++) { const an = i * 0.7 + sh.dur * 7, r1 = 6 + u2 * 30, r2 = r1 + 10 * a2; g.strokeStyle = `rgba(255,${170 + (i % 3) * 30},70,${a2})`; g.lineWidth = 2; g.beginPath(); g.moveTo(to.x + Math.cos(an) * r1, to.y + Math.sin(an) * r1 * 0.6); g.lineTo(to.x + Math.cos(an) * r2, to.y + Math.sin(an) * r2 * 0.6); g.stroke(); }
        continue;
      }
      if (sh.kind === 'zap') {                     // №157: разряд — ломаная молния
        g.globalAlpha = fade; g.strokeStyle = 'rgba(140,230,255,.95)'; g.lineWidth = 2; g.beginPath(); g.moveTo(sh.from.x, sh.from.y);
        for (let i = 1; i < 5; i++) { const u2 = i / 5; g.lineTo(sh.from.x + (to.x - sh.from.x) * u2 + (Math.random() - 0.5) * 10, sh.from.y + (to.y - sh.from.y) * u2 + (Math.random() - 0.5) * 10); }
        g.lineTo(to.x, to.y); g.stroke(); g.globalAlpha = 1; continue;
      }
      if (sh.kind === 'flame') {                   // №157: струя огня
        g.globalAlpha = fade * 0.85; for (let i = 0; i < 6; i++) { const u2 = i / 6; g.fillStyle = i % 2 ? 'rgba(255,200,80,.9)' : 'rgba(255,100,40,.9)'; g.beginPath(); g.arc(sh.from.x + (to.x - sh.from.x) * u2, sh.from.y + (to.y - sh.from.y) * u2, 2 + u2 * 5, 0, 7); g.fill(); }
        g.globalAlpha = 1; continue;
      }
      if (sh.kind === 'beam') {                    // луч Наследников: сразу до цели, гаснет
        g.globalAlpha = fade; g.strokeStyle = 'rgba(255,70,110,.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(sh.from.x, sh.from.y); g.lineTo(to.x, to.y); g.stroke();
        g.strokeStyle = 'rgba(255,220,230,.9)'; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
      } else if (sh.kind === 'spore') {            // споры Единого: дуга, зелёный сгусток
        if (sh.done) { g.globalAlpha = fade; g.fillStyle = 'rgba(150,255,120,.5)'; g.beginPath(); g.arc(to.x, to.y, 10 * (2 - fade), 0, 7); g.fill(); g.globalAlpha = 1; continue; }
        const x = sh.from.x + (to.x - sh.from.x) * u, y = sh.from.y + (to.y - sh.from.y) * u - Math.sin(u * Math.PI) * S0 * 0.8;
        g.fillStyle = 'rgba(150,255,120,.9)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.fillStyle = 'rgba(240,140,210,.8)'; g.beginPath(); g.arc(x + 2, y - 1, 1.8, 0, 7); g.fill();
      } else {                                     // пуля кланов: трассер
        if (sh.done) continue;
        const x = sh.from.x + (to.x - sh.from.x) * u, y = sh.from.y + (to.y - sh.from.y) * u, dx = (to.x - sh.from.x), dy = (to.y - sh.from.y), n = Math.hypot(dx, dy) || 1;
        g.strokeStyle = 'rgba(255,220,120,.95)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - dx / n * 10, y - dy / n * 10); g.lineTo(x, y); g.stroke();
      }
    }
  }
  function mobTick(m, dt) {
    const d = NK(m);
    m.flash = Math.max(0, m.flash - dt); m.atkT = Math.max(0, m.atkT - dt);
    if (m.atk) { m.atk.t += dt; if (m.atk.t > 0.6) m.atk = null; }
    if (m.stunT > 0) { m.stunT -= dt; return; }                     // №157: оглушён
    if (m.boss) { bossTick(m, dt); return; }                        // №157: большой моб стоит на месте
    if (m.aggro && m.aggro.ally && m.aggro.state !== 'out') m.aggro = null;
    // №169 (решение автора: «NPC первыми не атакуют отряд»): гарнизоны, набеги, патрули и большие мобы
    // сами не нападают — только отвечают, если их ударили (hurtMob)
    if (m.raid && !m.aggro) { raidMove(m, dt); mobStep(m, dt); return; }   // №164: набег идёт к точке
    const home = cell(m.home.c, m.home.r), t = m.aggro, reach = d.reach || 1;
    if (m.patrol && !t) { patrolMove(m, dt); mobStep(m, dt); return; }   // №154: патруль идёт своим маршрутом
    if (m.patrol && t && (t.state === 'home' || dist(curCell(m), home) > 8)) { m.aggro = null; m.path = []; mobStep(m, dt); return; }
    if (t && !m.patrol && (t.state === 'home' || dist(curCell(m), home) > 7)) {      // ушёл в базу или увёл далеко — назад, домой
      m.aggro = null; m.path = curCell(m) === home ? [] : pathTo(curCell(m), (x) => x === home) || [];
    } else if (t) {
      if (canShoot(curCell(m), curCell(t), reach)) {
        if (!m.anim && m.path.length) m.path = [];
        else if (!m.anim && m.atkT <= 0 && (reach > 1 || !t.anim)) {
          m.atkT = d.rate * (m.slowT > 0 ? 1.3 : 1); m.atk = { t: 0 }; m.face = posOf(t).x >= posOf(m).x ? 1 : -1;
          if (d.shot) patrolShot(m, t); else hurtSquad(t, d.attack, m);   // №154: дальний — снаряд, урон по прилёте
        }
      } else if (!m.anim && ((m.repath -= dt) <= 0 || !m.path.length)) {
        m.repath = 0.6; m.path = pathTo(curCell(m), (x) => canShoot(x, curCell(t), reach)) || [];
      }
    } else if (!m.anim && !m.path.length && (m.wanderT -= dt) <= 0) {      // бродит возле своего места
      m.wanderT = 4 + Math.random() * 8;
      const opts = nbrs(curCell(m)).filter((x) => passable(x) && !mobAt(x) && !x.site && x !== curCell(base) && dist(x, home) <= (m.camp ? 1 : 2));
      if (opts.length) m.path = [opts[Math.floor(Math.random() * opts.length)]];
    }
    mobStep(m, dt);
  }
  function squadTick(s, dt) {
    s.flash = Math.max(0, (s.flash || 0) - dt); s.atkT = Math.max(0, (s.atkT || 0) - dt);
    if (s.atk) { s.atk.t += dt; if (s.atk.t > 0.8) s.atk = null; }
    if (s.state !== 'out') return;
    if (s.anim) s.moved = true;                                     // №157: «с разбега» — первый удар после движения
    if (s.pick) { const L = s.pick, k = cell(L.c, L.r); if (!loot.includes(L)) s.pick = null; else if (!s.anim && !s.path.length && dist(curCell(s), k) <= 1) pickLoot(s, L); }
    if (s.siege && siegeStep(s, dt)) return;                         // №157: осада — сперва встать кольцом
    if (s.target && s.target.hp <= 0) { s.target = null; if (s.mode === 'auto' && s.zone && curCell(s) !== s.zone) s.resume = true; }
    // №184: после цели — никого сам не трогает; в ответ бьёт тех, кто напал на него самого.
    // №190: и тех, кто бьёт любого союзника (героя или армию) и стоит в зоне поражения этого героя — даже стоя на месте
    const idle = !s.anim && !s.path.length;
    if (!s.target && (s.mode === 'auto' || idle)) {
      const myReach = (VD(s).reach || 1);
      // №192: «Автобой» в точку — по пути бьёт всех враждебных (злых на отряд или союзников, красный «!») в своей зоне поражения; нейтральных не трогает
      const hostile = (m) => m.aggro && (m.aggro.kind === 'squad' || m.aggro.ally);
      const foe = alive().filter((m) => (m.hitSq && time - (m.hitAt || 0) < 8 && (m.hitSq === s ? dist(curCell(m), curCell(s)) <= Math.max(3, (NK(m).reach || 1) + 1) : canShoot(curCell(s), curCell(m), myReach)))
        || (s.mode === 'auto' && s.zone && hostile(m) && canShoot(curCell(s), curCell(m), Math.max(myReach, 2))))
        .sort((a, b) => (a.hitSq === s ? 0 : 1) - (b.hitSq === s ? 0 : 1) || dist(curCell(a), curCell(s)) - dist(curCell(b), curCell(s)))[0];
      if (foe) { s.target = foe; if (s.zone) s.resume = true; }
    }
    const m = s.target;
    if (!m && !inFight(s)) s.inFightNow = false;
    if (!m) { if (s.resume && !s.anim) { s.resume = false; if (s.zone && curCell(s) !== s.zone) goTo(s, s.zone, true); } return; }
    const v = VEFF(s.vehicle) || { attack: 10, rate: 1.2, reach: 1 };
    if (!s.inFightNow) { s.inFightNow = true; if (v.shield0) { giveShield(s, v.shield0); floatText(posOf(s), `🛡 +${v.shield0}`, '#8cff9a'); } }   // №161: чип щита — в начале боя
    if (canShoot(curCell(s), curCell(m), v.reach)) {
      // №146: вне базы в движении не атакуют — сначала остановка, удар только стоя
      if (s.anim) return;
      if (s.path.length) { s.path = []; return; }
      if (s.atkT <= 0) {
        s.atkT = v.rate; s.atk = { t: 0 }; s.face = posOf(m).x >= posOf(s).x ? 1 : -1;
        const hit = strike(s, m);                                    // №157: сила удара со способностями
        // экзокостюм — выстрел сгустком: урон — когда сгусток долетит; остальная техника бьёт сразу
        if (v.fx && vfx) vfx.shot(v.fx, () => muzzleOf(s), () => { const p = posOf(m); return { x: p.x, y: p.y - S0 * 0.35 }; }, S0, () => { if (m.hp > 0) { hurtMob(m, hit.dmg, s); afterHit(s, m); } });
        else if (v.anim && v.anim.kind === 'rig' && v.anim.rig.arms3 && (v.reach <= 1 || v.sword)) {   // №181: удар всем телом — урон в момент попадания
          const cl = hasAb(s, 'cleave');
          const doHit = () => {
            if (m.hp > 0 && s.state === 'out') {
              hurtMob(m, hit.dmg, s); afterHit(s, m); shakeT = 0.22;
              // №186: «Полумесяц» — ещё двое рядом с целью получают по 50%
              if (cl) for (const o of alive().filter((x) => x !== m && dist(curCell(x), curCell(m)) <= 1).sort((a, b) => dist(curCell(a), curCell(s)) - dist(curCell(b), curCell(s))).slice(0, cl.n)) { hurtMob(o, hit.dmg * cl.part, s); floatText(posOf(o), 'рассечён', '#bfefff'); }
            }
          };
          if (v.sword && WAVE.ready()) {                              // №189: меч рождает волну-полумесяц — летит к цели и взрывается
            const sp = posOf(s), f0 = posOf(m).x >= sp.x ? 1 : -1, from = { x: sp.x + f0 * S0 * 0.6, y: sp.y - S0 * 0.75 };
            const tgt = () => { const q = posOf(m); return { x: q.x, y: q.y - S0 * 0.45 }; }, d0 = Math.hypot(tgt().x - from.x, tgt().y - from.y) / S0;
            shots.push({ kind: 'swave', from, to: tgt, t: -0.26, dur: 0.14 + d0 * 0.09, hit: () => { doHit(); const q = tgt(); shots.push({ kind: 'swavehit', from: q, to: () => q, t: 0, dur: 0.42, hit: () => {} }); } });
          } else shots.push({ kind: 'impact', from: posOf(m), to: () => { const q = posOf(m); return { x: q.x, y: q.y - S0 * 0.45 }; }, t: 0, dur: 0.32, hit: doHit });
        }
        else { if (v.reach > 1) vehShot(s, m); hurtMob(m, hit.dmg, s); afterHit(s, m); }
      }
    } else if (!s.anim && ((s.repath = (s.repath || 0) - dt) <= 0 || !s.path.length)) {
      s.repath = 0.6; s.path = pathTo(curCell(s), (x) => canShoot(x, curCell(m), v.reach)) || [];   // №185: подойти туда, откуда видно
    }
  }
  function combatTick(dt) {
    for (const m of mobs) if (m.hp > 0) mobTick(m, dt); else m.deadT -= dt;
    for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].hp <= 0 && mobs[i].deadT <= 0) mobs.splice(i, 1);
    for (const s of squads) squadTick(s, dt);
    // №157: способности, союзники, большие мобы, добыча, осады
    abilityTick(dt); lootTick(dt); pointsTick(dt);
    if (repOn() && time - rep.t0 > 2 && !fieldSquads().length) repEnd('Отступление');   // №162: все в капсуле или пали
    for (const a of allies) if (a.state === 'out') { a.life -= dt; if (a.life <= 0) a.state = 'home'; else allyTick(a, dt); }
    for (let i = allies.length - 1; i >= 0; i--) if (allies[i].state !== 'out') allies.splice(i, 1);
    allyCd = Math.max(0, allyCd - dt);
    for (const q of squads) if (q.siege) q.siege.t += dt / squads.filter((x) => x.siege === q.siege).length;
    for (let i = bossT.length - 1; i >= 0; i--) { bossT[i].t -= dt; if (bossT[i].t <= 0) { const sp = bossT[i].spot; bossT.splice(i, 1); spawnBoss(sp); } }
    for (let i = respawnT.length - 1; i >= 0; i--) { respawnT[i] -= dt; if (respawnT[i] <= 0) { respawnT.splice(i, 1); spawnGroup(); } }
    shotsTick(dt);
    for (let i = patrolT.length - 1; i >= 0; i--) { patrolT[i].t -= dt; if (patrolT[i].t <= 0) { const gi = patrolT[i].gi; patrolT.splice(i, 1); spawnPatrol(gi); say(`${PAT().kinds[PAT().groups[gi].kind].squad}: новый отряд вышел на маршрут`); } }
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
    const NKd = NK(m), K = NKd.look || m.kind, col = NKd.col || {};
    if (m.boss) g.scale(NKd.size, NKd.size);                        // №157: большие мобы — крупнее по уровню
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, 2, 11, 4, 0, 0, 7); g.fill();
    if (K === 'golem') {                             // Каменный страж: груда скал, горящие глаза
      g.fillStyle = '#5a5650'; g.fillRect(-9, -10, 6, 10); g.fillRect(3, -10, 6, 10);
      g.fillStyle = '#7a756c'; g.beginPath(); g.moveTo(-14, -10); g.lineTo(-12, -30); g.lineTo(0, -36); g.lineTo(12, -30); g.lineTo(14, -10); g.fill();
      g.fillStyle = '#6a655c'; g.beginPath(); g.arc(-15, -24, 6, 0, 7); g.arc(15, -24, 6, 0, 7); g.fill();
      g.fillStyle = `rgba(255,160,60,${0.7 + 0.3 * Math.sin(time * 3)})`; g.fillRect(-6, -29, 4, 3); g.fillRect(2, -29, 4, 3);
      g.strokeStyle = '#4a463e'; g.lineWidth = 1; g.beginPath(); g.moveTo(-8, -20); g.lineTo(-2, -16); g.lineTo(4, -22); g.stroke();
    } else if (K === 'archive') {                    // Страж Архива: боевой автомат на гусеницах, излучатель
      g.fillStyle = '#2a2e34'; g.beginPath(); g.roundRect(-14, -8, 28, 8, 3); g.fill();
      g.fillStyle = '#7a848e'; g.beginPath(); g.roundRect(-11, -26, 22, 18, 4); g.fill(); g.fillStyle = '#4a5058'; g.fillRect(-11, -18, 22, 2);
      g.fillStyle = '#5a6470'; g.beginPath(); g.ellipse(0, -30, 8, 5, 0, 0, 7); g.fill();
      g.fillStyle = `rgba(255,70,110,${0.6 + 0.4 * Math.sin(time * 5)})`; g.beginPath(); g.arc(0, -30, 2.5, 0, 7); g.fill();
      g.fillStyle = '#3a4048'; g.fillRect(f > 0 ? 9 : -21, -22, 12, 4);
      if (m.shield > 0) { g.strokeStyle = `rgba(94,230,255,${0.5 + 0.3 * Math.sin(time * 6)})`; g.lineWidth = 2; g.beginPath(); g.ellipse(0, -16, 20, 24, 0, 0, 7); g.stroke(); }
    } else if (K === 'devourer') {                   // Цветок-пожиратель: бутон на стебле, лепестки, пасть
      g.strokeStyle = '#4a6a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-4, -12, 0, -20); g.stroke();
      for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2 + Math.sin(time + i) * 0.15; g.fillStyle = i % 2 ? '#b24a8e' : '#9a3a7a'; g.beginPath(); g.ellipse(Math.cos(an) * 10, -24 + Math.sin(an) * 7, 8, 4, an, 0, 7); g.fill(); }
      const op = 2 + 2 * Math.abs(Math.sin(time * 2)); g.fillStyle = '#3a1a2a'; g.beginPath(); g.ellipse(0, -24, 6, op, 0, 0, 7); g.fill();
      for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(150,255,120,${0.4 + 0.4 * Math.sin(time * 3 + i)})`; g.beginPath(); g.arc(-12 + i * 6, -36 - (i % 2) * 4, 1.8, 0, 7); g.fill(); }
    } else if (K === 'samurai') {                           // стрелок клана: пластинчатый доспех, рогатый шлем, винтовка
      g.fillStyle = '#2a2224'; g.fillRect(-5, -9 - bob, 4, 9); g.fillRect(1, -9 - bob, 4, 9);
      g.fillStyle = '#7a2a24'; g.fillRect(-8, -22 - bob, 16, 14); g.fillStyle = '#3a3036'; for (let i = 0; i < 3; i++) g.fillRect(-8, -20 + i * 4 - bob, 16, 1.5);
      g.fillStyle = '#c9a24a'; g.fillRect(-9, -23 - bob, 18, 3);
      g.fillStyle = '#2a2224'; g.beginPath(); g.arc(0, -28 - bob, 5.5, Math.PI, 0); g.fill(); g.fillRect(-6, -28 - bob, 12, 3);
      g.strokeStyle = '#d9a23e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-4, -32 - bob); g.lineTo(-7, -37 - bob); g.moveTo(4, -32 - bob); g.lineTo(7, -37 - bob); g.stroke();
      g.strokeStyle = '#4a4038'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-2 * f, -16 - bob); g.lineTo(16 * f, -19 - bob); g.stroke();
    } else if (K === 'cyborg') {                     // боевой киборг: металлический корпус, красный визор, излучатель
      g.fillStyle = '#4a5058'; g.fillRect(-5, -9 - bob, 3, 9); g.fillRect(2, -9 - bob, 3, 9);
      g.fillStyle = '#8a949e'; g.beginPath(); g.roundRect(-8, -24 - bob, 16, 16, 4); g.fill(); g.fillStyle = '#5a6470'; g.fillRect(-8, -16 - bob, 16, 2);
      g.fillStyle = '#6a747e'; g.beginPath(); g.roundRect(-5, -32 - bob, 10, 8, 3); g.fill();
      g.fillStyle = `rgba(255,70,110,${0.7 + 0.3 * Math.sin(time * 6)})`; g.fillRect(-4 + f, -29 - bob, 8, 2);
      g.fillStyle = '#3a4048'; g.fillRect(f > 0 ? 6 : -16, -19 - bob, 10, 4); g.fillStyle = 'rgba(255,70,110,.9)'; g.beginPath(); g.arc(f > 0 ? 16 : -16, -17 - bob, 2, 0, 7); g.fill();
    } else if (K === 'warden') {                     // страж Единого: высокий, в наростах, светится
      g.fillStyle = '#3a4a3a'; g.fillRect(-4, -9 - bob, 3, 9); g.fillRect(1, -9 - bob, 3, 9);
      g.fillStyle = '#5a6a4a'; g.beginPath(); g.ellipse(0, -21 - bob, 8, 13, 0, 0, 7); g.fill();
      g.fillStyle = '#7a8a62'; g.beginPath(); g.arc(1 * f, -36 - bob, 5.5, 0, 7); g.fill();
      for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(${i % 2 ? '240,140,210' : '150,255,140'},${0.55 + 0.35 * Math.sin(time * 3 + i + m.grp)})`; g.beginPath(); g.arc(-5 + i * 2.5, -30 + (i % 3) * 7 - bob, 2, 0, 7); g.fill(); }
      g.strokeStyle = '#6a5a6a'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, -26 - bob); g.quadraticCurveTo(-12, -34 - bob, -9, -42 - bob); g.moveTo(6, -26 - bob); g.quadraticCurveTo(12, -34 - bob, 9, -42 - bob); g.stroke();
    } else if (K === 'raider') {
      g.fillStyle = '#3a2c1c'; g.fillRect(-5, -8 - bob, 3, 8); g.fillRect(2, -8 - bob, 3, 8);
      g.fillStyle = col.robe || '#b88a50'; g.beginPath(); g.moveTo(-8, -6 - bob); g.lineTo(8, -6 - bob); g.lineTo(5, -24 - bob); g.lineTo(-5, -24 - bob); g.fill();
      g.fillStyle = col.sash || '#a3302a'; g.fillRect(-6, -14 - bob, 12, 3);
      g.fillStyle = '#c08a5a'; g.beginPath(); g.arc(0, -28 - bob, 5, 0, 7); g.fill();
      g.fillStyle = col.head || '#e8dcc0'; g.beginPath(); g.ellipse(0, -31 - bob, 6, 3.5, 0, 0, 7); g.fill();
      g.strokeStyle = '#d8dde0'; g.lineWidth = 2; g.beginPath(); g.moveTo(5 * f, -16 - bob); g.lineTo((m.atk ? 18 : 10) * f, (m.atk ? -22 : -30) - bob); g.stroke();
    } else if (K === 'shellback') {
      g.fillStyle = col.legs || '#5a4430'; for (const lx of [-9, -3, 3, 9]) g.fillRect(lx - 1.5, -6, 3, 7);
      g.fillStyle = col.shell || '#8a6a48'; g.beginPath(); g.ellipse(0, -11 - bob, 15, 10, 0, Math.PI, 0); g.fill();
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
    if (m.burn) { for (let i = 0; i < 3; i++) { g.fillStyle = i % 2 ? 'rgba(255,200,80,.85)' : 'rgba(255,100,40,.85)'; g.beginPath(); g.arc(-6 + i * 6, -12 - ((time * 30 + i * 9) % 16), 2.5, 0, 7); g.fill(); } }
    if (m.stunT > 0) { g.fillStyle = '#9fe7ff'; for (let i = 0; i < 3; i++) { const an = time * 5 + i * 2.1; g.beginPath(); g.arc(Math.cos(an) * 8, -36 + Math.sin(an) * 2, 1.8, 0, 7); g.fill(); } }
    if (m.flash > 0) { const fr = g.createRadialGradient(0, -14, 2, 0, -14, 22); fr.addColorStop(0, `rgba(255,90,60,${0.55 * m.flash / 0.25})`); fr.addColorStop(1, 'rgba(255,90,60,0)'); g.globalCompositeOperation = 'lighter'; g.fillStyle = fr; g.beginPath(); g.arc(0, -14, 22, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }   // №147: вспышка ранения — по фигуре, без прямоугольника
    g.restore();
    if (m.hp > 0 && m.patrol && m.patrol.lead) {      // №154: флажок стороны над ведущим патруля
      const fc = { east: '#c0503a', desert: '#9aa4ab', organic: '#6aaa5a' }[NK(m).side] || '#ddd', fy = y - S0 * 1.55;
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 9, y - S0 * 0.9); g.lineTo(x + 9, fy); g.stroke();
      g.fillStyle = fc; g.beginPath(); g.moveTo(x + 9, fy); g.lineTo(x + 19 + Math.sin(time * 4) * 1.5, fy + 3); g.lineTo(x + 9, fy + 7); g.fill();
    }
    if (m.ally && m.hp > 0) { hpBar(x, y - S0 * 1.25, m.hp / m.max, '#8cff9a'); g.fillStyle = '#8cff9a'; g.font = '700 11px "Oswald", sans-serif'; g.textAlign = 'center'; g.fillText('✦', x, y - S0 * 1.35); return; }
    if (m.boss && m.hp > 0) {                        // №157: у большого моба — имя, уровень и полоса здоровья всегда
      const by = y - S0 * (0.9 + 0.55 * NK(m).size), k2 = kScale();
      hpBar(x, by, m.hp / m.max, m.aggro ? '#ff5a4a' : '#e0a040');
      g.font = `700 ${10 * dpr / k2}px "Oswald", sans-serif`; g.textAlign = 'center'; g.lineWidth = 3 * dpr / k2; g.strokeStyle = 'rgba(0,0,0,.85)';
      const t2 = `${NK(m).name} · ур. ${NK(m).lvl}`; g.strokeText(t2, x, by - 4); g.fillStyle = ['#ffe2a8', '#ffb060', '#ff6a4a'][NK(m).lvl - 1]; g.fillText(t2, x, by - 4);
      return;
    }
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

  // ---------- №157: способности героев и техники ----------
  // способность героя — только в технике его класса (энергетик — в энергетической); способность техники — всегда
  const HEROD = (id) => (AB.HEROES && AB.HEROES[id]) || null;
  const VD = (s) => VEFF(s.vehicle) || {};
  const heroAb = (s) => { const h = HEROD(s.id); return h && h.ability && VD(s).class === h.role ? h.ability : null; };
  const hasAb = (s, id) => { if (!s || s.ally) return null; const a = heroAb(s); if (a && a.id === id) return a; const b = VD(s).ability; return b && b.id === id ? b : null; };
  const fieldSquads = () => squads.filter((q) => q.state === 'out');
  const nearSq = (u, r) => fieldSquads().filter((q) => dist(curCell(q), curCell(u)) <= r);
  const maxOf = (s) => (AB.ID.get(s.id).stats || {}).maxHp || 100;
  function healSq(q, n) { const c = AB.Chars.get(q.id); if (!c || n <= 0) return 0; const was = c.hp; c.hp = Math.min(maxOf(q), c.hp + n); if (repOn() && c.hp > was) repRow(q).heal += c.hp - was; return c.hp - was; }
  function giveShield(q, n) { q.shield = Math.max(q.shield || 0, n); q.shieldT = 15; }
  const inFight = (q) => !!q.target || alive().some((m) => m.aggro === q && m.hp > 0);
  const rings = [];                                 // круги эффектов: купол, обвал, облако
  const ring = (u, r, col) => { const p = posOf(u); rings.push({ x: p.x, y: p.y, r: r * S0 * SQ3, col, t: 0 }); };
  // сила удара отряда с учётом способностей
  function strike(s, m) {
    const v = VD(s); let dmg = v.attack, a;
    if ((a = hasAb(s, 'shieldFury')) && s.shield > 0) dmg *= a.mult;                         // Марк: +20% под щитом
    if ((a = hasAb(s, 'focus'))) { s.focusN = s.lastT === m ? Math.min(Math.round(a.max / a.step), (s.focusN || 0) + 1) : 0; dmg *= 1 + a.step * s.focusN; }
    if ((a = hasAb(s, 'ram')) && s.lastT !== m) dmg *= a.mult;
    if ((a = hasAb(s, 'charge')) && s.moved) dmg *= a.mult;
    if ((a = hasAb(s, 'purge')) && (NK(m).armorType || 'none') === 'none') dmg *= a.mult;
    s.moved = false; s.lastT = m;
    const crit = v.crit && Math.random() < v.crit;                   // №161: чип прицела — крит ×1,5
    if (crit) { dmg *= 1.5; floatText(posOf(s), 'крит!', '#ffd27a'); }
    return { dmg, crit, pierce: !!hasAb(s, 'thermite') };
  }
  // после удара — счётчики «каждый n-й»
  function afterHit(s, m) {
    s.nAtk = (s.nAtk || 0) + 1; const n = s.nAtk, v = VD(s); let a;
    if (s.siege && s.siege.bearer === s.id) s.siege.hit = true;
    if ((a = hasAb(s, 'dome')) && n % a.every === 0) { for (const q of nearSq(s, a.radius)) giveShield(q, a.amount); ring(s, a.radius, '140,255,160'); floatText(posOf(s), `Купол +${a.amount}`, '#8cff9a'); }
    if ((a = hasAb(s, 'mend')) && n % a.every === 0) {
      const q = nearSq(s, a.radius).filter((x) => AB.Chars.get(x.id)).sort((x, y) => AB.Chars.get(x.id).hp / maxOf(x) - AB.Chars.get(y.id).hp / maxOf(y))[0];
      const got = q ? healSq(q, a.amount) : 0; if (got) floatText(posOf(q), `+${Math.round(got)}`, '#8cff9a');
    }
    if ((a = hasAb(s, 'impulse')) && n % a.every === 0) { ring(m, 1, '94,230,255'); for (const o of alive()) if (o !== m && dist(curCell(o), curCell(m)) <= 1) hurtMob(o, v.attack * a.part, s); }
    if ((a = hasAb(s, 'firefield')) && n % a.every === 0) { ring(m, 1, '255,122,74'); for (const o of alive()) if (dist(curCell(o), curCell(m)) <= 1) o.burn = { dps: a.dps, t: a.time, s, acc: 0 }; }
    if ((a = hasAb(s, 'chain')) && n % a.every === 0) {
      const o = alive().filter((x) => x !== m && dist(curCell(x), curCell(m)) <= a.radius)[0];
      if (o) { const p = posOf(m), q = posOf(o), dmg = v.attack * a.part; shots.push({ kind: 'zap', from: { x: p.x, y: p.y - S0 * 0.4 }, to: () => ({ x: q.x, y: q.y - S0 * 0.4 }), t: 0, dur: 0.1, hit: () => { if (o.hp > 0) hurtMob(o, dmg, s); } }); }
    }
    if (m.hp <= 0) return;
    if ((a = hasAb(s, 'stun')) && n % a.every === 0) { m.stunT = a.time; floatText(posOf(m), 'оглушён', '#5ee6ff'); }
    if ((a = hasAb(s, 'ignite'))) m.burn = { dps: a.dps, t: a.time, s, acc: m.burn ? m.burn.acc : 0 };
    if ((a = hasAb(s, 'suppress'))) m.slowT = a.time;
  }
  // постоянные способности: аптечка, ремонтные дроны, полевой ремонт; щиты гаснут; горение и яд
  function abilityTick(dt) {
    for (const s of fieldSquads()) {
      if (s.shield > 0 && (s.shieldT -= dt) <= 0) s.shield = 0;
      let a;
      if ((a = hasAb(s, 'medkit'))) for (const q of nearSq(s, a.radius)) healSq(q, a.hps * dt);
      if ((a = hasAb(s, 'repair')) && ((s.repT = (s.repT || 0) + dt) >= a.every)) { s.repT = 0; let any = false; for (const q of nearSq(s, a.radius)) if (healSq(q, a.amount) > 0) any = true; if (any) ring(s, a.radius, '140,255,160'); }
      // Механик Ода: вне боя чинит всю дружественную технику рядом
      if ((a = hasAb(s, 'fieldfix'))) { const near = nearSq(s, a.radius); if (!near.some(inFight)) { let got = 0; for (const q of near) got += healSq(q, a.hps * dt); if (got > 0 && ((s.fixT = (s.fixT || 0) + dt) > 1.5)) { s.fixT = 0; floatText(posOf(s), 'ремонт', '#8cff9a'); } } }
      if (s.poison && (s.poison.t -= dt) > 0) { s.poison.acc += dt; if (s.poison.acc >= 1) { s.poison.acc -= 1; hurtSquad(s, s.poison.dps, s.poison.m, { dot: true }); } } else s.poison = null;
    }
    for (const m of alive()) {
      if (m.slowT > 0) m.slowT -= dt;
      if (m.burn && (m.burn.t -= dt) > 0) { m.burn.acc += dt; if (m.burn.acc >= 1) { m.burn.acc -= 1; hurtMob(m, m.burn.dps, m.burn.s, { dot: true }); } } else if (m.burn) m.burn = null;
    }
    for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].t += dt) > 0.7) rings.splice(i, 1);
  }
  function drawRings() {
    for (const r of rings) { const u = r.t / 0.7; g.strokeStyle = `rgba(${r.col},${0.8 * (1 - u)})`; g.lineWidth = 3; g.beginPath(); g.ellipse(r.x, r.y, r.r * (0.3 + 0.7 * u), r.r * (0.3 + 0.7 * u) * TILT, 0, 0, 7); g.stroke(); }
  }

  // ---------- №157: большие мобы — по 3 на землю, уровни 1–3, стоят на месте ----------
  const BOSS = () => D().bosses;
  let bossT = [];
  const freeNear = (at, ok) => cells.filter((k) => passable(k) && !k.site && !k.road && ok(k)).sort((a, b) => dist(a, cell(at[0], at[1])) - dist(b, cell(at[0], at[1])))[0] || null;
  function spawnBoss(spot) {
    const B = BOSS(), K0 = B.kinds[spot.kind], L = B.levels[spot.lvl];
    const k = freeNear(spot.at, (x) => !mobAt(x) && dist(x, curCell(base)) >= 4 && !x.camp); if (!k) return;
    const hp = Math.round(K0.hp * L.k);
    const d = { ...K0, kind: spot.kind, lvl: spot.lvl, hp, attack: Math.round(K0.attack * Math.sqrt(L.k)), size: L.size, reward: L.reward, speed: 1 };
    mobs.push({ id: `boss${++mobSeq}`, kind: spot.kind, boss: true, spot, d, grp: ++mobSeq, c: k.c, r: k.r, home: { c: k.c, r: k.r }, hp, max: hp,
      aggro: null, atkT: 1, atk: null, path: [], anim: null, face: -1, stride: 0, flash: 0, wanderT: 0, repath: 0, deadT: 0, abT: 0, shield: 0 });
  }
  function spawnBosses() { bossT = []; if (BOSS()) for (const sp of BOSS().spots) spawnBoss(sp); }
  const foesOf = () => [...fieldSquads(), ...allies.filter((a) => a.hp > 0)];
  function bossTick(m, dt) {
    const d = m.d, me = curCell(m), A = d.ability;
    if (m.aggro && (m.aggro.state !== 'out' || m.aggro.hp <= 0 || dist(curCell(m.aggro), me) > d.aggro + 5)) m.aggro = null;
    const inReach = foesOf().filter((q) => canShoot(me, curCell(q), d.reach)).sort((a, b) => dist(curCell(a), me) - dist(curCell(b), me));
    if (m.aggro && !m.fought) { m.fought = true; repStart(`Бой: ${d.name} · ур. ${d.lvl}`, m); }   // №169: сам не нападает — бой, только если его ударили
    const t = m.aggro && canShoot(me, curCell(m.aggro), d.reach) ? m.aggro : inReach[0];
    if (!m.aggro) { m.fought = false; m.hp = Math.min(m.max, m.hp + m.max * 0.02 * dt); m.abT = 0; return; }   // в покое — заживает и не бьёт
    if ((m.abT += dt) >= A.every) {
      m.abT = 0;
      if (A.id === 'quake') { ring(m, A.radius, '217,162,62'); floatText(posOf(m), A.name, '#ffd27a'); for (const q of foesOf()) if (dist(curCell(q), me) <= A.radius) hurtSquad(q, d.attack * A.part, m); }
      if (A.id === 'barrier') { m.shield = A.amount * (1 + (d.lvl - 1) * 0.5); floatText(posOf(m), A.name, '#5ee6ff'); }
      if (A.id === 'cloud') { ring(m, A.radius, '150,255,120'); floatText(posOf(m), A.name, '#9fff8a'); for (const q of foesOf()) if (dist(curCell(q), me) <= A.radius) { if (q.ally) hurtSquad(q, A.dps * A.time, m, { dot: true }); else q.poison = { dps: A.dps, t: A.time, acc: 0, m }; } m.hp = Math.min(m.max, m.hp + m.max * A.heal); }
    }
    if (t && m.atkT <= 0 && (d.reach > 1 || !t.anim)) {
      m.atkT = d.rate * (m.slowT > 0 ? 1.3 : 1); m.atk = { t: 0 }; m.face = posOf(t).x >= posOf(m).x ? 1 : -1;
      if (d.shot) patrolShot(m, t); else hurtSquad(t, d.attack, m);
    }
  }
  function bossDead(m) {
    const d = m.d, items = [];
    for (const [item, n, ch] of d.reward) if (Math.random() < ch) items.push([item, n]);
    items.push([d.trophy, 1]);
    if (AB.VehMods) for (const id of AB.VehMods.roll(AB.PART_DROPS.boss[d.lvl])) items.push([id, 1]);   // №161: детали техники
    const veh = d.lvl === 3 && AB.IsoRoster && !AB.IsoRoster.owned().includes(d.vehicle) ? d.vehicle : null;
    dropLoot(m, items, veh);
    floatText(posOf(m), 'Добыча на земле', '#ffd27a');
    mail('reward', `Трофей: ${d.name} · ур. ${d.lvl}`, `<p>Большой моб повержен. На земле:</p><ul>${items.map(([id, n]) => `<li>${esc(AB.ID.get(id).name)} ×${n}</li>`).join('')}${veh ? `<li><b>${esc(AB.VEHICLES[veh].name)}</b> — техника</li>` : ''}</ul><p>Поднять — за ⚡${E().pick} энергии отряда. Добыча лежит ${Math.round(E().lootLife / 60)} мин (техника — пока не поднимут).</p>`);
    say(`${d.name} (ур. ${d.lvl}) повержен! Добыча — на земле${veh ? `, и среди неё — ${AB.VEHICLES[veh].name}` : ''}. Поднять — ⚡${E().pick}`);
    AB.Bus.emit('surface:kill', { kind: `boss${d.lvl}`, boss: m.kind, reward: [] });
    if (rep && rep.boss === m) repEnd('Победа');
    bossT.push({ spot: m.spot, t: 480 });
  }

  // ---------- №157: добыча на земле и энергия отряда ----------
  const E0 = () => D().energy || { max: 100, start: 60, regen: 0.5, pick: 2, restore: 30, lootLife: 180 };
  const E = () => { const e = E0(); return { ...e, max: e.max + TFX('energyMax'), regen: e.regen + TFX('energyRegen'), pick: Math.max(0, e.pick + TFX('pickCost')) }; };   // №165
  let energy = null;
  const broken = {};                                  // разбитая техника: восстановить — за энергию
  const loot = [];                                    // { c, r, items: [[id, n]], veh, t }
  const lootAt = (k) => loot.find((l) => l.c === k.c && l.r === k.r) || null;
  function dropLoot(m, items, veh) {
    if (!items.length && !veh) return;
    const k = curCell(m); let L = lootAt(k);
    if (!L) { L = { c: k.c, r: k.r, items: [], t: 0 }; loot.push(L); }
    for (const [id, n] of items) { const e = L.items.find((x) => x[0] === id); if (e) e[1] += n; else L.items.push([id, n]); }
    if (repOn()) rep.loot.push(...items);
    if (veh) L.veh = veh; L.t = 0;
  }
  function pickLoot(s, L) {
    s.pick = null;
    if (!loot.includes(L)) return;
    if (energy < E().pick) { say(`Мало энергии отряда (⚡${Math.floor(energy)}): поднять — ⚡${E().pick}. Капсула подзаряжается, стоя на месте`); return; }
    energy -= E().pick;
    const got = [];
    for (const [id, n] of L.items) { if (AB.IsoStash) AB.IsoStash.add(id, n); got.push(`${AB.ID.get(id).name} ×${n}`); }
    if (L.veh && AB.IsoRoster) { AB.IsoRoster.unlock({ vehicle: L.veh }); got.push(AB.VEHICLES[L.veh].name); }
    loot.splice(loot.indexOf(L), 1);
    floatText(posOf(s), `+ ${got.join(', ')}`, '#ffd27a');
    say(`${herName(s.id)} поднял${fem(s.id) ? 'а' : ''}: ${got.join(', ')} (−⚡${E().pick})`);
    barSig = '';
  }
  function lootTick(dt) {
    if (energy === null) energy = E().start;
    if (!base.anim && !base.path.length) energy = Math.min(E().max, energy + E().regen * dt);
    for (let i = loot.length - 1; i >= 0; i--) if (!loot[i].veh && (loot[i].t += dt) > E().lootLife) loot.splice(i, 1);
    const el = document.getElementById('sf-energy'); if (el) { const t = `⚡ ${Math.floor(energy)}/${E().max}`; if (el.textContent !== t) el.textContent = t; }
  }
  function drawLoot() {
    for (const L of loot) {
      const k = cell(L.c, L.r); if (!k.seen) continue;
      const p = bpx(L.c, L.r), x = p.x + S0 * 0.25, y = p.y + S0 * 0.2, big = !!L.veh;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, y + 2, big ? 12 : 8, 3, 0, 0, 7); g.fill();
      g.fillStyle = big ? '#6a7a8a' : '#7a5a32'; g.fillRect(x - (big ? 10 : 7), y - (big ? 12 : 9), big ? 20 : 14, big ? 12 : 9);
      g.fillStyle = big ? '#9fe7ff' : '#c9a24a'; g.fillRect(x - (big ? 10 : 7), y - (big ? 8 : 6), big ? 20 : 14, 2);
      const a = 0.5 + 0.5 * Math.sin(time * 4 + L.c); g.fillStyle = `rgba(255,230,140,${a})`; g.beginPath(); g.arc(x + 4, y - (big ? 14 : 11), 2, 0, 7); g.fill();
    }
  }
  // разбитую технику восстанавливают за энергию (кнопка в ячейке героя)
  function restore(id) {
    const q = unit(id); if (!q || !broken[q.vehicle]) return;
    if (energy < E().restore) { say(`Восстановить ${AB.VEHICLES[q.vehicle].name}: нужно ⚡${E().restore}, есть ⚡${Math.floor(energy)}`); return; }
    energy -= E().restore; delete broken[q.vehicle]; barSig = ''; save();
    say(`${AB.VEHICLES[q.vehicle].name} восстановлен (−⚡${E().restore})`);
  }

  // ---------- №157: лагеря разбойников с пленниками ----------
  const camps = [];                                   // { key, name, c, r, d }
  function spawnCamps() {
    camps.length = 0; for (const k of cells) k.camp = null;
    const PT = D().points ? D().points.list : [];
    for (const d of [...(D().camps || []), ...PT]) {
      const pt = PT.includes(d);                                    // №164: шахта или укрепление
      const k = freeNear(d.at, (x) => dist(x, curCell(base)) >= 3 && nbrs(x).filter(passable).length >= 4 && camps.every((o) => dist(cell(o.c, o.r), x) >= 3)); if (!k) continue;
      const cp = { key: d.key, name: d.name, c: k.c, r: k.r, d, pt }; camps.push(cp); k.camp = cp;
      if (pt ? qs().own[d.key] : qs().camps[d.key]) continue;
      garrison(cp);
    }
  }
  function garrison(cp) {
    const d = cp.d, k = cell(cp.c, cp.r);
    {
      const grp = ++mobSeq, spots = nbrs(k).filter((x) => passable(x) && !x.site && !mobAt(x));
      let i = 0;
      for (const [kind, n] of d.garrison) for (let j = 0; j < n && i < spots.length; j++, i++) {
        const dd = NPC().kinds[kind] || PAT().kinds[kind];
        mobs.push({ id: `camp${++mobSeq}`, kind, camp: d.key, grp, c: spots[i].c, r: spots[i].r, home: { c: spots[i].c, r: spots[i].r }, hp: dd.hp, max: dd.hp,
          aggro: null, atkT: 0, atk: null, path: [], anim: null, face: 1, stride: 0, flash: 0, wanderT: 3 + Math.random() * 5, repath: 0, deadT: 0 });
      }
    }
  }
  const campAt = (k) => camps.find((cp) => dist(cell(cp.c, cp.r), k) <= 0) || null;
  const campLeft = (key) => alive().filter((m) => m.camp === key).length;
  // ---------- №164: территории — взять осадой, доход капсуле, набеги стороны ----------
  const PTS = () => D().points;
  const rnd = ([a, b]) => a + Math.random() * (b - a);
  function pointTaken(cp) {
    if (qs().own[cp.key]) return;
    qs().own[cp.key] = { acc: 0, raidT: rnd(PTS().raid.first) }; qSave();
    if (AB.VehMods) dropLoot(cp, AB.VehMods.roll(AB.PART_DROPS.point).map((id) => [id, 1]), null);
    const [item, n] = cp.d.income;
    say(`${cp.name} — ваша! Каждую минуту капсуле: ${AB.ID.get(item).name} ×${n}. ${D().factions[cp.d.side].name} попытаются её отбить`);
    mail('event', `Территория взята: ${cp.name}`, `<p>${esc(cp.d.text)}</p><p>Доход: <b>${esc(AB.ID.get(item).name)} ×${n}</b> каждые ${PTS().income.every} с.</p><p>${esc(D().factions[cp.d.side].name)} пришлют набег — держите отряд рядом.</p>`);
    AB.Bus.emit('surface:point', { key: cp.key, own: true });
  }
  function pointLost(cp, raiders) {
    delete qs().own[cp.key]; qSave();
    for (const m of raiders) Object.assign(m, { raid: null, camp: cp.key, home: { c: curCell(m).c, r: curCell(m).r }, aggro: null });   // набег становится гарнизоном
    say(`${cp.name} потеряна: ${D().factions[cp.d.side].name} вернули её. Возьмите снова осадой`);
    mail('event', `Территория потеряна: ${cp.name}`, `<p>${esc(D().factions[cp.d.side].name)} отбили точку — набег стал её гарнизоном. Возьмите снова осадой.</p>`);
    AB.Bus.emit('surface:point', { key: cp.key, own: false });
  }
  function startRaid(cp) {
    const P = PTS(), from = siteCell(P.capital[cp.d.side]), kind = ALLY_KIND[cp.d.side], dk = PAT().kinds[kind]; if (!from) return;
    const grp = ++mobSeq, spots = cells.filter((x) => walk(x) && !occupiedBy(x, null) && dist(x, from) >= 1 && dist(x, from) <= 2).sort((a, b) => dist(a, from) - dist(b, from));
    for (let i = 0; i < P.raid.n && i < spots.length; i++)
      mobs.push({ id: `raid${++mobSeq}`, kind, raid: cp.key, grp, c: spots[i].c, r: spots[i].r, home: { c: cp.c, r: cp.r }, hp: dk.hp, max: dk.hp,
        aggro: null, atkT: 0, atk: null, path: [], anim: null, face: 1, stride: 0, flash: 0, wanderT: 0, repath: 0, deadT: 0 });
    qs().own[cp.key].hold = 0;
    say(`${dk.squad || 'Отряд стороны'} идёт отбивать: ${cp.name}!`);
    mail('event', `Набег на «${cp.name}»`, `<p>${esc(dk.squad || 'Отряд стороны')} вышел из столицы и идёт к точке. Если простоит у неё ${PTS().raid.hold} с без вашего отряда рядом — точка потеряна.</p>`);
  }
  // набег идёт к точке; если стоит у неё без отряда игрока рядом — точка потеряна
  function raidMove(m, dt) {
    const P = cell(m.home.c, m.home.r);
    if (m.anim || m.path.length) return;
    if (dist(curCell(m), P) > 1 && (m.repath -= dt) <= 0) { m.repath = 2; m.path = pathTo(curCell(m), (x) => dist(x, P) <= 1) || []; }
  }
  function pointsTick(dt) {
    const P = PTS(); if (!P) return;
    for (const cp of camps) {
      const own = cp.pt && qs().own[cp.key]; if (!own) continue;
      if ((own.acc += dt) >= P.income.every) {
        own.acc = 0; const [item, n] = cp.d.income;
        if (AB.IsoStash) AB.IsoStash.add(item, n);
        if (cell(cp.c, cp.r).seen) floatText(bpx(cp.c, cp.r), `+ ${AB.ID.get(item).name} ×${n}`, '#9fe7ff');
      }
      const raiders = alive().filter((m) => m.raid === cp.key);
      if (!raiders.length) {
        if (own.hold != null) { own.hold = null; own.raidT = rnd(P.raid.next); say(`Набег на «${cp.name}» отбит`); }
        else if ((own.raidT -= dt) <= 0) startRaid(cp);
        continue;
      }
      const C = cell(cp.c, cp.r), at = raiders.some((m) => dist(curCell(m), C) <= 1), guard = fieldSquads().some((q) => dist(curCell(q), C) <= 3);
      if (at && !guard) { own.hold = (own.hold || 0) + dt; if (own.hold >= P.raid.hold) pointLost(cp, raiders); }
    }
  }
  function campCleared(key) {
    { const cp0 = camps.find((x) => x.key === key); if (cp0 && cp0.pt) { pointTaken(cp0); return; } }
    if (qs().camps[key]) return; qs().camps[key] = true; qSave();
    const cp = camps.find((x) => x.key === key);
    if (cp && AB.VehMods) dropLoot(cp, AB.VehMods.roll(AB.PART_DROPS.camp).map((id) => [id, 1]), null);   // №161: в лагере — детали
    say(`${cp ? cp.name : 'Лагерь'} взят! Клетка с пленником — в лагере («Изучить»)`);
    if (cp) mail('event', `Лагерь взят: ${cp.name}`, `<p>Гарнизон перебит. В клетке — ${esc(AB.ID.get(cp.d.prisoner).name)}: освободите по заданию («Изучить» на лагере). В лагере на земле — детали техники.</p>`);
    AB.Bus.emit('surface:camp', { key });
  }
  function drawPoint(cp) {
    const p = bpx(cp.c, cp.r), x = p.x, y = p.y, own = !!qs().own[cp.key], col = own ? '#5ee6ff' : CIV_COL[cp.d.side];
    if (cp.d.kind === 'mine') {                                      // шахта: вход в штольню, вагонетка, копёр
      g.fillStyle = '#3a2e24'; g.beginPath(); g.arc(x, y + 2, 11, Math.PI, 0); g.fill(); g.fillStyle = '#120c08'; g.beginPath(); g.arc(x, y + 2, 7, Math.PI, 0); g.fill();
      g.strokeStyle = '#6a5038'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 9, y - 6); g.lineTo(x, y - 22); g.lineTo(x + 9, y - 6); g.stroke();
      g.fillStyle = '#5a4a3a'; g.fillRect(x + 10, y - 2, 9, 6); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(x + 12, y + 5, 2, 0, 7); g.arc(x + 17, y + 5, 2, 0, 7); g.fill();
    } else {                                                          // укрепление: башня
      g.fillStyle = '#5a5450'; g.fillRect(x - 6, y - 24, 12, 26); g.fillStyle = '#6a6460'; g.fillRect(x - 8, y - 28, 16, 5);
      g.fillStyle = '#1a1a1a'; g.fillRect(x - 2, y - 18, 4, 5);
    }
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 12, y - 4); g.lineTo(x - 12, y - 30); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(x - 12, y - 30); g.lineTo(x - 1 + Math.sin(time * 4) * 1.5, y - 26); g.lineTo(x - 12, y - 22); g.fill();
    if (own && alive().some((m) => m.raid === cp.key)) { g.fillStyle = `rgba(255,90,74,${0.6 + 0.4 * Math.sin(time * 6)})`; g.font = '700 13px "Oswald", sans-serif'; g.textAlign = 'center'; g.fillText('⚠', x + 10, y - 26); }
    const fs = 10 * dpr / kScale(); g.font = `600 ${fs}px "Share Tech Mono", monospace`; g.textAlign = 'center'; g.lineWidth = 3 * dpr / kScale(); g.strokeStyle = 'rgba(0,0,0,.85)';
    g.strokeText(cp.name, x, y + S0 * 0.75); g.fillStyle = own ? '#9fe7ff' : '#e6e0d6'; g.fillText(cp.name, x, y + S0 * 0.75);
  }
  function drawCamp(cp) {
    if (cp.pt) { drawPoint(cp); return; }
    const p = bpx(cp.c, cp.r), x = p.x, y = p.y, done = !!qs().camps[cp.key];
    const tent = (tx, ty, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(tx - 9, ty); g.lineTo(tx, ty - 13); g.lineTo(tx + 9, ty); g.fill(); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(tx - 2, ty - 5, 4, 5); };
    tent(x - 12, y + 2, '#6a5038'); tent(x + 12, y + 4, '#5a4a38');
    g.fillStyle = 'rgba(255,140,60,.8)'; g.beginPath(); g.arc(x, y + 8, 3 + Math.sin(time * 8) * 0.8, 0, 7); g.fill();
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 1.6;                  // клетка с пленником
    for (let i = 0; i < 4; i++) { const bx = x - 6 + i * 4; g.beginPath(); g.moveTo(bx, y - 4); g.lineTo(bx, done && i > 1 ? y - 10 : y - 18); g.stroke(); }
    g.beginPath(); g.moveTo(x - 7, y - 18); g.lineTo(x + 7, y - 18); g.stroke();
    if (!done) { g.fillStyle = '#d8b090'; g.beginPath(); g.arc(x, y - 11, 3, 0, 7); g.fill(); }
    if (!done) { g.fillStyle = '#ff5a4a'; g.font = '700 10px "Oswald", sans-serif'; g.textAlign = 'center'; g.fillText('☠', x, y - 22); }
  }

  // ---------- №157: осада — отряд встаёт кольцом вокруг цели, первым бьёт щитоносец ----------
  let shieldId = null;                                // кто несёт щит отряда (выбор в ячейке снизу)
  const sgDone = (sg) => (sg.T.isCamp ? !campLeft(sg.T.key) : sg.T.hp <= 0);
  const sgCenter = (T) => (T.isCamp ? cell(T.c, T.r) : curCell(T));
  function sgTarget(sg, s) {
    if (!sg.T.isCamp) return sg.T.hp > 0 ? sg.T : null;
    return alive().filter((m) => m.camp === sg.T.key).sort((a, b) => dist(curCell(a), curCell(s)) - dist(curCell(b), curCell(s)))[0] || null;
  }
  function startSiege(us, T) {
    const C = sgCenter(T), bearer = us.find((q) => q.id === shieldId) ? shieldId : null;
    const order = [...us].sort((a, b) => (b.id === bearer) - (a.id === bearer));
    const sg = { T, bearer, phase: 'gather', t: 0, hit: false, members: order };
    const used = new Set();
    for (const s of order) {
      const fr = (qs().form || {})[s.id] === 'front';                 // №191: по умолчанию — на максимальной дальности атаки; «вплотную» — только если задано в «Отряде»
      const R = fr ? 1 : Math.max(1, Math.min(4, VD(s).reach || 1));
      const free = (x) => walk(x) && !occupiedBy(x, s) && !used.has(x);
      const spot = cells.filter((x) => free(x) && dist(x, C) === R).sort((a, b) => dist(a, curCell(s)) - dist(b, curCell(s)))[0]
        || cells.filter((x) => free(x) && dist(x, C) <= R + 1 && dist(x, C) >= 1).sort((a, b) => dist(a, curCell(s)) - dist(b, curCell(s)))[0];
      if (spot) used.add(spot);
      Object.assign(s, { siege: sg, spot, mode: 'auto', target: null, zone: null, pick: null, capSpeed: null });
      if (TFX('siegeShield')) giveShield(s, TFX('siegeShield'));      // №165: тактика осады
      if (s.state === 'retreat') s.state = 'out';
      if (spot && spot !== curCell(s)) goTo(s, spot, true); else s.path = [];
    }
    say(`Осада: ${T.isCamp ? T.name : NK(T).name} — отряд окружает цель${bearer ? `, первым бьёт ${herName(bearer)} (щит)` : ''}`);
    repStart(`Осада: ${T.isCamp ? T.name : NK(T).name}${T.boss ? ` · ур. ${NK(T).lvl}` : ''}`, T.boss ? T : null);   // №162
  }
  // true — отряд в осаде ещё не бьёт (стоит/идёт на место)
  function siegeStep(s, dt) {
    const sg = s.siege;
    if (sgDone(sg)) { for (const q of sg.members) if (q.siege === sg) { q.siege = null; q.target = null; } say('Осада окончена: цель повержена'); repEnd('Победа'); return false; }
    if (sg.phase === 'gather') {
      const here = (q) => q.state !== 'out' || (!q.anim && !q.path.length);
      if (!s.anim && !s.path.length && s.spot && curCell(s) !== s.spot && (s.repath = (s.repath || 0) - dt) <= 0) { s.repath = 1.5; if (!goTo(s, s.spot, true)) s.spot = null; }
      const engaged = alive().some((m) => m.aggro && sg.members.includes(m.aggro) && (sg.T.isCamp ? m.camp === sg.T.key : m === sg.T));   // цель уже напала — бой начинается
      if (sg.members.every(here) || sg.t > 20 || engaged) { sg.phase = sg.bearer ? 'first' : 'all'; sg.t0 = sg.t; if (sg.bearer) say(`${herName(sg.bearer)} начинает — под щитом`); }
      return true;
    }
    if (sg.phase === 'first' && (sg.hit || sg.t - sg.t0 > 4)) sg.phase = 'all';
    if (sg.phase === 'first' && s.id !== sg.bearer) return true;
    if (!s.target || s.target.hp <= 0) s.target = sgTarget(sg, s);
    return false;
  }

  // ---------- №157: союзная армия приходит в осаду ----------
  const allies = [];
  let allyCd = 0;
  const ALLY_KIND = { east: 'samurai', desert: 'cyborg', organic: 'warden' };
  function callArmy(T) {
    const A = D().alliance, side = qs().ally;
    if (!side) { say('Союзника пока нет: задание «Союз» в Меновом Узле'); return; }
    if (allyCd > 0) { say(`Армия союзника соберётся через ${Math.ceil(allyCd)} с`); return; }
    const C = sgCenter(T), dk = PAT().kinds[ALLY_KIND[side]];
    const spots = cells.filter((x) => walk(x) && !occupiedBy(x, null) && dist(x, C) >= 2 && dist(x, C) <= 4).sort(() => Math.random() - 0.5);
    for (let i = 0; i < A.units && i < spots.length; i++) {
      const hp = Math.round(dk.hp * 1.3);
      allies.push({ id: `ally${++mobSeq}`, kind: 'ally', ally: true, d: { ...dk, name: `${dk.name} (союзник)` }, dtype: dk.dtype, state: 'out', T, c: spots[i].c, r: spots[i].r,
        hp, max: hp, life: A.life, path: [], anim: null, face: 1, stride: 0, flash: 0, atkT: Math.random(), atk: null, repath: 0 });
    }
    allyCd = A.cooldown;
    say(`${D().factions[side].name}: армия союзника пришла на подмогу (${A.units} бойца, ${A.life} с)`);
  }
  function allyTick(a, dt) {
    a.flash = Math.max(0, a.flash - dt); a.atkT = Math.max(0, a.atkT - dt); if (a.atk) { a.atk.t += dt; if (a.atk.t > 0.6) a.atk = null; }
    const C = sgCenter(a.T);
    let t = a.T.isCamp ? alive().filter((m) => m.camp === a.T.key)[0] : a.T.hp > 0 ? a.T : null;
    if (!t) t = alive().filter((m) => m.aggro && (m.aggro.kind === 'squad' || m.aggro.ally) && dist(curCell(m), C) <= 6)[0] || null;
    if (!t) { a.life = Math.min(a.life, 3); mobStep(a, dt); return; }
    const reach = a.d.reach || 1;
    if (canShoot(curCell(a), curCell(t), reach)) {
      if (!a.anim && a.path.length) a.path = [];
      else if (!a.anim && a.atkT <= 0) {
        a.atkT = a.d.rate; a.atk = { t: 0 }; a.face = posOf(t).x >= posOf(a).x ? 1 : -1;
        const p = posOf(a), tt = t;
        shots.push({ kind: a.d.shot, from: { x: p.x, y: p.y - S0 * 0.55 }, to: () => { const q = posOf(tt); return { x: q.x, y: q.y - S0 * 0.4 }; }, t: 0, dur: 0.15, hit: () => { if (tt.hp > 0 && a.hp > 0) hurtMob(tt, a.d.attack, a); } });
      }
    } else if (!a.anim && ((a.repath -= dt) <= 0 || !a.path.length)) { a.repath = 0.8; a.path = pathTo(curCell(a), (x) => canShoot(x, curCell(t), reach)) || []; }
    mobStep(a, dt);
  }

  // ---------- №157: задания открытия героев и техники (js/data/heroes.js) ----------
  const QKEY = 'abyss_a1_quests';
  const QS = () => AB.SURFACE_A1_QUESTS || [];
  let Q = null;                                       // { done, st: { id: { stage, kills } }, camps, ally, shield, told }
  function qs() {
    if (!Q) { try { Q = JSON.parse(localStorage.getItem(QKEY) || 'null'); } catch (e) { Q = null; } if (!Q || !Array.isArray(Q.done)) Q = { done: [], st: {}, camps: {}, ally: null, shield: null, told: [] }; Q.own = Q.own || {}; Q.form = Q.form || {}; shieldId = Q.shield || null; }
    return Q;
  }
  function qSave() { Q.shield = shieldId; try { localStorage.setItem(QKEY, JSON.stringify(Q)); } catch (e) { /* без хранилища */ } }
  const qOpen = (q) => { const Z = qs(), r = q.requires || {}; storyLoad(); return !Z.done.includes(q.id) && (r.story == null || story.stage >= r.story) && (r.done == null || Z.done.length >= r.done); };
  const qState = (q) => qs().st[q.id] || (qs().st[q.id] = { stage: 0, kills: {} });
  const qStage = (q) => q.stages[qState(q).stage] || null;
  const activeQ = () => QS().filter(qOpen);
  const qAt = (key) => activeQ().filter((q) => { const st = qStage(q); return st && st.at === key; });
  function qNotify() {
    const fresh = activeQ().filter((q) => !qs().told.includes(q.id)); if (!fresh.length) return;
    for (const q of fresh) qs().told.push(q.id); qSave();
    setTimeout(() => say(`Новое задание: ${fresh.map((q) => `«${q.name}» — ${q.stages[0].goal}`).join('; ')}`), 2600);
  }
  function qAdvance(q) {
    const s = qState(q); s.stage++; s.kills = {};
    if (s.stage >= q.stages.length) { qFinish(q); return; }
    const nx = qStage(q); qSave(); goalUi();
    say(`${q.name}: ${nx.goal}`);
    if (nx.siege && qs().camps[nx.siege]) setTimeout(() => qAdvance(q), 600);
  }
  function qFinish(q) {
    const Z = qs(); Z.done.push(q.id); delete Z.st[q.id]; qSave();
    const r = q.reward || {}, got = [];
    if (r.hero && AB.IsoRoster) { AB.IsoRoster.unlock({ hero: r.hero }); got.push(`${AB.ID.get(r.hero).name} — в отряде`); }
    if (r.vehicle && AB.IsoRoster) { AB.IsoRoster.unlock({ vehicle: r.vehicle }); got.push(`${AB.VEHICLES[r.vehicle].name} — в капсуле`); }
    for (const [item, n] of r.items || []) { if (AB.IsoStash) AB.IsoStash.add(item, n); got.push(`${AB.ID.get(item).name} ×${n}`); }
    say(`Задание «${q.name}» выполнено. ${got.join('. ')}`);
    mail('reward', `Задание выполнено: «${q.name}»`, `<p>Награда:</p><ul>${got.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>`);
    AB.Bus.emit('quest:start', {});
    goalUi(); qNotify();
  }
  AB.Bus.on('surface:kill', ({ kind }) => {
    if (!Q) return;
    for (const q of activeQ()) {
      const st = qStage(q); if (!st || !st.kills || !st.kills[kind]) continue;
      const s = qState(q); s.kills[kind] = (s.kills[kind] || 0) + 1; qSave(); goalUi();
      if (Object.entries(st.kills).every(([k, n]) => (s.kills[k] || 0) >= n)) setTimeout(() => qAdvance(q), 900);
    }
  });
  AB.Bus.on('surface:camp', ({ key }) => { for (const q of activeQ()) { const st = qStage(q); if (st && st.siege === key) qAdvance(q); } });
  const payHave = (st) => (st.pay || []).every(([id, n]) => (AB.IsoStash ? AB.IsoStash.count(id) : 0) >= n);
  function showQuest(where, q) {
    const st = qStage(q), el = document.getElementById('sf-pop');
    storyCard = { quest: q, st };
    el.querySelector('b').textContent = where.name;
    el.querySelector('i').textContent = `Задание · ${q.name}`; el.querySelector('i').className = 'sf-side story';
    let html = st.lines.map(([who, t]) => (who ? `<span class="who">${esc(who)}</span> ${esc(t)}` : `<em>${esc(t)}</em>`)).join('<br>');
    if (st.choose) html += `<span class="sf-ally">${Object.entries(D().factions).map(([k, f]) => `<button data-ally="${k}">${esc(f.name)}</button>`).join('')}</span>`;
    el.querySelector('p').innerHTML = html;
    const btn = el.querySelector('[data-sf-act]'), cost = (st.pay || []).map(([id, n]) => `${AB.ID.get(id).name} ×${n}`).join(', ');
    el.querySelector('small').textContent = cost ? `Нужно: ${cost}` : st.choose ? 'Союзник даст армию в осаду (кнопка «Армия»); остальные две стороны станут враждебнее.' : '';
    btn.hidden = !!st.choose; btn.textContent = st.button || 'Дальше'; btn.disabled = !!st.pay && !payHave(st);
    el.hidden = false;
  }
  function questAct(q, st) {
    if (st.pay) { if (!payHave(st)) { say('Не хватает вещей'); return; } for (const [id, n] of st.pay) AB.IsoStash.remove(id, n); }
    qAdvance(q);
  }
  function chooseAlly(side) {
    const q = storyCard && storyCard.quest; if (!q) return;
    qs().ally = side; qSave(); storyCard = null; hidePop();
    say(`Союз заключён: ${D().factions[side].name}. В осаде — кнопка «Армия»`);
    qAdvance(q);
  }

  // ---------- №157: «Изучить» — карточка цели ----------
  function study(c) {
    const el = document.getElementById('sf-pop'); storyCard = null;
    const btn = el.querySelector('[data-sf-act]'); btn.hidden = false; btn.disabled = true; btn.textContent = 'Изучено';
    const A = (t) => (AB.Damage ? AB.Damage.armorName(t) : t), Dm = (t) => (AB.Damage ? AB.Damage.name(t || 'kinetic') : t);
    if (c.m) {
      const d = NK(c.m), m = c.m, ab = d.ability;
      el.querySelector('b').textContent = m.boss ? `${d.name} · ур. ${d.lvl}` : d.name;
      el.querySelector('i').textContent = m.boss ? 'Большой моб · стоит на месте' : m.patrol ? (d.squad || 'Патруль') : m.camp ? 'Гарнизон лагеря' : 'Нейтральный';
      el.querySelector('i').className = `sf-side ${d.side || ''}`;
      el.querySelector('p').innerHTML = `${esc(d.text || '')}<br>Здоровье <b>${Math.ceil(m.hp)}/${m.max}</b> · удар <b>${d.attack}</b> раз в ${d.rate} с · дальность ${d.reach || 1}<br>Урон: <b>${Dm(d.dtype)}</b> · Защита: <b>${A(d.armorType)}</b>${ab ? `<br><b>${esc(ab.name)}</b> — ${esc(ab.text)}` : ''}`;
      el.querySelector('small').textContent = m.boss ? `Добыча: ${AB.ID.get(d.trophy).name}${d.lvl === 3 ? ` и ${AB.VEHICLES[d.vehicle].name}` : ''}. Сам не нападает — отвечает, если ударить. Совет: «Осада» со щитоносцем.` : 'Добыча падает на землю: поднять — за энергию отряда.';
    } else if (c.camp && c.camp.pt) {                                  // №164: шахта или укрепление
      const cp = c.camp, own = qs().own[cp.key], [item, n] = cp.d.income, P = PTS();
      el.querySelector('b').textContent = cp.name;
      el.querySelector('i').textContent = own ? 'Ваша территория' : `${cp.d.kind === 'mine' ? 'Шахта' : 'Укрепление'} · ${D().factions[cp.d.side].name} · гарнизон: ${campLeft(cp.key)}`;
      el.querySelector('i').className = `sf-side ${cp.d.side}`;
      el.querySelector('p').textContent = cp.d.text;
      el.querySelector('small').textContent = own ? `Доход: ${AB.ID.get(item).name} ×${n} каждые ${P.income.every} с. ${alive().some((m) => m.raid === cp.key) ? 'Идёт набег — защитите точку!' : `Набег стороны — примерно через ${Math.max(1, Math.round(own.raidT / 60))} мин.`} Если отряд стороны простоит у точки ${P.raid.hold} с без вас — точка потеряна.`
        : `Возьмите осадой — и каждые ${P.income.every} с капсуле: ${AB.ID.get(item).name} ×${n}.`;
    } else if (c.camp) {
      const cp = c.camp, done = !!qs().camps[cp.key], q = qAt(cp.key)[0];
      if (done && q) { showQuest(cp, q); return; }
      el.querySelector('b').textContent = cp.name;
      el.querySelector('i').textContent = done ? 'Лагерь взят' : `Лагерь разбойников · гарнизон: ${campLeft(cp.key)}`;
      el.querySelector('i').className = `sf-side ${cp.d.side}`;
      el.querySelector('p').textContent = cp.d.text;
      el.querySelector('small').textContent = done ? 'Пленника освобождают по заданию (в нём — что делать дальше).' : `В клетке — пленник (${AB.ID.get(cp.d.prisoner).name}). «Осада» — окружить и взять лагерь.`;
    } else if (c.k && c.k.site) { showSite(c.k.site); return; }
    el.hidden = false;
  }

  // №168: письмо в почту (js/iso/iso-mail.js)
  const mail = (kind, title, html) => { if (AB.IsoMail) AB.IsoMail.add({ kind, title, html }); };
  // ---------- №162: отчёт о бое — после осады и боя с большим мобом ----------
  // кто сколько нанёс и получил, сколько погасил щит, сколько вылечили, кто пал, что выпало
  let rep = null;
  function repStart(title, boss) { if (rep && !rep.done) return; rep = { title, boss: boss || null, t0: time, rows: {}, loot: [], down: [], done: false }; }
  const repRow = (u) => { const id = u.ally ? 'ally' : u.id; return rep.rows[id] || (rep.rows[id] = { dealt: 0, kills: 0, taken: 0, shield: 0, heal: 0 }); };
  const repOn = () => rep && !rep.done;
  function repEnd(result) { if (!repOn()) return; rep.done = true; rep.result = result; rep.secs = Math.round(time - rep.t0); setTimeout(showReport, 1300); }
  function showReport() {
    const R0 = rep; if (!R0) return;
    // №191: отчёт — только письмом в почту, поверх окон не всплывает
    const name = (id) => (id === 'ally' ? 'Армия союзника' : herName(id));
    const rows = Object.entries(R0.rows).sort((a, b) => b[1].dealt - a[1].dealt);
    const best = rows[0] && rows[0][1].dealt > 0 ? rows[0][0] : null;
    const loot = {}; for (const [id, n] of R0.loot) loot[id] = (loot[id] || 0) + n;
    const body = `<table class="rep-tab"><tr><th>Герой</th><th>Урон</th><th>Убито</th><th>Получил</th><th>Щит</th><th>Лечение</th></tr>
      ${rows.map(([id, r]) => `<tr class="${R0.down.includes(id) ? 'down' : ''}"><td>${esc(name(id))}${id === best ? ' ★' : ''}${R0.down.includes(id) ? ' ✝' : ''}</td><td>${Math.round(r.dealt)}</td><td>${r.kills}</td><td>${Math.round(r.taken)}</td><td>${Math.round(r.shield)}</td><td>${Math.round(r.heal)}</td></tr>`).join('')}</table>
      <p>${R0.down.length ? `Пали: <b>${R0.down.map((id) => esc(name(id))).join(', ')}</b> — техника разбита, восстановить за ⚡${E().restore}. ` : 'Никто не пал. '}Бой шёл ${R0.secs} с.</p>
      <p>${Object.keys(loot).length ? `Добыча на земле: <b>${Object.entries(loot).map(([id, n]) => `${esc(AB.ID.get(id).name)} ×${n}`).join(', ')}</b> — поднять за ⚡${E().pick}` : 'Добычи нет.'}</p>`;
    if (AB.IsoMail && !R0.sent) { R0.sent = true; AB.IsoMail.add({ kind: 'report', title: `${R0.title} — ${R0.result}`, html: `<div class="rep-card mail">${body}</div>` }); say(`Отчёт о бое — в почте ✉`); }
  }

  // ---------- №163: построение перед осадой — кто впереди (кольцо вплотную), кто сзади, кто несёт щит ----------
  let formT = null, formUs = [];
  function openForm(us, T) {
    formT = T; formUs = us;
    const F = qs().form || (qs().form = {});
    for (const s of us) if (!F[s.id]) F[s.id] = (VD(s).reach || 1) <= 1 ? 'front' : 'back';
    let el = document.getElementById('sf-form');
    if (!el) {
      el = document.createElement('div'); el.id = 'sf-form'; document.getElementById('sf').appendChild(el);
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-fm]'); if (!b) { if (e.target === el) el.hidden = true; return; }
        const [a, id] = b.dataset.fm.split('|'), F2 = qs().form;
        if (a === 'pos') F2[id] = F2[id] === 'front' ? 'back' : 'front';
        if (a === 'sh') shieldId = shieldId === id ? null : id;
        if (a === 'x') { el.hidden = true; return; }
        if (a === 'go') { el.hidden = true; qSave(); follow = false; barSig = ''; startSiege(formUs, formT); return; }
        qSave(); renderForm();
      });
    }
    renderForm(); el.hidden = false;
  }
  function renderForm() {
    const el = document.getElementById('sf-form'), F = qs().form, nm2 = formT.isCamp ? formT.name : NK(formT).name;
    el.innerHTML = `<div class="fm-card"><div class="fm-head"><b>Построение · осада: ${esc(nm2)}</b><button data-fm="x" aria-label="Закрыть">✕</button></div>
      <p class="fm-note">Впереди — встают вплотную к цели и принимают удар; сзади — на дальности своего оружия. 🛡 — первым бьёт и держит внимание врага.</p>
      ${formUs.map((s) => { const v = VD(s), fr = F[s.id] === 'front';
        return `<div class="fm-row"><span class="fm-n"><b>${esc(herName(s.id))}</b><small>${esc(v.short || v.name)} · дальность ${v.reach || 1}</small></span>
          <button class="fm-pos ${fr ? 'front' : 'back'}" data-fm="pos|${s.id}">${fr ? '▲ Впереди' : '▼ Сзади'}</button>
          <button class="fm-sh ${shieldId === s.id ? 'on' : ''}" data-fm="sh|${s.id}" title="Щитоносец">🛡</button></div>`; }).join('')}
      <div class="fm-foot"><button class="fm-go" data-fm="go">⛬ Начать осаду</button></div></div>`;
  }

  // ---------- №142: приказ по нажатию — «Автобой», «Следовать» (на NPC — «Атаковать») ----------
  let cmd = null;                      // { k, m }
  function hideCmd() { cmd = null; const el = document.getElementById('sf-cmd'); if (el) el.hidden = true; }
  // №157: на NPC, патруле, большом мобе — «Атаковать», «Осада», «Изучить» (и «Армия» союзника);
  // на лагере — «Осада», «Изучить»; на поселении — «Следовать», «Изучить»; на добыче — «Поднять»; на пустой клетке — «Автобой», «Следовать»
  function showCmd(cx, cy, k, m, camp) {
    cmd = { k, m, camp: camp || null };
    const el = document.getElementById('sf-cmd'), L = !m && !camp && lootAt(k), target = !!(m || (camp && campLeft(camp.key) > 0));   // №164: взятая точка — «Следовать», «Изучить»
    el.dataset.ctx = m ? 'mob' : camp ? (target ? 'camp' : 'site') : L ? 'loot' : k.site ? 'site' : 'cell';
    const show = { auto: !target && !k.site && !L && !camp, follow: !target && !L, go: !target, attack: !!m, siege: target, study: target || !!k.site || !!camp, army: target && !!qs().ally, pick: !!L };
    for (const [key, on] of Object.entries(show)) { const b = el.querySelector(`[data-cmd="${key}"]`); if (b) b.hidden = !on; }
    const pb = el.querySelector('[data-cmd="pick"] span'); if (pb) pb.textContent = `Поднять ⚡${E().pick}`;
    const ab = el.querySelector('[data-cmd="army"] span'); if (ab) ab.textContent = allyCd > 0 ? `Армия ${Math.ceil(allyCd)}с` : 'Армия';
    el.hidden = false;
    placeCmd();
  }
  // №143: кнопки — над нажатой клеткой (или над NPC); едут вместе с картой
  function placeCmd() {
    if (!cmd) return;
    const el = document.getElementById('sf-cmd'), kk = kScale();
    const p = cmd.m ? posOf(cmd.m) : bpx(cmd.k.c, cmd.k.r);
    if (cmd.m && cmd.m.boss) p.y -= S0 * 0.5 * NK(cmd.m).size;
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
    if (!cmd) return; const { k, m, camp } = cmd; hideCmd();
    if (kind === 'study') { study({ k, m, camp }); return; }                    // №157: «Изучить» — без похода
    const T = m || (camp ? { ...camp, isCamp: true } : null);
    if (kind === 'army') { if (T) callArmy(T); return; }
    const us = movers(); if (!us.length) { say('Некому идти — выпустите героя из капсулы'); return; }
    if (kind === 'siege') { if (T && (camp ? campLeft(camp.key) : m.hp > 0)) { startSiege(us, T); follow = false; barSig = ''; } else say('Здесь уже некого брать в осаду'); return; }   // №191: сразу, без окна — построение в окне «Отряд»
    if (kind === 'pick') {                                                   // поднять добычу: идёт ближайший
      const L = lootAt(k); if (!L) return;
      const s0 = [...us].sort((a, b) => dist(curCell(a), k) - dist(curCell(b), k))[0];
      Object.assign(s0, { pick: L, target: null, siege: null, mode: 'follow', zone: k, capSpeed: null });
      if (dist(curCell(s0), k) <= 1 && !s0.anim) pickLoot(s0, L); else goTo(s0, k, true);
      follow = false; barSig = ''; return;
    }
    for (const s of us) { s.siege = null; s.capSpeed = null; }
    if (kind === 'follow' && us.length > 1) { const slow = Math.min(...us.map((q) => (VEFF(q.vehicle) || { speed: 30 }).speed)); for (const q of us) q.capSpeed = slow; }   // №193
    if (kind === 'attack') {
      if (!m || m.hp <= 0) return;
      for (const s of us) { s.mode = 'auto'; s.target = m; s.zone = null; s.path = []; s.repath = 0; s.pick = null; s.capSpeed = null; if (s.state === 'retreat') s.state = 'out'; }
      follow = false; barSig = '';
      say(`${us.length > 1 ? 'Отряд' : herName(us[0].id)}: атака — ${NK(m).name}`);
      return;
    }
    const near0 = cells.filter((x) => walk(x) && dist(x, k) <= 2 && !occupiedBy(x, null)).sort((a, b) => dist(a, k) - dist(b, k));   // №182: здание и занятые — мимо
    const spots = near0.length ? near0 : [k];
    us.forEach((s, i) => { s.mode = kind === 'auto' ? 'auto' : 'follow'; s.target = null; s.zone = spots[i % spots.length]; goTo(s, s.zone, true); });   // «Идти» и «Следовать» — без боя
    pendSite = k.site ? { s: k.site, u: us[0] } : null;
    follow = false; barSig = '';
    say(kind === 'auto' ? 'Автобой: идут туда и бьют враждебных по пути' : kind === 'follow' ? (us.length > 1 ? 'Следовать: отряд идёт вместе — со скоростью самого медленного' : 'Следовать: идёт, не ввязываясь в бой') : 'Идти: каждый своим ходом, не ввязываясь в бой');
  }

  // ---------- №145: цепочка «Дорога на север» (js/data/surface-a1-story.js) — открывает мосты в Б1 ----------
  const STORY_KEY = 'abyss_a1_story2';   // №150: новая цепочка (треугольник)
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
  function goalUi() {
    const el = document.getElementById('sf-goal'); if (!el) return;
    // №157: под главной целью — начатые задания открытия героев (до двух)
    const side = Q ? activeQ().filter((q) => qState(q).stage > 0).slice(0, 2).map((q) => {
      const st = qStage(q); let t = st.goal;
      if (st.kills) { const [k, n] = Object.entries(st.kills)[0]; t += `: ${Math.min(n, qState(q).kills[k] || 0)}/${n}`; }
      return `<small>• ${esc(t)}</small>`;
    }) : [];
    el.innerHTML = (ST() ? `▸ ${esc(goalText())}` : '') + side.map((x) => `<br>${x}`).join('');
  }
  function storyAdvance() {
    const st = stageNow(); if (!st) return;
    for (const [item, n] of st.reward || []) if (AB.IsoStash) { AB.IsoStash.add(item, n); floatText(posOf(selU()), `+ ${AB.ID.get(item).name} ×${n}`, '#ffd27a'); }
    if (st.goal) mail('story', `Сюжет: ${st.goal}`, `${(st.lines || []).map(([who, t]) => (who ? `<p><b>${esc(who)}:</b> ${esc(t)}</p>` : `<p><i>${esc(t)}</i></p>`)).join('')}${(st.reward || []).length ? `<p>Награда: ${st.reward.map(([i, n]) => `${esc(AB.ID.get(i).name)} ×${n}`).join(', ')}</p>` : ''}`);
    story.stage++; story.kills = {}; storySave();
    const nx = stageNow();
    if (nx && nx.say) say(nx.say);
    if (!nx) { say(ST().done.say); if (AB.Flags) AB.Flags.add('a1-bridges'); AB.Bus.emit('surface:bridges', {}); }
    else if (!nx.say) say(`Задание: ${nx.goal}`);
    if (AB.Bus) AB.Bus.emit('quest:start', {});
    goalUi(); qNotify();
  }
  function storyEnter() {
    storyLoad(); qs(); qNotify();
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
    el.querySelector('[data-sf-act]').hidden = false;
    storyCard = ok ? st : null;
    el.querySelector('b').textContent = s.name;
    el.querySelector('i').textContent = `Задание · ${ST().name}`;
    el.querySelector('i').className = 'sf-side story';
    el.querySelector('p').innerHTML = ok ? st.lines.map(([who, t]) => (who ? `<span class="who">${esc(who)}</span> ${esc(t)}` : `<em>${esc(t)}</em>`)).join('<br>') : esc(st.wait || '');
    el.querySelector('small').textContent = '';
    const btn = el.querySelector('[data-sf-act]');
    btn.textContent = ok ? st.button : 'Нужна профессор Хейл';
    btn.disabled = !ok;
    el.hidden = false;
  }

  // ---------- №150: торговля треугольника (AB.SURFACE_A1.trade) ----------
  // каждая сторона делает своё и отправляет караваном соседу по кругу; без ввоза её производство падает;
  // события перекрывают дороги — и дефицит идёт по кругу. Сводка — в карточке Менового Узла.
  const TR = () => D().trade;
  const CIV_COL = { east: '#c0503a', desert: '#9aa4ab', organic: '#6aaa5a' };
  let trade = null;
  function tradeInit() {
    if (trade || !TR()) return;
    trade = { civ: {}, caravans: [], blocked: {}, evT: 150 + Math.random() * 120, acc: 0, last: null };
    for (const k of Object.keys(TR().civs)) trade.civ[k] = { own: 20 + Math.random() * 10, imp: 25 + Math.random() * 10, dep: 0, infl: 10 };
  }
  function tradeTick(dt) {
    if (!trade) return; const T = TR();
    for (const r of Object.keys(trade.blocked)) { trade.blocked[r] -= dt; if (trade.blocked[r] <= 0) { delete trade.blocked[r]; say(`${D().routeNames[r]} снова открыт — караваны пошли`); } }
    for (let i = trade.caravans.length - 1; i >= 0; i--) {
      const cv = trade.caravans[i], path = lanes[cv.route];
      if (trade.blocked[cv.route] || !path) continue;
      const k = path[Math.min(path.length - 1, Math.floor(cv.pos))];
      cv.pos += dt * (T.caravanSpeed / 60) / (k ? Math.max(1, cost(k) * 0.7) : 1);
      if (cv.pos >= path.length - 1) {              // доехал: товар — покупателю, влияние — продавцу
        const to = trade.civ[cv.to]; to.imp = Math.min(T.cap, to.imp + T.batch);
        trade.civ[cv.from].infl += 2; trade.caravans.splice(i, 1);
      }
    }
    trade.acc += dt; if (trade.acc < T.tick) return; trade.acc -= T.tick;
    for (const [k, c] of Object.entries(T.civs)) {
      const st = trade.civ[k], has = st.imp > 0.5;
      st.own = Math.min(T.cap, st.own + T.make * (has ? 1 : T.starve));
      st.imp = Math.max(0, st.imp - T.use);
      st.dep = Math.round(100 * (1 - Math.min(1, st.imp / (T.cap * 0.5))));
      if (st.own >= T.batch && !trade.blocked[c.route] && trade.caravans.filter((x) => x.from === k).length < (T.inFlight || 2)) {
        st.own -= T.batch; trade.caravans.push({ from: k, to: c.to, route: c.route, good: c.makes, pos: 0 });
      }
    }
    trade.evT -= T.tick;
    if (trade.evT <= 0) {
      trade.evT = 180 + Math.random() * 120;
      const ev = T.events[Math.floor(Math.random() * T.events.length)];
      trade.last = ev.text; say(ev.text);
      if (ev.route) trade.blocked[ev.route] = ev.secs;
    }
  }
  // караваны на дорогах: повозка цвета стороны и охранник; перекрытая дорога — красный знак
  function drawCaravans() {
    if (!trade) return;
    for (const cv of trade.caravans) {
      const path = lanes[cv.route]; if (!path) continue;
      const i = Math.floor(cv.pos), a = path[i], b2 = path[Math.min(path.length - 1, i + 1)], t = cv.pos - i;
      if (!a.seen) continue;
      const pa = bpx(a.c, a.r), pb = bpx(b2.c, b2.r), x = pa.x + (pb.x - pa.x) * t, y = pa.y + (pb.y - pa.y) * t + S0 * 0.1;
      const f = pb.x >= pa.x ? 1 : -1, stop = !!trade.blocked[cv.route];
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x, y + 3, 12, 3.5, 0, 0, 7); g.fill();
      g.fillStyle = '#4a3a28'; g.fillRect(x - 9, y - 9, 18, 8);
      g.fillStyle = CIV_COL[cv.from]; g.beginPath(); g.ellipse(x, y - 10, 9, 6, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(x - 6, y, 3, 0, 7); g.arc(x + 6, y, 3, 0, 7); g.fill();
      g.fillStyle = CIV_COL[cv.from]; g.beginPath(); g.arc(x + 14 * f, y - 6, 3, 0, 7); g.fill(); g.fillRect(x + 14 * f - 2, y - 4, 4, 7);
      if (stop) { g.fillStyle = '#ff5a4a'; g.font = '700 12px "Oswald", sans-serif'; g.textAlign = 'center'; g.fillText('✋', x, y - 18); }
    }
  }
  function tradeHtml() {
    if (!trade) return '';
    const T = TR(), F = D().factions, tot = Object.values(trade.civ).reduce((a, c) => a + c.infl, 0) || 1;
    const bar = (v, max, col) => `<span class="tr-bar"><i style="width:${Math.round(100 * Math.min(1, v / max))}%;background:${col}"></i></span>`;
    const rows = Object.entries(T.civs).map(([k, c]) => {
      const st = trade.civ[k], route = D().routeNames[c.route], blk = trade.blocked[c.route];
      return `<div class="tr-civ"><b style="color:${CIV_COL[k]}">${F[k].name}</b>
        <span>Делает: ${T.goods[c.makes]} ${bar(st.own, T.cap, CIV_COL[k])} ${Math.round(st.own)}</span>
        <span>Ввоз: ${T.goods[c.needs]} ${bar(st.imp, T.cap, '#d9a23e')} ${Math.round(st.imp)}</span>
        <span>Зависимость <b>${st.dep}%</b> · Влияние в Узле <b>${Math.round(100 * st.infl / tot)}%</b></span>
        <span class="tr-route">${route} → ${F[c.to].name}: ${blk ? `<em>перекрыт (${Math.ceil(blk)} с)</em>` : 'открыт'} · в пути: ${trade.caravans.filter((x) => x.from === k).length}</span></div>`;
    }).join('');
    return `<span class="tr-head">Торговля треугольника</span>${rows}${trade.last ? `<span class="tr-ev">Последнее: ${trade.last}</span>` : ''}`;
  }

  // ---------- карточка точки ----------
  const ACT = { capital: 'Войти в город — скоро', village: 'Войти в поселение — скоро', ford: 'Зайти на брод — скоро', shrine: 'Подойти к Купели — скоро', hub: 'Торговать — скоро' };
  let popSite = null;
  function showSite(s) {
    popSite = s; storyCard = null;
    { const st = stageNow(); if (st && st.at === s.key) { showStory(s, st); return; } }
    { const q = qAt(s.key)[0]; if (q) { showQuest(s, q); return; } }           // №157: задания открытия героев
    document.querySelector('#sf-pop [data-sf-act]').hidden = false;
    const el = document.getElementById('sf-pop'), f = D().factions[s.side];
    el.querySelector('b').textContent = s.name;
    el.querySelector('i').textContent = f ? `${f.tag} · ${f.name}` : `Выход · зона ${s.to}`;
    el.querySelector('i').className = `sf-side ${s.side}`;
    el.querySelector('p').textContent = s.text;
    el.querySelector('small').textContent = f ? f.text : 'Эта зона ещё не открыта — появится в следующих обновлениях.';
    const btn = el.querySelector('[data-sf-act]');
    const open = s.kind === 'bridge' && bridgesOpen();
    if (open) { el.querySelector('i').textContent = 'Мост открыт · зона Б1'; el.querySelector('small').textContent = 'За ущельем — «Железный Предел», земли синтетиков и киборгов. Сама зона — следующий этап.'; }
    if (s.kind === 'hub' && trade) { el.querySelector('p').innerHTML = `${esc(s.text)}<br>${tradeHtml()}`; el.querySelector('small').textContent = 'Каждая сторона делает своё и везёт соседу по кругу. Перекроют дорогу — дефицит пойдёт дальше по кругу.'; }
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
    const shk = shakeT > 0 ? shakeT * 18 : 0;                     // №181: тряска при ударе
    g.setTransform(k, 0, 0, k, cv.width / 2 - cam.x * k + (Math.random() - 0.5) * shk, cv.height / 2 - cam.y * k + (Math.random() - 0.5) * shk);
    g.drawImage(bake, 0, 0);
    g.drawImage(fogCv, 0, 0);
    // память: всё, что дальше обзора, — приглушено (вокруг выбранного)
    const pp = posOf(selU());
    const gr = g.createRadialGradient(pp.x, pp.y, S0 * VIEW * 1.2, pp.x, pp.y, S0 * VIEW * 2.1);
    gr.addColorStop(0, 'rgba(4,6,10,0)'); gr.addColorStop(1, 'rgba(4,6,10,.42)');
    g.fillStyle = gr; g.fillRect(cam.x - cv.width / k, cam.y - cv.height / k, cv.width * 2 / k, cv.height * 2 / k);
    // точки (только открытые)
    for (const s of sites) if (cell(s.c, s.r).seen) drawSite(s);
    for (const cp of camps) if (cell(cp.c, cp.r).seen) drawCamp(cp);   // №157: лагеря и добыча на земле
    drawLoot();
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
    [base, ...outSquads(), ...mobs, ...allies].map((u) => ({ u, p: posOf(u) })).sort((a, b) => a.p.y - b.p.y).forEach(({ u, p }) => (u === base ? drawBase(p.x, p.y) : u.kind === 'squad' ? drawSquad(u, p.x, p.y) : drawMob(u)));
    drawCaravans();
    drawShots(); drawRings();
    if (vfx) vfx.draw(g, frameDt);
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
      g.fillStyle = { desert: '#ffe2a8', east: '#f6c38a', organic: '#c6f0a8', swamp: '#c6f0a8', exit: '#9fe7ff' }[s.side] || '#e6e0d6'; g.fillText(t, p.x, y);
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
    const pose = poseOf(s);
    if (!VD(s).look) drawVeh(s, x, y);                               // №157: новая техника — условный рисунок
    else if (AB.IsoSuit && AB.RIGS && AB.RIGS.EXOSUIT) AB.IsoSuit.draw(g, pose, x, y + S0 * 0.2, (S0 * 1.3) / AB.RIGS.EXOSUIT.height);
    else { g.fillStyle = '#c9853a'; g.beginPath(); g.arc(x, y - 10, 8, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    if (s.shield > 0) {                                              // №157: щит — светящийся купол
      const a = Math.min(1, s.shield / 25) * (0.45 + 0.15 * Math.sin(time * 5));
      g.strokeStyle = `rgba(140,255,160,${a + 0.2})`; g.fillStyle = `rgba(140,255,160,${a * 0.25})`; g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, y - S0 * 0.45, S0 * 0.62, S0 * 0.85, 0, 0, 7); g.fill(); g.stroke();
    }
    if (s.poison) { g.fillStyle = 'rgba(150,255,120,.7)'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x - 8 + i * 8, y - S0 * 1.1 - ((time * 20 + i * 7) % 14), 2, 0, 7); g.fill(); } }
    if (s.id === shieldId) { g.font = `${12}px sans-serif`; g.textAlign = 'center'; g.fillText('🛡', x + S0 * 0.55, y - S0 * 1.2); }
    const c = AB.Chars.get(s.id), max = (AB.ID.get(s.id).stats || {}).maxHp || 100;
    if (c && (c.hp < max || s.target)) hpBar(x, y - S0 * 1.45, c.hp / max, '#5ee6ff');
  }
  // №157: новая техника (до картинок автора): корпус по форме, цвет — класс; сверху — голова героя
  // №173: у техники есть картинка автора — рисуем её (смотрит вправо; влево — зеркально)
  const vehPics = {};
  function vehPic(src) { let im = vehPics[src]; if (!im) { im = vehPics[src] = new Image(); im.src = src; } return im.complete && im.naturalWidth ? im : null; }
  // №175: шагоход по частям (корпус, бедро, голень; ближняя и дальняя нога): бедро качается вокруг тазобедренного
  // шарнира, голень сгибается в колене, ноги в противофазе, корпус приседает на шаге. false — части ещё не загрузились.
  // №181: удар всем телом — ключевые позы (rest → замах → удар → удержание → возврат), между ними — плавно
  const RIG_POSES = {
    //        dx    dy  lean   nT    nK    fT    fK    shN    elN   shF    elF
    rest:  [   0,   24, 0.05, -0.36, 0.42, 0.4,  0.14,  0.3,  -1.05, -0.2, -0.95],   // №183: боевая стойка — ноги расставлены, присед, кулаки перед собой (№201: шире)
    cock:  [ -30,   40, -0.16, -0.46, 0.62, 0.48, 0.36,  1.45, -2.35, -0.75, -1.2],   // №201: замах — ноги не сводятся, а шире и ниже: упор
    strike:[  85,   26, 0.3,  -0.66, 0.42, 0.6,  0.1,  -1.62, -0.02,  0.85, -0.35],   // №201: выпад — передняя вперёд, задняя упирается
  };
  // №189: кадры волны самурая (assets/fx/samurai-wave, картинка автора): запуск, полёт (по кругу), взрыв — по 6
  const WAVE = (() => {
    const set = { launch: [], fly: [], hit: [] }; let left = 18;
    for (const k of Object.keys(set)) for (let i = 0; i < 6; i++) { const im = new Image(); im.onload = () => { left--; }; im.src = `assets/fx/samurai-wave/${k}_${i}.webp`; set[k].push(im); }
    return { set, ready: () => left <= 0 };
  })();
  // №186: удар мечом — замах над головой, широкий рубящий взмах вперёд-вниз
  const RIG_SWORD = {
    rest:  RIG_POSES.rest,
    cock:  [ -20,   38, -0.2, -0.46, 0.6,  0.48, 0.36,  2.75, -0.55, -0.6, -1.1],   // №201: и с мечом — широкий упор
    strike:[  80,   26, 0.32, -0.66, 0.42, 0.6,  0.1,  -0.85, -0.2,   0.8, -0.4],
  };
  function rigPose(at, sword) {
    const L = (A, B, t) => A.map((v, i) => v + (B[i] - v) * t), E = (t) => t * t * (3 - 2 * t), P = sword ? RIG_SWORD : RIG_POSES;
    if (at < 0.3) return { q: L(P.rest, P.cock, E(at / 0.3)), open: at > 0.1 };
    if (at < 0.4) { const t = (at - 0.3) / 0.1; return { q: L(P.cock, P.strike, t * t), open: false, fast: true }; }   // разгон — с ускорением
    if (at < 0.55) return { q: P.strike, open: false, hold: true };
    return { q: L(P.strike, P.rest, E((at - 0.55) / 0.45)), open: false };
  }
  let shakeT = 0;
  function drawRig(s, v, R, x, y, lunge) {
    const P = (n) => vehPic(R.dir + n + '.webp');
    const body = P('body'), th = P('thigh'), sh = P('shin'), thF = P('thigh_far'), shF = P('shin_far');
    if (!body || !th || !sh || !thF || !shF) return false;
    const f = s.face || 1, mv = !!s.anim, ph = s.stride / (R.heavy ? 15 : 11);   // тяжёлый — шаг реже
    const full = R.hip[1] + (R.thigh.knee[1] - R.thigh.top[1]) + (R.shin.foot[1] - R.shin.top[1]);   // от верха корпуса до ступни
    const k = (S0 * 1.6) / full;
    const SW = !!v.sword, at = s.atk && R.arms3 ? Math.min(1, s.atk.t / 0.8) : -1, A = at >= 0 ? rigPose(at, SW) : null;
    // №183: стоя — боевая стойка (плавно из ходьбы и обратно); на ходу — шаг
    s.stk = Math.max(0, Math.min(1, (s.stk == null ? 1 : s.stk) + (mv ? -frameDt * 5 : frameDt * 2.5)));
    let Q = A ? A.q : null;
    if (!A && R.arms3 && s.stk > 0) {
      const sw = Math.sin(ph) * 0.14, breathe = Math.sin(time * 1.8);
      const W = [0, 0, mv ? 0.07 + Math.sin(ph * 2) * 0.03 : 0.02, mv ? Math.sin(ph) * 0.4 : 0.04, mv ? 0.08 + Math.max(0, -Math.cos(ph)) * 0.75 : 0.08,
        mv ? Math.sin(ph + Math.PI) * 0.4 : 0.04, mv ? 0.08 + Math.max(0, -Math.cos(ph + Math.PI)) * 0.75 : 0.08, sw * 1.6 + 0.12, -0.7, -sw * 1.4 + 0.1, -0.75];
      const ST = RIG_POSES.rest.slice(); ST[1] += breathe * 3; ST[7] += breathe * 0.03; ST[9] -= breathe * 0.03;
      const e = s.stk * s.stk * (3 - 2 * s.stk); Q = W.map((v2, i) => v2 + (ST[i] - v2) * e);
    }
    const pk = R.pk || 1;                                             // №200: масштаб поз (позы — в пикселях Молота; у Кузнеца картинка вдвое меньше)
    const bob = (A ? 0 : mv ? -Math.abs(Math.cos(ph)) * 22 * (1 - s.stk) : (R.arms3 ? 0 : Math.sin(time * 1.8) * 4)) * pk;   // в пикселях картинки
    g.save(); g.translate(x + (A ? 0 : lunge), y + S0 * 0.24);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(Q ? Q[0] * pk * k * f * 0.6 : 0, -2, S0 * 0.55, 5, 0, 0, 7); g.fill();
    g.scale(f * k, k); g.translate(-R.hip[0], -full - bob);
    if (Q) g.translate(Q[0] * pk, Q[1] * pk);                         // удар: рывок вперёд и присед
    // №202: ступни стоят на месте — в стойке, на замахе и в ударе ступня «приклеена» к земле там, где она в боевой стойке,
    // а углы бедра и колена подбираются под неё (две кости: бедро и голень). На ходу (w = 0) — шаг как прежде.
    const RP = RIG_POSES.rest, Qo = Q ? [Q[0] * pk, Q[1] * pk] : [0, 0];
    const ikW = A ? 1 : Q ? (s.stk * s.stk * (3 - 2 * s.stk)) : 0;
    const rot = (v, t) => [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t)];
    const footAt = (hip, TC, SC, a, c) => { const T = [TC.knee[0] - TC.top[0], TC.knee[1] - TC.top[1]], Sv = [SC.foot[0] - SC.top[0], SC.foot[1] - SC.top[1]];
      const t1 = rot(T, a), t2 = rot(Sv, a + c); return [hip[0] + t1[0] + t2[0], hip[1] + t1[1] + t2[1]]; };
    function solveIK(hip, TC, SC, tgt, a0, c0) {
      const T = [TC.knee[0] - TC.top[0], TC.knee[1] - TC.top[1]], Sv = [SC.foot[0] - SC.top[0], SC.foot[1] - SC.top[1]];
      const L1 = Math.hypot(...T), L2 = Math.hypot(...Sv), al1 = Math.atan2(T[1], T[0]), al2 = Math.atan2(Sv[1], Sv[0]);
      const D = [tgt[0] - hip[0], tgt[1] - hip[1]], d = Math.max(Math.abs(L1 - L2) + 1, Math.min(L1 + L2 - 1, Math.hypot(...D)));
      const phi = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))), base = Math.atan2(D[1], D[0]);
      let best = null;
      for (const sg of [1, -1]) {                                    // из двух сгибов колена — ближний к позе
        const th1 = base + sg * phi, K = [hip[0] + L1 * Math.cos(th1), hip[1] + L1 * Math.sin(th1)], th2 = Math.atan2(tgt[1] - K[1], tgt[0] - K[0]);
        const a = th1 - al1, c = th2 - al2 - a, err = Math.abs(a - a0) + Math.abs(c - c0);
        if (!best || err < best.err) best = { a, c, err };
      }
      return best;
    }
    const leg = (hip, thImg, shImg, p, ovA, ovB, TC = R.thigh, SC = R.shin, rc) => {   // №200: у дальней ноги могут быть свои точки (thighFar/shinFar)
      // бедро: sin — нога уходит назад (опора), потом выносится вперёд; колено сгибается, только когда нога идёт вперёд (cos < 0)
      let a = mv ? Math.sin(p) * 0.4 : 0.04, b = mv ? 0.08 + Math.max(0, -Math.cos(p)) * 0.75 : 0.08;
      if (ovA != null) { a = ovA; b = ovB; }
      let c = b - a * 0.3;
      if (ikW > 0 && rc) {                                            // №202: ступня — где в стойке (в кадре без сдвига позы)
        const ra = RP[rc[0]], rcK = RP[rc[1]] - RP[rc[0]] * 0.3;
        const f0 = footAt([hip[0] + RP[0] * pk, hip[1] + RP[1] * pk], TC, SC, ra, rcK), tgt = [f0[0] - Qo[0], f0[1] - Qo[1]];
        const sol = solveIK(hip, TC, SC, tgt, a, c);
        a += (sol.a - a) * ikW; c += (sol.c - c) * ikW;
      }
      g.save(); g.translate(hip[0], hip[1]); g.rotate(a);
      g.drawImage(thImg, -TC.top[0], -TC.top[1]);
      g.translate(TC.knee[0] - TC.top[0], TC.knee[1] - TC.top[1]); g.rotate(c);
      g.drawImage(shImg, -SC.top[0], -SC.top[1]);
      if (window.__rigDbg) { const q = g.getTransform().transformPoint({ x: SC.foot[0] - SC.top[0], y: SC.foot[1] - SC.top[1] }); (s._feet = s._feet || {})[rc ? rc[0] : 'x'] = [Math.round(q.x), Math.round(q.y)]; }   // тест: где ступня на экране
      g.restore();
    };
    // №201: у Кузнеца ближняя нога — задняя (у Молота — передняя): позы ног меняются местами, иначе ноги скрещиваются
    const LN = R.swapLegs ? [5, 6] : [3, 4], LF = R.swapLegs ? [3, 4] : [5, 6];
    leg(R.hipFar || R.hip, thF, shF, ph + Math.PI, Q && Q[LF[0]], Q && Q[LF[1]], R.thighFar || R.thigh, R.shinFar || R.shin, LF);   // дальняя нога — за корпусом
    // корпус: на ходу наклонён вперёд и раскачивается с шагом (вокруг таза), стоя — чуть дышит
    const lean = Q ? Q[2] : (mv ? 0.07 + Math.sin(ph * 2) * 0.03 : Math.sin(time * 1.8) * 0.01), roll = mv && !A ? Math.sin(ph) * 6 * (1 - (s.stk || 0)) : 0;
    const arm = (A2, ang) => { const im = A2 && P(A2.img); if (!im) return; g.save(); g.translate(A2.pivot[0], A2.pivot[1]); g.rotate(ang); g.drawImage(im, A2.at[0] - A2.pivot[0], A2.at[1] - A2.pivot[1]); g.restore(); };
    const sway = mv ? Math.sin(ph) * 0.14 : Math.sin(time * 1.8) * 0.02;   // руки — в противофазе ногам
    // рука из трёх деталей — плечо (вокруг плечевого шарнира), предплечье (локоть), кисть (кулак или раскрытая ладонь)
    const arm3 = (side, shA, el, open) => {
      const C = R.arms3, S2 = C[side], k3 = C.scale, ua = P('ua' + S2.sfx), fa = P('fa' + S2.sfx), hand = open && !S2.sfx ? P('palm') : P('fist' + S2.sfx);
      if (!ua || !fa || !hand) return;
      const H = open && !S2.sfx ? C.palm : (S2.fist || C.fist), UA = S2.ua || C.ua, FA = S2.fa || C.fa, off = S2.off || [0, 0];   // №200: свои точки и поправка углов у руки
      g.save(); g.translate(S2.shoulder[0], S2.shoulder[1]); g.scale(k3, k3); g.rotate(shA + off[0]);
      g.drawImage(ua, -UA.top[0], -UA.top[1]);
      g.translate(UA.elbow[0] - UA.top[0], UA.elbow[1] - UA.top[1]); g.rotate(el + off[1]);
      g.drawImage(fa, -FA.top[0], -FA.top[1]);
      g.translate(FA.wrist[0] - FA.top[0], FA.wrist[1] - FA.top[1]);
      if (SW && !S2.sfx) drawSword();                                 // №186: меч — под кулаком, рукоять в кулаке
      g.rotate(H.rot);
      g.drawImage(hand, -H.wrist[0], -H.wrist[1]);
      g.restore();
    };
    // нодати (до картинки автора): рукоять с обмоткой, латунная цуба, длинный изогнутый клинок с бликом лезвия
    function drawSword() {
      const img = P('sword');                                         // №187: меч автора (hammer-rig/sword.webp); пока грузится — нарисованный кодом
      if (img) { g.save(); g.translate(-30, 115); g.rotate(-0.55 + Math.PI / 2); g.scale(1.4, 1.4); g.drawImage(img, -130, -55); g.restore(); return; }
      g.save(); g.translate(-30, 115); g.rotate(-0.55);
      g.fillStyle = '#2a1c18'; g.fillRect(-26, -170, 52, 230);                                   // рукоять
      g.strokeStyle = '#8a1e1e'; g.lineWidth = 9; for (let i = -150; i < 50; i += 36) { g.beginPath(); g.moveTo(-26, i); g.lineTo(26, i + 18); g.stroke(); }
      g.fillStyle = '#b8902e'; g.beginPath(); g.ellipse(0, 70, 70, 26, 0, 0, 7); g.fill(); g.strokeStyle = '#6a4e14'; g.lineWidth = 6; g.stroke();   // цуба
      const L = 1150, gr = g.createLinearGradient(-30, 0, 34, 0); gr.addColorStop(0, '#6a7480'); gr.addColorStop(0.55, '#dfe6ee'); gr.addColorStop(1, '#9aa4ae');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-24, 90); g.quadraticCurveTo(-40, 90 + L * 0.55, -70, 90 + L); g.lineTo(-20, 90 + L * 0.93); g.quadraticCurveTo(26, 90 + L * 0.5, 26, 90); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 5; g.beginPath(); g.moveTo(24, 100); g.quadraticCurveTo(22, 90 + L * 0.5, -22, 90 + L * 0.92); g.stroke();   // лезвие
      g.strokeStyle = 'rgba(40,46,54,.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-6, 110); g.quadraticCurveTo(-14, 90 + L * 0.5, -40, 90 + L * 0.9); g.stroke();      // дол
      g.restore();
    }
    const torso = () => { g.translate(R.hip[0], R.hip[1]); g.rotate(lean); g.translate(-R.hip[0] + roll, -R.hip[1]); };
    g.save(); torso();
    if (R.arms3) arm3('far', Q ? Q[9] : -sway * 1.4 + 0.1, Q ? Q[10] : -0.75, false);
    else if (R.arms) arm(R.arms.far, -sway * 0.8);
    g.drawImage(body, 0, 0);
    g.restore();
    leg(R.hip, th, sh, ph, Q && Q[LN[0]], Q && Q[LN[1]], R.thigh, R.shin, LN);                    // ближняя — перед ним
    if (R.arms3 || R.arms) {
      g.save(); torso();
      if (R.arms3) {
        // след кулака на разгоне и в ударе — полупрозрачные «тени» прежних поз
        if (A && (A.fast || A.hold)) for (const d of [0.05, 0.035, 0.02]) { const B = rigPose(Math.max(0.3, at - d), SW); g.globalAlpha = A.hold ? 0.12 : 0.28; arm3('near', B.q[7], B.q[8], false); }
        g.globalAlpha = 1;
        arm3('near', Q ? Q[7] : sway * 1.6 + 0.12, Q ? Q[8] : -0.7, A && !SW ? A.open : false);
      } else arm(R.arms.near, sway);
      g.restore();
    }
    if (s.flash > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * s.flash / 0.25; g.fillStyle = 'rgba(255,90,60,1)'; g.beginPath(); g.ellipse(R.hip[0], R.hip[1] - 150 * pk, 320 * pk, 380 * pk, 0, 0, 7); g.fill(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    g.restore(); return true;
  }
  function drawVeh(s, x, y) {
    const v = VD(s), col = (AB.HERO_ROLES[v.class] || {}).col || '#ccc', f = s.face || 1;
    const bob = s.anim ? Math.abs(Math.sin(s.stride / 10)) * 2 : 0, lunge = s.atk ? Math.sin(Math.min(1, s.atk.t / 0.8) * Math.PI) * 4 * f : 0;
    // №174: анимация техники с картинкой: шагоход — шаг (покачивание, пружинит), колёса крутятся, носитель парит, дроны летают вокруг
    const A = v.anim || {};
    if (A.kind === 'rig' && drawRig(s, v, A.rig, x, y, lunge)) return;      // №175: шагоход по частям — ноги переставляются
    const pic = v.img && vehPic(A.body || v.img);
    if (pic) {
      let h = S0 * 1.45, w = pic.naturalWidth * h / pic.naturalHeight;
      if (w > S0 * 1.9) { w = S0 * 1.9; h = pic.naturalHeight * w / pic.naturalWidth; }   // широкая техника (броневик) — по ширине
      const k = w / pic.naturalWidth, mv = !!s.anim, ph = s.stride / (A.heavy ? 18 : 13);
      let dy = 0, rot = 0, sx = 1;
      if (A.kind === 'walk') { if (mv) { dy = -Math.abs(Math.sin(ph)) * S0 * (A.heavy ? 0.05 : 0.07); rot = Math.sin(ph) * (A.heavy ? 0.025 : 0.04); sx = 1 + Math.sin(ph * 2) * 0.015; } else dy = Math.sin(time * 1.8) * 0.8; }
      if (A.kind === 'wheels' && mv) dy = Math.sin(s.stride * 0.7) * 1.2;   // подвеска на неровностях
      g.save(); g.translate(x + lunge, y + S0 * 0.22);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, -2, w * 0.32, 5, 0, 0, 7); g.fill();
      if (A.kind === 'wheels' && mv) for (let i = 0; i < 4; i++) {                                    // пыль из-под колёс
        const t = (time * 2.2 + i / 4) % 1; g.fillStyle = `rgba(190,170,130,${0.35 * (1 - t)})`;
        g.beginPath(); g.arc(-f * (w * 0.42 + t * S0 * 0.5), -4 - t * 10, 3 + t * 7, 0, 7); g.fill();
      }
      const hov = A.kind === 'hover' || v.shape === 'drone' ? S0 * 0.18 + Math.sin(time * 2.2) * 3 : 0;
      g.translate(0, dy - hov); g.scale(f * sx, 1); g.rotate(rot);
      const drone = A.drone && vehPic(A.drone), drones = [];
      if (drone) for (let i = 0; i < (A.drones || 3); i++) { const an = time * 0.9 + i * Math.PI * 2 / (A.drones || 3); drones.push({ x: Math.cos(an) * w * 0.58, y: -h * 0.62 + Math.sin(an) * h * 0.22 + Math.sin(time * 3 + i) * 3, z: Math.sin(an) }); }
      const drawDrone = (d) => { const dh = h * 0.26, dw = drone.naturalWidth * dh / drone.naturalHeight; g.drawImage(drone, d.x - dw / 2, d.y - dh / 2, dw, dh); };
      for (const d of drones) if (d.z < 0) drawDrone(d);                                                // дроны за корпусом
      g.drawImage(pic, -w / 2, -h, w, h);
      if (A.kind === 'wheels') for (const [cx, cy, rx, ry, hx, hy] of A.wheels) {                     // колёса крутятся вокруг ступицы
        const ex = -w / 2 + cx * k, ey = -h + cy * k, px = -w / 2 + hx * k, py = -h + hy * k, R2 = Math.max(rx, ry) * k * 1.15;
        g.save(); g.beginPath(); g.ellipse(ex, ey, rx * k, ry * k, 0, 0, 7); g.clip();
        g.translate(px, py); g.rotate(s.stride * 0.09);
        g.drawImage(pic, hx - R2 / k, hy - R2 / k, R2 * 2 / k, R2 * 2 / k, -R2, -R2, R2 * 2, R2 * 2); g.restore();
      }
      for (const d of drones) if (d.z >= 0) drawDrone(d);                                               // дроны перед корпусом
      if (s.flash > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * s.flash / 0.25; g.fillStyle = 'rgba(255,90,60,1)'; g.beginPath(); g.ellipse(0, -h * 0.45, w * 0.35, h * 0.4, 0, 0, 7); g.fill(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      g.restore(); return;
    }
    g.save(); g.translate(x + lunge, y + S0 * 0.15);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, 2, 15, 5, 0, 0, 7); g.fill();
    let top = -26;
    switch (v.shape) {
      case 'tank':
        g.fillStyle = '#2a2a2a'; for (const wx of [-10, 0, 10]) { g.beginPath(); g.arc(wx, -2, 4, 0, 7); g.fill(); }
        g.fillStyle = '#5a5a48'; g.beginPath(); g.roundRect(-16, -14 - bob, 32, 11, 3); g.fill(); g.fillStyle = col; g.fillRect(-16, -9 - bob, 32, 2);
        g.fillStyle = '#6a6a58'; g.beginPath(); g.roundRect(-7, -21 - bob, 14, 8, 2); g.fill(); g.strokeStyle = '#3a3a30'; g.lineWidth = 3; g.beginPath(); g.moveTo(5 * f, -18 - bob); g.lineTo(18 * f, -19 - bob); g.stroke();
        top = -22; break;
      case 'walker':
        g.fillStyle = '#4a4038'; g.fillRect(-9, -12, 5, 12); g.fillRect(4, -12, 5, 12);
        g.fillStyle = '#7a6a58'; g.beginPath(); g.roundRect(-12, -30 - bob, 24, 19, 4); g.fill(); g.fillStyle = col; g.fillRect(-12, -22 - bob, 24, 2);
        g.fillStyle = '#5a5048'; g.beginPath(); g.arc(14 * f, -20 - bob, 6, 0, 7); g.fill(); top = -31; break;
      case 'arc':
        g.strokeStyle = '#6a7480'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-6, 0); g.lineTo(-3, -12); g.moveTo(6, 0); g.lineTo(3, -12); g.stroke();
        g.fillStyle = '#8a949e'; g.beginPath(); g.ellipse(0, -18 - bob, 10, 7, 0, 0, 7); g.fill();
        g.fillStyle = `rgba(94,230,255,${0.6 + 0.4 * Math.sin(time * 8)})`; g.beginPath(); g.arc(11 * f, -20 - bob, 3.5, 0, 7); g.fill(); top = -26; break;
      case 'crawler':
        g.strokeStyle = '#4a3020'; g.lineWidth = 2; for (const lx of [-9, -3, 3, 9]) { g.beginPath(); g.moveTo(lx, -8); g.lineTo(lx * 1.3, 0); g.stroke(); }
        g.fillStyle = '#8a4a2a'; g.beginPath(); g.ellipse(0, -11 - bob, 15, 7, 0, 0, 7); g.fill(); g.fillStyle = col; g.fillRect(-10, -12 - bob, 20, 2);
        g.fillStyle = '#3a3030'; g.fillRect(f > 0 ? 10 : -18, -14 - bob, 8, 3); if (s.atk) { g.fillStyle = 'rgba(255,140,50,.8)'; g.beginPath(); g.arc(20 * f, -13 - bob, 4, 0, 7); g.fill(); }
        top = -18; break;
      case 'forge':
        g.fillStyle = '#3a3030'; g.fillRect(-10, -8, 6, 8); g.fillRect(4, -8, 6, 8);
        g.fillStyle = '#5a4a40'; g.beginPath(); g.roundRect(-13, -30 - bob, 26, 23, 3); g.fill();
        for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(255,${110 + i * 30},50,${0.6 + 0.3 * Math.sin(time * 3 + i)})`; g.fillRect(-10, -26 + i * 6 - bob, 20, 3); }
        top = -31; break;
      default:                                                         // drone — носитель «Улей»
        g.fillStyle = '#6a7470'; g.beginPath(); g.ellipse(0, -16 - bob * 2, 14, 5, 0, 0, 7); g.fill(); g.fillStyle = col; g.fillRect(-10, -17 - bob * 2, 20, 2);
        for (let i = 0; i < 3; i++) { const a = time * 2 + i * 2.1; g.fillStyle = 'rgba(140,255,160,.9)'; g.beginPath(); g.arc(Math.cos(a) * 18, -24 + Math.sin(a) * 5, 2, 0, 7); g.fill(); }
        top = -22;
    }
    const h = HEROD(s.id), lk = h && h.look;                         // голова героя
    g.fillStyle = '#d8b090'; g.beginPath(); g.arc(0, top - 4 - bob, 4.5, 0, 7); g.fill();
    g.fillStyle = lk ? lk.hair : s.id === 'CHAR-003' ? '#e8e0d0' : '#4a3020'; g.beginPath(); g.arc(0, top - 5.5 - bob, 4.6, Math.PI, 0); g.fill();
    if (s.flash > 0) { const fr = g.createRadialGradient(0, -14, 2, 0, -14, 22); fr.addColorStop(0, `rgba(255,90,60,${0.55 * s.flash / 0.25})`); fr.addColorStop(1, 'rgba(255,90,60,0)'); g.globalCompositeOperation = 'lighter'; g.fillStyle = fr; g.beginPath(); g.arc(0, -14, 22, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
    g.restore();
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
      case 'capital':
        if (s.side === 'desert') {                     // Железный Предел: купол над входом под землю, мачты связи
          hexPath(x, y, u * 0.95, g); g.fillStyle = 'rgba(90,96,104,.5)'; g.fill(); g.strokeStyle = '#4a5058'; g.lineWidth = 4; g.stroke();
          g.fillStyle = '#7a848e'; g.beginPath(); g.ellipse(x, y - 6, 18, 14, 0, Math.PI, 0); g.fill(); g.fillStyle = '#3a4048'; g.fillRect(x - 6, y - 6, 12, 7);
          for (const sx of [-16, 16]) { g.strokeStyle = '#9aa4ab'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + sx, y + 2); g.lineTo(x + sx, y - 26); g.stroke(); g.fillStyle = `rgba(94,230,255,${0.5 + 0.4 * Math.sin(time * 3 + sx)})`; g.beginPath(); g.arc(x + sx, y - 27, 2.4, 0, 7); g.fill(); }
        } else {                                       // Цитадель Кадзэ: стены и пагода
          hexPath(x, y, u * 0.95, g); g.fillStyle = 'rgba(120,90,60,.5)'; g.fill(); g.strokeStyle = '#6a5038'; g.lineWidth = 4; g.stroke();
          for (let i = 0; i < 3; i++) { const w = 26 - i * 7, yy = y - 4 - i * 11; g.fillStyle = '#d8c39a'; g.fillRect(x - w / 2 + 3, yy - 9, w - 6, 9); g.fillStyle = '#7a2a20'; g.beginPath(); g.moveTo(x - w / 2 - 3, yy - 8); g.lineTo(x, yy - 15); g.lineTo(x + w / 2 + 3, yy - 8); g.fill(); }
          flag(x - 16, y + 4, '#b8342a'); flag(x + 16, y + 4, '#b8342a');
        }
        break;
      case 'village':
        if (s.side === 'desert') {                     // посёлок Наследников: металлические блоки, солнечная панель, антенна
          box(x - 9, y + 2, 12, 9, '#a8b0b8', '#6a727a'); box(x + 6, y - 2, 14, 11, '#a8b0b8', '#626a72'); box(x - 1, y + 9, 10, 7, '#a8b0b8', '#5a6268');
          g.fillStyle = '#2c4a6a'; g.beginPath(); g.moveTo(x - 14, y - 10); g.lineTo(x - 2, y - 14); g.lineTo(x + 2, y - 8); g.lineTo(x - 10, y - 4); g.fill();
          g.fillStyle = `rgba(94,230,255,${0.5 + 0.4 * Math.sin(time * 2.5 + x)})`; g.beginPath(); g.arc(x + 13, y - 16, 2, 0, 7); g.fill();
        } else if (s.side === 'east') {                // деревня кланов: домики под изогнутыми крышами, знамя
          const house = (hx, hy, w) => { g.fillStyle = '#d8c39a'; g.fillRect(hx - w / 2, hy - 8, w, 8); g.fillStyle = '#5a2a22'; g.beginPath(); g.moveTo(hx - w / 2 - 4, hy - 7); g.quadraticCurveTo(hx, hy - 17, hx + w / 2 + 4, hy - 7); g.fill(); };
          house(x - 9, y + 3, 12); house(x + 7, y - 1, 14); house(x, y + 11, 11); flag(x + 15, y + 6, '#b8342a');
        } else { glow(x, y - 6, 18, 'rgba(150,255,140,A)'); hut(x - 8, y + 6); hut(x + 8, y + 2); hut(x, y + 12); }
        break;
      case 'hub': {                                    // Меновой Узел: стена, шатры трёх цветов
        hexPath(x, y, u * 1.05, g); g.fillStyle = 'rgba(150,130,100,.45)'; g.fill(); g.strokeStyle = '#8a7a5a'; g.lineWidth = 3; g.stroke();
        const tent = (tx, ty, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(tx - 8, ty); g.lineTo(tx, ty - 12); g.lineTo(tx + 8, ty); g.fill(); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(tx - 2, ty - 5, 4, 5); };
        tent(x - 11, y + 4, '#b8342a'); tent(x + 10, y + 2, '#7a848e'); tent(x, y + 10, '#5a9a5a'); tent(x - 1, y - 4, '#d9a23e');
        g.strokeStyle = '#d9a23e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y - 26); g.stroke(); g.fillStyle = '#e6e0d6'; g.fillRect(x, y - 26, 10, 6);
        break;
      }
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
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt; frameDt = dt;
    stepUnit(base, dt); for (const s of outSquads()) stepUnit(s, dt);
    combatTick(dt); shakeT = Math.max(0, shakeT - dt);
    tradeTick(dt);
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
    const cp = campAt(k);                                            // №157: лагерь — «Осада», «Изучить»
    if (cp && k.seen && !drive) { showCmd(cx, cy, k, null, cp); return; }
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
      const st = q.state === 'home' && broken[q.vehicle] ? `разбит · ⚡${E().restore}` : q.siege ? 'осада' : q.state === 'out' && q.target ? 'в бою' : q.state === 'out' && (q.anim || q.path.length) ? (q.mode === 'auto' ? 'автобой' : 'в пути') : STATE[q.state];
      const on = (selAll && q.state === 'out') || (!selAll && sel === q.id && q.state !== 'home');
      const back = on && q.state === 'out' ? '<button data-do="back" title="Вернуть в капсулу">↩</button>' : '';
      const shb = `<button data-do="shield" class="sh ${shieldId === q.id ? 'on' : ''}" title="Щит отряда: в осаде эта техника бьёт первой">🛡</button>`;   // №157
      slots.push(`<div class="ow-slot ${on ? 'on' : ''} st-${q.state}" data-u="${q.id}" title="${d.name} · ${(AB.VEHICLES[q.vehicle] || {}).name || 'экзокостюм'} · скорость ${(AB.VEHICLES[q.vehicle] || {}).speed || '?'} кл/мин · ${st}"><canvas data-pt="${q.id}"></canvas><img src="${AB.IsoRoster.vimg(q.vehicle)}" alt=""><b>${d.name}</b><span>${st}</span><u><i style="width:${hp}%"></i></u>${back}${shb}</div>`);
    }
    // №171: только активный отряд (до 5); лишние ячейки («+», «Ангар», замок) убраны по решению автора
    const allB = document.querySelector('[data-sf-allsel]'); if (allB) allB.classList.toggle('on', selAll);
    const sig = slots.join('') + sel + drive + selAll;
    if (sig === barSig) return;
    barSig = sig;
    const el = document.getElementById('sf-slots'); el.innerHTML = slots.join('');
    for (const c2 of el.querySelectorAll('canvas[data-pt]')) AB.IsoRoster.portrait(c2, c2.dataset.pt, 1);
  }
  // войти в капсулу: отряды стыкуются, карта закрывается; выйдя из капсулы — снова здесь (iso-acts: leaveBase)
  function enterBase() {
    for (const q of squads) if (q.state !== 'home') dock(q);
    save(); close();
    AB.IsoActs.enterBase();
  }
  // №155: «Моя база»: камера уже на капсуле — войти сразу; иначе первое нажатие подводит камеру,
  // повторное (в течение 6 с) — входит, даже если у края карты камера не может встать ровно по центру
  let baseArmT = 0;
  function myBaseTap() {
    const c = posOf(base), k = kScale();
    const onScreen = Math.abs(c.x - cam.x) * k < cv.width * 0.3 && Math.abs(c.y - cam.y) * k < cv.height * 0.3;
    const armed = performance.now() - baseArmT < 6000;
    if (armed || (onScreen && follow && flyU === base)) { baseArmT = 0; enterBase(); return; }
    sel = drive ? 'base' : sel; flyU = base; follow = true; barSig = ''; baseArmT = performance.now();
    say('Капсула. Нажмите «Моя база» ещё раз — войти');
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
      const al = e.target.closest('[data-ally]'); if (al) { chooseAlly(al.dataset.ally); return; }
      if (e.target.closest('[data-sf-act]') && storyCard && storyCard.quest) { const { quest, st } = storyCard; storyCard = null; hidePop(); questAct(quest, st); return; }
      if (e.target.closest('[data-sf-act]') && storyCard) { storyCard = null; hidePop(); storyAdvance(); return; }
      if (e.target.closest('[data-sf-allsel]')) { selAll = !selAll; if (selAll) drive = false; barSig = ''; say(selAll ? 'Все: приказ получает весь отряд' : 'Приказ получает выбранный герой'); }
      if (e.target.closest('[data-sf-squad]')) { AB.IsoRoster.open(); }
      // №157: «⟲» — выбрать всех и вернуть домой, в капсулу
      if (e.target.closest('[data-sf-home]')) { const outs = outSquads(); if (!outs.length) say('Все в капсуле'); else { selAll = true; drive = false; for (const q of outs) { q.target = null; q.siege = null; recall(q.id); } barSig = ''; say('Все — домой, в капсулу'); } }
      const cb = e.target.closest('[data-cmd]'); if (cb) { command(cb.dataset.cmd); return; }
      if (e.target.closest('[data-sf-items]')) AB.IsoInventory.open();
      if (e.target.closest('[data-sf-units]')) AB.IsoRoster.units();
      if (e.target.closest('[data-sf-drive]')) { drive = !drive; selAll = false; if (drive) { sel = 'base'; flyU = base; say('Вести базу: вкл — нажмите на клетку, капсула поедет туда'); } else say('Вести базу: выкл'); barSig = ''; }
      const bk = e.target.closest('[data-do="back"]'), sl = e.target.closest('[data-u]');
      if (bk && sl) { recall(sl.dataset.u); return; }
      const sh = e.target.closest('[data-do="shield"]');
      if (sh && sl) { shieldId = shieldId === sl.dataset.u ? null : sl.dataset.u; qs(); qSave(); barSig = ''; say(shieldId ? `Щит отряда — ${herName(shieldId)}: в осаде бьёт первым` : 'Щит отряда снят'); return; }
      if (sl && AB.IsoRoster.isOpen()) { AB.IsoRoster.focus(sl.dataset.u); return; }   // №160: открыт «Отряд» — показать этого героя
      if (sl) { const q = unit(sl.dataset.u); if (!q) return; drive = false; selAll = false; if (q.state === 'home') deploy(q.id); else { sel = q.id; flyU = q; follow = true; barSig = ''; } }
    });
    window.addEventListener('resize', () => { if (open_) fit(); });
    AB.IsoMapUI.fan(document.getElementById('sf-mybase'), document.getElementById('sf-fan'), { tap: myBaseTap, pick: scaleTo });
  }
  function say(t) { const el = document.getElementById('sf-say'); if (!el) return; el.textContent = t; el.classList.add('show'); clearTimeout(say.t); say.t = setTimeout(() => el.classList.remove('show'), 2200 + t.length * 40); }

  // ---------- сохранение (только эта зона) ----------
  function save() {
    try { localStorage.setItem(SAVE, JSON.stringify({ base: [base.c, base.r], sq: squads.map((q) => [q.id, q.state === 'home' ? 'home' : 'out', curCell(q).c, curCell(q).r]), seen: cells.filter((k) => k.seen).map((k) => idx(k.c, k.r)), energy, broken })); } catch (e) { /* нет хранилища — не беда */ }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE) || 'null'); if (!s || !s.base) return false;
      Object.assign(base, { c: s.base[0], r: s.base[1], path: [], anim: null });
      squads.length = 0; syncSquads();
      for (const [id, state, c, r] of s.sq || []) { const q = unit(id); if (q && state === 'out' && passable(cell(c, r))) Object.assign(q, { state: 'out', c, r }); }
      for (const i of s.seen) if (cells[i] && !cells[i].seen) { cells[i].seen = true; clearFog(cells[i]); }
      if (typeof s.energy === 'number') energy = s.energy;
      for (const k of Object.keys(broken)) delete broken[k]; Object.assign(broken, s.broken || {});
      return passable(cell(base.c, base.r));
    } catch (e) { return false; }
  }

  // ---------- вход в зону ----------
  // fresh — после всплытия: новая случайная точка, туман заново
  function enter(fresh = true) {
    init();
    if (!built || fresh) { built = false; build(); trade = null; }
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
    tradeInit();
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
      for (const k of cells) if (dist(k, u) <= 3) { if (k.side === 'organic' || k.side === 'swamp' || k.belt === 'east_organic') w++; else d++; }
      const n = Math.max(1, d + w); return { desert: d / n, swamp: w / n };
    }, active: () => inZone, enterBase, deploy, recall,
    revealAll() { for (const k of cells) if (!k.seen) { k.seen = true; clearFog(k); } save(); },
    zoom: (z) => setZoom(z),
    // для проверок
    _cells: () => cells, _sites: () => sites, _lanes: () => lanes, _party: () => selU(), _base: () => base, _squads: () => squads, _drive: (v) => { drive = v; },
    _goTo: (c, r) => goTo(mover(), cell(c, r)), _sel: (id) => { sel = id; }, _tap: (c, r) => tap(cell(c, r)), _pop: () => popSite, _zoom: () => zoomK, _fan: (key) => scaleTo(key), _trade: () => trade, _tradeTick: (dt) => tradeTick(dt), _mobs: () => mobs, _shots: () => shots, _cmd: (kind) => command(kind), _tapAt: (c, r) => tap(cell(c, r), 400, 200), _selAll: (v) => { selAll = v; }, _story: () => story, _storyNext: () => storyAdvance(), _act: () => document.querySelector('#sf-pop [data-sf-act]').click(), _passable: (c, r) => passable(cell(c, r)),
    // №191: настройки осады — из окна «Отряд»: щитоносец и «вплотную» (по умолчанию — на максимальной дальности)
    siegeCfg: () => ({ shield: shieldId, form: { ...(qs().form || {}) } }),
    setShield: (id) => { shieldId = shieldId === id ? null : id; qs(); qSave(); barSig = ''; },
    setForm: (id, pos) => { qs().form = qs().form || {}; if (pos === 'front') qs().form[id] = 'front'; else delete qs().form[id]; qSave(); },
    _siegeGo: () => { const b = document.querySelector('#sf-form [data-fm="go"]'); if (b) b.click(); }, _rep: () => rep, _formSet: (id, pos) => { qs().form = qs().form || {}; qs().form[id] = pos; },
    _camps: () => camps, _cam: () => ({ x: cam.x, y: cam.y, follow }), _loot: () => loot, _allies: () => allies, _energy: (v) => { if (typeof v === 'number') energy = v; return energy; }, _broken: () => broken,
    _quests: () => qs(), _qAdvance: (id) => qAdvance(QS().find((q) => q.id === id)), _shield: (id) => { shieldId = id; }, _points: () => camps.filter((c) => c.pt), _own: () => qs().own, _raid: (key) => startRaid(camps.find((c) => c.key === key)), _tapCamp: (key) => { const cp = camps.find((x) => x.key === key); tap(cell(cp.c, cp.r), 400, 200); },
    _study: () => document.querySelector('#sf-pop p').textContent, _choose: (side) => chooseAlly(side),
    _path: (a, b) => search(cell(a[0], a[1]), (m) => m.c === b[0] && m.r === b[1], (m) => (passable(m) ? cost(m) : Infinity)),
  };
})();
