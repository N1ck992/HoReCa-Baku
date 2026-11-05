// =====================================================================
// Точка входа: запуск модулей, игровой цикл, интерфейс поверх canvas.
// =====================================================================

(() => {
  const $ = (s) => document.querySelector(s);
  const HERO = 'CHAR-001';
  const isTouch = matchMedia('(pointer: coarse)').matches;

  // ---------- Интерфейс ----------
  const ui = {
    room: $('#hud-room'),
    prompt: $('#prompt'),
    hint: $('#hint'),
    toast: $('#toast'),
    skip: $('#btn-skip'),
    ids: $('#btn-ids'),
    title: $('#title'),
  };
  let toastTimer = null;

  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2200);
  }

  function showRoom(roomId) {
    const r = AB.ID.get(roomId);
    ui.room.innerHTML = `<b>${r.name}</b><span>${r.id}${r.temp ? ' · временный ID' : ''}</span>`;
    ui.room.classList.remove('flash');
    void ui.room.offsetWidth;
    ui.room.classList.add('flash');
  }

  function updatePrompt() {
    const hero = AB.Chars.get(HERO);
    if (!hero || !hero.controllable || AB.Rooms.inTransition()) { ui.prompt.classList.remove('show'); return; }
    const d = AB.Rooms.nearDoor(hero.x);
    if (!d) { ui.prompt.classList.remove('show'); return; }
    const pass = AB.Rooms.canPass(d);
    ui.prompt.innerHTML = pass.ok
      ? `<kbd>${isTouch ? '◉' : 'E'}</kbd> Открыть дверь`
      : `<kbd class="no">${isTouch ? '◉' : 'E'}</kbd> ${pass.reason}`;
    ui.prompt.classList.add('show');
  }

  // ---------- События модулей ----------
  AB.Bus.on('room:enter', ({ roomId }) => { showRoom(roomId); AB.Save.save(); });
  AB.Bus.on('door:denied', ({ reason }) => toast(reason));
  AB.Bus.on('transition:end', () => { const h = AB.Chars.get(HERO); if (h) h.controllable = true; });
  // после выхода из капсулы герой остаётся там, где закончилась анимация
  function finishWake(charId) {
    const h = AB.Chars.get(charId);
    const tr = AB.Anim.current(charId);
    if (!h || !tr || tr.action !== 'wake' || h.wakeDone) return;
    h.wakeDone = true;
    h.x += 70 * h.facing;
    h.action = 'idle';
    AB.Anim.play(charId, 'idle', { restart: true });
  }
  AB.Bus.on('anim:end', ({ charId, action }) => { if (action === 'wake') finishWake(charId); });
  let skipRequested = false;
  AB.Bus.on('ui:hint', (kind) => {
    if (kind !== 'move') return;
    ui.hint.innerHTML = isTouch
      ? 'Кнопки ◀ ▶ — идти · <b>»</b> — бег · <b>◉</b> — действие'
      : '<kbd>A</kbd><kbd>D</kbd> или <kbd>←</kbd><kbd>→</kbd> — идти · <kbd>Shift</kbd> — бег · <kbd>E</kbd> — действие';
    ui.hint.classList.add('show');
    setTimeout(() => ui.hint.classList.remove('show'), 7000);
  });
  AB.Bus.on('event:start', () => ui.skip.hidden = false);
  AB.Bus.on('event:end', () => { ui.skip.hidden = true; AB.Save.save(); });

  ui.skip.addEventListener('click', () => { AB.Story.skip(); skipRequested = true; ui.title.remove(); });
  ui.ids.addEventListener('click', () => {
    const on = AB.Render.toggleIds();
    ui.ids.classList.toggle('on', on);
  });
  $('#btn-menu').addEventListener('click', () => $('#menu').hidden = false);
  $('#btn-close-menu').addEventListener('click', () => $('#menu').hidden = true);
  $('#btn-restart').addEventListener('click', () => {
    AB.Save.clear();
    location.reload();
  });
  if (isTouch) document.body.classList.add('touch');

  // ---------- Запуск ----------
  function boot() {
    AB.Assets.load();
    AB.Input.init();
    AB.Render.init($('#screen'));

    const save = AB.Save.load();
    if (save) {
      AB.Chars.restore(save.chars);
      AB.Rooms.restore(save.rooms);
      AB.Story.restore(save.story);
      const hero = AB.Chars.get(HERO);
      AB.Rooms.enter(save.rooms.current || 'ROOM-001', { x: hero ? hero.x : null });
      if (hero) hero.controllable = true;
      ui.title.remove();
    } else {
      const start = AB.ID.get('ROOM-001');
      AB.Chars.spawn(HERO, { room: start.id, x: start.spawn.x });
      AB.Rooms.setPropState('ROOM-001:cryopod-main', 'closed');
      AB.Rooms.enter('ROOM-001');
      AB.Story.trigger('new_game');
      ui.title.classList.add('play');
      setTimeout(() => ui.title.remove(), 6500);
    }
    AB.Render.snapCamera();
    ui.ids.classList.toggle('on', AB.Render.idsShown());

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      AB.Story.update(dt);
      if (skipRequested) { skipRequested = false; finishWake(HERO); }

      const hero = AB.Chars.get(HERO);
      if (hero && hero.controllable && !AB.Rooms.inTransition() && AB.Input.consumeAction()) {
        const d = AB.Rooms.nearDoor(hero.x);
        if (d) {
          hero.facing = d.x >= hero.x ? 1 : -1;
          AB.Chars.playAction(HERO, 'interact');
          if (AB.Rooms.useDoor(d)) hero.controllable = false;
        }
      }

      AB.Chars.update(dt, AB.Rooms.bounds());
      AB.Anim.update(dt);
      AB.Rooms.update(dt);
      AB.Rooms.tickProps(dt);
      AB.Render.frame(dt);
      updatePrompt();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    setInterval(() => AB.Save.save(), 10000);
    window.addEventListener('pagehide', () => AB.Save.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) AB.Save.save(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
