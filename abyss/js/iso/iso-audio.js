// =====================================================================
// ISO AUDIO (дополнение №108). Звук игры: атмосфера корабля, шаги, бой, враги.
// Файлы — assets/audio/*.mp3 (свободные звуки CC0 с OpenGameArt, список и авторы —
// assets/audio/CREDITS.txt); свист удара, перегрев плазмы и треск молнии ЭХО
// собираются кодом (Web Audio). Звук — объёмный: тише с расстоянием, глуше за стеной,
// слева/справа по экрану. Каждый повтор — другой вариант и чуть другая высота.
// Браузер разрешает звук только после первого нажатия — тогда всё и запускается.
// =====================================================================

AB.IsoAudio = (() => {
  const BASE = 'assets/audio/';
  const RULES = {
    master: 0.8,
    near: 5, far: 24,                  // до 5 клеток — полная громкость, дальше 24 — не слышно
    wall: { gain: 0.45, cutoff: 900 }, // за стеной — тише и глуше
    pitch: 0.06,                       // разброс высоты ±6%
    step: { walk: 0.62, run: 0.82, lead: 0.55, other: 0.3 },   // шаг через N клеток; громкость
    amb: {                              // фоны по местам
      ship: { amb_hum: 0.42, amb_dark: 0.3, amb_drips: 0.22 },
      base: { amb_hum: 0.3, amb_machine: 0.22 },
      other: { amb_hum: 0.25, amb_dark: 0.2 },
      power: { amb_machine: 0.12 },     // на корабле после запуска генератора
    },
    distant: [12, 30],                  // далёкие удары металла — раз в N…M секунд
    idleMoan: [6, 14],                  // стоны бродячих мутантов
    vol: {                              // громкость групп
      step_metal: 0.5, nailgun: 0.6, cutter_shot: 0.55, pipe_hit: 0.75, flesh_hit: 0.6, plasma_shot: 0.55, plasma_hit: 0.5,
      mutant_alert: 0.7, mutant_attack: 0.65, mutant_hurt: 0.55, mutant_death: 0.75, mutant_idle: 0.45,
      brute_roar: 0.8, boss_roar: 0.9, door: 0.5, distant: 0.32,
      // №109
      step_boot: 0.55, heavy_step: 0.7, ui_click: 0.35, ui_open: 0.3, ui_close: 0.3, ui_denied: 0.4, quest_new: 0.5, quest_done: 0.55, reward: 0.6,
      pickup: 0.45, spark: 0.45, alarm: 0.55, turret_shot: 0.45, grate_break: 0.7, grate_fix: 0.4, power_on: 0.6, sword_swing: 0.6, sword_hit: 0.6, sword_clash: 0.55, cloth: 0.3,
    },
  };
  let ctx = null, out = null, on = true, list = null, started = false;
  const buf = {}, last = {}, loops = {};
  try { on = localStorage.getItem('abyss_sound') !== '0'; } catch (e) { /* без хранилища */ }

  const listener = () => (AB.IsoParty && AB.IsoParty.lead()) || null;
  const rnd = (a, b) => a + Math.random() * (b - a);

  async function load(name) {
    if (buf[name] !== undefined) return buf[name];
    buf[name] = null;
    try { const r = await fetch(BASE + name + '.mp3'); buf[name] = await ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) { buf[name] = null; }
    return buf[name];
  }
  async function start() {
    if (started) return; started = true;
    if (location.protocol === 'file:') return;            // открыто как файл — браузер не даст загрузить звуки (в публикации — работают)
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); out = ctx.createGain(); out.gain.value = on ? RULES.master : 0; out.connect(ctx.destination);
    try { list = await (await fetch(BASE + 'sounds.json')).json(); } catch (e) { list = {}; }
    await Promise.all(['amb_hum', 'amb_dark', 'amb_drips', 'amb_machine'].map(load));
    ambience();
    for (const g of Object.keys(list)) for (const n of list[g]) load(n);    // остальное — в фоне
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { start(); if (ctx && ctx.state === 'suspended') ctx.resume(); }, { capture: true }));

  // громкость и панорама по месту источника; за стеной — глуше
  function place(x, y) {
    const l = listener(); if (x == null || !l) return { g: 1, pan: 0, wall: false };
    const d = Math.hypot(x - l.x, y - l.y);
    if (d > RULES.far) return null;
    const g = d <= RULES.near ? 1 : Math.max(0, 1 - (d - RULES.near) / (RULES.far - RULES.near)) ** 1.6;
    const pan = Math.max(-0.8, Math.min(0.8, ((x - y) - (l.x - l.y)) / 10));   // экранная горизонталь
    const wall = AB.IsoWorld && AB.IsoWorld.see ? !AB.IsoWorld.see(l.x, l.y, x, y, 0.05) : false;
    return { g: g * (wall ? RULES.wall.gain : 1), pan, wall };
  }
  function chain(p, vol) {
    const g = ctx.createGain(); g.gain.value = vol;
    let node = g;
    if (p && p.wall) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = RULES.wall.cutoff; g.connect(f); node = f; }
    if (p && ctx.createStereoPanner) { const s = ctx.createStereoPanner(); s.pan.value = p.pan; node.connect(s); node = s; }
    node.connect(out);
    return g;
  }
  // проиграть звук группы (случайный вариант, не тот же, что в прошлый раз)
  function play(group, opt = {}) {
    if (window.__sndLog) window.__sndLog.push(group);   // журнал для проверок
    if (!ctx || !on || !list || !list[group]) return;
    const vars = list[group]; let i = Math.floor(Math.random() * vars.length);
    if (vars.length > 1 && i === last[group]) i = (i + 1) % vars.length; last[group] = i;
    const b = buf[vars[i]]; if (!b) { load(vars[i]); return; }
    const p = place(opt.x, opt.y); if (!p) return;
    const src = ctx.createBufferSource(); src.buffer = b;
    src.playbackRate.value = (opt.rate || 1) * (1 + rnd(-RULES.pitch, RULES.pitch));
    src.connect(chain(p, (RULES.vol[group] || 0.5) * (opt.vol == null ? 1 : opt.vol) * p.g));
    src.start(ctx.currentTime + (opt.delay || 0));
  }

  // ---------- звуки, собранные кодом ----------
  let noiseBuf = null;
  const noise = () => { if (noiseBuf) return noiseBuf; noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noiseBuf; };
  function synth(kind, x, y) {
    if (window.__sndLog) window.__sndLog.push('synth:' + kind);
    if (!ctx || !on) return; const p = place(x, y); if (!p) return; const t = ctx.currentTime;
    if (kind === 'whoosh' || kind === 'dart') {           // свист трубы / дротика: шум через полосовой фильтр, частота падает
      const s = ctx.createBufferSource(); s.buffer = noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
      const hi = kind === 'dart' ? 3200 : 1500, lo = kind === 'dart' ? 1400 : 420, len = kind === 'dart' ? 0.12 : 0.2;
      f.frequency.setValueAtTime(hi * rnd(0.9, 1.1), t); f.frequency.exponentialRampToValueAtTime(lo, t + len);
      const g = chain(p, (kind === 'dart' ? 0.25 : 0.45) * p.g); const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + 0.04); e.gain.exponentialRampToValueAtTime(0.001, t + len);
      s.connect(f); f.connect(e); e.connect(g); s.start(t, Math.random() * 0.5, len + 0.05);
    } else if (kind === 'overheat') {                      // перегрев плазмы: шипение пара + падающий тон
      const s = ctx.createBufferSource(); s.buffer = noise(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(0.5, t + 0.05); e.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      s.connect(f); f.connect(e); e.connect(chain(p, 0.5 * p.g)); s.start(t, 0, 1);
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.5);
      const e2 = ctx.createGain(); e2.gain.setValueAtTime(0.08, t); e2.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.connect(e2); e2.connect(chain(p, p.g)); o.start(t); o.stop(t + 0.55);
    } else if (kind === 'zap') {                           // цепная молния ЭХО: треск и гудение
      const s = ctx.createBufferSource(); s.buffer = noise(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
      const e = ctx.createGain(); for (let i = 0; i < 8; i++) { const ti = t + i * 0.03; e.gain.setValueAtTime(rnd(0.2, 0.6), ti); e.gain.setValueAtTime(0.02, ti + 0.015); } e.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      s.connect(f); f.connect(e); e.connect(chain(p, 0.5 * p.g)); s.start(t, 0, 0.35);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 95; const e2 = ctx.createGain(); e2.gain.setValueAtTime(0.12, t); e2.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(e2); e2.connect(chain(p, p.g)); o.start(t); o.stop(t + 0.32);
    }
  }

  // ---------- атмосфера ----------
  function mood() {
    const sec = AB.IsoGame && AB.IsoGame.sector ? AB.IsoGame.sector() : '';
    const ship = /^SECTOR-00[1-4]$/.test(sec), base = sec === 'SECTOR-005';
    const m = { ...(ship ? RULES.amb.ship : base ? RULES.amb.base : RULES.amb.other) };
    if (ship && AB.Equip && AB.Equip.state && AB.Equip.state('EQUIP-003') === 'done') Object.assign(m, RULES.amb.power);
    return m;
  }
  function ambience() {
    if (!ctx) return;
    const want = mood(), t = ctx.currentTime;
    for (const name of ['amb_hum', 'amb_dark', 'amb_drips', 'amb_machine']) {
      const v = (want[name] || 0) * (on ? 1 : 0);
      let L = loops[name];
      if (!L && v > 0 && buf[name]) {
        const s = ctx.createBufferSource(); s.buffer = buf[name]; s.loop = true; s.loopStart = 0.05; s.loopEnd = buf[name].duration - 0.05;
        const g = ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(out); s.start(t, Math.random() * buf[name].duration * 0.8);
        L = loops[name] = { s, g };
      }
      if (L) { L.g.gain.cancelScheduledValues(t); L.g.gain.setTargetAtTime(v, t, 1.2); }   // плавно, за пару секунд
    }
  }

  // ---------- события игры ----------
  const B = AB.Bus;
  let shotT = 0;
  B.on('iso:shot', ({ from, to, landed, energy, dart, cut, weapon }) => {
    shotT = performance.now();
    const own = AB.IsoParty.members().some((m) => Math.hypot(m.x - from.x, m.y - from.y) < 0.4);   // №109: турели и пушки — свой звук
    // №130: звук выстрела берётся из реестра оружия (js/data/weapons.js → sound.shot); нет записи — звук по умолчанию
    const ws = weapon && AB.Weapons ? AB.Weapons.sound(weapon, 'shot') : null;
    if (ws) play(ws, { x: from.x, y: from.y });
    else if (dart) synth('dart', from.x, from.y); else play(own ? 'plasma_shot' : 'turret_shot', { x: from.x, y: from.y });
    const wh = weapon && AB.Weapons ? AB.Weapons.sound(weapon, 'hit') : null;   // звук попадания оружия (если задан в реестре)
    if (landed && wh) play(wh, { x: to.x, y: to.y, delay: 0.05 });
    else if (landed && energy) play('plasma_hit', { x: to.x, y: to.y, delay: 0.05 });
  });
  B.on('combat:swing', ({ charId, landed }) => {
    if (performance.now() - shotT < 80) return;            // это был выстрел — его звук уже есть
    const m = AB.IsoParty.find(charId); if (!m) return;
    synth('whoosh', m.x, m.y);
    if (landed) { play('pipe_hit', { x: m.x, y: m.y, delay: 0.06 }); play('flesh_hit', { x: m.x, y: m.y, delay: 0.07, vol: 0.7 }); }
  });
  B.on('combat:overheated', ({ charId }) => { const m = AB.IsoParty.find(charId); if (m) synth('overheat', m.x, m.y); });
  B.on('echo:zap', (e) => { const l = listener(); synth('zap', e && e.x != null ? e.x : l && l.x, e && e.y != null ? e.y : l && l.y); });
  B.on('char:hit', ({ charId }) => { const m = AB.IsoParty.find(charId); if (m) play('flesh_hit', { x: m.x, y: m.y, vol: 0.8, rate: 0.85 }); });
  const kindOf = (id) => { const d = AB.ID.get(String(id).split('~')[0]) || {}; return d.type === 'boss' ? 'boss' : d.id === 'ENEMY-010' ? 'brute' : d.type === 'pursuer' ? 'pursuer' : 'mutant'; };
  B.on('enemy:state', ({ id, state, x, y }) => {
    const k = kindOf(id);
    if (state === 'ALERT' || (state === 'CHASE' && k === 'boss')) play(k === 'brute' ? 'brute_roar' : k === 'boss' ? 'boss_roar' : 'mutant_alert', { x, y, rate: k === 'pursuer' ? 0.7 : 1 });
    else if (state === 'ATTACK') { if (k === 'brute') play('brute_roar', { x, y, vol: 0.7 }); else if (k !== 'boss') play('mutant_attack', { x, y, rate: k === 'pursuer' ? 0.7 : 1 }); }
  });
  B.on('iso:enemyHit', ({ id, x, y }) => { if (Math.random() < 0.6) play('mutant_hurt', { x, y, delay: 0.08, rate: kindOf(id) === 'brute' ? 0.75 : 1 }); });
  B.on('enemy:dead', ({ id }) => { const e = AB.IsoEnemies && AB.IsoEnemies.get(id); const k = kindOf(id); if (e) play(k === 'boss' ? 'boss_roar' : 'mutant_death', { x: e.x, y: e.y, rate: k === 'brute' ? 0.8 : 1 }); });
  B.on('iso:door', ({ key }) => { const d = AB.IsoInteract && AB.IsoInteract.doors().find((q) => q.key === key); const t = d && d.tiles[0]; play('door', t ? { x: t[0] + 0.5, y: t[1] + 0.5 } : {}); });
  ['iso:world', 'iso:travel', 'equip:changed'].forEach((ev) => B.on(ev, () => setTimeout(ambience, 50)));
  // ---------- №109: мир и интерфейс ----------
  const ui = (g, opt) => play(g, opt);                  // без места — слышно одинаково везде
  B.on('door:denied', () => ui('ui_denied'));
  B.on('combat:noweapon', () => ui('ui_denied'));
  B.on('item:pickup', ({ added }) => { if (added !== false) ui('pickup'); });
  B.on('container:looted', () => ui('pickup'));
  B.on('quest:start', () => ui('quest_new', { delay: 0.15 }));
  B.on('quest:done', () => ui('quest_done'));
  B.on('equip:changed', ({ id, state }) => {
    if (state !== 'done') return;
    const l = listener();
    if (id === 'EQUIP-003') ui('power_on'); else play('spark', l ? { x: l.x, y: l.y } : {});   // генератор / починка, взлом
  });
  ['nest:start', 'guard:start', 'boss:start'].forEach((ev) => B.on(ev, () => ui('alarm')));
  B.on('enemy:emerge', ({ x, y }) => play('grate_break', { x, y, vol: 0.55, rate: 1.15 }));   // №127: монстр вылезает из шахты
  B.on('nest:turret', () => { const l = listener(); play('spark', l ? { x: l.x, y: l.y } : {}); });
  B.on('nest:breach', ({ key }) => { const d = AB.IsoInteract && AB.IsoInteract.doors().find((q) => q.key === key); const t = d && d.tiles[0]; play('grate_break', t ? { x: t[0] + 0.5, y: t[1] + 0.5 } : {}); });
  // кнопки — щелчок; окна — звук открытия/закрытия; карточка награды — нарастающий звук
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && b.id !== 'iso-snd' && ctx) ui('ui_click'); }, true);
  window.addEventListener('DOMContentLoaded', () => {
    const watch = (id, onShow, onHide) => { const el = document.getElementById(id); if (!el) return; let was = el.hidden; new MutationObserver(() => { if (el.hidden === was) return; was = el.hidden; if (!was) onShow && onShow(); else onHide && onHide(); }).observe(el, { attributes: true, attributeFilter: ['hidden'] }); };
    for (const id of ['iso-inv', 'iso-hero', 'iso-perks', 'iso-dev', 'bx-cat']) watch(id, () => ui('ui_open'), () => ui('ui_close'));
    watch('iso-reward', () => ui('reward'));
  });

  // ---------- каждый кадр: шаги, стоны, далёкие звуки ----------
  let distantT = rnd(...RULES.distant), moanT = rnd(...RULES.idleMoan), fixT = 1;
  function update(dt) {
    if (!ctx || !on) return;
    const l = listener();
    for (const m of [...AB.IsoParty.members(), ...AB.IsoParty.npcs()]) {
      if (m.hidden || m.ext) continue;
      const st = m.stride || 0, prev = m._sndStride == null ? st : m._sndStride, every = (m.run ? RULES.step.run : RULES.step.walk) * 50;
      if (st - prev >= every) { m._sndStride = st; play('step_boot', { x: m.x, y: m.y, vol: m === l ? RULES.step.lead : RULES.step.other, rate: m.run ? 1.04 : 0.96 }); }   // №109: ботинки вместо металла
      else if (st < prev) m._sndStride = st;
      else if (m._sndStride == null) m._sndStride = st;
    }
    // №109: тяжёлые шаги громилы и Колосса; стук починки решётки
    if (AB.IsoEnemies) for (const e of AB.IsoEnemies.alive()) {
      const k = kindOf(e.id); if (k !== 'brute' && k !== 'boss') continue;
      if (e._sx == null) { e._sx = e.x; e._sy = e.y; e._sd = 0; }
      e._sd += Math.hypot(e.x - e._sx, e.y - e._sy); e._sx = e.x; e._sy = e.y;
      if (e._sd > (k === 'boss' ? 1.3 : 0.95)) { e._sd = 0; play('heavy_step', { x: e.x, y: e.y, rate: k === 'boss' ? 0.75 : 0.95, vol: k === 'boss' ? 1 : 0.8 }); }
    }
    fixT -= dt;
    if (fixT <= 0) { fixT = rnd(0.9, 1.5); const r = AB.IsoParty.members().find((m) => m.repair && !m.path); if (r && AB.IsoNest && AB.IsoNest.active && AB.IsoNest.active()) play('grate_fix', { x: r.x, y: r.y }); }
    distantT -= dt; moanT -= dt;
    if (distantT <= 0 && l) { distantT = rnd(...RULES.distant); const a = Math.random() * 6.28; play('distant', { x: l.x + Math.cos(a) * 8, y: l.y + Math.sin(a) * 8, rate: rnd(0.7, 1.0) }); }
    if (moanT <= 0) {
      moanT = rnd(...RULES.idleMoan);
      const cand = AB.IsoEnemies ? AB.IsoEnemies.alive().filter((e) => ['IDLE', 'PATROL', 'CHASE'].includes(e.state) && kindOf(e.id) === 'mutant') : [];
      const e = cand[Math.floor(Math.random() * cand.length)]; if (e) play('mutant_idle', { x: e.x, y: e.y });
    }
  }

  // кнопка «звук»
  function toggle() {
    on = !on; try { localStorage.setItem('abyss_sound', on ? '1' : '0'); } catch (e) { /* без хранилища */ }
    if (out) out.gain.setTargetAtTime(on ? RULES.master : 0, ctx.currentTime, 0.1);
    const b = document.getElementById('iso-snd'); if (b) { b.textContent = on ? '🔊' : '🔇'; b.title = on ? 'Звук: вкл' : 'Звук: выкл'; }
    ambience();
  }
  window.addEventListener('DOMContentLoaded', () => { const b = document.getElementById('iso-snd'); if (b) { b.textContent = on ? '🔊' : '🔇'; b.addEventListener('click', (e) => { e.stopPropagation(); start(); toggle(); }); } });

  return { play, synth, update, toggle, start, RULES, on: () => on, ready: () => !!ctx };
})();
