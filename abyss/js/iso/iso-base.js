// =====================================================================
// ISO BASE (дополнение №68). Жизнь внутри базы-капсулы: экипаж занят делами —
// ходит между постами (пульт, шкафчики, стол, гнёзда модулей, стойка костюма)
// и работает там; управление базой — нажатием на приборы, без подбегания
// (iso-interact.js); камера держит всю капсулу, джойстика нет.
// =====================================================================

AB.IsoBase = (() => {
  let on = false, t = 0;
  const SECTOR = 'SECTOR-005';
  // посты: где стоять, куда смотреть, чем занят (подпись над головой)
  const SPOTS = [
    { x: 4.5, y: 5.6, task: 'у пульта', work: true },
    { x: 12.0, y: 10.3, task: 'разбирает шкафчики', work: true },
    { x: 15.5, y: 5.4, task: 'за столом', work: false },
    { x: 12.5, y: 13.4, task: 'у гнезда модуля', work: true },
    { x: 16.5, y: 13.4, task: 'у гнезда модуля', work: true },
    { x: 24.5, y: 6.6, task: 'чинит экзокостюм', work: true },
    { x: 19.5, y: 7.6, task: 'отдыхает', work: false },
    { x: 7.0, y: 8.4, task: 'смотрит в иллюминатор', work: false },
  ];
  const jobs = new Map();          // id → { spot, next, animT }
  const crew = () => [...AB.IsoParty.members(), ...AB.IsoParty.npcs()].filter((m) => !m.hidden);

  function start() {
    if (on) return;
    on = true; t = 0; jobs.clear();
    AB.IsoParty.setScene(true);
    AB.IsoRender.focus({ x: 14.5, y: 10.5 });
    document.body.classList.add('in-base');
    crew().forEach((m, i) => assign(m, i));
  }
  function stop() {
    if (!on) return;
    on = false; jobs.clear();
    AB.IsoParty.setScene(false);
    AB.IsoRender.focus(null);
    document.body.classList.remove('in-base');
  }
  function assign(m, hint) {
    const taken = new Set([...jobs.values()].map((j) => j.spot));
    let i = hint != null && !taken.has(hint % SPOTS.length) ? hint % SPOTS.length : -1;
    if (i < 0) { const free = SPOTS.map((_, k) => k).filter((k) => !taken.has(k) && (!jobs.get(m.id) || jobs.get(m.id).spot !== k)); i = free[Math.floor(Math.random() * free.length)] ?? 0; }
    jobs.set(m.id, { spot: i, next: t + 10 + Math.random() * 8, animT: 0 });
    const s = SPOTS[i];
    AB.IsoParty.walkTo(m.id, s.x, s.y, 1.6);
  }
  function update(dt) {
    if (AB.IsoGame.sector() !== SECTOR || AB.IsoOverworld.isOpen()) { if (on && AB.IsoGame.sector() !== SECTOR) stop(); return; }
    if (!on) start();
    t += dt;
    for (const m of crew()) {
      const j = jobs.get(m.id);
      if (!j) { assign(m); continue; }
      if (m.path) continue;
      const s = SPOTS[j.spot];
      // на посту: работает (повторяющееся действие) или просто стоит
      j.animT -= dt;
      if (s.work && j.animT <= 0) { AB.Anim.play(m.id, 'interact', { restart: true }); j.animT = 2.2 + Math.random(); }
      if (t >= j.next) assign(m);
    }
  }
  const taskOf = (id) => { const j = jobs.get(id); return j ? SPOTS[j.spot].task : ''; };

  return { update, start, stop, active: () => on, taskOf };
})();
