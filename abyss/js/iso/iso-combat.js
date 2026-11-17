// =====================================================================
// ISO COMBAT (этап 3 изометрии, дополнение №47). Бой в изометрической сцене
// по правилам основной игры (данные оружия в js/data/items.js не менялись):
//   • удар: замах до hitAt, урон damage, дальность range, повтор — cooldown;
//   • дальнее оружие: дротики (без боезапаса, слабые, далеко), плазма
//     (перегрев через AB.Inventory.fire); без выстрела — удар корпусом (bash);
//   • дротиковый пистолет в руках — аура лечения союзников рядом;
//   • урон персонажам, гибель; гибель Марка или Миры — конец, как в основной игре.
// Управление: нажать на противника — подойти и бить, пока жив; F / пробел —
// по ближайшему; автобой ведущего — та же настройка, что в основной игре.
// Ведомые с оружием сражаются сами.
// =====================================================================

AB.IsoCombat = (() => {
  const T = 50;
  const W = () => AB.IsoWorld;
  const swings = new Map();            // ID персонажа → { t, w, hit, shot, target }
  const healing = new Map();
  let target = null;                   // противник, которого атакует ведущий по нажатию
  // №124: автобой ведущего — только в режиме разработчика (DEV → «Автобой»); по умолчанию выключен
  let autoFight = false;
  try { autoFight = localStorage.getItem('abyss_autofight') === 'on'; } catch (e) { /* хранилище недоступно */ }

  const mod = (k) => (AB.Perks ? AB.Perks.mod(k) : 1);   // улучшения (перки) — множители
  // №56: снаружи Марк в экзокостюме — бьёт манипуляторами костюма, а не оружием в руках
  const weaponOf = (id) => { if (AB.IsoSuit && AB.IsoSuit.suited(AB.IsoParty.find(id))) return AB.IsoSuit.weapon(); const s = AB.Inventory.weapon(id); return s ? AB.ID.get(s.item) : null; };
  const charOf = (id) => AB.Chars.get(id);
  const member = (id) => AB.IsoParty.members().find((m) => m.id === id);
  const hostile = (e) => ['ALERT', 'CHASE', 'ATTACK', 'RETREAT', 'APPEAR', 'FIGHT'].includes(e.state);
  const canShoot = (id, w) => w.weapon.ranged && (w.weapon.infinite || (w.weapon.energy ? !(AB.Inventory.heat(id) || {}).over : false));
  // дальность удара/выстрела в клетках
  const reachOf = (id, w) => (w.weapon.reachCells ? w.weapon.reachCells : canShoot(id, w) ? w.weapon.range / T : (w.weapon.ranged ? 60 : w.weapon.range) / T + 0.35);

  function canAttack(m) {
    const c = charOf(m.id);
    if (!c || c.dead || swings.has(m.id)) return false;
    const tr = AB.Anim.current(m.id);
    return !(tr && ['hurt', 'death'].includes(tr.action) && !tr.done);
  }

  // атака персонажа m по противнику e (или просто в сторону взгляда)
  function attack(m, e) {
    if (!canAttack(m)) return false;
    const w = weaponOf(m.id);
    if (!w) { AB.Bus.emit('combat:noweapon', { charId: m.id }); return false; }
    if (e) { m.hx = e.x - m.x; m.hy = e.y - m.y; const sx = m.hx - m.hy; if (Math.abs(sx) > 0.05) m.facing = sx > 0 ? 1 : -1; }
    const shot = w.weapon.ranged && (w.weapon.infinite || (w.weapon.energy ? AB.Inventory.fire(m.id) : false));
    if (w.weapon.ranged && !shot) AB.Bus.emit(w.weapon.energy ? 'combat:overheated' : 'combat:noammo', { charId: m.id });
    // №111: серия ударов ближнего боя — нажал снова вскоре после удара → следующий; третий — тяжёлый
    const now = performance.now() / 1000, C = AB.IsoFX ? AB.IsoFX.RULES.combo : null;
    let combo = 0;
    if (C && !shot && !w.weapon.ranged) { combo = (m.lastSwing != null && now - m.lastSwing < (w.weapon.cooldown || 0.6) + C.window) ? ((m.combo || 0) + 1) % 3 : 0; m.combo = combo; m.lastSwing = now; }
    swings.set(m.id, { t: 0, w, hit: false, shot, target: e ? e.id : null, combo });
    AB.Anim.play(m.id, 'attack', { restart: true });
    m.action = 'attack';
    return true;
  }

  // попадание: дальнее — первый противник на линии до цели (стены и закрытые двери держат),
  // ближнее — все в досягаемости перед персонажем
  function resolve(m, sw) {
    const w = sw.w.weapon;
    let landed = false;
    if (sw.shot) {
      const e0 = sw.target && AB.IsoEnemies.get(sw.target);
      const n = Math.hypot(m.hx, m.hy) || 1, dx = m.hx / n, dy = m.hy / n, range = w.range / T;
      let hit = null, best = range;
      for (const e of AB.IsoEnemies.alive()) {
        const rx = e.x - m.x, ry = e.y - m.y, along = rx * dx + ry * dy, side = Math.abs(rx * dy - ry * dx);
        if (along <= 0 || along > best || side > (e === e0 ? 0.9 : 0.55)) continue;
        if (!W().see(m.x, m.y, e.x, e.y, 0.05)) continue;
        hit = e; best = along;
      }
      if (hit && w.vuln) AB.IsoEnemies.vulnerable(hit.id, w.vuln);   // №120: инжектор Хейл — ткани цели уязвимее
      if (hit) { landed = AB.IsoEnemies.damage(hit.id, w.damage * mod('rangedDamage'), m, 'ranged'); if (landed && AB.IsoFX) AB.IsoFX.impact(hit, { x: hit.x - (hit.x - m.x) * 0.01, y: hit.y - (hit.y - m.y) * 0.01 }, false, hit.state === 'DEAD'); }
      const end = hit ? { x: hit.x, y: hit.y } : { x: m.x + dx * Math.min(range, 6), y: m.y + dy * Math.min(range, 6) };
      AB.Bus.emit('iso:shot', { from: { x: m.x, y: m.y }, to: end, landed, energy: !!w.energy, dart: !!w.dart, cut: !!w.cutter });
    } else {
      const dmg = (w.ranged ? w.bash : w.damage) * mod('meleeDamage'), reach = w.reachCells ? w.reachCells + 0.15 : (w.ranged ? 60 : w.range) / T + 0.45;
      const n = Math.hypot(m.hx, m.hy) || 1;
      for (const e of AB.IsoEnemies.alive()) {
        const rx = e.x - m.x, ry = e.y - m.y, d = Math.hypot(rx, ry);
        if (d > reach || (d > 0.4 && (rx * m.hx + ry * m.hy) / (d * n) < 0.35)) continue;   // перед собой, ~70°
        const C = AB.IsoFX && AB.IsoFX.RULES.combo, k = sw.combo || 0, heavy = k === 2;
        const hit = AB.IsoEnemies.damage(e.id, dmg * (C ? C.dmg[k] : 1), m, 'melee', { knock: C ? C.knock[k] : 1 });
        if (hit && AB.IsoFX) AB.IsoFX.impact(e, m, heavy, e.state === 'DEAD');
        landed = hit || landed;
      }
    }
    AB.Bus.emit('combat:swing', { charId: m.id, landed, damage: sw.shot ? w.damage * mod('rangedDamage') : (w.ranged ? w.bash : w.damage) * mod('meleeDamage') });   // №88: урон удара — для дрона
  }

  // урон персонажу (от противника e)
  function damageChar(id, amount, from) {
    const c = charOf(id), m = member(id);
    if (!c || c.dead) return;
    if (AB.IsoFX && AB.IsoFX.invulnerable(m)) { AB.Bus.emit('iso:dodge', { id }); return; }   // №111: в рывке — удар мимо
    amount *= mod('damageTaken');
    if (AB.IsoSuit && AB.IsoSuit.suited(m)) amount *= AB.IsoSuit.rig().armor;   // корпус костюма держит удар
    if (AB.IsoArmor) amount *= 1 - AB.IsoArmor.of(id);                          // №82: надетая броня
    c.hp = Math.max(0, c.hp - amount);
    swings.delete(id);
    AB.Bus.emit('char:hp', { charId: id, hp: c.hp, delta: -amount });
    AB.Bus.emit('char:hit', { charId: id, amount });
    if (m) AB.Bus.emit('iso:charHit', { id, x: m.x, y: m.y });
    if (c.hp <= 0) {
      c.dead = true; c.controllable = false;
      if (m) { m.path = null; m.goal = null; m.dead = true; }
      AB.Anim.play(id, 'death', { restart: true });
      AB.Bus.emit('char:dead', { charId: id });
      return;
    }
    AB.Anim.play(id, 'hurt', { restart: true });
    if (m && from) {   // отбрасывание
      const dx = m.x - from.x, dy = m.y - from.y, n = Math.hypot(dx, dy) || 1;
      W().move(m, (dx / n) * 0.35, (dy / n) * 0.35);
    }
  }

  // аура лечения: оружие с aura в руках лечит живых союзников рядом (и владельца)
  function auras(dt) {
    const ms = AB.IsoParty.members();
    for (const c of ms) {
      const w = weaponOf(c.id), au = w && w.weapon.aura, cc = charOf(c.id);
      if (!au || !cc || cc.dead) { healing.delete(c.id); continue; }
      let any = false;
      for (const m of ms) {
        const mc = charOf(m.id);
        if (!mc || mc.dead || Math.hypot(m.x - c.x, m.y - c.y) > au.radius / T) continue;
        const max = AB.ID.get(m.id).stats.maxHp;
        if (mc.hp < max) { mc.hp = Math.min(max, mc.hp + au.heal * mod('auraHeal') * dt); any = true; AB.Bus.emit('char:hp', { charId: m.id, hp: mc.hp, delta: 0 }); }
      }
      healing.set(c.id, any ? 0.4 : Math.max(0, (healing.get(c.id) || 0) - dt));
    }
  }

  // ближайший враждебный противник в досягаемости персонажа (с видимостью)
  function foeInReach(m, extra = 0) {
    const w = weaponOf(m.id);
    if (!w) return null;
    const reach = reachOf(m.id, w) * (canShoot(m.id, w) ? 0.85 : 1) + extra;
    let best = null, bd = reach;
    for (const e of AB.IsoEnemies.alive()) {
      const d = Math.hypot(e.x - m.x, e.y - m.y);
      if (d <= bd && hostile(e) && W().see(m.x, m.y, e.x, e.y, 0.05)) { bd = d; best = e; }
    }
    return best;
  }

  // ---------- Ведущий: нажатие на противника, F/пробел, автобой ----------
  function setTarget(e) {
    target = e ? e.id : null;
    if (e) AB.IsoParty.goTo(e.x, e.y);
  }
  // №124: правый стик — выстрел/удар в направлении прицела (без поиска цели)
  function fireAt(dir) {
    const l = AB.IsoParty.lead();
    if (!l) return false;
    l.hx = dir.x; l.hy = dir.y; const sx = dir.x - dir.y; if (Math.abs(sx) > 0.05) l.facing = sx > 0 ? 1 : -1;
    // №126: прицел сам по себе беззвучен — выстрел только по врагу в секторе прицела, в досягаемости и на виду;
    // без оружия и при перегреве — тишина (раньше сыпались «нет оружия» и «перегрев» каждый кадр)
    const w = weaponOf(l.id);
    if (!w || swings.has(l.id) || !canAttack(l)) return false;
    const h = AB.Inventory.heat(l.id); if (h && h.over) return false;
    const range = (w.weapon.ranged ? w.weapon.range : Math.max(w.weapon.range || 60, 90)) / T;
    const e = AB.IsoEnemies.alive().filter((q) => {
      if (!hostile(q)) return false;
      const dx = q.x - l.x, dy = q.y - l.y, d = Math.hypot(dx, dy);
      return d <= range && (dx * dir.x + dy * dir.y) / (d || 1) > 0.9 && W().see(l.x, l.y, q.x, q.y, 0.05);
    }).sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y))[0];
    if (!e) return false;
    return attack(l, e);
  }
  function attackNearest() {
    const l = AB.IsoParty.lead();
    if (swings.has(l.id)) { l.queued = performance.now(); return true; }   // №111: нажал во время удара — следующий удар серии сразу после
    // №111: сначала — враг впереди (куда смотрит/идёт ведущий), потом ближайший
    const n0 = Math.hypot(l.hx || 0, l.hy || 0) || 1;
    const ahead = AB.IsoEnemies.alive().filter((q) => hostile(q) && Math.hypot(q.x - l.x, q.y - l.y) < 2.2 && ((q.x - l.x) * l.hx + (q.y - l.y) * l.hy) / (n0 * (Math.hypot(q.x - l.x, q.y - l.y) || 1)) > 0.5)
      .sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y))[0];
    const e = ahead || foeInReach(l, 0.4) || AB.IsoEnemies.alive().filter((q) => Math.hypot(q.x - l.x, q.y - l.y) < 2).sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y))[0];
    return attack(l, e || null);
  }

  function leaderTick(dt, input) {
    const l = AB.IsoParty.lead(), c = charOf(l.id);
    if (!c || c.dead) { target = null; return; }
    if (input && (input.x || input.y)) target = null;                 // пошёл сам — отменить атаку по нажатию
    const e = target && AB.IsoEnemies.get(target);
    if (e && e.state === 'DEAD') target = null;
    if (target && e) {
      const w = weaponOf(l.id);
      if (!w) { target = null; AB.Bus.emit('combat:noweapon', { charId: l.id }); return; }
      const d = Math.hypot(e.x - l.x, e.y - l.y), reach = reachOf(l.id, w) * (canShoot(l.id, w) ? 0.85 : 0.9);
      if (d <= reach && W().see(l.x, l.y, e.x, e.y, 0.05)) { AB.IsoParty.stop(); attack(l, e); }
      else if (!l.path || Math.hypot((l.goal || l).x - e.x, (l.goal || l).y - e.y) > 0.8) AB.IsoParty.goTo(e.x, e.y);
      return;
    }
    // автобой: враг в досягаемости — бьёт сам; уходит от врага — не мешаем
    if (!autoFight || !(AB.IsoDev && AB.IsoDev.on())) return;
    const f = foeInReach(l);
    if (!f) return;
    if (input && (input.x || input.y) && (input.x * (f.x - l.x) + input.y * (f.y - l.y)) < 0) return;
    if (l.path && !swings.has(l.id)) return;   // идёт по нажатию — не останавливаем
    attack(l, f);
  }

  // ---------- Ведомые: сами вступают в бой, если есть оружие ----------
  function followersTick() {
    const l = AB.IsoParty.lead();
    for (const m of AB.IsoParty.members()) {
      if (m === l) continue;
      m.engage = null;
      const c = charOf(m.id), w = weaponOf(m.id);
      if (!c || c.dead || !w || (m.flee && AB.IsoEnemies.threat(m))) continue;   // бежит — не дерётся
      const reach = reachOf(m.id, w);
      // противники недалеко от ведущего (ведомые не убегают от отряда)
      let best = null, bd = 1e9;
      for (const e of AB.IsoEnemies.alive()) {
        if (!hostile(e) || Math.hypot(e.x - l.x, e.y - l.y) > 8) continue;
        const d = Math.hypot(e.x - m.x, e.y - m.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) continue;
      const see = W().see(m.x, m.y, best.x, best.y, 0.05);
      if (m.repair) { m.engage = null; continue; }   // №57: взламывает замок — не стреляет (лечит аурой)
      if (bd <= reach * (canShoot(m.id, w) ? 0.8 : 0.9) && see) { m.engage = { x: m.x, y: m.y, hold: true }; attack(m, best); }
      else m.engage = { x: best.x, y: best.y };
    }
  }

  function update(dt, input) {
    AB.Inventory.cool(dt * mod('plasmaCool'));
    auras(dt);
    for (const [id, sw] of swings) {
      sw.t += dt;
      const m = member(id);
      if (!m) { swings.delete(id); continue; }
      if (!sw.hit && sw.t >= sw.w.weapon.hitAt) { sw.hit = true; resolve(m, sw); }
      if (sw.t >= sw.w.weapon.cooldown) {
        swings.delete(id);
        if (m.queued && performance.now() - m.queued < 700 && m === AB.IsoParty.lead()) { m.queued = null; attackNearest(); }   // №111: серия
        else m.queued = null;
      }
    }
    leaderTick(dt, input);
    followersTick();
  }

  return {
    update, attack, attackNearest, fireAt, damageChar, setTarget, weaponOf, reachOf,
    swingOf: (id) => swings.get(id) || null,
    target: () => target, isSwinging: (id) => swings.has(id),
    auraActive: (id) => (healing.get(id) || 0) > 0, hasAura: (id) => { const w = weaponOf(id); return !!(w && w.weapon.aura); },
    autoFight: () => autoFight,
    setAutoFight(on) { autoFight = !!on; try { localStorage.setItem('abyss_autofight', on ? 'on' : 'off'); } catch (e) { /* хранилище недоступно */ } },
  };
})();
