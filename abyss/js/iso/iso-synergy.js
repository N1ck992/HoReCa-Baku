// =====================================================================
// СВЯЗКИ — расчёт (дополнение №199). Данные — js/data/synergies.js.
// active() — какие связки сейчас действуют (по активному отряду AB.IsoRoster.list(), ячейки с героем);
// bonus(vid) — суммарный бонус связок для этой техники; apply(v, vid) — характеристики с бонусом.
// Пересчёт — при смене отряда (roster:changed), иначе берётся из кэша.
// =====================================================================

AB.Synergy = (() => {
  let cache = null;
  const V = (id) => AB.VEHICLES[id] || {};
  const power = (vid) => ((AB.VEHICLE_INFO || {})[vid] || {}).power || null;
  const H = (id) => (AB.HEROES || {})[id] || null;
  function squad() { return AB.IsoRoster ? AB.IsoRoster.list().filter((s) => s.hero) : []; }
  // для каждой связки: сколько набрано, какой ярус, кто попадает под бонус
  function calc() {
    const sl = squad(), out = [];
    for (const S of AB.SYNERGIES || []) {
      let n = 0, who = [], label = '';
      if (S.kind === 'power') { who = sl.filter((s) => power(s.vehicle) === S.key).map((s) => s.vehicle); n = who.length; }
      else if (S.kind === 'dtype') {
        const t = sl.map((s) => V(s.vehicle).dtype || 'kinetic'), same = t.length && t.every((x) => x === t[0]);
        n = same ? t.length : 0; label = same && AB.Damage ? AB.Damage.name(t[0]) : '';
        if (n < (S.min || 0)) n = Math.min(n, (S.min || 1) - 1);
        who = sl.map((s) => s.vehicle);
      } else if (S.kind === 'roles') { const have = new Set(sl.map((s) => V(s.vehicle).class)); n = S.need.filter((r) => have.has(r)).length; who = sl.map((s) => s.vehicle); }
      else if (S.kind === 'match') { n = sl.filter((s) => H(s.hero) && H(s.hero).role === V(s.vehicle).class).length; who = sl.map((s) => s.vehicle); }
      else if (S.kind === 'heroRole') {
        const by = {}; for (const s of sl) { const h = H(s.hero); if (h) (by[h.role] = by[h.role] || []).push(s); }
        const best = Object.entries(by).sort((a, b) => b[1].length - a[1].length)[0];
        n = best ? best[1].length : 0; label = best ? ((AB.HERO_ROLES || {})[best[0]] || {}).name || '' : '';
        who = best ? sl.filter((s) => V(s.vehicle).class === best[0]).map((s) => s.vehicle) : [];
      } else if (S.kind === 'heroes') { n = S.ids.filter((id) => sl.some((s) => s.hero === id)).length; who = sl.map((s) => s.vehicle); }
      const tier = [...S.tiers].reverse().find((t) => n >= t.n) || null;
      out.push({ ...S, have: n, next: (S.tiers.find((t) => n < t.n) || {}).n || null, tier, on: !!tier, who: S.to === 'all' ? sl.map((s) => s.vehicle) : who, label });
    }
    return out;
  }
  const active = () => (cache || (cache = calc()));
  function bonus(vid) {
    const b = { attack: 0, rate: 0, armor: 0, hp: 0, speed: 0 };
    for (const s of active()) if (s.on && s.who.includes(vid)) for (const [k, v] of Object.entries(s.tier.bonus)) b[k] += v;
    return b;
  }
  // характеристики техники с бонусом связок (v — уже с деталями и наукой)
  function apply(v, vid) {
    const b = bonus(vid); if (!b.attack && !b.rate && !b.armor && !b.hp && !b.speed) return v;
    return { ...v, attack: Math.round(v.attack * (1 + b.attack)), rate: +(v.rate * (1 + b.rate)).toFixed(2), armor: Math.min(0.85, (v.armor || 0) + b.armor),
      hpK: (v.hpK || 1) + b.hp, speed: v.speed * (1 + b.speed), syn: b };
  }
  const bonusText = (b) => [b.attack && `урон +${Math.round(b.attack * 100)}%`, b.rate && `темп +${Math.round(-b.rate * 100)}%`, b.armor && `броня +${Math.round(b.armor * 100)}%`,
    b.hp && `прочность +${Math.round(b.hp * 100)}%`, b.speed && `скорость +${Math.round(b.speed * 100)}%`].filter(Boolean).join(' · ');
  // блок для окна «Отряд»: действующие — ярко, остальные — с прогрессом
  function html() {
    const list = active();
    const row = (s) => `<div class="syn ${s.on ? 'on' : ''}" title="${s.text}"><i>${s.icon}</i><b>${s.name}${s.label ? ` · ${s.label}` : ''}</b>
      <span>${s.on ? bonusText(s.tier.bonus) : s.next ? `${Math.max(0, s.have)}/${s.next}` : ''}</span><small>${s.text}</small></div>`;
    const on = list.filter((s) => s.on), off = list.filter((s) => !s.on);
    return `<div class="ro-syn"><small>Связки отряда${on.length ? ` · действует: ${on.length}` : ''}</small>${[...on, ...off].map(row).join('')}</div>`;
  }
  if (AB.Bus) { AB.Bus.on('roster:changed', () => { cache = null; }); AB.Bus.on('roster:unlock', () => { cache = null; }); }
  setInterval(() => { cache = null; }, 3000);          // отряд меняется и без события (сохранение, смерть) — изредка пересчёт
  return { active, bonus, apply, html, bonusText, reset: () => { cache = null; } };
})();
