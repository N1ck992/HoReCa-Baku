// =====================================================================
// ISO INPUT (этап 1 изометрии, дополнение №45). Управление в духе Diablo:
//   • мышь / касание: нажать на точку — герой идёт туда в обход препятствий;
//     удерживать — идёт за указателем;
//   • WASD и стрелки — направления экрана, пересчитанные в изометрию;
//   • Shift — шагом (по умолчанию бег, как в Diablo);
//   • нажать на дверь, предмет, оборудование — подойти и сделать; E — с ближайшим;
//   • Q — следующий персонаж отряда; I или Tab — инвентарь; колесо, −/+ и щипок — масштаб.
// Своё, отдельное от старого AB.Input (у вида сбоку другая схема).
// =====================================================================

AB.IsoInput = (() => {
  const keys = new Set();
  const MAP = {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  };
  const pointers = new Map();         // активные касания / мышь
  let hold = null;                    // указатель, за которым идёт герой
  let holdT = 0, pinch = null;

  function init(canvas) {
    window.addEventListener('keydown', (e) => {
      // диалог: E, пробел, Enter — следующая реплика; во время сцены остальное не работает
      if (AB.Dialog.isOpen()) { if (['KeyE', 'Space', 'Enter'].includes(e.code) && !e.repeat) { e.preventDefault(); AB.Dialog.next(); } return; }
      if (AB.IsoStory.locked() || AB.IsoGame.busy()) return;
      if (AB.IsoInventory && (AB.IsoInventory.isOpen() || AB.IsoInventory.heroOpen())) return;   // открыто окно — клавиши его
      if (e.code === 'KeyQ') { e.preventDefault(); if (!e.repeat) AB.IsoParty.cycle(); return; }
      if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) { AB.IsoInteract.actNearest(); return; }
      if ((e.code === 'KeyF' || e.code === 'Space') && !e.repeat) { e.preventDefault(); AB.IsoCombat.attackNearest(); return; }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') AB.IsoRender.zoom(-0.1);
      if (e.code === 'Equal' || e.code === 'NumpadAdd') AB.IsoRender.zoom(0.1);
      if (Object.values(MAP).flat().includes(e.code)) e.preventDefault();
      keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); pointers.clear(); hold = null; pinch = null; });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (AB.Dialog.isOpen()) { AB.Dialog.next(); return; }
      if (AB.IsoStory.locked() || AB.IsoGame.busy()) return;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        // два пальца — масштаб, движение не задаём
        hold = null;
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: AB.IsoRender.zoom() };
        return;
      }
      // нажали на противника — атаковать; на объект — подойти и сделать; иначе — идти
      const foe = enemyAt(e.clientX, e.clientY);
      if (foe) { AB.IsoCombat.setTarget(foe); return; }
      if (AB.IsoInteract.click(e.clientX, e.clientY)) { AB.IsoCombat.setTarget(null); return; }
      hold = e.pointerId;
      moveTo(e.clientX, e.clientY);
      holdT = 0.15;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { hoverFoe = enemyAt(e.clientX, e.clientY); canvas.style.cursor = hoverFoe ? 'pointer' : AB.IsoInteract.hoverAt(e.clientX, e.clientY) ? 'pointer' : 'crosshair'; }
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        AB.IsoRender.setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d));
      }
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (hold === e.pointerId) hold = null;
      if (pointers.size < 2) pinch = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); AB.IsoRender.zoom(e.deltaY > 0 ? -0.1 : 0.1); }, { passive: false });
  }

  let hoverFoe = null;
  // противник под указателем (по фигуре, не только по ногам)
  function enemyAt(cx, cy) {
    let best = null, bd = 34;
    for (const e of AB.IsoEnemies.alive()) {
      const p = AB.IsoRender.screenOf(e.x, e.y), z = AB.IsoRender.zoom();
      const d = Math.min(Math.hypot(p.x - cx, p.y - cy), Math.hypot(p.x - cx, p.y - 30 * z - cy), Math.hypot(p.x - cx, p.y - 55 * z - cy));
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function moveTo(cx, cy) {
    if (AB.IsoBase && AB.IsoBase.active()) return;      // в базе экипаж занят делами — по полу не водим
    AB.IsoCombat.setTarget(null);
    const w = AB.IsoRender.pick(cx, cy);
    AB.IsoParty.goTo(w.x, w.y);
  }

  // направление клавиш: экран → мир (вверх по экрану = на северо-запад и т. д.)
  function axis() {
    const on = (k) => MAP[k].some((c) => keys.has(c));
    const sx = (on('right') ? 1 : 0) - (on('left') ? 1 : 0), sy = (on('down') ? 1 : 0) - (on('up') ? 1 : 0);
    if (!sx && !sy) return { x: 0, y: 0 };
    const TW = AB.IsoRender.TW, TH = AB.IsoRender.TH;
    const wx = sy / TH + sx / TW, wy = sy / TH - sx / TW, n = Math.hypot(wx, wy);
    return { x: wx / n, y: wy / n };
  }

  // джойстик (телефон, №55): слева снизу; отклонение — направление по экрану, как WASD.
  // Сильно отклонили — бег, слегка — шагом.
  const stk = { id: null, x: 0, y: 0, el: null, knob: null, cx: 0, cy: 0, R: 44 };
  function stick(el) {
    if (!el) return;
    stk.el = el; stk.knob = el.querySelector('i');
    const touch = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('stick');
    el.hidden = !touch;
    if (touch) document.body.classList.add('has-stick');
    const set = (e) => {
      const dx = e.clientX - stk.cx, dy = e.clientY - stk.cy, n = Math.hypot(dx, dy), k = n > stk.R ? stk.R / n : 1;
      stk.x = (dx * k) / stk.R; stk.y = (dy * k) / stk.R;
      stk.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (AB.Dialog.isOpen()) { AB.Dialog.next(); return; }
      const r = el.getBoundingClientRect();
      stk.cx = r.left + r.width / 2; stk.cy = r.top + r.height / 2; stk.R = r.width * 0.36;
      stk.id = e.pointerId; el.setPointerCapture(e.pointerId); el.classList.add('on');
      AB.IsoParty.stop(); AB.IsoCombat.setTarget(null);
      set(e);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === stk.id) set(e); });
    const end = (e) => { if (e.pointerId !== stk.id) return; stk.id = null; stk.x = stk.y = 0; stk.knob.style.transform = ''; el.classList.remove('on'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  function stickAxis() {
    const n = Math.hypot(stk.x, stk.y);
    if (stk.id == null || n < 0.18) return null;
    const TW = AB.IsoRender.TW, TH = AB.IsoRender.TH;
    const wx = stk.y / TH + stk.x / TW, wy = stk.y / TH - stk.x / TW, m = Math.hypot(wx, wy);
    return { x: wx / m, y: wy / m, walk: n < 0.55 };
  }

  // кадр: удерживаемый указатель ведёт героя за собой; клавиши — напрямую
  function update(dt) {
    if (hold != null && pointers.has(hold)) {
      holdT -= dt;
      if (holdT <= 0) { const p = pointers.get(hold); moveTo(p.x, p.y); holdT = 0.2; }
    }
    if (AB.IsoInventory && (AB.IsoInventory.isOpen() || AB.IsoInventory.heroOpen())) return { x: 0, y: 0, walk: false };   // открыт инвентарь — стоит
    const st = stickAxis();
    if (st && !(AB.IsoBase && AB.IsoBase.active())) return st;
    const a = axis();
    return { x: a.x, y: a.y, walk: keys.has('ShiftLeft') || keys.has('ShiftRight') };
  }

  return { init, update, stick, hoverFoe: () => hoverFoe, stickActive: () => stk.id != null };
})();
