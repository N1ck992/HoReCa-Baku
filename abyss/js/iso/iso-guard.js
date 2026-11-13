// =====================================================================
// ISO GUARD (дополнение №86). Задание между актами II и III: Мира у пульта
// стыковки настраивает капсулу к отплытию, а из воды в доке нижнего ангара
// лезут мутанты и громилы. Марк (и дрон ЭХО с цепной молнией) защищает её.
// Пока Мира работает — не стреляет. Удар по Мире откатывает настройку назад
// (не до нуля, но заметно). Без турелей и без передышки — сложнее обороны
// оружейной. Числа — черновик.
// =====================================================================

AB.IsoGuard = (() => {
  const RULES = {
    time: 70,                               // секунд работы Миры у пульта
    hitBack: 0.12,                          // удар по Мире — минус 12% настройки
    at: { x: 79.5, y: 46.6 },               // где стоит Мира (у пульта стыковки)
    spawns: [{ x: 63.5, y: 55.5 }, { x: 70.5, y: 56.3 }, { x: 77.5, y: 56.3 }, { x: 85.0, y: 50.5 }, { x: 63.0, y: 47.5 }],
    waves: { first: 3, interval: [6, 3.2], batch: [1, 2], alive: [3, 8], ramp: 70 },
    brute: { enemy: 'ENEMY-010', from: 25, chance: 0.25 },
    waveLen: 15,
  };
  let G = null, done = false, seq = 0;
  const mira = () => AB.IsoParty.find('CHAR-002');
  const alive = () => [...G.foes].map((id) => AB.IsoEnemies.get(id)).filter((e) => e && e.state !== 'DEAD');

  function start() {
    if (G || done) return;
    G = { t: 0, prog: 0, next: RULES.waves.first, foes: new Set(), wave: 1, hits: 0 };
    const m = mira(); if (m) { m.repair = true; m.flee = false; m.path = null; }
    AB.IsoStory.fx.shake = 1.0; AB.IsoStory.fx.shakePower = 3;
    AB.Bus.emit('guard:start', {});
    if (AB.IsoCompanion && AB.IsoCompanion.has()) setTimeout(() => AB.IsoCompanion.say(null, 'Они лезут из воды в доке! Держись между ними и Мирой — я буду бить цепной молнией.'), 1200);
  }
  function spawn() {
    const w = RULES.waves, p = Math.min(1, G.t / w.ramp);
    G.next = w.interval[0] + (w.interval[1] - w.interval[0]) * p;
    const batch = Math.round(w.batch[0] + (w.batch[1] - w.batch[0]) * p), cap = Math.round(w.alive[0] + (w.alive[1] - w.alive[0]) * p);
    for (let i = 0; i < batch && alive().length < cap; i++) {
      const sp = RULES.spawns[Math.floor(Math.random() * RULES.spawns.length)];
      const brute = G.t >= RULES.brute.from && Math.random() < RULES.brute.chance;
      const id = `${brute ? RULES.brute.enemy : 'ENEMY-001'}~g${++seq}`;
      const e = AB.IsoEnemies.spawn(id, sp.x + (Math.random() - 0.5), sp.y + (Math.random() - 0.5) * 0.6);
      if (!e) continue;
      // большинство идут к Мире — её и надо прикрывать
      e.nest = true; e.state = 'CHASE'; e.target = seq % 2 ? 'CHAR-002' : 'CHAR-001';
      G.foes.add(id);
    }
  }
  AB.Bus.on('enemy:dead', ({ id }) => { if (G && G.foes.has(id)) { G.kills = (G.kills || 0) + 1; AB.Progress && AB.Progress.add(3); } });
  AB.Bus.on('char:hit', ({ charId }) => {
    if (!G || charId !== 'CHAR-002' || G.prog <= 0) return;
    G.prog = Math.max(0, G.prog - RULES.hitBack); G.hits++;
    AB.Bus.emit('guard:hit', { prog: G.prog });
  });
  function update(dt) {
    if (!G) return;
    const m = mira(), c = m && AB.Chars.get(m.id);
    if (!m || !c || c.dead) return;
    G.t += dt; G.next -= dt;
    const w = 1 + Math.floor(G.t / RULES.waveLen);
    if (w !== G.wave) { G.wave = w; AB.Bus.emit('guard:wave', { n: w, brutes: G.t >= RULES.brute.from }); }
    if (G.next <= 0) spawn();
    // Мира идёт к пульту и работает
    const at = Math.hypot(m.x - RULES.at.x, m.y - RULES.at.y) < 1.2;
    if (!at) { m.repair = true; if (!m.path) m.path = AB.IsoWorld.path(m.x, m.y, RULES.at.x, RULES.at.y); return; }
    if (m.path) return;
    if (m.action !== 'interact') { AB.Anim.play(m.id, 'interact', { restart: true }); m.action = 'interact'; }
    G.prog = Math.min(1, G.prog + dt / RULES.time);
    if (G.prog >= 1) finish();
  }
  function finish() {
    for (const e of alive()) AB.IsoEnemies.damage(e.id, 9999, null);
    const m = mira(); if (m) m.repair = false;
    done = true;
    const st = { kills: G.kills || 0, hits: G.hits };
    G = null;
    AB.Bus.emit('guard:won', st);
    // капсула готова — отстыковка (EVENT-022 запускается от пульта)
    setTimeout(() => AB.Equip.apply('EQUIP-014', 'CHAR-001'), 600);
  }
  return { start, update, RULES, state: () => G, isDone: () => done, markDone() { done = true; } };
})();

// пульт стыковки: сначала Мира настраивает капсулу (оборона), потом — отстыковка
AB.EQUIP_EXTRA = { ...(AB.EQUIP_EXTRA || {}), 'EQUIP-014': { guard: true, text: { ready: 'Мира: настроить капсулу к отплытию — прикрой её', missing: 'Сначала — реактор капсулы', done: 'Капсула отстыкована' } } };
