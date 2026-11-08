// =====================================================================
// ISO PARTY (этап 1 изометрии, дополнение №45). Отряд в изометрической
// сцене: до пяти персонажей, игрок управляет одним (ведущим), остальные
// идут следом по своим местам строя, обходя препятствия и не сбиваясь в кучу.
// Персонажи — существующие (CHAR-*), скорость — из их stats (без новых
// характеристик): 50 единиц вида сбоку = 1 клетка.
// =====================================================================

AB.IsoParty = (() => {
  const MAX = 5;
  const PX_PER_TILE = 50;
  const W = () => AB.IsoWorld;
  let members = [];
  let leader = 0;

  function init(list) {
    members = list.slice(0, MAX).map((p) => {
      const def = AB.ID.get(p.id);
      return {
        id: p.id, x: p.x, y: p.y, hx: 1, hy: 0,          // hx/hy — куда смотрит (направление в мире)
        appearance: def.appearances ? def.appearances[0] : null,
        facing: 1, stride: 0, equipped: null, hidden: false,
        path: null, goal: null, replanT: 0, moving: false, speed: 0, run: true,
      };
    });
    leader = 0;
    for (const m of members) {
      // стоит в стене или в предмете — на ближайшее свободное место
      if (!W().free(m.x, m.y)) { const n = W().nearestFree(m.x, m.y); if (n) { m.x = n.x + 0.5; m.y = n.y + 0.5; } }
      AB.Anim.play(m.id, 'idle');
    }
    AB.Bus.emit('iso:party', { leader: lead().id });
  }

  const lead = () => members[leader];
  const speedOf = (m, run) => { const st = AB.ID.get(m.id).stats; return (run ? st.runSpeed : st.speed) / PX_PER_TILE; };

  // ведущему: идти к точке (путь в обход препятствий)
  function goTo(x, y) {
    const l = lead();
    const p = W().path(l.x, l.y, x, y);
    l.path = p && p.length ? p : null;
    l.goal = l.path ? l.path[l.path.length - 1] : null;
    return !!l.path;
  }
  function stop() { const l = lead(); l.path = null; l.goal = null; }

  function setLeader(i) {
    if (i < 0 || i >= members.length || i === leader) return false;
    const old = lead();
    old.path = null; old.goal = null;
    leader = i;
    const l = lead();
    l.path = null; l.goal = null;
    AB.Bus.emit('iso:party', { leader: l.id, prev: old.id });
    return true;
  }
  const cycle = () => setLeader((leader + 1) % members.length);

  // шаг вдоль пути; возвращает пройденное расстояние
  function walkPath(m, dt, speed) {
    let left = speed * dt, went = 0;
    while (m.path && m.path.length && left > 0) {
      const t = m.path[0], dx = t.x - m.x, dy = t.y - m.y, d = Math.hypot(dx, dy);
      if (d < 0.05) { m.path.shift(); continue; }
      const step = Math.min(d, left);
      const ox = m.x, oy = m.y;
      if (!W().move(m, (dx / d) * step, (dy / d) * step)) { m.path = null; break; }   // упёрся — путь пересчитаем
      const moved = Math.hypot(m.x - ox, m.y - oy);
      m.hx = dx / d; m.hy = dy / d;
      went += moved; left -= step;
      if (moved < step * 0.3) break;
    }
    if (m.path && !m.path.length) m.path = null;
    return went;
  }

  // места строя позади ведущего (в его системе координат: назад, вбок)
  const SLOTS = [[-1.3, 0.75], [-1.3, -0.75], [-2.4, 0], [-2.5, 1.4], [-2.5, -1.4]];
  function slotFor(k) {
    const l = lead(), [b, s] = SLOTS[k % SLOTS.length];
    const hl = Math.hypot(l.hx, l.hy) || 1, fx = l.hx / hl, fy = l.hy / hl;
    const x = l.x + fx * b - fy * s, y = l.y + fy * b + fx * s;
    if (W().free(x, y)) return { x, y };
    const n = W().nearestFree(x, y, 3);
    // место строя за стеной — тогда просто ближе к ведущему
    return n && W().clear(l.x, l.y, n.x + 0.5, n.y + 0.5, 0.2) ? { x: n.x + 0.5, y: n.y + 0.5 } : { x: l.x - fx * 0.9, y: l.y - fy * 0.9 };
  }

  function update(dt, input) {
    if (!members.length) return;
    const l = lead();
    let went = 0;
    // ведущий: клавиши (направление уже в мировых координатах) или путь к точке
    if (input && (input.x || input.y)) {
      l.path = null; l.goal = null;
      const sp = speedOf(l, !input.walk);
      const ox = l.x, oy = l.y;
      W().move(l, input.x * sp * dt, input.y * sp * dt);
      went = Math.hypot(l.x - ox, l.y - oy);
      l.hx = input.x; l.hy = input.y;
      l.run = !input.walk;
    } else if (l.path) {
      l.run = !(input && input.walk);
      went = walkPath(l, dt, speedOf(l, l.run));
    }
    animate(l, went, dt);

    // остальные: каждый к своему месту строя
    let k = 0;
    for (let i = 0; i < members.length; i++) {
      if (i === leader) continue;
      const m = members[i], slot = slotFor(k++);
      const dist = Math.hypot(slot.x - m.x, slot.y - m.y);
      m.replanT -= dt;
      if (dist > 0.4 && (!m.path || m.replanT <= 0)) {
        m.path = W().clear(m.x, m.y, slot.x, slot.y) ? [slot] : W().path(m.x, m.y, slot.x, slot.y);
        m.replanT = 0.35;
      }
      if (dist <= 0.4) m.path = null;
      const far = Math.hypot(l.x - m.x, l.y - m.y) > 2.6;
      m.run = far || l.run;
      let mw = m.path ? walkPath(m, dt, speedOf(m, m.run) * (far ? 1.1 : 1)) : 0;
      if (!m.path && dist <= 0.4) { m.hx = l.hx; m.hy = l.hy; }   // встал на место — смотрит туда же, что ведущий
      mw += separate(m, dt);
      animate(m, mw, dt);
    }
  }

  // не стоять друг в друге: лёгкое расталкивание
  function separate(m, dt) {
    let px = 0, py = 0;
    for (const o of members) {
      if (o === m) continue;
      const dx = m.x - o.x, dy = m.y - o.y, d = Math.hypot(dx, dy);
      if (d < 0.7 && d > 0.001) { const k = (0.7 - d) / 0.7; px += (dx / d) * k; py += (dy / d) * k; }
      else if (d <= 0.001) { px += 0.5; }
    }
    if (!px && !py) return 0;
    const ox = m.x, oy = m.y;
    W().move(m, px * 2.2 * dt, py * 2.2 * dt);
    return Math.hypot(m.x - ox, m.y - oy) * 0.3;
  }

  // анимация существующего скелета: шаг, бег, стоит; лицом — влево/вправо на экране
  function animate(m, went, dt) {
    const speed = went / Math.max(dt, 1e-4);
    m.moving = speed > 0.15;
    m.speed = speed;
    m.stride += went * PX_PER_TILE;
    const sxDir = m.hx - m.hy;   // экранное направление по горизонтали
    if (Math.abs(sxDir) > 0.05 && m.moving) m.facing = sxDir > 0 ? 1 : -1;
    const action = !m.moving ? 'idle' : m.run ? 'run' : 'walk';
    if (m.action !== action) { m.action = action; AB.Anim.play(m.id, action); }
  }

  return {
    MAX, init, update, goTo, stop, setLeader, cycle, lead,
    leaderIndex: () => leader, members: () => members,
  };
})();
