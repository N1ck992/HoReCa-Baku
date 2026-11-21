// =====================================================================
// Карта мира: местность, сектора, движение отряда.
// Карту можно двигать пальцем/мышью, колесом — масштаб.
// =====================================================================

const MapScene = (() => {
  const C = {
    ground: '#1d2422', ground2: '#141a19', grid: 'rgba(255,255,255,.035)',
    rock: '#2f3a37', crater: 'rgba(0,0,0,.35)', crystal: '#4fe0d0',
    path: '#3b4a63', pathDone: '#23d5c4', violet: '#7c5cff', green: '#3ddc84',
    red: '#ff5c6c', warn: '#ffc145', text: '#e6ecf5', muted: '#8b98ad', dark: 'rgba(11,15,26,.85)',
  };

  let canvas = null, ctx = null;
  const cam = { x: 0, y: 0, zoom: 1, init: false };
  let selected = 1;
  let onSelect = () => {};
  let drag = null;
  const dust = [];

  // декор местности генерируется один раз по сиду
  const terrain = (() => {
    const xs = SECTOR_POS.map((p) => p.x), ys = SECTOR_POS.map((p) => p.y);
    const minX = Math.min(...xs) - 700, maxX = Math.max(...xs) + 700;
    const minY = Math.min(...ys) - 700, maxY = Math.max(...ys) + 700;
    const rng = seededRng(99), out = [];
    for (let i = 0; i < 520; i++) {
      const x = minX + rng() * (maxX - minX), y = minY + rng() * (maxY - minY);
      const r = rng();
      const kind = r < 0.25 ? 'crater' : r < 0.36 ? 'crystal' : r < 0.5 ? 'mesa' : 'rock';
      out.push({ x, y, kind, s: 6 + rng() * (kind === 'mesa' ? 60 : kind === 'crater' ? 40 : 14), a: rng() * Math.PI });
    }
    return { items: out, minX, maxX, minY, maxY };
  })();

  function mount(el, selectHandler) {
    canvas = el;
    ctx = canvas.getContext('2d');
    onSelect = selectHandler;
    if (!cam.init) {
      focus(Math.min(MISSION_COUNT, S.missions.cleared + 1), false);
      cam.init = true;
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', () => (drag = null));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
  }

  function select(i) { selected = i; }
  function getSelected() { return selected; }

  function zoomBy(f) {
    cam.zoom = Math.max(0.4, Math.min(1.8, cam.zoom * f));
  }

  // центрируем камеру между базой и сектором (или на точке)
  function focus(i, between = true) {
    const p = SECTOR_POS[i];
    if (between && i > 0) {
      cam.x = p.x * 0.7;
      cam.y = p.y * 0.7;
    } else {
      cam.x = p.x;
      cam.y = p.y;
    }
  }

  function focusMarch() {
    if (!S.march) return;
    const pos = marchPos();
    cam.x = pos.x;
    cam.y = pos.y;
  }

  // ---------- Ввод ----------
  function screenToWorld(sx, sy) {
    return {
      x: (sx - canvas.clientWidth / 2) / cam.zoom + cam.x,
      y: (sy - canvas.clientHeight / 2) / cam.zoom + cam.y,
    };
  }

  function onDown(e) {
    canvas.setPointerCapture(e.pointerId);
    drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  }

  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) {
      cam.x = clamp(drag.cx - dx / cam.zoom, terrain.minX + 300, terrain.maxX - 300);
      cam.y = clamp(drag.cy - dy / cam.zoom, terrain.minY + 300, terrain.maxY - 300);
    }
  }

  function onUp(e) {
    if (drag && !drag.moved) {
      const r = canvas.getBoundingClientRect();
      const w = screenToWorld(e.clientX - r.left, e.clientY - r.top);
      const maxVisible = Math.min(MISSION_COUNT, S.missions.cleared + 1);
      let hit = null;
      for (let i = 1; i <= maxVisible; i++) {
        const p = SECTOR_POS[i];
        if (Math.hypot(w.x - p.x, w.y - p.y) < 34 / Math.min(1, cam.zoom)) hit = i;
      }
      if (hit) {
        selected = hit;
        onSelect(hit);
      }
    }
    drag = null;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- Положение отряда ----------
  function marchPos() {
    const m = S.march, p = SECTOR_POS[m.target], k = marchProgress();
    return { x: p.x * k, y: p.y * k, k };
  }

  // ---------- Рисование ----------
  function drawTerrain(t) {
    const g = ctx.createRadialGradient(0, 0, 100, 0, 0, 2600);
    g.addColorStop(0, C.ground);
    g.addColorStop(1, C.ground2);
    ctx.fillStyle = g;
    ctx.fillRect(terrain.minX - 2000, terrain.minY - 2000, terrain.maxX - terrain.minX + 4000, terrain.maxY - terrain.minY + 4000);

    // координатная сетка
    const view = viewBounds();
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1 / cam.zoom;
    const step = 100;
    for (let x = Math.floor(view.x0 / step) * step; x < view.x1; x += step) {
      ctx.beginPath(); ctx.moveTo(x, view.y0); ctx.lineTo(x, view.y1); ctx.stroke();
    }
    for (let y = Math.floor(view.y0 / step) * step; y < view.y1; y += step) {
      ctx.beginPath(); ctx.moveTo(view.x0, y); ctx.lineTo(view.x1, y); ctx.stroke();
    }

    for (const d of terrain.items) {
      if (d.x < view.x0 - 80 || d.x > view.x1 + 80 || d.y < view.y0 - 80 || d.y > view.y1 + 80) continue;
      if (d.kind === 'crater') {
        ctx.strokeStyle = C.crater;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.s, d.s * 0.7, d.a, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,.15)';
        ctx.fill();
      } else if (d.kind === 'mesa') {
        ctx.fillStyle = '#28302d';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.s, d.s * 0.55, d.a, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.05)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (d.kind === 'crystal') {
        const glow = 0.5 + Math.sin(t * 2 + d.a * 5) * 0.3;
        ctx.fillStyle = `rgba(79,224,208,${glow})`;
        for (let i = 0; i < 3; i++) {
          const ox = (i - 1) * d.s * 0.6;
          ctx.beginPath();
          ctx.moveTo(d.x + ox, d.y - d.s * (1 + (i % 2) * 0.5));
          ctx.lineTo(d.x + ox + d.s * 0.3, d.y);
          ctx.lineTo(d.x + ox - d.s * 0.3, d.y);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = C.rock;
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.s, d.s * 0.6, d.a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function viewBounds() {
    const hw = canvas.clientWidth / 2 / cam.zoom, hh = canvas.clientHeight / 2 / cam.zoom;
    return { x0: cam.x - hw, x1: cam.x + hw, y0: cam.y - hh, y1: cam.y + hh };
  }

  function drawRoute(t) {
    const cleared = S.missions.cleared;
    const last = Math.min(MISSION_COUNT, cleared + 3);
    for (let i = 1; i <= last; i++) {
      const a = SECTOR_POS[i - 1], b = SECTOR_POS[i];
      const done = i <= cleared, next = i === cleared + 1;
      ctx.strokeStyle = done ? C.pathDone : next ? C.violet : C.path;
      ctx.globalAlpha = done ? 0.6 : next ? 0.8 : 0.35;
      ctx.lineWidth = 4;
      ctx.setLineDash(done ? [] : [10, 10]);
      ctx.lineDashOffset = next ? -t * 20 : 0;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function text(str, x, y, size, color, bold = true) {
    ctx.font = `${bold ? '700 ' : ''}${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function pill(str, x, y, bg, fg) {
    ctx.font = '700 12px system-ui, sans-serif';
    const w = ctx.measureText(str).width + 14;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - w / 2, y - 10, w, 20, 10) : ctx.rect(x - w / 2, y - 10, w, 20);
    ctx.fill();
    text(str, x, y + 1, 12, fg);
  }

  function drawBase(t) {
    // база игрока
    const r = 30;
    ctx.fillStyle = 'rgba(35,213,196,.12)';
    ctx.beginPath();
    ctx.arc(0, 0, r + 18 + Math.sin(t * 2) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b3446';
    ctx.strokeStyle = C.pathDone;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    text('🛰️', 0, 1, 24, C.text, false);
    pill('Рубеж-7', 0, r + 18, C.pathDone, '#06121a');
  }

  function drawSectors(t) {
    const cleared = S.missions.cleared;
    const last = Math.min(MISSION_COUNT, cleared + 3);
    for (let i = last; i >= 1; i--) {
      const p = SECTOR_POS[i], m = missionDef(i);
      const done = i <= cleared, next = i === cleared + 1, hidden = i > cleared + 1;
      const r = m.boss ? 26 : 20;
      if (hidden) {
        ctx.fillStyle = 'rgba(11,15,26,.7)';
        ctx.strokeStyle = C.path;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        text('?', p.x, p.y + 1, 16, C.muted);
        continue;
      }
      if (next) {
        const pulse = (Math.sin(t * 3) + 1) / 2;
        ctx.strokeStyle = m.boss ? C.red : C.violet;
        ctx.globalAlpha = 0.6 - pulse * 0.4;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 8 + pulse * 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = done ? '#1d3b33' : m.boss ? '#3b1d24' : '#2a2046';
      ctx.strokeStyle = done ? C.green : m.boss ? C.red : C.violet;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      text(done ? '✓' : m.boss ? '💀' : '👾', p.x, p.y + 1, done ? 18 : r, done ? C.green : C.text, done);

      if (i === selected) {
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -t * 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      pill(`${i}`, p.x + r * 0.8, p.y - r * 0.8, C.dark, C.text);
      if (i === selected || next) pill(m.enemy, p.x, p.y + r + 16, C.dark, done ? C.green : C.text);
    }
  }

  function drawMarch(t) {
    const m = S.march;
    if (!m) return;
    const target = SECTOR_POS[m.target];
    const pos = marchPos();
    const back = m.phase === 'back';

    // линия маршрута
    ctx.strokeStyle = back ? C.pathDone : C.warn;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 7]);
    ctx.lineDashOffset = back ? t * 30 : -t * 30;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // пыль за отрядом
    if (Math.random() < 0.6) dust.push({ x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10, life: 1 });
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life -= 0.02;
      if (d.life <= 0) { dust.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(180,170,150,${d.life * 0.25})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 4 + (1 - d.life) * 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // жетон отряда
    const bob = Math.sin(t * 6) * 2;
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 14, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = back ? '#1d3b33' : '#3b3220';
    ctx.strokeStyle = back ? C.green : C.warn;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 4 + bob, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const lead = S.squad[0] ? HEROES[S.squad[0]].icon : '🪖';
    text(lead, pos.x, pos.y - 3 + bob, 17, C.text, false);

    const left = ((back ? m.returnAt : m.arriveAt) - now()) / 1000;
    pill(`${back ? '↩' : '→'} ${fmtTime(left)}`, pos.x, pos.y - 34 + bob, back ? C.green : C.warn, '#06121a');
  }

  let lastT = performance.now();

  function draw() {
    if (!canvas || !canvas.isConnected) return;
    const tNow = performance.now();
    lastT = tNow;
    const t = tNow / 1000;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cw / 2 - cam.x * cam.zoom), dpr * (ch / 2 - cam.y * cam.zoom));

    drawTerrain(t);
    drawRoute(t);
    drawBase(t);
    drawSectors(t);
    drawMarch(t);

    // туман войны по краям экрана
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    v.addColorStop(0, 'rgba(11,15,26,0)');
    v.addColorStop(1, 'rgba(11,15,26,.75)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, cw, ch);
  }

  return { mount, draw, select, getSelected, focus, focusMarch, zoomBy };
})();
