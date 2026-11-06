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
    if (AB.Rooms.inTransition() || AB.Interact.isSearching() || !l.controllable) return 'Сейчас нельзя';
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

  function update() {
    const l = lead();
    if (!l) return;
    const quiet = AB.Rooms.inTransition() || AB.Dialog.isOpen();
    for (const m of members()) {
      if (m === l) continue;
      m.engage = null;
      if (quiet || m.dead || m.down || m.room !== l.room) continue;
      if (AB.Enemies.threatFor(m.id, m.room)) continue;       // её цель — спастись, а не драться
      const w = AB.Combat.weaponOf(m.id);
      if (!w) continue;
      const foes = AB.Enemies.inRoom(m.room)
        .filter((e) => hostile(e) && Math.abs(e.x - l.x) < 520)
        .sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x));
      const e = foes[0];
      if (!e) continue;
      const dx = e.x - m.x, dir = Math.sign(dx) || m.facing;
      const ht = AB.Inventory.heat(m.id);
      const shoot = w.weapon.ranged && (w.weapon.infinite || (ht ? !ht.over && ht.heat < 0.8 : AB.Inventory.ammo(m.id) > 0));
      const reach = shoot ? Math.min(w.weapon.range * 0.8, 480) : (w.weapon.ranged ? 55 : w.weapon.range);
      m.engageFace = dir;
      if (Math.abs(dx) > reach) {
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
    serialize: () => ({ leader: leaderId }),
    restore(d) {
      const id = d && d.leader;
      const c = id && AB.Chars.get(id);
      leaderId = c && !c.dead ? id : MAIN;
    },
    reset() { leaderId = MAIN; },
  };
})();
