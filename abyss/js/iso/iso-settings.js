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
  const DEF = { fireMode: 'auto', sens: 3, gfx: 'auto' };
  let S = { ...DEF };
  try { S = { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) }; } catch (e) { /* хранилище недоступно */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* хранилище недоступно */ } };
  const SENS = ['Низкая', 'Ниже средней', 'Средняя', 'Выше средней', 'Высокая'];

  function render() {
    const el = document.getElementById('iso-set'); if (!el) return;
    el.innerHTML = `<div class="inv-card set-card" role="dialog" aria-label="Настройки">
      <div class="inv-head"><div><h2>Настройки</h2><div class="muted">Управление на телефоне: правый стик — прицел</div></div><button class="inv-x" data-set-close aria-label="Закрыть">✕</button></div>
      <h3>Звук</h3>
      <label class="set-opt"><input type="checkbox" data-snd ${AB.IsoAudio && AB.IsoAudio.on() ? 'checked' : ''}><span><b>Звук включён</b><i>Выключить — тишина полностью: эффекты, голоса и фон.</i></span></label>
      <h3>Графика</h3>
      <div class="set-row set-gfx">${GFX.map(([k, n]) => `<label><input type="radio" name="gfx" value="${k}" ${S.gfx === k ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      <p class="muted">Ниже качество — меньше пикселей рисуется каждый кадр, игра плавнее на слабых телефонах. «Авто» само снижает чёткость, если кадры идут медленно.</p>
      <h3>Стрельба</h3>
      <label class="set-opt"><input type="radio" name="fm" value="auto" ${S.fireMode === 'auto' ? 'checked' : ''}><span><b>Сама, по врагу в прицеле</b><i>Ведите прицел — герой стреляет, как только в секторе прицела оказался враг. В пустоту не стреляет.</i></span></label>
      <label class="set-opt"><input type="radio" name="fm" value="pull" ${S.fireMode === 'pull' ? 'checked' : ''}><span><b>Отвести до отметки</b><i>Слегка отведённый стик — только целиться. Отвели до внешнего кольца — выстрел (и в пустоту тоже).</i></span></label>
      <h3>Чувствительность прицела</h3>
      <div class="set-row"><input type="range" min="1" max="5" step="1" value="${S.sens}" data-sens><b data-sens-label>${SENS[S.sens - 1]}</b></div>
      <p class="muted">Прицел всегда смотрит точно туда, куда палец, без задержки. Ниже — сильнее гасится мелкое дрожание пальца, выше — прицел ловит даже самые мелкие движения.</p>
    </div>`;
  }
  // №133: качество графики → разрешение холста
  const GFX = [['auto', 'Авто'], ['high', 'Высокое'], ['mid', 'Среднее'], ['low', 'Низкое']];
  function applyGfx() {
    if (!AB.IsoRender || !AB.IsoRender.setQuality) return;
    const m = { auto: { res: 1.5, auto: true }, high: { res: 2, auto: false }, mid: { res: 1.5, auto: false }, low: { res: 1, auto: false } }[S.gfx] || { res: 1.5, auto: true };
    AB.IsoRender.setQuality(m);
  }
  function open() { const el = document.getElementById('iso-set'); render(); el.hidden = false; }
  function init() {
    const el = document.getElementById('iso-set'), btn = document.getElementById('iso-set-btn');
    if (!el || !btn) return;
    // №141: ⚙ есть и на картах (дно, поверхность) — [data-set-open]
    for (const b of [btn, ...document.querySelectorAll('[data-set-open]')]) { b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('click', open); }
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { if (e.target.closest('[data-set-close]') || e.target === el) el.hidden = true; });
    el.addEventListener('input', (e) => {
      if (e.target.name === 'fm') { S.fireMode = e.target.value; save(); }
      if (e.target.name === 'gfx') { S.gfx = e.target.value; save(); applyGfx(); }
      if (e.target.matches('[data-snd]') && AB.IsoAudio) AB.IsoAudio.setOn(e.target.checked);
      if (e.target.matches('[data-sens]')) { S.sens = Math.max(1, Math.min(5, +e.target.value)); save(); el.querySelector('[data-sens-label]').textContent = SENS[S.sens - 1]; }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { get: (k) => S[k], set(k, v) { S[k] = v; save(); if (k === 'gfx') applyGfx(); }, open, applyGfx };
})();
