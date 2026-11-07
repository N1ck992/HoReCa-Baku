// =====================================================================
// PARTY SYSTEM. Группа — ведущий и те, кто идёт за ним (дополнение №22).
// Ведущим управляет игрок: он ходит, подбирает вещи себе в слоты,
// открывает двери и работает с оборудованием. Остальные идут следом
// и сами вступают в бой, если у них есть оружие.
// Сюжетные сцены написаны вокруг Марка, поэтому в начале сцены
// управление возвращается к нему.
// =====================================================================

AB.Party = (() => {
  const MAIN = 'CHAR-001';
  let leaderId = MAIN;

  const lead = () => AB.Chars.get(leaderId);

  // ведущий и все, кто идёт за ним (живые)
  function members() {
    const l = lead();
    if (!l) return [];
    return [l, ...AB.Chars.all().filter((c) => c.follow === leaderId && !c.dead)];
  }

  // почему нельзя передать управление (null — можно)
  function switchBlock(id) {
    const l = lead(), c = AB.Chars.get(id);
    if (!l || !c || id === leaderId) return 'Уже ведёт группу';
    if (!members().includes(c)) return 'Не в группе';
    if (c.dead) return 'Погиб';
    if (c.down) return 'Без сознания';
    if (c.room !== l.room) return 'В другом помещении';
    if (AB.Story.isRunning() || AB.Dialog.isOpen()) return 'Сейчас идёт сцена';
    if (AB.Rooms.inTransition() || AB.Interact.isSearching() || !l.controllable || c.climb || c.work) return 'Сейчас нельзя';
    if (AB.Enemies.threatFor(id, c.room)) return 'Ей нужно спастись';
    return null;
  }

  // передать управление: новый ведущий — под управлением игрока, прежний идёт за ним
  function setLeader(id, { force = false } = {}) {
    if (!force && switchBlock(id)) return false;
    const c = AB.Chars.get(id), old = lead();
    if (!c || c.dead || id === leaderId) return false;
    const group = members();
    leaderId = id;
    c.follow = null;
    c.goal = null;
    c.engage = null;
    c.controllable = old ? old.controllable : true;
    for (const m of group) {
      if (m === c) continue;
      m.follow = id;
      m.controllable = false;
      m.goal = null;
      m.vx = 0;
    }
    AB.Bus.emit('party:leader', { id, prev: old ? old.id : null });
    return true;
  }

  // следующий в группе (клавиша Q)
  function cycle() {
    const list = members();
    if (list.length < 2) return false;
    const next = list[1];
    const block = switchBlock(next.id);
    if (block) { AB.Bus.emit('party:blocked', { id: next.id, text: block }); return false; }
    return setLeader(next.id);
  }

  // ---------- Ведомые сражаются сами ----------
  const FIGHTING = ['ALERT', 'CHASE', 'ATTACK', 'RETREAT'];
  const PURSUING = ['APPEAR', 'CHASE', 'ATTACK'];

  function hostile(e) {
    const def = AB.ID.get(e.id);
    return def.type === 'pursuer' ? PURSUING.includes(e.state) : FIGHTING.includes(e.state);
  }

  // Автобой (дополнение №35): ведущий сам бьёт или стреляет, когда враг в досягаемости.
  // Игрок только двигается; если уходит от врага — ведущий не оборачивается.
  let autoFight = true;
  try { autoFight = localStorage.getItem('abyss_autofight') !== 'off'; } catch (e) { /* хранилище недоступно */ }
  function leaderAuto(l) {
    if (!autoFight || !l.controllable || l.dead || l.down || AB.Combat.isSwinging(l.id) || AB.Input.isLocked()) return;
    const w = AB.Combat.weaponOf(l.id);
    if (!w) return;
    const ht = AB.Inventory.heat(l.id);
    const shoot = w.weapon.ranged && (w.weapon.infinite || (ht ? !ht.over : AB.Inventory.ammo(l.id) > 0));
    const reach = shoot ? w.weapon.range * 0.85 : (w.weapon.ranged ? 58 : w.weapon.range + 8);
    const foes = AB.Arena.foesFor(l).filter((e) => hostile(e) && Math.abs(e.x - l.x) <= reach)
      .sort((a, b) => Math.abs(a.x - l.x) - Math.abs(b.x - l.x));
    const e = foes[0];
    if (!e) return;
    const dir = Math.sign(e.x - l.x) || l.facing, ax = AB.Input.axis();
    if (ax && ax !== dir) return;          // отступает — не мешаем
    l.facing = dir;
    AB.Combat.attack(l.id);
  }

  function update() {
    const l = lead();
    if (!l) return;
    const quiet = AB.Rooms.inTransition() || AB.Dialog.isOpen();
    if (!quiet && !AB.Story.isRunning()) leaderAuto(l);
    for (const m of members()) {
      if (m === l) continue;
      m.engage = null;
      if (quiet || m.dead || m.down || m.work || m.climb) continue;
      if (m.order && m.order.type === 'guard') continue;        // охраняет дверь — в общем бою не участвует
      if (!AB.Arena.seamless() && m.room !== l.room) continue;
      if (AB.Enemies.threatFor(m.id, m.room)) continue;       // её цель — спастись, а не драться
      // «за мной», а ведущий в другом помещении: догоняет, отбиваясь только от тех, кто рядом
      const catchUp = AB.Arena.seamless() && m.room !== l.room && (!m.order || m.order.type === 'follow');
      const w = AB.Combat.weaponOf(m.id);
      if (!w) continue;
      const hold = m.order && m.order.type === 'hold';
      const foes = AB.Arena.foesFor(m)
        .filter((e) => hostile(e) && (catchUp ? Math.abs(e.x - m.x) < 160 : hold ? Math.abs(e.x - m.x) < 560 : Math.abs(e.x - (l.room === m.room ? l.x : m.x)) < 520))
        .sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x));
      const e = foes[0];
      if (!e) continue;
      const dx = e.x - m.x, dir = Math.sign(dx) || m.facing;
      const ht = AB.Inventory.heat(m.id);
      const shoot = w.weapon.ranged && (w.weapon.infinite || (ht ? !ht.over && ht.heat < 0.8 : AB.Inventory.ammo(m.id) > 0));
      const reach = shoot ? Math.min(w.weapon.range * 0.8, 480) : (w.weapon.ranged ? 55 : w.weapon.range);
      m.engageFace = dir;
      if (Math.abs(dx) > reach) {
        if (hold) continue;                                    // стоит на посту: ближе не подходит
        m.engage = e.x - dir * reach * 0.7;
      } else {
        m.engage = m.x;
        m.facing = dir;
        if (!AB.Combat.isSwinging(m.id)) AB.Combat.attack(m.id, { ai: true });
      }
    }
  }

  // сцена начинается — управление у Марка
  AB.Bus.on('event:start', () => { if (leaderId !== MAIN) setLeader(MAIN, { force: true }); });

  return {
    leader: () => leaderId,
    lead, members, setLeader, switchBlock, cycle, update,
    isLeader: (id) => id === leaderId,
    autoFight: () => autoFight,
    setAutoFight(on) { autoFight = !!on; try { localStorage.setItem('abyss_autofight', on ? 'on' : 'off'); } catch (e) { /* хранилище недоступно */ } },
    serialize: () => ({ leader: leaderId }),
    restore(d) {
      const id = d && d.leader;
      const c = id && AB.Chars.get(id);
      leaderId = c && !c.dead ? id : MAIN;
    },
    reset() { leaderId = MAIN; },
  };
})();
