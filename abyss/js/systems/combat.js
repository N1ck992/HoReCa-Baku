// =====================================================================
// COMBAT SYSTEM (GDD §13.7). Атака персонажа оружием из рук,
// урон персонажам, гибель. Противников бьёт через ENEMY SYSTEM.
// =====================================================================

AB.Combat = (() => {
  const swings = new Map(); // charId -> { t, weapon, hit }

  function weaponOf(charId) {
    const c = AB.Chars.get(charId);
    const w = c && AB.Inventory.weapon(charId);
    return w ? AB.ID.get(w.item) : null;
  }

  function canAttack(charId) {
    const c = AB.Chars.get(charId);
    if (!c || c.dead || !c.controllable || swings.has(charId)) return false;
    const tr = AB.Anim.current(charId);
    return !(tr && ['hurt', 'death', 'wake'].includes(tr.action) && !tr.done);
  }

  function attack(charId) {
    if (!canAttack(charId)) return false;
    const w = weaponOf(charId);
    if (!w) { AB.Bus.emit('combat:noweapon', { charId }); return false; }
    swings.set(charId, { t: 0, weapon: w, hit: false });
    AB.Chars.playAction(charId, 'attack');
    return true;
  }

  function update(dt) {
    for (const [charId, sw] of swings) {
      sw.t += dt;
      const w = sw.weapon.weapon;
      const c = AB.Chars.get(charId);
      if (!sw.hit && sw.t >= w.hitAt) {
        sw.hit = true;
        let landed = false;
        for (const e of AB.Enemies.inRoom(c.room)) {
          if (e.state === 'DEAD') continue;
          const dx = (e.x - c.x) * c.facing;
          if (dx > -10 && dx < w.range + 20) landed = AB.Enemies.damage(e.id, w.damage, c.x) || landed;
        }
        AB.Bus.emit('combat:swing', { charId, landed });
      }
      if (sw.t >= w.cooldown) swings.delete(charId);
    }
  }

  function damageChar(charId, amount, fromX) {
    const c = AB.Chars.get(charId);
    if (!c || c.dead) return;
    c.hp = Math.max(0, c.hp - amount);
    swings.delete(charId);
    AB.Bus.emit('char:hp', { charId, hp: c.hp, delta: -amount });
    AB.Bus.emit('char:hit', { charId, amount, from: fromX });
    if (c.hp <= 0) {
      c.dead = true;
      c.controllable = false;
      AB.Chars.playAction(charId, 'death');
      AB.Bus.emit('char:dead', { charId });
      return;
    }
    AB.Chars.playAction(charId, 'hurt');
    c.vx = Math.sign(c.x - fromX) * 230; // отбрасывание
  }

  return { attack, update, damageChar, weaponOf, isSwinging: (id) => swings.has(id) };
})();
