// =====================================================================
// Рендерер: вид сбоку, камера, свет, частицы, пост-обработка.
// Только рисует: игровую логику не меняет (GDD §2.1).
//
// Пока в ASSET MANIFEST нет файлов, всё рисуется временными заглушками
// (greybox) и каждая подписана своим ASSET-ID (GDD §11).
// Когда файл появится, вместо заглушки будет нарисована картинка.
// =====================================================================

AB.Render = (() => {
  const VH = 480;               // высота видимой области в единицах мира
  const FLOOR = VH - 58;        // экранная высота пола
  const U = AB.util;

  let cv, ctx, lightCv, lctx, grainCv;
  let dpr = 1, scale = 1, VW = 800;
  const cam = { x: 0, sway: 0 };
  let staticLayer = null;       // кэш неподвижного фона текущего помещения
  let staticFor = null;
  let showIds = true;           // подписи заглушек
  let time = 0;
  const particles = [];
  const decals = new Map();     // roomId -> пятна крови на полу
  let shake = 0;                // тряска камеры
  let hurtFlash = 0;            // красная вспышка при получении урона

  // ---------- Инициализация ----------
  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext('2d');
    lightCv = document.createElement('canvas');
    lctx = lightCv.getContext('2d');
    grainCv = makeGrain();
    resize();
    window.addEventListener('resize', resize);
    AB.Bus.on('room:enter', () => { staticFor = null; particles.length = 0; snapCamera(); });
    AB.Bus.on('asset:ready', () => { staticFor = null; });
    AB.Bus.on('enemy:hit', ({ x, from }) => { bleed(x, -40, Math.sign(x - from) || 1, 18); shake = Math.max(shake, 5); });
    AB.Bus.on('enemy:dead', () => { shake = Math.max(shake, 8); });
    AB.Bus.on('char:hit', ({ charId, from }) => {
      const c = AB.Chars.get(charId);
      if (c) bleed(c.x, -70, Math.sign(c.x - from) || 1, 10);
      hurtFlash = 1; shake = Math.max(shake, 10);
    });
    AB.Bus.on('combat:swing', ({ landed }) => { if (!landed) shake = Math.max(shake, 1.5); });
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    lightCv.width = cv.width;
    lightCv.height = cv.height;
    scale = cv.height / VH;
    VW = cv.width / scale;
  }

  function makeGrain() {
    const g = document.createElement('canvas');
    g.width = g.height = 256;
    const gx = g.getContext('2d');
    const img = gx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gx.putImageData(img, 0, 0);
    return g;
  }

  // ---------- Камера ----------
  function camTarget() {
    const hero = AB.Chars.get('CHAR-001');
    const r = AB.Rooms.room();
    if (!hero || !r) return 0;
    const look = hero.facing * VW * 0.08;
    const tx = hero.x - VW / 2 + look;
    if (r.width <= VW) return (r.width - VW) / 2;
    return U.clamp(tx, 0, r.width - VW);
  }

  function snapCamera() { cam.x = camTarget(); }

  // мир → экран (в единицах VH)
  const sx = (x) => x - cam.x;
  const sy = (y) => FLOOR + y;

  // ---------- Свет ----------
  function flicker(l, i) {
    // плавное мерцание + редкие провалы у неисправных ламп
    const n = Math.sin(time * 13.1 + i * 7) * 0.5 + Math.sin(time * 31.7 + i * 3) * 0.3 + Math.sin(time * 4.3 + i) * 0.2;
    let k = 1 - l.flicker * (0.5 + n * 0.5);
    if (l.flicker > 0.3) {
      const blink = Math.sin(time * 2.3 + i * 11) + Math.sin(time * 5.9 + i * 2);
      if (blink > 1.55) k *= 0.08;
    }
    if (l.source === 'pod') {
      const st = AB.Rooms.propState(`${AB.Rooms.current()}:cryopod-main`);
      if (st && st.state !== 'closed') k *= Math.max(0.25, 1 - st.t * 0.25);
    }
    return U.clamp(k, 0, 1);
  }

  function alarmPulse() {
    return AB.Story.fx.alarm ? (Math.sin(time * 3.2) + 1) / 2 : 0;
  }

  // ---------- Неподвижный фон (кэш) ----------
  function buildStatic(r) {
    const K = 1.5; // пикселей на единицу мира в кэше
    const c = document.createElement('canvas');
    c.width = Math.ceil(r.width * K);
    c.height = Math.ceil(VH * K);
    const g = c.getContext('2d');
    g.scale(K, K);
    const rng = U.rng(r.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0));
    const top = sy(-r.height);
    const bg = AB.Assets.get(r.background);

    if (bg.status === 'ready') {
      g.drawImage(bg.img, 0, 0, r.width, VH);
    } else {
      drawGreyboxRoom(g, r, rng, top);
    }
    return { canvas: c, K };
  }

  function drawGreyboxRoom(g, r, rng, top) {
    const med = r.theme === 'medbay';
    // пространство над потолком и под полом — тёмные конструкции
    g.fillStyle = '#07080a';
    g.fillRect(0, 0, r.width, VH);

    // задняя стена
    const wall = g.createLinearGradient(0, top, 0, FLOOR);
    wall.addColorStop(0, med ? '#1d2224' : '#181b1f');
    wall.addColorStop(1, med ? '#2a302f' : '#22262b');
    g.fillStyle = wall;
    g.fillRect(0, top, r.width, FLOOR - top);

    // панели стены
    const pw = med ? 110 : 140;
    for (let x = 0; x < r.width; x += pw) {
      const missing = rng() < 0.07;
      const h0 = top + 46, h1 = FLOOR - 26;
      if (missing) {
        // снятая панель: видны кабели
        g.fillStyle = '#0b0c0e';
        g.fillRect(x + 4, h0, pw - 8, h1 - h0);
        g.strokeStyle = '#2b2420';
        g.lineWidth = 3;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          const cx = x + 14 + k * (pw - 28) / 3;
          g.moveTo(cx, h0);
          g.bezierCurveTo(cx + 20, h0 + 80, cx - 20, h1 - 90, cx + 6, h1);
          g.stroke();
        }
        continue;
      }
      const shade = 0.85 + rng() * 0.25;
      g.fillStyle = med ? `rgba(${70 * shade},${82 * shade},${80 * shade},0.35)` : `rgba(${60 * shade},${66 * shade},${74 * shade},0.35)`;
      g.fillRect(x + 4, h0, pw - 8, h1 - h0);
      // фаска
      g.strokeStyle = 'rgba(255,255,255,.05)';
      g.lineWidth = 1;
      g.strokeRect(x + 4.5, h0 + 0.5, pw - 9, h1 - h0 - 1);
      g.strokeStyle = 'rgba(0,0,0,.6)';
      g.beginPath();
      g.moveTo(x + 4, h1); g.lineTo(x + pw - 4, h1); g.lineTo(x + pw - 4, h0);
      g.stroke();
      // заклёпки
      g.fillStyle = 'rgba(0,0,0,.45)';
      for (const [rx, ry] of [[10, 8], [pw - 18, 8], [10, h1 - h0 - 12], [pw - 18, h1 - h0 - 12]]) {
        g.beginPath(); g.arc(x + rx + 4, h0 + ry, 1.6, 0, 7); g.fill();
      }
      if (med && rng() < 0.6) {
        // плитка медотсека
        g.strokeStyle = 'rgba(0,0,0,.25)';
        for (let ty = h0 + 40; ty < h1; ty += 40) { g.beginPath(); g.moveTo(x + 4, ty); g.lineTo(x + pw - 4, ty); g.stroke(); }
      }
      if (!med && rng() < 0.5) {
        // рёбра жёсткости коридора
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(x + pw / 2 - 3, h0, 6, h1 - h0);
      }
    }

    // ржавчина, подтёки, царапины
    for (let i = 0; i < r.width / 40; i++) {
      const x = rng() * r.width, y = top + 50 + rng() * (FLOOR - top - 90);
      const rad = 10 + rng() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, rng() < 0.3 ? 'rgba(70,35,20,.35)' : 'rgba(0,0,0,.35)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      if (rng() < 0.4) {
        g.strokeStyle = 'rgba(40,22,14,.35)';
        g.lineWidth = 1 + rng() * 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 6, y + 30 + rng() * 80); g.stroke();
      }
    }
    for (let i = 0; i < r.width / 25; i++) {
      const x = rng() * r.width, y = top + 50 + rng() * (FLOOR - top - 90);
      g.strokeStyle = 'rgba(255,255,255,.04)';
      g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + rng() * 30, y + (rng() - 0.5) * 8); g.stroke();
    }

    // потолок: балки и трубы
    g.fillStyle = '#0f1114';
    g.fillRect(0, top, r.width, 40);
    g.fillStyle = '#1a1d21';
    for (let x = 0; x < r.width; x += 200) g.fillRect(x, top, 22, 46);
    const pipes = [[top + 12, 7, '#2b2f33'], [top + 26, 5, '#3a2b25'], [top + 34, 4, '#26292d']];
    for (const [py, pr, col] of pipes) {
      g.fillStyle = col;
      g.fillRect(0, py - pr, r.width, pr * 2);
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.fillRect(0, py - pr, r.width, 1.5);
      for (let x = 60 + rng() * 80; x < r.width; x += 160 + rng() * 120) {
        g.fillStyle = '#14161a';
        g.fillRect(x, py - pr - 2, 8, pr * 2 + 4);
      }
    }

    // плинтус и пол-решётка
    g.fillStyle = '#121417';
    g.fillRect(0, FLOOR - 26, r.width, 26);
    g.fillStyle = 'rgba(200,160,40,.08)';
    for (let x = 0; x < r.width; x += 28) {
      g.beginPath();
      g.moveTo(x, FLOOR - 4); g.lineTo(x + 14, FLOOR - 4); g.lineTo(x + 24, FLOOR - 22); g.lineTo(x + 10, FLOOR - 22);
      g.fill();
    }
    const fl = g.createLinearGradient(0, FLOOR, 0, VH);
    fl.addColorStop(0, '#1b1e22');
    fl.addColorStop(1, '#08090b');
    g.fillStyle = fl;
    g.fillRect(0, FLOOR, r.width, VH - FLOOR);
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.lineWidth = 2;
    for (let x = 0; x < r.width; x += 14) { g.beginPath(); g.moveTo(x, FLOOR + 2); g.lineTo(x - 6, VH); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.07)';
    g.fillRect(0, FLOOR, r.width, 1.5);

    // таблички-трафареты
    g.font = '700 22px "Share Tech Mono", monospace';
    g.fillStyle = 'rgba(220,210,190,.10)';
    g.textAlign = 'left';
    if (med) {
      g.fillText('MED-01', 120, top + 100);
      g.fillText('CRYO BAY', 300, top + 100);
      g.fillStyle = 'rgba(160,30,30,.18)';
      g.fillRect(1040, top + 90, 14, 44);
      g.fillRect(1025, top + 105, 44, 14);
    } else {
      for (let x = 260; x < r.width - 200; x += 520) g.fillText(`C-${String(1 + Math.round(x / 520)).padStart(2, '0')}`, x, top + 92);
      g.fillStyle = 'rgba(230,180,40,.12)';
      g.fillText('→ ?', r.width - 330, top + 92);
    }

    // корпуса ламп
    for (const l of r.lights) {
      if (l.source) continue;
      g.fillStyle = '#1b1d20';
      g.fillRect(l.x - 26, sy(l.y) - 6, 52, 12);
      g.fillStyle = '#2a0d0c';
      g.fillRect(l.x - 18, sy(l.y) + 6, 36, 5);
    }
  }

  // ---------- Подпись заглушки ----------
  function idTag(c, id, x, y) {
    if (!showIds) return;
    c.save();
    c.font = '9px "Share Tech Mono", ui-monospace, monospace';
    c.textAlign = 'center';
    const w = c.measureText(id).width + 8;
    c.fillStyle = 'rgba(0,0,0,.55)';
    c.fillRect(x - w / 2, y - 7, w, 13);
    c.fillStyle = 'rgba(140,220,210,.75)';
    c.fillText(id, x, y + 3);
    c.restore();
  }

  // ---------- Реквизит ----------
  function drawProps(r) {
    for (const p of r.props) {
      const asset = AB.Assets.get(p.asset);
      if (asset.status === 'ready') {
        const w = asset.img.width / 4, h = asset.img.height / 4;
        ctx.drawImage(asset.img, sx(p.x) - w / 2, sy(p.y || 0) - h, w, h);
        continue;
      }
      const fn = PROPS[p.kind];
      if (fn) fn(p, r);
    }
  }

  const PROPS = {
    cryopod(p, r) {
      const x = sx(p.x), base = sy(0);
      const key = `${r.id}:cryopod-main`;
      const st = p.main ? AB.Rooms.propState(key) : null;
      const state = st ? st.state : 'closed';
      const openK = state === 'opening' ? U.ease(U.clamp(st.t / 1.6, 0, 1)) : state === 'open' ? 1 : 0;
      const W = 84, H = 196;
      // постамент
      ctx.fillStyle = '#121418';
      ctx.fillRect(x - W / 2 - 10, base - 18, W + 20, 18);
      ctx.fillStyle = '#1f2328';
      ctx.fillRect(x - W / 2 - 10, base - 18, W + 20, 3);
      // корпус
      ctx.fillStyle = '#20252b';
      roundRect(x - W / 2, base - H - 18, W, H, 38);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.07)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // внутренность
      const inner = { x: x - W / 2 + 10, y: base - H - 6, w: W - 20, h: H - 22 };
      const lit = p.main && state !== 'open' ? 1 : p.main ? Math.max(0.15, 1 - (st ? st.t : 0) * 0.3) : 0.05;
      const ig = ctx.createLinearGradient(0, inner.y, 0, inner.y + inner.h);
      ig.addColorStop(0, `rgba(40,120,150,${0.55 * lit + 0.1})`);
      ig.addColorStop(1, `rgba(10,30,40,${0.6 * lit + 0.2})`);
      ctx.fillStyle = ig;
      roundRect(inner.x, inner.y, inner.w, inner.h, 30);
      ctx.fill();
      // стекло
      if (!p.broken) {
        const gy = inner.y - openK * (inner.h + 10);
        ctx.save();
        roundRect(inner.x, inner.y, inner.w, inner.h, 30);
        ctx.clip();
        const gg = ctx.createLinearGradient(inner.x, 0, inner.x + inner.w, 0);
        gg.addColorStop(0, `rgba(170,220,235,${p.empty ? 0.08 : 0.22})`);
        gg.addColorStop(0.5, `rgba(200,240,250,${p.empty ? 0.04 : 0.10})`);
        gg.addColorStop(1, `rgba(170,220,235,${p.empty ? 0.08 : 0.25})`);
        ctx.fillStyle = gg;
        roundRect(inner.x, gy, inner.w, inner.h, 30);
        ctx.fill();
        // иней по краям
        if (!p.empty) {
          ctx.fillStyle = 'rgba(230,250,255,.12)';
          for (let i = 0; i < 14; i++) {
            const fx = inner.x + (i % 2 ? inner.w - 8 : 6) + Math.sin(i * 3.1) * 3;
            ctx.beginPath(); ctx.arc(fx, gy + 20 + i * 11, 4 + (i % 3), 0, 7); ctx.fill();
          }
        }
        ctx.strokeStyle = 'rgba(200,240,255,.18)';
        ctx.lineWidth = 1.5;
        roundRect(inner.x, gy, inner.w, inner.h, 30);
        ctx.stroke();
        ctx.restore();
      } else {
        // разбитое стекло
        ctx.strokeStyle = 'rgba(190,230,240,.25)';
        ctx.lineWidth = 1.2;
        const cx = inner.x + inner.w * 0.4, cy = inner.y + inner.h * 0.45;
        for (let i = 0; i < 9; i++) {
          const a = i * 0.7 + 0.3;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 48, cy + Math.sin(a) * 70); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(190,230,240,.12)';
        for (let i = 0; i < 8; i++) ctx.fillRect(x - 40 + i * 11, base - 3 - (i % 3), 6, 2);
      }
      // трубки и индикаторы
      ctx.strokeStyle = '#2f3338';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + W / 2, base - 120);
      ctx.bezierCurveTo(x + W / 2 + 26, base - 100, x + W / 2 + 18, base - 40, x + W / 2 + 34, base - 6);
      ctx.stroke();
      p._lamp = { x, y: base - H - 6, on: p.main && state === 'closed', broken: p.broken };
      idTag(ctx, p.asset, x, base - H - 34);
    },

    monitor(p) {
      const x = sx(p.x), y = sy(p.y);
      ctx.fillStyle = '#111316';
      ctx.fillRect(x - 60, y - 40, 120, 80);
      ctx.fillStyle = '#04100d';
      ctx.fillRect(x - 52, y - 32, 104, 64);
      p._screen = { x, y };
      idTag(ctx, p.asset, x, y + 52);
    },

    medbed(p) {
      const x = sx(p.x), b = sy(0);
      ctx.strokeStyle = '#1d2024';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x - 80, b); ctx.lineTo(x - 70, b - 62);
      ctx.moveTo(x + 80, b); ctx.lineTo(x + 70, b - 62);
      ctx.stroke();
      ctx.fillStyle = '#272b30';
      ctx.fillRect(x - 100, b - 72, 200, 12);
      // простыня с пятнами
      ctx.fillStyle = '#4b4f4c';
      ctx.beginPath();
      ctx.moveTo(x - 96, b - 72);
      ctx.quadraticCurveTo(x - 20, b - 90, x + 60, b - 74);
      ctx.lineTo(x + 70, b - 40);
      ctx.quadraticCurveTo(x + 30, b - 50, x + 10, b - 60);
      ctx.lineTo(x - 96, b - 60);
      ctx.fill();
      ctx.fillStyle = 'rgba(70,10,10,.6)';
      ctx.beginPath(); ctx.ellipse(x + 20, b - 72, 18, 5, 0.2, 0, 7); ctx.fill();
      // капельница
      ctx.strokeStyle = '#2a2e33';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 130, b); ctx.lineTo(x + 130, b - 170); ctx.lineTo(x + 112, b - 170); ctx.stroke();
      const sw = Math.sin(time * 0.9) * 2;
      ctx.fillStyle = 'rgba(120,150,140,.35)';
      ctx.fillRect(x + 104 + sw, b - 166, 14, 26);
      idTag(ctx, p.asset, x, b - 110);
    },

    cabinet(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = '#1b1f23';
      ctx.fillRect(x - 40, b - 190, 80, 190);
      ctx.fillStyle = '#0a0b0d';
      ctx.fillRect(x - 34, b - 182, 68, 174);
      // приоткрытая дверца; после обыска распахнута
      const opened = p.container && AB.Rooms.isSearched(AB.Rooms.current(), p.container);
      const swing = opened ? 0.95 : 0.35 + Math.sin(time * 0.7) * 0.02;
      ctx.fillStyle = '#23282d';
      ctx.beginPath();
      ctx.moveTo(x + 34, b - 182);
      ctx.lineTo(x + 34 + 60 * swing, b - 176);
      ctx.lineTo(x + 34 + 60 * swing, b - 14);
      ctx.lineTo(x + 34, b - 8);
      ctx.fill();
      // полки и разбросанные бумаги
      ctx.fillStyle = '#2a2f34';
      for (let i = 1; i < 4; i++) ctx.fillRect(x - 34, b - 182 + i * 44, 68, 3);
      ctx.fillStyle = 'rgba(190,185,170,.25)';
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.translate(x - 70 + i * 26, b - 2); ctx.rotate((i - 2) * 0.3);
        ctx.fillRect(-8, -2, 16, 3); ctx.restore();
      }
      idTag(ctx, p.asset, x, b - 204);
    },
  };

  // ---------- Двери ----------
  function drawDoors(r) {
    const hero = AB.Chars.get('CHAR-001');
    for (const d of r.doors) {
      const x = sx(d.x), b = sy(0);
      const open = AB.Rooms.doorOpen(`${r.id}:${d.key}`);
      const locked = !AB.Rooms.canPass(d).ok;
      const near = hero && Math.abs(hero.x - d.x) < 80;
      // проём
      ctx.fillStyle = '#030304';
      ctx.fillRect(x - 46, b - 190, 92, 190);
      // створки
      const slide = open * 44;
      ctx.fillStyle = '#262a2f';
      ctx.fillRect(x - 46, b - 190, 46 - slide, 190);
      ctx.fillRect(x + slide, b - 190, 46 - slide, 190);
      ctx.fillStyle = 'rgba(200,160,40,.18)';
      for (let i = 0; i < 6; i++) {
        if (46 - slide > 8) {
          ctx.fillRect(x - 40, b - 170 + i * 28, Math.max(0, 34 - slide), 6);
          ctx.fillRect(x + slide + 6, b - 170 + i * 28, Math.max(0, 34 - slide), 6);
        }
      }
      // рама
      ctx.strokeStyle = '#3a3f45';
      ctx.lineWidth = 8;
      ctx.strokeRect(x - 50, b - 194, 100, 194);
      d._light = { x: x + 62, y: b - 120, locked, near };
      // пульт
      ctx.fillStyle = '#16181b';
      ctx.fillRect(x + 56, b - 132, 14, 26);
      idTag(ctx, 'ASSET-SHARED-01', x, b - 206);
    }
  }

  // ---------- Герой: процедурная заглушка ASSET-CHAR001-01 ----------
  function limb(x1, y1, a1, l1, a2, l2, w, col) {
    const kx = x1 + Math.sin(a1) * l1, ky = y1 + Math.cos(a1) * l1;
    const fx = kx + Math.sin(a1 + a2) * l2, fy = ky + Math.cos(a1 + a2) * l2;
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    return { kx, ky, fx, fy };
  }

  function heroPose(hero) {
    const tr = AB.Anim.current(hero.id);
    const action = tr ? tr.action : 'idle';
    const t = tr ? tr.t : 0;
    const P = { lean: 0, bob: 0, hipL: 0, hipR: 0, kneeL: 0.05, kneeR: 0.05, shL: 0.1, shR: -0.05, elL: -0.2, elR: -0.25, head: 0, dx: 0, crouch: 0, breath: 0 };
    const breath = Math.sin(time * 1.7);
    P.breath = breath;

    if (action === 'walk' || action === 'run') {
      const run = action === 'run';
      const cyc = (hero.stride / (run ? 120 : 76)) * Math.PI * 2;
      const amp = run ? 0.75 : 0.45;
      P.hipL = Math.sin(cyc) * amp;
      P.hipR = Math.sin(cyc + Math.PI) * amp;
      // колено сгибается, когда нога выносится вперёд (угол бедра растёт, cos > 0);
      // опорная нога прямая и уходит назад — иначе получается «лунная походка»
      P.kneeL = Math.max(0, Math.cos(cyc)) * (run ? 1.3 : 0.7) + 0.05;
      P.kneeR = Math.max(0, Math.cos(cyc + Math.PI)) * (run ? 1.3 : 0.7) + 0.05;
      P.shL = -Math.sin(cyc) * amp * 0.8;
      P.shR = -Math.sin(cyc + Math.PI) * amp * 0.8;
      P.elL = -0.3 - (run ? 0.9 : 0.2);
      P.elR = -0.3 - (run ? 0.9 : 0.2);
      P.bob = Math.abs(Math.cos(cyc)) * (run ? 4 : 2.2);
      P.lean = run ? 0.22 : 0.06;
      P.head = run ? 0.1 : 0;
    } else if (action === 'wake') {
      // ANIM-CHAR001-06: обмяк → шаг из капсулы → опирается на колено → выпрямляется
      const p = AB.Anim.progress(hero.id);
      const step = U.ease(U.clamp((p - 0.1) / 0.45, 0, 1));
      P.dx = step * 70;
      const slump = 1 - U.ease(U.clamp((p - 0.55) / 0.4, 0, 1));
      P.lean = 0.55 * slump;
      P.head = 0.5 * slump + Math.sin(time * 6) * 0.04 * slump;
      P.crouch = 14 * slump;
      P.kneeL = 0.6 * slump + 0.05;
      P.kneeR = 0.9 * slump + 0.05;
      const stepPh = Math.sin(step * Math.PI * 2);
      P.hipL = 0.35 * slump + stepPh * 0.3;
      P.hipR = -0.2 * slump - stepPh * 0.3;
      P.shL = 0.5 * slump; P.elL = -0.9 * slump - 0.2;
      P.shR = 0.3 * slump; P.elR = -0.4;
    } else if (action === 'attack') {
      // ANIM-CHAR001-07: замах за голову → удар сверху вниз → возврат
      const p = AB.Anim.progress(hero.id);
      const wind = U.ease(U.clamp(p / 0.32, 0, 1));
      const strike = U.ease(U.clamp((p - 0.32) / 0.22, 0, 1));
      const back = U.ease(U.clamp((p - 0.6) / 0.4, 0, 1));
      P.shL = U.lerp(U.lerp(0.2, -2.7, wind), 1.35, strike) * (1 - back) + 0.2 * back;
      P.elL = U.lerp(-0.7, -0.1, strike);
      P.pipe = U.lerp(0.9, 0.2, strike);
      P.shR = U.lerp(0.3, -0.4, strike) * (1 - back);
      P.elR = -0.9;
      P.lean = U.lerp(-0.12, 0.28, strike) * (1 - back);
      P.hipL = 0.35 * strike * (1 - back); P.kneeL = 0.25 + 0.2 * strike;
      P.hipR = -0.25 * strike * (1 - back); P.kneeR = 0.15;
      P.crouch = 5 * strike * (1 - back);
    } else if (action === 'death') {
      const p = AB.Anim.progress(hero.id);
      P.crouch = 14 * p; P.head = -0.4 * p; P.lean = -0.2 * p;
      P.shL = -1.2 * p; P.shR = -1.6 * p; P.elL = 0.3; P.elR = 0.3;
      P.kneeL = 0.8 * p + 0.05; P.kneeR = 0.4 * p + 0.05;
    } else if (action === 'interact' && hero.reachLow) {
      // ANIM-CHAR001-03, вариант «подобрать с пола»: присесть и дотянуться
      const p = AB.Anim.progress(hero.id);
      const k = Math.sin(p * Math.PI);
      P.crouch = 22 * k; P.lean = 0.55 * k; P.head = 0.25 * k;
      P.hipL = -0.5 * k; P.kneeL = 1.3 * k + 0.05;
      P.hipR = 0.45 * k; P.kneeR = 0.9 * k + 0.05;
      P.shL = 0.35 * k + 0.1; P.elL = -0.1;
    } else if (action === 'interact') {
      const p = AB.Anim.progress(hero.id);
      const reach = Math.sin(p * Math.PI);
      P.shL = 1.35 * reach + 0.1; P.elL = -0.3 * reach - 0.2;
      P.lean = 0.08 * reach;
    } else if (action === 'hurt') {
      const p = AB.Anim.progress(hero.id);
      const k = Math.sin(p * Math.PI);
      P.lean = -0.35 * k; P.head = -0.3 * k; P.shL = -0.6 * k; P.shR = -0.8 * k;
    } else if (hero.inPod) {
      // в капсуле: голова опущена, медленное дыхание
      P.head = 0.5; P.lean = 0.08; P.bob = Math.sin(time * 0.8) * 0.6;
      P.shL = 0.15; P.shR = 0.1; P.elL = -0.1; P.elR = -0.1; P.crouch = 2;
    } else {
      // ANIM-CHAR001-05: дыхание, лёгкое покачивание
      P.bob = breath * 0.8;
      P.lean = 0.03 + Math.sin(time * 0.6) * 0.015;
      P.head = Math.sin(time * 0.45) * 0.06;
      P.shL = 0.08 + breath * 0.03; P.shR = -0.06 - breath * 0.03;
    }
    return { P, action };
  }

  function drawHero(hero, pass) {
    if (!hero || hero.hidden) return;
    const asset = AB.Assets.get(hero.appearance);
    const { P, action } = heroPose(hero);
    const x = sx(hero.x + P.dx * hero.facing), b = sy(0);

    if (pass === 'body') {
      // тень
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(x, b + 1, 26, 5, 0, 0, 7); ctx.fill();
    }

    if (asset.status === 'ready' && asset.parts) {
      // настоящая графика: сборка из частей по скелету (js/data/rigs.js)
      if (pass === 'body') drawHeroRig(hero, P, action, asset, x, b);
      else if (pass === 'emissive') idTag(ctx, `${hero.appearance} · ${AB.Anim.current(hero.id)?.animId || ''}`, x, b - 142);
      return;
    }
    if (asset.status === 'ready') {
      if (pass === 'body') {
        ctx.save(); ctx.translate(x, b); ctx.scale(hero.facing, 1);
        const h = 120, w = asset.img.width * (h / asset.img.height);
        ctx.drawImage(asset.img, -w / 2, -h, w, h);
        ctx.restore();
      }
      return;
    }

    ctx.save();
    ctx.translate(x, b);
    ctx.scale(hero.facing, 1);
    if (action === 'death') ctx.rotate(-U.ease(AB.Anim.progress(hero.id)) * 1.45);
    const hipY = -54 + P.bob * 0.5 + P.crouch;

    if (pass === 'body') {
      const dark = '#1c2026', mid = '#363e48', light = '#4a5560';
      // дальние конечности (темнее)
      // знак сгиба: колени гнутся назад, локти вперёд
      limb(-2, hipY, P.hipR, 27, -P.kneeR, 27, 9, dark);
      ctx.save();
      ctx.translate(0, hipY); ctx.rotate(P.lean); ctx.translate(0, -hipY);
      const shY = hipY - 38 + P.breath * 0.4;
      limb(-3, shY + 3, P.shR, 21, -P.elR, 20, 7.5, dark);
      // торс
      ctx.fillStyle = mid;
      roundRect(-11, shY - 2, 22, hipY - shY + 6, 8);
      ctx.fill();
      ctx.fillStyle = light;
      ctx.fillRect(-11, shY + 4, 4, hipY - shY - 6);
      // ремень/снаряжение
      ctx.fillStyle = '#0f1114';
      ctx.fillRect(-12, hipY - 6, 24, 5);
      // голова
      ctx.save();
      ctx.translate(2, shY - 4); ctx.rotate(P.head);
      ctx.fillStyle = '#1d2126';
      ctx.fillRect(-4, -8, 8, 8);
      ctx.fillStyle = mid;
      ctx.beginPath(); ctx.ellipse(1, -16, 9.5, 11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.ellipse(-2, -19, 4, 6, 0, 0, 7); ctx.fill();
      ctx.restore();
      // ближняя рука (и оружие в ней)
      const hand = limb(3, shY + 3, P.shL, 21, -P.elL, 20, 8.5, mid);
      if (hero.equipped) drawWeapon(hand, P.shL - P.elL + (P.pipe || 0.35));
      ctx.restore();
      // ближняя нога
      limb(2, hipY, P.hipL, 27, -P.kneeL, 27, 10, mid);
    } else if (pass === 'emissive') {
      // светящиеся элементы криокостюма — поверх темноты
      ctx.translate(0, hipY); ctx.rotate(P.lean); ctx.translate(0, -hipY);
      const shY = hipY - 38 + P.breath * 0.4;
      // контровой свет аварийных ламп по краю силуэта
      ctx.strokeStyle = 'rgba(255,70,50,.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-11, hipY - 2); ctx.lineTo(-11, shY + 4);
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(3, shY - 20, 10, 11.5, P.head, Math.PI * 0.6, Math.PI * 1.5); ctx.stroke();
      const pulse = 0.6 + Math.sin(time * 2.2) * 0.25;
      ctx.fillStyle = `rgba(90,230,255,${0.5 * pulse})`;
      ctx.fillRect(6, shY + 8, 3, 16);
      const g = ctx.createRadialGradient(7, shY + 14, 0, 7, shY + 14, 18);
      g.addColorStop(0, `rgba(90,230,255,${0.25 * pulse})`);
      g.addColorStop(1, 'rgba(90,230,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-12, shY - 6, 40, 40);
    }
    ctx.restore();
    if (pass === 'emissive') idTag(ctx, `${hero.appearance} · ${AB.Anim.current(hero.id)?.animId || ''}`, x, b - 142);
  }

  // ---------- Герой из частей (cut-out) ----------
  // Кость: картинка ставится суставом (pivot) в точку (x1, y1) и поворачивается
  // так, чтобы направление pivot → end совпало с углом кости ang (0 — вниз,
  // положительный — вперёд). Возвращает конец кости.
  function rigGeom(img, spec, len) {
    const W = img.width, H = img.height;
    let px = spec.pivot[0] * W, ex = spec.end[0] * W;
    const py = spec.pivot[1] * H, ey = spec.end[1] * H;
    if (spec.flipX) { px = W - px; ex = W - ex; }
    const vx = ex - px, vy = ey - py;
    return { W, H, px, py, imgAng: Math.atan2(vx, vy), s: len / Math.hypot(vx, vy), sx: spec.scaleX || 1 };
  }

  function rigBone(img, spec, x1, y1, ang, len, darken) {
    const g = rigGeom(img, spec, len);
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(g.imgAng - ang);
    ctx.scale(g.s * g.sx, g.s);
    if (darken) ctx.filter = `brightness(${darken})`;
    if (spec.flipX) {
      ctx.scale(-1, 1);
      ctx.drawImage(img, -(g.W - g.px), -g.py);
    } else {
      ctx.drawImage(img, -g.px, -g.py);
    }
    ctx.restore();
    return { x: x1 + Math.sin(ang) * len, y: y1 + Math.cos(ang) * len };
  }

  // Точка на картинке части (в долях) → координаты скелета
  function rigAnchor(img, spec, x1, y1, ang, len, anchor) {
    const g = rigGeom(img, spec, len);
    let ax = anchor[0] * g.W;
    if (spec.flipX) ax = g.W - ax;
    const lx = (ax - g.px) * g.s * g.sx, ly = (anchor[1] * g.H - g.py) * g.s;
    const th = g.imgAng - ang;
    return { x: x1 + lx * Math.cos(th) - ly * Math.sin(th), y: y1 + lx * Math.sin(th) + ly * Math.cos(th) };
  }

  // Скелет бывает двух видов:
  //  - ручной (js/data/rigs.js): одна картинка бедра/голени на обе ноги + ботинок;
  //  - автоматический (tools/rig_from_fullbody.py): у каждой стороны свои части
  //    (thigh_near, shin_far…), ботинок нарисован вместе со штаниной.
  function drawHeroRig(hero, P, action, asset, x, b) {
    const rig = AB.RIGS[AB.ID.get(hero.appearance).rig];
    const R = rig.parts, B = rig.bones, I = asset.parts, dk = rig.farDarken;
    // часть → общая часть → ближняя пара (если дальняя часть не нарисована)
    const get = (name, base) => {
      const pair = `${base}_near`;
      const key = I[name] ? name : I[base] ? base : pair;
      return { img: I[key], spec: R[key], len: B[name] ?? B[base] ?? B[pair] };
    };
    const auto = !!rig.unitsPerPx;
    ctx.save();
    ctx.translate(x, b);
    ctx.scale(hero.facing, 1);
    if (action === 'death') ctx.rotate(-U.ease(AB.Anim.progress(hero.id)) * 1.45);
    const hipY = rig.hipY + P.bob * 0.5 + P.crouch;

    const leg = (side, hip, knee, darken) => {
      const thigh = get(`thigh_${side}`, 'thigh'), shin = get(`shin_${side}`, 'shin');
      const hx = auto ? 0 : side === 'near' ? 2 : -2;
      const thighAng = hip, shinAng = hip - knee;
      const k = rigBone(thigh.img, thigh.spec, hx, hipY, thighAng, thigh.len, darken);
      const a = rigBone(shin.img, shin.spec, k.x, k.y, shinAng, shin.len, darken);
      // отдельный ботинок (ручной скелет): почти горизонтален, слегка следует за голенью
      if (I.boot && R.boot) rigBone(I.boot, R.boot, a.x, a.y, shinAng * 0.25, R.boot.length, darken);
    };

    // торс: от таза вверх, с наклоном
    const torsoAng = Math.PI - P.lean;
    const torso = get('torso', 'torso');
    const shoulder = (side) => {
      const anchor = R.torso[`shoulder_${side}`] || R.torso.shoulder;
      const p = rigAnchor(torso.img, torso.spec, 0, hipY, torsoAng, torso.len, anchor);
      if (!R.torso[`shoulder_${side}`] && side === 'far') p.x -= 3;
      p.y += P.breath * 0.4;
      return p;
    };
    const shN = shoulder('near'), shF = shoulder('far');

    // дальние конечности
    leg('far', P.hipR, P.kneeR, dk);
    {
      const up = get('upperarm_far', 'upperarm'), fo = get('forearm_far', 'forearm');
      const e = rigBone(up.img, up.spec, shF.x, shF.y, P.shR, up.len, dk);
      rigBone(fo.img, fo.spec, e.x, e.y, P.shR - P.elR, fo.len, dk);
    }
    // торс и голова
    const neck = rigBone(torso.img, torso.spec, 0, hipY, torsoAng, torso.len);
    const head = get('head', 'head');
    rigBone(head.img, head.spec, neck.x, neck.y + (auto ? 0 : 3), torsoAng - P.head, head.len);
    // ближние конечности и оружие
    leg('near', P.hipL, P.kneeL, 0);
    {
      const up = get('upperarm_near', 'upperarm'), fo = get('forearm_near', 'forearm');
      const e = rigBone(up.img, up.spec, shN.x, shN.y, P.shL, up.len);
      const foreAng = P.shL - P.elL;
      const w = rigBone(fo.img, fo.spec, e.x, e.y, foreAng, fo.len);
      if (hero.equipped) {
        const hand = { fx: w.x + Math.sin(foreAng) * 4, fy: w.y + Math.cos(foreAng) * 4 };
        drawWeapon(hand, foreAng + (P.pipe || 0.35));
      }
    }
    ctx.restore();
  }

  // ---------- Оружие в руке: заглушка ASSET-ITEM009-01 ----------
  function drawWeapon(hand, ang) {
    const len = 46;
    const ex = hand.fx + Math.sin(ang) * len, ey = hand.fy + Math.cos(ang) * len;
    const sx0 = hand.fx - Math.sin(ang) * 6, sy0 = hand.fy - Math.cos(ang) * 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3a3e43';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,205,210,.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(sx0, sy0 - 1.5); ctx.lineTo(ex, ey - 1.5); ctx.stroke();
    // муфта на конце
    ctx.fillStyle = '#2a2d31';
    ctx.beginPath(); ctx.arc(ex, ey, 4, 0, 7); ctx.fill();
  }

  // ---------- Противник: процедурная заглушка ASSET-ENEMY001-01 ----------
  function enemyPose(e) {
    const tr = AB.Anim.current(e.id);
    const action = tr ? tr.action : 'idle';
    const p = AB.Anim.progress(e.id);
    const Q = { h: 46, rot: 0, dx: 0, head: 0, jaw: 0.1, fA: 0.5, fE: -0.9, fA2: -0.3, fE2: -0.6, hA: -0.4, hK: 0.9, hA2: 0.3, hK2: 0.8, splay: 0 };
    const twitch = Math.sin(time * 7.3 + e.x) > 0.96 ? Math.sin(time * 60) * 0.25 : 0;
    if (action === 'walk' || action === 'run') {
      const run = action === 'run';
      const cyc = (e.stride / (run ? 95 : 70)) * Math.PI * 2;
      const amp = run ? 0.75 : 0.45;
      Q.h = run ? 38 : 46;
      Q.fA = 0.5 + Math.sin(cyc) * amp; Q.fA2 = 0.5 + Math.sin(cyc + Math.PI) * amp;
      Q.fE = -0.9 - Math.max(0, Math.cos(cyc)) * 0.6; Q.fE2 = -0.9 - Math.max(0, Math.cos(cyc + Math.PI)) * 0.6;
      Q.hA = Math.sin(cyc + Math.PI) * amp * 0.8; Q.hA2 = Math.sin(cyc) * amp * 0.8;
      Q.hK = 0.8 + Math.max(0, Math.cos(cyc + Math.PI)) * 0.7; Q.hK2 = 0.8 + Math.max(0, Math.cos(cyc)) * 0.7;
      Q.h += Math.abs(Math.sin(cyc)) * (run ? 5 : 2);
      Q.head = Math.sin(cyc * 0.5) * 0.08 + twitch;
      Q.rot = run ? 0.08 : 0;
    } else if (action === 'alert') {
      const k = Math.sin(p * Math.PI);
      Q.rot = -0.7 * k; Q.h = 46 + 18 * k; Q.jaw = 0.1 + 0.7 * k;
      Q.head = Math.sin(time * 40) * 0.12 * k;
      Q.fA = -0.6 * k + 0.5; Q.fA2 = -1.0 * k + 0.5; Q.fE = -1.4; Q.fE2 = -1.2;
    } else if (action === 'attack') {
      const wind = U.ease(U.clamp(p / 0.55, 0, 1));
      const lunge = U.ease(U.clamp((p - 0.55) / 0.15, 0, 1));
      const rec = U.ease(U.clamp((p - 0.7) / 0.3, 0, 1));
      Q.rot = (-0.55 * wind + 0.75 * lunge) * (1 - rec);
      Q.dx = (-12 * wind + 32 * lunge) * (1 - rec);
      Q.h = 46 + 12 * wind * (1 - lunge);
      Q.jaw = 0.2 + 0.8 * lunge * (1 - rec);
      Q.fA = U.lerp(-1.6 * wind + 0.5, 1.8, lunge) * (1 - rec) + 0.5 * rec;
      Q.fA2 = U.lerp(-1.3 * wind + 0.5, 1.6, lunge) * (1 - rec) + 0.5 * rec;
      Q.fE = U.lerp(-1.5, -0.2, lunge); Q.fE2 = U.lerp(-1.4, -0.3, lunge);
      Q.head = 0.2 * lunge * (1 - rec);
    } else if (action === 'hurt') {
      const k = Math.sin(p * Math.PI);
      Q.rot = -0.35 * k; Q.dx = -6 * k; Q.jaw = 0.8 * k; Q.head = -0.4 * k;
    } else if (action === 'death') {
      const k = U.ease(Math.min(1, p * 1.4));
      Q.h = U.lerp(46, 9, k); Q.rot = 0.15 * k; Q.splay = k;
      Q.fA = U.lerp(0.5, 1.5, k); Q.fE = U.lerp(-0.9, -0.1, k); Q.fA2 = U.lerp(-0.3, -1.4, k); Q.fE2 = -0.2;
      Q.hA = U.lerp(-0.4, -1.4, k); Q.hK = 0.2; Q.hA2 = U.lerp(0.3, 1.2, k); Q.hK2 = 0.2;
      Q.jaw = 0.6 * k; Q.head = 0.4 * k;
      if (p > 0.6 && p < 0.95) Q.fE += Math.sin(time * 50) * 0.15; // последние судороги
    } else {
      // ожидание: дыхание и резкие подёргивания головы
      Q.h = 46 + Math.sin(time * 1.6 + e.x) * 1.5;
      Q.head = Math.sin(time * 0.9 + e.x) * 0.15 + twitch;
      Q.jaw = 0.1 + Math.max(0, Math.sin(time * 0.7)) * 0.2;
    }
    return { Q, action };
  }

  function drawEnemy(e, pass) {
    const def = AB.ID.get(e.id);
    const asset = AB.Assets.get(def.asset);
    const { Q, action } = enemyPose(e);
    const x = sx(e.x + Q.dx * e.facing), b = sy(0);
    if (pass === 'body') {
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); ctx.ellipse(x, b + 1, 40 + Q.splay * 20, 6, 0, 0, 7); ctx.fill();
    }
    if (asset.status === 'ready') {
      if (pass === 'body') {
        ctx.save(); ctx.translate(x, b); ctx.scale(e.facing, 1);
        const h = 90, w = asset.img.width * (h / asset.img.height);
        ctx.drawImage(asset.img, -w / 2, -h, w, h);
        ctx.restore();
      }
      return;
    }
    ctx.save();
    ctx.translate(x, b);
    ctx.scale(e.facing, 1);
    const bodyY = -Q.h;
    const flesh = '#7d6663', dark = '#3e3132', plate = '#323840';

    if (pass === 'body') {
      // дальние конечности
      limb(-20, bodyY + 6, Q.hA2, 26, Q.hK2, 30, 8, dark);
      ctx.save();
      ctx.translate(0, bodyY); ctx.rotate(Q.rot); ctx.translate(0, -bodyY);
      limb(18, bodyY + 2, Q.fA2, 34, Q.fE2, 36, 7, dark);
      // туловище: вытянутое, сгорбленное
      ctx.fillStyle = flesh;
      ctx.beginPath();
      ctx.moveTo(-34, bodyY + 8);
      ctx.bezierCurveTo(-30, bodyY - 22, 16, bodyY - 26, 32, bodyY - 6);
      ctx.bezierCurveTo(36, bodyY + 6, 10, bodyY + 16, -34, bodyY + 8);
      ctx.fill();
      // рёбра и металлические пластины
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(-18 + i * 9, bodyY - 12); ctx.quadraticCurveTo(-14 + i * 9, bodyY, -18 + i * 9, bodyY + 8); ctx.stroke();
      }
      ctx.fillStyle = plate;
      ctx.beginPath();
      ctx.moveTo(-26, bodyY - 10); ctx.lineTo(-4, bodyY - 21); ctx.lineTo(14, bodyY - 18); ctx.lineTo(-6, bodyY - 8);
      ctx.fill();
      // трубки, вросшие в спину
      ctx.strokeStyle = '#3b3f45';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-28, bodyY - 2); ctx.bezierCurveTo(-40, bodyY - 30, -8, bodyY - 36, 6, bodyY - 20); ctx.stroke();
      // шипы позвоночника
      ctx.fillStyle = '#4a3c3a';
      for (let i = 0; i < 6; i++) {
        const sxp = -24 + i * 8, syp = bodyY - 17 - Math.sin(i / 5 * Math.PI) * 6;
        ctx.beginPath(); ctx.moveTo(sxp - 3, syp + 4); ctx.lineTo(sxp, syp - 6 - (i % 2) * 3); ctx.lineTo(sxp + 3, syp + 4); ctx.fill();
      }
      // голова с челюстью
      ctx.save();
      ctx.translate(32, bodyY - 6); ctx.rotate(Q.head);
      ctx.fillStyle = flesh;
      ctx.beginPath(); ctx.ellipse(10, -2, 13, 9, 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = dark;
      ctx.save(); ctx.translate(4, 3); ctx.rotate(Q.jaw);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 2); ctx.lineTo(16, 6); ctx.lineTo(0, 5); ctx.fill();
      ctx.fillStyle = 'rgba(220,210,190,.6)';
      for (let i = 0; i < 4; i++) ctx.fillRect(4 + i * 4, 0, 1.5, 3);
      ctx.restore();
      ctx.restore();
      // ближняя передняя лапа — длинная, с когтями
      const claw = limb(22, bodyY + 4, Q.fA, 34, Q.fE, 36, 8, flesh);
      ctx.strokeStyle = '#1d1718';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(claw.fx, claw.fy); ctx.lineTo(claw.fx + 9, claw.fy + i * 3 + 2); ctx.stroke();
      }
      ctx.restore();
      // ближняя задняя лапа
      limb(-18, bodyY + 8, Q.hA, 26, Q.hK, 30, 9, flesh);
      // вспышка при попадании
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,220,200,${0.35 * e.flash})`;
        ctx.beginPath(); ctx.ellipse(0, bodyY, 46, 26, 0, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    } else if (pass === 'emissive') {
      ctx.translate(0, bodyY); ctx.rotate(Q.rot); ctx.translate(0, -bodyY);
      const alive = action !== 'death' ? 1 : Math.max(0, 1 - AB.Anim.progress(e.id) * 1.2);
      const angry = ['run', 'attack', 'alert'].includes(action) ? 1 : 0.55;
      // глаза
      ctx.save(); ctx.translate(32, bodyY - 6); ctx.rotate(Q.head);
      const g = ctx.createRadialGradient(16, -4, 0, 16, -4, 12);
      g.addColorStop(0, `rgba(255,120,40,${0.9 * alive * angry})`);
      g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(4, -16, 24, 24);
      ctx.fillStyle = `rgba(255,200,120,${alive})`;
      ctx.fillRect(14, -6, 3, 2); ctx.fillRect(18, -5, 2, 2);
      ctx.restore();
      // биолюминесцентные мешки на спине
      const pulse = (0.5 + Math.sin(time * 2.6 + e.x) * 0.5) * alive;
      for (const [ox, oy] of [[-16, -14], [-4, -18]]) {
        const gg = ctx.createRadialGradient(ox, bodyY + oy, 0, ox, bodyY + oy, 9);
        gg.addColorStop(0, `rgba(190,230,90,${0.45 * pulse})`);
        gg.addColorStop(1, 'rgba(190,230,90,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(ox - 9, bodyY + oy - 9, 18, 18);
      }
    }
    ctx.restore();
    if (pass === 'emissive') {
      const tr = AB.Anim.current(e.id);
      idTag(ctx, `${def.asset} · ${tr ? tr.animId : ''} · ${e.state}`, x, b - 110);
    }
  }

  // ---------- Кровь ----------
  function bleed(x, y, dir, n) {
    for (let i = 0; i < n; i++) {
      particles.push({ k: 'blood', x, y: y + (Math.random() - 0.5) * 20, vx: dir * (40 + Math.random() * 160), vy: -60 - Math.random() * 120, life: 1.2, age: 0, s: 1.5 + Math.random() * 2 });
    }
  }

  function drawDecals(r) {
    for (const d of decals.get(r.id) || []) {
      ctx.fillStyle = 'rgba(40,6,6,.75)';
      ctx.beginPath(); ctx.ellipse(sx(d.x), sy(0) + 2, d.s, d.s * 0.25, 0, 0, 7); ctx.fill();
    }
  }

  // ---------- Указатель навигации ----------
  function drawNavMarker() {
    const h = AB.Nav.hint();
    const hero = AB.Chars.get('CHAR-001');
    if (!h || !hero || !hero.controllable) return;
    const tx = sx(h.x), y = sy(-215);
    const a = 0.45 + Math.sin(time * 3) * 0.25;
    const col = h.kind === 'locked' ? `rgba(255,80,60,${a})` : `rgba(94,230,255,${a})`;
    ctx.fillStyle = col;
    if (tx > 30 && tx < VW - 30) {
      // шеврон над целевой дверью
      const bob = Math.sin(time * 3) * 3;
      ctx.beginPath(); ctx.moveTo(tx - 9, y + bob); ctx.lineTo(tx, y + 10 + bob); ctx.lineTo(tx + 9, y + bob); ctx.lineTo(tx, y + 5 + bob); ctx.fill();
    } else {
      // стрелка у края экрана
      const ex = tx < 30 ? 22 : VW - 22, ey = sy(-60), d = tx < 30 ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(ex + d * 10, ey); ctx.lineTo(ex - d * 4, ey - 9); ctx.lineTo(ex - d * 4, ey + 9); ctx.fill();
      ctx.font = '10px "Share Tech Mono", monospace';
      ctx.textAlign = d < 0 ? 'left' : 'right';
      ctx.fillText(`${Math.round(h.dist / 10)} м`, ex - d * 8, ey + 22);
    }
  }

  // ---------- Свет ----------
  function drawLighting(r) {
    const L = lctx;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = 'source-over';
    L.fillStyle = 'rgba(2,3,5,0.94)';
    L.fillRect(0, 0, lightCv.width, lightCv.height);
    L.setTransform(scale, 0, 0, scale, 0, 0);
    L.globalCompositeOperation = 'destination-out';

    const hole = (x, y, rad, k) => {
      const g = L.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(0,0,0,${k})`);
      g.addColorStop(0.55, `rgba(0,0,0,${k * 0.45})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g;
      L.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };

    r.lights.forEach((l, i) => {
      const k = flicker(l, i) * (l.source ? 0.75 : 0.95);
      hole(sx(l.x), sy(l.y) + (l.source ? 0 : 120), l.radius, k);
      if (!l.source) {
        // конус света вниз
        const x = sx(l.x), y = sy(l.y);
        const g = L.createLinearGradient(0, y, 0, FLOOR);
        g.addColorStop(0, `rgba(0,0,0,${0.55 * k})`);
        g.addColorStop(1, `rgba(0,0,0,${0.2 * k})`);
        L.fillStyle = g;
        L.beginPath();
        L.moveTo(x - 20, y + 8); L.lineTo(x + 20, y + 8); L.lineTo(x + 150, FLOOR + 10); L.lineTo(x - 150, FLOOR + 10);
        L.fill();
      }
    });
    // двери: индикаторы
    for (const d of r.doors) if (d._light) hole(d._light.x, d._light.y, d._light.near ? 90 : 50, 0.6);
    // герой видит немного вокруг себя
    const hero = AB.Chars.get('CHAR-001');
    if (hero) hole(sx(hero.x), sy(-60), 190, 0.5);
    // тревога: весь отсек вспыхивает красным
    const a = alarmPulse();
    if (a > 0) { L.fillStyle = `rgba(0,0,0,${0.12 * a})`; L.fillRect(-10, -10, VW + 20, VH + 20); }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lightCv, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // цветное свечение (аддитивно)
    ctx.globalCompositeOperation = 'lighter';
    r.lights.forEach((l, i) => {
      const k = flicker(l, i);
      const [cr, cg, cb] = l.color;
      const x = sx(l.x), y = sy(l.y);
      const g = ctx.createRadialGradient(x, y + (l.source ? 0 : 60), 0, x, y + (l.source ? 0 : 60), l.radius * 0.9);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${0.22 * k})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - l.radius, y - l.radius + 60, l.radius * 2, l.radius * 2);
      if (!l.source) {
        // сама лампа и блик на полу
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.9 * k})`;
        ctx.fillRect(x - 17, y + 6, 34, 5);
        const fg = ctx.createRadialGradient(x, FLOOR + 6, 0, x, FLOOR + 6, 120);
        fg.addColorStop(0, `rgba(${cr},${cg},${cb},${0.18 * k})`);
        fg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = fg;
        ctx.save(); ctx.translate(0, FLOOR + 6); ctx.scale(1, 0.18); ctx.translate(0, -(FLOOR + 6));
        ctx.fillRect(x - 120, FLOOR - 114, 240, 240);
        ctx.restore();
      }
    });
    const a2 = alarmPulse();
    if (a2 > 0) {
      ctx.fillStyle = `rgba(160,10,10,${0.07 * a2})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- Светящиеся детали поверх темноты ----------
  function drawEmissive(r) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of r.props) {
      if (p._screen) {
        // монитор: сбоящая кардиограмма без сигнала
        const { x, y } = p._screen;
        const on = Math.sin(time * 1.3) + Math.sin(time * 7.7) * 0.3 > -1.1;
        if (on) {
          ctx.strokeStyle = 'rgba(90,255,190,.65)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i <= 100; i += 2) {
            const ph = (i / 100 + time * 0.35) % 1;
            const glitch = Math.sin(time * 40 + i) > 0.97 ? (Math.random() - 0.5) * 18 : 0;
            const spike = ph > 0.48 && ph < 0.52 && Math.sin(time * 0.5) > 0.7 ? -20 : 0;
            const yy = y + spike + glitch;
            i === 0 ? ctx.moveTo(x - 50 + i, yy) : ctx.lineTo(x - 50 + i, yy);
          }
          ctx.stroke();
          ctx.fillStyle = 'rgba(90,255,190,.05)';
          ctx.fillRect(x - 52, y - 32, 104, 64);
        }
      }
      if (p._lamp) {
        const { x, y, on, broken } = p._lamp;
        const k = on ? 0.9 : broken ? (Math.sin(time * 17) > 0.6 ? 0.6 : 0) : 0.1;
        ctx.fillStyle = `rgba(${on ? '90,220,255' : '255,60,40'},${k})`;
        ctx.beginPath(); ctx.arc(x, y - 4, 3, 0, 7); ctx.fill();
      }
    }
    for (const d of r.doors) {
      if (!d._light) continue;
      const { x, y, locked, near } = d._light;
      const blink = locked ? (Math.sin(time * 5) > 0 ? 1 : 0.25) : 1;
      ctx.fillStyle = locked ? `rgba(255,40,30,${0.9 * blink})` : 'rgba(60,255,140,.9)';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      if (near) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
        g.addColorStop(0, locked ? 'rgba(255,40,30,.25)' : 'rgba(60,255,140,.25)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 30, y - 30, 60, 60);
      }
    }
    drawItemGlints(r);
    drawTargetHighlight();
    AB.Enemies.inRoom(r.id).forEach((e) => drawEnemy(e, 'emissive'));
    drawNavMarker();
    ctx.globalCompositeOperation = 'source-over';
    drawHero(AB.Chars.get('CHAR-001'), 'emissive');
  }

  // ---------- Предметы на полу (заглушки ASSET-ITEM*) ----------
  const CAT_COLOR = { resource: [150, 160, 170], medical: [220, 225, 220], ammo: [190, 160, 90] };

  function drawItems(r) {
    for (const it of AB.Rooms.worldItems(r.id)) {
      const def = AB.ID.get(it.item);
      const x = sx(it.x), b = sy(0);
      const icon = AB.Assets.get(def.icon);
      if (icon.status === 'ready') {
        ctx.drawImage(icon.img, x - 14, b - 24, 28, 24);
      } else {
        const [cr, cg, cb] = CAT_COLOR[def.category] || CAT_COLOR.resource;
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.beginPath(); ctx.ellipse(x, b, 16, 3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = `rgb(${cr * 0.35},${cg * 0.35},${cb * 0.35})`;
        ctx.fillRect(x - 13, b - 14, 26, 14);
        ctx.fillStyle = `rgb(${cr * 0.5},${cg * 0.5},${cb * 0.5})`;
        ctx.fillRect(x - 13, b - 16, 26, 4);
        if (def.category === 'medical') {
          ctx.fillStyle = 'rgba(150,20,20,.8)';
          ctx.fillRect(x - 1.5, b - 12, 3, 9); ctx.fillRect(x - 4.5, b - 9, 9, 3);
        } else {
          ctx.fillStyle = 'rgba(200,160,40,.35)';
          ctx.fillRect(x - 11, b - 8, 22, 2);
        }
        if (it.qty > 1) {
          ctx.fillStyle = 'rgba(0,0,0,.4)';
          ctx.fillRect(x + 6, b - 22, 12, 8);
          ctx.fillStyle = `rgb(${cr * 0.3},${cg * 0.3},${cb * 0.3})`;
          ctx.fillRect(x + 7, b - 21, 10, 6);
        }
      }
      idTag(ctx, def.icon, x, b - 34);
    }
  }

  // слабый блик, чтобы предмет было видно в темноте
  function drawItemGlints(r) {
    AB.Rooms.worldItems(r.id).forEach((it, i) => {
      const x = sx(it.x), y = sy(-10);
      const pulse = 0.5 + Math.sin(time * 2.4 + i * 1.7) * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
      g.addColorStop(0, `rgba(120,230,255,${0.10 + pulse * 0.10})`);
      g.addColorStop(1, 'rgba(120,230,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 26, y - 26, 52, 52);
      const tw = Math.max(0, Math.sin(time * 1.3 + i * 2.9) - 0.85) * 6;
      if (tw > 0) {
        ctx.strokeStyle = `rgba(200,250,255,${tw * 0.8})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 6 - 5 * tw, y - 4); ctx.lineTo(x + 6 + 5 * tw, y - 4);
        ctx.moveTo(x + 6, y - 4 - 5 * tw); ctx.lineTo(x + 6, y - 4 + 5 * tw);
        ctx.stroke();
      }
    });
  }

  // подсветка объекта, с которым сейчас можно взаимодействовать
  function drawTargetHighlight() {
    const t = AB.Interact.target('CHAR-001');
    const hero = AB.Chars.get('CHAR-001');
    if (!t || !hero || !hero.controllable || t.kind === 'door') return;
    const x = sx(t.x), b = sy(0);
    const h = t.kind === 'container' ? 200 : 26;
    const w = t.kind === 'container' ? 96 : 40;
    const a = 0.35 + Math.sin(time * 4) * 0.15;
    ctx.strokeStyle = `rgba(94,230,255,${a})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -time * 12;
    ctx.strokeRect(x - w / 2, b - h, w, h);
    ctx.setLineDash([]);
  }

  // ---------- Частицы ----------
  function spawnFx(r, dt) {
    // пыль в воздухе
    if (particles.filter((p) => p.k === 'dust').length < 60) {
      particles.push({ k: 'dust', x: cam.x + Math.random() * VW, y: -Math.random() * r.height, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.3) * 4, life: 6 + Math.random() * 6, age: 0, s: 0.6 + Math.random() * 1.4 });
    }
    for (const x of r.fx.steam) {
      if (Math.random() < dt * 9) particles.push({ k: 'steam', x: x + (Math.random() - 0.5) * 10, y: -4, vx: (Math.random() - 0.5) * 10, vy: -25 - Math.random() * 25, life: 3 + Math.random() * 2, age: 0, s: 8 + Math.random() * 8 });
    }
    for (const x of r.fx.sparks) {
      if (Math.random() < dt * 1.2) {
        for (let i = 0; i < 14; i++) particles.push({ k: 'spark', x, y: -320, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 80, life: 0.6 + Math.random() * 0.8, age: 0, s: 1.5 });
      }
    }
    for (const x of r.fx.drips) {
      if (Math.random() < dt * 0.6) particles.push({ k: 'drip', x: x + (Math.random() - 0.5) * 30, y: -r.height + 40, vx: 0, vy: 0, life: 3, age: 0, s: 1.6 });
    }
  }

  function updateFx(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age > p.life) { particles.splice(i, 1); continue; }
      if (p.k === 'spark' || p.k === 'drip' || p.k === 'blood') p.vy += 420 * dt;
      if (p.k === 'blood' && p.y > 0) {
        const r = AB.Rooms.current();
        if (!decals.has(r)) decals.set(r, []);
        const list = decals.get(r);
        if (list.length < 120) list.push({ x: p.x, s: 2 + Math.random() * 5 });
        particles.splice(i, 1);
        continue;
      }
      if (p.k === 'steam') { p.vx *= 0.99; p.s += dt * 14; }
      if (p.k === 'dust') { p.vx += Math.sin(time + i) * dt * 2; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if ((p.k === 'spark' || p.k === 'drip') && p.y > 0) {
        if (p.k === 'drip') {
          for (let j = 0; j < 3; j++) particles.push({ k: 'splash', x: p.x, y: -1, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 30, life: 0.35, age: 0, s: 1 });
          particles.splice(i, 1);
          continue;
        }
        p.y = 0; p.vy *= -0.3; p.vx *= 0.5;
      }
      if (p.k === 'splash') p.vy += 300 * dt;
    }
  }

  function drawFx(layer) {
    for (const p of particles) {
      const a = 1 - p.age / p.life;
      const x = sx(p.x), y = sy(p.y);
      if (layer === 'back' && p.k === 'steam') {
        const g = ctx.createRadialGradient(x, y, 0, x, y, p.s);
        g.addColorStop(0, `rgba(170,175,180,${0.10 * a})`);
        g.addColorStop(1, 'rgba(170,175,180,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - p.s, y - p.s, p.s * 2, p.s * 2);
      }
      if (layer === 'back' && p.k === 'blood') {
        ctx.fillStyle = `rgba(90,10,10,${0.9 * a})`;
        ctx.fillRect(x, y, p.s, p.s);
      }
      if (layer === 'glow') {
        if (p.k === 'spark') {
          ctx.fillStyle = `rgba(255,${170 + Math.random() * 60},80,${a})`;
          ctx.fillRect(x, y, 2, 2);
        } else if (p.k === 'dust') {
          const fade = Math.min(1, p.age, (p.life - p.age));
          ctx.fillStyle = `rgba(255,190,170,${0.18 * fade})`;
          ctx.fillRect(x, y, p.s, p.s);
        } else if (p.k === 'drip' || p.k === 'splash') {
          ctx.fillStyle = `rgba(150,200,220,${0.5 * a})`;
          ctx.fillRect(x, y, 1.4, p.k === 'drip' ? 4 : 1.4);
        }
      }
    }
  }

  // ---------- Передний план (параллакс) ----------
  function drawForeground(r) {
    const par = 1.35;
    const rng = U.rng(7);
    ctx.fillStyle = 'rgba(2,2,3,.82)';  // полупрозрачно: не прячет бой целиком
    for (let wx = 0; wx < r.width + 600; wx += 380 + rng() * 300) {
      const px = wx - cam.x * par; // передний план движется быстрее камеры
      if (px < -120 || px > VW + 120) continue;
      const kind = rng();
      if (kind < 0.5) {
        // стойка
        ctx.fillRect(px, 0, 26, VH);
        ctx.fillStyle = 'rgba(255,40,30,.05)';
        ctx.fillRect(px + 22, 0, 4, VH);
        ctx.fillStyle = 'rgba(2,2,3,.82)';
      } else {
        // свисающий кабель
        ctx.strokeStyle = 'rgba(2,2,3,.9)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(px - 60, -5);
        ctx.quadraticCurveTo(px, 140 + Math.sin(time * 0.6 + wx) * 6, px + 80, -5);
        ctx.stroke();
      }
    }
  }

  // ---------- Пост-обработка ----------
  function drawPost() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = cv.width, h = cv.height;
    // виньетка
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.75)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    // зерно плёнки
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    const ox = Math.random() * 256, oy = Math.random() * 256;
    const pat = ctx.createPattern(grainCv, 'repeat');
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pat;
    ctx.fillRect(ox, oy, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // едва заметные строки развёртки
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    for (let y = 0; y < h; y += 3 * dpr) ctx.fillRect(0, y, w, dpr);
    // получение урона и низкое здоровье
    const hero = AB.Chars.get('CHAR-001');
    const low = hero ? 1 - hero.hp / AB.ID.get('CHAR-001').stats.maxHp : 0;
    const red = Math.max(hurtFlash, low > 0.65 ? (0.25 + Math.sin(time * 4) * 0.12) * (low - 0.4) : 0);
    if (red > 0.01) {
      const rv = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
      rv.addColorStop(0, 'rgba(120,0,0,0)');
      rv.addColorStop(1, `rgba(150,0,0,${0.75 * red})`);
      ctx.fillStyle = rv;
      ctx.fillRect(0, 0, w, h);
    }
    // затемнения: сюжетное и при переходе между помещениями
    const fade = Math.max(AB.Story.fx.fade, AB.Rooms.fade());
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Кадр ----------
  function frame(dt) {
    time += dt;
    const r = AB.Rooms.room();
    if (!r) return;
    if (staticFor !== r.id) { staticLayer = buildStatic(r); staticFor = r.id; }

    // плавное следование камеры + лёгкое «дыхание» кадра
    cam.x = U.lerp(cam.x, camTarget(), 1 - Math.pow(0.0015, dt));
    const swayY = Math.sin(time * 0.7) * 0.8 + (Math.random() - 0.5) * shake;
    const swayX = (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 30);
    hurtFlash = Math.max(0, hurtFlash - dt * 2.2);

    spawnFx(r, dt);
    updateFx(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale, 0, 0, scale, swayX * scale, swayY * scale);

    // фон
    ctx.drawImage(staticLayer.canvas, sx(0), 0, r.width, VH);
    drawDecals(r);
    drawFx('back');
    const hero = AB.Chars.get('CHAR-001');
    if (hero && hero.inPod) drawHero(hero, 'body');   // за стеклом капсулы
    drawProps(r);
    drawDoors(r);
    drawItems(r);
    const enemies = AB.Enemies.inRoom(r.id);
    enemies.filter((e) => e.state === 'DEAD').forEach((e) => drawEnemy(e, 'body'));
    if (hero && !hero.inPod) drawHero(hero, 'body');
    enemies.filter((e) => e.state !== 'DEAD').forEach((e) => drawEnemy(e, 'body'));
    if (!AB.debugFullLight) drawLighting(r);   // отладка: AB.debugFullLight = true — без темноты
    drawEmissive(r);
    drawFx('glow');
    drawForeground(r);
    drawPost();
  }

  return {
    init, frame, snapCamera,
    // точка мира → экранные CSS-пиксели (для интерфейса и проверок)
    screenPos: (x, y) => ({ x: (x - cam.x) * scale / dpr, y: (FLOOR + y) * scale / dpr, unit: scale / dpr }),
    toggleIds() { showIds = !showIds; return showIds; },
    idsShown: () => showIds,
  };
})();
