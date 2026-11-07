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
        hp: def.hp, state: dead.has(id) ? 'DEAD'
          : (def.wakeEvent && AB.Story && AB.Story.isDone && AB.Story.isDone(def.wakeEvent) ? 'PATROL' : def.behavior.start), t: 0,
        patrolDir: 1, goalX: def.spawn.x, lastSeenX: null, loseT: 0,
        cooldown: 0, hitDone: false, retreated: false, stagger: 0, flash: 0, stride: 0,
        seenHero: false,
      };
      if (dead.has(id)) { s.hp = 0; s.x = s.deadX || def.spawn.x; }
      if (def.wakeEvent && s.state === 'PATROL') s.risen = true; // уже проснулся до загрузки
      live.set(id, s);
      AB.Anim.play(id, s.state === 'DEAD' ? 'death' : 'walk');
      if (s.state === 'DEAD') { const tr = AB.Anim.current(id); tr.t = 99; tr.done = true; }
    }
  }

  // экземпляр противника (мутант волны): ID вида 'ENEMY-001~7', данные — исходного ENEMY-001
  function spawnInstance(id, roomId, x, { arena = false, facing = -1 } = {}) {
    const def = AB.ID.get(id);
    const s = {
      id, room: roomId, x, facing, vx: 0, hp: def.hp, state: null, t: 0,
      patrolDir: 1, goalX: x, lastSeenX: null, loseT: 0, cooldown: 0.6, hitDone: false,
      retreated: true, stagger: 0, flash: 1, stride: 0, seenHero: true, arena,
    };
    live.set(id, s);
    setState(s, 'CHASE');
    return s;
  }

  function setState(s, state) {
    if (s.state === state) return;
    s.state = state;
    s.t = 0;
    s.hitDone = false;
    const def = AB.ID.get(s.id);
    const anim = { DORMANT: 'idle', IDLE: 'idle', PATROL: 'walk', INVESTIGATE: 'walk', ALERT: 'alert', CHASE: 'run', ATTACK: 'attack', RETREAT: 'run', DEAD: 'death' }[state];
    AB.Anim.play(s.id, anim, { restart: true });
    AB.Bus.emit('enemy:state', { id: s.id, state, name: def.name });
  }

  // Освещён ли герой (по данным ламп помещения, без участия рендерера)
  function heroLit(r, hero, def) {
    return r.lights.some((l) => !l.source && Math.abs(l.x - hero.x) < def.light.litRadius);
  }

  // цель — ближайший живой участник группы в этом помещении
  function pickTarget(s) {
    let best = null;
    for (const m of AB.Party.members()) {
      if (m.dead || m.room !== s.room) continue;
      if (!best || Math.abs(m.x - s.x) < Math.abs(best.x - s.x)) best = m;
    }
    return best || AB.Party.lead();
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
    const hero = AB.Party.lead();
    const target = AB.Chars.get(def.target);
    // кто может встать между ним и ней: любой из группы, кроме неё
    const guard = (goal) => AB.Party.members()
      .filter((m) => m.id !== def.target && !m.dead && m.room === s.room &&
        Math.sign(m.x - s.x) === Math.sign(goal.x - s.x) && Math.abs(m.x - s.x) < Math.abs(goal.x - s.x))
      .sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0] || null;
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
        const g = guard(target);
        const blocked = g && Math.abs(g.x - s.x) < def.attack.range ? g : null;
        const goalX = blocked ? blocked.x : target.x;
        const d = Math.abs(goalX - s.x);
        if (d < def.attack.range && s.cooldown <= 0) { s.victim = blocked ? blocked.id : target.id; setP(s, 'ATTACK'); break; }
        move(s, Math.sign(goalX - s.x), d < def.attack.range ? 0 : def.speed.chase, dt, r);
        break;
      }
      case 'ATTACK': {
        const v = AB.Chars.get(s.victim);
        if (v) s.facing = Math.sign(v.x - s.x) || s.facing;
        if (!s.hitDone && s.t >= def.attack.windup) {
          s.hitDone = true;
          if (v && !v.dead && Math.abs(v.x - s.x) < def.attack.range + 16) {
            AB.Combat.damageChar(v.id, v.id === def.target ? def.damage : def.shove, s.x);
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

  // roomId — помещение сектора (там обновляются все помещения сразу); иначе текущее
  function update(dt, roomId) {
    const r = roomId ? AB.ID.get(roomId) : AB.Rooms.room();
    if (!r) return;
    spawnForRoom(r.id);
    for (const s of [...live.values()]) {
      if (s.room !== r.id || s.state === 'DEAD' || s.arena) continue;   // волнами управляет боевая локация
      const def = AB.ID.get(s.id);
      if (def.type === 'pursuer') { updatePursuer(s, def, dt, r); continue; }
      const hero = pickTarget(s);
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
        case 'DORMANT':
          // спит в резервуаре, пока его не разбудит сюжет
          break;

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

  // Урон противнику. kind: 'melee' | 'ranged' (броня считается по виду удара).
  // Возвращает true, если попали.
  function damage(id, amount, fromX, kind = 'melee') {
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
    if (s.state === 'DORMANT') return false;
    if (def.armor && def.armor[kind] != null) amount = Math.round(amount * def.armor[kind]);
    s.hp = Math.max(0, s.hp - amount);
    s.flash = 1;
    s.lastSeenX = fromX;
    s.loseT = 0;
    AB.Bus.emit('enemy:hit', { id, x: s.x, hp: s.hp, from: fromX });
    if (s.hp <= 0) {
      setState(s, 'DEAD');
      if (!id.includes('~')) dead.add(id);   // экземпляры волн не запоминаются
      s.deadX = s.x;
      if (def.carry) AB.Rooms.dropItem(s.room, def.carry, AB.ID.get(def.carry).category === 'ammo' ? 3 : 1, s.x);
      AB.Bus.emit('enemy:dead', { id, name: def.name });
      return true;
    }
    // босс почти не сбивается с ног
    s.stagger = def.type === 'boss' ? 0.12 : 0.35;
    s.knock = Math.sign(s.x - fromX) * (def.type === 'boss' ? 30 : 180);
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
    update, damage, inCombat, spawnAt, despawn, threatFor, spawnInstance,
    remove: (id) => live.delete(id),
    setState(id, state) { const s = live.get(id); if (s && s.state !== 'DEAD') setState(s, state); },
    inRoom: (roomId) => [...live.values()].filter((s) => s.room === roomId),
    get: (id) => live.get(id) || null,
    isDead: (id) => dead.has(id),
    serialize: () => ({ dead: [...dead], pos: [...live.values()].filter((s) => AB.ID.get(s.id).type !== 'pursuer' && !s.id.includes('~')).map((s) => [s.id, Math.round(s.x), s.hp]) }),
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
