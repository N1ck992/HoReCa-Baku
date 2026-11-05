// =====================================================================
// ENEMY SYSTEM (GDD §13.2, §10). Поведение противников: конечный автомат
// IDLE → PATROL → INVESTIGATE → ALERT → CHASE → ATTACK → RETREAT → DEAD.
// Восприятие: зрение (впереди/сзади, дальше в освещённых зонах) и слух.
// =====================================================================

AB.Enemies = (() => {
  const U = AB.util;
  const live = new Map(); // enemyId -> state
  const dead = new Set(); // погибшие остаются погибшими (сохраняется)

  function spawnForRoom(roomId) {
    const r = AB.ID.get(roomId);
    for (const id of (r && r.enemies) || []) {
      if (live.has(id)) continue;
      const def = AB.ID.get(id);
      const s = {
        id, room: roomId, x: def.spawn.x, facing: -1, vx: 0,
        hp: def.hp, state: dead.has(id) ? 'DEAD' : def.behavior.start, t: 0,
        patrolDir: 1, goalX: def.spawn.x, lastSeenX: null, loseT: 0,
        cooldown: 0, hitDone: false, retreated: false, stagger: 0, flash: 0, stride: 0,
        seenHero: false,
      };
      if (dead.has(id)) { s.hp = 0; s.x = s.deadX || def.spawn.x; }
      live.set(id, s);
      AB.Anim.play(id, s.state === 'DEAD' ? 'death' : 'walk');
      if (s.state === 'DEAD') { const tr = AB.Anim.current(id); tr.t = 99; tr.done = true; }
    }
  }

  function setState(s, state) {
    if (s.state === state) return;
    s.state = state;
    s.t = 0;
    s.hitDone = false;
    const def = AB.ID.get(s.id);
    const anim = { IDLE: 'idle', PATROL: 'walk', INVESTIGATE: 'walk', ALERT: 'alert', CHASE: 'run', ATTACK: 'attack', RETREAT: 'run', DEAD: 'death' }[state];
    AB.Anim.play(s.id, anim, { restart: true });
    AB.Bus.emit('enemy:state', { id: s.id, state, name: def.name });
  }

  // Освещён ли герой (по данным ламп помещения, без участия рендерера)
  function heroLit(r, hero, def) {
    return r.lights.some((l) => !l.source && Math.abs(l.x - hero.x) < def.light.litRadius);
  }

  function perceive(s, def, hero, r) {
    if (!hero || hero.dead || hero.room !== s.room) return { sees: false, hears: false };
    const dx = hero.x - s.x, dist = Math.abs(dx);
    const ahead = Math.sign(dx) === s.facing;
    let sight = def.detection.sight * (heroLit(r, hero, def) ? def.light.litMultiplier : 1);
    if (!ahead) sight *= def.detection.behind;
    const tr = AB.Anim.current(hero.id);
    const act = tr ? tr.action : 'idle';
    const noise = act === 'attack' ? def.noise.combat : act === 'run' ? def.noise.run : act === 'walk' ? def.noise.walk : 0;
    return { sees: dist < sight, hears: dist < noise, dist, dx };
  }

  function move(s, dir, speed, dt, r) {
    s.vx = dir * speed;
    s.x = U.clamp(s.x + s.vx * dt, 60, r.width - 60);
    if (dir) s.facing = dir;
    s.stride += Math.abs(s.vx) * dt;
  }

  // ---------- Преследователь (ENEMY-002) ----------
  const P_ANIM = { WATCH: 'idle', APPEAR: 'walk', CHASE: 'run', ATTACK: 'attack', RETREAT: 'run', FADE: 'idle' };

  function setP(s, state) {
    if (s.state === state) return;
    s.state = state; s.t = 0; s.hitDone = false;
    AB.Anim.play(s.id, P_ANIM[state], { restart: true });
  }

  // появиться по сюжетному событию
  function spawnAt(id, room, x, state, facing = 1) {
    const s = { id, room, x, facing, vx: 0, hp: 999, state: null, t: 0, cooldown: 0, hits: 0, stagger: 0, knock: 0, flash: 0, stride: 0, alpha: 0 };
    live.set(id, s);
    setP(s, state);
    AB.Bus.emit('enemy:appear', { id, state });
    return s;
  }

  function despawn(id) {
    const s = live.get(id);
    if (s) setP(s, 'FADE');
  }

  function gone(s) {
    live.delete(s.id);
    AB.Bus.emit('enemy:gone', { id: s.id });
  }

  function updatePursuer(s, def, dt, r) {
    const hero = AB.Chars.get('CHAR-001');
    const target = AB.Chars.get(def.target);
    s.t += dt;
    s.cooldown = Math.max(0, s.cooldown - dt);
    s.flash = Math.max(0, s.flash - dt * 4);
    if (s.state === 'FADE') { s.alpha -= dt * 1.6; if (s.alpha <= 0) gone(s); return; }
    if (s.state !== 'RETREAT') s.alpha = Math.min(1, s.alpha + dt * 1.8);
    if (s.stagger > 0) { s.stagger -= dt; s.x = U.clamp(s.x + s.knock * dt, 40, r.width - 40); s.knock *= 0.85; return; }
    s.vx = 0;
    switch (s.state) {
      case 'WATCH':
        if (hero) s.facing = Math.sign(hero.x - s.x) || s.facing;
        break;
      case 'APPEAR':
        if (s.t > 0.7) setP(s, 'CHASE');
        break;
      case 'CHASE': {
        if (!target || target.dead || target.room !== s.room) { setP(s, 'RETREAT'); break; }
        // Марк встал между ним и спутницей — бьёт Марка
        const blocked = hero && !hero.dead && Math.sign(hero.x - s.x) === Math.sign(target.x - s.x) &&
          Math.abs(hero.x - s.x) < Math.abs(target.x - s.x) && Math.abs(hero.x - s.x) < def.attack.range;
        const goalX = blocked ? hero.x : target.x;
        const d = Math.abs(goalX - s.x);
        if (d < def.attack.range && s.cooldown <= 0) { s.victim = blocked ? hero.id : target.id; setP(s, 'ATTACK'); break; }
        move(s, Math.sign(goalX - s.x), d < def.attack.range ? 0 : def.speed.chase, dt, r);
        break;
      }
      case 'ATTACK': {
        const v = AB.Chars.get(s.victim);
        if (v) s.facing = Math.sign(v.x - s.x) || s.facing;
        if (!s.hitDone && s.t >= def.attack.windup) {
          s.hitDone = true;
          if (v && !v.dead && Math.abs(v.x - s.x) < def.attack.range + 16) {
            AB.Combat.damageChar(v.id, v.id === 'CHAR-001' ? def.shove : def.damage, s.x);
          }
        }
        if (s.t > def.attack.windup + 0.4) { s.cooldown = def.attack.cooldown; setP(s, 'CHASE'); }
        break;
      }
      case 'RETREAT': {
        // отступает в темноту, подальше от Марка, и растворяется
        const away = hero ? -Math.sign(hero.x - s.x) || -1 : -1;
        move(s, away, def.speed.retreat, dt, r);
        if (s.t > 0.6) s.alpha -= dt * 1.2;
        if (s.alpha <= 0) gone(s);
        break;
      }
    }
  }

  // угроза для персонажа: активный преследователь в том же помещении
  function threatFor(charId, room) {
    for (const s of live.values()) {
      const def = AB.ID.get(s.id);
      if (def.type === 'pursuer' && def.target === charId && s.room === room && ['APPEAR', 'CHASE', 'ATTACK'].includes(s.state)) return s;
    }
    return null;
  }

  function update(dt) {
    const r = AB.Rooms.room();
    if (!r) return;
    spawnForRoom(r.id);
    const hero = AB.Chars.get('CHAR-001');
    for (const s of [...live.values()]) {
      if (s.room !== r.id || s.state === 'DEAD') continue;
      const def = AB.ID.get(s.id);
      if (def.type === 'pursuer') { updatePursuer(s, def, dt, r); continue; }
      s.t += dt;
      s.cooldown = Math.max(0, s.cooldown - dt);
      s.flash = Math.max(0, s.flash - dt * 4);
      if (s.stagger > 0) {
        s.stagger -= dt;
        s.x = U.clamp(s.x + s.knock * dt, 60, r.width - 60);
        s.knock *= 0.85;
        continue;
      }
      const p = perceive(s, def, hero, r);
      if (p.sees || p.hears) { s.lastSeenX = hero.x; s.loseT = 0; } else s.loseT += dt;
      s.vx = 0;

      switch (s.state) {
        case 'IDLE':
          if (s.t > 2) setState(s, 'PATROL');
          if (p.sees) setState(s, 'ALERT');
          else if (p.hears) setState(s, 'INVESTIGATE');
          break;

        case 'PATROL': {
          const [a, b] = def.spawn.patrol;
          const goal = s.patrolDir > 0 ? b : a;
          if (Math.abs(goal - s.x) < 6) { s.patrolDir *= -1; setState(s, 'IDLE'); break; }
          move(s, Math.sign(goal - s.x), def.speed.patrol, dt, r);
          if (p.sees) setState(s, 'ALERT');
          else if (p.hears) setState(s, 'INVESTIGATE');
          break;
        }

        case 'INVESTIGATE':
          if (p.sees) { setState(s, 'ALERT'); break; }
          if (s.lastSeenX !== null && Math.abs(s.lastSeenX - s.x) > 10) {
            move(s, Math.sign(s.lastSeenX - s.x), def.speed.investigate, dt, r);
          } else if (s.t > def.behavior.investigateTime) setState(s, 'PATROL');
          break;

        case 'ALERT':
          s.facing = hero ? Math.sign(hero.x - s.x) || s.facing : s.facing;
          if (s.t > 0.7) setState(s, 'CHASE');
          break;

        case 'CHASE':
          if (!hero || hero.dead) { setState(s, 'PATROL'); break; }
          if (s.loseT > def.behavior.loseAfter) { setState(s, 'INVESTIGATE'); break; }
          if (p.dist !== undefined && p.dist < def.attack.range && s.cooldown <= 0) { setState(s, 'ATTACK'); break; }
          move(s, Math.sign((s.lastSeenX ?? hero.x) - s.x), p.dist < def.attack.range ? 0 : def.speed.chase, dt, r);
          break;

        case 'ATTACK':
          if (hero) s.facing = s.t < def.attack.windup * 0.6 ? Math.sign(hero.x - s.x) || s.facing : s.facing;
          // бросок вперёд в момент удара
          if (s.t > def.attack.windup && s.t < def.attack.windup + 0.15) move(s, s.facing, 220, dt, r);
          if (!s.hitDone && s.t >= def.attack.windup) {
            s.hitDone = true;
            if (hero && !hero.dead && Math.abs(hero.x - s.x) < def.attack.range + 14 && Math.sign(hero.x - s.x) === s.facing) {
              AB.Combat.damageChar(hero.id, def.damage, s.x);
            }
          }
          if (s.t > 1.0) { s.cooldown = def.attack.cooldown; setState(s, 'CHASE'); }
          break;

        case 'RETREAT':
          move(s, hero ? -Math.sign(hero.x - s.x) || 1 : 1, def.speed.retreat, dt, r);
          if (s.t > def.behavior.retreatTime) setState(s, 'CHASE');
          break;
      }
    }
  }

  // Урон противнику. Возвращает true, если попали.
  function damage(id, amount, fromX) {
    const s = live.get(id);
    if (!s || s.state === 'DEAD') return false;
    const def = AB.ID.get(id);
    if (def.immortal) {
      if (!['APPEAR', 'CHASE', 'ATTACK'].includes(s.state)) return false;
      s.hits++;
      s.flash = 1;
      s.stagger = 0.4;
      s.knock = Math.sign(s.x - fromX) * 200;
      AB.Anim.play(id, 'hurt', { restart: true });
      AB.Bus.emit('enemy:hit', { id, x: s.x, hp: s.hp, from: fromX });
      if (s.hits >= def.hitsToRetreat) { setP(s, 'RETREAT'); AB.Bus.emit('enemy:retreat', { id }); }
      else if (s.state === 'ATTACK') setP(s, 'CHASE');
      return true;
    }
    s.hp = Math.max(0, s.hp - amount);
    s.flash = 1;
    s.lastSeenX = fromX;
    s.loseT = 0;
    AB.Bus.emit('enemy:hit', { id, x: s.x, hp: s.hp, from: fromX });
    if (s.hp <= 0) {
      setState(s, 'DEAD');
      dead.add(id);
      s.deadX = s.x;
      if (def.carry) AB.Rooms.dropItem(s.room, def.carry, 1, s.x);
      AB.Bus.emit('enemy:dead', { id, name: def.name });
      return true;
    }
    s.stagger = 0.35;
    s.knock = Math.sign(s.x - fromX) * 180;
    AB.Anim.play(id, 'hurt', { restart: true });
    if (!s.retreated && s.hp / def.hp < def.behavior.retreatBelow) {
      s.retreated = true;
      setState(s, 'RETREAT');
    } else if (s.state !== 'ATTACK') {
      setState(s, 'CHASE');
    }
    return true;
  }

  // Противники, которые сейчас в бою (для автосохранения и музыки)
  function inCombat() {
    return [...live.values()].some((s) => s.room === AB.Rooms.current() && ['ALERT', 'CHASE', 'ATTACK', 'RETREAT', 'APPEAR'].includes(s.state));
  }

  AB.Bus.on('room:enter', ({ roomId }) => {
    for (const s of [...live.values()]) {
      if (AB.ID.get(s.id).type === 'pursuer' && s.room !== roomId) gone(s);
    }
  });

  return {
    update, damage, inCombat, spawnAt, despawn, threatFor,
    inRoom: (roomId) => [...live.values()].filter((s) => s.room === roomId),
    get: (id) => live.get(id) || null,
    isDead: (id) => dead.has(id),
    serialize: () => ({ dead: [...dead], pos: [...live.values()].filter((s) => AB.ID.get(s.id).type !== 'pursuer').map((s) => [s.id, Math.round(s.x), s.hp]) }),
    restore(d) {
      if (!d) return;
      (d.dead || []).forEach((id) => dead.add(id));
      for (const [id, x, hp] of d.pos || []) {
        const def = AB.ID.get(id);
        if (!def) continue;
        const r = def.spawn.room;
        spawnForRoom(r);
        const s = live.get(id);
        if (s) { s.x = x; s.deadX = x; if (!dead.has(id)) s.hp = hp; }
      }
    },
  };
})();
