// =====================================================================
// ISO SETTINGS (дополнение №128). Кнопка ⚙ сверху — настройки управления:
//   • режим стрельбы правым стиком (телефон):
//       «auto» — стреляет сам, когда в секторе прицела враг;
//       «pull» — стреляет, только когда прицел отведён до отметки (внешнее кольцо);
//   • чувствительность прицела 1–5: насколько быстро и резко прицел следует за пальцем.
// Хранится в этом браузере (localStorage); без хранилища — значения по умолчанию.
// =====================================================================

AB.IsoSettings = (() => {
  const KEY = 'abyss_settings';
  const DEF = { fireMode: 'auto', sens: 3 };
  let S = { ...DEF };
  try { S = { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) }; } catch (e) { /* хранилище недоступно */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* хранилище недоступно */ } };
  const SENS = ['Очень плавно', 'Плавно', 'Средне', 'Быстро', 'Очень быстро'];

  function render() {
    const el = document.getElementById('iso-set'); if (!el) return;
    el.innerHTML = `<div class="inv-card set-card" role="dialog" aria-label="Настройки">
      <div class="inv-head"><div><h2>Настройки</h2><div class="muted">Управление на телефоне: правый стик — прицел</div></div><button class="inv-x" data-set-close aria-label="Закрыть">✕</button></div>
      <h3>Стрельба</h3>
      <label class="set-opt"><input type="radio" name="fm" value="auto" ${S.fireMode === 'auto' ? 'checked' : ''}><span><b>Сама, по врагу в прицеле</b><i>Ведите прицел — герой стреляет, как только в секторе прицела оказался враг. В пустоту не стреляет.</i></span></label>
      <label class="set-opt"><input type="radio" name="fm" value="pull" ${S.fireMode === 'pull' ? 'checked' : ''}><span><b>Отвести до отметки</b><i>Слегка отведённый стик — только целиться. Отвели до внешнего кольца — выстрел (и в пустоту тоже).</i></span></label>
      <h3>Чувствительность прицела</h3>
      <div class="set-row"><input type="range" min="1" max="5" step="1" value="${S.sens}" data-sens><b data-sens-label>${SENS[S.sens - 1]}</b></div>
      <p class="muted">Ниже — прицел плавнее и спокойнее (меньше «бегает»), выше — резче откликается на палец.</p>
    </div>`;
  }
  function open() { const el = document.getElementById('iso-set'); render(); el.hidden = false; }
  function init() {
    const el = document.getElementById('iso-set'), btn = document.getElementById('iso-set-btn');
    if (!el || !btn) return;
    btn.addEventListener('pointerdown', (e) => e.stopPropagation()); btn.addEventListener('click', open);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { if (e.target.closest('[data-set-close]') || e.target === el) el.hidden = true; });
    el.addEventListener('input', (e) => {
      if (e.target.name === 'fm') { S.fireMode = e.target.value; save(); }
      if (e.target.matches('[data-sens]')) { S.sens = Math.max(1, Math.min(5, +e.target.value)); save(); el.querySelector('[data-sens-label]').textContent = SENS[S.sens - 1]; }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { get: (k) => S[k], set(k, v) { S[k] = v; save(); }, open };
})();
