// =====================================================================
// ISO MAP (дополнение №50). Простая карта сектора по центру снизу — в той же
// изометрии, что и сцена: помещения (текущее светлее), отряд, противники
// рядом, выходы и люки, цель задания. Нажатие — крупнее / меньше.
// =====================================================================

AB.IsoMap = (() => {
  let cv, g, big = false, t = 0, acc = 0;
  const W = () => AB.IsoWorld;

  function init(canvas) {
    cv = canvas; g = cv.getContext('2d');
    cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); big = !big; cv.classList.toggle('big', big); });
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
    for (const a of lay.areas) for (const [cx, cy] of [[a.x, a.y], [a.x + a.w, a.y], [a.x, a.y + a.h], [a.x + a.w, a.y + a.h]]) {
      const p = P(cx, cy); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const pad = 8 * dpr, k = Math.min((cv.width - pad * 2) / (x1 - x0), (cv.height - pad * 2) / (y1 - y0));
    const ox = (cv.width - (x1 - x0) * k) / 2 - x0 * k, oy = (cv.height - (y1 - y0) * k) / 2 - y0 * k;
    const S = (x, y) => { const p = P(x, y); return { x: ox + p.x * k, y: oy + p.y * k }; };
    const l = AB.IsoParty.lead(), here = W().room(l.x, l.y);
    // помещения
    for (const a of lay.areas) {
      const c = [S(a.x, a.y), S(a.x + a.w, a.y), S(a.x + a.w, a.y + a.h), S(a.x, a.y + a.h)];
      g.beginPath(); g.moveTo(c[0].x, c[0].y); for (const p of c.slice(1)) g.lineTo(p.x, p.y); g.closePath();
      g.fillStyle = a.room === here ? 'rgba(150,200,215,.42)' : 'rgba(150,170,180,.2)'; g.fill();
      g.strokeStyle = 'rgba(190,220,230,.35)'; g.lineWidth = dpr * 0.8; g.stroke();
    }
    const dot = (x, y, r, col) => { const p = S(x, y); g.fillStyle = col; g.beginPath(); g.arc(p.x, p.y, r * dpr, 0, 7); g.fill(); return p; };
    // закрытые двери, выходы, люки
    for (const d of AB.IsoInteract.doors()) { const [tx, ty] = d.tiles[0]; dot(tx + 0.5, ty + 0.5, 1.8, d.state === 'open' ? 'rgba(90,230,130,.8)' : 'rgba(255,190,70,.9)'); }
    for (const e of lay.exits || []) dot(e.x + 0.5, e.y + 0.5, 2.2, e.to ? 'rgba(255,224,138,.95)' : 'rgba(140,140,140,.7)');
    for (const lk of lay.links || []) for (const en of [lk.a, lk.b]) dot(en.x + 0.5, en.y + 0.5, 1.8, 'rgba(255,224,138,.8)');
    // противники рядом с отрядом
    for (const e of AB.IsoEnemies.alive()) if (Math.hypot(e.x - l.x, e.y - l.y) < 12) dot(e.x, e.y, 1.8, 'rgba(255,80,60,.95)');
    // цель задания — мигает
    const gl = goal();
    if (gl) { const p = dot(gl.x, gl.y, 2.5 + Math.sin(t * 5) * 0.8, 'rgba(255,210,90,.95)'); g.strokeStyle = 'rgba(255,210,90,.6)'; g.lineWidth = dpr; g.beginPath(); g.arc(p.x, p.y, (5 + Math.sin(t * 5)) * dpr, 0, 7); g.stroke(); }
    // отряд
    for (const m of AB.IsoParty.members()) if (m !== l) dot(m.x, m.y, 1.8, 'rgba(230,230,230,.9)');
    dot(l.x, l.y, 2.6, '#5ee6ff');
  }

  return { init, draw, goal };
})();
