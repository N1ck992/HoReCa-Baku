// =====================================================================
// ПОЧТА (дополнение №168, решение автора 2026-11-23: «рядом с инвентарём — кнопка с письмом; там в письмах
// отчёты после боя, награды и т.д.»). Письмо: { id, at, kind, title, html, read }.
// kind: report — отчёт о бое; reward — награды (задания, трофеи); event — события карты (территории,
// набеги, лагеря); story — сюжет. Хранится в localStorage «abyss_mail» (последние 60).
// Непрочитанные — красная точка и число на кнопке ✉ (AB.RedDot «mail»).
// =====================================================================

AB.IsoMail = (() => {
  const KEY = 'abyss_mail', MAX = 60;
  const KINDS = { all: 'Все', report: 'Бои', reward: 'Награды', event: 'События', story: 'Сюжет' };
  const ICON = { report: '⚔', reward: '★', event: '⚑', story: '✦' };
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { list = []; }
  let el = null, tab = 'all', cur = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) { /* без хранилища */ } };
  const unread = () => list.filter((m) => !m.read).length;
  const stamp = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function badge() {
    const n = unread();
    for (const b of document.querySelectorAll('[data-mail]')) { b.classList.toggle('has-dot', n > 0); b.dataset.n = n > 9 ? '9+' : n || ''; }
  }
  // новое письмо; html — уже безопасная разметка (составляет сама игра)
  function add({ kind = 'event', title, html = '' }) {
    list.unshift({ id: `m${Date.now()}${Math.floor(Math.random() * 1000)}`, at: stamp(), kind, title, html, read: false });
    if (list.length > MAX) list.length = MAX;
    save(); badge();
    if (el && !el.hidden) render();
    AB.Bus.emit('mail:new', { kind, title });
  }
  function render() {
    el.querySelector('.ml-tabs').innerHTML = Object.entries(KINDS).map(([k, n]) => {
      const c = list.filter((m) => !m.read && (k === 'all' || m.kind === k)).length;
      return `<button class="${tab === k ? 'on' : ''}" data-ml-tab="${k}">${n}${c ? ` <i>${c}</i>` : ''}</button>`;
    }).join('');
    const items = list.filter((m) => tab === 'all' || m.kind === tab);
    el.querySelector('.ml-list').innerHTML = items.length ? items.map((m) => `<button class="ml-item ${m.read ? '' : 'new'} ${cur === m.id ? 'on' : ''}" data-ml="${m.id}"><span>${ICON[m.kind] || '✉'}</span><b>${m.title}</b><small>${m.at}</small></button>`).join('') : '<p class="ml-empty">Писем нет</p>';
    const m = list.find((x) => x.id === cur);
    el.querySelector('.ml-view').innerHTML = m ? `<h3>${ICON[m.kind] || '✉'} ${m.title}</h3><small>${m.at} · ${KINDS[m.kind] || ''}</small><div class="ml-text">${m.html}</div><button class="ml-del" data-ml-del="${m.id}">Удалить письмо</button>` : '<p class="ml-empty">Выберите письмо</p>';
    el.classList.toggle('reading', !!m);
  }
  function open() {
    if (!el) {
      el = document.getElementById('iso-mail');
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        if (e.target === el || e.target.closest('[data-ml-close]')) { el.hidden = true; return; }
        const t = e.target.closest('[data-ml-tab]'); if (t) { tab = t.dataset.mlTab; cur = null; render(); return; }
        const it = e.target.closest('[data-ml]'); if (it) { cur = it.dataset.ml; const m = list.find((x) => x.id === cur); if (m && !m.read) { m.read = true; save(); badge(); } render(); return; }
        const dl = e.target.closest('[data-ml-del]'); if (dl) { list = list.filter((x) => x.id !== dl.dataset.mlDel); cur = null; save(); badge(); render(); return; }
        if (e.target.closest('[data-ml-all]')) { for (const m of list) m.read = true; save(); badge(); render(); }
      });
    }
    el.hidden = false; render();
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-mail]')) { e.stopPropagation(); open(); } }, true);
  setInterval(badge, 900);
  return { add, open, unread, list: () => list.slice(), close: () => { if (el) el.hidden = true; }, isOpen: () => !!el && !el.hidden };
})();
