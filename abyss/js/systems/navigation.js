// =====================================================================
// Навигация: куда идти дальше. Цели не придумываются — они выводятся
// из того, что уже открыто: неисследованные проходы и запертые двери.
// Когда появится QUEST SYSTEM (этап 6), её цели получат приоритет.
// =====================================================================

AB.Nav = (() => {
  // Интересная дверь: ведёт в неисследованное помещение или заперта
  function doorStatus(roomId, door) {
    const pass = AB.Rooms.canPass(door);
    if (!pass.ok) return { kind: 'locked', reason: pass.reason };
    if (!AB.Rooms.visited().includes(door.to)) return { kind: 'unexplored' };
    return { kind: 'known' };
  }

  // Поиск в ширину по открытым дверям от текущего помещения
  function goal() {
    const start = AB.Rooms.current();
    if (!start) return null;
    const queue = [[start, null]];
    const seen = new Set([start]);
    let lockedFallback = null;
    while (queue.length) {
      const [roomId, firstDoor] = queue.shift();
      const r = AB.ID.get(roomId);
      for (const d of r.doors || []) {
        const st = doorStatus(roomId, d);
        if (st.kind === 'unexplored') {
          return { roomId, door: d, kind: 'unexplored', via: roomId === start ? d : firstDoor };
        }
        if (st.kind === 'locked' && !lockedFallback) {
          lockedFallback = { roomId, door: d, kind: 'locked', reason: st.reason, via: roomId === start ? d : firstDoor };
        }
        if (st.kind === 'known' && !seen.has(d.to)) {
          seen.add(d.to);
          queue.push([d.to, roomId === start ? d : firstDoor]);
        }
      }
    }
    return lockedFallback;
  }

  // Текст подсказки и направление для HUD
  function hint() {
    const g = goal();
    const hero = AB.Chars.get('CHAR-001');
    if (!g || !hero) return null;
    const here = g.roomId === AB.Rooms.current();
    const target = g.via || g.door;
    const dir = Math.sign(target.x - hero.x) || 1;
    let text;
    if (here) text = g.kind === 'unexplored' ? 'Неисследованный проход' : `Запертая дверь: ${g.reason.toLowerCase()}`;
    else text = `${g.kind === 'unexplored' ? 'Неисследованный проход' : 'Запертая дверь'} · ${AB.ID.get(g.roomId).name}`;
    return { text, dir, dist: Math.abs(target.x - hero.x), x: target.x, here, kind: g.kind };
  }

  return { goal, hint, doorStatus };
})();
