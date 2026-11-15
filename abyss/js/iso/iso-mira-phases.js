// =====================================================================
// ISO MIRA — фазы 2–3 боя (дополнение №123). Фаза 1 «Иллюзия» — js/iso/iso-mira.js.
//
// Фаза 1 → погоня: иллюзия рвётся, Мира в истинном облике (ENEMY-012) гонится
//   за отрядом из ангара через архив, мастерскую и грузовой лифт; прыгает сверху
//   (красный круг — успей уйти), бросает тяжи биомассы на пол (замедляют).
//   Добежали до зала жизнеобеспечения (ROOM-009) — фаза 2.
// Фаза 2 «Гнездо»: Мира вросла в биомассу и стала огромной (ENEMY-013) в центре
//   зала. Бьёт лапами по кругу (красные секторы), плюётся спорами (лужи),
//   выпускает личинок. Сама почти неуязвима — пока её не ударит током аварийный
//   разрядник: встать на его площадку и продержаться 3 с; после разряда она
//   оглушена и открыта, разрядник — на перезарядке (она рвёт кабели).
// Фаза 3 «Разум»: гигант распадается — выползает худая Мира (ENEMY-014). Удар по
//   сознанию: экран плывёт, личинки видятся людьми экипажа, доктор Хейл —
//   чудовищем; верить меткам ЭХО. Обессилев, Мира падает — «Добить»: удерживать.
//   Дальше — сцены (js/data/iso-act3-mira.js): последние слова, спора, разлом,
//   преследователь утаскивает тело Миры в разлом, побег на капсуле.
// =====================================================================

AB.IsoMiraP = (() => {
  const RULES = {
    chase: { speed: 2.9, leapEvery: 3.6, leapWarn: 0.9, leapR: 1.4, leapDmg: 18, strandEvery: 6, strandR: 1.1, strandLife: 14 },
    nest: {
      at: { x: 52.5, y: 28.5 }, armor: 0.12, stunArmor: 1,
      sweep: { every: 3.2, warn: 1.1, r: 4.2, half: 0.9, dmg: 22 },
      spit: { every: 5, warn: 0.8, r: 1.2, dmg: 10, life: 10 },
      larvae: { every: 9, max: 3 },
      pylon: { hold: 3, stun: 5, damage: 0.22, cooldown: 25 },
      // площадки — у пушек зала (бой с Колоссом) и у пульта жизнеобеспечения
      pylons: [{ x: 44.5, y: 31.5 }, { x: 62.5, y: 26.5 }, { x: 50.5, y: 22.5 }],
    },
    mind: { swipeEvery: 2.4, swipeWarn: 0.8, swipeR: 1.7, swipeDmg: 14, speed: 1.3, downAt: 0.15, hold: 1.5, reach: 2.4 },
  };
  const ID = { beast: 'ENEMY-012', giant: 'ENEMY-013', thin: 'ENEMY-014' };
  let S = null;                 // { phase, zones:[], pylons:[], t... }
  let seq = 0;
  const W = () => AB.IsoWorld, P = () => AB.IsoParty;
  const say = (text, kind = 'info') => AB.Bus.emit('iso:toast', { text, kind });
  const img = new Image(); img.src = 'assets/char002/true/mira-true.webp';
  const alive = (m) => { const c = AB.Chars.get(m.id); return c && !c.dead; };
  const nearest = (x, y) => { let b = null, bd = 1e9; for (const m of P().members()) { if (!alive(m)) continue; const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; b = m; } } return b; };
  const hitIn = (fn, dmg, from) => { for (const m of P().members()) if (alive(m) && fn(m)) AB.IsoCombat.damageChar(m.id, dmg, from); };
  const zone = (z) => { S.zones.push({ t: 0, ...z }); };
  const inSector = (m, z) => { const dx = m.x - z.x, dy = m.y - z.y, d = Math.hypot(dx, dy); if (d > z.r) return false; let da = Math.atan2(dy, dx) - z.a0; da = Math.atan2(Math.sin(da), Math.cos(da)); return Math.abs(da) <= z.half || d < 0.8; };

  // ---------- переходы между фазами (вызываются из сцен) ----------
  function chaseStart(at) {
    S = { phase: 'chase', zones: [], pylons: [], leapT: 2.2, strandT: 3, sweepT: 2, spitT: 3, larvaT: 4, larvae: new Set(), swipeT: 1.5 };
    const e = AB.IsoEnemies.spawn(ID.beast, at.x, at.y, { scripted: true, state: 'FIGHT' });
    if (e) e.target = 'CHAR-001';
    AB.Flags.add('mira-chase');
  }
  function nestStart() {
    if (!S) S = { zones: [], pylons: [], larvae: new Set() };
    AB.IsoEnemies.despawn(ID.beast);
    S.phase = 'nest'; S.zones = []; S.sweepT = 2.5; S.spitT = 4; S.larvaT = 6;
    const N = RULES.nest;
    const c = W().nearestFree(N.at.x, N.at.y, 4) || { x: N.at.x - 0.5, y: N.at.y - 0.5 };
    const g = AB.IsoEnemies.spawn(ID.giant, c.x + 0.5, c.y + 0.5, { scripted: true, state: 'FIGHT' });
    if (g) { g.armorMul = N.armor; g.minHp = 1; g.target = 'CHAR-001'; }
    S.pylons = N.pylons.map((p) => { const f = W().nearestFree(p.x, p.y, 3) || { x: p.x - 0.5, y: p.y - 0.5 }; return { x: f.x + 0.5, y: f.y + 0.5, hold: 0, cd: 0, zap: 0 }; });
    AB.Flags.add('mira-nest');
  }
  function mindStart() {
    const g = AB.IsoEnemies.get(ID.giant), at = g ? { x: g.x, y: g.y } : RULES.nest.at;
    AB.IsoEnemies.despawn(ID.giant);
    for (const id of S.larvae) { const l = AB.IsoEnemies.get(id); if (l) l.larvaMind = true; }
    S.phase = 'mind'; S.zones = []; S.pylons = []; S.swipeT = 2; S.larvaT = 3; S.pleaT = 6; S.hold = 0;
    const e = AB.IsoEnemies.spawn(ID.thin, at.x, at.y, { scripted: true, state: 'FIGHT' });
    if (e) { e.minHp = Math.round(AB.ID.get(ID.thin).hp * RULES.mind.downAt); e.target = 'CHAR-001'; }
    setMind(true);
    AB.Flags.add('mira-mind');
  }
  function setMind(on) {
    const cv = document.getElementById('iso'); if (cv) cv.style.filter = on ? 'hue-rotate(35deg) saturate(1.35) contrast(1.08)' : '';
  }
  // Мира мертва: спора уходит в Марка; тело — у разлома
  function kill() {
    const e = AB.IsoEnemies.get(ID.thin);
    if (e) { e.down = false; e.dead = true; e.state = 'DEAD'; }
    for (const id of S ? S.larvae : []) { const l = AB.IsoEnemies.get(id); if (l && l.state !== 'DEAD') AB.IsoEnemies.damage(id, 9999, null); }
    setMind(false);
    hideFinish();
    const m = P().find('CHAR-001');
    if (e && m) S.spore = { x: e.x, y: e.y, tx: m.x, ty: m.y, t: 0 };
    AB.Flags.add('mira-dead');
    if (S) S.phase = 'over';
  }
  function riftOpen() {
    const e = AB.IsoEnemies.get(ID.thin), m = P().find('CHAR-001');
    const at = e ? { x: e.x + 1.2, y: e.y + 0.6 } : { x: m.x + 2, y: m.y };
    S.rift = { x: at.x, y: at.y, t: 0, close: 0 };
    AB.IsoStory.fx.shake = 2; AB.IsoStory.fx.shakePower = 3;
  }
  function riftClose() {
    if (S && S.rift) S.rift.close = 0.001;
    AB.IsoEnemies.despawn(ID.thin);
    AB.IsoEnemies.despawn('ENEMY-002');
  }

  // ---------- поведение (вызывается из iso-mira.js для form ≠ girl) ----------
  function tick(e, dt) {
    e.t += dt; e.flash = Math.max(0, e.flash - dt * 4);
    e.stun = Math.max(0, (e.stun || 0) - dt);
    if (e.state === 'DEAD' || !S) { e.moving = false; return; }
    const form = AB.ID.get(e.id).form;
    if (form === 'beast') return beastTick(e, dt);
    if (form === 'giant') return giantTick(e, dt);
    if (form === 'thin') return thinTick(e, dt);
  }
  function face(e, t) { e.hx = t.x - e.x; e.hy = t.y - e.y; const sx = e.hx - e.hy; if (Math.abs(sx) > 0.05) e.facing = sx > 0 ? 1 : -1; }
  function walk(e, t, sp, dt) {
    e.replanT = (e.replanT || 0) - dt;
    if (!e.path || e.replanT <= 0) { e.path = W().path(e.x, e.y, t.x, t.y) || null; e.replanT = 0.5; }
    let left = sp * dt;
    const x0 = e.x, y0 = e.y;
    while (e.path && e.path.length && left > 0) {
      const n = e.path[0], dx = n.x - e.x, dy = n.y - e.y, d = Math.hypot(dx, dy);
      if (d <= left) { e.x = n.x; e.y = n.y; left -= d; e.path.shift(); } else { W().move(e, dx / d * left, dy / d * left, 0.35); left = 0; }
    }
    const went = Math.hypot(e.x - x0, e.y - y0); e.moving = went > 0.002; e.stride = (e.stride || 0) + went * 50;
  }

  function beastTick(e, dt) {
    const C = RULES.chase, t = nearest(e.x, e.y); if (!t) return;
    face(e, t);
    if (e.leap) {
      e.leap.t += dt;
      if (e.leap.t >= C.leapWarn) {
        const f = W().nearestFree(e.leap.x, e.leap.y, 3); if (f) { e.x = f.x + 0.5; e.y = f.y + 0.5; }
        hitIn((m) => Math.hypot(m.x - e.leap.x, m.y - e.leap.y) < C.leapR, C.leapDmg, e);
        AB.IsoStory.fx.shake = 0.3; AB.IsoStory.fx.shakePower = 2.5;
        e.leap = null; e.path = null;
      }
      return;
    }
    walk(e, t, C.speed, dt);
    S.leapT -= dt;
    const d = Math.hypot(t.x - e.x, t.y - e.y);
    if (S.leapT <= 0 && d < 7 && W().see(e.x, e.y, t.x, t.y, 0.05)) {
      S.leapT = C.leapEvery;
      const px = t.x + (t.hx || 0) * 0.15, py = t.y + (t.hy || 0) * 0.15;   // чуть на упреждение
      e.leap = { x: px, y: py, t: 0 };
      zone({ kind: 'circle', x: px, y: py, r: C.leapR, dur: C.leapWarn });
    }
    S.strandT -= dt;
    if (S.strandT <= 0) {   // тяжи биомассы на пути отряда
      S.strandT = C.strandEvery;
      const l = P().lead(), n = Math.hypot(l.hx || 0, l.hy || 0) || 1;
      const sx = l.x + (l.hx || 0) / n * 3, sy = l.y + (l.hy || 0) / n * 3;
      if (W().free(sx, sy)) zone({ kind: 'strand', x: sx, y: sy, r: C.strandR, dur: C.strandLife });
    }
  }

  function giantTick(e, dt) {
    const N = RULES.nest, t = nearest(e.x, e.y); if (!t) return;
    face(e, t);
    e.armorMul = e.stun > 0 ? N.stunArmor : N.armor;
    e.moving = false;
    if (e.stun > 0) return;
    S.sweepT -= dt;
    if (S.sweepT <= 0) {
      S.sweepT = N.sweep.every;
      const a0 = Math.atan2(t.y - e.y, t.x - e.x);
      zone({ kind: 'sector', x: e.x, y: e.y, r: N.sweep.r, a0, half: N.sweep.half, dur: N.sweep.warn, hit: { dmg: N.sweep.dmg, from: e } });
    }
    S.spitT -= dt;
    if (S.spitT <= 0) {
      S.spitT = N.spit.every;
      const list = P().members().filter(alive), m = list[Math.floor(Math.random() * list.length)];
      if (m) zone({ kind: 'circle', x: m.x, y: m.y, r: N.spit.r, dur: N.spit.warn, hit: { dmg: N.spit.dmg, from: e }, then: { kind: 'strand', r: N.spit.r, dur: N.spit.life, spore: true } });
    }
    larvae(e, dt);
  }
  function larvae(e, dt) {
    S.larvaT -= dt;
    const live = [...S.larvae].filter((id) => { const l = AB.IsoEnemies.get(id); return l && l.state !== 'DEAD'; });
    if (S.larvaT <= 0 && live.length < RULES.nest.larvae.max) {
      S.larvaT = RULES.nest.larvae.every;
      const a = Math.random() * 6.28, id = `ENEMY-001~l${++seq}`;
      const l = AB.IsoEnemies.spawn(id, e.x + Math.cos(a) * 2.5, e.y + Math.sin(a) * 2.5);
      if (l) { l.state = 'CHASE'; l.target = 'CHAR-001'; l.nest = true; l.larva = true; l.larvaMind = S.phase === 'mind'; S.larvae.add(id); }
    }
  }

  function thinTick(e, dt) {
    const M = RULES.mind, t = nearest(e.x, e.y); if (!t) return;
    face(e, t);
    if (e.down) { e.moving = false; return; }
    if (e.hp <= e.minHp) {   // обессилела — падает; «Добить»
      e.down = true; e.path = null; S.zones = [];
      say('Мира упала. Подойдите и удерживайте «Добить»');
      return;
    }
    const d = Math.hypot(t.x - e.x, t.y - e.y);
    if (d > 1.4) walk(e, t, M.speed, dt); else e.moving = false;
    S.swipeT -= dt;
    if (S.swipeT <= 0 && d < 2.6) {
      S.swipeT = M.swipeEvery;
      zone({ kind: 'sector', x: e.x, y: e.y, r: M.swipeR, a0: Math.atan2(t.y - e.y, t.x - e.x), half: 0.8, dur: M.swipeWarn, hit: { dmg: M.swipeDmg, from: e } });
    }
    larvae(e, dt);
    S.pleaT -= dt;
    if (S.pleaT <= 0) { S.pleaT = 7; say(PLEA[Math.floor(Math.random() * PLEA.length)]); }
  }
  const PLEA = ['Мира: «Марк, это я. Посмотри на меня без линзы»', 'Мира: «Я кормила тебя. Я согревала тебя в темноте»', 'Мира: «Я просто заботилась о тебе»', 'Мира: «Нам было хорошо вдвоём. Зачем тебе она?»'];

  // ---------- кадр ----------
  function update(dt) {
    if (!S) return;
    // зоны: предупреждение → удар; тяжи и лужи замедляют
    for (const z of S.zones) {
      z.t += dt;
      if (z.kind !== 'strand' && z.t >= z.dur && !z.done) {
        z.done = true;
        if (z.hit) hitIn((m) => (z.kind === 'sector' ? inSector(m, z) : Math.hypot(m.x - z.x, m.y - z.y) < z.r), z.hit.dmg, z.hit.from);
        if (z.then) S.zones.push({ t: 0, x: z.x, y: z.y, ...z.then });
      }
      if (z.kind === 'strand') for (const m of P().members()) if (Math.hypot(m.x - z.x, m.y - z.y) < z.r) m.slowT = Math.max(m.slowT || 0, 0.35);
    }
    S.zones = S.zones.filter((z) => (z.kind === 'strand' ? z.t < z.dur : !z.done || z.t < z.dur + 0.15));
    if (S.phase === 'chase') {
      const l = P().lead();
      if (l && W().room(l.x, l.y) === 'ROOM-009' && !S.reached) { S.reached = true; AB.IsoStory.trigger('mira:nest'); }
    }
    if (S.phase === 'nest') pylons(dt);
    if (S.phase === 'nest') { const g = AB.IsoEnemies.get(ID.giant); if (g && g.hp <= 1 && !S.collapsed) { S.collapsed = true; AB.IsoStory.trigger('mira:mind'); } }
    if (S.phase === 'mind') finishTick(dt);
    if (S.spore) { S.spore.t += dt; if (S.spore.t > 1.4) S.spore = null; }
    if (S.rift) { S.rift.t += dt; if (S.rift.close) { S.rift.close += dt; if (S.rift.close > 1.2) S.rift = null; } }
  }
  function pylons(dt) {
    const N = RULES.nest.pylon, g = AB.IsoEnemies.get(ID.giant), l = P().lead();
    for (const p of S.pylons) {
      p.cd = Math.max(0, p.cd - dt); p.zap = Math.max(0, p.zap - dt);
      const on = l && alive(l) && p.cd <= 0 && Math.hypot(l.x - p.x, l.y - p.y) < 0.9;
      p.hold = on ? p.hold + dt : Math.max(0, p.hold - dt * 2);
      if (p.hold >= N.hold && g) {
        p.hold = 0; p.cd = N.cooldown; p.zap = 0.5;
        g.stun = N.stun; g.flash = 1;
        g.armorMul = 1; AB.IsoEnemies.damage(g.id, AB.ID.get(ID.giant).hp * N.damage, null, 'energy');
        AB.IsoStory.fx.shake = 0.5; AB.IsoStory.fx.shakePower = 3;
        AB.Bus.emit('iso:shot', { from: { x: p.x, y: p.y - 1.2 }, to: { x: g.x, y: g.y }, landed: true, energy: true });
        say('Разряд! Мира оглушена — бейте, пока она открыта');
      }
    }
  }

  // ---------- «Добить» (удерживать) ----------
  let holding = false, btn = null;
  function finishTick(dt) {
    const e = AB.IsoEnemies.get(ID.thin), l = P().lead();
    const can = !!(e && e.down && l && Math.hypot(l.x - e.x, l.y - e.y) < RULES.mind.reach && !AB.IsoStory.isRunning());
    if (!btn) makeBtn();
    btn.hidden = !can;
    if (!can) { S.hold = 0; return; }
    S.hold = holding ? S.hold + dt : Math.max(0, S.hold - dt * 1.5);
    btn.style.setProperty('--k', String(Math.min(1, S.hold / RULES.mind.hold)));
    if (S.hold >= RULES.mind.hold) { S.hold = 0; holding = false; btn.hidden = true; S.phase = 'final'; AB.IsoStory.trigger('mira:finish'); }
  }
  function hideFinish() { if (btn) btn.hidden = true; holding = false; }
  function makeBtn() {
    btn = document.createElement('button');
    btn.id = 'iso-finish'; btn.hidden = true; btn.textContent = 'Добить — удерживать (E)';
    document.body.appendChild(btn);
    const on = (e) => { e.preventDefault(); e.stopPropagation(); holding = true; }, off = () => { holding = false; };
    btn.addEventListener('pointerdown', on); btn.addEventListener('pointerup', off); btn.addEventListener('pointerleave', off); btn.addEventListener('pointercancel', off);
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyE' && btn && !btn.hidden) { holding = true; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyE') holding = false; });
  }

  // ---------- рисование ----------
  const now = () => performance.now() / 1000;
  function drawGround(ctx, toScreen) {
    if (!S) return;
    const ell = (x, y, r) => { const c = toScreen(x, y), ex = toScreen(x + r, y), ey = toScreen(x, y + r); ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.hypot(ex.x - c.x, ex.y - c.y) * 1.0, Math.hypot(ey.x - c.x, ey.y - c.y) * 0.72, 0, 0, 7); };
    for (const z of S.zones) {
      const k = Math.min(1, z.t / (z.dur || 1));
      ctx.save();
      if (z.kind === 'strand') {
        const a = Math.min(1, z.t * 3) * Math.min(1, (z.dur - z.t) / 1.5);
        ell(z.x, z.y, z.r); ctx.fillStyle = z.spore ? `rgba(150,170,90,${0.35 * a})` : `rgba(120,70,90,${0.45 * a})`; ctx.fill();
        ctx.strokeStyle = `rgba(190,120,140,${0.5 * a})`; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]); ctx.stroke();
      } else if (z.kind === 'circle') {
        ell(z.x, z.y, z.r); ctx.fillStyle = `rgba(255,40,30,${0.1 + 0.12 * k})`; ctx.fill(); ctx.strokeStyle = `rgba(255,70,50,${0.4 + 0.4 * k})`; ctx.lineWidth = 1.5; ctx.stroke();
        ell(z.x, z.y, z.r * k); ctx.fillStyle = `rgba(255,50,35,${0.22 + 0.25 * k})`; ctx.fill();
      } else if (z.kind === 'sector') {
        const shape = (r) => { ctx.beginPath(); const c = toScreen(z.x, z.y); ctx.moveTo(c.x, c.y); for (let i = 0; i <= 18; i++) { const a = z.a0 - z.half + (2 * z.half * i) / 18, p = toScreen(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r); ctx.lineTo(p.x, p.y); } ctx.closePath(); };
        shape(z.r); ctx.fillStyle = `rgba(255,40,30,${0.08 + 0.1 * k})`; ctx.fill(); ctx.strokeStyle = `rgba(255,70,50,${0.35 + 0.4 * k})`; ctx.lineWidth = 1.5; ctx.stroke();
        shape(z.r * k); ctx.fillStyle = `rgba(255,50,35,${0.2 + 0.25 * k})`; ctx.fill();
      }
      ctx.restore();
    }
    // разрядники: столб с катушкой; зелёный — готов, жёлтый — заряжается (стоите на площадке), красный — порваны кабели
    const g = AB.IsoEnemies.get(ID.giant);
    for (const p of S.pylons) {
      const b = toScreen(p.x, p.y), ready = p.cd <= 0, col = !ready ? '255,80,60' : p.hold > 0 ? '255,210,90' : '110,255,150';
      ell(p.x, p.y, 0.8); ctx.strokeStyle = `rgba(${col},.7)`; ctx.lineWidth = 2; ctx.stroke();
      if (p.hold > 0) { ctx.beginPath(); ctx.ellipse(b.x, b.y, 26, 13, 0, -Math.PI / 2, -Math.PI / 2 + 6.283 * (p.hold / RULES.nest.pylon.hold)); ctx.strokeStyle = 'rgba(255,230,120,.95)'; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.fillStyle = '#2b3036'; ctx.fillRect(b.x - 6, b.y - 70, 12, 70);
      ctx.fillStyle = '#4a525a'; ctx.fillRect(b.x - 10, b.y - 80, 20, 14);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = '#9a7a48'; ctx.fillRect(b.x - 9, b.y - 62 + i * 9, 18, 4); }
      ctx.fillStyle = `rgb(${col})`; ctx.beginPath(); ctx.arc(b.x, b.y - 86, 5, 0, 7); ctx.fill();
      if (!ready) { ctx.font = '600 10px "Share Tech Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,150,130,.9)'; ctx.fillText(`${Math.ceil(p.cd)} с`, b.x, b.y - 96); }
      if (p.zap > 0 && g) {   // молния
        const a = toScreen(p.x, p.y), z = toScreen(g.x, g.y);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(170,220,255,${p.zap * 2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y - 86);
        for (let i = 1; i < 8; i++) { const t = i / 8; ctx.lineTo(a.x + (z.x - a.x) * t + (Math.random() - 0.5) * 24, a.y - 86 + (z.y - 120 - a.y + 86) * t + (Math.random() - 0.5) * 24); }
        ctx.lineTo(z.x, z.y - 120); ctx.stroke(); ctx.restore();
      }
    }
    // разлом
    if (S.rift) {
      const r = S.rift, c = toScreen(r.x, r.y), k = Math.min(1, r.t / 0.8) * (r.close ? Math.max(0, 1 - r.close / 1.2) : 1);
      ctx.save();
      const gr = ctx.createRadialGradient(c.x, c.y - 40, 4, c.x, c.y - 40, 90 * k + 1);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(40,10,60,.9)'); gr.addColorStop(1, 'rgba(120,60,200,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(c.x, c.y - 40, 60 * k, 95 * k, Math.sin(now() * 2) * 0.1, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(200,150,255,${0.7 * k})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    // спора уходит в Марка
    if (S.spore) {
      const sp = S.spore, t = Math.min(1, sp.t / 1.2), a = toScreen(sp.x + (sp.tx - sp.x) * t, sp.y + (sp.ty - sp.y) * t);
      ctx.fillStyle = `rgba(200,210,150,${1 - t * 0.6})`; ctx.beginPath(); ctx.arc(a.x, a.y - 60 - Math.sin(t * Math.PI) * 30, 3, 0, 7); ctx.fill();
    }
  }
  // фигуры: зверь, гигант, худая Мира (картинка автора; масштаб — по форме)
  const H = { beast: 250, giant: 560, thin: 200 };
  function draw(ctx, e, p, drawFig) {
    if (!img.complete || !img.naturalWidth) return;
    const form = AB.ID.get(e.id).form;
    if (e.state === 'DEAD' && !e.dead) return;
    const h = H[form] || 220, w = img.naturalWidth * (h / img.naturalHeight);
    ctx.save();
    let lift = 0;
    if (e.leap) { const k = Math.min(1, e.leap.t / RULES.chase.leapWarn); lift = Math.sin(k * Math.PI) * 120; }
    const sway = Math.sin(now() * (form === 'giant' ? 1.2 : 6) + (e.stride || 0) * 0.05) * (form === 'giant' ? 0.015 : e.moving ? 0.04 : 0.01);
    ctx.translate(p.x, p.y - lift); ctx.rotate(sway);
    if (e.facing < 0) ctx.scale(-1, 1);
    if (e.down || e.dead) { ctx.rotate(0.5); ctx.globalAlpha = e.dead ? 0.7 : 0.9; }
    if (e.stun > 0) ctx.filter = 'brightness(1.4) saturate(0.4)';
    else if (e.flash > 0) ctx.filter = 'brightness(1.6)';
    ctx.drawImage(img, -w / 2, -h * 0.97, w, h);
    ctx.filter = 'none';
    ctx.restore();
    if (form === 'thin' && !e.dead && drawFig && S && S.phase === 'mind') {   // сквозь линзу проступает девушка — иллюзия, которую она держит
      ctx.save(); ctx.globalAlpha = 0.28 + Math.sin(now() * 3) * 0.12; drawFig(AB.IsoMira.figureOf(e), p); ctx.restore();
    }
    if (S && S.phase === 'mind') echoMark(ctx, p, h);
    if (e.stun > 0) { ctx.font = '700 12px "Oswald", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#bfe8ff'; ctx.fillText('ОГЛУШЕНА', p.x, p.y - h - 6); }
  }
  // метка ЭХО: «враг» — над настоящими врагами в фазе «Разум»
  function echoMark(ctx, p, h) {
    const y = p.y - h - 22 + Math.sin(now() * 4) * 3;
    ctx.fillStyle = 'rgba(255,70,50,.9)'; ctx.beginPath(); ctx.moveTo(p.x - 7, y - 9); ctx.lineTo(p.x + 7, y - 9); ctx.lineTo(p.x, y); ctx.closePath(); ctx.fill();
  }
  // фаза «Разум»: личинки — люди экипажа; доктор Хейл — чудовище
  function drawLarva(ctx, e, p, drawFig) {
    if (!S || S.phase !== 'mind' || !e.larva || e.state === 'DEAD') return false;
    const f = Object.create(P().find('CHAR-004') || { id: 'CHAR-004' });
    Object.assign(f, { id: 'CHAR-004', x: e.x, y: e.y, facing: e.facing, hx: e.hx, hy: e.hy, moving: e.state === 'CHASE', speed: 2, hidden: false, down: false, dead: false, path: null });
    drawFig(f, p);
    echoMark(ctx, p, 100);
    return true;
  }
  function drawMember(ctx, m, p) {
    if (!S || S.phase !== 'mind' || m.id !== 'CHAR-003' || !img.complete) return false;
    const h = 150, w = img.naturalWidth * (h / img.naturalHeight);
    ctx.save(); ctx.globalAlpha = 0.85 + Math.sin(now() * 5) * 0.1; ctx.translate(p.x, p.y); if ((m.facing || 1) < 0) ctx.scale(-1, 1);
    ctx.filter = 'hue-rotate(-40deg) brightness(0.8)'; ctx.drawImage(img, -w / 2, -h * 0.97, w, h); ctx.filter = 'none'; ctx.restore();
    ctx.font = '600 10px "Share Tech Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(120,255,170,.9)'; ctx.fillText('ЭХО: свой — доктор Хейл', p.x, p.y - h - 8);
    return true;
  }

  return { RULES, tick, update, draw, drawGround, drawLarva, drawMember, chaseStart, nestStart, mindStart, kill, riftOpen, riftClose, state: () => S, end() { setMind(false); hideFinish(); S = null; } };
})();
