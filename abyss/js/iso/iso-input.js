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
      if ((e.code === 'KeyF' || e.code === 'KeyJ') && !e.repeat) { e.preventDefault(); AB.IsoCombat.attackNearest(); return; }
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); AB.IsoFX.dash(update(0)); return; }   // №111: пробел — рывок
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
      if (twinStart(e)) return;   // №124: телефон — левая половина джойстик, правая прицел
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        // два пальца — масштаб, движение не задаём
        hold = null;
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: AB.IsoRender.zoom() };
        return;
      }
      // №69: в базе-капсуле камера свободна — перетаскивание двигает обзор, короткое нажатие — по прибору
      if (AB.IsoBase && AB.IsoBase.active()) { baseDrag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, id: e.pointerId, ghost: !!(AB.BaseBuild && AB.BaseBuild.grab(e.clientX, e.clientY)) }; return; }   // №71: в стройке палец на призраке тащит его
      // нажали на противника — атаковать; на объект — подойти и сделать; иначе — идти
      const foe = enemyAt(e.clientX, e.clientY);
      if (foe) { AB.IsoCombat.setTarget(foe); return; }
      if (AB.IsoInteract.click(e.clientX, e.clientY)) { AB.IsoCombat.setTarget(null); return; }
      hold = e.pointerId;
      moveTo(e.clientX, e.clientY);
      holdT = 0.15;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (twinMove(e)) return;
      if (e.pointerType === 'mouse') { hoverFoe = enemyAt(e.clientX, e.clientY); canvas.style.cursor = hoverFoe ? 'pointer' : AB.IsoInteract.hoverAt(e.clientX, e.clientY) ? 'pointer' : 'crosshair'; }
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (baseDrag && baseDrag.id === e.pointerId && pointers.size === 1) {
        if (!baseDrag.moved && Math.hypot(e.clientX - baseDrag.x, e.clientY - baseDrag.y) > 8) baseDrag.moved = true;
        if (baseDrag.moved) { if (baseDrag.ghost) AB.BaseBuild.dragTo(e.clientX, e.clientY); else AB.IsoRender.panBy(e.clientX - baseDrag.lx, e.clientY - baseDrag.ly); }
        baseDrag.lx = e.clientX; baseDrag.ly = e.clientY;
      }
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        AB.IsoRender.setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d));
      }
    });
    const up = (e) => {
      if (twinEnd(e)) return;
      if (baseDrag && baseDrag.id === e.pointerId) { const d = baseDrag; baseDrag = null; if (d.ghost) AB.BaseBuild.drop(); if (!d.moved && e.type === 'pointerup') AB.IsoInteract.click(e.clientX, e.clientY); }
      pointers.delete(e.pointerId);
      if (hold === e.pointerId) hold = null;
      if (pointers.size < 2) pinch = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); AB.IsoRender.zoom(e.deltaY > 0 ? -0.1 : 0.1); }, { passive: false });
  }

  let hoverFoe = null, baseDrag = null;

  // ---------- №124: телефон — «два стика» ----------
  // Левая половина экрана: джойстик движения появляется под пальцем. Правая — прицел: тянете палец — герой
  // целится в ту сторону и стреляет, пока палец прижат. Короткое касание без сдвига — как раньше (идти, дверь, предмет).
  const twin = { aim: null, tap: null };
  const isTouch = (e) => e.pointerType === 'touch' || (e.pointerType === 'pen' && matchMedia('(pointer: coarse)').matches);
  function twinStart(e) {
    if (!isTouch(e) || (AB.IsoBase && AB.IsoBase.active())) return false;
    const left = e.clientX < innerWidth / 2;
    if (left && stk.el && stk.id == null) {
      const r = stk.el.getBoundingClientRect();
      stk.el.classList.add('float', 'on'); stk.el.hidden = false;
      stk.el.style.left = `${e.clientX - r.width / 2}px`; stk.el.style.top = `${e.clientY - r.height / 2}px`; stk.el.style.bottom = 'auto';
      stk.cx = e.clientX; stk.cy = e.clientY; stk.R = r.width * 0.36; stk.id = e.pointerId; stk.x = stk.y = 0;
      twin.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, side: 'l' };
      return true;
    }
    if (!left && !twin.aim) {
      twin.aim = { id: e.pointerId, cx: e.clientX, cy: e.clientY, dir: null, raw: null, pull: 0 };
      twin.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, side: 'r' };
      aimEl(true, e.clientX, e.clientY, 0, 0);
      return true;
    }
    return false;
  }
  function twinMove(e) {
    if (twin.tap && twin.tap.id === e.pointerId && Math.hypot(e.clientX - twin.tap.x, e.clientY - twin.tap.y) > 12) twin.tap.moved = true;
    if (stk.id === e.pointerId && stk.el.classList.contains('float')) {
      const dx = e.clientX - stk.cx, dy = e.clientY - stk.cy, n = Math.hypot(dx, dy), k = n > stk.R ? stk.R / n : 1;
      stk.x = (dx * k) / stk.R; stk.y = (dy * k) / stk.R; stk.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      return true;
    }
    if (twin.aim && twin.aim.id === e.pointerId) {
      // №128: мёртвая зона (дрожание пальца у центра не крутит прицел); направление — «сырое», сглаживается в update
      const A = aimRules(), dx = e.clientX - twin.aim.cx, dy = e.clientY - twin.aim.cy, n = Math.hypot(dx, dy);
      if (n > A.dead) {
        const TW = AB.IsoRender.TW, TH = AB.IsoRender.TH, wx = dy / TH + dx / TW, wy = dy / TH - dx / TW, m = Math.hypot(wx, wy);
        twin.aim.raw = { x: wx / m, y: wy / m };
      }
      twin.aim.pull = Math.min(1, n / A.R);
      const k = n > A.R ? A.R / n : 1; aimEl(true, twin.aim.cx, twin.aim.cy, dx * k, dy * k, twin.aim.pull >= A.fire);
      return true;
    }
    return false;
  }
  function twinEnd(e) {
    const tap = twin.tap && twin.tap.id === e.pointerId ? twin.tap : null;
    let mine = false;
    if (stk.id === e.pointerId && stk.el.classList.contains('float')) {
      stk.id = null; stk.x = stk.y = 0; stk.knob.style.transform = '';
      stk.el.classList.remove('float', 'on'); stk.el.style.left = stk.el.style.top = stk.el.style.bottom = '';
      mine = true;
    }
    if (twin.aim && twin.aim.id === e.pointerId) { twin.aim = null; aimEl(false); mine = true; }
    if (tap) {
      twin.tap = null;
      if (!tap.moved && performance.now() - tap.t < 350 && e.type === 'pointerup') {   // короткое касание — как раньше
        const foe = enemyAt(e.clientX, e.clientY);
        if (foe) AB.IsoCombat.setTarget(foe);
        else if (!AB.IsoInteract.click(e.clientX, e.clientY)) moveTo(e.clientX, e.clientY);
      }
    }
    return mine;
  }
  let aimNode = null;
  function aimEl(on, x, y, dx, dy, firing) {
    if (!aimNode) { aimNode = document.createElement('div'); aimNode.id = 'iso-aim'; aimNode.innerHTML = '<s></s><i></i>'; document.body.appendChild(aimNode); }
    aimNode.hidden = !on;
    if (!on) return;
    aimNode.style.left = `${x - 64}px`; aimNode.style.top = `${y - 64}px`;
    aimNode.lastChild.style.transform = `translate(${dx}px, ${dy}px)`;
    aimNode.classList.toggle('pull', AB.IsoSettings && AB.IsoSettings.get('fireMode') === 'pull');   // отметка «выстрел» — внешнее кольцо
    aimNode.classList.toggle('fire', !!firing);
  }
  // №128: правила прицела: мёртвая зона, радиус стика, отметка выстрела (режим «pull»), скорость следования по чувствительности
  function aimRules() {
    const s = AB.IsoSettings ? AB.IsoSettings.get('sens') : 3;
    return { dead: 24 - s * 2, R: 56, fire: 0.78, jitter: [6, 4, 2.5, 1.2, 0][Math.max(0, Math.min(4, s - 1))] };   // jitter — градусы
  }
  // №132: прицел без задержки — сразу туда, куда палец; мелкое дрожание (меньше порога чувствительности) не учитывается
  function aimStep() {
    const a = twin.aim; if (!a || !a.raw) return;
    if (!a.dir) { a.dir = { ...a.raw }; return; }
    const d = Math.abs(Math.atan2(a.dir.x * a.raw.y - a.dir.y * a.raw.x, a.dir.x * a.raw.x + a.dir.y * a.raw.y)) * 180 / Math.PI;
    if (d >= aimRules().jitter) a.dir = { ...a.raw };
  }
  const aimDir = () => (twin.aim && twin.aim.dir) || null;
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
    aimStep(dt);
    const aim = aimDir();
    if (aim && dt > 0 && !(AB.IsoStory.locked() || AB.IsoGame.busy())) {
      // №128: режим стрельбы из настроек: «auto» — по врагу в секторе прицела; «pull» — когда стик отведён до отметки
      if (AB.IsoSettings && AB.IsoSettings.get('fireMode') === 'pull') { if (twin.aim.pull >= aimRules().fire) AB.IsoCombat.fireAt(aim, true); }
      else AB.IsoCombat.fireAt(aim);
    }
    const st = stickAxis();
    if (st && !(AB.IsoBase && AB.IsoBase.active())) return { ...st, aim };
    const a = axis();
    return { x: a.x, y: a.y, walk: keys.has('ShiftLeft') || keys.has('ShiftRight'), aim };
  }

  return { init, update, stick, hoverFoe: () => hoverFoe, stickActive: () => stk.id != null, aim: aimDir };
})();
