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
  // №121: у доктора Хейл свой костюм (медицинская переделка той же модели)
  const ART_OF = { 'CHAR-003': 'EXOSUIT_HALE_ART' };
  const SWING = { EXOSUIT_HALE_ART: 0.5 };
  const artName = (id) => (ART_OF[id] && AB.RIGS[ART_OF[id]] ? ART_OF[id] : 'EXOSUIT_ART');
  const suited = (m) => !!m && (m.id === 'CHAR-001' || m.id === 'CHAR-003') && !!(AB.IsoWorld.layout() || {}).outside;
  const weapon = () => ({ id: 'EQUIP-005', name: 'Манипуляторы экзокостюма', short: 'МНП', weapon: { ...R().weapon, range: R().weapon.reachCells * 50 } });

  // поза из состояния персонажа: шаг (по пройденному пути), удар, урон, гибель
  function poseOf(m) {
    const swing = AB.IsoCombat && AB.IsoCombat.swingOf ? AB.IsoCombat.swingOf(m.id) : null;
    const tr = AB.Anim.current(m.id), c = AB.Chars.get(m.id);
    return {
      id: m.id,
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

  // ---------- №62: костюм по картинке, нарезанной на части (js/data/rigs/EXOSUIT_ART.js) ----------
  const IMGS = {}, READY = {};
  function loadArt(key) {
    const A = AB.RIGS[key];
    if (!A || IMGS[key]) return;
    const set = IMGS[key] = {};
    let n = 0;
    for (const [name, part] of Object.entries(A.parts)) {
      const im = new Image();
      im.onload = () => { if (++n === Object.keys(A.parts).length) READY[key] = true; };
      im.src = part.file;
      set[name] = im;
    }
  }
  loadArt('EXOSUIT_ART'); loadArt('EXOSUIT_HALE_ART');
  function drawArt(g, pose, x, y, k) {
    const key = artName(pose.id), A = AB.RIGS[key], J = A.joints, P = A.parts, imgs = IMGS[key];
    const s = k * (R().height / A.heightPx);                      // экранных px на px исходника
    const sw = Math.sin(pose.phase), amp = pose.moving ? 1 : 0;
    const bob = (amp * Math.abs(sw) * 2.5 + (pose.moving ? 0 : Math.sin(pose.t * 2) * 0.8)) * (A.heightPx / R().height);
    const atk = pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) : 0;
    const lean = 0.03 + atk * 0.12 - pose.hurt * 0.1;
    const piv = (p, a) => { g.translate(p[0], p[1]); g.rotate(a); g.translate(-p[0], -p[1]); };
    const put = (name, dark) => {
      const im = imgs[name], p = P[name];
      if (!im || !im.complete) return;
      if (dark) g.filter = 'brightness(0.72)';
      g.drawImage(im, p.x, p.y, p.w, p.h);
      if (dark) g.filter = 'none';
    };
    g.save();
    g.translate(x, y); g.scale(s * pose.facing, s); g.translate(-J.hip[0], -A.soleY);
    if (pose.dead) { piv([J.hip[0], A.soleY], -1.35); g.globalAlpha = 0.85; }
    // тень
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(J.hip[0] + 40, A.soleY, 300, 60, 0, 0, 7); g.fill();
    // ноги: тяжёлый шаг (бедро качается, колено сгибается при переносе)
    const leg = (side, sgn) => {
      g.save();
      g.translate(0, -bob * 0.3);
      const th = -sgn * sw * 0.32 * amp, kn = amp * Math.max(0, -sgn * Math.cos(pose.phase)) * 0.55;
      // №121: дальняя нога почти не видна на картинке — рисуем копию ближней, сдвинутую к дальнему бедру
      const src = A.farFromNear && side === 'far' ? 'near' : side;
      if (src !== side) g.translate(J.hip_far[0] - J.hip_near[0], J.hip_far[1] - J.hip_near[1]);
      piv(J[`hip_${src}`], th);
      put(`thigh_${src}`, side === 'far');
      piv(J[`knee_${src}`], kn);
      put(`shin_${src}`, side === 'far');
      g.restore();
    };
    leg('far', -1);
    // корпус наклоняется целиком; кулак — вращается в локте
    g.save();
    g.translate(0, -bob);
    piv([J.hip[0], J.hip[1]], lean);
    put('body');
    g.restore();
    leg('near', 1);
    g.save();
    g.translate(0, -bob);
    piv([J.hip[0], J.hip[1]], lean);
    const fa = -atk * (SWING[key] || 1.0) + (amp ? sw * 0.12 : 0);   // №121: Хейл целится инжектором — рука поднимается меньше
    piv(J.elbow, fa);
    put('forearm_near');
    g.restore();
    if (pose.hurt) {
      const rg = g.createRadialGradient(J.hip[0], J.hip[1] - 300, 40, J.hip[0], J.hip[1] - 300, 700);
      rg.addColorStop(0, 'rgba(255,80,60,.3)'); rg.addColorStop(1, 'rgba(255,80,60,0)');
      g.fillStyle = rg; g.fillRect(J.hip[0] - 700, J.hip[1] - 1000, 1400, 1400);
    }
    g.restore();
  }

  // ---------- №122: костюм по готовым кадрам ходьбы (лист автора) — у доктора Хейл ----------
  const FRAMES_OF = { 'CHAR-003': 'EXOSUIT_HALE_WALK' };
  const FIMG = {};
  function loadFrames(key) {
    const A = AB.RIGS[key]; if (!A || FIMG[key]) return;
    FIMG[key] = {};
    for (const [side, list] of Object.entries(A.frames)) FIMG[key][side] = list.map((f) => { const im = new Image(); im.src = f.file; return im; });
  }
  Object.values(FRAMES_OF).forEach(loadFrames);
  function drawFrames(g, pose, x, y, k, key) {
    const A = AB.RIGS[key], side = pose.facing >= 0 ? 'right' : 'left';
    const n = pose.moving ? A.walk[Math.floor((((pose.phase / (Math.PI * 2)) % 1) + 1) % 1 * A.walk.length)] : A.idle;
    const f = A.frames[side][n], im = FIMG[key][side][n];
    if (!im || !im.complete || !im.naturalWidth) return false;
    const s = k * (R().height / A.heightPx), dir = pose.facing >= 0 ? 1 : -1;
    const atk = pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) : 0;
    const bob = pose.moving ? 0 : Math.sin(pose.t * 2) * 0.8 * k;
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, 0, f.w * s * 0.42, f.w * s * 0.1, 0, 0, 7); g.fill();
    if (pose.dead) { g.rotate(-1.35 * dir); g.globalAlpha = 0.85; }
    else g.rotate((0.04 + atk * 0.1 - pose.hurt * 0.08) * dir);   // наклон: удар — вперёд, урон — назад
    g.drawImage(im, -f.ax * s + atk * 6 * k * dir, -f.ay * s - bob, f.w * s, f.h * s);
    if (pose.hurt) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,80,60,.25)'; g.fillRect(-f.ax * s, -f.ay * s, f.w * s, f.h * s); }
    g.restore();
    return true;
  }

  // нарисовать костюм: (x, y) — точка на полу под ним, k — масштаб единиц
  function draw(g, pose, x, y, k = 1) {
    { const fk = FRAMES_OF[pose.id]; if (fk && AB.RIGS[fk] && drawFrames(g, pose, x, y, k, fk)) return; }
    if (READY[artName(pose.id)]) { drawArt(g, pose, x, y, k); return; }
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
