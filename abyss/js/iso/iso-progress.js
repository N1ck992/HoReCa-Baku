// =====================================================================
// ПРОГРЕСС ПОВЕРХНОСТИ (дополнение №205): уровни героев и техники, условия переходов между зонами,
// петля времени портала. Данные — js/data/world.js.
// AB.Levels — опыт и уровни (localStorage «abyss_lv»: { h: {герой: опыт}, v: {техника: опыт} }).
// AB.WorldGates — витки времени и что сделано в этом витке (localStorage «abyss_world»:
//   { cycle, boss: {зона: n}, keys: {ключ: true} }); check(from, to) — условия перехода с отметками.
// AB.TimeLoop.rewind() — портал: новый виток, уровни −1, зона A1 заново; юниты, детали, оружие остаются.
// =====================================================================

AB.Levels = (() => {
  const KEY = 'abyss_lv';
  let st = null;
  const C = () => AB.LEVELS;
  function S() { if (!st) { try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; } if (!st || typeof st !== 'object') st = { h: {}, v: {} }; st.h = st.h || {}; st.v = st.v || {}; } return st; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S())); } catch (e) { /* без хранилища */ } };
  // уровень по опыту: 1 + сколько порогов пройдено
  function lvOf(xp) { let L = 1; while (L < C().max && xp >= C().need(L)) L++; return L; }
  const level = (kind, id) => lvOf(S()[kind][id] || 0);
  function info(kind, id) {
    const xp = S()[kind][id] || 0, L = lvOf(xp), lo = L > 1 ? C().need(L - 1) : 0, hi = L >= C().max ? lo : C().need(L);
    return { level: L, xp, from: lo, to: hi, frac: hi > lo ? (xp - lo) / (hi - lo) : 1 };
  }
  function add(kind, id, n) {
    if (!id || !(n > 0)) return 0;
    const before = level(kind, id);
    S()[kind][id] = (S()[kind][id] || 0) + Math.round(n); save();
    const after = level(kind, id);
    if (after > before) {
      const nm = kind === 'h' ? (AB.ID.get(id) || {}).name : (AB.VEHICLES[id] || {}).name;
      AB.Bus.emit('iso:toast', { text: `${nm}: уровень ${after}!`, kind: 'good' });
      AB.Bus.emit('level:up', { kind, id, level: after });
    }
    return after - before;
  }
  // опыт отряду (герой + его техника)
  function give(hero, vehicle, n) { add('h', hero, n); add('v', vehicle, n); }
  // откат витка: каждому −k уровней (не ниже 1), опыт — на начало нового уровня
  function drop(k = 1) {
    for (const kind of ['h', 'v']) for (const id of Object.keys(S()[kind])) {
      const L = Math.max(1, level(kind, id) - k);
      S()[kind][id] = L > 1 ? C().need(L - 1) : 0;
    }
    save();
  }
  // бонус уровня к технике (и к ней — уровень героя за рулём)
  function apply(v, vid, hero) {
    const lv = level('v', vid) - 1, lh = hero ? level('h', hero) - 1 : 0;
    if (lv <= 0 && lh <= 0) return v;
    const B = C().vehicle, H = C().hero;
    return { ...v, attack: Math.round(v.attack * (1 + lv * B.attack + lh * H.attack)), armor: Math.min(0.85, (v.armor || 0) + lv * B.armor), hpK: (v.hpK || 1) + lv * B.hp, lvl: lv + 1, hlvl: lh + 1 };
  }
  // полоска уровня (для окон)
  const bar = (kind, id) => { const i = info(kind, id); return `<span class="lv-bar" title="Опыт ${i.xp}${i.to > i.from ? ` / ${i.to}` : ''}"><b>Ур. ${i.level}</b><u><i style="width:${Math.round(i.frac * 100)}%"></i></u></span>`; };
  return { level, info, add, give, drop, apply, bar, state: () => S(), _reset: () => { st = { h: {}, v: {} }; save(); } };
})();

AB.WorldGates = (() => {
  const KEY = 'abyss_world';
  let st = null;
  function S() { if (!st) { try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; } if (!st || typeof st !== 'object') st = { cycle: 1, boss: {}, keys: {} }; st.boss = st.boss || {}; st.keys = st.keys || {}; st.cycle = st.cycle || 1; } return st; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S())); } catch (e) { /* без хранилища */ } };
  const W = () => AB.WORLD;
  // главный босс зоны (ур. 3) повержен — засчитывается в этом витке
  AB.Bus && AB.Bus.on('surface:kill', ({ kind }) => { if (kind === 'boss3') { const z = AB.IsoSurface && AB.IsoSurface.zone ? AB.IsoSurface.zone() : 'A1'; S().boss[z] = (S().boss[z] || 0) + 1; save(); } });
  function squadLevel() {
    const sl = AB.IsoRoster ? AB.IsoRoster.list().filter((s) => s.hero) : [];
    if (!sl.length) return 1;
    return Math.floor(sl.reduce((a, s) => a + (AB.Levels.level('h', s.hero) + AB.Levels.level('v', s.vehicle)) / 2, 0) / sl.length);
  }
  // одно условие: { ok, text }
  function cond(c, from) {
    if (c.story) { const ok = !!(AB.IsoSurface && AB.IsoSurface.bridgesOpen && AB.IsoSurface.bridgesOpen()); return { ok, text: 'Цепочка «Дорога на север» пройдена (мосты открыты)' }; }
    if (c.boss) { const ok = (S().boss[c.boss] || 0) > 0; return { ok, text: `Главный босс зоны ${c.boss} (ур. 3) повержен в этом витке` }; }
    if (c.own) { const n = AB.IsoSurface && AB.IsoSurface.ownCount ? AB.IsoSurface.ownCount() : 0; return { ok: n >= c.own, text: `Держать территорий зоны: ${n}/${c.own}` }; }
    if (c.level) { const n = squadLevel(); return { ok: n >= c.level, text: `Средний уровень отряда: ${n}/${c.level}` }; }
    if (c.key) { const ok = !!S().keys[c.key]; const z = Object.entries(W().zones).find(([, d]) => d.key === c.key); return { ok, text: `Хранитель ${z ? z[0] : c.key} повержен` }; }
    return { ok: false, text: '?' };
  }
  function check(from, to) {
    const L = W().links.find((l) => l.from === from && l.to === to);
    if (!L) return { ok: false, list: [], zone: W().zones[to] };
    const list = L.gate.map((c) => cond(c, from));
    return { ok: list.every((x) => x.ok), list, zone: W().zones[to] };
  }
  return { check, cond, squadLevel, cycle: () => S().cycle, state: () => S(), setKey: (k) => { S().keys[k] = true; save(); },
    _newCycle: () => { S().cycle++; S().boss = {}; S().keys = {}; save(); }, _reset: () => { st = { cycle: 1, boss: {}, keys: {} }; save(); } };
})();

AB.TimeLoop = (() => {
  // портал C1: виток времени назад. Остаётся: открытые герои и техника, детали, оружие, вещи, база.
  // Сбрасывается: карта зоны A1 (туман, лагеря, территории, цепочка), победы над боссами и ключи витка.
  // Уровни героев и техники — минус levelLoss. Органическая масса с каждым витком шире.
  function rewind() {
    const L = AB.WORLD.loop;
    AB.Levels.drop(L.levelLoss);
    AB.WorldGates._newCycle();
    if (AB.IsoSurface && AB.IsoSurface.rewindZone) AB.IsoSurface.rewindZone();
    const c = AB.WorldGates.cycle();
    if (AB.IsoMail) AB.IsoMail.add({ kind: 'story', title: `Виток ${c}: портал вернул нас в начало`, html: `<p>Свет портала — и снова берег зоны ${L.start}. Те же холмы, те же деревни… но органика подступила ближе, чем в прошлый раз.</p><p>Уровни героев и техники — на 1 ниже. Всё, что добыто и открыто, — при нас.</p><p>Надо понять, что питает массу, — и как разорвать круг.</p>` });
    AB.Bus.emit('time:rewind', { cycle: c });
    return c;
  }
  return { rewind, cycle: () => AB.WorldGates.cycle() };
})();
