// =====================================================================
// CHARACTER SYSTEM (GDD §13.1). Изменяемое состояние персонажей:
// позиция, направление, здоровье, текущий внешний вид, действие.
// Постоянные данные берутся из реестра по ID и не копируются.
// =====================================================================

AB.Chars = (() => {
  const live = new Map(); // charId -> runtime state

  function spawn(charId, { room, x, facing = 1 } = {}) {
    const def = AB.ID.get(charId);
    if (!def) return null;
    if (live.has(charId)) return live.get(charId); // один персонаж — один объект (GDD §2.3)
    const s = {
      id: charId,
      room,
      x,
      facing,
      vx: 0,
      hp: def.stats.maxHp,
      appearance: def.appearances[0],
      action: 'idle',
      stride: 0,        // пройденный путь — для фазы шага, чтобы ноги не скользили
      controllable: false,
      hidden: false,
      equipped: null,   // ITEM-* в руках (оружие)
      dead: false,
      goal: null,       // { x, speed } — идти к точке (сюжетные сцены)
      follow: null,     // ID персонажа, за которым идёт
      flee: false,      // убегать от угрозы к дальней двери
      engage: null,     // x, куда подойти для удара (ведомый в бою, PARTY SYSTEM)
    };
    live.set(charId, s);
    AB.Anim.play(charId, 'idle');
    return s;
  }

  function get(charId) {
    return live.get(charId) || null;
  }

  function setAppearance(charId, assetId) {
    const s = live.get(charId), def = AB.ID.get(charId);
    if (s && def.appearances.includes(assetId)) s.appearance = assetId;
  }

  // Действие, которое нельзя прервать ходьбой (взаимодействие, урон, пробуждение)
  function busy(s) {
    const tr = AB.Anim.current(s.id);
    return s.dead || s.down || s.climb || s.work || (tr && ['interact', 'hurt', 'wake', 'attack', 'death'].includes(tr.action) && !tr.done);
  }

  // roomId — какое помещение обновлять (боевая локация обновляет все свои помещения)
  function update(dt, bounds, roomId) {
    const room = roomId || AB.Rooms.current();
    for (const s of live.values()) {
      if (s.room !== room) continue;           // персонажи в других помещениях стоят на месте
      const def = AB.ID.get(s.id);
      let target = 0;
      if (s.controllable && !busy(s)) {
        const ax = AB.Input.axis();
        const run = AB.Input.running();
        target = ax * (run ? def.stats.runSpeed : def.stats.speed);
        if (ax) s.facing = ax;
      } else if (!busy(s)) {
        // бегство: если рядом преследователь — бежит к двери подальше от него
        const threat = s.flee && AB.Enemies.threatFor(s.id, s.room);
        if (!threat) s.fleeX = null;
        const lead = s.follow && live.get(s.follow);
        if (threat) {
          // дверь выбирается один раз за нападение — по ту сторону от преследователя,
          // иначе она металась бы и пробегала сквозь него
          if (s.fleeX == null) {
            const r = AB.Rooms.room();
            const side = Math.sign(s.x - threat.x) || 1;
            const doors = (r.doors || []).filter((d) => d.to && Math.sign(d.x - threat.x) === side);
            const door = doors.sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0];
            s.fleeX = door ? door.x - side * 55 : (side > 0 ? r.width - 70 : 70);
          }
          if (Math.abs(s.fleeX - s.x) > 10) s.goal = { x: s.fleeX, speed: def.stats.runSpeed, follow: false };
          else { s.goal = null; s.facing = Math.sign(threat.x - s.x) || s.facing; }  // ждёт у двери, открыть может только Марк
        } else if (s.engage != null) {
          // ведомый в бою: подходит на дистанцию удара или выстрела
          if (Math.abs(s.engage - s.x) > 10) s.goal = { x: s.engage, speed: def.stats.runSpeed, follow: false };
          else { s.goal = null; if (s.engageFace) s.facing = s.engageFace; }
        } else if (s.waypoint != null) {
          // боевая локация: идти к двери/лестнице на пути к ведущему или к своему посту
          if (Math.abs(s.waypoint - s.x) > 10) s.goal = { x: s.waypoint, speed: def.stats.runSpeed, follow: false };
          else s.goal = null;
        } else if (lead && lead.room === s.room) {
          const behind = lead.x - lead.facing * 85;
          const far = Math.abs(behind - s.x);
          if (far > 40) s.goal = { x: behind, speed: far > 260 ? def.stats.runSpeed : def.stats.speed };
          else if (s.goal && s.goal.follow !== false && far < 12) s.goal = null;
          if (!s.goal && Math.abs(lead.x - s.x) > 6) s.facing = Math.sign(lead.x - s.x);
        }
        if (s.goal) {
          const dx = s.goal.x - s.x;
          if (Math.abs(dx) < 6) { s.goal = null; AB.Bus.emit('char:arrived', { charId: s.id }); }
          else { target = Math.sign(dx) * s.goal.speed; s.facing = Math.sign(dx); }
        }
      }
      target *= AB.Perks.mod('moveSpeed');
      // плавный разгон и торможение
      const accel = target === 0 ? 900 : 700;
      if (s.vx < target) s.vx = Math.min(target, s.vx + accel * dt);
      else if (s.vx > target) s.vx = Math.max(target, s.vx - accel * dt);

      s.x += s.vx * dt;
      if (bounds) {
        const nx = AB.util.clamp(s.x, bounds.min, bounds.max);
        if (nx !== s.x) { s.x = nx; s.vx = 0; }
      }
      s.stride += Math.abs(s.vx) * dt;

      if (!busy(s)) {
        const speed = Math.abs(s.vx);
        const action = speed > def.stats.speed + 20 ? 'run' : speed > 8 ? 'walk' : 'idle';
        if (action !== s.action) {
          s.action = action;
          AB.Anim.play(s.id, action);
        }
      }
    }
  }

  function playAction(charId, action) {
    const s = live.get(charId);
    if (!s) return;
    s.action = action;
    s.vx = 0;
    AB.Anim.play(charId, action, { restart: true });
  }

  function equip(charId, itemId) {
    const s = live.get(charId);
    if (!s) return;
    s.equipped = itemId;
    AB.Bus.emit('char:equip', { charId, itemId });
  }

  // Вещь, которую персонаж несёт (одна на персонажа): у героя — рюкзак,
  // у противников — данные carry, пока он жив.
  function carried(id) {
    const c = live.get(id);
    if (c) { const items = AB.Inventory.packs(id).filter(Boolean).map((p) => p.item); return items.length ? items : null; }
    const e = AB.Enemies.get(id);
    if (e) return e.state === 'DEAD' ? null : AB.ID.get(id).carry || null;
    return null;
  }

  function heal(charId, amount) {
    const s = live.get(charId), def = AB.ID.get(charId);
    if (!s) return 0;
    const before = s.hp;
    s.hp = Math.min(def.stats.maxHp, s.hp + amount);
    AB.Bus.emit('char:hp', { charId, hp: s.hp, delta: s.hp - before });
    return s.hp - before;
  }

  function serialize() {
    return [...live.values()].map(({ id, room, x, facing, hp, appearance, equipped, follow, flee }) => ({ id, room, x, facing, hp, appearance, equipped, follow, flee }));
  }

  // ведомые переходят в новое помещение вместе с ведущим
  AB.Bus.on('room:enter', ({ roomId, seamless }) => {
    if (seamless) return;   // переход внутри сектора: каждый идёт сам
    const hero = live.get(AB.Party.leader());
    if (!hero) return;
    for (const s of live.values()) {
      if (s.follow !== hero.id) continue;
      s.room = roomId;
      s.x = hero.x - hero.facing * 70;
      s.facing = hero.facing;
      s.vx = 0;
      s.goal = null;
    }
  });

  function restore(list) {
    for (const d of list || []) {
      const s = spawn(d.id, d);
      if (s) Object.assign(s, { x: d.x, room: d.room, facing: d.facing, hp: d.hp, appearance: d.appearance, equipped: d.equipped || null, follow: d.follow || null, flee: !!d.flee });
    }
  }

  return { spawn, get, update, playAction, setAppearance, heal, equip, carried, serialize, restore, all: () => [...live.values()] };
})();
