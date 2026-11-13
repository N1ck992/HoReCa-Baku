// =====================================================================
// ISO CROWD (дополнение №98). Никто не стоит в одной точке: герои, спутники,
// неигровые персонажи и монстры расталкиваются, если их «тела» перекрываются.
// У каждого — радиус тела и «вес»: лёгкого сдвигает сильнее, тяжёлого (босс,
// громила) почти не сдвинуть; спящие и сюжетные — неподвижны, их обходят.
// Сдвиг идёт через проверку стен (AB.IsoWorld.move), сквозь стену не вытолкнет.
// =====================================================================

AB.IsoCrowd = (() => {
  const RULES = {
    human: { r: 0.3, mass: 1 },          // герои и неигровые персонажи
    lead: { mass: 1.6 },                 // ведущий (им управляет игрок) — сдвигается меньше
    busy: { mass: 6 },                   // занят делом (Мира у пульта) — почти не сдвинуть
    enemy: { r: 0.32, mass: 1 },
    byType: { boss: { r: 0.9, mass: 12 }, pursuer: { r: 0.32, mass: 1.4 } },
    byId: { 'ENEMY-010': { r: 0.45, mass: 3 }, 'ENEMY-009': { r: 0.8, mass: 10 } },   // громила, исполин
    stiffness: 12,                       // как быстро расходятся (доля перекрытия в секунду)
  };
  const W = () => AB.IsoWorld;

  function bodies() {
    const out = [], lead = AB.IsoParty.lead();
    const alive = (id) => { const c = AB.Chars.get(id); return !c || !c.dead; };
    for (const m of AB.IsoParty.members()) {
      if (m.hidden || m.ext || !alive(m.id)) continue;
      out.push({ o: m, r: RULES.human.r, mass: m.repair ? RULES.busy.mass : m === lead ? RULES.lead.mass : RULES.human.mass });
    }
    for (const m of AB.IsoParty.npcs()) {
      if (m.hidden || !alive(m.id)) continue;
      out.push({ o: m, r: RULES.human.r, mass: m.repair ? RULES.busy.mass : RULES.human.mass });
    }
    for (const e of AB.IsoEnemies.all()) {
      if (e.state === 'DEAD') continue;
      const d = AB.ID.get(e.id.split('~')[0]) || {}, t = RULES.byId[d.id] || RULES.byType[d.type] || RULES.enemy;
      const fixed = e.story || e.state === 'DORMANT' || e.state === 'APPEAR';
      out.push({ o: e, r: t.r, mass: fixed ? Infinity : t.mass });
    }
    return out;
  }

  function update(dt) {
    if (!AB.IsoParty.members().length) return;
    const B = bodies(), k = Math.min(1, dt * RULES.stiffness);
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      if (a.mass === Infinity && b.mass === Infinity) continue;
      let dx = b.o.x - a.o.x, dy = b.o.y - a.o.y, d = Math.hypot(dx, dy);
      const need = a.r + b.r;
      if (d >= need) continue;
      if (d < 1e-4) { const ang = (i * 2.4 + j) % 6.283; dx = Math.cos(ang); dy = Math.sin(ang); d = 1e-4; }   // ровно в одной точке — развести в какую-нибудь сторону
      const push = (need - d) * k, nx = dx / d, ny = dy / d;
      // доли сдвига — обратно весу: тяжёлый почти стоит, лёгкий отходит
      const ia = a.mass === Infinity ? 0 : 1 / a.mass, ib = b.mass === Infinity ? 0 : 1 / b.mass, s = ia + ib;
      if (ia) W().move(a.o, -nx * push * ia / s, -ny * push * ia / s);
      if (ib) W().move(b.o, nx * push * ib / s, ny * push * ib / s);
    }
  }
  // для проверок: самая маленькая дистанция между телами сейчас
  function minGap() {
    const B = bodies(); let best = Infinity, pair = null;
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const d = Math.hypot(B[i].o.x - B[j].o.x, B[i].o.y - B[j].o.y) - B[i].r - B[j].r;
      if (d < best) { best = d; pair = [B[i].o.id, B[j].o.id]; }
    }
    return { gap: best, pair };
  }
  return { update, minGap, RULES };
})();
