// =====================================================================
// ASSET MANAGER (GDD §13.8). Загружает ресурсы из ASSET MANIFEST.
// Если у ресурса нет файла — статус 'missing', рисуется заглушка с ID.
// =====================================================================

AB.Assets = (() => {
  const state = new Map(); // id -> { status, img }

  function load() {
    for (const a of AB.ASSET_MANIFEST) {
      if (!a.src) {
        state.set(a.id, { status: 'missing', img: null });
        continue;
      }
      const img = new Image();
      const rec = { status: 'loading', img };
      state.set(a.id, rec);
      img.onload = () => { rec.status = 'ready'; AB.Bus.emit('asset:ready', a.id); };
      img.onerror = () => { rec.status = 'error'; console.warn(`[Assets] Не загрузился ${a.id}: ${a.src}`); };
      img.src = a.src;
    }
  }

  function get(id) {
    return state.get(id) || { status: 'unknown', img: null };
  }

  function isReady(id) {
    return get(id).status === 'ready';
  }

  function report() {
    return AB.ASSET_MANIFEST.map((a) => ({ id: a.id, desc: a.desc, status: get(a.id).status }));
  }

  return { load, get, isReady, report };
})();
