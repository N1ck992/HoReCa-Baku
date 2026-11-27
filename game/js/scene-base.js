// =====================================================================
// Вид базы: рисованная колония на canvas.
// Постройки растут с уровнем, по базе ходят войска, летают дроны.
// =====================================================================

const BaseScene = (() => {
  const W = 1000, H = 720;               // размеры мира сцены
  const LAYOUT = {
    hq:       { x: 500, y: 345 },
    mine:     { x: 215, y: 215 },
    reactor:  { x: 785, y: 215 },
    farm:     { x: 215, y: 515 },
    storage:  { x: 785, y: 515 },
    barracks: { x: 500, y: 600 },
  };
  const C = {
    soil: '#3a2a26', soil2: '#2a1e1d', pad: '#2b3446', padEdge: '#3d4a63',
    road: '#4a5672', metal: '#8d9ab3', metalDark: '#5b6680', metalTop: '#b7c3d9',
    accent: '#23d5c4', violet: '#7c5cff', glow: '#5ff3e4', warn: '#ffc145',
    green: '#3ddc84', red: '#ff5c6c', text: '#e6ecf5',
  };

  let canvas = null, ctx = null, scale = 1, ui = 1; // ui — множитель, чтобы текст был читаемым на любом экране
  let selected = 'hq';
  let onSelect = () => {};
  const walkers = [], drones = [], crawlers = [], sparks = [];

  // неподвижный декор: камни и кратеры за периметром
  const decor = (() => {
    const rng = seededRng(42), out = [];
    for (let i = 0; i < 70; i++) {
      const x = rng() * W, y = rng() * H;
      if (Math.hypot((x - 500) / 470, (y - 400) / 330) < 1.05) continue;
      out.push({ x, y, r: 4 + rng() * 16, crater: rng() < 0.3 });
    }
    return out;
  })();

  function mount(el, selectHandler) {
    canvas = el;
    ctx = canvas.getContext('2d');
    onSelect = selectHandler;
    canvas.addEventListener('click', onTap);
  }

  function select(id) { selected = id; }
  function getSelected() { return selected; }

  function size(id) {
    return 0.92 + 0.05 * S.buildings[id];
  }

  // ---------- Взаимодействие ----------
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function onTap(e) {
    const p = toWorld(e);
    let best = null, bestD = 1e9;
    for (const [id, pos] of Object.entries(LAYOUT)) {
      const d = Math.hypot(p.x - pos.x, (p.y - (pos.y - 30)) * 1.2);
      const r = (id === 'hq' ? 110 : 90) * size(id);
      if (d < r && d < bestD) { best = id; bestD = d; }
    }
    if (best) {
      selected = best;
      onSelect(best);
    }
  }

  // ---------- Агенты: солдаты, дроны, краулеры ----------
  function randomTarget() {
    const ids = Object.keys(LAYOUT);
    const p = LAYOUT[ids[Math.floor(Math.random() * ids.length)]];
    return { x: p.x + (Math.random() - 0.5) * 120, y: p.y + 40 + Math.random() * 40 };
  }

  function syncAgents() {
    const away = !!S.march;
    const want = (n, cap) => (away ? 0 : Math.min(n, cap));
    const resize = (arr, n, make) => {
      while (arr.length < n) arr.push(make());
      arr.length = n;
    };
    resize(walkers, want(S.units.trooper, 14), () => {
      const p = randomTarget();
      return { x: p.x, y: p.y, ...randomTarget(), tx: 0, ty: 0, speed: 18 + Math.random() * 14, phase: Math.random() * 6 };
    });
    for (const w of walkers) if (!w.tx) Object.assign(w, { tx: randomTarget().x, ty: randomTarget().y });
    resize(drones, want(S.units.drone, 6), () => ({
      a: Math.random() * Math.PI * 2, r: 140 + Math.random() * 180, sp: 0.25 + Math.random() * 0.3, h: 50 + Math.random() * 30,
    }));
    resize(crawlers, want(S.units.crawler, 3), () => ({ ...randomTarget(), tx: 0, ty: 0, speed: 10 }));
    for (const c of crawlers) if (!c.tx) Object.assign(c, { tx: randomTarget().x, ty: randomTarget().y });
  }

  function moveAgent(a, dt) {
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    if (d < 4) {
      const p = randomTarget();
      a.tx = p.x; a.ty = p.y;
      return;
    }
    a.x += (dx / d) * a.speed * dt;
    a.y += (dy / d) * a.speed * dt;
    a.dir = dx >= 0 ? 1 : -1;
  }

  // ---------- Примитивы рисования ----------
  function shadow(x, y, w, d) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(x + 8, y + 6, w / 2 + 6, d / 2 + 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // «коробка» в кабинетной проекции: верхняя грань и фасад
  function box(x, y, w, d, h, top, front) {
    ctx.fillStyle = front;
    ctx.fillRect(x - w / 2, y + d / 2 - h, w, h);
    ctx.fillStyle = top;
    ctx.fillRect(x - w / 2, y - d / 2 - h, w, d);
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - w / 2, y - d / 2 - h, w, d + h);
  }

  function cylinder(x, y, r, h, top, side) {
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI);
    ctx.lineTo(x - r, y - h);
    ctx.ellipse(x, y - h, r, r * 0.45, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(x, y - h, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function windows(x, y, w, h, n, t, seed) {
    for (let i = 0; i < n; i++) {
      const on = Math.sin(t * 0.6 + i * 1.7 + seed) > -0.6;
      ctx.fillStyle = on ? 'rgba(95,243,228,.85)' : 'rgba(95,243,228,.2)';
      ctx.fillRect(x - w / 2 + 8 + i * ((w - 16) / n), y, (w - 16) / n - 5, h);
    }
  }

  // ---------- Постройки ----------
  const DRAW = {
    hq(x, y, k, L, t) {
      shadow(x, y, 190 * k, 110 * k);
      box(x, y, 180 * k, 100 * k, 40 * k, '#6f7c97', C.metalDark);
      windows(x, y + 50 * k - 40 * k + 10 * k, 180 * k, 10 * k, 6, t, 1);
      cylinder(x, y - 40 * k, 62 * k, (40 + L * 5) * k, C.metalTop, C.metal);
      // купол
      const top = y - 40 * k - (40 + L * 5) * k;
      ctx.fillStyle = 'rgba(95,243,228,.25)';
      ctx.beginPath();
      ctx.ellipse(x, top, 50 * k, 40 * k, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = C.glow;
      ctx.lineWidth = 2;
      ctx.stroke();
      // антенна с маячком
      ctx.strokeStyle = C.metalTop;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, top - 38 * k);
      ctx.lineTo(x, top - 80 * k);
      ctx.stroke();
      const blink = (Math.sin(t * 4) + 1) / 2;
      ctx.fillStyle = `rgba(255,92,108,${0.4 + blink * 0.6})`;
      ctx.beginPath();
      ctx.arc(x, top - 82 * k, 5 + blink * 3, 0, Math.PI * 2);
      ctx.fill();
      // вращающаяся тарелка
      const a = t * 0.8;
      ctx.strokeStyle = C.metalTop;
      ctx.beginPath();
      ctx.ellipse(x + 70 * k, y - 60 * k, 18 * k * Math.abs(Math.cos(a)) + 2, 18 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    },
    mine(x, y, k, L, t) {
      shadow(x, y, 140 * k, 80 * k);
      box(x, y, 120 * k, 70 * k, 26 * k, '#7a6a5a', '#5a4a3e');
      // вышка
      ctx.strokeStyle = C.metalTop;
      ctx.lineWidth = 3;
      const h = (70 + L * 6) * k;
      ctx.beginPath();
      ctx.moveTo(x - 32 * k, y - 26 * k);
      ctx.lineTo(x, y - 26 * k - h);
      ctx.lineTo(x + 32 * k, y - 26 * k);
      ctx.moveTo(x - 20 * k, y - 26 * k - h * 0.4);
      ctx.lineTo(x + 20 * k, y - 26 * k - h * 0.4);
      ctx.stroke();
      // колесо подъёмника
      const wy = y - 26 * k - h;
      ctx.save();
      ctx.translate(x, wy);
      ctx.rotate(t * 2);
      ctx.strokeStyle = C.warn;
      ctx.beginPath();
      ctx.arc(0, 0, 14 * k, 0, Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos((i * Math.PI) / 2) * 14 * k, Math.sin((i * Math.PI) / 2) * 14 * k);
      }
      ctx.stroke();
      ctx.restore();
      // куча руды
      ctx.fillStyle = '#9a8f86';
      ctx.beginPath();
      ctx.ellipse(x + 55 * k, y + 22 * k, 20 * k + L, 10 * k, 0, Math.PI, 0);
      ctx.fill();
    },
    reactor(x, y, k, L, t) {
      shadow(x, y, 130 * k, 80 * k);
      cylinder(x, y, 56 * k, (46 + L * 4) * k, C.metalTop, C.metal);
      const pulse = (Math.sin(t * 3) + 1) / 2;
      const top = y - (46 + L * 4) * k;
      const g = ctx.createRadialGradient(x, top, 2, x, top, 50 * k);
      g.addColorStop(0, `rgba(95,243,228,${0.7 + pulse * 0.3})`);
      g.addColorStop(1, 'rgba(95,243,228,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, top, 50 * k, 26 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.glow;
      ctx.beginPath();
      ctx.ellipse(x, top, 16 * k, 8 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      // светящиеся кольца
      ctx.strokeStyle = `rgba(35,213,196,${0.4 + pulse * 0.4})`;
      ctx.lineWidth = 3;
      for (let i = 1; i <= Math.min(3, 1 + Math.floor(L / 3)); i++) {
        ctx.beginPath();
        ctx.ellipse(x, y - i * 14 * k, 57 * k, 25 * k, 0, 0, Math.PI);
        ctx.stroke();
      }
    },
    farm(x, y, k, L, t) {
      const n = Math.min(5, 1 + Math.ceil(L / 2));
      shadow(x, y, 150 * k, 80 * k);
      ctx.fillStyle = '#2d3b2f';
      ctx.fillRect(x - 75 * k, y - 35 * k, 150 * k, 70 * k);
      for (let i = 0; i < n; i++) {
        const col = i % 3, row = Math.floor(i / 3);
        const gx = x - 48 * k + col * 48 * k, gy = y - 6 * k + row * 32 * k - (n > 3 ? 14 * k : 0);
        ctx.fillStyle = 'rgba(61,220,132,.35)';
        ctx.strokeStyle = 'rgba(160,255,200,.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(gx, gy, 22 * k, 20 * k, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // ростки
        ctx.fillStyle = C.green;
        for (let j = -1; j <= 1; j++) {
          const sway = Math.sin(t * 2 + i + j) * 1.5;
          ctx.fillRect(gx + j * 8 * k + sway, gy - 8 * k, 2, 8 * k);
        }
      }
    },
    storage(x, y, k, L, t) {
      const n = Math.min(4, 1 + Math.floor(L / 3));
      shadow(x, y, 150 * k, 80 * k);
      box(x, y + 10 * k, 150 * k, 60 * k, 14 * k, '#59647d', '#434d63');
      for (let i = 0; i < n; i++) {
        const sx = x - 45 * k + (i % 2) * 90 * k / (n > 1 ? 1 : 2) + (n === 1 ? 22 * k : 0);
        const sy = y + (i < 2 ? -6 : 18) * k;
        cylinder(sx, sy, 22 * k, (40 + L * 3) * k, '#d2dbea', '#9eabc4');
        ctx.fillStyle = C.warn;
        ctx.fillRect(sx - 22 * k, sy - 22 * k, 44 * k, 4 * k);
      }
      // ящики
      for (let i = 0; i < Math.min(L, 6); i++) {
        box(x + 50 * k - (i % 3) * 14 * k, y + 30 * k - Math.floor(i / 3) * 12 * k, 12 * k, 8 * k, 10 * k, '#b98a4a', '#8a6533');
      }
    },
    barracks(x, y, k, L, t) {
      shadow(x, y, 200 * k, 70 * k);
      box(x, y, 190 * k, 60 * k, (30 + L * 2) * k, '#55607a', '#3e475c');
      windows(x, y + 30 * k - (30 + L * 2) * k + 8 * k, 190 * k, 8 * k, 7, t, 3);
      // ворота
      ctx.fillStyle = '#20283a';
      ctx.fillRect(x - 18 * k, y + 30 * k - 22 * k, 36 * k, 22 * k);
      // флаг
      const fx = x + 80 * k, fy = y - 30 * k - (30 + L * 2) * k;
      ctx.strokeStyle = C.metalTop;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 30 * k);
      ctx.lineTo(fx, fy - 30 * k);
      ctx.stroke();
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.moveTo(fx, fy - 30 * k);
      for (let i = 0; i <= 6; i++) {
        ctx.lineTo(fx + i * 5 * k, fy - 30 * k + Math.sin(t * 5 + i) * 2 + 0);
      }
      for (let i = 6; i >= 0; i--) {
        ctx.lineTo(fx + i * 5 * k, fy - 14 * k + Math.sin(t * 5 + i) * 2);
      }
      ctx.fill();
    },
  };

  function drawConstruction(id, x, y, k, t) {
    const b = S.build;
    const p = Math.min(1, (now() - b.startAt) / (b.endAt - b.startAt));
    // леса
    ctx.strokeStyle = C.warn;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 85 * k, y - 140 * k, 170 * k, 175 * k);
    ctx.setLineDash([]);
    // искры сварки
    if (Math.random() < 0.5) {
      sparks.push({ x: x + (Math.random() - 0.5) * 120 * k, y: y - Math.random() * 120 * k, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 40, life: 0.6 });
    }
    // кольцо прогресса
    const cy = y - 165 * k;
    ctx.fillStyle = 'rgba(11,15,26,.85)';
    ctx.beginPath();
    ctx.arc(x, cy, 16 * ui, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 3 * ui;
    ctx.beginPath();
    ctx.arc(x, cy, 12 * ui, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.font = `bold ${11 * ui}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmtTime((b.endAt - now()) / 1000), x, cy - 26 * ui);
  }

  function label(id, x, y, k) {
    const L = S.buildings[id];
    const isSel = id === selected;
    const text = isSel ? `${BUILDINGS[id].name} · ${L}` : String(L);
    ctx.font = `${isSel ? 'bold ' : ''}${12 * ui}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 14 * ui;
    const ly = y + 52 * k;
    ctx.fillStyle = isSel ? C.accent : 'rgba(11,15,26,.8)';
    roundRect(x - w / 2, ly - 10 * ui, w, 20 * ui, 10 * ui);
    ctx.fill();
    ctx.fillStyle = isSel ? '#06121a' : C.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, ly + 1);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Кадр ----------
  let lastT = performance.now();

  function draw() {
    if (!canvas || !canvas.isConnected) return;
    const tNow = performance.now();
    const dt = Math.min(0.1, (tNow - lastT) / 1000);
    lastT = tNow;
    const t = tNow / 1000;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    scale = canvas.width / W;
    ui = Math.max(1, W / Math.max(1, cw) * 0.9);
    ctx.setTransform(scale, 0, 0, canvas.height / H, 0, 0);

    // грунт
    const g = ctx.createRadialGradient(500, 380, 60, 500, 380, 650);
    g.addColorStop(0, C.soil);
    g.addColorStop(1, C.soil2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const d of decor) {
      if (d.crater) {
        ctx.strokeStyle = 'rgba(0,0,0,.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.r * 1.6, d.r * 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#4a3833';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // платформа колонии
    ctx.fillStyle = C.pad;
    ctx.strokeStyle = C.padEdge;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(500, 400, 450, 300, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // сетка плит
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.04)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 50) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = 0; gy < H; gy += 50) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    ctx.restore();
    // энергозабор по периметру
    ctx.strokeStyle = `rgba(35,213,196,${0.35 + Math.sin(t * 2) * 0.15})`;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -t * 20;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(500, 400, 462, 312, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // дороги
    ctx.strokeStyle = C.road;
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    for (const [id, p] of Object.entries(LAYOUT)) {
      if (id === 'hq') continue;
      ctx.beginPath();
      ctx.moveTo(LAYOUT.hq.x, LAYOUT.hq.y + 20);
      ctx.lineTo(p.x, p.y + 25);
      ctx.stroke();
    }

    // подсветка выбранной постройки
    const sp = LAYOUT[selected];
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y + 8, 105 * size(selected), 55 * size(selected), 0, 0, Math.PI * 2);
    ctx.stroke();

    // агенты и постройки — сортировка по глубине (y)
    syncAgents();
    walkers.forEach((w) => moveAgent(w, dt));
    crawlers.forEach((c) => moveAgent(c, dt));
    const items = Object.keys(LAYOUT).map((id) => ({ y: LAYOUT[id].y + 30, draw: () => drawBuilding(id, t) }));
    for (const w of walkers) items.push({ y: w.y, draw: () => drawTrooper(w, t) });
    for (const c of crawlers) items.push({ y: c.y, draw: () => drawCrawler(c) });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());

    // дроны поверх всего
    for (const d of drones) {
      d.a += d.sp * dt;
      const x = 500 + Math.cos(d.a) * d.r, y = 380 + Math.sin(d.a) * d.r * 0.55;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath();
      ctx.ellipse(x, y + d.h, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.violet;
      ctx.beginPath();
      ctx.ellipse(x, y, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = Math.sin(t * 10 + d.r) > 0 ? C.red : C.glow;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }

    // искры
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt;
      ctx.fillStyle = `rgba(255,193,69,${s.life / 0.6})`;
      ctx.fillRect(s.x, s.y, 3, 3);
    }
  }

  function drawBuilding(id, t) {
    const p = LAYOUT[id], k = size(id);
    DRAW[id](p.x, p.y, k, S.buildings[id], t);
    if (S.build && S.build.id === id) drawConstruction(id, p.x, p.y, k, t);
    label(id, p.x, p.y, k);
  }

  function drawTrooper(w, t) {
    const bob = Math.abs(Math.sin(t * 8 + w.phase)) * 2;
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.scale(Math.min(1.8, ui * 0.7), Math.min(1.8, ui * 0.7));
    ctx.translate(-w.x, -w.y);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(w.x, w.y, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9d4e6';
    ctx.fillRect(w.x - 3, w.y - 12 - bob, 6, 10);
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.arc(w.x, w.y - 15 - bob, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCrawler(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    const ck = Math.min(1.6, ui * 0.6);
    ctx.scale((c.dir || 1) * ck, ck);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(-16, -2, 34, 6);
    ctx.fillStyle = '#2a3142';
    ctx.fillRect(-16, -8, 32, 8);
    ctx.fillStyle = '#7d8aa5';
    ctx.fillRect(-12, -18, 22, 11);
    ctx.fillStyle = C.warn;
    ctx.fillRect(8, -15, 14, 3);
    ctx.restore();
  }

  return { mount, draw, select, getSelected };
})();
