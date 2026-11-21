// =====================================================================
// ANIMATION MANAGER (GDD §13.9). Хранит, какая анимация (ANIM-ID)
// сейчас играет у каждого персонажа и сколько времени она идёт.
// Как её рисовать (спрайт-лист или заглушка), решает рендерер.
// =====================================================================

AB.Anim = (() => {
  const tracks = new Map(); // charId -> { action, animId, t, done }

  function resolve(charId, action) {
    const c = AB.ID.get(charId);
    const animId = c && c.anims[action];
    if (!animId || !AB.ID.has(animId)) {
      console.warn(`[Anim] У ${charId} нет анимации для действия "${action}"`);
      return null;
    }
    return animId;
  }

  function play(charId, action, { restart = false } = {}) {
    const cur = tracks.get(charId);
    if (cur && cur.action === action && !restart && !cur.done) return;
    const animId = resolve(charId, action);
    if (!animId) return;
    tracks.set(charId, { action, animId, t: 0, done: false });
    AB.Bus.emit('anim:start', { charId, action, animId });
  }

  function update(dt) {
    for (const [charId, tr] of tracks) {
      tr.t += dt;
      const def = AB.ID.get(tr.animId);
      if (!def.loop && def.duration && tr.t >= def.duration && !tr.done) {
        tr.done = true;
        AB.Bus.emit('anim:end', { charId, action: tr.action, animId: tr.animId });
      }
    }
  }

  function current(charId) {
    return tracks.get(charId) || null;
  }

  // Доля проигрыша одноразовой анимации (0..1)
  function progress(charId) {
    const tr = tracks.get(charId);
    if (!tr) return 0;
    const def = AB.ID.get(tr.animId);
    return def.duration ? AB.util.clamp(tr.t / def.duration, 0, 1) : 0;
  }

  return { play, update, current, progress };
})();
