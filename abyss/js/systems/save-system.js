// =====================================================================
// SAVE SYSTEM (GDD §13.11). Сохраняет только изменяемое состояние
// модулей, привязанное к ID. Сейчас — localStorage; позже — сервер.
// =====================================================================

AB.Save = (() => {
  const KEY = 'abyss_lost_signal_save';
  const VERSION = 3;   // 3: новое начало акта I (дополнение №37) — старые сохранения не подходят

  // Перенос старых сохранений на новую версию. ID не меняются,
  // кроме временного ID коридора, утверждённого как ROOM-011.
  const MIGRATIONS = {
    1: (raw) => raw.replace(/ROOM-TMP-001/g, 'ROOM-011'),
  };

  let frozen = false; // после «Начать заново» больше не сохраняем до перезагрузки

  function save() {
    if (frozen) return false;
    // не сохраняем посреди боя и после гибели: загрузка вернёт к безопасной точке
    const hero = AB.Party.lead();
    if (!hero || hero.dead || AB.Party.members().some((m) => m.dead) || AB.Enemies.inCombat()) return false;
    if (AB.Arena.active()) return false;            // посреди боевой локации не сохраняем
    const data = {
      version: VERSION,
      savedAt: Date.now(),
      chars: AB.Chars.serialize(),
      rooms: AB.Rooms.serialize(),
      story: AB.Story.serialize(),
      inventory: AB.Inventory.serialize(),
      enemies: AB.Enemies.serialize(),
      quests: AB.Quests.serialize(),
      equipment: AB.Equip.serialize(),
      world: AB.World.serialize(),
      logs: AB.Logs.serialize(),
      barks: AB.Barks.serialize(),
      arena: AB.Arena.serialize(),
      perks: AB.Perks.serialize(),
      progress: AB.Progress.serialize(),
      party: AB.Party.serialize(),
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }

  function load() {
    try {
      let raw = localStorage.getItem(KEY);
      if (!raw) return null;
      let v = JSON.parse(raw).version;
      while (v < VERSION && MIGRATIONS[v]) raw = MIGRATIONS[v++](raw);
      const d = JSON.parse(raw);
      d.version = v;
      return v === VERSION ? d : null;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    frozen = true;
    try { localStorage.removeItem(KEY); } catch (e) { /* хранилище недоступно */ }
  }

  return { save, load, clear };
})();
