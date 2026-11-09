// =====================================================================
// ISO STORY (дополнение №49). Сюжетные события в изометрии: те же данные
// (js/data/events.js), те же шаги и порядок; здесь — как шаги выглядят на
// карте. Позиции из вида сбоку (x в помещении) переводятся в клетки: у
// оборудования — к нему, иначе — вдоль помещения. Перенесено начало акта I:
// пробуждение, голос за дверью, встреча с Мирой, фигура в темноте склада,
// силуэт на пульте. Остальные события подключаются вместе со своими секторами.
// Отдаёт тот же интерфейс AB.Story, что и основная игра (isDone для доступа к дверям).
// =====================================================================

AB.IsoStory = (() => {
  // весь акт I (№49–50); порядок и шаги — из events.js
  const SUPPORTED = ['EVENT-001', 'EVENT-014', 'EVENT-003', 'EVENT-004', 'EVENT-002', 'EVENT-005', 'EVENT-006', 'EVENT-007', 'EVENT-008', 'EVENT-009', 'EVENT-011', 'EVENT-012', 'EVENT-010'];
  const done = new Set();
  const queue = [];
  let running = null;                 // { def, t, next, wait, skip }
  let locked = false;
  let off = false;                    // тестовая сцена (?scene=test): сюжет выключен
  const fx = { fade: 0, fadeFrom: 0, fadeTo: 0, fadeT: 0, fadeDur: 0, alarm: false, flicker: 0, shake: 0, shakePower: 0, ghost: 0, props: {},
    trueForm: null, window: 0, leviathan: -1, actEnd: 0 };
  const P = () => AB.IsoParty;
  const T = 50;

  // место из вида сбоку → клетка: у оборудования с тем же x — перед ним, иначе вдоль помещения
  function posOf(room, x) {
    const rp = ((AB.ID.get(room) || {}).props || []).find((p) => p.equip && p.x === x);
    const lp = rp && AB.IsoWorld.props().find((p) => p.equip === rp.equip);
    if (lp) { const n = AB.IsoWorld.nearestFree(lp.x + lp.w / 2, lp.y + lp.h + 0.6, 3); if (n) return { x: n.x + 0.5, y: n.y + 0.5 }; }
    return AB.IsoInteract.alongRoom(room, x);
  }
  // где появляется персонаж сцены: у того же места, но не вплотную к Марку — чтобы было видно, как он подходит
  function spawnPos(room, x) {
    const base = posOf(room, x), l = P().lead();
    if (!l || Math.hypot(base.x - l.x, base.y - l.y) >= 2.4) return base;
    let best = null, bd = 1e9;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const px = Math.floor(base.x) + dx + 0.5, py = Math.floor(base.y) + dy + 0.5, dl = Math.hypot(px - l.x, py - l.y);
      if (dl < 2.6 || dl > 4.5 || !AB.IsoWorld.free(px, py) || AB.IsoWorld.room(px, py) !== room) continue;
      const d = Math.hypot(px - base.x, py - base.y);
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    return best || base;
  }
  const who = (id) => P().find(id) || (AB.IsoEnemies.get(id) && AB.IsoEnemies.get(id));
  function faceTo(a, b) {
    if (!a || !b) return;
    a.hx = b.x - a.x; a.hy = b.y - a.y;
    const sx = a.hx - a.hy; if (Math.abs(sx) > 0.05) a.facing = sx > 0 ? 1 : -1;
  }
  const HINTS = { move: 'Нажмите на пол, чтобы идти (WASD — тоже)', protect: 'Защитите Миру! Уведите её в командный центр', boss: 'Колосс! Броня держит удары — плазма бьёт в полную силу' };

  const ACTIONS = {
    lock_input: () => { locked = true; P().stop(); },
    unlock_input: () => { locked = false; },
    fade: (s) => Object.assign(fx, { fadeFrom: s.from, fadeTo: s.to, fadeT: 0, fadeDur: s.duration || 0, fade: s.from }),
    alarm: (s) => { fx.alarm = s.on; },
    place: (s) => {
      const m = P().find(s.char), pod = AB.IsoWorld.props().find((p) => p.main);
      if (m && pod) { m.x = pod.x + pod.w / 2; m.y = pod.y + pod.h + 0.6; m.hidden = true; m.hx = 1; m.hy = 1; }
      fx.props[s.inProp] = 'closed';
    },
    prop_state: (s) => { fx.props[s.prop] = s.state; },
    play_anim: (s) => { const m = P().find(s.char); if (m) m.hidden = false; AB.Anim.play(s.char, s.anim, { restart: true }); if (running.skip) { const tr = AB.Anim.current(s.char); if (tr) { tr.t = 99; tr.done = true; } } },
    hint: (s) => AB.Bus.emit('iso:toast', { text: HINTS[s.text] || s.text, kind: 'info' }),
    shake: (s) => { fx.shake = s.duration; fx.shakePower = s.power; },
    dialog: (s) => {
      if (running.skip) return;
      AB.Dialog.open(s.id);
      running.wait = () => !AB.Dialog.isOpen();
    },
    spawn: (s) => {
      const p = spawnPos(s.room, s.x);
      const m = P().addNpc(s.char, p.x, p.y);
      m.facing = s.facing || 1;
      const c = AB.Chars.spawn(s.char, { room: s.room, x: s.x, facing: s.facing || 1 });
      if (c) { c.room = s.room; c.controllable = false; }
    },
    give_item: (s) => { AB.Inventory.add(s.char, s.item, s.qty || 1, { swap: false }); if (!s.silent) AB.Bus.emit('item:given', { charId: s.char, itemId: s.item }); },
    walk_to: (s) => {
      const m = P().find(s.char);
      if (!m) return;
      let tx = m.x, ty = m.y;
      if (s.near) {
        const o = who(s.near), gap = (s.gap || 100) / T, dx = m.x - o.x, dy = m.y - o.y, n = Math.hypot(dx, dy) || 1;
        tx = o.x + (dx / n) * gap; ty = o.y + (dy / n) * gap;
      }
      if (running.skip) { m.x = tx; m.y = ty; return; }
      P().walkTo(s.char, tx, ty, (s.speed || 100) / T);
    },
    wait_arrive: (s) => { running.wait = () => { const m = P().find(s.char); return !m || !m.path; }; },
    face: (s) => faceTo(who(s.char), who(s.target)),
    follow: (s) => { P().join(s.char); const c = AB.Chars.get(s.char); if (c) { c.follow = s.leader; } },
    flicker: (s) => { fx.flicker = s.duration; },
    console_ghost: (s) => { fx.ghost = s.duration; fx.flicker = Math.max(fx.flicker, s.duration); },
    spawn_enemy: (s) => {
      const hero = P().find('CHAR-001');
      const p = s.x === 'behind' && hero ? { x: hero.x - 6, y: hero.y } : posOf(s.room, s.x);
      // WATCH — только показаться; иначе — настоящее поведение (преследователь нападает)
      AB.IsoEnemies.spawn(s.enemy, p.x, p.y, { story: s.state === 'WATCH', scripted: true, state: s.state, facing: s.facing || 1 });
    },
    despawn_enemy: (s) => AB.IsoEnemies.despawn(s.enemy),
    flee: (s) => { const m = P().find(s.char); if (m) m.flee = !!s.on; },
    // Мира стреляет в врача транквилизатором
    tranq: (s) => {
      const a = who(s.from), b = who(s.to);
      if (!a || !b) return;
      faceTo(a, b);
      AB.Bus.emit('iso:shot', { from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y }, landed: true, dart: true });
      if (!running.skip) { AB.Anim.play(s.from, 'attack', { restart: true }); setTimeout(() => AB.Anim.play(s.to, 'hurt', { restart: true }), 120); }
    },
    // персонаж падает без сознания (и встаёт)
    down: (s) => {
      const m = who(s.char), c = AB.Chars.get(s.char);
      if (c) c.down = !!s.on;
      if (m) { m.down = !!s.on; m.path = null; }
      AB.Anim.play(s.char, s.on ? 'death' : 'hurt', { restart: true });
      if (s.on && running.skip) { const tr = AB.Anim.current(s.char); if (tr) { tr.t = 99; tr.done = true; } }
    },
    // вспышка истинного облика: свет почти гаснет, существо — в помещении между ними
    true_form: (s) => {
      if (running.skip) return;
      const a = who(s.between[0]), b = who(s.between[1]);
      const x = a && b ? (a.x + b.x) / 2 : (a || b).x, y = a && b ? (a.y + b.y) / 2 + 1.2 : (a || b).y;
      fx.trueForm = { x, y, t: s.duration, dur: s.duration };
      fx.flicker = Math.max(fx.flicker, s.duration);
    },
    window: (s) => { fx.window = s.open ? 0.001 : 0; },
    leviathan: () => { fx.leviathan = 0; },
    enemy_state: (s) => { const e = AB.IsoEnemies.get(s.enemy); if (e) { e.state = s.state; e.t = 0; e.target = 'CHAR-001'; } },
    act_end: (s) => { fx.actEnd = 1; AB.Bus.emit('act:end', { act: s.act }); },
    leave: (s) => { const m = P().find(s.char); if (m) m.hidden = true; },
  };

  function trigger(kind) {
    for (const def of AB.EVENTS) {
      if (def.trigger !== kind || (def.once && done.has(def.id))) continue;
      if (off || !SUPPORTED.includes(def.id)) continue;
      if (def.needs === 'power' && !AB.World.hasPower()) continue;
      if (running) { if (running.def.id !== def.id && !queue.includes(def.id)) queue.push(def.id); }
      else start(def.id);
      return;
    }
  }
  function start(id) {
    running = { def: AB.ID.get(id), t: 0, next: 0 };
    AB.Bus.emit('event:start', id);
  }

  // события «дошёл до места»: zone:ROOM:x — x вида сбоку, пересчитанный вдоль помещения
  function zones() {
    const l = P().lead();
    if (!l) return;
    const room = AB.IsoWorld.room(l.x, l.y);
    for (const def of AB.EVENTS) {
      if (!def.trigger.startsWith('zone:') || done.has(def.id)) continue;
      const [, r, xs] = def.trigger.split(':');
      if (r === room && AB.IsoInteract.sideX(room, l.x, l.y) > Number(xs)) trigger(def.trigger);
    }
  }

  function update(dt) {
    zones();
    if (fx.trueForm) { fx.trueForm.t -= dt; if (fx.trueForm.t <= 0) fx.trueForm = null; }
    if (fx.window > 0 && fx.window < 1) fx.window = Math.min(1, fx.window + dt / 1.6);
    if (fx.leviathan >= 0) { fx.leviathan += dt; if (fx.leviathan > 9) fx.leviathan = -1; }
    fx.flicker = Math.max(0, fx.flicker - dt);
    fx.shake = Math.max(0, fx.shake - dt);
    fx.ghost = Math.max(0, fx.ghost - dt);
    if (fx.fadeDur > 0 && fx.fadeT < fx.fadeDur) { fx.fadeT += dt; fx.fade = AB.util.lerp(fx.fadeFrom, fx.fadeTo, AB.util.ease(AB.util.clamp(fx.fadeT / fx.fadeDur, 0, 1))); }
    else if (fx.fadeDur > 0) fx.fade = fx.fadeTo;
    else if (fx.fadeFrom === fx.fadeTo) fx.fade = fx.fadeTo;
    P().npcTick(dt);
    if (!running) return;
    if (running.wait) {
      if (!running.skip && !running.wait()) return;
      running.wait = null;
    }
    running.t += dt;
    const steps = running.def.steps;
    while (running && running.next < steps.length && steps[running.next].at <= running.t && !running.wait) {
      const s = steps[running.next++];
      (ACTIONS[s.action] || (() => console.warn(`[IsoStory] шаг ${s.action} пока не перенесён`)))(s);
    }
    if (running.wait) return;
    if (running.next >= steps.length) {
      const id = running.def.id;
      done.add(id);
      running = null;
      if (id === 'EVENT-001') fx.props['cryopod-main'] = 'open';
      if (id === 'EVENT-012') { fx.window = 0; fx.leviathan = -1; }   // камеры показали — окно закрывается
      AB.Bus.emit('event:end', id);
      while (queue.length) { const q = queue.shift(); if (!done.has(q)) { start(q); break; } }
    }
  }

  // пропустить сцену: всё до конца сразу, диалоги закрываются
  function skip() {
    if (!running) return;
    running.skip = true; running.t = 1e9;
    if (AB.Dialog.isOpen()) AB.Dialog.close();
    fx.fadeDur = 0.01; fx.fadeT = 1; fx.fadeTo = 0;
  }

  // триггеры — как в основной игре
  AB.Bus.on('room:enter', ({ roomId }) => {
    // усыплённая врач очнётся и уйдёт, пока героев нет рядом (ждёт Марка в медотсеке) — как в основной игре
    const doc = P().find('CHAR-003');
    if (doc && doc.down && AB.IsoWorld.room(doc.x, doc.y) !== roomId) { doc.hidden = true; doc.down = false; }
    AB.IsoEnemies.leaveRoom(roomId);
    trigger(`enter:${roomId}`);
  });
  AB.Bus.on('equip:changed', ({ id }) => trigger(`equip:${id}`));
  AB.Bus.on('world:power', ({ on }) => { if (on) trigger('power_on'); });
  AB.Bus.on('event:end', (id) => trigger(`after:${id}`));

  // тот же интерфейс, что у AB.Story основной игры (доступ к дверям, задания)
  AB.Story = { isDone: (id) => done.has(id), isRunning: () => !!running, fx, trigger, zone() {}, skip };

  return {
    trigger, update, skip, fx, locked: () => locked || !!(running && AB.Dialog.isOpen()),
    isRunning: () => !!running, isDone: (id) => done.has(id),
    markDone: (id) => done.add(id),
    disable() { off = true; },
  };
})();
