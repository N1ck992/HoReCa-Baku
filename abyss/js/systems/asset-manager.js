// =====================================================================
// ASSET MANAGER (GDD §13.8). Загружает ресурсы из ASSET MANIFEST.
// Если у ресурса нет файла — статус 'missing', рисуется заглушка с ID.
// =====================================================================

AB.Assets = (() => {
  const state = new Map(); // id -> { status, img, parts }
  const disabled = new Set(); // ресурсы, временно выключенные игроком (откат на заглушку)

  // Набор частей (type: 'rig'): готов, когда загружены все картинки
  // Части берутся из манифеста (parts) или из скелета, созданного инструментом:
  // { rig: 'CHAR001', variant: '01' } → AB.RIGS.CHAR001.variants['01']
  function partsOf(a) {
    if (a.parts) return a.parts;
    const rig = a.rig && AB.RIGS && AB.RIGS[a.rig];
    return (rig && rig.variants && rig.variants[a.variant]) || null;
  }

  function loadParts(a, files) {
    const rec = { status: 'loading', img: null, parts: {} };
    state.set(a.id, rec);
    a = { ...a, parts: files };
    const names = Object.keys(a.parts);
    let left = names.length;
    for (const n of names) {
      const img = new Image();
      img.onload = () => {
        rec.parts[n] = img;
        if (--left === 0 && rec.status === 'loading') { rec.status = 'ready'; AB.Bus.emit('asset:ready', a.id); }
      };
      img.onerror = () => { rec.status = 'error'; console.warn(`[Assets] Не загрузилась часть ${n} у ${a.id}: ${a.parts[n]}`); };
      img.src = a.parts[n];
    }
  }

  function load() {
    for (const a of AB.ASSET_MANIFEST) {
      const files = partsOf(a);
      if (files) { loadParts(a, files); continue; }
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
    if (disabled.has(id)) return { status: 'disabled', img: null };
    return state.get(id) || { status: 'unknown', img: null };
  }

  function setDisabled(id, off) {
    if (off) disabled.add(id); else disabled.delete(id);
    AB.Bus.emit('asset:ready', id);
  }

  function isReady(id) {
    return get(id).status === 'ready';
  }

  function report() {
    return AB.ASSET_MANIFEST.map((a) => ({ id: a.id, desc: a.desc, status: get(a.id).status }));
  }

  return { load, get, isReady, report, setDisabled, isDisabled: (id) => disabled.has(id) };
})();
