// =====================================================================
// ARENA SYSTEM (дополнение №41): боевая локация — несколько помещений и этажей
// без загрузок. Персонажи и противники по-прежнему живут «в помещении и на
// месте в нём» (room + x), поэтому остальные системы работают как раньше;
// здесь — то, что соединяет помещения:
//   • переход через открытую дверь между помещениями одного этажа;
//   • лестницы и люки между этажами (подъём/спуск без загрузки);
//   • двери: открыть, закрыть, укрепить, снять укрепление; прочность;
//   • приказы отряду: за мной, стоять здесь, охранять дверь;
//   • волны противников и таймер выживания; затем — выбор перка.
// =====================================================================

AB.Arena = (() => {
  const U = AB.util;
  let A = null;                 // идущая боевая локация
  const done = new Set();       // пройденные локации (сохраняется)
  let seq = 0;                  // номер экземпляра противника
  let pending = null;           // испытание началось, но не пройдено (после загрузки — заново)

  const active = () => !!A;
  const seg = (room) => A && A.segs.find((s) => s.room === room);
  const worldX = (c) => { const s = seg(c.room); return s ? s.x0 + c.x : c.x; };
  const floorOf = (room) => { const s = seg(room); return s ? s.floor : 0; };
  const passable = (d) => d.state === 'open' || d.state === 'broken';

  // ---------- Запуск и завершение ----------
  function start(id) {
    const def = AB.ID.get(id);
    if (!def || A || done.has(id)) return false;
    pending = id;
    AB.Save.save();             // точка сохранения перед боем: загрузка вернёт к началу испытания
    A = {
      id, def, t: 0, left: def.duration, kills: 0, over: false, nextSpawn: def.waves.first,
      segs: def.rooms.map((r) => ({ ...r, width: AB.ID.get(r.room).width })),
      doors: def.doors.map((d) => ({ ...d, hp: d.state === 'closed' ? d.hp : 0, maxHp: d.hp, queue: 0, hitT: 0, shake: 0 })),
      ladders: def.ladders,
      foes: new Set(),
    };
    for (const d of A.doors) if (d.state === 'closed') d.hp = d.maxHp;
    // противники, уже бывшие в этих помещениях, тоже подчиняются локации
    for (const s of A.segs) for (const e of AB.Enemies.inRoom(s.room)) {
      if (e.state !== 'DEAD' && !AB.ID.get(e.id).immortal) { e.arena = true; A.foes.add(e.id); AB.Enemies.setState(e.id, 'CHASE'); }
    }
    for (const m of AB.Party.members()) m.order = m.order || { type: 'follow' };
    AB.Bus.emit('arena:start', { id, name: def.name, duration: def.duration });
    return true;
  }

  function finish() {
    if (!A || A.over) return;
    A.over = true;
    // гнездо затихает: оставшиеся твари гибнут
    for (const id of A.foes) { const e = AB.Enemies.get(id); if (e && e.state !== 'DEAD') AB.Enemies.damage(id, 9999, e.x + 1); }
    for (const d of A.doors) d.queue = 0;
    done.add(A.id);
    pending = null;
    AB.Bus.emit('arena:won', { id: A.id, kills: A.kills });
  }

  // выход из локации — обычное исследование: группа собирается в помещении ведущего
  function exit() {
    if (!A) return;
    for (const id of A.foes) AB.Enemies.remove(id);
    for (const m of AB.Chars.all()) { m.waypoint = null; m.climb = null; m.work = null; if (m.order && m.order.type !== 'follow') m.order = { type: 'follow' }; }
    const lead = AB.Party.lead();
    const room = lead.room;
    A = null;
    AB.Rooms.enter(room, { x: lead.x });
    lead.controllable = true;
    AB.Save.save();
    AB.Bus.emit('arena:exit', {});
  }

  // ---------- Геометрия ----------
  const doorsIn = (room) => A.doors.filter((d) => d.room === room || (d.other && d.other.room === room));
  const doorX = (d, room) => (d.room === room ? d.x : d.other.x);
  // двери этой локации, если это дверь из rooms.js
  function doorFor(room, key) {
    if (!A) return null;
    return A.doors.find((d) => (d.room === room && d.roomDoor === key) || (d.other && d.other.room === room && d.other.roomDoor === key)) || null;
  }
  function ladderFor(room, key) {
    if (!A) return null;
    return A.ladders.find((l) => (l.top.room === room && l.top.roomDoor === key) || (l.bottom.room === room && l.bottom.roomDoor === key)) || null;
  }

  // докуда можно дойти в помещении (закрытая дверь — стена; открытая между помещениями — проход)
  function bounds(room) {
    const s = seg(room);
    let min = 40, max = s.width - 40;
    for (const d of doorsIn(room)) {
      const x = doorX(d, room), left = x < s.width / 2;
      const through = passable(d) && d.other;
      if (left) min = through ? -400 : Math.max(min, passable(d) ? x - 12 : x + 28);
      else max = through ? s.width + 400 : Math.min(max, passable(d) ? x + 12 : x - 28);
    }
    return { min, max };
  }

  // шагнул за открытую дверь — уже в соседнем помещении
  function crossSeams(c) {
    for (const d of doorsIn(c.room)) {
      if (!d.other || !passable(d)) continue;
      const here = d.room === c.room ? { x: d.x } : { x: d.other.x };
      const there = d.room === c.room ? d.other : { room: d.room, x: d.x };
      const left = here.x < seg(c.room).width / 2;
      if ((left && c.x < here.x - 2) || (!left && c.x > here.x + 2)) {
        c.x = there.x + (c.x - here.x);
        c.room = there.room;
        return true;
      }
    }
    return false;
  }

  // путь между помещениями: первый шаг из room к цели (дверь или лестница)
  function firstStep(from, to, forFoe) {
    if (from === to) return null;
    const prev = new Map([[from, null]]);
    const q = [from];
    const edges = (room) => {
      const out = [];
      for (const d of doorsIn(room)) if (d.other && (forFoe || passable(d))) out.push({ kind: 'door', d, x: doorX(d, room), to: d.room === room ? d.other.room : d.room });
      for (const l of A.ladders) {
        if (l.top.room === room) out.push({ kind: 'ladder', l, x: l.top.x, to: l.bottom.room, exit: l.bottom });
        if (l.bottom.room === room) out.push({ kind: 'ladder', l, x: l.bottom.x, to: l.top.room, exit: l.top });
      }
      return out;
    };
    while (q.length) {
      const r = q.shift();
      if (r === to) break;
      for (const e of edges(r)) if (!prev.has(e.to)) { prev.set(e.to, { from: r, e }); q.push(e.to); }
    }
    if (!prev.has(to)) return null;
    let cur = to, step = null;
    while (prev.get(cur)) { step = prev.get(cur).e; cur = prev.get(cur).from; }
    return step;
  }

  // подъём/спуск по лестнице без загрузки
  function climb(c, step) {
    if (c.climb) return;
    c.climb = { t: 0, to: step.exit };
    c.goal = null; c.vx = 0;
    if (AB.Chars.get(c.id)) AB.Chars.playAction(c.id, 'interact');
  }
  function ladderStep(room, l) {
    return l.top.room === room ? { kind: 'ladder', l, x: l.top.x, exit: l.bottom } : { kind: 'ladder', l, x: l.bottom.x, exit: l.top };
  }

  // ---------- Двери ----------
  const DOOR_TIME = { close: 0.7, open: 0.6, fortify: 3.0, unfortify: 1.4 };
  function doorTime(action) { return DOOR_TIME[action] * (action === 'fortify' || action === 'close' ? AB.Perks.mod('doorTime') : 1); }
  // что можно сделать с дверью: основное (E) и дополнительное (R) действие
  function doorActions(d) {
    if (d.state === 'broken') return { main: null, alt: null, label: 'Дверь выбита' };
    if (d.state === 'open') return { main: 'close', alt: null };
    if (d.state === 'closed') return { main: 'open', alt: 'fortify' };
    return { main: 'unfortify', alt: null };
  }
  const ACTION_NAME = { close: 'Закрыть дверь', open: 'Открыть дверь', fortify: 'Укрепить дверь', unfortify: 'Снять укрепление' };
  function startDoorWork(c, d, action) {
    if (!action || c.work) return false;
    c.work = { door: d.key, action, t: 0, time: doorTime(action) };
    c.goal = null; c.vx = 0;
    if (AB.Party.isLeader(c.id)) c.controllable = false;
    AB.Chars.playAction(c.id, 'interact');
    return true;
  }
  function applyDoor(d, action) {
    if (action === 'close' && d.state === 'open') { d.state = 'closed'; d.hp = d.maxHp; }
    else if (action === 'open' && d.state === 'closed') { d.state = 'open'; }
    else if (action === 'fortify' && d.state === 'closed') { d.state = 'fortified'; d.hp = d.fortHp; }
    else if (action === 'unfortify' && d.state === 'fortified') { d.state = 'closed'; d.hp = Math.min(d.hp, d.maxHp); }
    AB.Bus.emit('arena:door', { key: d.key, state: d.state, name: d.name });
  }
  function hitDoor(d, dmg) {
    if (passable(d)) return;
    d.hp -= dmg; d.shake = 0.3;
    if (d.hp <= 0) { d.hp = 0; d.state = 'broken'; AB.Bus.emit('arena:door', { key: d.key, state: 'broken', name: d.name }); }
  }

  // ---------- Приказы отряду ----------
  function order(charId, o) {
    const c = AB.Chars.get(charId);
    if (!c || AB.Party.isLeader(charId)) return false;
    c.order = o.type === 'hold' ? { type: 'hold', room: c.room, x: c.x } : o;
    c.waypoint = null;
    if (o.type !== 'guard') c.work = null;
    AB.Bus.emit('arena:order', { id: charId, order: c.order });
    return true;
  }

  // ---------- Противники ----------
  const FOE_FIGHT = ['CHASE', 'ATTACK'];
  function spawnFoe(room, x) {
    const id = `${A.def.enemy}~${++seq}`;
    AB.Enemies.spawnInstance(id, room, x, { arena: true });
    A.foes.add(id);
    AB.Bus.emit('arena:spawn', { id, room, x });
  }
  function aliveFoes() { return [...A.foes].map((id) => AB.Enemies.get(id)).filter((e) => e && e.state !== 'DEAD'); }

  function spawnTick(dt) {
    if (A.over) return;
    A.nextSpawn -= dt;
    // за закрытой дверью ждут и ломятся; дверь сломана или открыта — входят
    for (const d of A.doors) {
      if (!d.queue) continue;
      if (passable(d)) {
        d.hitT -= dt;
        if (d.hitT <= 0) { d.queue--; d.hitT = 0.7; spawnFoe(d.room, d.x + (d.x < seg(d.room).width / 2 ? 30 : -30)); }
      } else {
        d.hitT -= dt;
        if (d.hitT <= 0) { d.hitT = 1.2; hitDoor(d, AB.ID.get(A.def.enemy).damage * Math.min(3, d.queue) * 0.6); }
      }
    }
    if (A.nextSpawn > 0) return;
    const p = U.clamp(A.t / A.def.duration, 0, 1), w = A.def.waves;
    A.nextSpawn = U.lerp(w.interval[0], w.interval[1], p);
    const batch = Math.round(U.lerp(w.batch[0], w.batch[1], p));
    const queued = A.doors.reduce((a, d) => a + d.queue, 0);
    for (let i = 0; i < batch && aliveFoes().length + queued < w.maxAlive; i++) {
      const sp = A.def.spawns[Math.floor(Math.random() * A.def.spawns.length)];
      if (sp.door) { const d = A.doors.find((q) => q.key === sp.door); d.queue++; if (d.hitT <= 0) d.hitT = 0.5; }
      else spawnFoe(sp.room, sp.x + (Math.random() - 0.5) * 40);
    }
  }

  // цель — ближайший живой из отряда (по пути через помещения)
  function foeTarget(e) {
    let best = null, bd = 1e9;
    for (const m of AB.Party.members()) {
      if (m.dead || m.down || m.climb) continue;
      const d = Math.abs(worldX(m) - worldX(e)) + Math.abs(floorOf(m.room) - floorOf(e.room)) * 900;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  function foeTick(e, dt) {
    const def = AB.ID.get(e.id);
    if (e.state === 'DEAD') { e.deadT = (e.deadT || 0) + dt; if (e.deadT > 6 && e.id.includes('~')) { AB.Enemies.remove(e.id); A.foes.delete(e.id); } return; }
    e.t += dt; e.cooldown = Math.max(0, e.cooldown - dt); e.flash = Math.max(0, e.flash - dt * 4);
    if (e.stagger > 0) { e.stagger -= dt; e.x += e.knock * dt; e.knock *= 0.85; clampFoe(e); return; }
    if (e.climb) { e.climb.t += dt; if (e.climb.t > 0.8) { e.room = e.climb.to.room; e.x = e.climb.to.x; e.climb = null; } return; }
    const tg = foeTarget(e);
    if (!tg) return;
    if (!FOE_FIGHT.includes(e.state)) AB.Enemies.setState(e.id, 'CHASE');
    const move = (dir, speed) => { e.vx = dir * speed; e.x += e.vx * dt; if (dir) e.facing = dir; e.stride += Math.abs(e.vx) * dt; clampFoe(e); };
    if (e.state === 'ATTACK') {
      if (!e.hitDone && e.t >= def.attack.windup) {
        e.hitDone = true;
        if (e.doorTarget) { const d = A.doors.find((q) => q.key === e.doorTarget); if (d) hitDoor(d, def.damage); }
        else if (tg.room === e.room && Math.abs(tg.x - e.x) < def.attack.range + 16) AB.Combat.damageChar(tg.id, def.damage * AB.Perks.mod('damageTaken'), e.x);
      }
      if (e.t > 1.0) { e.cooldown = def.attack.cooldown; e.doorTarget = null; AB.Enemies.setState(e.id, 'CHASE'); }
      return;
    }
    let goalX, door = null;
    if (tg.room === e.room) goalX = tg.x;
    else {
      const st = firstStep(e.room, tg.room, true);
      if (!st) return;
      if (st.kind === 'ladder') {
        if (Math.abs(st.x - e.x) < 14) { e.climb = { t: 0, to: st.exit }; return; }
        goalX = st.x;
      } else {
        door = st.d;
        const left = st.x < seg(e.room).width / 2;
        goalX = passable(door) ? st.x + (left ? -60 : 60) : st.x + (left ? 30 : -30);
      }
    }
    const dx = goalX - e.x;
    // закрытая дверь на пути — ломать
    if (door && !passable(door) && Math.abs(dx) < 10) {
      if (e.cooldown <= 0) { e.facing = Math.sign(doorX(door, e.room) - e.x) || e.facing; e.doorTarget = door.key; AB.Enemies.setState(e.id, 'ATTACK'); }
      return;
    }
    if (!door && tg.room === e.room && Math.abs(dx) < def.attack.range && e.cooldown <= 0) {
      e.facing = Math.sign(dx) || e.facing; e.doorTarget = null; AB.Enemies.setState(e.id, 'ATTACK'); return;
    }
    move(Math.sign(dx), Math.abs(dx) < 8 ? 0 : def.speed.chase);
    if (crossSeams(e)) { /* перешёл в соседнее помещение */ }
  }
  function clampFoe(e) {
    const b = bounds(e.room);
    e.x = U.clamp(e.x, Math.max(-400, b.min), Math.min(seg(e.room).width + 400, b.max));
  }

  // ---------- Отряд ----------
  function memberTick(c, dt) {
    if (c.climb) {
      c.climb.t += dt;
      if (c.climb.t > 0.6) { c.room = c.climb.to.room; c.x = c.climb.to.x + 40; c.climb = null; c.goal = null; if (AB.Party.isLeader(c.id)) c.controllable = true; }
      return;
    }
    if (c.work) {
      c.work.t += dt;
      if (c.work.t >= c.work.time) {
        const d = A.doors.find((q) => q.key === c.work.door);
        if (d) applyDoor(d, c.work.action);
        c.work = null;
        if (AB.Party.isLeader(c.id)) c.controllable = true;
      }
      return;
    }
    if (AB.Party.isLeader(c.id)) { c.waypoint = null; return; }
    const lead = AB.Party.lead(), o = c.order || { type: 'follow' };
    let room = lead.room, x = null;
    if (o.type === 'hold') { room = o.room; x = o.x; }
    if (o.type === 'guard') {
      const d = A.doors.find((q) => q.key === o.door);
      if (!d) { c.order = { type: 'follow' }; return; }
      // встать у двери с той стороны, где персонаж сейчас (или со стороны помещения двери)
      const side = d.other && c.room === d.other.room ? d.other.room : d.room;
      const dx = doorX(d, side), left = dx < seg(side).width / 2;
      room = side; x = dx + (left ? 46 : -46);
      if (c.room === side && Math.abs(c.x - x) < 14) {
        c.waypoint = null; c.engage = null;
        c.facing = left ? -1 : 1;
        // task — разовое поручение (закрыть, открыть, снять укрепление), потом снова за ведущим;
        // без task — охрана: закрыть, укрепить и остаться у двери
        const T = o.task;
        const want = !T ? (d.state === 'open' ? 'close' : d.state === 'closed' ? 'fortify' : null)
          : T === 'close' ? (d.state === 'open' ? 'close' : null)
          : T === 'open' ? (d.state === 'fortified' ? 'unfortify' : d.state === 'closed' ? 'open' : null)
          : T === 'unfortify' ? (d.state === 'fortified' ? 'unfortify' : null) : null;
        if (want) startDoorWork(c, d, want);
        else if (T) c.order = { type: 'follow' };
        return;
      }
    }
    if (c.room !== room) {
      const st = firstStep(c.room, room, false);
      if (!st) { c.waypoint = null; return; }
      if (st.kind === 'ladder') {
        if (Math.abs(c.x - st.x) < 14) { climb(c, st); return; }
        c.waypoint = st.x;
      } else c.waypoint = st.x + (st.x < seg(c.room).width / 2 ? -60 : 60);
      return;
    }
    c.waypoint = x;  // null — обычное следование за ведущим в том же помещении
  }

  // ---------- Кадр ----------
  function update(dt) {
    if (!A) return;
    if (!A.over) {
      A.t += dt; A.left = Math.max(0, A.def.duration - A.t);
      if (A.left <= 0) finish();
    }
    spawnTick(dt);
    for (const d of A.doors) d.shake = Math.max(0, d.shake - dt);
    for (const id of [...A.foes]) { const e = AB.Enemies.get(id); if (e) foeTick(e, dt); else A.foes.delete(id); }
    for (const m of AB.Party.members()) memberTick(m, dt);
    // ведущий сменил помещение — «текущее помещение» следует за ним (без сюжетных событий)
    const lead = AB.Party.lead();
    if (lead && lead.room !== AB.Rooms.current()) { AB.Rooms.setCurrent(lead.room); AB.Bus.emit('arena:room', { roomId: lead.room }); }
  }

  // после движения персонажей: переходы через открытые двери
  function afterMove() {
    if (!A) return;
    for (const m of AB.Party.members()) crossSeams(m);
  }

  // враги на линии выстрела: тот же этаж, без закрытых дверей между; x — в координатах помещения стрелка
  function foesFor(c) {
    if (!A) return AB.Enemies.inRoom(c.room);
    const f = floorOf(c.room), cw = worldX(c);
    const out = [];
    for (const e of aliveFoes()) {
      if (floorOf(e.room) !== f || e.climb) continue;
      const ew = worldX(e);
      const blocked = A.doors.some((d) => !passable(d) && d.other && floorOf(d.room) === f &&
        (seg(d.room).x0 + d.x - cw) * (seg(d.room).x0 + d.x - ew) < 0);
      if (!blocked) out.push({ id: e.id, x: c.x + (ew - cw), state: e.state, ref: e });
    }
    return out;
  }

  AB.Bus.on('enemy:dead', ({ id }) => { if (A && A.foes.has(id)) A.kills++; });
  AB.Bus.on('item:pickup', ({ itemId, added }) => {
    for (const def of AB.ARENAS) {
      if (done.has(def.id) || A || !added || def.start.pickup !== itemId || AB.Rooms.current() !== def.start.room) continue;
      setTimeout(() => start(def.id), 900);
    }
  });

  return {
    active, start, finish, exit, update, afterMove, bounds, foesFor, order, climb, ladderStep,
    doorFor, ladderFor, doorActions, startDoorWork, ACTION_NAME, passable,
    get: () => A, segments: () => (A ? A.segs : []), worldX, floorOf,
    doors: () => (A ? A.doors : []),
    isDone: (id) => done.has(id),
    serialize: () => ({ done: [...done], pending }),
    restore(d) { (d && d.done || []).forEach((id) => done.add(id)); pending = d && d.pending && !done.has(d.pending) ? d.pending : null; },
    pending: () => pending,
  };
})();
