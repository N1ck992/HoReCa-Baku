// =====================================================================
// ОФОРМЛЕНИЕ КАРТЫ ПОВЕРХНОСТИ (дополнение №204, решение автора 2026-11-26: «добавим дизайн карте»,
// «3D-эффект у сооружений»). Всё рисуется кодом, без картинок: один «солнечный» свет сверху-слева —
// у каждого объёма светлый верх, полутень слева, тень справа, тень на земле вправо-вниз.
// Местность и мелкие объёмные детали (камни, деревья, руины, кристаллы) — в запечённую карту (один раз);
// сооружения и атмосфера (тени облаков, пыль и споры, затемнение краёв) — каждый кадр.
// Когда автор пришлёт картинки сооружений — подставляются вместо этих (тени и свет остаются).
// =====================================================================

AB.SurfArt = (() => {
  const SUN = { x: 0.62, y: 0.36 };                 // куда падает тень (вправо-вниз), доля высоты
  const shade = (hex, m) => {                       // '#rrggbb' → темнее/светлее
    const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * m))));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  // тень на земле от предмета высотой h с основанием-ромбом (полуширина a, полуглубина b)
  function shadow(g, x, y, a, b, h, alpha = 0.32) {
    const dx = h * SUN.x, dy = h * SUN.y;
    g.fillStyle = `rgba(6,8,10,${alpha})`;
    g.beginPath(); g.moveTo(x - a, y); g.lineTo(x, y + b); g.lineTo(x + a, y); g.lineTo(x + a + dx, y + dy); g.lineTo(x + dx, y + b + dy); g.lineTo(x - a + dx, y + dy); g.closePath(); g.fill();
  }
  // изометрический блок: основание-ромб с центром (x, y), полуширина a, высота h; col — основной цвет
  function prism(g, x, y, a, h, col, opt = {}) {
    const b = a * (opt.deep || 0.5);
    if (!opt.noShadow) shadow(g, x, y, a, b, h, opt.sh ?? 0.3);
    g.fillStyle = shade(col, 0.82);                // левая грань — полутень
    g.beginPath(); g.moveTo(x - a, y - h); g.lineTo(x, y - h + b); g.lineTo(x, y + b); g.lineTo(x - a, y); g.closePath(); g.fill();
    g.fillStyle = shade(col, 0.58);                // правая — тень
    g.beginPath(); g.moveTo(x, y - h + b); g.lineTo(x + a, y - h); g.lineTo(x + a, y); g.lineTo(x, y + b); g.closePath(); g.fill();
    if (!opt.noTop) {
      g.fillStyle = shade(col, 1.12);              // верх — свет
      g.beginPath(); g.moveTo(x, y - h - b); g.lineTo(x + a, y - h); g.lineTo(x, y - h + b); g.lineTo(x - a, y - h); g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(255,240,220,.22)'; g.lineWidth = 0.8;   // светлая кромка по освещённым рёбрам
    g.beginPath(); g.moveTo(x - a, y - h); g.lineTo(x, y - h - b); g.lineTo(x + a, y - h); g.moveTo(x - a, y - h); g.lineTo(x - a, y); g.stroke();
    if (opt.windows) {                              // окна — тёплым светом на гранях
      g.fillStyle = opt.windows;
      for (let i = 0; i < 2; i++) { const t = 0.3 + i * 0.4; g.fillRect(x - a + a * t - 1.2, y - h * 0.62 + b * t, 2.4, 2.6); g.fillRect(x + a * t - 1.2, y - h * 0.62 + b * (1 - t), 2.4, 2.6); }
    }
    return { top: y - h, b };
  }
  // двускатная крыша над блоком (конёк вдоль левой грани)
  function gable(g, x, y, a, h, rh, col, curve) {
    const b = a * 0.5, t = y - h;
    g.fillStyle = shade(col, 0.95);
    g.beginPath(); g.moveTo(x - a - 2, t + 1); g.lineTo(x - a / 2, t - b / 2 - rh); g.lineTo(x + a / 2, t + b / 2 - rh); g.lineTo(x + 2, t + b + 1); g.closePath(); g.fill();
    g.fillStyle = shade(col, 0.62);
    g.beginPath(); g.moveTo(x + 2, t + b + 1); g.lineTo(x + a / 2, t + b / 2 - rh); g.lineTo(x + a + 2, t - 1); g.lineTo(x + a, t); g.closePath(); g.fill();
    g.fillStyle = shade(col, 1.15);
    g.beginPath(); g.moveTo(x - a / 2, t - b / 2 - rh); g.lineTo(x + a / 2, t + b / 2 - rh); g.lineTo(x + a / 2 + (curve ? 3 : 1), t + b / 2 - rh - (curve ? 3 : 1)); g.lineTo(x - a / 2 - (curve ? 3 : 1), t - b / 2 - rh - (curve ? 3 : 1)); g.closePath(); g.fill();
  }
  // пирамида (шатёр, крыша-шпиль)
  function pyramid(g, x, y, a, h, col, noShadow) {
    const b = a * 0.5;
    if (!noShadow) shadow(g, x, y, a, b, h * 0.7, 0.28);
    g.fillStyle = shade(col, 1.05); g.beginPath(); g.moveTo(x - a, y); g.lineTo(x, y - h); g.lineTo(x, y + b); g.closePath(); g.fill();
    g.fillStyle = shade(col, 0.62); g.beginPath(); g.moveTo(x, y + b); g.lineTo(x, y - h); g.lineTo(x + a, y); g.closePath(); g.fill();
  }
  // купол
  function dome(g, x, y, r, col) {
    shadow(g, x, y, r, r * 0.5, r * 0.9, 0.3);
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.8, r * 0.1, x, y - r * 0.3, r * 1.2);
    gr.addColorStop(0, shade(col, 1.35)); gr.addColorStop(0.55, shade(col, 0.9)); gr.addColorStop(1, shade(col, 0.5));
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI); g.ellipse(x, y, r, r * 0.95, 0, Math.PI, 0); g.fill();
  }
  // мачта со светом
  function mast(g, x, y, h, col, lamp, time) {
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + h * SUN.x, y + h * SUN.y); g.stroke();
    g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    if (lamp) { const a = 0.55 + 0.4 * Math.sin(time * 3 + x); const gr = g.createRadialGradient(x, y - h, 0, x, y - h, 7); gr.addColorStop(0, lamp.replace('A', a)); gr.addColorStop(1, lamp.replace('A', 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y - h, 7, 0, 7); g.fill(); }
  }
  // дерево: ствол + 2–3 кроны (свет слева-сверху) + тень
  function tree(g, x, y, sz, col, R) {
    g.fillStyle = 'rgba(6,10,8,.3)'; g.beginPath(); g.ellipse(x + sz * 0.9, y + sz * 0.3, sz * 0.95, sz * 0.4, 0, 0, 7); g.fill();
    g.fillStyle = '#3a2a1a'; g.fillRect(x - sz * 0.1, y - sz * 0.9, sz * 0.2, sz * 0.9);
    const n = 2 + (R() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const cx = x + (R() - 0.5) * sz * 0.5, cy = y - sz * (1.1 + i * 0.45), r = sz * (0.62 - i * 0.12);
      const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      gr.addColorStop(0, shade(col, 1.45)); gr.addColorStop(0.6, shade(col, 0.95)); gr.addColorStop(1, shade(col, 0.55));
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    }
  }
  // камень-многогранник
  function rock(g, x, y, sz, col) {
    g.fillStyle = 'rgba(6,8,10,.3)'; g.beginPath(); g.ellipse(x + sz * 0.55, y + sz * 0.15, sz * 0.9, sz * 0.36, 0, 0, 7); g.fill();
    g.fillStyle = shade(col, 1.2); g.beginPath(); g.moveTo(x - sz * 0.7, y); g.lineTo(x - sz * 0.35, y - sz * 0.75); g.lineTo(x + sz * 0.15, y - sz * 0.85); g.lineTo(x + sz * 0.05, y - sz * 0.2); g.closePath(); g.fill();
    g.fillStyle = shade(col, 0.62); g.beginPath(); g.moveTo(x + sz * 0.05, y - sz * 0.2); g.lineTo(x + sz * 0.15, y - sz * 0.85); g.lineTo(x + sz * 0.65, y - sz * 0.35); g.lineTo(x + sz * 0.6, y + sz * 0.05); g.closePath(); g.fill();
    g.fillStyle = shade(col, 0.85); g.beginPath(); g.moveTo(x - sz * 0.7, y); g.lineTo(x + sz * 0.05, y - sz * 0.2); g.lineTo(x + sz * 0.6, y + sz * 0.05); g.lineTo(x + sz * 0.1, y + sz * 0.2); g.closePath(); g.fill();
  }
  // кристалл (органика, руины Наследников)
  function crystal(g, x, y, sz, col) {
    g.fillStyle = 'rgba(6,8,10,.25)'; g.beginPath(); g.ellipse(x + sz * 0.5, y + sz * 0.12, sz * 0.6, sz * 0.22, 0, 0, 7); g.fill();
    g.fillStyle = shade(col, 1.35); g.beginPath(); g.moveTo(x - sz * 0.25, y); g.lineTo(x, y - sz * 1.3); g.lineTo(x, y + sz * 0.1); g.closePath(); g.fill();
    g.fillStyle = shade(col, 0.7); g.beginPath(); g.moveTo(x, y + sz * 0.1); g.lineTo(x, y - sz * 1.3); g.lineTo(x + sz * 0.28, y); g.closePath(); g.fill();
  }
  // объёмные детали местности — в запечённую карту (по виду клетки); R — свой генератор (детерминированно)
  function props(b, k, p, s, R) {
    const at = (sp = 1) => [p.x + (R() - 0.5) * s * 1.1 * sp, p.y + (R() - 0.5) * s * 0.62 * sp];
    const n = (v) => Math.floor(v + R());
    switch (k.kind) {
      case 'forest': for (let i = 0; i < 3; i++) { const [x, y] = at(); tree(b, x, y, s * (0.24 + R() * 0.1), '#3d6a32', R); } break;
      case 'mistwood': for (let i = 0; i < 3; i++) { const [x, y] = at(); tree(b, x, y, s * (0.24 + R() * 0.1), '#4a6a6a', R); } break;
      case 'meadow': for (let i = 0; i < n(0.6); i++) { const [x, y] = at(); rock(b, x, y, s * 0.12, '#7a7a68'); } if (R() < 0.35) { const [x, y] = at(); tree(b, x, y, s * 0.2, '#4f7a3a', R); } break;
      case 'scrub': for (let i = 0; i < n(1.2); i++) { const [x, y] = at(); rock(b, x, y, s * (0.1 + R() * 0.06), '#7a7058'); } break;
      case 'sand': case 'dune': if (R() < 0.45) { const [x, y] = at(); rock(b, x, y, s * (0.12 + R() * 0.1), '#b0895a'); } break;
      case 'salt': if (R() < 0.5) { const [x, y] = at(); crystal(b, x, y, s * 0.16, '#d8d2c0'); } break;
      case 'ruin': for (let i = 0; i < 2; i++) { const [x, y] = at(0.8); prism(b, x, y, s * (0.12 + R() * 0.08), s * (0.18 + R() * 0.3), '#8a7a62', { sh: 0.28 }); } break;
      case 'rustfoot': for (let i = 0; i < n(1.5); i++) { const [x, y] = at(); prism(b, x, y, s * 0.09, s * (0.08 + R() * 0.1), R() < 0.5 ? '#7a4a2a' : '#5a5f64', { sh: 0.25 }); } break;
      case 'growth': case 'thicket': for (let i = 0; i < n(1.4); i++) { const [x, y] = at(); crystal(b, x, y, s * (0.14 + R() * 0.1), R() < 0.5 ? '#b04a90' : '#7a5ab0'); } break;
      case 'marsh': case 'bog': case 'reeds': if (R() < 0.3) { const [x, y] = at(); rock(b, x, y, s * 0.12, '#4a5a50'); } break;
      case 'plaza': if (R() < 0.4) { const [x, y] = at(); prism(b, x, y, s * 0.1, s * 0.12, '#9a8a6a', { sh: 0.22 }); } break;
      default:
    }
  }
  // мягкий свет на клетке: светлее сверху-слева, темнее снизу-справа (запечённая карта)
  function lightTile(b, p, s, hexPath) {
    const gr = b.createLinearGradient(p.x - s, p.y - s * 0.7, p.x + s, p.y + s * 0.7);
    gr.addColorStop(0, 'rgba(255,244,220,.07)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.09)');
    hexPath(p.x, p.y, s * 1.02, b); b.fillStyle = gr; b.fill();
  }
  // скала/обрыв: тень на землю (до самой скалы) и боковые грани разной яркости
  function liftShadow(b, p, s, h, TILT) {
    const dx = h * SUN.x * 1.2, dy = h * SUN.y * 1.2;
    b.fillStyle = 'rgba(4,6,8,.34)'; b.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); const x = p.x + s * Math.cos(a) + dx, y = p.y + s * Math.sin(a) * TILT + dy; if (i) b.lineTo(x, y); else b.moveTo(x, y); }
    b.closePath(); b.fill();
  }
  function liftSides(b, p, s, h, col, TILT, rgb) {
    const v = (i, up) => { const a = Math.PI / 180 * (60 * i - 30); return [p.x + s * Math.cos(a), p.y + s * Math.sin(a) * TILT - (up ? h : 0)]; };
    const face = (i, m) => { const A = v(i), B = v(i + 1), C = v(i + 1, 1), D = v(i, 1); b.fillStyle = rgb(col, m); b.beginPath(); b.moveTo(...A); b.lineTo(...B); b.lineTo(...C); b.lineTo(...D); b.closePath(); b.fill(); };
    face(0, 0.42); face(1, 0.55); face(2, 0.78);  // правая — тень, нижняя правая — полутень, нижняя левая — свет
    const gr = b.createLinearGradient(0, p.y - h, 0, p.y + s * TILT);   // к земле — темнее (затенение у основания)
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.3)');
    b.fillStyle = gr; b.beginPath(); b.moveTo(...v(0)); for (let i = 1; i <= 3; i++) b.lineTo(...v(i)); for (let i = 3; i >= 0; i--) b.lineTo(...v(i, 1)); b.closePath(); b.fill();
  }
  // ---------- атмосфера (каждый кадр) ----------
  const motes = [];
  function atmosphere(g, view, time, dt, S0) {
    // тени облаков: большие мягкие пятна плывут по карте
    for (let i = 0; i < 4; i++) {
      const W = view.w + S0 * 30, x = view.x - S0 * 15 + ((time * 9 + i * 977) % W), y = view.y + view.h * ((i * 0.37 + 0.15) % 1), r = S0 * (7 + (i % 2) * 4);
      const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r); gr.addColorStop(0, 'rgba(8,10,16,.16)'); gr.addColorStop(1, 'rgba(8,10,16,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, 7); g.fill();
    }
    // пыль и споры в воздухе
    while (motes.length < 46) motes.push({ x: view.x + Math.random() * view.w, y: view.y + Math.random() * view.h, vx: 4 + Math.random() * 8, vy: -2 - Math.random() * 4, ph: Math.random() * 7, r: 0.6 + Math.random() * 1.3, spore: Math.random() < 0.3 });
    for (const m of motes) {
      m.x += m.vx * dt; m.y += (m.vy + Math.sin(time + m.ph) * 3) * dt;
      if (m.x > view.x + view.w || m.x < view.x || m.y < view.y || m.y > view.y + view.h) { m.x = view.x + Math.random() * view.w * 0.3; m.y = view.y + Math.random() * view.h; }
      const a = 0.25 + 0.25 * Math.sin(time * 1.7 + m.ph);
      g.fillStyle = m.spore ? `rgba(220,150,230,${a})` : `rgba(240,226,196,${a})`; g.beginPath(); g.arc(m.x, m.y, m.r, 0, 7); g.fill();
    }
  }
  // затемнение краёв экрана (в координатах экрана)
  function vignette(g, w, h) {
    const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.38)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  return { SUN, shade, shadow, prism, gable, pyramid, dome, mast, tree, rock, crystal, props, lightTile, liftShadow, liftSides, atmosphere, vignette };
})();
