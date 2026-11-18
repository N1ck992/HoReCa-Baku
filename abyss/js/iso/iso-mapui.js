// =====================================================================
// ОБЩИЙ ИНТЕРФЕЙС КАРТ (дополнение №141). Дно и поверхность вне батискафа
// выглядят одинаково: справа сверху ⚙ и DEV, слева снизу «Моя база» с веером
// масштаба и маленький значок инвентаря рядом, справа снизу — ячейки отрядов.
// Здесь — веер на кнопке «Моя база»: нажать и держать (или потянуть) —
// раскрывается дуга «Войска / Деревня / Город / Мир»; отпустить на пункте —
// карта приближается или отдаляется. Короткое нажатие — обычное действие кнопки.
// =====================================================================

AB.IsoMapUI = (() => {
  const FAN = [
    { key: 'troops', label: 'Войска' },
    { key: 'village', label: 'Деревня' },
    { key: 'city', label: 'Город' },
    { key: 'world', label: 'Мир' },
  ];
  // btn — кнопка «Моя база», fan — контейнер с [data-fan]; tap() — короткое нажатие, pick(key) — выбран масштаб
  function fan(btn, fanEl, { tap, pick }) {
    let st = null;
    const items = () => [...fanEl.querySelectorAll('[data-fan]')];
    const hit = (x, y) => items().find((el) => { const r = el.getBoundingClientRect(); return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8; });
    const show = (on) => { fanEl.hidden = !on; document.body.classList.toggle('map-fan-on', on); if (!on) for (const el of items()) el.classList.remove('hot'); };
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); btn.setPointerCapture(e.pointerId);
      st = { x: e.clientX, y: e.clientY, open: false, t: setTimeout(() => { if (st) { st.open = true; show(true); } }, 280) };
    });
    btn.addEventListener('pointermove', (e) => {
      if (!st) return;
      if (!st.open && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) { st.open = true; show(true); }
      if (st.open) { const h = hit(e.clientX, e.clientY); for (const el of items()) el.classList.toggle('hot', el === h); }
    });
    const end = (e) => {
      if (!st) return;
      clearTimeout(st.t);
      const wasOpen = st.open, h = wasOpen && e.type === 'pointerup' ? hit(e.clientX, e.clientY) : null;
      st = null; show(false);
      if (h) pick(h.dataset.fan);
      else if (!wasOpen && e.type === 'pointerup') tap();
    };
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    fanEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    fanEl.addEventListener('click', (e) => { const b = e.target.closest('[data-fan]'); if (b) { e.stopPropagation(); show(false); pick(b.dataset.fan); } });
  }
  const label = (key) => (FAN.find((f) => f.key === key) || {}).label || key;
  return { fan, label, FAN };
})();
