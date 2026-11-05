// =====================================================================
// Ввод: клавиатура и сенсорные кнопки. Сюжетные сцены могут его блокировать.
// =====================================================================

AB.Input = (() => {
  const keys = new Set();
  const touch = { left: false, right: false, run: false };
  let locked = false;
  let actionQueued = false;
  let attackQueued = false;

  const map = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    run: ['ShiftLeft', 'ShiftRight'],
    action: ['KeyE', 'Enter', 'ArrowUp', 'KeyW'],
    attack: ['KeyF', 'KeyJ', 'Space'],
  };

  function init() {
    window.addEventListener('keydown', (e) => {
      if (map.action.includes(e.code) && !e.repeat) actionQueued = true;
      if (map.attack.includes(e.code) && !e.repeat) attackQueued = true;
      if (Object.values(map).flat().includes(e.code)) e.preventDefault();
      keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); Object.keys(touch).forEach((k) => (touch[k] = false)); });

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

    // Сенсорные кнопки: data-touch="left|right|run|action|attack"
    document.querySelectorAll('[data-touch]').forEach((btn) => {
      const k = btn.dataset.touch;
      const down = (e) => {
        e.preventDefault();
        if (k === 'action') actionQueued = true;
        else if (k === 'attack') attackQueued = true;
        else if (k === 'run') touch.run = !touch.run;
        else touch[k] = true;
        btn.classList.toggle('on', k === 'run' ? touch.run : true);
      };
      const up = (e) => {
        e.preventDefault();
        if (k === 'left' || k === 'right') { touch[k] = false; btn.classList.remove('on'); }
        if (k === 'action' || k === 'attack') btn.classList.remove('on');
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });
  }

  const held = (name) => map[name].some((c) => keys.has(c));

  return {
    init,
    lock() { locked = true; },
    unlock() { locked = false; actionQueued = false; attackQueued = false; },
    isLocked: () => locked,
    axis() {
      if (locked) return 0;
      return (held('right') || touch.right ? 1 : 0) - (held('left') || touch.left ? 1 : 0);
    },
    running: () => !locked && (held('run') || touch.run),
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
