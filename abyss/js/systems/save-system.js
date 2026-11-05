// =====================================================================
// SAVE SYSTEM (GDD §13.11). Сохраняет только изменяемое состояние
// модулей, привязанное к ID. Сейчас — localStorage; позже — сервер.
// =====================================================================

AB.Save = (() => {
  const KEY = 'abyss_lost_signal_save';
  const VERSION = 1;

  function save() {
    const data = {
      version: VERSION,
      savedAt: Date.now(),
      chars: AB.Chars.serialize(),
      rooms: AB.Rooms.serialize(),
      story: AB.Story.serialize(),
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d.version === VERSION ? d : null;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* хранилище недоступно */ }
  }

  return { save, load, clear };
})();
