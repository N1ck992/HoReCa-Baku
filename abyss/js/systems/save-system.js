// =====================================================================
// SAVE SYSTEM (GDD §13.11). Сохраняет только изменяемое состояние
// модулей, привязанное к ID. Сейчас — localStorage; позже — сервер.
// =====================================================================

AB.Save = (() => {
  const KEY = 'abyss_lost_signal_save';
  const VERSION = 2;

  // Перенос старых сохранений на новую версию. ID не меняются,
  // кроме временного ID коридора, утверждённого как ROOM-011.
  const MIGRATIONS = {
    1: (raw) => raw.replace(/ROOM-TMP-001/g, 'ROOM-011'),
  };

  function save() {
    const data = {
      version: VERSION,
      savedAt: Date.now(),
      chars: AB.Chars.serialize(),
      rooms: AB.Rooms.serialize(),
      story: AB.Story.serialize(),
      inventory: AB.Inventory.serialize(),
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
    try { localStorage.removeItem(KEY); } catch (e) { /* хранилище недоступно */ }
  }

  return { save, load, clear };
})();
