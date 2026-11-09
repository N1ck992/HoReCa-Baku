// =====================================================================
// ISO BOSS (дополнение №57). Колосс (ENEMY-003) — та же механика, что в
// обороне оружейной: стрелять и бегать мало — броню почти не пробить
// (урон от отряда ×0,1). В зале две пушки. Из баков лезет выводок мутантов;
// с каждого — биоматериал. Встать с биоматериалом на приёмник у пушки —
// она оживает и бьёт по Колоссу. Места — в планировке сектора (boss).
// =====================================================================

AB.IsoBoss = (() => {
  const BIO = 'ITEM-007';
  const RULES = { cannon: { damage: 40, every: 1.2, range: 30 }, brood: { every: 9, alive: 3, first: 4 } };
  let B = null, seq = 0;
  const lay = () => (AB.ISO_LAYOUTS[AB.IsoGame.sector()] || {}).boss;
  const boss = () => { const L = lay(); return L && AB.IsoEnemies.get(L.enemy); };
  const fighting = () => { const e = boss(); return !!e && !['DORMANT', 'DEAD'].includes(e.state) && !e.story; };

  function begin() {
    const L = lay();
    B = { bank: L.cannons.map(() => 0), on: L.cannons.map(() => false), fireT: L.cannons.map(() => 0), next: RULES.brood.first, brood: new Set() };
    AB.Bus.emit('boss:start', {});
  }

  // урон Колоссу от отряда — почти ничего; от пушек (from = null) — полностью
  function mod(e, from) {
    const L = lay();
    if (!L || e.id !== L.enemy || !from) return 1;
    return L.armor;
  }

  AB.Bus.on('enemy:dead', ({ id }) => {
    if (!B) return;
    if (B.brood.has(id)) {
      const e = AB.IsoEnemies.get(id);
      if (e) AB.IsoInteract.dropAt(AB.IsoWorld.room(e.x, e.y), BIO, 1, e.x, e.y);
    }
    const L = lay();
    if (L && id === L.enemy) { for (const b of B.brood) { const e = AB.IsoEnemies.get(b); if (e && e.state !== 'DEAD') AB.IsoEnemies.damage(b, 9999, null); } B = null; AB.Bus.emit('boss:won', {}); }
  });

  function update(dt) {
    if (!B) { if (fighting()) begin(); return; }
    if (!fighting()) return;
    const L = lay(), l = AB.IsoParty.lead();
    // выводок из баков
    B.next -= dt;
    const alive = [...B.brood].filter((id) => { const e = AB.IsoEnemies.get(id); return e && e.state !== 'DEAD'; });
    if (B.next <= 0) {
      B.next = RULES.brood.every;
      if (alive.length < RULES.brood.alive) {
        const sp = L.spawns[seq % L.spawns.length], id = `ENEMY-001~b${++seq}`;
        const e = AB.IsoEnemies.spawn(id, sp.x, sp.y);
        if (e) { e.state = 'CHASE'; e.target = 'CHAR-001'; e.nest = true; B.brood.add(id); }
      }
    }
    // подобрать биоматериал рядом
    for (const t of AB.IsoInteract.targets()) if (t.kind === 'item' && t.ref.item === BIO && Math.hypot(t.x - l.x, t.y - l.y) < 0.9) AB.IsoInteract.act(t);
    // приёмники у пушек
    L.cannons.forEach((c, i) => {
      if (B.on[i]) return;
      const n = AB.IsoStash.count(BIO);
      if (!n || Math.hypot(l.x - c.pad.x, l.y - c.pad.y) > 0.75) return;
      const put = Math.min(n, L.cost - B.bank[i]);
      AB.IsoStash.remove(BIO, put); B.bank[i] += put;
      if (B.bank[i] >= L.cost) { B.on[i] = true; AB.Bus.emit('boss:cannon', { n: B.on.filter(Boolean).length, of: L.cannons.length }); }
      else AB.Bus.emit('boss:bio', { i, bank: B.bank[i], cost: L.cost });
    });
    // пушки бьют по Колоссу (если не видно — по выводку)
    const col = boss();
    L.cannons.forEach((c, i) => {
      if (!B || !B.on[i]) return;                 // Колосс мог погибнуть от прошлого выстрела
      B.fireT[i] -= dt;
      if (B.fireT[i] > 0) return;
      const p = { x: c.x + 0.5, y: c.y + 0.5 };
      // Колосс выше баков — тяжёлые пушки достают его поверх них; выводок — только по прямой
      let tgt = col && col.state !== 'DEAD' && Math.hypot(col.x - p.x, col.y - p.y) < RULES.cannon.range ? col : null;
      if (!tgt) tgt = alive.map((id) => AB.IsoEnemies.get(id)).find((e) => AB.IsoWorld.clear(p.x, p.y, e.x, e.y, 0.05)) || null;
      if (!tgt) { B.fireT[i] = 0.3; return; }
      B.fireT[i] = RULES.cannon.every;
      AB.IsoEnemies.damage(tgt.id, RULES.cannon.damage, null, 'ranged');
      AB.Bus.emit('iso:shot', { from: { x: p.x, y: p.y - 0.6 }, to: { x: tgt.x, y: tgt.y }, landed: true, energy: true });
      AB.IsoStory.fx.shake = Math.max(AB.IsoStory.fx.shake, 0.15); AB.IsoStory.fx.shakePower = 1.5;
    });
  }

  return { update, mod, RULES, state: () => B, config: lay, active: () => !!B };
})();
