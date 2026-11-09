// =====================================================================
// ISO INTERACT (этап 2 изометрии, дополнение №46). Взаимодействие в
// изометрической сцене: двери сектора, выходы в другие секторы, предметы
// на полу, оборудование. Как в Diablo: нажать на объект — герой подходит и
// действует сам; E — с ближайшим объектом рядом. Правила — из старых систем:
//   • предметы: AB.Inventory.addShared + AB.Rooms.takeItem (общие рюкзаки отряда);
//   • оборудование: AB.Equip.action / apply (навык, нужная вещь, время работы);
//   • доступ к дверям: AB.Rooms.canPass (питание, событие, ключ).
// =====================================================================

AB.IsoInteract = (() => {
  const REACH = 1.35;                 // на каком расстоянии (клетки) можно действовать
  const W = () => AB.IsoWorld;
  let layout = null;
  const doors = new Map();            // ключ двери сектора → { key, def, tiles, state, anim }
  const dropPos = new Map();          // 'ROOM:key' брошенного предмета → клетка
  let intent = null;                  // к чему идёт ведущий, чтобы сделать действие
  let work = null;                    // идущая работа с оборудованием
  let hover = null;

  const saved = new Map();             // сектор → состояние его дверей (сектор покинули и вернулись)
  let sectorId = null;
  function init(lay, sid = 'SECTOR-001') {
    if (sectorId) saved.set(sectorId, new Map([...doors.values()].map((d) => [d.key, d.state])));
    layout = lay; sectorId = sid;
    doors.clear(); dropPos.clear(); intent = null; work = null; hover = null;
    const sector = AB.ID.get(sid), keep = saved.get(sid);
    for (const d of lay.doors || []) {
      // описание двери: в планировке (сектор только изометрии) или в sectors.js
      const def = d.room ? d : sector.doors.find((q) => q.key === d.key);
      const state = (keep && keep.get(d.key)) || def.state || 'open';
      const door = { key: d.key, def, tiles: d.tiles, axis: d.axis, state, anim: state === 'closed' ? 1 : 0 };
      doors.set(d.key, door);
      W().setDoor(d.tiles, door.state !== 'open' || locked(door));
    }
  }

  // ---------- Доступ к дверям (правила старой системы помещений) ----------
  const roomDoor = (room, key) => (AB.ID.get(room).doors || []).find((q) => q.key === key);
  function access(room, key) { const rd = roomDoor(room, key); return rd ? AB.Rooms.canPass(rd) : { ok: true }; }
  // у двери планировки может быть своё условие доступа (№55: двери актов II–III)
  function doorAccess(door) { return door.def.access ? AB.Rooms.canPass(door.def) : access(door.def.room, door.def.roomDoor); }
  function locked(door) { return !doorAccess(door).ok; }
  const doorCenter = (d) => { const n = d.tiles.length; return { x: d.tiles.reduce((a, t) => a + t[0], 0) / n + 0.5, y: d.tiles.reduce((a, t) => a + t[1], 0) / n + 0.5 }; };

  // ---------- Что есть вокруг ----------
  function rooms() { return [...new Set(layout.areas.map((a) => a.room))]; }
  function itemPos(room, it) {
    const k = `${room}:${it.key}`;
    if (layout.items && layout.items[k]) return layout.items[k];
    if (!it.key.startsWith('drop') && !dropPos.has(k)) dropPos.set(k, alongRoom(room, it.x));
    if (!dropPos.has(k)) {
      // брошенный предмет: рядом с ведущим, на свободной клетке
      const l = AB.IsoParty.lead(), used = new Set([...dropPos.values()].map((p) => `${Math.floor(p.x)},${Math.floor(p.y)}`));
      // ближайшая свободная клетка у ног (не та, где он стоит), чтобы сразу можно было поднять
      let best = null, bd = 1e9;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = Math.floor(l.x) + dx, y = Math.floor(l.y) + dy, d = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y);
        if (d < 0.6 || !W().walkable(x, y) || used.has(`${x},${y}`) || W().room(x + 0.5, y + 0.5) !== room) continue;
        if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
      }
      dropPos.set(k, best || { x: l.x, y: l.y });
    }
    return dropPos.get(k);
  }

  // место в помещении по x вида сбоку: вдоль самой большой части помещения
  function alongRoom(room, x) {
    const a = layout.areas.filter((q) => q.room === room).sort((p, q) => q.w * q.h - p.w * p.h)[0];
    const r = AB.ID.get(room), t = Math.max(0.05, Math.min(0.95, (x || 0) / (r.width || 1000)));
    const px = a.w >= a.h ? a.x + t * a.w : a.x + a.w / 2, py = a.w >= a.h ? a.y + a.h / 2 : a.y + t * a.h;
    const n = W().nearestFree(px, py, 4);
    return n ? { x: n.x + 0.5, y: n.y + 0.5 } : { x: px, y: py };
  }

  // обратно: клетка → x вида сбоку (для событий «дошёл до места»)
  function sideX(room, x, y) {
    const a = layout.areas.filter((q) => q.room === room).sort((p, q) => q.w * q.h - p.w * p.h)[0];
    if (!a) return 0;
    const t = a.w >= a.h ? (x - a.x) / a.w : (y - a.y) / a.h;
    return Math.max(0, Math.min(1, t)) * (AB.ID.get(room).width || 1000);
  }

  function targets() {
    const out = [];
    for (const room of rooms()) for (const it of AB.Rooms.worldItems(room)) {
      const p = itemPos(room, it);
      out.push({ kind: 'item', id: `item:${room}:${it.key}`, x: p.x, y: p.y, room, ref: it, name: AB.ID.get(it.item).name });
    }
    for (const p of W().props()) if (p.equip) {
      out.push({ kind: 'equip', id: `equip:${p.equip}`, x: p.x + p.w / 2, y: p.y + p.h / 2, rect: p, ref: AB.ID.get(p.equip), name: AB.ID.get(p.equip).name });
    }
    for (const p of W().props()) if (p.container) {
      const room = W().room(p.x + 0.5, p.y + 0.5), def = ((AB.ID.get(room) || {}).containers || []).find((c) => c.key === p.container);
      if (def) out.push({ kind: 'container', id: `box:${room}:${def.key}`, x: p.x + p.w / 2, y: p.y + p.h / 2, rect: p, room, ref: def, name: def.label });
    }
    for (const d of doors.values()) { const c = doorCenter(d); out.push({ kind: 'door', id: `door:${d.key}`, x: c.x, y: c.y, ref: d, name: d.def.name }); }
    for (const l of layout.links || []) for (const [end, other] of [[l.a, l.b], [l.b, l.a]]) {
      const rd = roomDoor(end.room, end.door);
      out.push({ kind: 'link', id: `link:${l.key}:${end.room}`, x: end.x + 0.5, y: end.y + 0.5, ref: { link: l, end, other, rd }, name: rd && rd.kind === 'ladder' ? 'Подняться по лестнице' : 'Спуститься в люк' });
    }
    for (const e of layout.exits || []) {
      const rd = roomDoor(e.room, e.door), to = rd && AB.ID.get(rd.to);
      out.push({ kind: 'exit', id: `exit:${e.room}:${e.door}`, x: e.x + 0.5, y: e.y + 0.5, ref: e, rd, name: `${rd && rd.kind === 'hatch' ? 'Люк' : rd && rd.kind === 'ladder' ? 'Лестница' : 'Дверь'}: ${e.toName || (to ? to.name : rd.to)}` });
    }
    return out;
  }

  // расстояние от персонажа до объекта (у оборудования — до его края)
  function distTo(m, t) {
    if (t.rect) {
      const r = t.rect, cx = Math.max(r.x, Math.min(m.x, r.x + r.w)), cy = Math.max(r.y, Math.min(m.y, r.y + r.h));
      return Math.hypot(m.x - cx, m.y - cy);
    }
    if (t.kind === 'door') return Math.min(...t.ref.tiles.map(([x, y]) => Math.hypot(m.x - x - 0.5, m.y - y - 0.5)));
    return Math.hypot(m.x - t.x, m.y - t.y);
  }
  function nearest() {
    const l = AB.IsoParty.lead();
    let best = null, bd = REACH;
    for (const t of targets()) { const d = distTo(l, t); if (d <= bd) { bd = d; best = t; } }
    return best;
  }

  // подпись подсказки для объекта
  function label(t) {
    const lid = AB.IsoParty.lead().id;
    if (t.kind === 'item') return { label: `Подобрать: ${t.name}${t.ref.qty > 1 ? ` ×${t.ref.qty}` : ''}`, ok: true };
    if (t.kind === 'equip') {
      const a = AB.Equip.action(t.ref.id, lid);
      return { label: a.ok ? a.label : `${t.name}: ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}`, ok: a.ok };
    }
    if (t.kind === 'door' && t.ref.state === 'jammed') {
      const st = AB.IsoNest.state(), cfg = AB.IsoNest.config();
      return { label: st ? `${cfg.verb || 'Чинить'} (этап ${st.stage + 1} из ${AB.ID.get('ARENA-001').goal.stages})` : 'Заклинило', ok: true };
    }
    // электронный замок (№55): открывает только наручный терминал; взлом будит гнездо
    if (t.kind === 'door' && t.ref.def.hack && !t.ref.hacked) {
      const has = hasItem(t.ref.def.hack);
      return { label: has ? `${t.ref.def.name}: взломать наручным терминалом` : `${t.ref.def.name}: нужен наручный терминал`, ok: has };
    }
    if (t.kind === 'door') {
      const d = t.ref;
      if (locked(d)) return { label: `${d.def.name}: ${doorAccess(d).reason.toLowerCase()}`, ok: false };
      return { label: d.state === 'open' ? 'Закрыть дверь' : 'Открыть дверь', ok: true };
    }
    if (t.kind === 'container') {
      const empty = AB.Rooms.isSearched(t.room, t.ref.key);
      return { label: empty ? `${t.name}: пусто` : `Обыскать: ${t.name}`, ok: !empty };
    }
    if (t.kind === 'link') {
      const a = t.ref.rd ? AB.Rooms.canPass(t.ref.rd) : { ok: true };
      return { label: a.ok ? t.name : `${t.name}: ${a.reason.charAt(0).toLowerCase()}${a.reason.slice(1)}`, ok: a.ok };
    }
    // внешний люк шлюза: после осмотра экзокостюма — выход за борт (№54)
    if (t.ref.to && t.ref.to.overworld) {
      if (!t.ref.to.after) return { label: `Вернуться на ${t.ref.toName || 'карту дна'}`, ok: true };
      const ready = AB.Equip.state(t.ref.to.after) === 'done';
      return { label: ready ? (AB.Flags.has('undocked') ? 'Внешний люк — к капсуле' : 'Внешний люк — выйти за борт в экзокостюме') : 'Внешний люк: только в экзокостюме', ok: ready };
    }
    const a = access(t.ref.room, t.ref.door);
    const dest = t.ref.to ? AB.IsoGame.sectorName(t.ref.to.sector) : null;
    return { label: !a.ok ? `${t.name}: ${a.reason.toLowerCase()}` : dest ? `${t.name} → ${dest}` : `${t.name} — сектор ещё не перенесён`, ok: a.ok };
  }
  function prompt() {
    const ns = AB.IsoNest && AB.IsoNest.state(), ld = AB.IsoParty.lead();
    if (ns && ld.repair) return { label: `${AB.IsoNest.config().stageWord || 'Починка'} — этап ${ns.stage + 1}…`, ok: true, progress: ns.prog };
    if (work && work.t.kind === 'container') return { label: `Обыск: ${work.t.name}…`, ok: true, progress: work.p / work.time };
    if (work) { return { label: `${AB.Equip.action(work.t.ref.id, AB.IsoParty.lead().id).label}…`, ok: true, progress: work.p / work.time }; }
    const t = nearest();
    return t ? { ...label(t), id: t.id } : null;
  }

  // ---------- Действия ----------
  function act(t) {
    const l = AB.IsoParty.lead();
    if (!t || distTo(l, t) > REACH + 0.05) return false;
    l.hx = t.x - l.x; l.hy = t.y - l.y;
    if (Math.abs(l.hx - l.hy) > 0.05) l.facing = l.hx - l.hy > 0 ? 1 : -1;
    AB.Anim.play(l.id, 'interact', { restart: true });
    if (t.kind === 'item') {
      const { taken, who } = AB.Inventory.addShared(l.id, t.ref.item, t.ref.qty);
      if (taken) AB.Rooms.takeItem(t.room, t.ref.key, taken);
      AB.Bus.emit('item:pickup', { charId: who, by: l.id, itemId: t.ref.item, added: taken, left: t.ref.qty - taken });
      return true;
    }
    if (t.kind === 'equip') {
      const a = AB.Equip.action(t.ref.id, l.id);
      if (!a.ok) { AB.Bus.emit('equip:blocked', { id: t.ref.id, text: a.label }); return true; }
      if (a.time) { AB.IsoParty.stop(); work = { t, p: 0, time: a.time, x: l.x, y: l.y }; return true; }
      AB.Equip.apply(t.ref.id, l.id);
      return true;
    }
    if (t.kind === 'door') return toggleDoor(t.ref);
    if (t.kind === 'container') {
      if (AB.Rooms.isSearched(t.room, t.ref.key)) { AB.Bus.emit('container:empty', { label: t.name }); return true; }
      AB.IsoParty.stop(); work = { t, p: 0, time: 1.2, x: l.x, y: l.y };
      return true;
    }
    if (t.kind === 'link') {
      const a = t.ref.rd ? AB.Rooms.canPass(t.ref.rd) : { ok: true };
      if (!a.ok) { AB.Bus.emit('door:denied', { reason: a.reason }); return true; }
      AB.IsoGame.travel(null, t.ref.other.x + 0.5, t.ref.other.y + 0.5);
      return true;
    }
    if (t.ref.to && t.ref.to.overworld) {
      if (!t.ref.to.after || AB.Equip.state(t.ref.to.after) === 'done') AB.IsoOverworld.enter();
      else AB.Bus.emit('door:denied', { reason: 'Внешний люк: только в экзокостюме' });
      return true;
    }
    // выход из сектора: правила доступа — старые; переход — в другой сектор
    const a = access(t.ref.room, t.ref.door);
    if (!a.ok) { AB.Bus.emit('door:denied', { reason: a.reason }); return true; }
    if (!t.ref.to) { AB.Bus.emit('door:denied', { reason: `${t.name}: этот сектор ещё не перенесён` }); return true; }
    AB.IsoGame.travel(t.ref.to.sector, t.ref.to.x, t.ref.to.y);
    return true;
  }

  // обыск: находки — в общий инвентарь; что не поместилось — на пол рядом
  function loot(t) {
    const found = [];
    let full = false;
    for (const [item, qty] of t.ref.loot || []) {
      const got = AB.Inventory.addShared(AB.IsoParty.lead().id, item, qty).taken;
      if (got) found.push([item, got]);
      if (got < qty) { full = true; AB.Rooms.dropItem(t.room, item, qty - got, 0); }
    }
    AB.Rooms.markSearched(t.room, t.ref.key);
    AB.Bus.emit('container:looted', { label: t.name, found, full });
  }

  function toggleDoor(d) {
    if (d.state === 'jammed') { if (!AB.IsoNest.repairLead()) AB.Bus.emit('door:denied', { reason: 'Подойдите к замку ближе' }); return true; }
    if (d.def.hack && !d.hacked) {
      if (!hasItem(d.def.hack)) { AB.Bus.emit('door:denied', { reason: 'Электронный замок. Нужен наручный терминал — он в оружейной, в шкафу с оружием' }); return true; }
      if (!AB.IsoNest.isDone() && !AB.IsoNest.state()) AB.IsoNest.start();
      if (!AB.IsoNest.repairLead()) AB.Bus.emit('door:denied', { reason: 'Подойдите к замку ближе' });
      return true;
    }
    if (locked(d)) { AB.Bus.emit('door:denied', { reason: doorAccess(d).reason }); return true; }
    if (d.state === 'open') {
      // ведущий в проёме — не закрыть; ведомые из проёма отходят на его сторону
      const inDoor = (m) => d.tiles.some(([x, y]) => Math.floor(m.x) === x && Math.floor(m.y) === y);
      const l = AB.IsoParty.lead();
      if (inDoor(l)) { AB.Bus.emit('door:denied', { reason: 'Вы стоите в проёме' }); return true; }
      for (const m of AB.IsoParty.members()) if (m !== l && inDoor(m)) {
        const c = doorCenter(d), sx = Math.sign(l.x - c.x), sy = Math.sign(l.y - c.y);
        const tx = d.axis === 'x' ? c.x + sx * 1.2 : m.x, ty = d.axis === 'x' ? m.y : c.y + sy * 1.2;
        const n = W().free(tx, ty) ? { x: tx, y: ty } : (() => { const q = W().nearestFree(tx, ty, 3); return q && { x: q.x + 0.5, y: q.y + 0.5 }; })();
        if (!n) { AB.Bus.emit('door:denied', { reason: 'В проёме кто-то стоит' }); return true; }
        m.x = n.x; m.y = n.y; m.path = null;
      }
      d.state = 'closed';
    } else d.state = 'open';
    W().setDoor(d.tiles, d.state !== 'open');
    AB.Bus.emit('iso:door', { key: d.key, state: d.state, name: d.def.name });
    return true;
  }

  // есть ли вещь у отряда: в руках у кого-то или в общих вещах
  function hasItem(id) {
    return AB.IsoStash.count(id) > 0 || AB.IsoParty.members().some((m) => { const w = AB.Inventory.weapon(m.id); return w && w.item === id; });
  }

  // ---------- Нажатие на объект: подойти и сделать ----------
  function at(cx, cy) {
    const S = AB.IsoRender.screenOf;
    let best = null, bd = 34;
    for (const t of targets()) {
      const p = S(t.x, t.y);
      const lift = t.kind === 'door' || t.kind === 'equip' || t.kind === 'container' || (t.kind === 'exit' && !t.ref.floor) ? 30 : 6;   // у высоких объектов — по их середине
      const d = Math.min(Math.hypot(p.x - cx, p.y - cy), Math.hypot(p.x - cx, p.y - lift - cy));
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  function click(cx, cy) {
    const t = at(cx, cy);
    if (!t) { intent = null; return false; }
    const l = AB.IsoParty.lead();
    if (distTo(l, t) <= REACH) { intent = null; AB.IsoParty.stop(); act(t); return true; }
    // подойти: к ближайшей свободной клетке рядом с объектом
    const spot = approach(t, l);
    if (!spot || !AB.IsoParty.goTo(spot.x, spot.y)) { AB.Bus.emit('door:denied', { reason: 'Туда не пройти' }); return true; }
    intent = t.id;
    return true;
  }
  function approach(t, l) {
    let best = null, bd = 1e9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = Math.floor(t.x) + dx + 0.5, y = Math.floor(t.y) + dy + 0.5;
      if (!W().free(x, y)) continue;
      const near = distTo({ x, y }, t);
      if (near > REACH - 0.15) continue;
      const d = near * 2 + Math.hypot(x - l.x, y - l.y) * 0.1;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  }

  function hoverAt(cx, cy) { hover = at(cx, cy); return hover; }

  // ---------- Кадр ----------
  function update(dt, input) {
    const l = AB.IsoParty.lead();
    // доступ мог измениться (дали питание, прошло событие): запертая дверь — непроходима
    for (const d of doors.values()) {
      if (d.state !== 'jammed') W().setDoor(d.tiles, d.state !== 'open' || locked(d));
      d.anim += ((d.state !== 'open' || locked(d) ? 1 : 0) - d.anim) * Math.min(1, dt * 10);
    }
    if (work) {
      // ведущий сошёл с места или пошёл — работа прервана
      if ((input && (input.x || input.y)) || l.path || Math.hypot(l.x - work.x, l.y - work.y) > 0.3) { work = null; }
      else {
        work.p += dt;
        if (work.p >= work.time) {
          const t = work.t; work = null;
          if (t.kind === 'container') loot(t); else AB.Equip.apply(t.ref.id, l.id);
        }
      }
    }
    if (input && (input.x || input.y)) intent = null;
    if (intent) {
      const t = targets().find((q) => q.id === intent);
      if (!t) intent = null;
      else if (distTo(l, t) <= REACH) { intent = null; AB.IsoParty.stop(); act(t); }
      else if (!l.path) intent = null;     // не дошёл (путь оборвался)
    }
  }

  return {
    REACH, init, update, targets, alongRoom, sideX, nearest, prompt, act, click, hoverAt, label,
    actNearest() { const t = nearest(); return t ? act(t) : false; },
    doors: () => [...doors.values()], locked, hasItem, hovered: () => hover, working: () => work, intent: () => intent,
  };
})();
