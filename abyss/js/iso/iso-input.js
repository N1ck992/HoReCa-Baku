// =====================================================================
// ISO INPUT (этап 1 изометрии, дополнение №45). Управление в духе Diablo:
//   • мышь / касание: нажать на точку — герой идёт туда в обход препятствий;
//     удерживать — идёт за указателем;
//   • WASD и стрелки — направления экрана, пересчитанные в изометрию;
//   • Shift — шагом (по умолчанию бег, как в Diablo);
//   • Q или Tab — следующий персонаж отряда; колесо, −/+ и щипок — масштаб.
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
      if (e.code === 'KeyQ' || e.code === 'Tab') { e.preventDefault(); if (!e.repeat) AB.IsoParty.cycle(); return; }
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
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        // два пальца — масштаб, движение не задаём
        hold = null;
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: AB.IsoRender.zoom() };
        return;
      }
      hold = e.pointerId;
      moveTo(e.clientX, e.clientY);
      holdT = 0.15;
    });
    canvas.addEventListener('pointermove', (e) => {
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

  function moveTo(cx, cy) {
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

  // кадр: удерживаемый указатель ведёт героя за собой; клавиши — напрямую
  function update(dt) {
    if (hold != null && pointers.has(hold)) {
      holdT -= dt;
      if (holdT <= 0) { const p = pointers.get(hold); moveTo(p.x, p.y); holdT = 0.2; }
    }
    const a = axis();
    return { x: a.x, y: a.y, walk: keys.has('ShiftLeft') || keys.has('ShiftRight') };
  }

  return { init, update };
})();
