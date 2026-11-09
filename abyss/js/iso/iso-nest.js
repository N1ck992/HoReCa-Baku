// =====================================================================
// ISO NEST (дополнение №50). Испытание «Гнездо» (ARENA-001) в изометрии.
// Решение автора: после того как Марк найдёт настоящее оружие (плазмомёт),
// появляется задание вернуться в гидропонику; спуск туда будит гнездо.
// Правила — как в №44, числа — из js/data/arenas.js:
//   • спуск на склад заклинивает: 3 этапа по stageTime с работы рядом
//     (удар прерывает, сделанное за этап остаётся; ведомому можно поручить);
//   • мутанты (ENEMY-001) волнами из коридоров нижней палубы, чем дальше — тем чаще;
//   • опыт: за мутанта и за этап; уровни 6, 12, 24… — выбор 1 из 3 улучшений;
//   • починили — проход открыт, оставшиеся твари затихают.
// =====================================================================

AB.IsoNest = (() => {
  const ID = 'ARENA-001';
  let A = null, done = false, seq = 0;
  const def = () => AB.ID.get(ID);
  const lay = () => AB.ISO_LAYOUTS['SECTOR-001'].nest;
  const door = () => AB.IsoInteract.doors().find((d) => d.key === lay().door);
  const mod = (k) => (AB.Perks ? AB.Perks.mod(k) : 1);

  // нашли плазмомёт — задание вернуться в гидропонику
  AB.Bus.on('inventory:changed', () => {
    if (done || AB.Quests.active().some((q) => q.id === 'QUEST-005')) return;
    const has = AB.IsoStash.count('ITEM-011') || AB.IsoParty.members().some((m) => { const w = AB.Inventory.weapon(m.id); return w && w.item === 'ITEM-011'; });
    if (has) AB.Quests.start('QUEST-005');
  });
  // спустились в гидропонику с заданием — гнездо просыпается
  AB.Bus.on('room:enter', ({ roomId }) => {
    if (roomId === 'ROOM-013' && !A && !done && AB.Quests.active().some((q) => q.id === 'QUEST-005')) start();
  });

  function start() {
    const d = def();
    A = { t: 0, stage: 0, prog: 0, kills: 0, next: d.waves.first, foes: new Set(), over: false };
    const dr = door();
    dr.state = 'jammed';
    AB.IsoWorld.setDoor(dr.tiles, true);
    AB.IsoStory.fx.shake = 1.0; AB.IsoStory.fx.shakePower = 3;
    AB.Bus.emit('nest:start', { stages: d.goal.stages });
  }

  function spawnWave() {
    const d = def(), w = d.waves, p = Math.min(1, A.t / w.ramp + A.stage * w.stagePressure);
    A.next = w.interval[0] + (w.interval[1] - w.interval[0]) * p;
    const batch = Math.round(w.batch[0] + (w.batch[1] - w.batch[0]) * p);
    for (let i = 0; i < batch && aliveFoes().length < w.maxAlive; i++) {
      const sp = lay().spawns[Math.floor(Math.random() * lay().spawns.length)];
      const id = `${d.enemy}~n${++seq}`;
      const e = AB.IsoEnemies.spawn(id, sp.x + (Math.random() - 0.5), sp.y + (Math.random() - 0.5));
      if (e) { e.state = 'CHASE'; e.target = AB.IsoParty.lead().id; e.homeX = lay().repairAt.x; e.homeY = lay().repairAt.y; A.foes.add(id); }
    }
  }
  const aliveFoes = () => [...A.foes].map((id) => AB.IsoEnemies.get(id)).filter((e) => e && e.state !== 'DEAD');

  // ---------- Починка ----------
  const repairing = new Set();          // кто сейчас чинит
  function canRepair(m) { return A && !A.over && Math.hypot(m.x - lay().repairAt.x, m.y - lay().repairAt.y) < 1.6; }
  function repairTick(dt) {
    let n = 0;
    for (const m of AB.IsoParty.members()) {
      const c = AB.Chars.get(m.id);
      if (!m.repair || !c || c.dead) continue;
      // ведомому поручено — идёт к проходу; дошёл — чинит
      if (!canRepair(m)) { if (!m.path) { m.path = AB.IsoWorld.path(m.x, m.y, lay().repairAt.x, lay().repairAt.y); } continue; }
      if (m.path) continue;
      n++;
      if (m.action !== 'interact') { AB.Anim.play(m.id, 'interact', { restart: true }); m.action = 'interact'; }
    }
    if (!n) return;
    A.prog += (dt * n) / (def().goal.stageTime * mod('repairTime'));
    if (A.prog < 1) return;
    // этап готов: каждый — отдельное действие (ведущий снова нажимает, ведомый продолжает)
    A.prog = 0; A.stage++;
    const l = AB.IsoParty.lead(); if (l.repair) l.repair = false;
    AB.Progress.add(def().xp.stage);
    AB.Bus.emit('nest:stage', { stage: A.stage, stages: def().goal.stages });
    if (A.stage >= def().goal.stages) finish();
  }
  // удар прерывает работу ведущего
  AB.Bus.on('char:hit', ({ charId }) => { const l = AB.IsoParty.lead(); if (A && l && l.id === charId) l.repair = false; });

  function finish() {
    A.over = true;
    for (const e of aliveFoes()) AB.IsoEnemies.damage(e.id, 9999, null);
    const dr = door(); dr.state = 'open';
    AB.IsoWorld.setDoor(dr.tiles, false);
    for (const m of AB.IsoParty.members()) m.repair = false;
    done = true;
    AB.Bus.emit('nest:won', { kills: A.kills });
    setTimeout(() => { A = null; AB.Quests.check(); }, 1500);
  }

  AB.Bus.on('enemy:dead', ({ id }) => { if (A && !A.over && A.foes.has(id)) { A.kills++; AB.Progress.add(def().xp.kill); } });

  function update(dt, input) {
    if (!A) return;
    const l = AB.IsoParty.lead();
    if (l.repair && input && (input.x || input.y || l.path)) l.repair = false;   // ушёл — бросил работу
    if (!A.over) {
      A.t += dt; A.next -= dt;
      if (A.next <= 0) spawnWave();
      repairTick(dt);
    }
    // проход держится закрытым, пока не починен
    const dr = door();
    if (dr && dr.state === 'jammed') { AB.IsoWorld.setDoor(dr.tiles, true); dr.anim = 1; }
  }

  return {
    update, start,
    active: () => !!A && !A.over, state: () => A, isDone: () => done,
    canRepair,
    // ведущий у прохода нажал E — чинить
    repairLead() { const l = AB.IsoParty.lead(); if (!canRepair(l)) return false; AB.IsoParty.stop(); l.repair = true; return true; },
    // поручить ведомому (из окна героя): чинить / снова за ведущим
    order(id, on) { const m = AB.IsoParty.find(id); if (m && A) { m.repair = !!on; m.path = null; AB.Bus.emit('nest:order', { id, on: !!on }); } },
  };
})();
