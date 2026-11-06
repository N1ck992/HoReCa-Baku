// =====================================================================
// BARK SYSTEM: короткие реплики над головой — мысли, замечания, обращения
// друг к другу. Тексты — js/data/barks/<персонаж>.js. Здесь — когда и кто говорит.
// Во время сюжетных сцен и диалогов молчат.
// =====================================================================

AB.Barks = (() => {
  const bubbles = new Map();     // кто говорит → { text, think, t, dur }
  const used = new Set();        // реплики once, уже сказанные
  const seenRooms = new Set();   // где уже звучали реплики «зашли впервые»
  const lastBy = new Map();      // кто → когда говорил последний раз
  const recent = [];             // последние тексты — не повторять подряд
  let clock = 0, lastAny = -99, idleAt = 20, pending = [];

  const quiet = () => AB.Story.isRunning() || AB.Dialog.isOpen() || AB.Rooms.inTransition();
  const fileOf = (id) => {
    if (AB.BARKS[id]) return AB.BARKS[id];
    const d = AB.ID.get(id);
    return d && d.type === 'mutant' ? AB.BARKS.mutant : null;
  };
  // говорящий рядом: персонаж в текущем помещении, не спит, не погиб
  function present(id) {
    const room = AB.Rooms.current();
    const c = AB.Chars.get(id);
    if (c) return c.room === room && !c.hidden && !c.dead && !c.down;
    const e = AB.Enemies.get(id);
    return !!e && e.room === room && e.state !== 'DEAD' && e.state !== 'DORMANT';
  }

  function pick(id, key) {
    const f = fileOf(id);
    const list = (f && f[key]) || [];
    const ok = list.filter((l) => !(l.once && used.has(l.text)) && !recent.includes(l.text) &&
      (!l.needs || present(l.needs)) && (!l.after || AB.Story.isDone(l.after)));
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  }

  function show(id, line) {
    const dur = Math.min(6, 2.2 + line.text.length * 0.045);
    bubbles.set(id, { text: line.text, think: !!line.think, t: 0, dur });
    lastBy.set(id, clock); lastAny = clock;
    if (line.once) used.add(line.text);
    recent.push(line.text); if (recent.length > 8) recent.shift();
    if (line.reply && present(line.reply.by)) pending.push({ at: clock + dur * 0.75, id: line.reply.by, line: line.reply });
    AB.Bus.emit('bark', { id, text: line.text, think: !!line.think });
  }

  // попробовать сказать: key — ключ реплики; force — не ждать паузы между репликами
  function say(id, key, { force = false } = {}) {
    if (!present(id) || quiet()) return false;
    if (!force && (clock - lastAny < 3 || clock - (lastBy.get(id) ?? -99) < 6)) return false;
    const line = pick(id, key);
    if (!line) return false;
    show(id, line);
    return true;
  }
  // первый из группы, у кого есть реплика на этот случай (ведущий — первым)
  function groupSay(key, opts) {
    for (const m of AB.Party.members()) if (say(m.id, key, opts)) return true;
    return false;
  }

  function update(dt) {
    clock += dt;
    for (const [id, b] of bubbles) { b.t += dt; if (b.t > b.dur || !present(id)) bubbles.delete(id); }
    if (quiet()) { bubbles.clear(); return; }
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (clock >= p.at) { pending.splice(i, 1); if (present(p.id)) show(p.id, p.line); }
    }
    // реплика «зашли впервые» — после сцены, если она была
    const room = AB.Rooms.current();
    if (room && !seenRooms.has(room) && clock - enteredAt > 1.1) {
      seenRooms.add(room);
      groupSay(`enter:${room}`, { force: true });
    }
    // долгая тишина: мысль или разговор; мутант бормочет, если рядом
    if (clock > idleAt && clock - lastAny > 14 && !AB.Enemies.inCombat()) {
      idleAt = clock + 16 + Math.random() * 16;
      const near = AB.Enemies.inRoom(room).find((e) => AB.ID.get(e.id).type === 'mutant' && e.state !== 'DEAD' && ['IDLE', 'PATROL'].includes(e.state));
      if (near && Math.random() < 0.35) say(near.id, 'idle');
      else {
        const members = AB.Party.members().slice().sort(() => Math.random() - 0.5);
        for (const m of members) if (say(m.id, `idle:${room}`) || say(m.id, 'idle')) break;
      }
    }
  }
  let enteredAt = 0;

  // ---------- Когда говорят ----------
  AB.Bus.on('room:enter', () => { enteredAt = clock; bubbles.clear(); pending = []; });
  AB.Bus.on('enemy:state', ({ id, state }) => {
    if (state !== 'ALERT') return;
    const d = AB.ID.get(id);
    if (d.type === 'mutant') say(id, 'alert', { force: true });
    if (!groupSay(`alert:${id}`, { force: true })) groupSay('alert');
  });
  AB.Bus.on('enemy:appear', ({ id }) => {
    if (AB.BARKS[id]) setTimeout(() => say(id, 'appear', { force: true }), 600);
    setTimeout(() => groupSay(`appear:${id}`, { force: true }), 1800);
  });
  AB.Bus.on('enemy:dead', () => setTimeout(() => groupSay('kill'), 700));
  let hurtAt = -99;
  AB.Bus.on('char:hp', ({ charId, delta }) => {
    const c = AB.Chars.get(charId);
    if (!c || delta >= 0 || clock - hurtAt < 25) return;
    if (c.hp / AB.ID.get(charId).stats.maxHp < 0.4 && say(charId, 'hurt', { force: true })) hurtAt = clock;
  });
  let healAt = -99;
  AB.Bus.on('aura:heal', ({ charId }) => { if (clock - healAt > 30 && say(charId, 'heal')) healAt = clock; });
  AB.Bus.on('party:leader', ({ id }) => setTimeout(() => say(id, 'lead', { force: true }), 300));
  AB.Bus.on('item:pickup', ({ charId, itemId, added }) => { if (added) setTimeout(() => say(charId, `pickup:${itemId}`, { force: true }), 500); });
  AB.Bus.on('log:found', ({ id }) => {
    // реакция после того, как окно чтения закроют
    const tryIt = () => (document.querySelector('#reader') && !document.querySelector('#reader').hidden ? setTimeout(tryIt, 400) : groupSay(`log:${id}`, { force: true }));
    setTimeout(tryIt, 600);
  });

  return {
    update, say,
    active: () => [...bubbles].map(([id, b]) => ({ id, ...b, a: Math.min(1, b.t * 5, (b.dur - b.t) * 3) })),
    serialize: () => ({ used: [...used], rooms: [...seenRooms] }),
    restore(d) { (d && d.used || []).forEach((t) => used.add(t)); (d && d.rooms || []).forEach((r) => seenRooms.add(r)); },
  };
})();
