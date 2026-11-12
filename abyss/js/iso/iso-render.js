// =====================================================================
// ISO RENDER (этап 1 изометрии, дополнение №45). Изометрическая проекция
// 2:1 в духе Diablo II: клетка 64×32 пикселя, стены и предметы — объёмные
// 2D-блоки, персонажи — существующие составные фигуры (AB.Render.drawFigure).
// Сетка на экран не выводится. Камера держит ведущего в центре,
// приближение/отдаление, подстройка под размер экрана и плотность пикселей.
// Стены и предметы, закрывающие отряд, становятся полупрозрачными.
// =====================================================================

AB.IsoRender = (() => {
  const TW = 64, TH = 32, WALL_FULL = 86;
  let WALL_H = WALL_FULL;                 // №79: в базе-капсуле стены низкие, чтобы не закрывать обзор
  const ZMIN = 0.45, ZMAX = 2.2;
  const FIG_K = 0.62;                 // масштаб фигур вида сбоку в изометрии
  const U = AB.util;
  let cv, ctx, lightCv, lctx, floorCv = null, floorOX = 0;
  let dpr = 1, vw = 0, vh = 0;
  const cam = { x: 0, y: 0, z: 1 };
  let time = 0, snap = true;
  const fade = new Map();             // ключ блока → текущая непрозрачность
  let marker = null;                  // куда идёт ведущий

  try { const z = parseFloat(localStorage.getItem('abyss_iso_zoom')); if (z >= ZMIN && z <= ZMAX) cam.z = z; } catch (e) { /* хранилище недоступно */ }

  // мир (клетки) → экран (пиксели мира, до камеры)
  const toScreen = (x, y) => ({ x: (x - y) * TW / 2, y: (x + y) * TH / 2 });
  const toWorld = (sx, sy) => ({ x: sy / TH + sx / TW, y: sy / TH - sx / TW });

  const PROP_LOOK = {
    bunk: { h: 30, top: '#3b4048', l: '#2a2e35', r: '#22262c' },
    locker: { h: 70, top: '#4a525c', l: '#343a42', r: '#2b3037' },
    table: { h: 24, top: '#47423a', l: '#332f29', r: '#29261f' },
    crate: { h: 40, top: '#5a4a32', l: '#433722', r: '#382e1c' },
    shelf: { h: 64, top: '#44494f', l: '#30343a', r: '#272b30' },
    algaetank: { h: 58, top: '#2f6b4a', l: '#1e4a33', r: '#173c29', glow: [90, 230, 130] },
    algaefarm: { h: 34, top: '#3e5a44', l: '#2a3f2f', r: '#223427', glow: [120, 255, 160] },
    pipe: { h: 76, top: '#5a5550', l: '#3d3935', r: '#33302c' },
    pump: { h: 46, top: '#55504a', l: '#3b3732', r: '#312e2a' },
    reservoir: { h: 66, top: '#2a4f52', l: '#1c383a', r: '#173032', glow: [80, 200, 190] },
    cabindoor: { h: 84, top: '#3d3a33', l: '#4d473c', r: '#3a362e' },
    cryopod: { h: 40, top: '#3c5560', l: '#2a3a42', r: '#223038' },
    console: { h: 52, top: '#2d3640', l: '#38424c', r: '#2a323a' },
    medbed: { h: 22, top: '#4a4f55', l: '#33373c', r: '#2a2e33' },
    panel: { h: 70, top: '#3a3f45', l: '#4b4f52', r: '#3a3d40' },
    cable: { h: 26, top: '#3c3630', l: '#2e2925', r: '#26221e' },
    generator: { h: 64, top: '#4a4438', l: '#3a3428', r: '#2f2a20' },
    fueltank: { h: 48, top: '#5a3a2a', l: '#46301f', r: '#3a2818' },
    glass: { h: 90, top: 'rgba(120,200,230,.25)', l: 'rgba(120,200,230,.18)', r: 'rgba(120,200,230,.12)', edge: 'rgba(160,230,255,.4)' },
    exorack: { h: 96, top: '#3a3f44', l: '#4a5058', r: '#383d44' },
    // №55: мастерская, ангар, дно
    bench: { h: 30, top: '#55504a', l: '#403b35', r: '#35312c' },
    capsule: { h: 70, top: '#c9a24a', l: '#8a6e30', r: '#6e5726', glow: [255, 210, 120] },
    rock: { h: 46, top: '#2a3438', l: '#1d2528', r: '#171e21' },
    crystal: { h: 34, top: '#9a6cff', l: '#6a44c0', r: '#55369c', glow: [170, 110, 255] },
    // №61: гнездо модуля в капсуле — пустое / с пристыкованным модулем
    bay: { h: 14, top: '#2a2f34', l: '#202428', r: '#1a1d20' },
    baybuilt: { h: 54, top: '#3e6a58', l: '#2c4c40', r: '#243f35', glow: [120, 255, 170] },
    // №71: устройства конструктора базы
    printer: { h: 62, top: '#4a5560', l: '#3a434c', r: '#2e353c', glow: [255, 170, 90] },
    rack: { h: 74, top: '#5a5246', l: '#433d33', r: '#38322a' },
    pile: { h: 18, top: '#5c4a36', l: '#463828', r: '#3a2e20' },
    intake: { h: 66, top: '#2c4a56', l: '#203a44', r: '#1a3038', glow: [80, 200, 230] },
    algae: { h: 50, top: '#2f6b4a', l: '#1e4a33', r: '#173c29', glow: [90, 230, 130] },
    bioreactor: { h: 70, top: '#4a5a3a', l: '#38462c', r: '#2e3a24', glow: [170, 230, 90] },
    terminal: { h: 64, top: '#2d3a4a', l: '#38465a', r: '#2a3444', glow: [120, 180, 255] },
    drill: { h: 72, top: '#5a4a32', l: '#46392a', r: '#3a2e20', glow: [255, 170, 90] },
    reactor: { h: 80, top: '#3a4a5a', l: '#2c3a48', r: '#24303c', glow: [150, 120, 255] },
    battery: { h: 46, top: '#3c4a3a', l: '#2c3a2a', r: '#243024', glow: [120, 255, 140] },
    turbine: { h: 58, top: '#3a4650', l: '#2c363e', r: '#242c33', glow: [94, 230, 255] },
    devframe: { h: 10, top: 'rgba(94,230,255,.25)', l: 'rgba(94,230,255,.18)', r: 'rgba(94,230,255,.12)', edge: 'rgba(94,230,255,.6)' },
  };
  const ROOM_TINT = {
    'ROOM-002': [52, 48, 50], 'ROOM-005': [56, 54, 50], 'ROOM-013': [40, 56, 48],
    'ROOM-014': [48, 46, 46], 'ROOM-015': [50, 48, 44], 'ROOM-016': [38, 50, 52],
    'ROOM-001': [42, 50, 58], 'ROOM-011': [50, 46, 44], 'ROOM-003': [54, 50, 42], 'ROOM-012': [36, 44, 46],
    'ROOM-008': [44, 52, 60], 'ROOM-007': [46, 54, 52], 'ROOM-006': [52, 50, 46], 'ROOM-009': [44, 48, 50], 'ROOM-010': [46, 50, 56],
    'ROOM-004': [52, 50, 44], 'ROOM-017': [44, 50, 58], 'ROOM-018': [42, 48, 54], 'ROOM-019': [26, 38, 44], 'ROOM-024': [40, 38, 40],
    'ROOM-025': [50, 52, 54], 'ROOM-026': [42, 44, 48],   // №71: помещения, построенные игроком
  };

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    lightCv = document.createElement('canvas'); lctx = lightCv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    AB.Bus.on('iso:world', () => { floorCv = null; snap = true; });
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = cv.clientWidth; vh = cv.clientHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    lightCv.width = Math.ceil(cv.width / 2); lightCv.height = Math.ceil(cv.height / 2);
  }
  // на маленьких экранах чуть крупнее не надо — видно больше; на больших — ровно
  const baseScale = () => dpr * U.clamp(Math.min(vw, vh) / 620, 0.62, 1.15);
  const S = () => baseScale() * cam.z;

  // экран (CSS-пиксели) → мир (клетки)
  function pick(cx, cy) {
    const r = cv.getBoundingClientRect();
    const px = (cx - r.left) * dpr, py = (cy - r.top) * dpr;
    return toWorld((px - cv.width / 2) / S() + cam.x, (py - cv.height / 2) / S() + cam.y);
  }
  // мир → экран (CSS-пиксели), для интерфейса и проверок
  function screenOf(x, y) {
    const p = toScreen(x, y);
    return { x: ((p.x - cam.x) * S() + cv.width / 2) / dpr, y: ((p.y - cam.y) * S() + cv.height / 2) / dpr };
  }

  // ---------- Пол: один раз в отдельный холст (сетки не видно) ----------
  function buildFloor() {
    const { w, h } = AB.IsoWorld.size();
    floorOX = h * TW / 2 + TW;
    const c = document.createElement('canvas');
    c.width = (w + h) * TW / 2 + TW * 2; c.height = (w + h) * TH / 2 + TH * 2;
    const g = c.getContext('2d');
    const rng = U.rng(17);
    const diamond = (x, y, grow) => {
      const p = toScreen(x, y), cx = p.x + floorOX, cy = p.y + TH / 2;
      g.beginPath();
      g.moveTo(cx, cy - TH / 2 - grow); g.lineTo(cx + TW / 2 + grow * 2, cy); g.lineTo(cx, cy + TH / 2 + grow); g.lineTo(cx - TW / 2 - grow * 2, cy);
      g.closePath();
      return { cx, cy };
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = AB.IsoWorld.cell(x, y);
      if (k !== AB.IsoWorld.FLOOR && k !== AB.IsoWorld.PROP && k !== AB.IsoWorld.DOOR) continue;
      const t = ROOM_TINT[AB.IsoWorld.room(x + 0.5, y + 0.5)] || [48, 48, 48];
      const v = (rng() - 0.5) * 6;
      g.fillStyle = `rgb(${t[0] + v | 0},${t[1] + v | 0},${t[2] + v | 0})`;
      diamond(x, y, 0.6); g.fill();
    }
    // грязь, пятна, потёртости — крупнее клетки, чтобы сетка не читалась
    for (let i = 0; i < w * h * 0.35; i++) {
      const x = rng() * w, y = rng() * h;
      if (AB.IsoWorld.cell(Math.floor(x), Math.floor(y)) !== AB.IsoWorld.FLOOR) continue;
      const p = toScreen(x, y), cx = p.x + floorOX, cy = p.y, r = 8 + rng() * 40;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      const dark = rng() < 0.7;
      gr.addColorStop(0, dark ? `rgba(0,0,0,${0.08 + rng() * 0.12})` : `rgba(255,240,220,${0.03 + rng() * 0.04})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.save(); g.translate(cx, cy); g.scale(1, 0.5); g.translate(-cx, -cy);
      g.fillRect(cx - r, cy - r, r * 2, r * 2); g.restore();
    }
    // редкие швы палубных плит — длинными линиями, не по клеткам
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
    for (let i = 0; i < w * h * 0.04; i++) {
      const x = Math.floor(rng() * w), y = Math.floor(rng() * h), along = rng() < 0.5, len = 2 + Math.floor(rng() * 4);
      if (AB.IsoWorld.cell(x, y) !== AB.IsoWorld.FLOOR) continue;
      const a = toScreen(x, y), b = toScreen(x + (along ? len : 0), y + (along ? 0 : len));
      g.beginPath(); g.moveTo(a.x + floorOX, a.y); g.lineTo(b.x + floorOX, b.y); g.stroke();
    }
    floorCv = c;
  }

  // ---------- Блоки: стена или часть предмета ----------
  function block(x, y, hgt, look, alpha, faces) {
    const n = toScreen(x, y), e = toScreen(x + 1, y), s = toScreen(x + 1, y + 1), w = toScreen(x, y + 1);
    ctx.globalAlpha = alpha;
    if (faces.l) {   // юго-западная грань
      ctx.fillStyle = look.l;
      ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.fill();
    }
    if (faces.r) {   // юго-восточная грань
      ctx.fillStyle = look.r;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.lineTo(e.x, e.y - hgt); ctx.lineTo(s.x, s.y - hgt); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = look.top;
    ctx.beginPath(); ctx.moveTo(n.x, n.y - hgt); ctx.lineTo(e.x, e.y - hgt); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.fill();
    if (look.edge) { ctx.strokeStyle = look.edge; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  const WALL_LOOK = { top: '#23262b', l: '#3a3f47', r: '#2c3036', edge: 'rgba(255,255,255,.04)' };
  const DOOR_LOOK = { top: '#4a4434', l: '#5a5240', r: '#463f30', edge: 'rgba(230,190,60,.35)' };
  const EXIT_LOOK = { top: '#2a2f36', l: '#454c55', r: '#363c44', edge: 'rgba(94,230,255,.25)' };

  // закрывает ли блок кого-то из отряда (он ближе к камере и перекрывает фигуру на экране)
  function occludes(x, y, hgt, party) {
    const c = toScreen(x + 0.5, y + 0.5);
    for (const m of party) {
      if (x + y + 1 <= m.x + m.y) continue;
      const p = toScreen(m.x, m.y);
      if (Math.abs(c.x - p.x) < TW * 0.9 && c.y + TH / 2 > p.y - 96 && c.y - hgt - TH / 2 < p.y) return true;
    }
    return false;
  }
  function alphaFor(key, hidden, dt) {
    const cur = fade.has(key) ? fade.get(key) : 1;
    const want = hidden ? 0.22 : 1;
    const v = cur + (want - cur) * Math.min(1, dt * 9);
    if (Math.abs(v - 1) < 0.01) fade.delete(key); else fade.set(key, v);
    return v;
  }

  // ---------- Кадр ----------
  function frame(dt) {
    WALL_H = WALL_FULL;               // №80: передние стены теперь — бортик везде, задние снова в полный рост и в базе
    time += dt;
    if (AB.Render && AB.Render.tick) AB.Render.tick(dt);
    if (!floorCv) buildFloor();
    const party = AB.IsoParty.members(), l = AB.IsoParty.lead();
    if (!l) return;
    const fp = focusPt || l;                          // №68: в базе камера держит всю капсулу
    const t = toScreen(fp.x, fp.y - 0.4);
    if (snap) { cam.x = t.x; cam.y = t.y; snap = false; }
    cam.x = U.lerp(cam.x, t.x, 1 - Math.pow(0.002, dt));
    cam.y = U.lerp(cam.y, t.y, 1 - Math.pow(0.002, dt));
    const sc = S();
    const fx = AB.IsoStory ? AB.IsoStory.fx : {};
    if (fx.shake > 0) { cam.x += (Math.random() - 0.5) * fx.shakePower * 6; cam.y += (Math.random() - 0.5) * fx.shakePower * 6; }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#030305';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(sc, 0, 0, sc, cv.width / 2 - cam.x * sc, cv.height / 2 - cam.y * sc);
    ctx.imageSmoothingEnabled = true;

    // пол
    ctx.drawImage(floorCv, -floorOX, -TH / 2);
    drawFloorMarks();
    drawMarker();

    // видимая область в клетках (с запасом на высоту стен)
    const hw = cv.width / 2 / sc + TW * 2, hh = cv.height / 2 / sc + WALL_H + TH * 2;
    const visible = (sx, sy) => Math.abs(sx - cam.x) < hw && sy - cam.y < hh && cam.y - sy < hh + WALL_H;

    // всё объёмное — по глубине (x + y): дальнее раньше
    const list = [];
    const { w, h } = AB.IsoWorld.size();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = AB.IsoWorld.cell(x, y);
      if (k !== AB.IsoWorld.WALL || exitWall(x, y)) continue;
      const c = toScreen(x + 0.5, y + 0.5);
      if (!visible(c.x, c.y)) continue;
      list.push({ d: x + y + 1, k: 'w', x, y });
    }
    for (const p of AB.IsoWorld.props()) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      const c = toScreen(x + 0.5, y + 0.5);
      if (visible(c.x, c.y)) list.push({ d: x + y + 1, k: 'p', x, y, p });
    }
    for (const m of party) list.push({ d: m.x + m.y + 0.01, k: 'c', m });
    for (const m of AB.IsoParty.npcs()) list.push({ d: m.x + m.y + 0.01, k: 'c', m, npc: true });
    for (const e of AB.IsoEnemies.all()) { const c = toScreen(e.x, e.y); if (visible(c.x, c.y)) list.push({ d: e.x + e.y + 0.005, k: 'e', e }); }
    // двери сектора (створки), выходы в стене, предметы на полу
    for (const dr of AB.IsoInteract.doors()) if (dr.anim > 0.03) for (const [x, y] of dr.tiles) list.push({ d: x + y + 1, k: 'd', x, y, dr });
    for (const e of AB.IsoWorld.layout().exits || []) if (!e.floor) {
      const wx = e.x + (e.wall === 'w' ? -1 : e.wall === 'e' ? 1 : 0), wy = e.y + (e.wall === 'n' ? -1 : e.wall === 's' ? 1 : 0);
      list.push({ d: wx + wy + 1.001, k: 'x', x: wx, y: wy, e });
    }
    const near = AB.IsoInteract.nearest(), hov = AB.IsoInteract.hovered();
    hl = new Set([near && near.id, hov && hov.id]);
    for (const t of AB.IsoInteract.targets()) if (t.kind === 'item') list.push({ d: t.x + t.y, k: 'i', t });
    // №57: турели оружейной и пушки в зале Колосса
    const lay0 = AB.IsoWorld.layout(), ns0 = AB.IsoNest.state(), bs0 = AB.IsoBoss.state();
    if (lay0.nest && lay0.nest.turrets) lay0.nest.turrets.forEach((g, i) => list.push({ d: g.x + g.y + 1, k: 'g', g, on: !!ns0 && i < ns0.turrets, big: false }));
    if (lay0.boss) lay0.boss.cannons.forEach((g, i) => list.push({ d: g.x + g.y + 1, k: 'g', g, on: !!bs0 && bs0.on[i], big: true }));
    list.sort((a, b) => a.d - b.d);

    for (const o of list) {
      if (o.k === 'w') {
        // №80: передние (нижние, ближние к камере) стены не рисуем во весь рост — только низкий бортик,
        // чтобы не закрывали обзор; задние стены — как раньше. Столкновения не меняются.
        const W = AB.IsoWorld, fl = (x, y) => { const c = W.cell(x, y); return c === W.FLOOR || c === W.PROP || c === W.DOOR; };
        const back = fl(o.x + 1, o.y) || fl(o.x, o.y + 1) || fl(o.x + 1, o.y + 1);
        const hgt = back ? WALL_H : 7;
        const hid = back && occludes(o.x, o.y, hgt, party);
        const a = alphaFor(`w${o.x},${o.y}`, hid, dt);
        block(o.x, o.y, hgt, WALL_LOOK, a, { l: W.cell(o.x, o.y + 1) !== W.WALL, r: W.cell(o.x + 1, o.y) !== W.WALL });
      } else if (o.k === 'p') {
        const look = o.p.bay && AB.IsoActs.built(o.p.bay) ? PROP_LOOK.baybuilt : PROP_LOOK[o.p.kind] || PROP_LOOK.crate;
        const hid = occludes(o.x, o.y, look.h, party);
        const a = alphaFor(`p${o.x},${o.y}`, hid, dt);
        const inside = (xx, yy) => xx >= o.p.x && yy >= o.p.y && xx < o.p.x + o.p.w && yy < o.p.y + o.p.h;
        block(o.x, o.y, look.h, look, a, { l: !inside(o.x, o.y + 1), r: !inside(o.x + 1, o.y) });
        if ((o.p.equip && hl.has(`equip:${o.p.equip}`)) || (o.p.container && [...hl].some((h) => h && h.startsWith('box:') && h.endsWith(`:${o.p.container}`)))) outlineTop(o.x, o.y, look.h);
        if (o.p.kind === 'cryopod') podGlass(o.x, o.y, look.h, o.p);
        // подпись заглушки: ID картинки или вид предмета — на первой клетке предмета
        if (o.x === o.p.x + o.p.w - 1 && o.y === o.p.y + o.p.h - 1) propTag(o.p, look);
      } else if (o.k === 'd') {
        const hid = occludes(o.x, o.y, 74, party);
        const a = alphaFor(`d${o.x},${o.y}`, hid, dt);
        const dr = o.dr, along = (xx, yy) => dr.tiles.some(([tx, ty]) => tx === xx && ty === yy);
        const grate = dr.barricade && dr.state === 'closed';   // №59: решётка — сквозь неё видно
        block(o.x, o.y, 74 * o.dr.anim, DOOR_LOOK, grate ? a * 0.35 : a, { l: !along(o.x, o.y + 1), r: !along(o.x + 1, o.y) });
        if (grate) {
          const b0 = toScreen(o.x + 0.5, o.y), b1 = toScreen(o.x + 0.5, o.y + 1);
          ctx.strokeStyle = 'rgba(190,190,180,.85)'; ctx.lineWidth = 2;
          for (let i = 0; i <= 4; i++) { const t = i / 4, x = b0.x + (b1.x - b0.x) * t, y = b0.y + (b1.y - b0.y) * t; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 70); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(b0.x, b0.y - 35); ctx.lineTo(b1.x, b1.y - 35); ctx.moveTo(b0.x, b0.y - 68); ctx.lineTo(b1.x, b1.y - 68); ctx.stroke();
        }
        if (o.x === dr.tiles[dr.tiles.length - 1][0] && o.y === dr.tiles[dr.tiles.length - 1][1]) doorLamp(dr);
      } else if (o.k === 'x') {
        const a = alphaFor(`w${o.x},${o.y}`, occludes(o.x, o.y, WALL_H, party), dt);
        block(o.x, o.y, WALL_H, EXIT_LOOK, a, { l: true, r: true });
        exitLamp(o.e, o.x, o.y);
      } else if (o.k === 'i') drawItem(o.t);
      else if (o.k === 'g') drawGun(o.g, o.on, o.big);
      else if (o.k === 'e') drawEnemy(o.e);
      else drawMember(o.m, o.m === l && !o.npc);
    }

    drawTrueForm(fx);
    updateFx(dt);
    drawFx();
    lighting(sc, party);
    for (const m of party) if (!m.hidden) nameTag(m, m === l);
    for (const m of AB.IsoParty.npcs()) if (!m.hidden) nameTag(m, false);
    beacons();
    defenseMarks();
    overlays(fx);
    for (const e of AB.IsoEnemies.all()) enemyBar(e);
    if (AB.BaseView) { ctx.setTransform(sc, 0, 0, sc, cv.width / 2 - cam.x * sc, cv.height / 2 - cam.y * sc); AB.BaseView.drawTop(ctx, toScreen, time); }   // №71: станки, склады, груз
  }

  // №57: турель / пушка — тумба со стволом; включена — светится и смотрит на ближайшего врага
  function drawGun(g, on, big) {
    const c = toScreen(g.x + 0.5, g.y + 0.5), h = big ? 34 : 22;
    block(g.x, g.y, h, { h, top: on ? '#4a5a52' : '#3a3f44', l: '#2e3338', r: '#25292d' }, 1, { l: true, r: true });
    let ang = -0.6;
    const foe = AB.IsoEnemies.alive().sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))[0];
    if (on && foe) { const f = toScreen(foe.x, foe.y); ang = Math.atan2(f.y - (c.y - h), f.x - c.x); }
    ctx.save(); ctx.translate(c.x, c.y - h - 4); ctx.rotate(ang);
    ctx.fillStyle = on ? '#9adbb0' : '#5a6066'; ctx.fillRect(0, -3, big ? 30 : 20, big ? 7 : 5);
    ctx.restore();
    ctx.fillStyle = on ? 'rgba(120,255,170,.95)' : 'rgba(255,90,60,.8)';
    ctx.beginPath(); ctx.arc(c.x, c.y - h - 4, big ? 6 : 4, 0, 7); ctx.fill();
  }
  // приёмник биоматериала на полу: кольцо с подписью
  function drawPad(p, text, col) {
    const c = toScreen(p.x, p.y), a = 0.5 + Math.sin(time * 4) * 0.25;
    ctx.strokeStyle = `rgba(${col},${a})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 22, 11, 0, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 12, 6, 0, 0, 7); ctx.stroke();
    ctx.font = '600 10px "Oswald", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = `rgba(${col},.95)`;
    ctx.fillText(text, c.x, c.y + 26);
  }
  function defenseMarks() {
    const L = AB.IsoWorld.layout(), ns = AB.IsoNest.state(), bs = AB.IsoBoss.state();
    if (ns && !ns.over && L.nest) drawPad(L.nest.pad, `Приёмник: ${AB.IsoStash.count('ITEM-007')} био`, '120,255,170');
    if (bs && L.boss) L.boss.cannons.forEach((c, i) => { if (!bs.on[i]) drawPad(c.pad, `Пушка ${bs.bank[i]}/${L.boss.cost}`, '255,200,90'); });
    // прочность дверей лаборатории
    for (const d of AB.IsoInteract.doors()) {
      if (!d.barricade || !ns) continue;
      const [x, y] = d.tiles[0], p = toScreen(x + 0.5, y + 0.5), w = 34, f = d.hp / d.max;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(p.x - w / 2, p.y - 92, w, 5);
      ctx.fillStyle = d.state === 'broken' ? '#444' : f > 0.5 ? '#e0b640' : f > 0.25 ? '#ff8a3a' : '#ff3b2f';
      ctx.fillRect(p.x - w / 2, p.y - 92, w * f, 5);
      if (d.hitT) { ctx.fillStyle = 'rgba(255,80,40,.5)'; ctx.fillRect(p.x - w / 2, p.y - 92, w, 5); }
      if (d.state === 'broken') { ctx.font = '600 10px "Oswald", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff6a4a'; ctx.fillText('ВЫБИТА', p.x, p.y - 96); }
    }
  }

  // Метки того, с чем можно что-то сделать (№55): поверх темноты — чтобы не пройти мимо.
  // Предметы на полу и не обысканные тайники — жёлтый ромб и луч света; оружие — ярче и с названием;
  // оборудование, которое ещё не готово, — голубой ромб; запертая дверь, которую можно взломать, — тоже.
  function beacons() {
    const l = AB.IsoParty.lead();
    for (const t of AB.IsoInteract.targets()) {
      let col = null, big = false, text = null;
      if (t.kind === 'item') { const d = AB.ID.get(t.ref.item); col = d.weapon ? '255,200,90' : '255,214,120'; big = !!d.weapon || d.category === 'key'; text = big ? d.name : null; }
      else if (t.kind === 'container') { if (AB.Rooms.isSearched(t.room, t.ref.key)) continue; const loot = t.ref.loot || []; big = loot.some(([i]) => AB.ID.get(i).weapon); col = big ? '255,200,90' : '255,214,120'; text = big ? t.name : null; }
      else if (t.kind === 'equip') { if (AB.Equip.state(t.ref.id) === 'done' || t.ref.hidden) continue; col = '94,230,255'; }
      else if (t.kind === 'bay') { const on = AB.IsoActs.built(t.ref.id), can = AB.IsoActs.canBuild(t.ref.id); col = on ? '120,255,170' : can ? '94,230,255' : '150,150,150'; big = true; text = `${t.name}${on ? '' : can ? ' — можно пристыковать' : ' — нужны ресурсы'}`; }
      else if (t.kind === 'pilot' || t.kind === 'stash') { col = '94,230,255'; text = t.name; }
      else if (t.kind === 'door' && t.ref.def.hack && t.ref.state !== 'open' && !t.ref.hacked && !AB.IsoNest.state()) { col = '94,230,255'; big = true; text = t.ref.def.name; }
      else continue;
      const p = toScreen(t.x, t.y), far = Math.hypot(t.x - l.x, t.y - l.y);
      if (far > 22) continue;
      const lift = t.kind === 'item' ? 26 : 62, bob = Math.sin(time * 3 + t.x) * 3, a = 0.55 + Math.sin(time * 4 + t.y) * 0.25;
      // луч
      const g = ctx.createLinearGradient(0, p.y - lift - 30, 0, p.y);
      g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${big ? 0.32 : 0.18})`);
      ctx.fillStyle = g; ctx.fillRect(p.x - (big ? 7 : 4), p.y - lift - 30, big ? 14 : 8, lift + 30);
      // ромб
      const r = big ? 7 : 5, y = p.y - lift + bob;
      ctx.fillStyle = `rgba(${col},${a})`; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, y - r); ctx.lineTo(p.x + r * 0.75, y); ctx.lineTo(p.x, y + r); ctx.lineTo(p.x - r * 0.75, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (text) {
        ctx.font = '600 10px "Oswald", sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(text, p.x + 1, y - r - 5);
        ctx.fillStyle = `rgba(${col},.95)`; ctx.fillText(text, p.x, y - r - 6);
      }
    }
  }

  // Портрет по пояс для окна диалога (№55): та же составная фигура, крупно, видна верхняя половина
  function portrait(cv2, id, facing, dim) {
    const r = cv2.getBoundingClientRect(), dp = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dp), h = Math.round(r.height * dp);
    if (!w || !h) return;
    if (cv2.width !== w || cv2.height !== h) { cv2.width = w; cv2.height = h; }
    const c2 = cv2.getContext('2d');
    c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, w, h);
    const m = AB.IsoParty.find(id);
    const fig = { ...(m || { id, x: 0, y: 0 }), facing, hidden: false, down: false, path: null };
    const k = (h / dp) / 72;                     // видно примерно до пояса
    c2.setTransform(dp, 0, 0, dp, 0, 0);
    if (AB.Render && AB.Render.drawFigure) {
      try { AB.Render.drawFigure(c2, fig, w / dp / 2, 4 + 126 * k * 0.98, k); } catch (e) { /* фигуры нет — пустой портрет */ }
    }
    // снизу — растворение в окно диалога
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.globalCompositeOperation = 'destination-out';
    const g = c2.createLinearGradient(0, h * 0.62, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    c2.fillStyle = g; c2.fillRect(0, 0, w, h);
    c2.globalCompositeOperation = 'source-over';
  }

  let hl = new Set();
  let focusPt = null;
  function exitWall(x, y) {
    for (const e of AB.IsoWorld.layout().exits || []) {
      if (e.floor) continue;
      const wx = e.x + (e.wall === 'w' ? -1 : e.wall === 'e' ? 1 : 0), wy = e.y + (e.wall === 'n' ? -1 : e.wall === 's' ? 1 : 0);
      if (wx === x && wy === y) return true;
    }
    return false;
  }
  function outlineTop(x, y, hgt) {
    const n = toScreen(x, y), e = toScreen(x + 1, y), s = toScreen(x + 1, y + 1), w = toScreen(x, y + 1);
    ctx.strokeStyle = `rgba(94,230,255,${0.55 + Math.sin(time * 5) * 0.25})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(n.x, n.y - hgt); ctx.lineTo(e.x, e.y - hgt); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.stroke();
  }
  // порог открытой двери, люки в полу, подсветка выходов
  function drawFloorMarks() {
    for (const dr of AB.IsoInteract.doors()) for (const [x, y] of dr.tiles) {
      const a = toScreen(x + (dr.axis === 'x' ? 0.4 : 0), y + (dr.axis === 'x' ? 0 : 0.4)), b = toScreen(x + (dr.axis === 'x' ? 0.4 : 1), y + (dr.axis === 'x' ? 1 : 0.4));
      ctx.strokeStyle = 'rgba(200,160,40,.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (hl.has(`door:${dr.key}`)) { ctx.strokeStyle = `rgba(94,230,255,${0.5 + Math.sin(time * 5) * 0.25})`; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    for (const lk of AB.IsoWorld.layout().links || []) for (const end of [lk.a, lk.b]) {
      const c = toScreen(end.x + 0.5, end.y + 0.5);
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, 0.5);
      ctx.fillStyle = '#050507'; ctx.fillRect(-18, -18, 36, 36);
      ctx.strokeStyle = 'rgba(200,160,40,.5)'; ctx.lineWidth = 3; ctx.strokeRect(-20, -20, 40, 40);
      ctx.restore();
      if (hl.has(`link:${lk.key}:${end.room}`)) { ctx.strokeStyle = `rgba(94,230,255,${0.5 + Math.sin(time * 5) * 0.25})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(c.x, c.y, 26, 13, 0, 0, 7); ctx.stroke(); }
    }
    for (const e of AB.IsoWorld.layout().exits || []) {
      const id = `exit:${e.room}:${e.door}`, c = toScreen(e.x + 0.5, e.y + 0.5);
      if (e.floor) {
        // люк в полу: тёмный проём с рамой
        ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, 0.5);
        ctx.fillStyle = '#050507'; ctx.fillRect(-18, -18, 36, 36);
        ctx.strokeStyle = 'rgba(200,160,40,.5)'; ctx.lineWidth = 3; ctx.strokeRect(-20, -20, 40, 40);
        ctx.restore();
      }
      if (hl.has(id)) { ctx.strokeStyle = `rgba(94,230,255,${0.5 + Math.sin(time * 5) * 0.25})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(c.x, c.y, 26, 13, 0, 0, 7); ctx.stroke(); }
    }
  }
  function doorLamp(dr) {
    const [x, y] = dr.tiles[0], p = toScreen(x + 0.5, y + 0.5), lockd = AB.IsoInteract.locked(dr);
    ctx.fillStyle = lockd ? 'rgba(255,70,50,.9)' : dr.state === 'open' ? 'rgba(90,230,130,.9)' : 'rgba(255,200,80,.9)';
    ctx.beginPath(); ctx.arc(p.x, p.y - 74 * dr.anim - 6, 2.5, 0, 7); ctx.fill();
  }
  function exitLamp(e, x, y) {
    const rd = (AB.ID.get(e.room).doors || []).find((q) => q.key === e.door), ok = rd && AB.Rooms.canPass(rd).ok;
    const p = toScreen(x + 0.5, y + 0.5);
    ctx.fillStyle = ok ? 'rgba(90,230,130,.9)' : 'rgba(255,70,50,.9)';
    ctx.beginPath(); ctx.arc(p.x, p.y - WALL_H - 6, 3, 0, 7); ctx.fill();
  }
  // предмет на полу: ящичек со свечением и подписью (заглушка — короткое имя предмета)
  function drawItem(t) {
    const p = toScreen(t.x, t.y), def = AB.ID.get(t.ref.item), on = hl.has(t.id);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
    g.addColorStop(0, `rgba(255,214,120,${on ? 0.35 : 0.18 + Math.sin(time * 3) * 0.06})`); g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g; ctx.fillRect(p.x - 18, p.y - 18, 36, 36);
    ctx.fillStyle = '#6a5a3a'; ctx.fillRect(p.x - 7, p.y - 9, 14, 8);
    ctx.fillStyle = '#8a7650'; ctx.fillRect(p.x - 7, p.y - 11, 14, 3);
    ctx.font = '600 9px "Oswald", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = on ? '#ffe6a8' : 'rgba(255,230,170,.75)';
    ctx.fillText(on ? def.name : def.short || def.name, p.x, p.y - 16);
  }

  // крышка капсулы: светится, пока внутри спит Марк; открывается в сцене пробуждения
  function podGlass(x, y, hgt, p) {
    const st = p.prop && AB.IsoStory && AB.IsoStory.fx.props[p.prop];
    const n = toScreen(x, y), e = toScreen(x + 1, y), s = toScreen(x + 1, y + 1), w = toScreen(x, y + 1);
    const a = st === 'closed' ? 0.45 : st === 'opening' ? 0.25 + Math.sin(time * 8) * 0.1 : 0.12;
    ctx.fillStyle = `rgba(120,210,255,${a})`;
    ctx.beginPath(); ctx.moveTo(n.x, n.y - hgt - 1); ctx.lineTo(e.x, e.y - hgt - 1); ctx.lineTo(s.x, s.y - hgt - 1); ctx.lineTo(w.x, w.y - hgt - 1); ctx.closePath(); ctx.fill();
  }
  // истинный облик (ASSET-CHAR002-02): на миг в помещении, между ними, — непонятно, кто это
  function drawTrueForm(fx) {
    const tf = fx.trueForm;
    if (!tf) return;
    const a = AB.Assets.get('ASSET-CHAR002-02'), k = Math.sin(Math.min(1, 1 - tf.t / tf.dur) * Math.PI);
    const p = toScreen(tf.x, tf.y);
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 1.4) * (Math.sin(time * 40) > -0.6 ? 0.9 : 0.4);
    if (a.status === 'ready') { const h = 150, w = a.img.width * (h / a.img.height); ctx.drawImage(a.img, p.x - w / 2, p.y - h, w, h); }
    else { ctx.fillStyle = '#0a1418'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 40, 50, 30, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // внешние камеры шлюза: дно океана, лучи прожекторов, проходящий левиафан
  function cameraView(fx) {
    if (!(fx.window > 0)) return;
    const W = cv.width, H = cv.height, a = Math.min(1, fx.window);
    const w = Math.min(W * 0.8, 900 * dpr), h = w * 0.42, x = (W - w) / 2, y = H * 0.16;
    ctx.save(); ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#01060c'); g.addColorStop(1, '#031820');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    // лучи прожекторов
    ctx.globalCompositeOperation = 'lighter';
    for (const [sx0, ang] of [[0.25, 0.25], [0.7, -0.2]]) {
      const lg = ctx.createLinearGradient(x + w * sx0, y, x + w * sx0 + ang * h, y + h);
      lg.addColorStop(0, 'rgba(140,200,220,.18)'); lg.addColorStop(1, 'rgba(140,200,220,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(x + w * sx0 - 6, y); ctx.lineTo(x + w * sx0 + 6, y); ctx.lineTo(x + w * sx0 + ang * h + 90, y + h); ctx.lineTo(x + w * sx0 + ang * h - 90, y + h); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // морской снег
    ctx.fillStyle = 'rgba(200,230,240,.35)';
    for (let i = 0; i < 70; i++) { const px = x + ((i * 97 + time * 8) % w), py = y + ((i * 53 + time * (6 + (i % 5))) % h); ctx.fillRect(px, py, 1.5 * dpr, 1.5 * dpr); }
    // дно
    ctx.fillStyle = '#02090c'; ctx.beginPath(); ctx.moveTo(x, y + h);
    for (let i = 0; i <= 12; i++) ctx.lineTo(x + (w / 12) * i, y + h * (0.8 + Math.sin(i * 1.7) * 0.06)); ctx.lineTo(x + w, y + h); ctx.fill();
    // левиафан: огромная тень проходит над дном
    if (fx.leviathan >= 0) {
      const t = fx.leviathan / 9, lx = x - w * 0.6 + t * w * 2.2, ly = y + h * 0.42;
      ctx.fillStyle = 'rgba(0,0,0,.85)';
      ctx.beginPath(); ctx.ellipse(lx, ly, w * 0.42, h * 0.11, -0.04, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(lx - w * 0.38, ly); ctx.lineTo(lx - w * 0.58, ly - h * 0.12); ctx.lineTo(lx - w * 0.55, ly + h * 0.1); ctx.fill();
      ctx.fillStyle = 'rgba(120,220,255,.6)'; ctx.beginPath(); ctx.arc(lx + w * 0.34, ly - h * 0.02, 3 * dpr, 0, 7); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(94,230,255,.5)'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(94,230,255,.8)'; ctx.font = `${11 * dpr}px "Share Tech Mono", monospace`; ctx.textAlign = 'left';
    ctx.fillText('ВНЕШНЯЯ КАМЕРА · ГЛУБИНА 3000 М', x + 10 * dpr, y + 18 * dpr);
    ctx.restore();
  }
  // экранные эффекты сцен: затемнение, тревога, мерцание света, помехи на пульте
  function overlays(fx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W = cv.width, H = cv.height;
    if (fx.alarm) { ctx.fillStyle = `rgba(160,10,10,${0.08 + Math.sin(time * 3.2) * 0.06})`; ctx.fillRect(0, 0, W, H); }
    if (fx.flicker > 0) {
      const r = Math.sin(time * 47) + Math.sin(time * 23);
      ctx.fillStyle = `rgba(0,0,0,${r > 0.6 ? 0.05 : r > -0.4 ? 0.45 : 0.8})`; ctx.fillRect(0, 0, W, H);
    }
    if (fx.ghost > 0) {
      ctx.fillStyle = `rgba(120,220,255,${0.06 + (Math.sin(time * 60) > 0.5 ? 0.06 : 0)})`; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(200,250,255,.15)';
      for (let i = 0; i < 5; i++) { const y = (time * 700 + i * 157) % H; ctx.fillRect(0, y, W, 2 * dpr); }
    }
    if (fx.trueForm) { const k = Math.sin(Math.min(1, 1 - fx.trueForm.t / fx.trueForm.dur) * Math.PI); ctx.fillStyle = `rgba(120,220,255,${0.08 * k})`; ctx.fillRect(0, 0, W, H); }
    cameraView(fx);
    const f = Math.max(fx.fade || 0, AB.IsoGame ? AB.IsoGame.fade() : 0);
    if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(0, 0, W, H); }
  }

  function propTag(p, look) {
    if (!AB.isoShowIds) return;
    const c = toScreen(p.x + p.w / 2, p.y + p.h / 2);
    ctx.font = '8px "Share Tech Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(200,210,220,.55)';
    ctx.fillText(p.asset || p.kind, c.x, c.y - look.h - 6);
  }

  // противник: составная фигура мутанта тем же кодом, что вид сбоку; цель — красное кольцо
  const ENEMY_K = 0.62;
  function drawEnemy(e) {
    const p = toScreen(e.x, e.y);
    const tgt = AB.IsoCombat.target() === e.id, hov = AB.IsoInput.hoverFoe() === e;
    if ((tgt || hov) && e.state !== 'DEAD') {
      ctx.strokeStyle = `rgba(255,70,50,${0.55 + Math.sin(time * 6) * 0.2})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 24, 12, 0, 0, 7); ctx.stroke();
    }
    if (AB.Render && AB.Render.drawEnemyFigure) AB.Render.drawEnemyFigure(ctx, e, p.x, p.y, ENEMY_K);
  }
  // полоса здоровья: у раненых, у цели и под указателем
  function enemyBar(e) {
    if (e.state === 'DEAD') return;
    const d = AB.ID.get(e.id), tgt = AB.IsoCombat.target() === e.id, hov = AB.IsoInput.hoverFoe() === e;
    if (e.hp >= d.hp && !tgt && !hov) return;
    const p = toScreen(e.x, e.y), f = Math.max(0, e.hp / d.hp);
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(p.x - 22, p.y - 84, 44, 5);
    ctx.fillStyle = f > 0.3 ? '#c0392b' : '#ff6a3a'; ctx.fillRect(p.x - 21, p.y - 83, 42 * f, 3);
    if (tgt || hov) { ctx.font = '600 10px "Oswald", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffb38a'; ctx.fillText(d.name, p.x, p.y - 90); }
  }

  // ---------- Частицы: кровь, следы выстрелов, искры ----------
  const fx = [];
  AB.Bus.on('iso:enemyHit', ({ x, y }) => { for (let i = 0; i < 14; i++) fx.push({ k: 'blood', x, y, z: 0.9, vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 2.4, vz: 1 + Math.random() * 2, life: 0.9, age: 0 }); });
  AB.Bus.on('iso:charHit', ({ x, y }) => { for (let i = 0; i < 8; i++) fx.push({ k: 'blood', x, y, z: 1.1, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 1 + Math.random() * 1.5, life: 0.8, age: 0 }); });
  AB.Bus.on('iso:shot', ({ from, to, landed, energy, dart }) => {
    fx.push({ k: energy ? 'bolt' : 'tracer', x: from.x, y: from.y, x2: to.x, y2: to.y, life: energy ? Math.max(0.1, Math.hypot(to.x - from.x, to.y - from.y) / 40) : 0.14, age: 0, dart, landed });
  });
  const decals = [];
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.age += dt;
      if (f.k === 'blood') {
        f.x += f.vx * dt; f.y += f.vy * dt; f.vz -= 9 * dt; f.z += f.vz * dt;
        if (f.z <= 0) { if (decals.length < 160) decals.push({ x: f.x, y: f.y, r: 2 + Math.random() * 4 }); fx.splice(i, 1); continue; }
      }
      if (f.age > f.life) fx.splice(i, 1);
    }
  }
  function drawFx() {
    for (const d of decals) { const p = toScreen(d.x, d.y); ctx.fillStyle = 'rgba(60,8,8,.7)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, d.r, d.r * 0.5, 0, 0, 7); ctx.fill(); }
    for (const f of fx) {
      const a = 1 - f.age / f.life;
      if (f.k === 'blood') { const p = toScreen(f.x, f.y); ctx.fillStyle = `rgba(120,12,12,${a})`; ctx.fillRect(p.x - 1.5, p.y - f.z * 40 - 1.5, 3, 3); continue; }
      const a0 = toScreen(f.x, f.y), b0 = toScreen(f.x2, f.y2), h = 48;
      if (f.k === 'tracer') {
        ctx.strokeStyle = f.dart ? `rgba(150,255,190,${0.9 * a})` : `rgba(220,250,255,${0.9 * a})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a0.x, a0.y - h); ctx.lineTo(b0.x, b0.y - h); ctx.stroke();
      } else {
        const t = Math.min(1, f.age / f.life), x = a0.x + (b0.x - a0.x) * t, y = a0.y - h + (b0.y - a0.y) * t;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, 'rgba(240,250,255,1)'); g.addColorStop(0.4, 'rgba(140,220,255,.8)'); g.addColorStop(1, 'rgba(120,90,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 14, y - 14, 28, 28);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  function drawMember(m, isLead) {
    const p = toScreen(m.x, m.y);
    // аура лечения дротикового пистолета: мягкое зелёное кольцо
    if (AB.IsoCombat.hasAura(m.id) && !(AB.Chars.get(m.id) || {}).dead) {
      const on = AB.IsoCombat.auraActive(m.id), r = AB.IsoCombat.weaponOf(m.id).weapon.aura.radius / 50;
      ctx.strokeStyle = `rgba(110,255,170,${on ? 0.28 : 0.08})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * TW / 2 * 1.41, r * TH / 2 * 1.41, 0, 0, 7); ctx.stroke();
    }
    if (isLead) {
      ctx.strokeStyle = `rgba(94,230,255,${0.45 + Math.sin(time * 4) * 0.15})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 20, 10, 0, 0, 7); ctx.stroke();
    }
    // №56: снаружи — не герой, а экзокостюм (11 частей, js/data/rigs/EXOSUIT.js)
    if (AB.IsoSuit && AB.IsoSuit.suited(m)) { AB.IsoSuit.draw(ctx, AB.IsoSuit.poseOf(m), p.x, p.y, FIG_K); return; }
    if (AB.Render && AB.Render.drawFigure) AB.Render.drawFigure(ctx, m, p.x, p.y, FIG_K);
  }

  function nameTag(m, isLead) {
    const p = toScreen(m.x, m.y);
    ctx.font = '600 10px "Oswald", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = isLead ? '#bfefff' : 'rgba(217,207,194,.85)';
    const suit = AB.IsoSuit && AB.IsoSuit.suited(m);
    ctx.fillText(suit ? 'Экзокостюм' : AB.ID.get(m.id).name, p.x, p.y - (suit ? 104 : 96));
    // в базе — чем занят
    const task = AB.IsoBase && AB.IsoBase.active() ? AB.IsoBase.taskOf(m.id) : '';
    if (task) { ctx.font = '9px "Share Tech Mono", monospace'; ctx.fillStyle = 'rgba(160,220,235,.8)'; ctx.fillText(task, p.x, p.y - 85); }
  }

  function drawMarker() {
    const l = AB.IsoParty.lead();
    if (!l.goal) { marker = null; return; }
    marker = l.goal;
    const p = toScreen(marker.x, marker.y), a = 0.5 + Math.sin(time * 6) * 0.25;
    ctx.strokeStyle = `rgba(94,230,255,${a})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 12 + Math.sin(time * 6) * 2, 6, 0, 0, 7); ctx.stroke();
  }

  // свет: темнота с «дырами» у ламп и у отряда, сверху — цветное свечение
  function lighting(sc, party) {
    const L = lctx, k = 0.5;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = 'source-over';
    L.fillStyle = `rgba(3,4,7,${AB.World && AB.World.hasPower() ? 0.5 : 0.72})`;   // с питанием светлее
    L.fillRect(0, 0, lightCv.width, lightCv.height);
    L.setTransform(sc * k, 0, 0, sc * k, (cv.width / 2 - cam.x * sc) * k, (cv.height / 2 - cam.y * sc) * k);
    L.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      const p = toScreen(x, y);
      L.save(); L.translate(p.x, p.y); L.scale(1, 0.62);
      const g = L.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.6, `rgba(0,0,0,${a * 0.45})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g; L.fillRect(-r, -r, r * 2, r * 2); L.restore();
    };
    const lights = AB.IsoWorld.layout().lights;
    for (const li of lights) hole(li.x, li.y, li.radius * TW * 0.6, 0.9);
    for (const m of party) hole(m.x, m.y - 0.6, 6 * TW * 0.6, 0.85);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lightCv, 0, 0, cv.width, cv.height);
    // цветное свечение ламп
    ctx.setTransform(sc, 0, 0, sc, cv.width / 2 - cam.x * sc, cv.height / 2 - cam.y * sc);
    ctx.globalCompositeOperation = 'lighter';
    for (const li of lights) {
      const p = toScreen(li.x, li.y), r = li.radius * TW * 0.5, [cr, cg, cb] = li.color;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.6);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},.16)`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    TW, TH, init, frame, pick, screenOf, toScreen, toWorld, portrait,
    focus(p) { focusPt = p ? { ...p } : null; },
    // №69: свободная камера в базе — сдвиг обзора на (dx, dy) CSS-пикселей
    panBy(dx, dy) {
      if (!focusPt) return;
      const k = dpr / S(), w0 = toWorld(0, 0), w1 = toWorld(-dx * k, -dy * k), sz = AB.IsoWorld.size();
      focusPt.x = U.clamp(focusPt.x + w1.x - w0.x, 0, sz.w); focusPt.y = U.clamp(focusPt.y + w1.y - w0.y, 0, sz.h);
      const t = toScreen(focusPt.x, focusPt.y - 0.4); cam.x = t.x; cam.y = t.y;
    },
    zoom(dz) { if (dz) { cam.z = U.clamp(Math.round((cam.z + dz) * 100) / 100, ZMIN, ZMAX); try { localStorage.setItem('abyss_iso_zoom', String(cam.z)); } catch (e) { /* хранилище недоступно */ } } return cam.z; },
    setZoom(z) { cam.z = U.clamp(z, ZMIN, ZMAX); return cam.z; },
    camera: () => ({ ...cam }),
    fadeOf: (key) => (fade.has(key) ? fade.get(key) : 1),
    snap() { snap = true; },
  };
})();
