// =====================================================================
// «КРАСНЫЕ ТОЧКИ» (дополнение №166): один общий сервис — что нового и где показать точку.
// Ключи: inv — новые вещи; units — новые герои или техника; squad — новые детали техники (окно «Отряд»);
// sci — исследование завершено (кнопка «Наука» в капсуле). Точка снимается, когда окно открыли.
// Хранится в localStorage «abyss_dots». Новые системы добавляют свой ключ в SEL и зовут mark(key).
// =====================================================================

AB.RedDot = (() => {
  const KEY = 'abyss_dots';
  const SEL = {
    inv: '#iso-inv-btn, [data-sf-items], #ow-right [data-ow="items"], [data-ow="items"]',
    units: '[data-sf-units], [data-ow="units"]',
    squad: '[data-sf-squad], [data-ow="all"]',
    sci: '#bx-sci',
  };
  let on = {};
  try { on = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { on = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(on)); } catch (e) { /* без хранилища */ } };
  function mark(k) { if (!on[k]) { on[k] = true; save(); } refresh(); }
  function clear(k) { if (on[k]) { delete on[k]; save(); } refresh(); }
  function refresh() { for (const [k, sel] of Object.entries(SEL)) for (const el of document.querySelectorAll(sel)) el.classList.toggle('has-dot', !!on[k]); }
  // открыли окно — точка снята
  function wrap(obj, fn, k) { if (!obj || typeof obj[fn] !== 'function') return; const orig = obj[fn]; obj[fn] = function (...a) { clear(k); return orig.apply(this, a); }; }
  wrap(AB.IsoInventory, 'open', 'inv');
  wrap(AB.IsoRoster, 'units', 'units');
  wrap(AB.IsoRoster, 'open', 'squad');
  wrap(AB.BaseView, 'openScience', 'sci');
  // что считается новым
  AB.Bus.on('inventory:changed', ({ itemId, delta }) => {
    if (!(delta > 0) || !itemId) return;
    const inv = document.getElementById('iso-inv'); if (inv && !inv.hidden) return;
    mark('inv');
    if (AB.VEHICLE_PARTS && AB.VEHICLE_PARTS.some((p) => p.id === itemId)) mark('squad');
  });
  AB.Bus.on('roster:unlock', () => mark('units'));
  AB.Bus.on('base:tech', ({ done }) => { if (done) mark('sci'); });
  setInterval(refresh, 700);                       // кнопки перерисовываются — точку ставим заново
  return { mark, clear, has: (k) => !!on[k], refresh };
})();
