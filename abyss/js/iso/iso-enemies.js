// =====================================================================
// ISO ENEMIES (этап 3 изометрии, дополнение №47). Противники в изометрической
// сцене. Все числа — из данных противников (js/data/enemies.js) без изменений:
// здоровье, урон, скорости, дальность и замах удара, перезарядка, броня,
// дальность зрения и слуха, отступление при малом здоровье. 50 единиц вида
// сбоку = 1 клетка. Состояния — те же: PATROL, ALERT, CHASE, ATTACK, RETREAT,
// DEAD; путь к цели ищется в обход стен, предметов и закрытых дверей.
// =====================================================================

AB.IsoEnemies = (() => {
  const T = 50;                       // единиц вида сбоку в клетке
  const W = () => AB.IsoWorld;
  const list = new Map();             // ID (или экземпляр ENEMY-001~n) → состояние
  const dead = new Set();

  const sectorNow = () => (AB.IsoGame ? AB.IsoGame.sector() : null);
  // story — появление в сюжетной сцене (преследователь): стоит и смотрит, в бою не участвует
  // scripted — появился по сюжетной сцене (преследователь бессмертен и иначе на карту не ставится)
  function spawn(id, x, y, { story = false, scripted = false, state = null, facing = 1 } = {}) {
    const def = AB.ID.get(id);
    if (!def || (def.immortal && !story && !scripted) || dead.has(id)) return null;
    if (!AB.IsoWorld.free(x, y)) { const n = AB.IsoWorld.nearestFree(x, y, 4); if (n) { x = n.x + 0.5; y = n.y + 0.5; } }
    if (list.has(id)) list.delete(id);
    const e = {
      sector: sectorNow(), story, alpha: 1,
      id, x, y, hx: 1, hy: 0, homeX: x, homeY: y,
      hp: def.hp, state: (def.behavior && def.behavior.start) || 'PATROL', t: 0,
      facing: 1, stride: 0, flash: 0, stagger: 0, knockX: 0, knockY: 0, cooldown: 0,
      target: null, path: null, replanT: 0, loseT: 0, wander: null, retreated: false, hitDone: false,
    };
    if (story) { e.state = state || 'WATCH'; e.facing = facing; }
    else if (state) { e.state = state; e.facing = facing; e.alpha = state === 'APPEAR' ? 0 : 1; }
    list.set(id, e);
    AB.Anim.play(id, 'idle');
    return e;
  }

  const def = (e) => AB.ID.get(e.id);
  const here = () => [...list.values()].filter((e) => e.sector === sectorNow());
  const alive = () => here().filter((e) => e.state !== 'DEAD' && !e.story);
  const sees = (e, m) => W().see(e.x, e.y, m.x, m.y, 0.05);

  function setState(e, s) {
    e.state = s; e.t = 0; e.hitDone = false; e.path = null;
    const a = { ALERT: 'alert', ATTACK: 'attack', DEAD: 'death' }[s];
    if (a) AB.Anim.play(e.id, a, { restart: true });
  }

  // кого замечает: ближе всех из отряда — по зрению (впереди дальше, сзади — доля) или по шуму
  function perceive(e) {
    const d = def(e);
    let best = null, bd = 1e9;
    for (const m of AB.IsoParty.members()) {
      const c = AB.Chars.get(m.id);
      if (!c || c.dead) continue;
      const dx = m.x - e.x, dy = m.y - e.y, dist = Math.hypot(dx, dy);
      const ahead = (dx * e.hx + dy * e.hy) >= 0;
      const sight = (d.detection.sight / T) * (ahead ? 1 : d.detection.behind);
      const noise = (m.moving ? (m.run ? d.noise.run : d.noise.walk) : 0) / T;
      const fight = AB.IsoCombat && AB.IsoCombat.isSwinging(m.id) ? d.noise.combat / T : 0;
      const ok = (dist <= sight && sees(e, m)) || dist <= Math.max(noise, fight);
      if (ok && dist < bd) { bd = dist; best = m; }
    }
    return best;
  }

  // шаг к точке по пути (пересчёт пути раз в 0,4 с)
  function stepTo(e, tx, ty, speed, dt) {
    e.replanT -= dt;
    if (!e.path || e.replanT <= 0) { e.path = W().clear(e.x, e.y, tx, ty, 0.3) ? [{ x: tx, y: ty }] : W().path(e.x, e.y, tx, ty); e.replanT = 0.4; }
    if (!e.path || !e.path.length) return 0;
    const p = e.path[0], dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy);
    if (dist < 0.08) { e.path.shift(); return 0; }
    const s = Math.min(dist, speed * dt), ox = e.x, oy = e.y;
    W().move(e, (dx / dist) * s, (dy / dist) * s, 0.32);
    e.hx = dx / dist; e.hy = dy / dist;
    const went = Math.hypot(e.x - ox, e.y - oy);
    if (went < s * 0.2) e.path = null;
    return went;
  }

  function animate(e, went, dt, run) {
    e.stride += went * T;
    const sx = e.hx - e.hy;
    if (Math.abs(sx) > 0.05) e.facing = sx > 0 ? 1 : -1;
    if (['ALERT', 'ATTACK', 'DEAD'].includes(e.state) || e.stagger > 0) return;
    const a = went / Math.max(dt, 1e-4) > 0.1 ? (run ? 'run' : 'walk') : 'idle';
    if (e.anim !== a) { e.anim = a; AB.Anim.play(e.id, a); }
  }

  // ---------- Преследователь (ENEMY-002): нападает только на Миру, убить нельзя ----------
  const member = (id) => AB.IsoParty.members().find((m) => m.id === id);
  function pursuerTick(e, d, dt) {
    const target = member(d.target), tc = target && AB.Chars.get(target.id), lead = AB.IsoParty.lead();
    e.t += dt; e.cooldown = Math.max(0, e.cooldown - dt); e.flash = Math.max(0, e.flash - dt * 4);
    if (e.state !== 'RETREAT') e.alpha = Math.min(1, e.alpha + dt * 1.8);
    if (e.stagger > 0) { e.stagger -= dt; W().move(e, e.knockX * dt, e.knockY * dt, 0.32); e.knockX *= 0.85; e.knockY *= 0.85; return; }
    let went = 0;
    switch (e.state) {
      case 'APPEAR': if (e.t > 0.7) setState(e, 'CHASE'); break;
      case 'CHASE': {
        if (!target || !tc || tc.dead) { setState(e, 'RETREAT'); break; }
        // кто встал между ним и Мирой — того он и бьёт
        const tx = target.x - e.x, ty = target.y - e.y, td = Math.hypot(tx, ty);
        const guard = AB.IsoParty.members().filter((m) => m !== target && !(AB.Chars.get(m.id) || {}).dead)
          .find((m) => { const mx = m.x - e.x, my = m.y - e.y, md = Math.hypot(mx, my); return md < td && md < d.attack.range / T + 0.6 && (mx * tx + my * ty) / (md * td || 1) > 0.5; });
        const goal = guard || target, gd = Math.hypot(goal.x - e.x, goal.y - e.y);
        if (gd < d.attack.range / T + 0.3 && e.cooldown <= 0) { e.victim = goal.id; e.hx = goal.x - e.x; e.hy = goal.y - e.y; setState(e, 'ATTACK'); break; }
        went = gd > d.attack.range / T * 0.8 ? stepTo(e, goal.x, goal.y, d.speed.chase / T, dt) : 0;
        break;
      }
      case 'ATTACK': {
        const v = member(e.victim);
        if (!e.hitDone && e.t >= d.attack.windup) {
          e.hitDone = true;
          if (v && Math.hypot(v.x - e.x, v.y - e.y) < d.attack.range / T + 0.5) AB.IsoCombat.damageChar(v.id, v.id === d.target ? d.damage : d.shove, e);
        }
        if (e.t > d.attack.windup + 0.4) { e.cooldown = d.attack.cooldown; setState(e, 'CHASE'); }
        break;
      }
      case 'RETREAT': {
        // отступает в темноту, подальше от Марка, и растворяется
        if (lead) { const dx = e.x - lead.x, dy = e.y - lead.y, n = Math.hypot(dx, dy) || 1; went = stepTo(e, e.x + (dx / n) * 3, e.y + (dy / n) * 3, d.speed.retreat / T, dt); }
        if (e.t > 0.6) e.alpha -= dt * 1.2;
        if (e.alpha <= 0) { list.delete(e.id); AB.Bus.emit('enemy:gone', { id: e.id }); }
        break;
      }
    }
    animate(e, went, dt, true);
  }

  function tick(e, dt) {
    if (e.story) { e.t += dt; return; }   // сюжетное появление — без поведения
    const d = def(e);
    if (d.type === 'pursuer') { pursuerTick(e, d, dt); return; }
    if (e.state === 'DORMANT') { e.t += dt; return; }   // спит до своей сцены (Колосс)
    e.t += dt; e.cooldown = Math.max(0, e.cooldown - dt); e.flash = Math.max(0, e.flash - dt * 4);
    if (e.state === 'DEAD') return;
    if (e.stagger > 0) {
      e.stagger -= dt;
      W().move(e, e.knockX * dt, e.knockY * dt, 0.32);
      e.knockX *= 0.85; e.knockY *= 0.85;
      return;
    }
    const seen = perceive(e);
    if (seen) { e.target = seen.id; e.loseT = 0; } else e.loseT = e.nest ? 0 : e.loseT + dt;   // гнездо (№57) знает, где отряд
    if (e.nest && !e.target) e.target = 'CHAR-001';
    const tg = e.target && AB.IsoParty.members().find((m) => m.id === e.target);
    const tgc = tg && AB.Chars.get(tg.id);
    if (tg && (!tgc || tgc.dead)) e.target = null;
    let went = 0, run = false;

    switch (e.state) {
      case 'PATROL':
      case 'IDLE':
        if (tg && seen) { setState(e, 'ALERT'); break; }
        // бродит вокруг своего места
        if (!e.wander || Math.hypot(e.wander.x - e.x, e.wander.y - e.y) < 0.3 || e.t > 6) {
          const n = W().nearestFree(e.homeX + (Math.random() - 0.5) * 6, e.homeY + (Math.random() - 0.5) * 6, 2);
          e.wander = n ? { x: n.x + 0.5, y: n.y + 0.5 } : { x: e.homeX, y: e.homeY };
          e.path = null; e.t = 0;
        }
        went = stepTo(e, e.wander.x, e.wander.y, d.speed.patrol / T, dt);
        break;
      case 'ALERT':
        if (tg) { e.hx = tg.x - e.x; e.hy = tg.y - e.y; }
        if (e.t > 0.6) setState(e, 'CHASE');
        break;
      case 'CHASE': {
        if (!tg || e.loseT > d.behavior.loseAfter) { e.target = null; setState(e, 'PATROL'); break; }
        const dist = Math.hypot(tg.x - e.x, tg.y - e.y);
        if (dist <= d.attack.range / T + 0.25 && e.cooldown <= 0 && W().clear(e.x, e.y, tg.x, tg.y, 0.05)) { e.hx = tg.x - e.x; e.hy = tg.y - e.y; setState(e, 'ATTACK'); break; }   // сквозь решётку когтями не достать
        run = true;
        // №57: путь к цели перекрыт закрытой дверью — ломать её
        if (e.nest) {
          e.blockT = (e.blockT || 0) - dt;
          if (e.blockT <= 0) { e.blockT = 0.5; e.blocked = !W().path(e.x, e.y, tg.x, tg.y); }
          // №83: работающая турель рядом (громила — любая) — ломать её
          const tu = !e.blocked && AB.IsoNest.turretTarget(e, tg);
          if (tu) {
            if (Math.hypot(tu.x - e.x, tu.y - e.y) < d.attack.range / T + 0.7 && e.cooldown <= 0) { e.turret = tu.i; e.hx = tu.x - e.x; e.hy = tu.y - e.y; setState(e, 'ATTACK'); break; }
            went = stepTo(e, tu.x, tu.y, d.speed.chase / T, dt);
            break;
          }
          const b = e.blocked && AB.IsoNest.breach(e);
          if (b) {
            if (Math.hypot(b.x - e.x, b.y - e.y) < 0.6 && e.cooldown <= 0) { e.door = b.key; e.hx = (b.x < e.x ? -1 : 1); e.hy = 0; setState(e, 'ATTACK'); break; }
            went = stepTo(e, b.x, b.y, d.speed.chase / T, dt);
            break;
          }
        }
        went = dist > d.attack.range / T * 0.8 ? stepTo(e, tg.x, tg.y, d.speed.chase / T, dt) : 0;
        break;
      }
      case 'ATTACK':
        if (e.turret != null) {
          if (!e.hitDone && e.t >= d.attack.windup) { e.hitDone = true; AB.IsoNest.hitTurret(e.turret, d.damage); AB.Bus.emit('iso:enemyStrike', { id: e.id }); }
          if (e.t > 1.0) { e.cooldown = d.attack.cooldown; e.turret = null; setState(e, 'CHASE'); }
          break;
        }
        if (e.door) {
          if (!e.hitDone && e.t >= d.attack.windup) { e.hitDone = true; AB.IsoNest.hitDoor(e.door, d.damage); AB.Bus.emit('iso:enemyStrike', { id: e.id, door: e.door }); }
          if (e.t > 1.0) { e.cooldown = d.attack.cooldown; e.door = null; e.blockT = 0; setState(e, 'CHASE'); }
          break;
        }
        if (!e.hitDone && e.t >= d.attack.windup) {
          e.hitDone = true;
          if (tg && Math.hypot(tg.x - e.x, tg.y - e.y) <= d.attack.range / T + 0.45) AB.IsoCombat.damageChar(tg.id, d.damage, e);
          AB.Bus.emit('iso:enemyStrike', { id: e.id });
        }
        if (e.t > 1.0) { e.cooldown = d.attack.cooldown; setState(e, 'CHASE'); }
        break;
      case 'RETREAT':
        if (tg) {
          const dx = e.x - tg.x, dy = e.y - tg.y, n = Math.hypot(dx, dy) || 1;
          went = stepTo(e, e.x + (dx / n) * 3, e.y + (dy / n) * 3, d.speed.retreat / T, dt);
          run = true;
        }
        if (e.t > d.behavior.retreatTime) setState(e, 'CHASE');
        break;
    }
    animate(e, went, dt, run);
  }

  // урон противнику (броня — по виду удара, как в основной игре)
  function damage(id, amount, from, kind = 'melee') {
    const e = list.get(id);
    if (!e || e.state === 'DEAD') return false;
    const d = def(e);
    if (d.immortal) {
      // преследователь: убить нельзя; после нескольких ударов отступает
      if (!['APPEAR', 'CHASE', 'ATTACK'].includes(e.state)) return false;
      e.hits = (e.hits || 0) + 1; e.flash = 1; e.stagger = 0.4;
      if (from) { const dx = e.x - from.x, dy = e.y - from.y, n = Math.hypot(dx, dy) || 1; e.knockX = (dx / n) * 4; e.knockY = (dy / n) * 4; }
      AB.Anim.play(id, 'hurt', { restart: true });
      AB.Bus.emit('iso:enemyHit', { id, x: e.x, y: e.y, amount: 0, hp: e.hp });
      if (e.hits >= d.hitsToRetreat) { setState(e, 'RETREAT'); AB.Bus.emit('enemy:retreat', { id }); }
      else if (e.state === 'ATTACK') setState(e, 'CHASE');
      return true;
    }
    if (e.state === 'DORMANT') return false;
    if (d.armor && d.armor[kind] != null) amount = Math.round(amount * d.armor[kind]);
    if (AB.IsoBoss) amount = Math.max(from ? 1 : 0, Math.round(amount * AB.IsoBoss.mod(e, from)));   // №57: Колосса берут только пушки
    e.hp = Math.max(0, e.hp - amount);
    e.flash = 1;
    AB.Bus.emit('iso:enemyHit', { id, x: e.x, y: e.y, amount, hp: e.hp });
    if (from) { e.target = from.id || e.target; e.loseT = 0; }
    if (e.hp <= 0) {
      setState(e, 'DEAD');
      e.deadAt = performance.now();
      if (!id.includes('~')) dead.add(id);
      // №69: в секторе не больше 5 тел — самые старые убираем (память и отрисовка)
      const bodies = here().filter((q) => q.state === 'DEAD').sort((a, b) => (a.deadAt || 0) - (b.deadAt || 0));
      while (bodies.length > 5) list.delete(bodies.shift().id);
      AB.Bus.emit('enemy:dead', { id, name: d.name });
      return true;
    }
    e.stagger = d.type === 'boss' ? 0.12 : 0.35;
    if (from) {
      const dx = e.x - from.x, dy = e.y - from.y, n = Math.hypot(dx, dy) || 1, k = (d.type === 'boss' ? 30 : 180) / T;
      e.knockX = (dx / n) * k; e.knockY = (dy / n) * k;
    }
    AB.Anim.play(id, 'hurt', { restart: true });
    if (!e.retreated && e.hp / d.hp < d.behavior.retreatBelow) { e.retreated = true; setState(e, 'RETREAT'); }
    else if (e.state !== 'ATTACK') setState(e, e.state === 'PATROL' || e.state === 'IDLE' ? 'ALERT' : 'CHASE');
    return true;
  }

  // №69: далёкие спокойные противники (больше 18 клеток от отряда) не думают — экономим на расчётах
  function update(dt) {
    const l = AB.IsoParty.lead();
    for (const e of here()) {
      if (l && !e.nest && ['PATROL', 'IDLE', 'DORMANT', 'DEAD'].includes(e.state) && Math.hypot(e.x - l.x, e.y - l.y) > 18) continue;
      tick(e, dt);
    }
  }
  // противники сектора — при первом заходе в него (по данным помещений и местам планировки)
  const spawned = new Set();
  function spawnSector(sectorId, layout, extra = []) {
    if (spawned.has(sectorId)) return;
    spawned.add(sectorId);
    for (const a of layout.areas) for (const id of AB.ID.get(a.room).enemies || []) {
      const p = layout.enemyPos && layout.enemyPos[id];
      if (p && !list.has(id)) spawn(id, p.x, p.y);
    }
    for (const t of extra) spawn(t.id, t.x, t.y);
  }

  return {
    spawn, update, damage, alive, spawnSector, get: (id) => list.get(id), all: here,
    despawn: (id) => list.delete(id),
    // ушли из помещения преследователя — он исчезает (как в основной игре)
    leaveRoom(roomId) { for (const e of [...list.values()]) if (def(e).type === 'pursuer' && !e.story && (e.sector !== sectorNow() || AB.IsoWorld.room(e.x, e.y) !== roomId)) list.delete(e.id); },
    // кто угрожает персонажу (для бегства Миры): преследователь или босс рядом
    threat(m) { return here().find((e) => !e.story && e.state !== 'DEAD' && e.state !== 'DORMANT' && (def(e).type === 'pursuer' || def(e).type === 'boss') && Math.hypot(e.x - m.x, e.y - m.y) < 7) || null; },
    isDead: (id) => dead.has(id) || (list.has(id) && list.get(id).state === 'DEAD'),
    markDead: (id) => { dead.add(id); },   // №61: убит на карте дна (не в изометрии)
  };
})();
