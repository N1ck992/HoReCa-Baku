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
    return s.dead || (tr && ['interact', 'hurt', 'wake', 'attack', 'death'].includes(tr.action) && !tr.done);
  }

  function update(dt, bounds) {
    for (const s of live.values()) {
      const def = AB.ID.get(s.id);
      let target = 0;
      if (s.controllable && !busy(s)) {
        const ax = AB.Input.axis();
        const run = AB.Input.running();
        target = ax * (run ? def.stats.runSpeed : def.stats.speed);
        if (ax) s.facing = ax;
      }
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

  // Вещь, которую персонаж несёт (одна на персонажа): у героя — вещь в руках,
  // у противников — данные carry, пока он жив.
  function carried(id) {
    const c = live.get(id);
    if (c) return c.equipped || null;
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
    return [...live.values()].map(({ id, room, x, facing, hp, appearance, equipped }) => ({ id, room, x, facing, hp, appearance, equipped }));
  }

  function restore(list) {
    for (const d of list || []) {
      const s = spawn(d.id, d);
      if (s) Object.assign(s, { x: d.x, room: d.room, facing: d.facing, hp: d.hp, appearance: d.appearance, equipped: d.equipped || null });
    }
  }

  return { spawn, get, update, playAction, setAppearance, heal, equip, carried, serialize, restore, all: () => [...live.values()] };
})();
