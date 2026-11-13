// =====================================================================
// ISO REWARD (дополнение №81). Момент награды: важная находка — не строчка в
// углу, а событие. До подбора — столб света и лучи над предметом; в момент
// подбора — вспышка, искры вокруг героя и крупная карточка по центру
// («НОВОЕ ОРУЖИЕ», «НОВАЯ БРОНЯ», «НОВЫЙ ЧЛЕН ОТРЯДА»…). Один раз за прохождение.
// Что считается наградой — AB.ISO_REWARDS ниже (первая — труба).
// =====================================================================

// награды: предмет → карточка. kind задаёт заголовок и цвет. Дальше по плану автора: броня, затем новые герои.
AB.ISO_REWARDS = {
  'ITEM-009': { kind: 'weapon', stats: 'Урон 26 · удар вплотную', hint: 'Бить: F, J, пробел или нажать на врага · на телефоне — кнопка ⚔' },
  'ITEM-011': { kind: 'weapon', stats: 'Плазма без боезапаса · взлом электронных замков', hint: 'Стрелять: нажать на врага · перегрев после 5 выстрелов подряд' },
  'ITEM-012': { kind: 'weapon', stats: 'Дротики без боезапаса', hint: '' },
  // №82: детали генератора — маленькая награда со счётчиком; броня — в шкафу техника, когда есть питание
  'ITEM-004': { kind: 'part', stats: () => partLine(), hint: 'Предохранитель для электрощита генератора' },
  'ITEM-006': { kind: 'part', stats: () => partLine(), hint: 'Канистра топлива для генератора' },
  'ITEM-021': { kind: 'armor', stats: 'Защита +10% · шлем, перчатки и ботинки', hint: 'Надевается сразу. Получаемый урон меньше на десятую часть' },
};
// сколько деталей генератора уже найдено
function partLine() {
  const parts = ['ITEM-004', 'ITEM-006'];
  const n = parts.filter((i) => (AB.IsoStash && AB.IsoStash.count(i) > 0) || AB.Chars.all().some((c) => AB.Inventory.count(c.id, i) > 0)).length;
  return `Деталь генератора ${n}/${parts.length}${n >= parts.length ? ' — всё собрано, к генератору!' : ''}`;
}
const REWARD_KIND = {
  weapon: { title: 'Новое оружие', col: '255,200,90' },
  armor: { title: 'Новая броня', col: '120,220,255' },
  crew: { title: 'Новый член отряда', col: '140,255,170' },
  part: { title: 'Найдена деталь', col: '120,220,255' },
  companion: { title: 'Новый спутник', col: '94,230,255' },
  power: { title: 'Питание восстановлено', col: '255,240,170' },
  item: { title: 'Ценная находка', col: '255,214,120' },
};

AB.IsoReward = (() => {
  const got = new Set();
  let fx = null;                 // { x, y, t } — вспышка и искры у героя
  const el = () => document.getElementById('iso-reward');

  function show(id, rw, by) {
    if (got.has(id)) return;
    got.add(id);
    const def = AB.ID.get(id) || {}, k = REWARD_KIND[rw.kind] || REWARD_KIND.item;
    const m = AB.IsoParty.find(by) || AB.IsoParty.lead();
    if (m) { fx = { x: m.x, y: m.y, t: 0, col: k.col }; AB.Anim.play(m.id, 'interact', { restart: true }); }
    const box = el(); if (!box) return;
    box.style.setProperty('--rw', `rgb(${k.col})`);
    const stats = typeof rw.stats === 'function' ? rw.stats() : rw.stats;
    box.innerHTML = `<div class="rw-card"><div class="rw-kind">${k.title}</div><div class="rw-name">${rw.name || def.name || id}</div>
      ${stats ? `<div class="rw-stats">${stats}</div>` : ''}${rw.hint ? `<div class="rw-hint">${rw.hint}</div>` : ''}<button class="rw-ok" type="button">Окей</button></div>`;
    box.hidden = false;
    box.classList.remove('go'); void box.offsetWidth; box.classList.add('go');
    // №90: карточка не исчезает сама — закрыть кнопкой «Окей» (или Enter / Esc)
    const ok = box.querySelector('.rw-ok'); if (ok) setTimeout(() => ok.focus({ preventScroll: true }), 300);
  }
  function hide() { const box = el(); if (box) { box.hidden = true; box.classList.remove('go'); } }

  AB.Bus.on('item:pickup', ({ by, charId, itemId, added }) => {
    if (!added) return;
    const rw = AB.ISO_REWARDS[itemId];
    if (rw && !got.has(itemId)) { show(itemId, rw, by || charId); api.just = itemId; }   // обычную строку-подсказку о находке не дублируем
  });
  // находки из шкафов и ящиков — тоже награды
  AB.Bus.on('container:looted', ({ found }) => {
    for (const [item] of found || []) { const rw = AB.ISO_REWARDS[item]; if (rw && !got.has(item)) { show(item, rw); api.just = item; break; } }
  });
  // №82: питание восстановлено — свет зажигается, карточка, подсказка про шкаф техника
  let powerT = -1;
  AB.Bus.on('equip:changed', ({ id, state }) => {
    if (id !== 'EQUIP-003' || state !== 'done' || got.has('power')) return;   // только когда генератор запустили сами
    powerT = 0;
    setTimeout(() => show('power', { kind: 'power', name: 'Свет на палубе', stats: 'Свет, пульты и электронные двери корабля работают', hint: 'Шкаф техника у генератора открылся — загляни' }), 600);
  });
  // новые награды других видов (броня, герой) вызывают это напрямую
  AB.Bus.on('iso:reward', ({ id, kind, stats, hint, by, name }) => show(id, { kind, stats, hint, name }, by));
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#iso-reward .rw-ok')) { e.stopPropagation(); hide(); } }, true);
  document.addEventListener('keydown', (e) => { const box = el(); if (box && !box.hidden && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); hide(); } }, true);

  // ---------- рисование: лучи над ещё не подобранной наградой, вспышка у героя ----------
  function drawGround(ctx, toScreen, time, items) {
    for (const t of items) {
      const rw = AB.ISO_REWARDS[t.ref.item]; if (!rw || got.has(t.ref.item)) continue;
      const k = REWARD_KIND[rw.kind] || REWARD_KIND.item, p = toScreen(t.x, t.y);
      // вращающиеся лучи
      ctx.save(); ctx.translate(p.x, p.y - 8); ctx.scale(1, 0.55);
      for (let i = 0; i < 10; i++) {
        const a = time * 0.8 + i * Math.PI / 5;
        const g = ctx.createLinearGradient(0, 0, Math.cos(a) * 46, Math.sin(a) * 46);
        g.addColorStop(0, `rgba(${k.col},.45)`); g.addColorStop(1, `rgba(${k.col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 46, a - 0.12, a + 0.12); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // столб света
      const h = 150, g = ctx.createLinearGradient(0, p.y - h, 0, p.y);
      g.addColorStop(0, `rgba(${k.col},0)`); g.addColorStop(1, `rgba(${k.col},${0.35 + Math.sin(time * 3) * 0.1})`);
      ctx.fillStyle = g; ctx.fillRect(p.x - 10, p.y - h, 20, h);
    }
  }
  // темнота сцены: при включении питания плавно светлеет (с белой вспышкой в начале)
  function darkness(base, lit) {
    if (powerT < 0) return lit ? base.lit : base.dark;
    powerT += 1 / 60;
    const k = Math.min(1, powerT / 2.5);
    if (k >= 1) powerT = -1;
    return base.dark + (base.lit - base.dark) * (k * k * (3 - 2 * k)) - (powerT < 0.25 ? (0.25 - powerT) * 1.2 : 0);
  }
  function drawFx(ctx, toScreen, dt) {
    if (!fx) return;
    fx.t += dt;
    const p = toScreen(fx.x, fx.y), k = fx.t;
    if (k > 1.6) { fx = null; return; }
    // кольцо и искры
    const r = 20 + k * 140, a = Math.max(0, 1 - k / 1.2);
    ctx.save(); ctx.translate(p.x, p.y - 40);
    ctx.strokeStyle = `rgba(${fx.col},${a})`; ctx.lineWidth = 4 * a + 1;
    ctx.beginPath(); ctx.ellipse(0, 40, r, r * 0.5, 0, 0, 7); ctx.stroke();
    for (let i = 0; i < 22; i++) {
      const ang = i * 2.39996, d = 10 + k * (90 + (i % 5) * 18), up = k * k * 60;
      ctx.fillStyle = `rgba(${fx.col},${a})`;
      ctx.fillRect(Math.cos(ang) * d, Math.sin(ang) * d * 0.6 - up, 3, 3);
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 90); g.addColorStop(0, `rgba(${fx.col},${0.5 * a})`); g.addColorStop(1, `rgba(${fx.col},0)`);
    ctx.fillStyle = g; ctx.fillRect(-90, -90, 180, 180);
    ctx.restore();
  }
  const api = { darkness, drawGround, drawFx, show, hide, isOpen: () => { const b = el(); return !!b && !b.hidden; }, has: (id) => got.has(id), reset: () => got.clear(), just: null };
  return api;
})();

// №82: броня. Пока одна — «Комплект техника» (+10% защиты). Носит Марк, если комплект есть у отряда.
AB.IsoArmor = (() => {
  const LIST = ['ITEM-021'];
  const has = (i) => (AB.IsoStash && AB.IsoStash.count(i) > 0) || AB.Chars.all().some((c) => AB.Inventory.count(c.id, i) > 0);
  function of(id) {
    if (id !== 'CHAR-001') return 0;
    let best = 0;
    for (const i of LIST) if (has(i)) best = Math.max(best, (AB.ID.get(i) || {}).armor || 0);
    return best;
  }
  return { of };
})();
