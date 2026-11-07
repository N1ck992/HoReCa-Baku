// =====================================================================
// Ввод: клавиатура и сенсорные кнопки. Сюжетные сцены могут его блокировать.
// =====================================================================

AB.Input = (() => {
  const keys = new Set();
  const touch = { left: false, right: false, run: false };
  let locked = false;
  let actionQueued = false;
  let attackQueued = false;
  let leadQueued = false;
  let altQueued = false;
  let stickX = 0;          // джойстик: −1…1
  const STICK_DEAD = 0.18, STICK_RUN = 0.62;

  const map = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    run: ['ShiftLeft', 'ShiftRight'],
    action: ['KeyE', 'Enter', 'ArrowUp', 'KeyW'],
    attack: ['KeyF', 'KeyJ', 'Space'],
    lead: ['KeyQ'],
    alt: ['KeyR'],
  };

  function init() {
    window.addEventListener('keydown', (e) => {
      if (map.action.includes(e.code) && !e.repeat) actionQueued = true;
      if (map.attack.includes(e.code) && !e.repeat) attackQueued = true;
      if (map.lead.includes(e.code) && !e.repeat) leadQueued = true;
      if (map.alt.includes(e.code) && !e.repeat) altQueued = true;
      if (Object.values(map).flat().includes(e.code)) e.preventDefault();
      keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); stickX = 0; Object.keys(touch).forEach((k) => (touch[k] = false)); });

    // Удар мышью по игровому экрану
    const screen = document.getElementById('screen');
    if (screen) {
      screen.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        // нажали на персонажа — показать, что он несёт; иначе мышью — удар
        if (AB.Input.onScreenTap && AB.Input.onScreenTap(e.clientX, e.clientY)) return;
        if (e.pointerType === 'mouse') attackQueued = true;
      });
    }

    // Джойстик: тянем пальцем влево-вправо; слабо — шаг, до края — бег
    const stick = document.getElementById('stick');
    if (stick) {
      const knob = stick.querySelector('i');
      let pid = null, cx = 0;
      const moveTo = (x) => {
        const R = stick.clientWidth / 2;
        const dx = Math.max(-R, Math.min(R, x - cx));
        stickX = dx / R;
        knob.style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
        stick.classList.toggle('walk', Math.abs(stickX) > STICK_DEAD);
        stick.classList.toggle('run', Math.abs(stickX) > STICK_RUN);
      };
      const release = () => {
        pid = null; stickX = 0;
        knob.style.transform = '';
        stick.classList.remove('walk', 'run');
      };
      stick.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        pid = e.pointerId;
        stick.setPointerCapture(pid);
        const r = stick.getBoundingClientRect();
        cx = r.left + r.width / 2;
        moveTo(e.clientX);
      });
      stick.addEventListener('pointermove', (e) => { if (e.pointerId === pid) moveTo(e.clientX); });
      stick.addEventListener('pointerup', release);
      stick.addEventListener('pointercancel', release);
      stick.addEventListener('lostpointercapture', release);
    }

    // Сенсорные кнопки: data-touch="left|right|run|action|attack"
    document.querySelectorAll('[data-touch]').forEach((btn) => {
      const k = btn.dataset.touch;
      const down = (e) => {
        e.preventDefault();
        if (k === 'action') actionQueued = true;
        else if (k === 'attack') attackQueued = true;
        else if (k === 'lead') leadQueued = true;
        else if (k === 'run') touch.run = !touch.run;
        else touch[k] = true;
        btn.classList.toggle('on', k === 'run' ? touch.run : true);
      };
      const up = (e) => {
        e.preventDefault();
        if (k === 'left' || k === 'right') { touch[k] = false; btn.classList.remove('on'); }
        if (k === 'action' || k === 'attack' || k === 'lead') btn.classList.remove('on');
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });
  }

  const held = (name) => map[name].some((c) => keys.has(c));

  return {
    consumeLead() { const q = leadQueued; leadQueued = false; return q; },
    consumeAlt() { const q = altQueued; altQueued = false; return q; },
    queueAlt() { if (!locked) altQueued = true; },
    init,
    lock() { locked = true; },
    unlock() { locked = false; actionQueued = false; attackQueued = false; },
    isLocked: () => locked,
    axis() {
      if (locked) return 0;
      const k = (held('right') || touch.right ? 1 : 0) - (held('left') || touch.left ? 1 : 0);
      if (k) return k;
      return Math.abs(stickX) > STICK_DEAD ? Math.sign(stickX) : 0;
    },
    running: () => !locked && (held('run') || touch.run || Math.abs(stickX) > STICK_RUN),
    // действие с экрана: нажали на подсказку по центру
    queueAction() { if (!locked) actionQueued = true; },
    consumeAttack() {
      const a = attackQueued && !locked;
      attackQueued = false;
      return a;
    },
    consumeAction() {
      const a = actionQueued && !locked;
      actionQueued = false;
      return a;
    },
  };
})();
