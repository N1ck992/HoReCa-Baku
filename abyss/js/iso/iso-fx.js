// =====================================================================
// ISO FX (дополнение №111, патч v46). Экшен боя:
//   • стоп-кадр на попадании (игра замирает на доли секунды — удар ощущается);
//   • тряска экрана, брызги биомассы и искры, пятна на полу;
//   • рывок ведущего (пробел / кнопка »): короткий бросок в сторону движения,
//     на это время удары врагов проходят мимо;
//   • красные зоны на полу перед ударом врага — видно, куда ударит; промах — враг
//     на мгновение открыт.
// Числа — RULES ниже (черновик).
// =====================================================================

AB.IsoFX = (() => {
  const RULES = {
    hitstop: { hit: 0.045, heavy: 0.09, kill: 0.07, hurt: 0.06 },
    shake: { hit: [0.1, 0.5], heavy: [0.18, 1.1], kill: [0.16, 0.8], big: [0.4, 2.2], hurt: [0.16, 0.9] },
    dash: { dist: 2.6, time: 0.18, iframes: 0.3, cooldown: 0.65 },
    combo: { window: 0.55, dmg: [1, 1.1, 1.6], knock: [1, 1.2, 2.0] },   // серия ударов: третий — тяжёлый
    whiff: 0.6,                                                          // промах врага — открыт на N секунд
    decals: 60,
  };
  let stop = 0, hurtFlash = 0;
  const parts = [], decals = [];
  const fx = () => AB.IsoStory.fx;

  // ---------- время: стоп-кадр ----------
  function hitstop(s) { stop = Math.max(stop, s); }
  function step(dt) { if (stop > 0) { stop -= dt; return dt * 0.04; } return dt; }   // игра почти стоит, кадр рисуется
  function shake([d, p]) { const f = fx(); f.shake = Math.max(f.shake, d); f.shakePower = Math.max(f.shake > 0 ? f.shakePower : 0, p); }

  // ---------- брызги и искры ----------
  const PAL = { bio: ['#9bd14a', '#6f9c2c', '#c8e86a', '#3d5a1c'], blood: ['#a3181a', '#6e0e10', '#d12a25'], spark: ['#fff3c4', '#ffd36a', '#ff9a3c'], metal: ['#cfd6dc', '#8d969e', '#fff3c4'] };
  function burst(x, y, dx, dy, kind, n) {
    const pal = PAL[kind] || PAL.bio, l = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy / l, dx / l) + (Math.random() - 0.5) * 1.6, sp = (kind === 'spark' ? 5 : 2.6) * (0.4 + Math.random());
      parts.push({ x, y, z: 0.9 + Math.random() * 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 1.5 + Math.random() * 2.5, life: kind === 'spark' ? 0.35 : 0.9, t: 0, col: pal[i % pal.length], size: kind === 'spark' ? 1.6 : 2.2 + Math.random() * 2, kind });
    }
  }
  function decal(x, y, kind, r) {
    decals.push({ x, y, r: r * (0.7 + Math.random() * 0.6), col: kind === 'blood' ? 'rgba(90,10,12,' : 'rgba(70,105,28,', a: 0.55, rot: Math.random() * 3 });
    while (decals.length > RULES.decals) decals.shift();
  }
  function update(dt) {
    hurtFlash = Math.max(0, hurtFlash - dt * 2.5);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 9 * dt; p.vx *= 0.97; p.vy *= 0.97;
      if (p.z <= 0) { if (p.kind !== 'spark' && Math.random() < 0.35) decal(p.x, p.y, p.kind, 0.12); parts.splice(i, 1); continue; }
      if (p.t > p.life) parts.splice(i, 1);
    }
    for (const d of decals) d.a = Math.max(0.12, d.a - dt * 0.004);   // пятна медленно бледнеют, но остаются
  }

  // ---------- события боя ----------
  // попадание по врагу (из боя): heavy — третий удар серии
  function impact(e, from, heavy, kill) {
    const dx = e.x - from.x, dy = e.y - from.y, d = AB.ID.get(String(e.id).split('~')[0]) || {};
    const metal = d.type === 'boss' || d.type === 'pursuer';
    burst(e.x, e.y, dx, dy, metal ? 'metal' : 'bio', heavy ? 16 : 9);
    if (heavy || metal) burst(e.x, e.y, dx, dy, 'spark', heavy ? 8 : 4);
    if (!metal) decal(e.x + dx * 0.2, e.y + dy * 0.2, 'bio', heavy ? 0.35 : 0.22);
    hitstop(kill ? RULES.hitstop.kill : heavy ? RULES.hitstop.heavy : RULES.hitstop.hit);
    shake(kill ? (d.id === 'ENEMY-010' || d.type === 'boss' ? RULES.shake.big : RULES.shake.kill) : heavy ? RULES.shake.heavy : RULES.shake.hit);
    // отдача: героя чуть отталкивает назад
    if (from && from.x != null && AB.IsoWorld) { const n = Math.hypot(dx, dy) || 1; AB.IsoWorld.move(from, -dx / n * (heavy ? 0.16 : 0.08), -dy / n * (heavy ? 0.16 : 0.08)); }
  }
  AB.Bus.on('enemy:dead', ({ id }) => {
    const e = AB.IsoEnemies && AB.IsoEnemies.get(id); if (!e) return;
    const l = AB.IsoParty.lead() || e;
    burst(e.x, e.y, e.x - l.x, e.y - l.y, 'bio', 22); decal(e.x, e.y, 'bio', 0.5);
  });
  AB.Bus.on('iso:charHit', ({ id, x, y }) => {
    burst(x, y, Math.random() - 0.5, Math.random() - 0.5, 'blood', 6); decal(x, y, 'blood', 0.16);
    const l = AB.IsoParty.lead(); if (l && l.id === id) { hurtFlash = 1; hitstop(RULES.hitstop.hurt); shake(RULES.shake.hurt); }
  });

  // ---------- рывок ----------
  let dashCd = 0;
  function dash(input) {
    const l = AB.IsoParty.lead(); if (!l || dashCd > 0 || l.dashT > 0) return false;
    const c = AB.Chars.get(l.id); if (!c || c.dead) return false;
    if (AB.IsoSuit && AB.IsoSuit.suited(l)) return false;       // в тяжёлом костюме не прыгнешь
    let dx = input && input.x, dy = input && input.y;
    if (!dx && !dy) { dx = l.hx || 1; dy = l.hy || 0; }
    const n = Math.hypot(dx, dy) || 1;
    l.dashX = dx / n; l.dashY = dy / n; l.dashT = RULES.dash.time; l.iframes = RULES.dash.iframes; l.path = null; l.goal = null;
    l.hx = l.dashX; l.hy = l.dashY; const sx = l.hx - l.hy; if (Math.abs(sx) > 0.05) l.facing = sx > 0 ? 1 : -1;
    dashCd = RULES.dash.cooldown;
    for (let i = 0; i < 6; i++) parts.push({ x: l.x, y: l.y, z: 0.1, vx: -l.dashX * (1 + Math.random()) + (Math.random() - 0.5), vy: -l.dashY * (1 + Math.random()) + (Math.random() - 0.5), vz: 0.6, life: 0.4, t: 0, col: 'rgba(200,210,220,0.6)', size: 3, kind: 'spark' });
    AB.Bus.emit('iso:dash', { id: l.id, x: l.x, y: l.y });
    return true;
  }
  // вызывается до движения отряда; true — ведущий сейчас в рывке (управление ждёт)
  function dashUpdate(dt) {
    dashCd = Math.max(0, dashCd - dt);
    let busy = false;
    for (const m of AB.IsoParty.members()) {
      if (m.iframes > 0) m.iframes -= dt;
      if (!(m.dashT > 0)) continue;
      const sp = RULES.dash.dist / RULES.dash.time, k = Math.min(dt, m.dashT);
      m.dashT -= dt; busy = true;
      AB.IsoWorld.move(m, m.dashX * sp * k, m.dashY * sp * k);
      m.trail = m.trail || []; m.trail.push({ x: m.x, y: m.y, t: 0.18 });
      m.moving = true; m.run = true;
      if (m.action !== 'run') { m.action = 'run'; AB.Anim.play(m.id, 'run'); }
    }
    for (const m of AB.IsoParty.members()) if (m.trail) { for (const p of m.trail) p.t -= dt; m.trail = m.trail.filter((p) => p.t > 0); }
    return busy;
  }
  const invulnerable = (m) => !!m && m.iframes > 0;

  // ---------- рисование ----------
  // на полу: пятна и красные зоны замаха врагов
  function drawGround(ctx, toScreen) {
    for (const d of decals) {
      const p = toScreen(d.x, d.y), r = d.r * 32;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5); ctx.rotate(d.rot);
      ctx.fillStyle = d.col + d.a + ')'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.7, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.7, r * 0.3, r * 0.3, r * 0.22, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    if (!AB.IsoEnemies) return;
    for (const e of AB.IsoEnemies.alive()) {
      if (e.state !== 'ATTACK' || e.hitDone || e.turret != null || e.door) continue;
      const d = AB.ID.get(String(e.id).split('~')[0]); if (!d || !d.attack) continue;
      const k = Math.min(1, e.t / d.attack.windup), R = d.attack.range / 50 + 0.45;
      const boss = d.type === 'boss', half = boss ? Math.PI : d.id === 'ENEMY-010' ? 0.95 : 0.7;
      const a0 = Math.atan2(e.hy || 0, e.hx || 1);
      const shape = (r) => {
        ctx.beginPath();
        if (!boss) { const c = toScreen(e.x, e.y); ctx.moveTo(c.x, c.y); }
        for (let i = 0; i <= 16; i++) { const a = a0 - half + (2 * half * i) / 16, p = toScreen(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r); ctx.lineTo(p.x, p.y); }
        ctx.closePath();
      };
      ctx.save();
      shape(R); ctx.fillStyle = `rgba(255,40,30,${0.08 + 0.1 * k})`; ctx.fill(); ctx.strokeStyle = `rgba(255,70,50,${0.35 + 0.4 * k})`; ctx.lineWidth = 1.5; ctx.stroke();
      shape(R * k); ctx.fillStyle = `rgba(255,50,35,${0.2 + 0.25 * k})`; ctx.fill();
      ctx.restore();
    }
  }
  // над сценой: брызги, искры, след рывка; красная кромка экрана при ранении — в draw2d
  function draw(ctx, toScreen) {
    for (const m of AB.IsoParty.members()) if (m.trail) for (const p of m.trail) {
      const s = toScreen(p.x, p.y); ctx.fillStyle = `rgba(94,230,255,${p.t * 1.6})`; ctx.beginPath(); ctx.ellipse(s.x, s.y - 30, 7, 24, 0, 0, 7); ctx.fill();
    }
    for (const p of parts) {
      const s = toScreen(p.x, p.y); ctx.fillStyle = p.col; ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillRect(s.x - p.size / 2, s.y - p.z * 32 - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
  function draw2d(ctx, w, h) {
    if (hurtFlash <= 0) return;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(160,0,0,0)'); g.addColorStop(1, `rgba(170,10,10,${0.45 * hurtFlash})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  // кнопки на телефоне
  window.addEventListener('DOMContentLoaded', () => {
    const atk = document.getElementById('iso-btn-atk'), ds = document.getElementById('iso-btn-dash');
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    if (atk) atk.addEventListener('pointerdown', (e) => { stop(e); if (!(AB.IsoStory.locked() || AB.IsoGame.busy())) AB.IsoCombat.attackNearest(); });
    if (ds) ds.addEventListener('pointerdown', (e) => { stop(e); if (!(AB.IsoStory.locked() || AB.IsoGame.busy())) dash(AB.IsoInput.update(0)); });
    setInterval(() => { if (ds) ds.classList.toggle('cd', dashCd > 0); }, 100);
  });
  return { RULES, step, hitstop, shake, burst, impact, update, dash, dashUpdate, invulnerable, drawGround, draw, draw2d, dashReady: () => dashCd <= 0, decals: () => decals.length };
})();
