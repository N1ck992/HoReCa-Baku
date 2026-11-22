// =====================================================================
// ISO MIRA (дополнение №118). Разоблачение Миры и бой с ней, фаза 1 «Иллюзия».
// Данные и сцены — js/data/iso-act3-mira.js; канон — docs/STORY.md §0.
//
// Мира (ENEMY-011) держится на расстоянии, бьёт дротиками, подлечивается и
// меняется местами со своими копиями (ENEMY-011~c1…). Копии бьют «пустыми»
// дротиками (иллюзия — без урона) и от одного удара лопаются облаком спор:
// кто рядом — замедлен. В линзе (ITEM-022) настоящая Мира обведена, копии
// полупрозрачны. Когда у Миры остаётся RULES.flee здоровья — сцена EVENT-028:
// она уходит в вентиляцию (фазы 2–3 — позже).
// =====================================================================

AB.IsoMira = (() => {
  const RULES = {
    range: 4.5, decoyRange: 3, speed: 2.2,
    dart: { every: 1.7, decoyEvery: 2.4, reach: 8 },
    heal: { every: 9, amount: 50, below: 0.85 },
    swap: 7, decoys: 3, decoyRespawn: 6,
    spores: { radius: 1.7, slow: 2.5 },
    p1End: 0.7,   // №123: при 70 % здоровья иллюзия рвётся — погоня (фазы 2–3 — iso-mira-phases.js)
  };
  const REAL = 'ENEMY-011';
  const HANGAR = { mira: { x: 73.5, y: 47.5 } };   // где Мира ждёт у капсулы
  let F = null, seq = 0;                            // { healT, swapT, respawnT, decoys:Set, fled }
  const W = () => AB.IsoWorld;
  const P = () => AB.IsoParty;
  const lens = () => AB.IsoStash ? AB.IsoStash.count('ITEM-022') > 0 || AB.Inventory.count('CHAR-001', 'ITEM-022') > 0 : true;
  const say = (text, kind = 'info') => AB.Bus.emit('iso:toast', { text, kind });

  // ---------- этап 1: в базе после первого устройства — сбой ЭХО ----------
  function checkEcho() {
    if (!AB.Flags.has('module') || AB.Flags.has('hale-signal') || AB.IsoActs.act() < 3) return;
    if (AB.Flags.has('mira-fled') || AB.Flags.has('surfaced')) return;     // №151: Мира уже позади (всплыли) — не повторять
    if (AB.IsoGame.sector() !== 'SECTOR-005' || AB.IsoOverworld.isOpen() || AB.IsoGame.busy()) return;
    AB.Flags.add('hale-signal');
    setTimeout(() => AB.IsoStory.trigger('act3:echo'), 600);
  }
  AB.Bus.on('iso:travel', ({ sector }) => { if (sector === 'SECTOR-005') setTimeout(checkEcho, 1200); });

  // ---------- этап 2: капсула у «Абисса» — Мира остаётся в капсуле ----------
  AB.Bus.on('ow:exit', () => {
    if (!AB.Flags.has('hale-signal') || AB.Flags.has('abyss-back') || AB.IsoOverworld.mode() !== 'capsule') return;
    AB.Flags.add('abyss-back');
    // кокон — в лаборатории (сектор загружается заново при переходе)
    const L = AB.ISO_LAYOUTS['SECTOR-003'];
    if (!L.props.some((p) => p.equip === 'EQUIP-017')) L.props.push({ kind: 'cocoon', x: 25, y: 13, w: 2, h: 2, equip: 'EQUIP-017' });
    const mira = P().find('CHAR-002');
    if (mira && P().members().includes(mira)) P().leave('CHAR-002');
    const m = P().find('CHAR-002'); if (m) { m.hidden = true; m.sector = 'SECTOR-005'; }
    setTimeout(() => say('Мира: «Я останусь в капсуле — подготовлю отплытие. Быстрее, Марк». ЭХО: сигнал Хейл — в лаборатории, за оружейной'), 900);
  });

  const RUN = {
    // Хейл выходит из кокона
    haleOut() {
      const lp = W().props().find((p) => p.equip === 'EQUIP-017');
      const at = lp ? W().nearestFree(lp.x + lp.w / 2, lp.y + lp.h + 0.6, 3) : null;
      const x = at ? at.x + 0.5 : P().lead().x + 1, y = at ? at.y + 0.5 : P().lead().y;
      let h = P().find('CHAR-003');
      if (!h) h = P().addNpc('CHAR-003', x, y);
      Object.assign(h, { x, y, hidden: false, down: false, sector: AB.IsoGame.sector() });
      if (!AB.Chars.get('CHAR-003') && AB.Chars.spawn) AB.Chars.spawn('CHAR-003', { room: 'ROOM-007', x: 600 });
      const c = AB.Chars.get('CHAR-003'); if (c) { c.down = false; c.dead = false; c.hp = AB.ID.get('CHAR-003').stats.maxHp; }
      if (lp) lp.done = true;
    },
    // Хейл — в отряде, со снотворным пистолетом
    haleJoin() {
      P().join('CHAR-003');
      const c = AB.Chars.get('CHAR-003'); if (c) { c.controllable = true; c.follow = 'CHAR-001'; }
      if (!AB.Inventory.weapon('CHAR-003')) AB.Inventory.add('CHAR-003', 'ITEM-023', 1, { swap: false });   // №120: инжектор уязвимости
      AB.IsoActs.setCrew(['CHAR-001', 'CHAR-002', 'CHAR-003']);
    },
    // Мира ждёт у капсулы в ангаре
    miraToHangar() {
      AB.Flags.add('lens');
      const m = P().find('CHAR-002');
      if (m) Object.assign(m, { sector: 'SECTOR-003', x: HANGAR.mira.x, y: HANGAR.mira.y, hidden: false, path: null, goal: null });
    },
    miraFight: () => start(),
    miraGone: () => gone(),
    escape: () => escape(),
    // №123: фазы 2–3
    chaseStart: () => AB.IsoMiraP.chaseStart((F && F.at) || HANGAR.mira),
    nestStart: () => AB.IsoMiraP.nestStart(),
    mindStart: () => AB.IsoMiraP.mindStart(),
    killMira: () => AB.IsoMiraP.kill(),
    riftOpen: () => AB.IsoMiraP.riftOpen(),
    riftClose: () => AB.IsoMiraP.riftClose(),
  };

  // ---------- этап 3: бой ----------
  function start() {
    AB.Flags.add('mira-fight');
    const m = P().find('CHAR-002');
    const x = m ? m.x : HANGAR.mira.x, y = m ? m.y : HANGAR.mira.y;
    if (m) m.hidden = true;
    F = { healT: RULES.heal.every, swapT: RULES.swap, respawnT: 0, decoys: new Set(), fled: false, look: m };
    const e = AB.IsoEnemies.spawn(REAL, x, y, { scripted: true, state: 'FIGHT' });
    if (e) e.target = 'CHAR-001';
    for (let i = 0; i < RULES.decoys; i++) decoy(x, y, i);
    AB.Bus.emit('boss:start', { id: REAL });
  }
  function decoy(x, y, i = Math.random() * 6) {
    const id = `${REAL}~c${++seq}`, a = i * 2.1 + seq;
    const e = AB.IsoEnemies.spawn(id, x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, { scripted: true, state: 'FIGHT' });
    if (!e) return;
    e.decoy = true; e.hp = 1; e.target = 'CHAR-001'; e.cooldown = 0.8 + Math.random();
    F.decoys.add(id);
  }
  const real = () => AB.IsoEnemies.get(REAL);
  // кому стрелять: Марку или Хейл (ближайший из отряда, кто жив)
  function targetOf(e) {
    let best = null, bd = 1e9;
    for (const m of P().members()) {
      const c = AB.Chars.get(m.id); if (!c || c.dead) continue;
      const d = Math.hypot(m.x - e.x, m.y - e.y); if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // поведение (вызывается из iso-enemies.js для type 'mira')
  function tick(e, dt) {
    { const form = AB.ID.get(e.id).form; if (form && form !== 'girl') return AB.IsoMiraP.tick(e, dt); }
    e.t += dt; e.flash = Math.max(0, e.flash - dt * 4); e.cooldown = Math.max(0, e.cooldown - dt);
    e.heal = Math.max(0, (e.heal || 0) - dt);
    if (e.state === 'DEAD' || !F || F.fled) { e.moving = false; return; }
    const t = targetOf(e); if (!t) return;
    const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
    const R = e.decoy ? RULES.decoyRange : RULES.range;
    let vx = 0, vy = 0;
    if (d < R - 1) { vx = -dx / d; vy = -dy / d; }                      // отойти
    else if (d > R + 1.5) { vx = dx / d; vy = dy / d; }                 // подойти
    else { const s = Math.sin(e.t * 0.9 + (e.decoy ? seq : 0)) > 0 ? 1 : -1; vx = (-dy / d) * 0.5 * s; vy = (dx / d) * 0.5 * s; }   // кружит
    const sp = RULES.speed * (e.stagger > 0 ? 0.3 : 1);
    const x0 = e.x, y0 = e.y;
    if (vx || vy) W().move(e, vx * sp * dt, vy * sp * dt, 0.3);
    const went = Math.hypot(e.x - x0, e.y - y0);
    e.moving = went > 0.002; e.stride = (e.stride || 0) + went * 50;
    e.hx = dx; e.hy = dy; const sx = dx - dy; if (Math.abs(sx) > 0.05) e.facing = sx > 0 ? 1 : -1;
    e.stagger = Math.max(0, (e.stagger || 0) - dt);
    // дротик
    if (e.cooldown <= 0 && d < RULES.dart.reach && W().see(e.x, e.y, t.x, t.y, 0.05)) {
      e.cooldown = e.decoy ? RULES.dart.decoyEvery : RULES.dart.every;
      AB.Bus.emit('iso:shot', { from: { x: e.x, y: e.y }, to: { x: t.x, y: t.y }, landed: !e.decoy, dart: true });
      if (!e.decoy) AB.IsoCombat.damageChar(t.id, AB.ID.get(REAL).dart, e);
    }
  }

  let echoT = 0;
  function update(dt) {
    for (const m of P().members()) if (m.slowT > 0) m.slowT = Math.max(0, m.slowT - dt);
    if (!AB.Flags.has('hale-signal') && (echoT += dt) > 1) { echoT = 0; checkEcho(); }   // первое устройство построено — сцена с ЭХО
    if (!F || F.fled) return;
    const e = real();
    if (!e) return;
    // подлечиться
    F.healT -= dt;
    if (F.healT <= 0) { F.healT = RULES.heal.every; const max = AB.ID.get(REAL).hp; if (e.hp < max * RULES.heal.below) { e.hp = Math.min(max, e.hp + RULES.heal.amount); e.heal = 0.8; } }
    // поменяться местами с копией
    F.swapT -= dt;
    const alive = [...F.decoys].map((id) => AB.IsoEnemies.get(id)).filter((q) => q && q.state !== 'DEAD');
    if (F.swapT <= 0 && alive.length) {
      F.swapT = RULES.swap;
      const q = alive[Math.floor(Math.random() * alive.length)];
      [e.x, e.y, q.x, q.y] = [q.x, q.y, e.x, e.y];
      AB.IsoStory.fx.flicker = Math.max(AB.IsoStory.fx.flicker, 0.25);
    }
    // новые копии
    if (alive.length < RULES.decoys) { F.respawnT += dt; if (F.respawnT >= RULES.decoyRespawn) { F.respawnT = 0; decoy(e.x, e.y); } } else F.respawnT = 0;
    // хватит — уходит
    if (e.hp <= AB.ID.get(REAL).hp * RULES.p1End && !F.fled) { F.fled = true; F.at = { x: e.x, y: e.y }; AB.IsoStory.trigger('mira:p1'); }
  }

  // копия лопнула — облако спор
  AB.Bus.on('enemy:dead', ({ id }) => {
    if (id === REAL && F && !F.fled) { const e = AB.IsoEnemies.get(id); F.fled = true; F.at = e ? { x: e.x, y: e.y } : HANGAR.mira; AB.IsoStory.trigger('mira:p1'); return; }
    if (!F || !F.decoys.has(id)) return;
    const e = AB.IsoEnemies.get(id); F.decoys.delete(id);
    if (!e) return;
    AB.Bus.emit('mira:spores', { x: e.x, y: e.y });
    let hit = false;
    for (const m of P().members()) if (Math.hypot(m.x - e.x, m.y - e.y) < RULES.spores.radius) { m.slowT = RULES.spores.slow; hit = true; }
    if (hit) say('Споры! Движения вязнут — это была копия');
    setTimeout(() => AB.IsoEnemies.despawn(id), 250);
  });

  function gone() {
    if (!F) return;
    for (const id of F.decoys) AB.IsoEnemies.despawn(id);
    F.decoys.clear();
    AB.IsoEnemies.despawn(REAL);
    AB.Bus.emit('boss:won', { id: REAL });
  }
  // Марк и Хейл уходят на капсуле: Миры в экипаже больше нет
  function escape() {
    F = null;
    AB.Flags.add('mira-fled'); if (AB.IsoMiraP) AB.IsoMiraP.end();
    const m = P().find('CHAR-002'); if (m) { m.hidden = true; m.sector = 'SECTOR-000'; }
    AB.IsoActs.setCrew(['CHAR-001', 'CHAR-003']);
    AB.IsoActs.enterBase();
    setTimeout(() => AB.IsoActs.checkEnd(), 1500);
  }

  // как рисовать: облик Миры; копии — полупрозрачные, если смотреть в линзу
  function figure(e) {
    const base = (F && F.look) || P().find('CHAR-002') || { id: 'CHAR-002' };
    const f = Object.create(base);
    Object.assign(f, { id: 'CHAR-002', x: e.x, y: e.y, facing: e.facing, hx: e.hx, hy: e.hy, moving: !!e.moving, speed: e.moving ? 2 : 0, hidden: false, down: false, dead: false, path: null });
    return f;
  }
  function draw(ctx, e, p, drawFig) {
    { const form = AB.ID.get(e.id).form; if (form && form !== 'girl') return AB.IsoMiraP.draw(ctx, e, p, drawFig); }
    if (e.state === 'DEAD') return;
    const seen = lens();
    ctx.save();
    if (e.decoy && seen) ctx.globalAlpha = 0.42 + Math.sin(performance.now() / 90) * 0.08;
    drawFig(figure(e), p);
    ctx.restore();
    if (!e.decoy && seen) {   // в линзе настоящая — обведена
      const t = performance.now() / 1000;
      ctx.strokeStyle = `rgba(190,120,255,${0.65 + Math.sin(t * 5) * 0.25})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 22, 11, 0, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 40, 16, 42, 0, 0, 7); ctx.stroke();
    }
    if (e.heal > 0) { ctx.strokeStyle = `rgba(110,255,170,${e.heal})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y, 26, 13, 0, 0, 7); ctx.stroke(); }
  }

  return { RULES, tick, update, draw, figureOf: figure, run: (fn) => RUN[fn] && RUN[fn](), state: () => F, active: () => !!F && !F.fled, checkEcho };
})();
