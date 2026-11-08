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

  function spawn(id, x, y) {
    const def = AB.ID.get(id);
    if (!def || def.immortal || dead.has(id)) return null;   // преследователь — сюжетный, не переносится
    const e = {
      id, x, y, hx: 1, hy: 0, homeX: x, homeY: y,
      hp: def.hp, state: def.behavior.start || 'PATROL', t: 0,
      facing: 1, stride: 0, flash: 0, stagger: 0, knockX: 0, knockY: 0, cooldown: 0,
      target: null, path: null, replanT: 0, loseT: 0, wander: null, retreated: false, hitDone: false,
    };
    list.set(id, e);
    AB.Anim.play(id, 'idle');
    return e;
  }

  const def = (e) => AB.ID.get(e.id);
  const alive = () => [...list.values()].filter((e) => e.state !== 'DEAD');
  const sees = (e, m) => W().clear(e.x, e.y, m.x, m.y, 0.05);

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

  function tick(e, dt) {
    const d = def(e);
    e.t += dt; e.cooldown = Math.max(0, e.cooldown - dt); e.flash = Math.max(0, e.flash - dt * 4);
    if (e.state === 'DEAD') return;
    if (e.stagger > 0) {
      e.stagger -= dt;
      W().move(e, e.knockX * dt, e.knockY * dt, 0.32);
      e.knockX *= 0.85; e.knockY *= 0.85;
      return;
    }
    const seen = perceive(e);
    if (seen) { e.target = seen.id; e.loseT = 0; } else e.loseT += dt;
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
        if (dist <= d.attack.range / T + 0.25 && e.cooldown <= 0 && sees(e, tg)) { e.hx = tg.x - e.x; e.hy = tg.y - e.y; setState(e, 'ATTACK'); break; }
        run = true;
        went = dist > d.attack.range / T * 0.8 ? stepTo(e, tg.x, tg.y, d.speed.chase / T, dt) : 0;
        break;
      }
      case 'ATTACK':
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
    if (d.armor && d.armor[kind] != null) amount = Math.round(amount * d.armor[kind]);
    e.hp = Math.max(0, e.hp - amount);
    e.flash = 1;
    AB.Bus.emit('iso:enemyHit', { id, x: e.x, y: e.y, amount, hp: e.hp });
    if (from) { e.target = from.id || e.target; e.loseT = 0; }
    if (e.hp <= 0) {
      setState(e, 'DEAD');
      if (!id.includes('~')) dead.add(id);
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

  function update(dt) { for (const e of list.values()) tick(e, dt); }

  return {
    spawn, update, damage, alive, get: (id) => list.get(id), all: () => [...list.values()],
    isDead: (id) => dead.has(id) || (list.has(id) && list.get(id).state === 'DEAD'),
  };
})();
