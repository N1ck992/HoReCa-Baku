// =====================================================================
// STORY EVENT MANAGER (GDD §13.10). Проигрывает сюжетные события по шагам.
// Выполняет только события из реестра EVENT-*; новые не придумывает.
// =====================================================================

AB.Story = (() => {
  const done = new Set();
  let running = null; // { def, t, next, wait, skip }
  const fx = { fade: 0, fadeFrom: 0, fadeTo: 0, fadeT: 0, fadeDur: 0, alarm: false, ghost: 0, flicker: 0 };

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
    // силуэт на экране пульта (EVENT-002)
    console_ghost: (s) => { fx.ghost = s.duration; },
    // появиться в помещении
    spawn: (s) => {
      const c = AB.Chars.spawn(s.char, { room: s.room, x: s.x, facing: s.facing || 1 });
      if (c) { c.room = s.room; c.x = s.x; c.facing = s.facing || 1; c.controllable = false; }
    },
    // идти к точке или к другому персонажу (с зазором)
    walk_to: (s) => {
      const c = AB.Chars.get(s.char);
      if (!c) return;
      let x = s.x;
      if (s.near) { const o = AB.Chars.get(s.near); x = o.x + (c.x > o.x ? s.gap : -s.gap); }
      if (running.skip) { c.x = x; return; }
      c.goal = { x, speed: s.speed || 100, follow: false };
    },
    // ждать, пока персонаж дойдёт
    wait_arrive: (s) => {
      running.wait = () => { const c = AB.Chars.get(s.char); return !c || !c.goal; };
    },
    face: (s) => {
      const c = AB.Chars.get(s.char), t = AB.Chars.get(s.target);
      if (c && t) c.facing = Math.sign(t.x - c.x) || c.facing;
    },
    // показать диалог и ждать его конца
    dialog: (s) => {
      if (running.skip) return;
      AB.Dialog.open(s.id);
      running.wait = () => !AB.Dialog.isOpen();
    },
    // лампы сбоят
    flicker: (s) => { fx.flicker = s.duration; },
    // противник по сценарию; x: 'behind' — позади Марка, откуда он пришёл
    spawn_enemy: (s) => {
      const hero = AB.Chars.get('CHAR-001');
      const x = s.x === 'behind' ? Math.max(80, hero.x - 620) : s.x;
      AB.Enemies.spawnAt(s.enemy, s.room, x, s.state, s.facing || 1);
    },
    despawn_enemy: (s) => AB.Enemies.despawn(s.enemy),
    flee: (s) => { const c = AB.Chars.get(s.char); if (c) c.flee = s.on; },
    follow: (s) => {
      const c = AB.Chars.get(s.char);
      if (c) { c.follow = s.leader; c.goal = null; }
    },
  };

  const queue = []; // события, которые ждут, пока закончится текущее

  function trigger(kind) {
    for (const def of AB.EVENTS) {
      if (def.trigger !== kind || (def.once && done.has(def.id))) continue;
      if (running) { if (running.def.id !== def.id && !queue.includes(def.id)) queue.push(def.id); }
      else start(def.id);
      return;
    }
  }

  function start(eventId) {
    const def = AB.ID.get(eventId);
    if (!def) return;
    running = { def, t: 0, next: 0 };
    AB.Bus.emit('event:start', eventId);
  }

  function update(dt) {
    fx.ghost = Math.max(0, fx.ghost - dt);
    fx.flicker = Math.max(0, fx.flicker - dt);
    if (fx.fadeDur > 0 && fx.fadeT < fx.fadeDur) {
      fx.fadeT += dt;
      fx.fade = AB.util.lerp(fx.fadeFrom, fx.fadeTo, AB.util.ease(AB.util.clamp(fx.fadeT / fx.fadeDur, 0, 1)));
    } else if (fx.fadeDur > 0) fx.fade = fx.fadeTo;

    if (!running) return;
    if (running.wait) {
      if (!running.skip && !running.wait()) return;   // ждём: персонаж идёт, идёт диалог
      running.wait = null;
    }
    running.t += dt;
    const steps = running.def.steps;
    while (running && running.next < steps.length && steps[running.next].at <= running.t && !running.wait) {
      const s = steps[running.next++];
      (ACTIONS[s.action] || (() => console.warn(`[Story] Неизвестный шаг ${s.action}`)))(s);
    }
    if (running.wait) return;
    if (running.next >= steps.length) {
      done.add(running.def.id);
      AB.Bus.emit('event:end', running.def.id);
      running = null;
      // следующее событие из очереди (одна сцена за раз)
      while (queue.length) {
        const id = queue.shift();
        if (!done.has(id)) { start(id); break; }
      }
    }
  }

  // Пропуск сцены: мгновенно выполнить оставшиеся шаги
  function skip() {
    if (!running) return;
    running.skip = true;
    running.t = 1e9;
    if (AB.Dialog.isOpen()) AB.Dialog.close();
    fx.fadeDur = 0.01; fx.fadeT = 1; fx.fadeTo = 0;
    if (running.def.id === 'EVENT-001') AB.Rooms.setPropState(`${AB.Rooms.current()}:cryopod-main`, 'open');
  }

  // Триггеры от других систем
  AB.Bus.on('world:power', ({ on }) => { if (on) trigger('power_on'); });
  AB.Bus.on('room:enter', ({ roomId }) => trigger(`enter:${roomId}`));

  // события «Марк дошёл до места»: trigger 'zone:ROOM-ID:X' — когда x героя больше X
  function zone(roomId, x) {
    for (const def of AB.EVENTS) {
      if (!def.trigger.startsWith('zone:') || done.has(def.id)) continue;
      const [, r, xs] = def.trigger.split(':');
      if (r === roomId && x > Number(xs)) trigger(def.trigger);
    }
  }

  return {
    trigger, update, skip, fx, zone,
    isRunning: () => !!running,
    current: () => (running ? { id: running.def.id, t: +running.t.toFixed(2), next: running.next, waiting: !!running.wait } : null),
    isDone: (id) => done.has(id),
    serialize: () => ({ done: [...done], alarm: fx.alarm }),
    restore(d) {
      if (!d) return;
      (d.done || []).forEach((id) => done.add(id));
      fx.alarm = !!d.alarm;
    },
  };
})();
