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
  let npcs = [];                         // персонажи сцены, ещё не в отряде (Мира до встречи)

  function make(p) {
    {
      const def = AB.ID.get(p.id);
      return {
        id: p.id, x: p.x, y: p.y, hx: 1, hy: 0,          // hx/hy — куда смотрит (направление в мире)
        appearance: def.appearances ? def.appearances[0] : null,
        facing: 1, stride: 0, equipped: null, hidden: false,
        path: null, goal: null, replanT: 0, moving: false, speed: 0, run: true,
      };
    }
  }
  function init(list) {
    members = list.slice(0, MAX).map(make);
    npcs = [];
    leader = 0;
    for (const m of members) {
      // стоит в стене или в предмете — на ближайшее свободное место
      if (!W().free(m.x, m.y)) { const n = W().nearestFree(m.x, m.y); if (n) { m.x = n.x + 0.5; m.y = n.y + 0.5; } }
      AB.Anim.play(m.id, 'idle');
    }
    AB.Bus.emit('iso:party', { leader: lead().id });
  }

  const lead = () => members[leader];
  const speedOf = (m, run) => { const st = AB.IsoSuit && AB.IsoSuit.suited(m) ? AB.IsoSuit.rig() : AB.ID.get(m.id).stats; return ((run ? st.runSpeed : st.speed) / PX_PER_TILE) * (AB.Perks ? AB.Perks.mod('moveSpeed') : 1); };

  // ведущему: идти к точке (путь в обход препятствий)
  function goTo(x, y) {
    const l = lead();
    const p = W().path(l.x, l.y, x, y);
    l.scripted = null; l.run = true;                 // приказ игрока: бегом (сценический шаг — только в сценах)
    l.path = p && p.length ? p : null;
    l.goal = l.path ? l.path[l.path.length - 1] : null;
    return !!l.path;
  }
  function stop() { const l = lead(); l.path = null; l.goal = null; }

  const isDead = (m) => { const c = AB.Chars.get(m.id); return !!(c && c.dead); };
  function setLeader(i) {
    if (i < 0 || i >= members.length || i === leader || isDead(members[i])) return false;
    const old = lead();
    old.path = null; old.goal = null;
    leader = i;
    const l = lead();
    l.path = null; l.goal = null;
    AB.Bus.emit('iso:party', { leader: l.id, prev: old.id });
    return true;
  }
  function cycle() {
    for (let k = 1; k < members.length; k++) if (setLeader((leader + k) % members.length)) return true;
    return false;
  }

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
    if (isDead(lead())) cycle();                   // ведущий погиб — управление следующему живому
    const l = lead();
    if (isDead(l)) return;
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
      l.run = l.scripted ? false : !(input && input.walk);
      went = walkPath(l, dt, l.scripted || speedOf(l, l.run));
      if (!l.path) l.scripted = null;
    }
    animate(l, went, dt);

    // остальные: каждый к своему месту строя
    let k = 0;
    for (let i = 0; i < members.length; i++) {
      if (i === leader) continue;
      const m = members[i];
      if (isDead(m)) continue;
      // «Гнездо»: поручено чинить проход — идёт туда и стоит, а не за ведущим
      if (m.repair) { k++; animate(m, m.path ? walkPath(m, dt, speedOf(m, true)) : separate(m, dt) * 0, dt); continue; }
      // бегство (Мира от преследователя и Колосса): прочь от угрозы, к ведущему
      const threat = m.flee && AB.IsoEnemies.threat(m);
      if (threat) {
        const dx = m.x - threat.x + (l.x - m.x) * 0.3, dy = m.y - threat.y + (l.y - m.y) * 0.3, n = Math.hypot(dx, dy) || 1;
        const goal = W().nearestFree(m.x + (dx / n) * 3, m.y + (dy / n) * 3, 2);
        m.replanT -= dt;
        if (goal && (!m.path || m.replanT <= 0)) { m.path = W().path(m.x, m.y, goal.x + 0.5, goal.y + 0.5); m.replanT = 0.3; }
        k++;
        animate(m, m.path ? walkPath(m, dt, speedOf(m, true)) : 0, dt);
        continue;
      }
      // в бою: стоит и бьёт (hold) или подходит к противнику; иначе — место в строю
      const slot = m.engage ? { x: m.engage.x, y: m.engage.y } : slotFor(k);
      k++;
      if (m.engage && m.engage.hold) { m.path = null; animate(m, separate(m, dt), dt); continue; }
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
    // удар, получение урона, гибель — не перебивать ходьбой
    const tr = AB.Anim.current(m.id);
    // разовая анимация (пробуждение, действие) закончилась — снова обычное состояние
    if (tr && tr.done && ['wake', 'interact', 'hurt', 'attack'].includes(tr.action)) m.action = null;
    if ((AB.IsoCombat && AB.IsoCombat.isSwinging(m.id)) || (tr && ['hurt', 'death', 'interact'].includes(tr.action) && !tr.done) || isDead(m) || (m.repair && !m.moving)) return;
    const action = !m.moving ? 'idle' : m.run ? 'run' : 'walk';
    if (m.action !== action) { m.action = action; AB.Anim.play(m.id, action); }
  }

  // ---------- для сюжетных сцен ----------
  const find = (id) => members.find((m) => m.id === id) || npcs.find((m) => m.id === id);
  function addNpc(id, x, y) {
    if (find(id)) return find(id);
    const m = make({ id, x, y });
    m.sector = AB.IsoGame ? AB.IsoGame.sector() : null;       // №55: персонаж сцены живёт в своём секторе
    if (!W().free(m.x, m.y)) { const n = W().nearestFree(m.x, m.y); if (n) { m.x = n.x + 0.5; m.y = n.y + 0.5; } }
    npcs.push(m);
    AB.Anim.play(id, 'idle');
    return m;
  }
  // присоединился к отряду (сюжетное «следует за Марком»)
  function join(id) {
    const i = npcs.findIndex((m) => m.id === id);
    if (i < 0 || members.length >= MAX) return false;
    const m = npcs.splice(i, 1)[0];
    m.path = null; m.goal = null;
    members.push(m);
    AB.Bus.emit('iso:party', { leader: lead().id, joined: id });
    return true;
  }
  // №55: вышел из отряда и остался в сцене (Мира у пульта, пока Марк за бортом)
  function leave(id) {
    const i = members.findIndex((m) => m.id === id);
    if (i < 0 || members.length < 2) return false;
    const cur = lead();
    const m = members.splice(i, 1)[0];
    m.path = null; m.goal = null; m.flee = false; m.repair = false;
    m.sector = AB.IsoGame ? AB.IsoGame.sector() : null;
    npcs.push(m);
    leader = Math.max(0, members.indexOf(cur));
    AB.Bus.emit('iso:party', { leader: lead().id, left: id });
    return true;
  }
  // сцена ведёт персонажа к точке
  function walkTo(id, x, y, speed) {
    const m = find(id);
    if (!m) return false;
    m.path = W().path(m.x, m.y, x, y);
    m.goal = m.path ? m.path[m.path.length - 1] : null;
    m.scripted = speed || 1.8;
    return !!m.path;
  }
  // переход в другой сектор или по люку: весь отряд — вокруг точки
  function placeAll(x, y) {
    const pts = [[0, 0], [-0.9, 0.6], [-0.9, -0.6], [-1.8, 0], [0.8, 0.8]];
    members.forEach((m, i) => {
      const [dx, dy] = pts[i % pts.length];
      let px = x + dx, py = y + dy;
      if (!W().free(px, py)) { const n = W().nearestFree(px, py, 3); if (n) { px = n.x + 0.5; py = n.y + 0.5; } else { px = x; py = y; } }
      m.x = px; m.y = py; m.path = null; m.goal = null; m.engage = null;
    });
  }
  function npcTick(dt) {
    for (const m of npcs) {
      const went = m.path ? walkPath(m, dt, m.scripted || 1.8) : 0;
      if (!m.path) { m.goal = null; m.scripted = null; }
      animate(m, went, dt);
    }
  }

  return {
    MAX, init, update, addNpc, join, leave, walkTo, placeAll, npcTick, find,
    npcs: () => npcs.filter((m) => !m.sector || !AB.IsoGame || m.sector === AB.IsoGame.sector()),
    allNpcs: () => npcs, goTo, stop, setLeader, cycle, lead,
    leaderIndex: () => leader, members: () => members,
  };
})();
