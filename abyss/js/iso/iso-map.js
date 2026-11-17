// =====================================================================
// ISO MAP (дополнение №50). Простая карта сектора по центру снизу — в той же
// изометрии, что и сцена: помещения (текущее светлее), отряд, противники
// рядом, выходы и люки, цель задания. Нажатие — крупнее / меньше.
// =====================================================================

AB.IsoMap = (() => {
  let cv, g, big = false, t = 0, acc = 0, view = null, pick = null, ui = null;
  const W = () => AB.IsoWorld;
  const seen = (r) => !AB.IsoRender.roomSeen || AB.IsoRender.roomSeen(r);
  const say = (text) => AB.Bus.emit('iso:toast', { text, kind: 'info' });

  // №133: маленькая карта — нажать, чтобы открыть большую. На большой: нажать на точку в открытом помещении —
  // «Идти»: отряд идёт туда по открытому маршруту; ✕ — закрыть карту.
  function init(canvas) {
    cv = canvas; g = cv.getContext('2d');
    cv.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!big) { setBig(true); return; }
      const w = toWorld(e.clientX, e.clientY);
      const r = w && W().room(w.x, w.y);
      if (!r) { pick = null; say('Здесь нет прохода'); }
      else if (!seen(r)) { pick = null; say('Туда ещё не ходили — помещение не открыто'); }
      else pick = { x: Math.floor(w.x) + 0.5, y: Math.floor(w.y) + 0.5, room: r };
      acc = 1; showUi();
    });
    ui = document.createElement('div'); ui.id = 'iso-map-ui'; ui.hidden = true;
    ui.innerHTML = '<button data-m="go" disabled>Идти</button><button data-m="x" aria-label="Закрыть карту">✕</button>';
    document.body.appendChild(ui);
    ui.addEventListener('pointerdown', (e) => e.stopPropagation());
    ui.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      if (b.dataset.m === 'x') { setBig(false); return; }
      if (b.dataset.m === 'go' && pick) go(pick);
    });
  }
  function setBig(on) { big = on; pick = on ? pick : null; cv.classList.toggle('big', big); acc = 1; showUi(); }
  function showUi() {
    if (!ui) return;
    ui.hidden = !big;
    ui.querySelector('[data-m="go"]').disabled = !pick;
    if (big) { const r = cv.getBoundingClientRect(); ui.style.left = `${r.right - 8}px`; ui.style.top = `${r.top + 8}px`; }
  }
  // экран → мир (клетки) по последней отрисовке карты
  function toWorld(cx, cy) {
    if (!view) return null;
    const r = cv.getBoundingClientRect(), sx = (cx - r.left) * view.dpr, sy = (cy - r.top) * view.dpr;
    const px = (sx - view.ox) / view.k, py = (sy - view.oy) / view.k;
    return { x: py + px / 2, y: py - px / 2 };
  }
  // идти: только если путь целиком по открытым помещениям
  function go(p) {
    const l = AB.IsoParty.lead();
    if (AB.IsoStory.locked() || AB.IsoGame.busy()) return;
    const path = W().path(l.x, l.y, p.x, p.y);
    if (!path) { say('Туда не пройти — путь закрыт'); return; }
    const bad = path.find((n) => { const r = W().room(n.x, n.y); return r && !seen(r); });
    if (bad) { say('Маршрут идёт через неоткрытые помещения'); return; }
    AB.IsoCombat.setTarget(null);
    AB.IsoParty.goTo(p.x, p.y);
    setBig(false);
  }

  // где цель задания в этом секторе (оборудование — у него, иначе — по месту в помещении)
  function goal() {
    const q = AB.Quests.target && AB.Quests.target();
    if (!q) return null;
    const lay = W().layout();
    if (!lay.areas.some((a) => a.room === q.room)) {
      // цель в другом секторе — показываем выход, который туда ведёт (если есть)
      const ex = (lay.exits || []).find((e) => e.to && AB.ISO_LAYOUTS[e.to.sector].areas.some((a) => a.room === q.room));
      return ex ? { x: ex.x + 0.5, y: ex.y + 0.5, out: true } : null;
    }
    const eq = W().props().find((p) => p.equip && AB.ID.get(p.equip).room === q.room && AB.ID.get(p.equip).x === q.x);
    if (eq) return { x: eq.x + eq.w / 2, y: eq.y + eq.h / 2 };
    return AB.IsoInteract.alongRoom(q.room, q.x);
  }

  function draw(dt) {
    t += dt; acc += dt;
    if (acc < 0.1) return;                         // 10 раз в секунду хватает
    acc = 0;
    const lay = W().layout();
    if (!lay) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    // границы сектора в изометрии
    const P = (x, y) => ({ x: x - y, y: (x + y) / 2 });
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    const fitAreas = lay.areas.some((a) => seen(a.room)) ? lay.areas.filter((a) => seen(a.room)) : lay.areas;   // масштаб — по открытой части
    for (const a of fitAreas) for (const [cx, cy] of [[a.x, a.y], [a.x + a.w, a.y], [a.x, a.y + a.h], [a.x + a.w, a.y + a.h]]) {
      const p = P(cx, cy); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const pad = 8 * dpr, k = Math.min((cv.width - pad * 2) / (x1 - x0), (cv.height - pad * 2) / (y1 - y0));
    const ox = (cv.width - (x1 - x0) * k) / 2 - x0 * k, oy = (cv.height - (y1 - y0) * k) / 2 - y0 * k;
    const S = (x, y) => { const p = P(x, y); return { x: ox + p.x * k, y: oy + p.y * k }; };
    view = { ox, oy, k, dpr };
    const l = AB.IsoParty.lead(), here = W().room(l.x, l.y);
    // помещения — только открытые (где отряд уже был)
    for (const a of lay.areas) {
      if (!seen(a.room)) continue;
      const c = [S(a.x, a.y), S(a.x + a.w, a.y), S(a.x + a.w, a.y + a.h), S(a.x, a.y + a.h)];
      g.beginPath(); g.moveTo(c[0].x, c[0].y); for (const p of c.slice(1)) g.lineTo(p.x, p.y); g.closePath();
      g.fillStyle = a.room === here ? 'rgba(150,200,215,.42)' : 'rgba(150,170,180,.2)'; g.fill();
      g.strokeStyle = 'rgba(190,220,230,.35)'; g.lineWidth = dpr * 0.8; g.stroke();
    }
    const dot = (x, y, r, col) => { const p = S(x, y); g.fillStyle = col; g.beginPath(); g.arc(p.x, p.y, r * dpr, 0, 7); g.fill(); return p; };
    // закрытые двери, выходы, люки
    for (const d of AB.IsoInteract.doors()) { const [tx, ty] = d.tiles[0]; if (!seen(d.def.room) && !seen(W().room(tx + 0.5, ty + 0.5))) continue; dot(tx + 0.5, ty + 0.5, 1.8, d.state === 'open' ? 'rgba(90,230,130,.8)' : 'rgba(255,190,70,.9)'); }
    for (const e of lay.exits || []) if (seen(e.room)) dot(e.x + 0.5, e.y + 0.5, 2.2, e.to ? 'rgba(255,224,138,.95)' : 'rgba(140,140,140,.7)');
    for (const lk of lay.links || []) for (const en of [lk.a, lk.b]) dot(en.x + 0.5, en.y + 0.5, 1.8, 'rgba(255,224,138,.8)');
    // противники рядом с отрядом
    for (const e of AB.IsoEnemies.alive()) if (Math.hypot(e.x - l.x, e.y - l.y) < 12 && (!AB.IsoRender.roomVisible || AB.IsoRender.roomVisible(W().room(e.x, e.y)))) dot(e.x, e.y, 1.8, 'rgba(255,80,60,.95)');
    // цель задания — мигает
    const gl = goal();
    if (gl) { const p = dot(gl.x, gl.y, 2.5 + Math.sin(t * 5) * 0.8, 'rgba(255,210,90,.95)'); g.strokeStyle = 'rgba(255,210,90,.6)'; g.lineWidth = dpr; g.beginPath(); g.arc(p.x, p.y, (5 + Math.sin(t * 5)) * dpr, 0, 7); g.stroke(); }
    // отряд
    for (const m of AB.IsoParty.members()) if (m !== l) dot(m.x, m.y, 1.8, 'rgba(230,230,230,.9)');
    dot(l.x, l.y, 2.6, '#5ee6ff');
    // выбранная точка (большая карта)
    if (big && pick) { const p = S(pick.x, pick.y); g.strokeStyle = '#5ee6ff'; g.lineWidth = 2 * dpr; const rr = (5 + Math.sin(t * 6)) * dpr; g.beginPath(); g.moveTo(p.x - rr, p.y); g.lineTo(p.x + rr, p.y); g.moveTo(p.x, p.y - rr); g.lineTo(p.x, p.y + rr); g.stroke(); g.beginPath(); g.arc(p.x, p.y, rr * 1.3, 0, 7); g.stroke(); }
  }

  return { init, draw, goal, _view: () => view };
})();
