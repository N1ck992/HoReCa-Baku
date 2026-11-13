// =====================================================================
// ISO NEST (дополнения №50, №57). Испытание «Гнездо» (ARENA-001) — оборона
// оружейной. Решение автора (№57):
//   • как только Марк нашёл наручный терминал (настоящее оружие), из соседней
//     лаборатории ломятся мутанты — их всё больше и больше;
//   • Мира остаётся у главной двери (замок отсека жизнеобеспечения) и взламывает
//     её; пока взламывает — не стреляет, только лечит Марка аурой, если он рядом;
//     если мутант ударит Миру — взлом сбрасывается, начинать заново;
//   • из лаборатории в оружейную — две двери; мутанты их ломают; Марк закрывает
//     и чинит их (со стороны оружейной); выбитую дверь не закрыть — мутанты
//     идут без остановки;
//   • Марк может выйти к мутантам; с каждого убитого падает биоматериал
//     (ITEM-007); принести его Мире — встать на приёмник рядом с ней;
//     набрали нужное — Мира включает турель; турели стреляют сами;
//   • без турелей мутантов становится слишком много — они убивают героев.
// Места — в планировке сектора (nest), числа — здесь, в RULES (черновик).
// =====================================================================

AB.IsoNest = (() => {
  const ID = 'ARENA-001', BIO = 'ITEM-007';
  // черновик чисел: подобраны так, чтобы без турелей не выстоять
  const RULES = {
    hackTime: 85,                         // секунд работы Миры у замка
    doorHp: 170,                          // прочность двери из лаборатории
    repairHp: 70, repairTime: 1.5,        // одна починка Марком: +70 за 1,5 с
    turretCost: 3,                        // самая дешёвая турель (для подписей)
    // №83: биоматериал — типы (ценность в единицах); сколько Марк уносит за раз
    bioTypes: { 'ITEM-007': { name: 'Биоматериал', value: 1 } },
    carryMax: 8,
    // №83: турели — обнаружение, дальность, скорострельность (раз в сек.), урон, прочность, стоимость
    turretTypes: {
      light: { name: 'Лёгкая турель', cost: 3, detect: 9, range: 8, every: 0.45, damage: 15, hp: 110 },
      heavy: { name: 'Тяжёлая турель', cost: 5, detect: 12, range: 11, every: 1.0, damage: 48, hp: 200 },
    },
    waveLen: 16,                          // секунд на волну (номер волны — для игрока)
    brute: { enemy: 'ENEMY-010', from: 3, chance: 0.3 },   // с 3-й волны часть — громилы
    waves: { first: 2, interval: [5, 1.6], batch: [1, 3], alive: [6, 24], ramp: 80 },
  };
  let A = null, done = false, seq = 0;
  const def = () => AB.ID.get(ID);
  const lay = () => (AB.ISO_LAYOUTS[AB.IsoGame.sector()] || {}).nest || AB.ISO_LAYOUTS['SECTOR-003'].nest;
  const doorOf = (key) => AB.IsoInteract.doors().find((d) => d.key === key);
  const mod = (k) => (AB.Perks ? AB.Perks.mod(k) : 1);
  const mira = () => AB.IsoParty.find('CHAR-002');
  const hasTerminal = () => AB.IsoInteract.hasItem('ITEM-011');

  // нашли терминал — сразу начинается оборона (и задание)
  AB.Bus.on('inventory:changed', () => {
    if (done || A || AB.IsoGame.sector() !== 'SECTOR-003' || !hasTerminal()) return;
    if (!AB.Quests.active().some((q) => q.id === 'QUEST-005')) AB.Quests.start('QUEST-005');
    setTimeout(() => { if (!A && !done) start(); }, 1200);
  });

  function start() {
    if (A || done) return;
    const L = lay();
    A = { t: 0, prog: 0, kills: 0, next: RULES.waves.first, foes: new Set(), over: false, bank: 0, turrets: 0, resets: 0, wave: 1,
      tur: L.turrets.map((t) => ({ type: t.type || 'light', on: false, broken: false, hp: 0, fireT: 0, hitT: 0 })) };
    // двери лаборатории захлопываются: решётку ломают (у неё прочность), служебная — просто закрыта
    for (const k of [...L.doors, L.flank].filter(Boolean)) {
      const d = doorOf(k);
      if (L.doors.includes(k)) { d.hp = RULES.doorHp; d.max = RULES.doorHp; d.barricade = true; AB.IsoWorld.setGrate(d.tiles, true); }
      for (const m of [...AB.IsoParty.members(), ...AB.IsoParty.npcs()]) if (d.tiles.some(([x, y]) => Math.floor(m.x) === x && Math.floor(m.y) === y)) { m.x += 1.2; m.path = null; }
      d.state = 'closed';
    }
    // Мира идёт к замку и взламывает
    const m = mira(); if (m) { m.repair = true; m.flee = false; m.path = null; }
    AB.IsoStory.fx.shake = 1.0; AB.IsoStory.fx.shakePower = 3;
    AB.Bus.emit('nest:start', {});
  }

  // ---------- волны ----------
  function spawnWave() {
    const w = RULES.waves, p = Math.min(1, A.t / w.ramp), L = lay();
    A.next = w.interval[0] + (w.interval[1] - w.interval[0]) * p;
    const batch = Math.round(w.batch[0] + (w.batch[1] - w.batch[0]) * p), cap = Math.round(w.alive[0] + (w.alive[1] - w.alive[0]) * Math.min(1, A.t / (w.ramp * 1.3)));
    for (let i = 0; i < batch && aliveFoes().length < cap; i++) {
      const sp = L.spawns[Math.floor(Math.random() * L.spawns.length)];
      const B = RULES.brute, brute = A.wave >= B.from && Math.random() < B.chance;
      const id = `${brute ? B.enemy : def().enemy}~n${++seq}`;
      const e = AB.IsoEnemies.spawn(id, sp.x + (Math.random() - 0.5), sp.y + (Math.random() - 0.5));
      if (!e) continue;
      // половина идёт за Мирой, половина — за Марком; дорогу знают и сквозь двери
      e.nest = true; e.state = 'CHASE'; e.target = seq % 2 && mira() ? 'CHAR-002' : 'CHAR-001';
      A.foes.add(id);
    }
  }
  const aliveFoes = () => [...A.foes].map((id) => AB.IsoEnemies.get(id)).filter((e) => e && e.state !== 'DEAD');

  // ---------- двери лаборатории ----------
  // куда идти ломать: ближайшая закрытая дверь, к её стороне лаборатории
  function breach(e) {
    if (!A || A.over) return null;
    let best = null, bd = 1e9;
    for (const k of lay().doors) {
      const d = doorOf(k);
      if (!d || d.state !== 'closed') continue;
      const n = d.tiles.length, cx = d.tiles.reduce((a, t) => a + t[0], 0) / n + 0.5, cy = d.tiles.reduce((a, t) => a + t[1], 0) / n + 0.5;
      const side = e.x < cx ? -1 : 1, p = { x: cx + side * 0.95, y: cy, key: k };
      const dist = Math.hypot(p.x - e.x, p.y - e.y);
      if (dist < bd) { bd = dist; best = p; }
    }
    return best;
  }
  function hitDoor(key, amount) {
    const d = doorOf(key);
    if (!d || d.state !== 'closed') return;
    d.hp = Math.max(0, d.hp - amount);
    d.hitT = 0.25;
    if (d.hp <= 0) {
      d.state = 'broken';
      AB.IsoWorld.setDoor(d.tiles, false);
      AB.IsoStory.fx.shake = 0.5; AB.IsoStory.fx.shakePower = 2;
      AB.Bus.emit('nest:breach', { key });
    }
  }
  function repairDoor(key) {
    const d = doorOf(key);
    if (!d || d.state === 'broken') return;
    d.hp = Math.min(d.max, d.hp + RULES.repairHp * (1 / mod('repairTime')));
  }

  // ---------- биоматериал и турели ----------
  AB.Bus.on('enemy:dead', ({ id }) => {
    if (!A || A.over || !A.foes.has(id)) return;
    A.kills++; AB.Progress.add(def().xp.kill);
    const e = AB.IsoEnemies.get(id), n = (AB.ID.get(id) || {}).bio || 1;
    if (e) AB.IsoInteract.dropAt(AB.IsoWorld.room(e.x, e.y), BIO, n, e.x, e.y);
  });
  // №83: панель Миры — включить турель за биоматериал (или снова запустить разрушенную)
  const tt = (i) => RULES.turretTypes[A.tur[i].type];
  function activate(i) {
    if (!A || A.over) return { ok: false, why: 'Оборона не идёт' };
    const t = A.tur[i]; if (!t) return { ok: false, why: 'Нет такой турели' };
    if (t.on) return { ok: false, why: 'Уже работает' };
    const c = tt(i).cost;
    if (A.bank < c) return { ok: false, why: `У Миры ${A.bank} био, нужно ${c}` };
    A.bank -= c; t.on = true; t.broken = false; t.hp = tt(i).hp; t.fireT = 0.3;
    A.turrets = A.tur.filter((q) => q.on).length;
    AB.Bus.emit('nest:turret', { n: A.turrets, of: A.tur.length, i, name: tt(i).name });
    return { ok: true };
  }
  // кого из турелей бить мутанту: громила — ближнюю работающую; обычный — если она рядом и ближе героя
  function turretTarget(e, tg) {
    if (!A || A.over) return null;
    const L = lay(), brute = (AB.ID.get(e.id) || {}).brute;
    let best = null, bd = 1e9;
    A.tur.forEach((t, i) => {
      if (!t.on) return;
      const p = { x: L.turrets[i].x + 0.5, y: L.turrets[i].y + 0.5, i }, d = Math.hypot(p.x - e.x, p.y - e.y);
      if (!brute && (d > 2.5 || (tg && Math.hypot(tg.x - e.x, tg.y - e.y) < d))) return;
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  }
  function hitTurret(i, amount) {
    const t = A && A.tur[i]; if (!t || !t.on) return;
    t.hp = Math.max(0, t.hp - amount); t.hitT = 0.25;
    if (t.hp <= 0) { t.on = false; t.broken = true; A.turrets = A.tur.filter((q) => q.on).length; AB.Bus.emit('nest:turretDown', { i, name: tt(i).name }); }
  }
  function bioTick() {
    const l = AB.IsoParty.lead(), L = lay();
    // подобрать биоматериал, просто пройдя рядом (Марк несёт не больше carryMax)
    for (const t of AB.IsoInteract.targets()) {
      if (t.kind === 'item' && RULES.bioTypes[t.ref.item] && Math.hypot(t.x - l.x, t.y - l.y) < 0.9) {
        if (AB.IsoStash.count(t.ref.item) >= RULES.carryMax) { if (!A.fullSaid) { A.fullSaid = true; AB.Bus.emit('nest:full', {}); } continue; }
        AB.IsoInteract.act(t); A.fullSaid = false;
      }
    }
    // передать Мире: подойти к ней (или встать на приёмник у замка)
    const m = mira(), near = (m && Math.hypot(l.x - m.x, l.y - m.y) < 1.7) || Math.hypot(l.x - L.pad.x, l.y - L.pad.y) < 0.75;
    let n = 0;
    for (const [item, bt] of Object.entries(RULES.bioTypes)) { const k = AB.IsoStash.count(item); if (k && near) { AB.IsoStash.remove(item, k); n += k * bt.value; } }
    if (n) { A.bank += n; AB.Bus.emit('nest:bio', { n, bank: A.bank }); }
  }
  function turretTick(dt) {
    const L = lay();
    for (let i = 0; i < A.tur.length; i++) {
      const t = A.tur[i], T = tt(i);
      t.hitT = Math.max(0, t.hitT - dt);
      if (!t.on) continue;
      t.fireT -= dt;
      if (t.fireT > 0) continue;
      const tp = { x: L.turrets[i].x + 0.5, y: L.turrets[i].y + 0.5 };
      // замечает в радиусе обнаружения, стреляет в пределах дальности
      let best = null, bd = T.detect;
      for (const e of aliveFoes()) { const d = Math.hypot(e.x - tp.x, e.y - tp.y); if (d < bd && AB.IsoWorld.see(tp.x, tp.y, e.x, e.y, 0.05)) { bd = d; best = e; } }
      t.aim = best ? best.id : null;
      if (!best || bd > T.range) { t.fireT = 0.2; continue; }
      t.fireT = T.every;
      AB.IsoEnemies.damage(best.id, T.damage, null, 'ranged');
      AB.Bus.emit('iso:shot', { from: { x: tp.x, y: tp.y - 0.4 }, to: { x: best.x, y: best.y }, landed: true, energy: true });
    }
  }

  // ---------- взлом (Мира) ----------
  const atLock = (m) => !!m && Math.hypot(m.x - lay().repairAt.x, m.y - lay().repairAt.y) < 1.4;
  function hackTick(dt) {
    const m = mira(), c = m && AB.Chars.get(m.id);
    if (!m || !c || c.dead || !m.repair) return;
    if (!atLock(m)) { if (!m.path) m.path = AB.IsoWorld.path(m.x, m.y, lay().repairAt.x, lay().repairAt.y); return; }
    if (m.path) return;
    if (m.action !== 'interact') { AB.Anim.play(m.id, 'interact', { restart: true }); m.action = 'interact'; }
    A.prog = Math.min(1, A.prog + dt / (RULES.hackTime * mod('repairTime')));
    if (A.prog >= 1) finish();
  }
  // мутант ударил Миру — взлом сбрасывается
  AB.Bus.on('char:hit', ({ charId }) => {
    if (!A || A.over || charId !== 'CHAR-002' || !mira() || !mira().repair) return;
    if (A.prog > 0.02) { A.prog = 0; A.resets++; AB.Bus.emit('nest:reset', {}); }
  });

  function finish() {
    A.over = true;
    for (const e of aliveFoes()) AB.IsoEnemies.damage(e.id, 9999, null);
    for (const k of lay().doors) { const d = doorOf(k); d.barricade = false; AB.IsoWorld.setGrate(d.tiles, false); if (d.state === 'closed') d.state = 'open'; }
    const dr = doorOf(lay().door); dr.state = 'open'; dr.hacked = true;
    AB.IsoWorld.setDoor(dr.tiles, false);
    for (const m of AB.IsoParty.members()) m.repair = false;
    AB.Progress.add(def().xp.stage * 3);
    done = true;
    AB.Bus.emit('nest:won', { kills: A.kills });
    setTimeout(() => { A = null; AB.Quests.check(); }, 1500);
  }

  // дверь сейчас ломают: мутант вплотную к ней
  function underAttack(d) {
    const n = d.tiles.length, cx = d.tiles.reduce((a, t) => a + t[0], 0) / n + 0.5, cy = d.tiles.reduce((a, t) => a + t[1], 0) / n + 0.5;
    return AB.IsoEnemies.alive().some((e) => e.state !== 'DEAD' && Math.hypot(e.x - cx, e.y - cy) < 1.7);
  }
  // служебная дверь закрывается сама, когда рядом никого из отряда (и в проёме нет мутанта)
  function flankTick() {
    const d = lay().flank && doorOf(lay().flank);
    if (!d || d.state !== 'open') return;
    const n = d.tiles.length, cx = d.tiles.reduce((a, t) => a + t[0], 0) / n + 0.5, cy = d.tiles.reduce((a, t) => a + t[1], 0) / n + 0.5;
    const near = (m) => Math.hypot(m.x - cx, m.y - cy) < 1.8;
    if (AB.IsoParty.members().some(near) || AB.IsoEnemies.alive().some(near)) return;
    d.state = 'closed';
    AB.Bus.emit('iso:door', { key: d.key, state: 'closed', name: d.def.name });
  }

  function update(dt) {
    if (!A) return;
    for (const k of lay().doors) { const d = doorOf(k); if (d && d.hitT) d.hitT = Math.max(0, d.hitT - dt); }
    if (!A.over) flankTick();
    if (A.over) return;
    A.t += dt; A.next -= dt;
    const w = 1 + Math.floor(A.t / RULES.waveLen);
    if (w !== A.wave) { A.wave = w; AB.Bus.emit('nest:wave', { n: w }); }
    if (A.next <= 0) spawnWave();
    hackTick(dt);
    bioTick();
    turretTick(dt);
  }

  return {
    update, start, breach, hitDoor, repairDoor, underAttack, RULES, activate, turretTarget, hitTurret,
    markDone() { done = true; },   // контрольная точка после обороны (iso-game.js)
    config: () => lay() || {},
    active: () => !!A && !A.over, state: () => A, isDone: () => done,
    canRepair: atLock,
    repairLead() { return false; },
    // поручить ведомому (из окна героя): взламывать / снова за ведущим
    order(id, on) { const m = AB.IsoParty.find(id); if (m && A) { m.repair = !!on; m.path = null; AB.Bus.emit('nest:order', { id, on: !!on }); } },
  };
})();
