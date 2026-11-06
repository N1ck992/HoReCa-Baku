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

  function canAttack(charId, ai) {
    const c = AB.Chars.get(charId);
    if (!c || c.dead || (!c.controllable && !ai) || swings.has(charId)) return false;
    const tr = AB.Anim.current(charId);
    return !(tr && ['hurt', 'death', 'wake'].includes(tr.action) && !tr.done);
  }

  // ai: true — бьёт ведомый сам (PARTY SYSTEM), без управления игроком
  function attack(charId, { ai = false } = {}) {
    if (!canAttack(charId, ai)) return false;
    const w = weaponOf(charId);
    if (!w) { AB.Bus.emit('combat:noweapon', { charId }); return false; }
    // оружие дальнего боя без гарпунов — удар прикладом
    const shot = w.weapon.ranged && AB.Inventory.spendAmmo(charId);
    if (w.weapon.ranged && !shot) AB.Bus.emit('combat:noammo', { charId });
    swings.set(charId, { t: 0, weapon: w, hit: false, shot });
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
        if (sw.shot) {
          // гарпун: летит по прямой и попадает в первого противника на линии
          const targets = AB.Enemies.inRoom(c.room)
            .filter((e) => e.state !== 'DEAD' && e.state !== 'FADE' && (e.x - c.x) * c.facing > 0 && Math.abs(e.x - c.x) < w.range)
            .sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x));
          const hit = targets[0];
          if (hit) landed = AB.Enemies.damage(hit.id, w.damage, c.x, 'ranged');
          AB.Bus.emit('combat:shot', { charId, fromX: c.x + c.facing * 40, toX: hit ? hit.x : c.x + c.facing * w.range, landed });
        } else {
          const dmg = w.ranged ? w.bash : w.damage, reach = w.ranged ? 60 : w.range;
          for (const e of AB.Enemies.inRoom(c.room)) {
            if (e.state === 'DEAD') continue;
            const dx = (e.x - c.x) * c.facing;
            if (dx > -10 && dx < reach + 20) landed = AB.Enemies.damage(e.id, dmg, c.x, 'melee') || landed;
          }
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
