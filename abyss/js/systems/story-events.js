// =====================================================================
// STORY EVENT MANAGER (GDD §13.10). Проигрывает сюжетные события по шагам.
// Выполняет только события из реестра EVENT-*; новые не придумывает.
// =====================================================================

AB.Story = (() => {
  const done = new Set();
  let running = null; // { def, t, next }
  const fx = { fade: 0, fadeFrom: 0, fadeTo: 0, fadeT: 0, fadeDur: 0, alarm: false };

  const ACTIONS = {
    lock_input: () => AB.Input.lock(),
    unlock_input: () => {
      AB.Input.unlock();
      const hero = AB.Chars.get('CHAR-001');
      if (hero) hero.controllable = true;
    },
    fade: (s) => Object.assign(fx, { fadeFrom: s.from, fadeTo: s.to, fadeT: 0, fadeDur: s.duration || 0, fade: s.from }),
    alarm: (s) => { fx.alarm = s.on; },
    place: (s) => {
      const hero = AB.Chars.get(s.char);
      const r = AB.Rooms.room();
      const prop = r.props.find((p) => p.main);
      if (hero && prop) { hero.x = prop.x; hero.inPod = true; hero.controllable = false; }
    },
    prop_state: (s) => AB.Rooms.setPropState(`${AB.Rooms.current()}:${s.prop}`, s.state),
    play_anim: (s) => {
      const hero = AB.Chars.get(s.char);
      AB.Chars.playAction(s.char, s.anim);
      if (hero) hero.inPod = false;
    },
    hint: (s) => AB.Bus.emit('ui:hint', s.text),
  };

  function trigger(kind) {
    for (const def of AB.EVENTS) {
      if (def.trigger === kind && !(def.once && done.has(def.id))) start(def.id);
    }
  }

  function start(eventId) {
    const def = AB.ID.get(eventId);
    if (!def) return;
    running = { def, t: 0, next: 0 };
    AB.Bus.emit('event:start', eventId);
  }

  function update(dt) {
    if (fx.fadeDur > 0 && fx.fadeT < fx.fadeDur) {
      fx.fadeT += dt;
      fx.fade = AB.util.lerp(fx.fadeFrom, fx.fadeTo, AB.util.ease(AB.util.clamp(fx.fadeT / fx.fadeDur, 0, 1)));
    } else if (fx.fadeDur > 0) fx.fade = fx.fadeTo;

    if (!running) return;
    running.t += dt;
    const steps = running.def.steps;
    while (running.next < steps.length && steps[running.next].at <= running.t) {
      const s = steps[running.next++];
      (ACTIONS[s.action] || (() => console.warn(`[Story] Неизвестный шаг ${s.action}`)))(s);
    }
    if (running.next >= steps.length) {
      done.add(running.def.id);
      AB.Bus.emit('event:end', running.def.id);
      running = null;
    }
  }

  // Пропуск сцены: мгновенно выполнить оставшиеся шаги
  function skip() {
    if (!running) return;
    running.t = 1e9;
    fx.fadeDur = 0.01; fx.fadeT = 1; fx.fadeTo = 0;
    AB.Rooms.setPropState(`${AB.Rooms.current()}:cryopod-main`, 'open');
  }

  return {
    trigger, update, skip, fx,
    isRunning: () => !!running,
    isDone: (id) => done.has(id),
    serialize: () => ({ done: [...done], alarm: fx.alarm }),
    restore(d) {
      if (!d) return;
      (d.done || []).forEach((id) => done.add(id));
      fx.alarm = !!d.alarm;
    },
  };
})();
