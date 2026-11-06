// =====================================================================
// PROJECT ABYSS — ядро: пространство имён, реестр ID, шина событий.
// GDD §2 (правила 2, 7) и §4 (префиксы ID).
// =====================================================================

const AB = window.AB = window.AB || {};

AB.VERSION = '0.1.0';

// ---------- Реестр идентификаторов ----------
// Каждый игровой объект регистрируется здесь один раз под постоянным ID.
// Повторная регистрация того же ID — ошибка (защита от дублей, GDD §2.3).
AB.ID = (() => {
  const PREFIXES = ['CHAR', 'ENEMY', 'ROOM', 'ITEM', 'EQUIP', 'QUEST', 'EVENT', 'ASSET', 'ANIM', 'DIALOG'];
  const PATTERN = new RegExp(`^(${PREFIXES.join('|')})-[A-Z0-9]+(?:-[A-Z0-9]+)*$`);
  const table = new Map();

  function prefixOf(id) {
    return id.split('-')[0];
  }

  function isValid(id) {
    return typeof id === 'string' && PATTERN.test(id);
  }

  function register(id, data) {
    if (!isValid(id)) throw new Error(`[ID] Неверный формат ID: "${id}"`);
    if (table.has(id)) throw new Error(`[ID] Дубликат ID: "${id}"`);
    const record = Object.freeze({ ...data, id });
    table.set(id, record);
    return record;
  }

  function get(id) {
    const r = table.get(id);
    if (!r) console.warn(`[ID] Не найден: ${id}`);
    return r || null;
  }

  function has(id) {
    return table.has(id);
  }

  function list(prefix) {
    return [...table.values()].filter((r) => !prefix || prefixOf(r.id) === prefix);
  }

  return { PREFIXES, isValid, register, get, has, list, prefixOf };
})();

// ---------- Шина событий ----------
// Модули не вызывают друг друга напрямую, а обмениваются событиями.
AB.Bus = (() => {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type).delete(fn);
    },
    emit(type, payload) {
      (handlers.get(type) || []).forEach((fn) => {
        try { fn(payload); } catch (e) { console.error(`[Bus] ${type}`, e); }
      });
    },
  };
})();

// ---------- Утилиты ----------
AB.util = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  ease: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  // детерминированный генератор: одинаковый вид помещений при каждом запуске
  rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
};
