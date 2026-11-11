// =====================================================================
// ISO BASE (дополнение №68, переделано в №71). Капсула изнутри: камера держит
// всю капсулу, джойстика нет. Экипажем управляет симуляция базы
// (js/base/base-sim.js): герои ходят по своим работам, а этот модуль только
// показывает их — ставит фигуры туда, где они в симуляции, и включает шаг или
// работу у прибора.
// =====================================================================

AB.IsoBase = (() => {
  let on = false;
  const SECTOR = 'SECTOR-005';
  const PX_PER_TILE = 50;
  const crew = () => [...AB.IsoParty.members(), ...AB.IsoParty.npcs()];

  function start() {
    if (on) return;
    on = true;
    AB.IsoParty.setScene(true);
    AB.IsoRender.focus({ x: 14.5, y: 10.5 });
    document.body.classList.add('in-base');
    AB.Bus.emit('base:view', { on: true });
  }
  function stop() {
    if (!on) return;
    on = false;
    for (const m of crew()) { m.ext = false; }
    for (const m of AB.IsoParty.members()) m.hidden = false;   // в других местах отряд виден, как раньше
    AB.IsoParty.setScene(false);
    AB.IsoRender.focus(null);
    document.body.classList.remove('in-base');
    AB.Bus.emit('base:view', { on: false });
  }
  function update(dt) {
    if (AB.IsoGame.sector() !== SECTOR || AB.IsoOverworld.isOpen()) { if (on && AB.IsoGame.sector() !== SECTOR) stop(); return; }
    if (!on) start();
    if (AB.BaseView) AB.BaseView.frame(dt);
    const sim = AB.BaseSim, S = sim.on() ? sim.state() : null;
    for (const m of crew()) {
      const w = S && S.crew[m.id];
      if (!w || w.away || !S.present.includes(m.id)) { if (S && AB.IsoActs.crew().includes(m.id)) m.hidden = true; continue; }
      m.hidden = false; m.ext = true;
      const dx = w.x - (m.sx ?? m.x), dy = w.y - (m.sy ?? m.y), went = Math.hypot(dx, dy);
      m.sx = w.x; m.sy = w.y;
      // двое на одной клетке — чуть развести, чтобы не рисовались друг в друге
      let ox = 0, oy = 0;
      for (const o of Object.values(S.crew)) if (o !== w && !o.away && Math.hypot(o.x - w.x, o.y - w.y) < 0.35) { const k = o.id < w.id ? 1 : -1; ox += 0.22 * k; oy -= 0.22 * k; }
      m.x = w.x + ox; m.y = w.y + oy;
      m.path = null; m.goal = null;
      m.moving = went > 0.002 && went < 3;
      m.stride = (m.stride || 0) + (m.moving ? went * PX_PER_TILE : 0);
      if (m.moving && Math.abs(dx - dy) > 0.002) m.facing = dx - dy > 0 ? 1 : -1;
      const step = w.task && w.task.steps[w.task.i];
      const busy = step && (step.craft || step.build || step.take || step.put);
      const tr = AB.Anim.current(m.id);
      if (busy) {
        // у прибора — лицом к нему
        const o = step.craft ? sim.dev(step.craft.uid) : step.build ? sim.obj(step.build.uid) : null;
        if (o) { const hx = o.x + o.w / 2 - m.x, hy = o.y + o.h / 2 - m.y; if (Math.abs(hx - hy) > 0.05) m.facing = hx - hy > 0 ? 1 : -1; }
        if (!tr || tr.action !== 'interact' || tr.done) { AB.Anim.play(m.id, 'interact', { restart: true }); m.action = 'interact'; }
      } else {
        const action = m.moving ? 'walk' : 'idle';
        if (m.action !== action || (tr && tr.done && tr.action === 'interact')) { m.action = action; AB.Anim.play(m.id, action); }
      }
    }
  }
  // подпись над героем — чем он занят
  const taskOf = (id) => {
    const S = AB.BaseSim.on() && AB.BaseSim.state(), w = S && S.crew[id];
    if (!w || !w.task) return w && w.why ? `ждёт: ${w.why}` : '';
    return w.task.label;
  };

  return { update, start, stop, active: () => on, taskOf };
})();
