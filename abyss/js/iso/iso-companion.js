// =====================================================================
// ISO COMPANION (дополнение №85). Дрон-спутник «ЭХО» — не отдельный боец,
// а устройство отряда (в отряде может быть только один спутник). Летает рядом
// с тем, кто ведёт отряд; учит игрока — короткие подсказки над собой в нужные
// моменты (каждая один раз); даёт бонус: вне боя подлатывает ведущего.
// Найден вместо Сайласа — в капсуле «Отсека на склоне» (акт III).
// Числа и реплики — черновик.
// =====================================================================

AB.IsoCompanion = (() => {
  const ID = 'EQUIP-016';
  const BONUS = { heal: 1.5, calm: 8, view: 1 };   // здоровья в секунду вне боя; «бой» — враг ближе 8 клеток; +1 клетка обзора на карте дна
  let has = false;
  const pos = { x: 0, y: 0, ok: false };
  let bubble = null;                                 // { text, t, life }
  const told = new Set();

  // реплики-подсказки (один раз каждая)
  const LINES = {
    hello: 'Я ЭХО. Буду рядом с тем, кто ведёт отряд: подскажу, куда идти, и подлатаю вне боя.',
    quest: 'Новая задача: {q}. Метка цели — на мини-карте внизу.',
    hurt: 'Здоровье ниже трети. Отойди от врагов — я подлатаю.',
    kill: 'С мутантов падает биоматериал — подбирай, он пригодится.',
    nest: 'Неси биоматериал к турелям — набралось нужное, и турель включится сама.',
    base: 'Это наша капсула. «Стройка» — отсеки и устройства. Начни с проводки от реактора: без неё устройство не поставить.',
    sea: 'На дне есть исполины. Первыми они не нападают — не трогай, и пройдут мимо.',
  };
  function say(key, text) {
    if (!has || (key && told.has(key))) return;
    if (key) told.add(key);
    const t = text || LINES[key];
    bubble = { text: t, t: 0, life: Math.max(4, t.length / 14) };
    if (AB.IsoOverworld && AB.IsoOverworld.isOpen()) AB.IsoOverworld.say(`ЭХО: ${t}`);
  }

  function give() {
    if (has) return;
    has = true;
    AB.Flags && AB.Flags.add('drone');
    const l = AB.IsoParty.lead(); if (l) { pos.x = l.x + 0.6; pos.y = l.y - 0.6; pos.ok = true; }
    AB.Bus.emit('iso:reward', { id: ID, kind: 'companion', name: 'ЭХО', stats: 'Подсказки · вне боя подлатывает ведущего (+1,5 здоровья в секунду)', hint: 'Летает рядом с тем, кто ведёт отряд' });
    setTimeout(() => say('hello'), 3800);
  }

  // ---------- подсказки по событиям ----------
  AB.Bus.on('quest:start', ({ name }) => setTimeout(() => say(null, LINES.quest.replace('{q}', name)), 1500));
  AB.Bus.on('enemy:dead', () => say('kill'));
  AB.Bus.on('nest:start', () => say('nest'));
  AB.Bus.on('base:view', ({ on }) => { if (on) setTimeout(() => say('base'), 2500); });
  AB.Bus.on('ow:enter', () => setTimeout(() => say('sea'), 2000));
  AB.Bus.on('char:hp', ({ charId, hp }) => {
    const l = AB.IsoParty.lead(); if (!l || charId !== l.id) return;
    const max = (AB.ID.get(charId).stats || {}).maxHp || 100;
    if (hp > 0 && hp < max / 3) say('hurt');
  });

  // ---------- кадр: летать за ведущим, лечить вне боя ----------
  // за кем летать: ведущий, а если его не видно (он снаружи в костюме) — первый видимый из отряда
  function host() {
    const l = AB.IsoParty.lead();
    if (l && !l.hidden) return l;
    return [...AB.IsoParty.members(), ...AB.IsoParty.npcs()].find((m) => !m.hidden) || null;
  }
  function update(dt) {
    if (!has) return;
    const l = host(); if (!l) return;
    const tx = l.x + 0.55, ty = l.y - 0.55;
    if (!pos.ok || Math.hypot(tx - pos.x, ty - pos.y) > 6) { pos.x = tx; pos.y = ty; pos.ok = true; }
    pos.x += (tx - pos.x) * Math.min(1, dt * 3); pos.y += (ty - pos.y) * Math.min(1, dt * 3);
    if (bubble) { bubble.t += dt; if (bubble.t > bubble.life) bubble = null; }
    const c = AB.Chars.get(l.id), max = c && ((AB.ID.get(l.id).stats || {}).maxHp || 100);
    const fight = AB.IsoEnemies.alive().some((e) => e.state !== 'DEAD' && e.state !== 'DORMANT' && Math.hypot(e.x - l.x, e.y - l.y) < BONUS.calm);
    if (c && !c.dead && c.hp < max && !fight) { c.hp = Math.min(max, c.hp + BONUS.heal * dt); pos.heal = 0.4; }
    if (pos.heal) pos.heal = Math.max(0, pos.heal - dt);
  }

  // ---------- рисование: шестигранный корпус-«гайка», глаз, створки, огонь двигателя ----------
  function draw(ctx, toScreen, time) {
    if (!has || !pos.ok) return;
    const l = host(); if (!l) return;
    const p = toScreen(pos.x, pos.y), y = p.y - 88 + Math.sin(time * 2.2) * 5, x = p.x;
    // тень на полу
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, p.y, 9, 4, 0, 0, 7); ctx.fill();
    // свечение
    const g = ctx.createRadialGradient(x, y, 0, x, y, 30); g.addColorStop(0, 'rgba(94,230,255,.35)'); g.addColorStop(1, 'rgba(94,230,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 30, y - 30, 60, 60);
    // луч лечения к ведущему
    if (pos.heal) { const q = toScreen(l.x, l.y); ctx.strokeStyle = `rgba(120,255,170,${0.5 * pos.heal / 0.4})`; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(q.x, q.y - 50); ctx.stroke(); ctx.setLineDash([]); }
    // огонёк двигателя
    ctx.fillStyle = `rgba(255,200,120,${0.5 + Math.sin(time * 18) * 0.2})`; ctx.beginPath(); ctx.ellipse(x, y + 12, 3, 5, 0, 0, 7); ctx.fill();
    // корпус: шесть створок вокруг ядра, медленно поворачиваются
    const rot = time * 0.6;
    for (let i = 0; i < 6; i++) {
      const a = rot + i * Math.PI / 3, a2 = a + Math.PI / 3 * 0.8, r0 = 6, r1 = 11.5;
      ctx.fillStyle = i % 2 ? '#8a939c' : '#c9a24a';
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.9);
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1 * 0.9);
      ctx.lineTo(x + Math.cos(a2) * r1, y + Math.sin(a2) * r1 * 0.9);
      ctx.lineTo(x + Math.cos(a2) * r0, y + Math.sin(a2) * r0 * 0.9);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // ядро с глазом, смотрит туда, куда идёт ведущий
    ctx.fillStyle = '#20262c'; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); ctx.fill();
    const ex = Math.max(-2, Math.min(2, (l.hx || 0) - (l.hy || 0)));
    ctx.fillStyle = '#5ee6ff'; ctx.beginPath(); ctx.arc(x + ex, y, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#e6fbff'; ctx.beginPath(); ctx.arc(x + ex - 0.8, y - 0.8, 1, 0, 7); ctx.fill();
    // подсказка над дроном
    if (bubble) {
      const a = Math.min(1, bubble.t * 4, (bubble.life - bubble.t) * 2);
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = '11px "Share Tech Mono", monospace'; ctx.textAlign = 'center';
      const words = bubble.text.split(' '), lines = []; let cur = '';
      for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > 230 && cur) { lines.push(cur); cur = w; } else cur = t; }
      lines.push(cur);
      const bw = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 16, bh = lines.length * 14 + 10, by = y - 24 - bh;
      ctx.fillStyle = 'rgba(6,12,16,.9)'; ctx.strokeStyle = 'rgba(94,230,255,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.rect(x - bw / 2, by, bw, bh); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5ee6ff'; ctx.fillText('ЭХО', x - bw / 2 + 16, by - 3);
      ctx.fillStyle = '#d9f6ff'; lines.forEach((s, i) => ctx.fillText(s, x, by + 17 + i * 14));
      ctx.restore();
    }
  }

  return { give, update, draw, say, has: () => has, viewBonus: () => (has ? BONUS.view : 0), BONUS };
})();
