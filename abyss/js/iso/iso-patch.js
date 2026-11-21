// =====================================================================
// ISO PATCH (дополнение №110). Обновление игры в приложении Android без переустановки.
// Только внутри приложения (есть мост window.AbyssApp): кнопка «Патч» вверху и плашка при
// запуске — версия и «Обновить патч». Патч — zip-файл от разработчика: приложение распаковывает
// его к себе, и изменённые файлы берутся из патча. Патч накопительный: достаточно последнего.
// =====================================================================

AB.IsoPatch = (() => {
  const app = () => (typeof window.AbyssApp !== 'undefined' ? window.AbyssApp : null);
  let ver = null;
  async function version() {
    if (ver) return ver;
    try { ver = await (await fetch('version.json', { cache: 'no-store' })).json(); } catch (e) { ver = { name: '?' }; }
    return ver;
  }
  function panel(msg) {
    let el = document.getElementById('iso-patch-box');
    if (!el) {
      el = document.createElement('div'); el.id = 'iso-patch-box';
      el.innerHTML = `<div class="pb-card"><b>Обновление игры</b><p class="pb-ver"></p><p class="pb-hint">Скачайте файл патча (zip), который прислал разработчик, нажмите «Выбрать файл патча» и выберите его. Игра перезапустится обновлённой; сохранения не пропадут. Патч накопительный — достаточно последнего.</p><p class="pb-msg"></p>
        <div class="pb-row"><button class="pb-pick">Выбрать файл патча</button><button class="pb-reset">Сбросить патч</button><button class="pb-close">Закрыть</button></div></div>`;
      document.body.appendChild(el);
      el.querySelector('.pb-pick').onclick = () => { el.querySelector('.pb-msg').textContent = 'Выберите файл патча…'; app() && app().pickPatch(); };
      el.querySelector('.pb-reset').onclick = () => { if (confirm('Вернуть версию, установленную с приложением?')) app() && app().resetPatch(); };
      el.querySelector('.pb-close').onclick = () => { el.hidden = true; };
    }
    version().then((v) => { el.querySelector('.pb-ver').textContent = `Сейчас: версия ${v.name}${v.patch ? ' (патч)' : ''}${v.built ? ' · собрана ' + v.built : ''}`; });
    el.querySelector('.pb-msg').textContent = msg || '';
    el.hidden = false;
  }
  window.AbyssPatchResult = (ok, msg) => { panel(ok ? `Патч ${msg}. Перезапуск…` : `Ошибка: ${msg}`); };
  window.addEventListener('DOMContentLoaded', async () => {
    if (!app()) return;
    const b = document.getElementById('iso-patch'); if (b) { b.hidden = false; b.onclick = (e) => { e.stopPropagation(); panel(); }; }
    // при входе — плашка с версией и кнопкой обновления (сама скрывается)
    const v = await version();
    const bar = document.createElement('div'); bar.id = 'iso-patch-bar';
    bar.innerHTML = `<span>PROJECT ABYSS · версия ${v.name}${v.patch ? ' (патч)' : ''}</span><button>Обновить патч</button>`;
    bar.querySelector('button').onclick = (e) => { e.stopPropagation(); bar.remove(); panel(); };
    document.body.appendChild(bar);
    setTimeout(() => bar.remove(), 9000);
  });
  return { panel, version };
})();
