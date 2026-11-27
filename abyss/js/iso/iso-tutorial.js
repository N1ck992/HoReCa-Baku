// =====================================================================
// ВВОДНЫЕ ЗАДАНИЯ — ход (дополнение №199). Данные — js/data/tutorial.js.
// Задания идут по порядку, начинаются, когда у отряда есть своя база (флаг undocked). Раз в секунду
// проверяется условие текущего; выполнено — награда сразу в вещи отряда, письмо «Награды», ЭХО
// называет следующее. Панель — слева в базе (свернуть/развернуть, список всех).
// Хранится в localStorage «abyss_tut»: { i — номер текущего, flags — что уже делали, off — панель свёрнута }.
// =====================================================================

AB.IsoTutorial = (() => {
  const KEY = 'abyss_tut';
  let st = null, el = null, open = false;
  function S() {
    if (!st) { try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; } if (!st || typeof st !== 'object') st = { i: 0, flags: {} }; st.flags = st.flags || {}; }
    return st;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S())); } catch (e) { /* без хранилища */ } };
  const L = () => AB.TUTORIAL || [];
  const cur = () => L()[S().i] || null;
  const flag = (k) => { if (!S().flags[k]) { S().flags[k] = true; save(); } };
  // что игрок уже делал — события
  if (AB.Bus) {
    AB.Bus.on('base:tech', ({ start }) => { if (start) flag('tech'); });
    AB.Bus.on('roster:changed', () => { if (AB.IsoRoster && AB.IsoRoster.isOpen()) flag('squad'); });
    AB.Bus.on('ow:enter', () => flag('sea'));
    AB.Bus.on('surface:enter', () => flag('surface'));
    AB.Bus.on('surface:kill', () => flag('kill'));
  }
  { const R = AB.IsoRoster; if (R && R.units) { const o = R.units; R.units = function (...a) { flag('units'); return o.apply(this, a); }; } }
  const sim = () => (AB.BaseSim && AB.BaseSim.on() ? AB.BaseSim.state() : null);
  // сколько сделано из нужного: { got, need }
  function progress(q) {
    const c = q.check, B = sim();
    if (c.built) return { got: B && B.devs.some((d) => c.built.includes(d.bp) && d.built) ? 1 : 0, need: 1 };
    if (c.worker) return { got: B ? Object.values(B.crew).filter((w) => w.jobs.some((j) => j !== 'build' && j !== 'haul')).length : 0, need: c.worker };
    if (c.foraged) return { got: Math.min(c.foraged, B ? B.foraged || 0 : 0), need: c.foraged };
    if (c.flag) return { got: S().flags[c.flag] ? 1 : 0, need: 1 };
    if (c.synergy) return { got: AB.Synergy ? AB.Synergy.active().filter((s) => s.on).length : 0, need: c.synergy };
    if (c.report) return { got: AB.IsoMail ? AB.IsoMail.list().filter((m) => m.kind === 'report').length : 0, need: c.report };
    if (c.mailRead) return { got: AB.IsoMail ? AB.IsoMail.list().filter((m) => m.read).length : 0, need: c.mailRead };
    if (c.part) { let n = 0; if (AB.VehMods) for (const v of Object.keys(AB.VEHICLES)) n += Object.keys(AB.VehMods.parts(v)).length; return { got: n, need: c.part }; }
    return { got: 0, need: 1 };
  }
  const nm = (i) => (AB.ID && AB.ID.get(i) ? AB.ID.get(i).name : i);
  function grant(q) {
    const got = [];
    for (const [item, n] of q.reward || []) {
      let id = item;
      if (item === 'PART1') { const pool = (AB.VEHICLE_PARTS || []).filter((p) => p.lvl === 1); if (!pool.length) continue; id = pool[Math.floor(Math.random() * pool.length)].id; }
      if (AB.IsoStash) AB.IsoStash.add(id, n);
      got.push(`${item === 'PART1' ? `деталь «${(AB.VEHICLE_PARTS.find((p) => p.id === id) || {}).name || id}»` : nm(id)} ×${n}`);
    }
    return got.join(', ');
  }
  function done(q) {
    const r = grant(q);
    S().i++; save();
    const nx = cur();
    AB.Bus.emit('iso:toast', { text: `Обучение: «${q.name}» выполнено${r ? ` · награда: ${r}` : ''}`, kind: 'good' });
    if (AB.IsoMail) AB.IsoMail.add({ kind: 'reward', title: `Обучение: ${q.name}`, html: `<p>${q.text}</p><p>Награда: <b>${r || '—'}</b> — в вещах отряда.</p>${nx ? `<p>Дальше: «${nx.name}» — ${nx.text}</p>` : '<p>Обучение пройдено.</p>'}` });
    if (AB.IsoCompanion && AB.IsoCompanion.has()) setTimeout(() => AB.IsoCompanion.message(nx ? `Готово! Дальше — «${nx.name}»: ${nx.text} ${nx.hint}` : 'Обучение пройдено — дальше сам. Я рядом.'), 1200);
    AB.Bus.emit('tutorial:done', { id: q.id });
    render();
  }
  function tick() {
    if (!AB.Flags || !AB.Flags.has('undocked')) { if (el) el.hidden = true; return; }
    let q = cur(), n = 0;
    while (q && n++ < 3) { const p = progress(q); if (p.got >= p.need) { done(q); q = cur(); } else break; }
    render();
  }
  // ---------- панель ----------
  function ui() {
    if (el) return el;
    el = document.createElement('div'); el.id = 'tut'; el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-tut-hint]')) { const q = cur(); if (q && AB.IsoCompanion && AB.IsoCompanion.has()) AB.IsoCompanion.message(q.hint); else if (q) AB.Bus.emit('iso:toast', { text: q.hint, kind: 'info' }); return; }
      open = !open; S().off = false; save(); render();
    });
    return el;
  }
  let sig = '';
  function render() {
    const inBase = document.body.classList.contains('in-base'), on = AB.Flags && AB.Flags.has('undocked') && inBase;
    const e = ui(); e.hidden = !on; if (!on) return;
    const q = cur(), all = L(), p = q ? progress(q) : null;
    const k = `${S().i}|${open}|${p ? p.got : ''}`; if (k === sig) return; sig = k;
    const rew = (x) => (x.reward || []).map(([i, n]) => `${i === 'PART1' ? 'деталь техники' : nm(i)} ×${n}`).join(', ');
    e.classList.toggle('open', open);
    e.innerHTML = `<div class="tut-h"><b>📘 Обучение</b><span>${Math.min(S().i, all.length)}/${all.length}</span><i>${open ? '▴' : '▾'}</i></div>
      ${q ? `<div class="tut-q"><b>${q.name}</b><p>${q.text}</p>${p.need > 1 ? `<u><i style="width:${Math.round(p.got / p.need * 100)}%"></i></u><small>${p.got}/${p.need}</small>` : ''}
        <small class="tut-r">Награда: ${rew(q)}</small><button data-tut-hint>Как?</button></div>` : '<div class="tut-q"><p>Обучение пройдено.</p></div>'}
      ${open ? `<ol class="tut-all">${all.map((x, i) => `<li class="${i < S().i ? 'ok' : i === S().i ? 'cur' : ''}">${i < S().i ? '✓' : i + 1}. ${x.name}</li>`).join('')}</ol>` : ''}`;
  }
  AB.Bus && AB.Bus.on('base:view', ({ on }) => { sig = ''; render(); if (on) { const q = cur(); if (q && AB.IsoCompanion && AB.IsoCompanion.has()) setTimeout(() => AB.IsoCompanion.message(`Задание обучения: «${q.name}» — ${q.text} ${q.hint}`), 5200); } });
  setInterval(tick, 1000);
  return { cur, progress, state: () => S(), tick, _reset: () => { st = { i: 0, flags: {} }; save(); sig = ''; render(); } };
})();
