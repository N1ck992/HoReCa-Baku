// =====================================================================
// ROOM SYSTEM (GDD §13.3, §6). Текущее помещение, двери, переходы,
// условия доступа, состояние реквизита, открытые помещения (карта).
// =====================================================================

AB.Rooms = (() => {
  let current = null;
  const visited = new Set();
  const propState = new Map(); // 'ROOM-001:cryopod-main' -> 'closed' | 'opening' | 'open'
  const doorAnim = new Map();  // 'ROOM-001:east' -> 0..1 (открытость створки)
  let transition = null;       // { to, toDoor, t, phase }
  const taken = new Map();     // 'ROOM-001:scrap-pod' -> сколько уже подобрано
  const searched = new Set();  // 'ROOM-001:cabinet'
  let dropped = [];            // выброшенные предметы: { room, key, item, qty, x }
  let dropSeq = 0;

  // Предметы, которые сейчас лежат в помещении (с учётом подобранных)
  function worldItems(roomId) {
    const r = AB.ID.get(roomId);
    const out = [];
    for (const it of (r && r.items) || []) {
      const left = it.qty - (taken.get(`${roomId}:${it.key}`) || 0);
      if (left > 0) out.push({ ...it, qty: left });
    }
    for (const d of dropped) if (d.room === roomId && d.qty > 0) out.push({ ...d });
    return out;
  }

  function takeItem(roomId, key, n) {
    const d = dropped.find((x) => x.room === roomId && x.key === key);
    if (d) {
      d.qty -= n;
      dropped = dropped.filter((x) => x.qty > 0);
    } else {
      const k = `${roomId}:${key}`;
      taken.set(k, (taken.get(k) || 0) + n);
    }
  }

  function dropItem(roomId, item, qty, x) {
    const r = AB.ID.get(roomId);
    const cx = AB.util.clamp(x, 60, (r ? r.width : 1000) - 60);
    dropped.push({ room: roomId, key: `drop-${++dropSeq}`, item, qty, x: cx });
  }

  function room() {
    return current ? AB.ID.get(current) : null;
  }

  function enter(roomId, { doorKey = null, x = null } = {}) {
    const r = AB.ID.get(roomId);
    if (!r || r.stub) {
      console.warn(`[Rooms] Помещение ${roomId} ещё не построено`);
      return false;
    }
    current = roomId;
    visited.add(roomId);
    const hero = AB.Chars.get('CHAR-001');
    if (hero) {
      hero.room = roomId;
      if (x !== null) hero.x = x;
      else if (doorKey) {
        const d = r.doors.find((dd) => dd.key === doorKey);
        hero.x = d ? d.x + (d.x < r.width / 2 ? 90 : -90) : r.spawn.x;
        hero.facing = d && d.x < r.width / 2 ? 1 : -1;
      } else hero.x = r.spawn.x;
      hero.vx = 0;
    }
    AB.Bus.emit('room:enter', { roomId, first: visited.size === 1 });
    return true;
  }

  function bounds() {
    const r = room();
    return r ? { min: 40, max: r.width - 40 } : null;
  }

  // Ближайшая дверь, с которой можно взаимодействовать
  function nearDoor(x) {
    const r = room();
    if (!r) return null;
    return r.doors.find((d) => Math.abs(d.x - x) < 80) || null;
  }

  function canPass(door) {
    if (!door.to) return { ok: false, reason: door.access.reason || 'Проход закрыт' };
    if (door.access.type === 'locked') return { ok: false, reason: door.access.reason || 'Заблокировано' };
    const target = AB.ID.get(door.to);
    if (!target || target.stub) return { ok: false, reason: 'Помещение недоступно' };
    return { ok: true };
  }

  function useDoor(door) {
    const res = canPass(door);
    if (!res.ok) {
      AB.Bus.emit('door:denied', { roomId: current, door: door.key, reason: res.reason });
      return false;
    }
    const conn = room().connections.find((c) => c.door === door.key);
    transition = { to: door.to, toDoor: conn ? conn.toDoor : null, door: door.key, t: 0, phase: 'open' };
    AB.Bus.emit('door:open', { roomId: current, door: door.key });
    return true;
  }

  function update(dt) {
    // анимация створок: открываются только во время перехода
    for (const [k, v] of doorAnim) doorAnim.set(k, Math.max(0, v - dt * 1.5));
    if (!transition) return;
    transition.t += dt;
    const key = `${current}:${transition.door}`;
    if (transition.phase === 'open') {
      doorAnim.set(key, Math.min(1, transition.t / 0.6));
      if (transition.t >= 0.7) { transition.phase = 'fadeout'; transition.t = 0; }
    } else if (transition.phase === 'fadeout' && transition.t >= 0.45) {
      enter(transition.to, { doorKey: transition.toDoor });
      doorAnim.set(`${transition.to}:${transition.toDoor}`, 1);
      transition.phase = 'fadein';
      transition.t = 0;
    } else if (transition.phase === 'fadein' && transition.t >= 0.5) {
      transition = null;
      AB.Bus.emit('transition:end');
    }
  }

  // затемнение экрана во время перехода (0..1)
  function fade() {
    if (!transition) return 0;
    if (transition.phase === 'fadeout') return AB.util.clamp(transition.t / 0.45, 0, 1);
    if (transition.phase === 'fadein') return 1 - AB.util.clamp(transition.t / 0.5, 0, 1);
    return 0;
  }

  return {
    room, enter, bounds, nearDoor, canPass, useDoor, update, fade,
    worldItems, takeItem, dropItem,
    markSearched: (roomId, key) => searched.add(`${roomId}:${key}`),
    isSearched: (roomId, key) => searched.has(`${roomId}:${key}`),
    inTransition: () => !!transition,
    current: () => current,
    visited: () => [...visited],
    setPropState: (key, st) => propState.set(key, { state: st, t: 0 }),
    propState: (key) => propState.get(key) || null,
    tickProps(dt) { for (const v of propState.values()) v.t += dt; },
    doorOpen: (key) => doorAnim.get(key) || 0,
    serialize: () => ({
      current, visited: [...visited], props: [...propState].map(([k, v]) => [k, v.state]),
      taken: [...taken], searched: [...searched], dropped, dropSeq,
    }),
    restore(d) {
      if (!d) return;
      (d.visited || []).forEach((v) => visited.add(v));
      (d.props || []).forEach(([k, st]) => propState.set(k, { state: st, t: 99 }));
      (d.taken || []).forEach(([k, n]) => taken.set(k, n));
      (d.searched || []).forEach((k) => searched.add(k));
      dropped = d.dropped || [];
      dropSeq = d.dropSeq || 0;
    },
  };
})();
