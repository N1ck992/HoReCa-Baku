// =====================================================================
// Модуль сохранений.
// Сейчас — localStorage. Позже сюда подключается сервер (аккаунты):
// достаточно заменить реализацию load/save, остальной код не меняется.
// =====================================================================

const SaveStore = {
  key: 'zero_frontier_save',

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return this.migrate(JSON.parse(raw));
    } catch (e) {
      console.warn('Не удалось загрузить сохранение', e);
      return null;
    }
  },

  save(state) {
    try {
      localStorage.setItem(this.key, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('Не удалось сохранить', e);
      return false;
    }
  },

  clear() {
    try { localStorage.removeItem(this.key); } catch (e) { /* ignore */ }
  },

  // Обновление старых сохранений: добавляем недостающие поля из стартового состояния.
  migrate(data) {
    const base = START_STATE();
    const merged = Object.assign(base, data);
    for (const k of ['res', 'buildings', 'units', 'missions', 'stats']) {
      merged[k] = Object.assign(START_STATE()[k], data[k] || {});
    }
    merged.version = SAVE_VERSION;
    return merged;
  },
};
