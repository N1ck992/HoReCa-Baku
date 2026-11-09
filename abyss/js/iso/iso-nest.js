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
    turretCost: 4,                        // биоматериала на одну турель
    turret: { damage: 34, every: 0.75, range: 10 },
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
    A = { t: 0, prog: 0, kills: 0, next: RULES.waves.first, foes: new Set(), over: false, bank: 0, turrets: 0, resets: 0, fireT: L.turrets.map(() => 0) };
    // двери лаборатории захлопываются; у каждой — прочность
    for (const k of L.doors) {
      const d = doorOf(k);
      d.hp = RULES.doorHp; d.max = RULES.doorHp; d.barricade = true;
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
      const id = `${def().enemy}~n${++seq}`;
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
    const e = AB.IsoEnemies.get(id);
    if (e) AB.IsoInteract.dropAt(AB.IsoWorld.room(e.x, e.y), BIO, 1, e.x, e.y);
  });
  function bioTick() {
    const l = AB.IsoParty.lead(), L = lay();
    // подобрать биоматериал, просто пройдя рядом
    for (const t of AB.IsoInteract.targets()) {
      if (t.kind === 'item' && t.ref.item === BIO && Math.hypot(t.x - l.x, t.y - l.y) < 0.9) AB.IsoInteract.act(t);
    }
    // приёмник у Миры: встал — весь биоматериал ей
    const n = AB.IsoStash.count(BIO);
    if (n && Math.hypot(l.x - L.pad.x, l.y - L.pad.y) < 0.75) {
      AB.IsoStash.remove(BIO, n);
      A.bank += n;
      AB.Bus.emit('nest:bio', { n, bank: A.bank });
      while (A.turrets < L.turrets.length && A.bank >= RULES.turretCost) {
        A.bank -= RULES.turretCost; A.turrets++;
        AB.Bus.emit('nest:turret', { n: A.turrets, of: L.turrets.length });
      }
    }
  }
  function turretTick(dt) {
    const L = lay(), T = RULES.turret;
    for (let i = 0; i < A.turrets; i++) {
      A.fireT[i] -= dt;
      if (A.fireT[i] > 0) continue;
      const tp = { x: L.turrets[i].x + 0.5, y: L.turrets[i].y + 0.5 };
      let best = null, bd = T.range;
      for (const e of aliveFoes()) { const d = Math.hypot(e.x - tp.x, e.y - tp.y); if (d < bd && AB.IsoWorld.clear(tp.x, tp.y, e.x, e.y, 0.05)) { bd = d; best = e; } }
      if (!best) { A.fireT[i] = 0.2; continue; }
      A.fireT[i] = T.every;
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
    const dr = doorOf(lay().door); dr.state = 'open'; dr.hacked = true;
    AB.IsoWorld.setDoor(dr.tiles, false);
    for (const m of AB.IsoParty.members()) m.repair = false;
    AB.Progress.add(def().xp.stage * 3);
    done = true;
    AB.Bus.emit('nest:won', { kills: A.kills });
    setTimeout(() => { A = null; AB.Quests.check(); }, 1500);
  }

  function update(dt) {
    if (!A) return;
    for (const k of lay().doors) { const d = doorOf(k); if (d && d.hitT) d.hitT = Math.max(0, d.hitT - dt); }
    if (A.over) return;
    A.t += dt; A.next -= dt;
    if (A.next <= 0) spawnWave();
    hackTick(dt);
    bioTick();
    turretTick(dt);
  }

  return {
    update, start, breach, hitDoor, repairDoor, RULES,
    config: () => lay() || {},
    active: () => !!A && !A.over, state: () => A, isDone: () => done,
    canRepair: atLock,
    repairLead() { return false; },
    // поручить ведомому (из окна героя): взламывать / снова за ведущим
    order(id, on) { const m = AB.IsoParty.find(id); if (m && A) { m.repair = !!on; m.path = null; AB.Bus.emit('nest:order', { id, on: !!on }); } },
  };
})();
