// =====================================================================
// ISO SUIT (дополнение №56). Экзокостюм как транспорт: снаружи корабля
// (сектор с outside: true) Марка не видно — ходит костюм. Он занимает одну
// клетку, бьёт манипуляторами на 2 клетки (через одну), медленнее и крепче
// пешего героя. Скелет — js/data/rigs/EXOSUIT.js (11 частей); пока картинок
// нет, части рисуются заглушками тем же способом, что и кости героя:
// каждая часть — от сустава (pivot) до следующего сустава (end).
// draw() годится и для изометрии, и для карты дна из шестиугольников.
// =====================================================================

AB.IsoSuit = (() => {
  const R = () => AB.RIGS.EXOSUIT;
  // Марк снаружи — в костюме. Правило автора (№58): транспорт только вне зданий —
  // на корабле и в зданиях (секторы без outside) — только герои
  const suited = (m) => !!m && m.id === 'CHAR-001' && !!(AB.IsoWorld.layout() || {}).outside;
  const weapon = () => ({ id: 'EQUIP-005', name: 'Манипуляторы экзокостюма', short: 'МНП', weapon: { ...R().weapon, range: R().weapon.reachCells * 50 } });

  // поза из состояния персонажа: шаг (по пройденному пути), удар, урон, гибель
  function poseOf(m) {
    const swing = AB.IsoCombat && AB.IsoCombat.swingOf ? AB.IsoCombat.swingOf(m.id) : null;
    const tr = AB.Anim.current(m.id), c = AB.Chars.get(m.id);
    return {
      facing: m.facing || 1,
      phase: (m.stride || 0) / 78 * Math.PI * 2,
      moving: !!m.moving,
      attack: swing ? Math.min(1, swing.t / Math.max(0.2, swing.w.weapon.cooldown * 0.8)) : -1,
      hurt: tr && tr.action === 'hurt' && !tr.done ? 1 : 0,
      dead: !!(c && c.dead),
      t: performance.now() / 1000,
    };
  }

  // одна часть: «капсула» от a до b толщиной w, с бронепластиной и болтами
  function limb(g, a, b, w, col, dark, opt = {}) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    g.save(); g.translate(a.x, a.y); g.rotate(ang);
    g.fillStyle = dark; g.beginPath(); g.roundRect(-w * 0.35, -w / 2, len + w * 0.7, w, w * 0.45); g.fill();
    g.fillStyle = col; g.beginPath(); g.roundRect(-w * 0.2, -w / 2 + 2, len + w * 0.4, w - 6, w * 0.35); g.fill();
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(len * 0.25, -w / 2 + 2, 2, w - 4); g.fillRect(len * 0.7, -w / 2 + 2, 2, w - 4);
    g.restore();
    // сустав
    g.fillStyle = R().colors.joint; g.beginPath(); g.arc(a.x, a.y, w * 0.42, 0, 7); g.fill();
    g.fillStyle = R().colors.jointLight; g.beginPath(); g.arc(a.x, a.y, w * 0.2, 0, 7); g.fill();
    if (opt.claw) {
      // манипулятор: две губки
      g.save(); g.translate(b.x, b.y); g.rotate(ang);
      g.fillStyle = R().colors.joint;
      const o = opt.open || 0.3;
      g.beginPath(); g.moveTo(0, -3); g.lineTo(13, -6 - o * 6); g.lineTo(15, -2 - o * 4); g.lineTo(4, 1); g.fill();
      g.beginPath(); g.moveTo(0, 3); g.lineTo(13, 6 + o * 6); g.lineTo(15, 2 + o * 4); g.lineTo(4, -1); g.fill();
      g.restore();
    }
    if (opt.foot) {
      g.fillStyle = dark; g.beginPath(); g.roundRect(b.x - 8, b.y - 4, 26, 9, 3); g.fill();
      g.fillStyle = R().colors.joint; g.fillRect(b.x - 8, b.y + 3, 26, 3);
    }
  }

  // нарисовать костюм: (x, y) — точка на полу под ним, k — масштаб единиц
  function draw(g, pose, x, y, k = 1) {
    const r = R(), B = r.bones, C = r.colors;
    g.save(); g.translate(x, y); g.scale(k * pose.facing, k);
    if (pose.dead) { g.rotate(-1.35); g.translate(-20, -8); g.globalAlpha = 0.85; }
    const sw = Math.sin(pose.phase), amp = pose.moving ? 1 : 0;
    const bob = amp * Math.abs(sw) * 2.5 + (pose.moving ? 0 : Math.sin(pose.t * 2) * 0.8);
    const hip = { x: 0, y: r.hipY - bob };
    // ноги: тяжёлый шаг — маленький размах, колено сгибается при переносе ноги
    const leg = (s) => {
      const th = s * sw * 0.42 * amp, knee = amp * Math.max(0, -s * Math.cos(pose.phase)) * 0.7;
      const kneeP = { x: hip.x + Math.sin(th) * B.thigh, y: hip.y + Math.cos(th) * B.thigh };
      const sh = th - knee;
      const foot = { x: kneeP.x + Math.sin(sh) * B.shin, y: Math.min(-4, kneeP.y + Math.cos(sh) * B.shin) };
      return { kneeP, foot };
    };
    const ln = leg(1), lf = leg(-1);
    // корпус слегка наклонён вперёд, при ударе — сильнее
    const lean = 0.08 + (pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) * 0.18 : 0) - pose.hurt * 0.15;
    const sho = { x: hip.x + Math.sin(lean) * B.torso, y: hip.y - Math.cos(lean) * B.torso };
    const head = { x: sho.x + Math.sin(lean) * B.helmet, y: sho.y - Math.cos(lean) * B.helmet };
    // руки: в покое — висят и качаются против ног; при ударе ближняя бьёт вперёд
    // угол от вертикали вниз, «+» — вперёд (по направлению взгляда)
    const arm = (s, near) => {
      let ua = -s * sw * 0.3 * amp + 0.1, fa = ua + 0.35;
      if (near && pose.attack >= 0) { const a = Math.sin(pose.attack * Math.PI); ua = 1.5 * a + 0.1 * (1 - a); fa = ua + 0.1 * a + 0.35 * (1 - a); }
      const sp = { x: sho.x + (near ? 3 : -3), y: sho.y + 6 };
      const el = { x: sp.x + Math.sin(ua) * B.upperarm, y: sp.y + Math.cos(ua) * B.upperarm };
      const hd = { x: el.x + Math.sin(fa) * B.forearm, y: el.y + Math.cos(fa) * B.forearm };
      return { sp, el, hd, open: near && pose.attack >= 0 ? 1 - Math.sin(pose.attack * Math.PI) : 0.3 };
    };
    const an = arm(1, true), af = arm(-1, false);
    const far = (c) => c === C.hull ? C.hullDark : '#5e4a20';
    // тень
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, 0, 30, 7, 0, 0, 7); g.fill();
    // дальние части
    limb(g, af.sp, af.el, 15, far(C.hull), '#3a2e14');
    limb(g, af.el, af.hd, 17, far(C.hull), '#3a2e14', { claw: true, open: af.open });
    limb(g, hip, lf.kneeP, 18, far(C.hull), '#3a2e14');
    limb(g, lf.kneeP, lf.foot, 17, far(C.hull), '#3a2e14', { foot: true });
    // ранец-реактор за спиной: светится
    g.save(); g.translate(sho.x - 16, sho.y + 4); g.rotate(lean);
    g.fillStyle = '#3a3f44'; g.beginPath(); g.roundRect(-11, 0, 20, 38, 5); g.fill();
    g.fillStyle = C.reactor; g.globalAlpha = 0.6 + Math.sin(pose.t * 3) * 0.25; g.fillRect(-6, 8, 10, 4); g.fillRect(-6, 18, 10, 4); g.globalAlpha = 1;
    g.restore();
    // корпус
    g.save(); g.translate(hip.x, hip.y); g.rotate(lean);
    g.fillStyle = C.hullDark; g.beginPath(); g.roundRect(-17, -B.torso - 6, 34, B.torso + 12, 10); g.fill();
    g.fillStyle = C.hull; g.beginPath(); g.roundRect(-14, -B.torso - 3, 28, B.torso + 4, 8); g.fill();
    g.fillStyle = C.joint; g.fillRect(-14, -12, 28, 6);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(4, -B.torso + 6, 8, 16);
    g.restore();
    // шлем-купол с обзорным окном
    g.save(); g.translate(head.x, head.y); g.rotate(lean);
    g.fillStyle = C.hullDark; g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fill();
    g.fillStyle = C.hull; g.beginPath(); g.arc(-1, -1, 13, 0, 7); g.fill();
    g.fillStyle = '#0b1418'; g.beginPath(); g.ellipse(6, 0, 7, 8, 0, 0, 7); g.fill();
    g.fillStyle = C.visor; g.globalAlpha = 0.75; g.beginPath(); g.ellipse(8, -1, 3.5, 5, 0, 0, 7); g.fill(); g.globalAlpha = 1;
    g.restore();
    // ближние части
    limb(g, hip, ln.kneeP, 19, C.hull, C.hullDark);
    limb(g, ln.kneeP, ln.foot, 18, C.hull, C.hullDark, { foot: true });
    limb(g, an.sp, an.el, 16, C.hull, C.hullDark);
    limb(g, an.el, an.hd, 18, C.hull, C.hullDark, { claw: true, open: an.open });
    // вспышка урона
    if (pose.hurt) {
      // удар по корпусу: красное свечение вокруг костюма (без заливки фона)
      const rg = g.createRadialGradient(0, -75, 10, 0, -75, 70);
      rg.addColorStop(0, 'rgba(255,80,60,.35)'); rg.addColorStop(1, 'rgba(255,80,60,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(0, -75, 45, 80, 0, 0, 7); g.fill();
    }
    g.restore();
  }

  return { suited, weapon, poseOf, draw, rig: R };
})();
