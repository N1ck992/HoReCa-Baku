// =====================================================================
// ЭФФЕКТЫ АТАКИ ТЕХНИКИ НА КАРТАХ (дополнение №147). Кадры — assets/fx/<имя>/ (нарезаны
// tools/cut_fx.py из листа автора), описание кадров — frames.json того же листа, здесь — копия
// (чтобы не грузить JSON отдельно). Выстрел: заряд у орудия → сгусток летит к цели → взрыв на цели.
// Каждая карта заводит свой набор (AB.IsoVFX.create()), точки берёт функциями — эффект едет
// вместе с героем и целью. Масштаб — размер клетки карты.
// =====================================================================

AB.IsoVFX = (() => {
  // №147: энергетические сгустки экзокостюма (стиль «Аркейна») — лист автора, 6 + 6 + 10 кадров
  const SETS = {
    'suit-orb': {
      dir: 'assets/fx/suit-orb/',
      frames: {
        charge: [[121, 160, 52.9, 74.1], [127, 178, 62.3, 91.3], [145, 176, 71.3, 86.8], [137, 173, 71.4, 83.2], [145, 183, 77.4, 92.1], [153, 185, 77.2, 94.6]],
        fly: [[159, 155, 129.6, 80.7], [162, 154, 131.9, 79.5], [162, 155, 129.4, 81.4], [159, 155, 129.4, 83.7], [169, 155, 135.7, 83.4], [165, 155, 134.3, 83.2]],
        hit: [[187, 196, 131.0, 97.1], [163, 196, 100.0, 98.5], [164, 196, 98.5, 100.4], [173, 196, 106.9, 98.0], [344, 196, 178.7, 99.2], [183, 209, 91.5, 104.5], [170, 209, 85, 104.5], [185, 209, 92.5, 104.5], [213, 209, 106.5, 104.5], [222, 209, 111, 104.5]],
      },
      time: { charge: 0.04, fly: 0.05, hit: 0.05 },      // секунд на кадр
      size: { charge: 0.55, fly: 0.75, hit: 1.5 },       // высота кадра — доля клетки
      speed: 9,                                           // клеток в секунду в полёте
    },
  };
  const IMG = {};
  function load(name) {
    if (IMG[name]) return IMG[name];
    const S = SETS[name]; IMG[name] = {};
    for (const [k, list] of Object.entries(S.frames)) IMG[name][k] = list.map((_, i) => { const im = new Image(); im.src = `${S.dir}${k}_${i}.webp`; return im; });
    return IMG[name];
  }
  const ok = (im) => im && im.complete && im.naturalWidth;
  function create() {
    const list = [];                                       // { set, from(), to(), t, phase, fly, onHit }
    return {
      // выстрел: from/to — функции, дающие точку {x, y} в координатах карты; cell — размер клетки (пиксели карты)
      shot(set, from, to, cell, onHit) {
        if (!SETS[set]) { if (onHit) onHit(); return; }
        load(set);
        const a = from(), b = to(), d = Math.hypot(b.x - a.x, b.y - a.y) / cell;
        list.push({ set, from, to, cell, t: 0, phase: 'charge', fly: Math.max(0.12, d / SETS[set].speed), onHit, hitAt: null });
      },
      busy: () => list.length > 0,
      draw(g, dt) {
        for (let i = list.length - 1; i >= 0; i--) {
          const e = list[i], S = SETS[e.set], F = S.frames, I = IMG[e.set];
          e.t += dt;
          const tc = F.charge.length * S.time.charge, tf = tc + e.fly, th = tf + F.hit.length * S.time.hit;
          let k, n, p;
          if (e.t < tc) { k = 'charge'; n = Math.floor(e.t / S.time.charge); p = e.from(); }
          else if (e.t < tf) { k = 'fly'; n = Math.floor((e.t - tc) / S.time.fly) % F.fly.length; const a = e.from(), b = e.to(), u = (e.t - tc) / e.fly; p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; }
          else if (e.t < th) { if (!e.hitAt) { e.hitAt = e.t; if (e.onHit) e.onHit(); } k = 'hit'; n = Math.min(F.hit.length - 1, Math.floor((e.t - tf) / S.time.hit)); p = e.to(); }
          else { if (!e.hitAt && e.onHit) e.onHit(); list.splice(i, 1); continue; }
          const im = I[k][n], [w, h, ax, ay] = F[k][n]; if (!ok(im)) continue;
          const sc = (S.size[k] * e.cell) / 160;           // кадры ~160 px в высоту
          g.save(); g.translate(p.x, p.y);
          if (k === 'fly') { const a = e.from(), b = e.to(); g.rotate(Math.atan2(b.y - a.y, b.x - a.x)); }   // кадр полёта смотрит вправо
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55;          // свечение
          g.drawImage(im, -ax * sc, -ay * sc, w * sc, h * sc);
          g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.85;
          g.drawImage(im, -ax * sc, -ay * sc, w * sc, h * sc);
          g.restore();
        }
      },
    };
  }
  return { create, load, SETS };
})();
