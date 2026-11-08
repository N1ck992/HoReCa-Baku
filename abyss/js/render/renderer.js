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
  const LK = 0.5;               // разрешение слоя темноты относительно экрана
  let dpr = 1, scale = 1, VW = 800;
  const cam = { x: 0, sway: 0 };
  let staticLayer = null;       // кэш неподвижного фона текущего помещения
  let staticFor = null;
  let showIds = false;          // служебные подписи ID (кнопка ID); по умолчанию — только имена
  const bubbles = new Map();    // id персонажа → { item, until } — что он несёт
  let time = 0;
  const particles = [];
  let fxRoom = null;            // в каком помещении появляются частицы (боевая локация: их несколько на экране)
  let drawRoom = null;          // какое помещение сейчас рисуется
  const pushFx = (p) => { p.room = p.room || fxRoom || AB.Rooms.current(); particles.push(p); };
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
    AB.Bus.on('room:enter', ({ seamless }) => { if (seamless) return; staticFor = null; particles.length = 0; snapCamera(); });
    AB.Bus.on('asset:ready', () => { staticFor = null; statics.clear(); });
    AB.Bus.on('arena:start', () => { arenaSnap = true; statics.clear(); });
    AB.Bus.on('enemy:hit', ({ id, x, from }) => { const e = AB.Enemies.get(id); fxRoom = e && e.room; bleed(x, -40, Math.sign(x - from) || 1, 18); shake = Math.max(shake, 5); fxRoom = null; });
    AB.Bus.on('enemy:dead', () => { shake = Math.max(shake, 8); });
    AB.Bus.on('char:hit', ({ charId, from }) => {
      const c = AB.Chars.get(charId);
      if (c) { fxRoom = c.room; bleed(c.x, -70, Math.sign(c.x - from) || 1, 10); fxRoom = null; }
      hurtFlash = 1; shake = Math.max(shake, 10);
    });
    AB.Bus.on('combat:swing', ({ landed }) => { if (!landed) shake = Math.max(shake, 1.5); });
    AB.Bus.on('combat:shot', ({ charId, fromX, toX, landed, energy, dart }) => {
      { const c = AB.Chars.get(charId); fxRoom = c ? c.room : null; }
      if (dart) { pushFx({ k: 'tracer', x: fromX, x2: toX, y: -80, vx: 0, vy: 0, life: 0.1, age: 0, s: 1, dart: true }); fxRoom = null; return; }
      if (energy) {
        // плазменный сгусток летит к цели; при попадании — вспышка
        const life = Math.max(0.08, Math.abs(toX - fromX) / 2200);
        pushFx({ k: 'bolt', x: fromX, x0: fromX, x2: toX, y: -80, vx: 0, vy: 0, life, age: 0, s: 1, hit: landed });
        shake = Math.max(shake, 1.5);
        fxRoom = null;
        return;
      }
      pushFx({ k: 'tracer', x: fromX, x2: toX, y: -78, vx: 0, vy: 0, life: 0.14, age: 0, s: 1 });
      fxRoom = null;
      shake = Math.max(shake, 2.5);
    });
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    // темнота — мягкие градиенты: в половину разрешения не заметно, а рисуется в 4 раза быстрее
    lightCv.width = Math.ceil(cv.width * LK);
    lightCv.height = Math.ceil(cv.height * LK);
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
    const hero = AB.Party.lead();
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
  // цвет лампы: аварийный красный → рабочий тёплый белый, когда есть питание
  const WORK_LIGHT = [255, 236, 212];
  function lightColor(l) {
    const p = l.source ? 0 : AB.World.powerT();
    return l.color.map((c, k) => Math.round(c + (WORK_LIGHT[k] - c) * p));
  }

  function flicker(l, i) {
    // сцена: лампы сбоят
    if (AB.Story.fx.flicker > 0 && !l.source) {
      const r = Math.sin(time * 47 + i * 13) + Math.sin(time * 23 + i * 5);
      return r > 0.6 ? 0.9 : r > -0.4 ? 0.35 : 0.03;
    }
    // плавное мерцание + редкие провалы у неисправных ламп; с питанием свет ровный
    const n = Math.sin(time * 13.1 + i * 7) * 0.5 + Math.sin(time * 31.7 + i * 3) * 0.3 + Math.sin(time * 4.3 + i) * 0.2;
    const fl = l.source ? l.flicker : l.flicker * (1 - AB.World.powerT() * 0.9);
    let k = 1 - fl * (0.5 + n * 0.5);
    if (!l.source && AB.World.powerT() > 0.5) return U.clamp(k, 0, 1);
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

    if (bg.status === 'ready' && r.bgFloor) {
      // картинка ставится так, чтобы её линия пола совпала с полом игры
      const H = r.bgHeight || FLOOR / r.bgFloor;
      const top0 = FLOOR - r.bgFloor * H;
      if (top0 > 0) {
        // над картинкой — продолжение потолка: растянутая верхняя полоса и затемнение
        g.drawImage(bg.img, 0, 0, bg.img.width, 6, 0, 0, r.width, top0 + 2);
        const fade = g.createLinearGradient(0, 0, 0, top0 + 2);
        fade.addColorStop(0, 'rgba(3,3,4,1)');
        fade.addColorStop(1, 'rgba(3,3,4,.55)');
        g.fillStyle = fade;
        g.fillRect(0, 0, r.width, top0 + 2);
      }
      if (r.bgTile) {
        // фон плиткой: ширина по высоте картинки, каждая вторая — зеркально (без швов)
        const tw = bg.img.width * (H / bg.img.height);
        for (let x = 0, k = 0; x < r.width; x += tw, k++) {
          if (k % 2) { g.save(); g.translate(x + tw, 0); g.scale(-1, 1); g.drawImage(bg.img, 0, top0, tw, H); g.restore(); }
          else g.drawImage(bg.img, x, top0, tw, H);
        }
      } else g.drawImage(bg.img, 0, top0, r.width, H);
    } else if (bg.status === 'ready') {
      g.drawImage(bg.img, 0, 0, r.width, VH);
    } else {
      drawGreyboxRoom(g, r, rng, top);
    }
    return { canvas: c, K };
  }

  // технический тоннель (ROOM-012): трубы и кабели в упор, низкий потолок, вода на полу
  function drawTunnelRoom(g, r, rng, top) {
    g.fillStyle = '#050607'; g.fillRect(0, 0, r.width, VH);
    const wall = g.createLinearGradient(0, top, 0, FLOOR);
    wall.addColorStop(0, '#15181b'); wall.addColorStop(1, '#1d2124');
    g.fillStyle = wall; g.fillRect(0, top, r.width, FLOOR - top);
    // рёбра шпангоутов
    for (let x = 40; x < r.width; x += 120 + rng() * 40) {
      g.fillStyle = '#0d0f11'; g.fillRect(x, top, 16, FLOOR - top);
      g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(x + 2, top, 2, FLOOR - top);
    }
    // пучки труб вдоль стены
    for (let i = 0; i < 5; i++) {
      const y = top + 18 + i * 22 + rng() * 6, h = 7 + rng() * 6;
      g.fillStyle = ['#2a2d2f', '#33302b', '#262b2e'][i % 3]; g.fillRect(0, y, r.width, h);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + h - 2, r.width, 2);
      for (let x = 60 + rng() * 80; x < r.width; x += 220 + rng() * 120) { g.fillStyle = '#1a1c1e'; g.fillRect(x, y - 2, 8, h + 4); }
    }
    // потёки и водоросли у пола
    for (let x = 0; x < r.width; x += 30 + rng() * 60) {
      g.fillStyle = `rgba(60,90,50,${0.15 + rng() * 0.25})`;
      g.fillRect(x, FLOOR - 20 - rng() * 40, 3 + rng() * 6, 60);
    }
    // потолок — сразу над головой
    g.fillStyle = '#0a0b0c'; g.fillRect(0, top - 30, r.width, 34);
    g.fillStyle = '#202326'; g.fillRect(0, top - 2, r.width, 6);
    // решётка пола и вода
    g.fillStyle = '#111315'; g.fillRect(0, FLOOR, r.width, VH - FLOOR);
    g.fillStyle = 'rgba(40,70,80,.35)'; g.fillRect(0, FLOOR - 4, r.width, 10);
    g.fillStyle = 'rgba(150,200,210,.08)';
    for (let x = 0; x < r.width; x += 40 + rng() * 50) g.fillRect(x, FLOOR - 1, 20 + rng() * 40, 1.5);
  }

  function drawGreyboxRoom(g, r, rng, top) {
    const med = r.theme === 'medbay';
    if (r.theme === 'tunnel') { drawTunnelRoom(g, r, rng, top); return; }
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
    } else if (['lab', 'armory', 'lifesupport', 'airlock'].includes(r.theme)) {
      g.fillText({ lab: 'LAB-3', armory: 'ARMORY', lifesupport: 'LIFE SUPPORT', airlock: 'AIRLOCK A' }[r.theme], 140, top + 92);
    } else if (r.theme === 'storage') {
      for (let x = 300; x < r.width - 200; x += 600) g.fillText(`CARGO ${String(1 + Math.round(x / 600)).padStart(2, '0')}`, x, top + 92);
    } else if (r.theme === 'bridge') {
      g.fillText('BRIDGE', 140, top + 92);
    } else if (r.theme === 'living') {
      for (let x = 300; x < r.width - 200; x += 400) g.fillText(`K-${String(1 + Math.round(x / 400)).padStart(2, '0')}`, x, top + 92);
      g.fillText('CREW', 140, top + 92);
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

  // ---------- Имя персонажа и вещь над головой ----------
  // имена стоящих рядом не налезают друг на друга: следующее поднимается выше
  let tagsDrawn = [];
  function nameTag(id, x, y) {
    if (showIds) return;
    while (tagsDrawn.some((t) => Math.abs(t.x - x) < 64 && Math.abs(t.y - y) < 12)) y -= 14;
    tagsDrawn.push({ x, y });
    const def = AB.ID.get(id);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '600 10px "Oswald", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillText(def.name, x + 0.6, y + 0.6);
    const leads = AB.Party.isLeader(id) && AB.Party.members().length > 1;
    ctx.fillStyle = leads ? 'rgba(130,236,255,.95)' : 'rgba(225,218,205,.85)';
    ctx.fillText(def.name, x, y);
    if (leads) {
      ctx.beginPath(); ctx.moveTo(x - 4, y - 15); ctx.lineTo(x + 4, y - 15); ctx.lineTo(x, y - 10); ctx.fill();
    }
    // вещь, которую несёт персонаж (показывается по нажатию)
    const bub = bubbles.get(id);
    if (bub && bub.until > time) {
      const items = Array.isArray(bub.item) ? bub.item : bub.item ? [bub.item] : [];
      const text = items.length ? items.map((i) => AB.ID.get(i).name).join(' · ') : 'ничего не несёт';
      const it = items.length ? AB.ID.get(items[0]) : null;
      const a = Math.min(1, (bub.until - time) * 2);
      ctx.font = '11px "Share Tech Mono", monospace';
      const w = ctx.measureText(text).width + (it ? 30 : 14);
      const by = y - 24;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,10,12,.85)';
      ctx.strokeStyle = it ? 'rgba(94,230,255,.6)' : 'rgba(255,255,255,.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - w / 2, by - 11, w, 20, 4) : ctx.rect(x - w / 2, by - 11, w, 20);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 4, by + 9); ctx.lineTo(x, by + 14); ctx.lineTo(x + 4, by + 9); ctx.fill();
      if (it) {
        // значок-заглушка предмета (до появления иконки ASSET-ITEM*)
        ctx.fillStyle = it.category === 'key' ? '#5ee6ff' : '#9aa4ae';
        ctx.fillRect(x - w / 2 + 7, by - 5, 14, 10);
        ctx.fillStyle = '#0b0c0e';
        ctx.fillRect(x - w / 2 + 9, by - 2, 6, 2);
      }
      ctx.fillStyle = '#e1dacd';
      ctx.textAlign = 'left';
      ctx.fillText(text, x - w / 2 + (it ? 25 : 7), by + 4);
    }
    ctx.restore();
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
      // картинка из манифеста: открытый вариант после обыска, высота в единицах игры (h)
      const opened = p.assetOpen && p.container && AB.Rooms.isSearched(r.id, p.container);
      let asset = AB.Assets.get(opened ? p.assetOpen : p.asset);
      if (opened && asset.status !== 'ready') asset = AB.Assets.get(p.asset);
      if (asset.status === 'ready') {
        const h = p.h || asset.img.height / 4, w = asset.img.width * (h / asset.img.height);
        const x = sx(p.x), b = sy(p.y || 0);
        ctx.drawImage(p.dim ? tinted(asset.img, 'brightness(0.42) saturate(0.35)') : asset.img, x - w / 2, b - h, w, h);
        p._visor = p.visor ? { x: x + p.visor[0], y: b + p.visor[1] } : null;
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

    // жилой сектор: двухъярусная койка
    bunk(p) {
      const x = sx(p.x), b = sy(0);
      ctx.strokeStyle = '#22262b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x - 90, b); ctx.lineTo(x - 90, b - 170);
      ctx.moveTo(x + 90, b); ctx.lineTo(x + 90, b - 170);
      ctx.stroke();
      for (const yy of [b - 40, b - 125]) {
        ctx.fillStyle = '#2a2e33';
        ctx.fillRect(x - 92, yy, 184, 9);
        ctx.fillStyle = '#3d3a36';
        ctx.fillRect(x - 86, yy - 9, 172, 10);
        ctx.fillStyle = 'rgba(80,70,60,.6)';
        ctx.fillRect(x - 84, yy - 15, 40, 8);
      }
      // скомканное одеяло свисает с верхней полки
      ctx.fillStyle = 'rgba(60,55,50,.8)';
      ctx.beginPath(); ctx.moveTo(x + 30, b - 130); ctx.quadraticCurveTo(x + 60, b - 100, x + 50, b - 70); ctx.lineTo(x + 70, b - 120); ctx.fill();
    },
    // мостик: панорамный иллюминатор (рама и заслонки; вода за стеклом — в drawWindowView)
    window(p) {
      const x = sx(p.x), w = p.w, top = sy(p.top ?? -340), h = p.h ?? 200;
      ctx.fillStyle = '#020405';
      ctx.fillRect(x - w / 2, top, w, h);
      p._win = { x: x - w / 2, y: top, w, h };
      ctx.strokeStyle = '#2a2f35'; ctx.lineWidth = 14;
      ctx.strokeRect(x - w / 2, top, w, h);
      ctx.lineWidth = 6;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - w / 2 + (w * i) / 4, top); ctx.lineTo(x - w / 2 + (w * i) / 4, top + h); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc(x - w / 2 + 10 + i * (w - 20) / 17, top - 3, 2, 0, 7); ctx.fill(); }
    },
    // лаборатория: стеклянный резервуар с жидкостью (или разбитый)
    tank(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = '#1a1d21'; ctx.fillRect(x - 40, b - 22, 80, 22); ctx.fillRect(x - 40, b - 210, 80, 16);
      if (!p.broken) {
        const g = ctx.createLinearGradient(0, b - 194, 0, b - 22);
        g.addColorStop(0, 'rgba(60,160,110,.25)'); g.addColorStop(1, 'rgba(30,90,60,.5)');
        ctx.fillStyle = g; ctx.fillRect(x - 34, b - 194, 68, 172);
        ctx.fillStyle = 'rgba(20,30,25,.8)';
        ctx.beginPath(); ctx.ellipse(x, b - 110 + Math.sin(time * 0.6) * 3, 12, 30, 0, 0, 7); ctx.fill();   // что-то внутри
      } else {
        ctx.strokeStyle = 'rgba(180,220,210,.25)'; ctx.lineWidth = 1.2;
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 34 + i * 13, b - 22); ctx.lineTo(x - 30 + i * 12, b - 70 - (i % 3) * 25); ctx.stroke(); }
        ctx.fillStyle = 'rgba(40,90,70,.4)'; ctx.beginPath(); ctx.ellipse(x + 20, b, 70, 5, 0, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(200,230,220,.15)'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 34, b - 194, 68, 172);
    },
    table(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = '#23272c'; ctx.fillRect(x - 70, b - 68, 140, 8);
      ctx.fillStyle = '#1a1d21'; ctx.fillRect(x - 64, b - 60, 6, 60); ctx.fillRect(x + 58, b - 60, 6, 60);
      ctx.fillStyle = '#2e3338'; ctx.fillRect(x - 40, b - 92, 30, 24); ctx.fillRect(x + 10, b - 80, 14, 12);
      ctx.fillStyle = 'rgba(90,255,190,.25)'; ctx.fillRect(x - 36, b - 88, 22, 14);
    },
    // стеклянная перегородка (блики — в drawGlassShine, поверх персонажей за ней)
    glass(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = 'rgba(120,160,170,.06)'; ctx.fillRect(x - p.w / 2, b - 300, p.w, 300);
      ctx.strokeStyle = '#2b3036'; ctx.lineWidth = 6; ctx.strokeRect(x - p.w / 2, b - 300, p.w, 300);
    },
    // оружейная: стойка с оружием
    rack(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = '#1c2024'; ctx.fillRect(x - 80, b - 200, 160, 200);
      ctx.fillStyle = '#0d0f11'; ctx.fillRect(x - 72, b - 190, 144, 182);
      ctx.fillStyle = '#30353b';
      for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(x - 54 + i * 36, b - 30); ctx.rotate(-0.12); ctx.fillRect(-4, -140, 8, 140); ctx.restore(); }
    },
    // жизнеобеспечение: большой резервуар (один разбит — оттуда выходит Колосс)
    bigtank(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = '#1b1f23';
      ctx.fillRect(x - 110, b - 330, 220, 330);
      ctx.fillStyle = p.broken ? '#050607' : '#0f1a1c';
      ctx.fillRect(x - 96, b - 300, 192, 280);
      if (p.broken) {
        ctx.fillStyle = '#1b1f23';
        ctx.beginPath(); ctx.moveTo(x - 96, b - 120); ctx.lineTo(x - 40, b - 190); ctx.lineTo(x + 10, b - 150); ctx.lineTo(x + 60, b - 230); ctx.lineTo(x + 96, b - 160); ctx.lineTo(x + 96, b - 300); ctx.lineTo(x - 96, b - 300); ctx.fill();
        ctx.fillStyle = 'rgba(40,70,80,.35)'; ctx.beginPath(); ctx.ellipse(x, b + 2, 240, 8, 0, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(40,90,100,.25)'; ctx.fillRect(x - 96, b - 200 + Math.sin(time) * 3, 192, 180);
      }
      ctx.strokeStyle = '#2c3238'; ctx.lineWidth = 8;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - 110, b - 70 - i * 80); ctx.lineTo(x + 110, b - 70 - i * 80); ctx.stroke(); }
    },
    // шлюз: глубоководный экзокостюм на стойке (массивный механизированный скафандр)
    exorack(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = '#16191c'; ctx.fillRect(x - 100, b - 300, 12, 300); ctx.fillRect(x + 88, b - 300, 12, 300); ctx.fillRect(x - 100, b - 300, 200, 12);
      const body = p.broken ? '#2a2c2e' : '#454c52', shade = p.broken ? '#1c1e20' : '#30363b', accent = p.broken ? '#3a2a20' : '#8a6a2a';
      // ноги
      ctx.fillStyle = shade; ctx.fillRect(x - 46, b - 110, 34, 110); ctx.fillRect(x + 12, b - 110, 34, 110);
      ctx.fillStyle = body; ctx.fillRect(x - 52, b - 22, 44, 22); ctx.fillRect(x + 8, b - 22, 44, 22);
      // корпус
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(x - 62, b - 110); ctx.lineTo(x - 70, b - 210); ctx.quadraticCurveTo(x, b - 250, x + 70, b - 210); ctx.lineTo(x + 62, b - 110); ctx.fill();
      ctx.fillStyle = accent; ctx.fillRect(x - 50, b - 160, 100, 8);
      // наплечники
      ctx.fillStyle = shade;
      ctx.beginPath(); ctx.ellipse(x - 78, b - 205, 32, 26, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 78, b - 205, 32, 26, 0, 0, 7); ctx.fill();
      // руки
      if (!p.broken) { ctx.fillRect(x - 100, b - 200, 26, 110); ctx.fillRect(x + 74, b - 200, 26, 110); }
      else { ctx.fillRect(x - 100, b - 200, 26, 50); }
      // шлем
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, b - 250, 30, 26, 0, 0, 7); ctx.fill();
      ctx.fillStyle = p.broken ? '#0b0c0d' : '#0a1418'; ctx.fillRect(x - 20, b - 258, 40, 12);
      p._visor = p.broken ? null : { x, y: b - 252 };
    },

    // жилой сектор: дверь каюты Миры (EQUIP-008) — вмятая, заклинившая; после вскрытия открыта
    cabindoor(p) {
      const x = sx(p.x), b = sy(0);
      const open = AB.Equip.state(p.equip) === 'done';
      ctx.fillStyle = '#060708'; ctx.fillRect(x - 40, b - 200, 80, 200);
      ctx.strokeStyle = '#33383e'; ctx.lineWidth = 6; ctx.strokeRect(x - 43, b - 203, 86, 203);
      if (open) {
        ctx.fillStyle = '#272b30'; ctx.fillRect(x + 30, b - 196, 12, 196);   // створка уехала в стену
      } else {
        ctx.fillStyle = '#2a2e33'; ctx.fillRect(x - 40, b - 200, 80, 200);
        ctx.fillStyle = '#1c1f23';
        ctx.beginPath(); ctx.moveTo(x - 10, b - 120); ctx.lineTo(x + 18, b - 132); ctx.lineTo(x + 8, b - 96); ctx.lineTo(x - 16, b - 92); ctx.fill();   // вмятина
        ctx.fillStyle = 'rgba(200,160,40,.25)'; for (let i = 0; i < 5; i++) ctx.fillRect(x - 34, b - 180 + i * 34, 68, 5);
        ctx.fillStyle = '#ff3a2a'; ctx.fillRect(x + 48, b - 120, 5, 5);     // замок мигает красным
      }
      ctx.fillStyle = 'rgba(220,215,200,.35)'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillText('Б-14', x, b - 210);
    },
    // генераторная: горловина топливного бака (EQUIP-010)
    fueltank(p) {
      const x = sx(p.x), b = sy(0);
      const full = AB.Equip.state(p.equip) === 'done';
      ctx.fillStyle = '#1d2024'; ctx.fillRect(x - 34, b - 120, 68, 120);
      ctx.strokeStyle = '#2f3439'; ctx.lineWidth = 4; ctx.strokeRect(x - 34, b - 120, 68, 120);
      ctx.fillStyle = 'rgba(200,160,40,.35)'; ctx.fillRect(x - 34, b - 70, 68, 8);
      ctx.fillStyle = '#2a2e33'; ctx.fillRect(x - 10, b - 136, 20, 18);     // горловина
      ctx.fillStyle = '#0b0c0d'; ctx.fillRect(x - 24, b - 108, 12, 70);    // шкала
      ctx.fillStyle = full ? '#6fd08c' : '#802a20'; ctx.fillRect(x - 22, b - 40 - (full ? 64 : 6), 8, full ? 64 : 6);
    },
    // гидропоника: бак с водорослями — светится зелёным даже без питания
    algaetank(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = '#16191b'; ctx.fillRect(x - 56, b - 26, 112, 26); ctx.fillRect(x - 56, b - 250, 112, 16);
      if (!p.broken) {
        const g = ctx.createLinearGradient(0, b - 234, 0, b - 26);
        g.addColorStop(0, 'rgba(70,170,100,.30)'); g.addColorStop(1, 'rgba(40,120,70,.55)');
        ctx.fillStyle = g; ctx.fillRect(x - 48, b - 234, 96, 208);
        ctx.strokeStyle = 'rgba(120,220,140,.45)'; ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          const ax = x - 40 + i * 13;
          ctx.beginPath(); ctx.moveTo(ax, b - 26);
          ctx.quadraticCurveTo(ax + Math.sin(time * 0.8 + i) * 10, b - 120, ax + Math.sin(time * 0.6 + i * 2) * 6, b - 200 - (i % 3) * 12); ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(180,220,200,.25)'; ctx.lineWidth = 1.2;
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 48 + i * 18, b - 26); ctx.lineTo(x - 44 + i * 16, b - 90 - (i % 3) * 30); ctx.stroke(); }
        ctx.fillStyle = 'rgba(60,120,70,.45)'; ctx.beginPath(); ctx.ellipse(x + 30, b, 90, 6, 0, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(200,230,210,.18)'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 48, b - 234, 96, 208);
    },
    // гидропоника: ферма — стеллаж лотков с водорослями (EQUIP-009)
    algaefarm(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = '#15181a'; ctx.fillRect(x - 110, b - 230, 220, 230);
      for (let i = 0; i < 4; i++) {
        const y = b - 210 + i * 52;
        ctx.fillStyle = '#23272b'; ctx.fillRect(x - 104, y + 34, 208, 6);
        ctx.fillStyle = `rgba(80,${190 + (i % 2) * 20},110,${0.55 + Math.sin(time * 1.3 + i) * 0.08})`;
        ctx.fillRect(x - 100, y + 18, 200, 16);
        for (let k = 0; k < 9; k++) { ctx.fillRect(x - 96 + k * 23, y + 6 + Math.sin(time + k + i) * 2, 3, 14); }
      }
    },

    // отсек жизнеобеспечения: распределитель основного питания (EQUIP-006)
    powerpanel(p) {
      const x = sx(p.x), b = sy(0);
      const on = AB.Equip.state(p.equip) === 'done';
      ctx.fillStyle = '#17191c'; ctx.fillRect(x - 70, b - 250, 140, 220);
      ctx.strokeStyle = '#2c3137'; ctx.lineWidth = 6; ctx.strokeRect(x - 70, b - 250, 140, 220);
      ctx.fillStyle = '#0c0d0f'; ctx.fillRect(x - 56, b - 236, 112, 120);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = '#24282d'; ctx.fillRect(x - 48 + i * 17, b - 226, 12, 40);
        ctx.fillStyle = on ? 'rgba(80,220,140,.9)' : (i % 2 ? 'rgba(255,60,40,.85)' : 'rgba(60,20,20,.9)');
        ctx.fillRect(x - 45 + i * 17, b - 180, 6, 5);
      }
      ctx.fillStyle = 'rgba(200,160,40,.35)';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 56 + i * 32, b - 100, 18, 6);
      // толстые кабели в пол
      ctx.strokeStyle = '#111316'; ctx.lineWidth = 9;
      for (const dx of [-40, -10, 22]) { ctx.beginPath(); ctx.moveTo(x + dx, b - 30); ctx.quadraticCurveTo(x + dx + 10, b - 8, x + dx + 40, b); ctx.stroke(); }
    },

    // склад: штабель контейнеров
    crates(p) {
      const x = sx(p.x), b = sy(0);
      const box = (cx, cy, w, h, c) => {
        ctx.fillStyle = c; ctx.fillRect(cx - w / 2, cy - h, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - w / 2, cy - h, w, h);
        ctx.fillStyle = 'rgba(200,160,40,.12)'; ctx.fillRect(cx - w / 2 + 4, cy - h + 6, w - 8, 4);
      };
      box(x - 40, b, 80, 70, '#2a2a26'); box(x + 42, b, 80, 70, '#24282a'); box(x, b - 70, 90, 60, '#2c2723');
    },
    // мостик: пульт управления
    console(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = '#1b1f24';
      ctx.beginPath(); ctx.moveTo(x - 70, b); ctx.lineTo(x - 70, b - 70); ctx.lineTo(x - 40, b - 110); ctx.lineTo(x + 70, b - 110); ctx.lineTo(x + 70, b); ctx.fill();
      ctx.fillStyle = '#071210';
      ctx.fillRect(x - 30, b - 104, 90, 26);
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      for (let i = 0; i < 5; i++) ctx.fillRect(x - 60 + i * 26, b - 62, 16, 6);
    },

    // личный шкафчик
    locker(p) {
      const x = sx(p.x), b = sy(0);
      ctx.fillStyle = '#1e2226';
      ctx.fillRect(x - 28, b - 175, 56, 175);
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 28, b - 175, 56, 175);
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 18, b - 160 + i * 6, 36, 2);
      ctx.fillStyle = '#3a3f45';
      ctx.fillRect(x + 16, b - 95, 4, 14);
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
    const hero = AB.Party.lead();
    for (const d of r.doors) {
      const x = sx(d.x), b = sy(0);
      const ad = AB.Arena.seamless() && AB.Arena.doorFor(r.id, d.key);
      if (ad) { drawArenaDoor(r, d, ad, x, b, hero); continue; }
      if (r.artDoors) {
        // дверь нарисована на фоне: только индикатор доступа
        d._light = { x: x + (d.x < r.width / 2 ? 58 : -58), y: b - 150, locked: !AB.Rooms.canPass(d).ok, near: hero && Math.abs(hero.x - d.x) < 80 };
        continue;
      }
      const open = AB.Rooms.doorOpen(`${r.id}:${d.key}`);
      const locked = !AB.Rooms.canPass(d).ok;
      const near = hero && Math.abs(hero.x - d.x) < 80;
      if (d.kind === 'hatch') {
        // люк в полу: рама, крышка откидывается, под ней — темнота шахты
        ctx.fillStyle = '#030304'; ctx.fillRect(x - 44, b - 3, 88, 10);
        ctx.fillStyle = '#2b3036'; ctx.fillRect(x - 50, b - 5, 100, 5);
        const lid = open * 1.3;
        ctx.save(); ctx.translate(x - 44, b - 4); ctx.rotate(-lid);
        ctx.fillStyle = '#3a4047'; ctx.fillRect(0, -4, 88, 5);
        ctx.fillStyle = 'rgba(200,160,40,.4)'; for (let i = 0; i < 4; i++) ctx.fillRect(8 + i * 20, -3.5, 10, 3);
        ctx.restore();
        d._light = { x: x + 58, y: b - 14, locked, near };
        drawJam(r, d, x, b);
        continue;
      }
      if (d.kind === 'ladder') {
        // лестница вверх: стойки, перекладины, люк в потолке
        const top = sy(-r.height);
        ctx.strokeStyle = '#3a3f45'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x - 16, b); ctx.lineTo(x - 16, top); ctx.moveTo(x + 16, b); ctx.lineTo(x + 16, top); ctx.stroke();
        ctx.lineWidth = 3;
        for (let y = b - 18; y > top; y -= 22) { ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x + 16, y); ctx.stroke(); }
        ctx.fillStyle = '#030304'; ctx.fillRect(x - 30, top - 2, 60, 8);
        ctx.fillStyle = '#2b3036'; ctx.fillRect(x - 34, top + 4, 68, 4);
        d._light = { x: x + 30, y: top + 24, locked, near };
        drawJam(r, d, x, top + 6);
        continue;
      }
      // своя картинка двери (внешний люк шлюза)
      const art = d.art && AB.Assets.get(d.art);
      if (art && art.status === 'ready') {
        const h = 230, w = art.img.width * (h / art.img.height);
        const cx = x - (d.x > r.width / 2 ? 24 : -24);
        ctx.drawImage(art.img, cx - w / 2, b - h, w, h);
        d._light = { x: cx - (d.x > r.width / 2 ? w / 2 + 8 : -w / 2 - 8), y: b - 150, locked, near };
        continue;
      }
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

  // дверь боевой локации: створки по её состоянию, доски укрепления, прочность
  function drawArenaDoor(r, d, ad, x, b, hero) {
    const k = `${r.id}:${d.key}`;
    const want = AB.Arena.passable(ad) ? 1 : 0;
    const cur = doorShut.has(k) ? doorShut.get(k) : want;
    const open = cur + (want - cur) * 0.25;
    doorShut.set(k, open);
    const near = hero && hero.room === r.id && Math.abs(hero.x - d.x) < 80;
    const jx = ad.shake > 0 ? (Math.random() - 0.5) * 6 : 0;
    const X = x + jx;
    if (!r.artDoors || open < 0.98) {
      // проём и створки
      if (!r.artDoors) { ctx.fillStyle = '#030304'; ctx.fillRect(X - 46, b - 190, 92, 190); }
      const slide = open * 44;
      ctx.fillStyle = ad.state === 'broken' ? '#1a1c1f' : '#262a2f';
      if (ad.state === 'broken') {
        // выбитая: перекошенные обломки створок
        ctx.save(); ctx.translate(X - 30, b); ctx.rotate(-0.25); ctx.fillRect(-14, -150, 28, 150); ctx.restore();
        ctx.save(); ctx.translate(X + 32, b); ctx.rotate(0.35); ctx.fillRect(-12, -120, 24, 120); ctx.restore();
      } else {
        ctx.fillRect(X - 46, b - 190, 46 - slide, 190);
        ctx.fillRect(X + slide, b - 190, 46 - slide, 190);
        ctx.fillStyle = 'rgba(200,160,40,.18)';
        for (let i = 0; i < 6; i++) if (46 - slide > 8) {
          ctx.fillRect(X - 40, b - 170 + i * 28, Math.max(0, 34 - slide), 6);
          ctx.fillRect(X + slide + 6, b - 170 + i * 28, Math.max(0, 34 - slide), 6);
        }
      }
      if (!r.artDoors) { ctx.strokeStyle = '#3a3f45'; ctx.lineWidth = 8; ctx.strokeRect(X - 50, b - 194, 100, 194); }
    }
    if (ad.state === 'fortified') {
      // укрепление: стальные полосы крест-накрест
      ctx.strokeStyle = '#6b5a2a'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(X - 46, b - 170); ctx.lineTo(X + 46, b - 40); ctx.moveTo(X + 46, b - 170); ctx.lineTo(X - 46, b - 40); ctx.stroke();
      ctx.fillStyle = '#4a4f55';
      for (const y of [b - 150, b - 95, b - 40]) ctx.fillRect(X - 52, y - 6, 104, 12);
      ctx.fillStyle = 'rgba(230,190,60,.35)';
      for (const y of [b - 150, b - 95, b - 40]) for (let i = 0; i < 5; i++) ctx.fillRect(X - 48 + i * 21, y - 5, 9, 10);
    }
    // прочность закрытой двери (в испытании)
    if (AB.Arena.active() && !AB.Arena.passable(ad)) {
      const max = ad.state === 'fortified' ? ad.fortHp : ad.maxHp, f = U.clamp(ad.hp / max, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x - 40, b - 214, 80, 7);
      ctx.fillStyle = f > 0.5 ? (ad.state === 'fortified' ? '#e0b640' : '#7fd0e6') : f > 0.25 ? '#e08a40' : '#e04a3a';
      ctx.fillRect(x - 39, b - 213, 78 * f, 5);
    }
    // кто-то работает с дверью — полоса прогресса
    for (const c of AB.Party.members()) {
      if (!c.work || c.work.door !== ad.key || c.room !== r.id) continue;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x - 40, b - 226, 80, 6);
      ctx.fillStyle = '#5ee6ff'; ctx.fillRect(x - 39, b - 225, 78 * U.clamp(c.work.t / c.work.time, 0, 1), 4);
    }
    d._light = { x: x + (d.x < r.width / 2 ? 62 : -62), y: b - 120, locked: !AB.Arena.passable(ad), near };
  }
  const doorShut = new Map();

  // заклинивший люк испытания: аварийные полосы, искры, этапы починки
  function drawJam(r, d, x, y) {
    if (!AB.Arena.active()) return;
    const l = AB.Arena.ladderFor(r.id, d.key);
    if (!l || l.key !== AB.Arena.jammed()) return;
    const rp = AB.Arena.repair();
    ctx.save();
    ctx.fillStyle = 'rgba(20,16,10,.85)'; ctx.fillRect(x - 40, y - 8, 80, 14);
    ctx.fillStyle = 'rgba(230,180,40,.85)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 40 + i * 14, y + 6); ctx.lineTo(x - 33 + i * 14, y - 8); ctx.lineTo(x - 27 + i * 14, y - 8); ctx.lineTo(x - 34 + i * 14, y + 6); ctx.fill(); }
    // этапы: ●●○
    for (let i = 0; i < rp.stages; i++) {
      ctx.fillStyle = i < rp.stage ? '#e0b640' : 'rgba(0,0,0,.7)';
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x - (rp.stages - 1) * 9 + i * 18, y - 22, 5, 0, 7); ctx.fill(); ctx.stroke();
    }
    if (rp.prog > 0) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x - 30, y - 36, 60, 5); ctx.fillStyle = '#ffe08a'; ctx.fillRect(x - 29, y - 35, 58 * rp.prog, 3); }
    ctx.restore();
    if (Math.random() < 0.08) for (let i = 0; i < 4; i++) pushFx({ room: r.id, k: 'spark', x: x + (Math.random() - 0.5) * 60, y: y - FLOOR + 0, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 80, life: 0.4, age: 0, s: 1.5 });
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
    const breath = Math.sin(time * 1.45 + (hero.id === 'CHAR-002' ? 1.3 : 0));
    P.breath = breath;

    if (action === 'walk' || action === 'run') {
      const run = action === 'run';
      const cyc = (hero.stride / (run ? 120 : 76)) * Math.PI * 2;
      const amp = run ? 0.55 : 0.4;   // размах шага: при беге шире, но без «шпагата»
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
    } else if (action === 'attack' && hero.equipped && (AB.ID.get(hero.equipped).weapon || {}).ranged) {
      // выстрел из ружья: рука вскинута вперёд, отдача
      const p = AB.Anim.progress(hero.id);
      const up = U.ease(U.clamp(p / 0.15, 0, 1)), down = U.ease(U.clamp((p - 0.6) / 0.4, 0, 1));
      const recoil = p > 0.15 && p < 0.45 ? Math.sin(((p - 0.15) / 0.3) * Math.PI) : 0;
      const aim = up * (1 - down);
      P.shL = U.lerp(0.2, 1.5 - recoil * 0.18, aim); P.elL = U.lerp(-0.25, -0.05, aim);
      P.shR = U.lerp(-0.06, 1.25, aim); P.elR = U.lerp(-0.25, -0.5, aim);
      P.pipe = U.lerp(0.35, 0, aim);
      P.lean = -0.06 * recoil + 0.04 * aim;
      P.head = 0.05 * aim;
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
      // ANIM-CHAR001-05: дыхание в покое (вдох ~1,8 с): грудь поднимается, плечи и голова
      // идут за ней, руки чуть покачиваются, вес медленно переносится с ноги на ногу
      const sway = Math.sin(time * 0.55);
      P.breath = breath;
      P.chest = breath;                      // для скелета из частей: вдох удлиняет торс
      P.bob = breath * 0.9;
      P.lean = 0.025 + sway * 0.018 - breath * 0.012;
      P.head = Math.sin(time * 0.45) * 0.05 - breath * 0.035;
      P.shL = 0.08 + breath * 0.045 + Math.sin(time * 0.9) * 0.02;
      P.shR = -0.06 - breath * 0.045 - Math.sin(time * 0.9 + 1) * 0.02;
      P.elL = -0.22 - breath * 0.04; P.elR = -0.25 - breath * 0.04;
      P.hipL = sway * 0.025; P.hipR = -sway * 0.025;
      P.kneeL = 0.05 + Math.max(0, sway) * 0.05; P.kneeR = 0.05 + Math.max(0, -sway) * 0.05;
    }
    return { P, action };
  }

  // ---------- Истинный облик спутницы (ASSET-CHAR002-02): глубоководный арахнид ----------
  // Пока нет картинки — процедурная заглушка: бледное полупрозрачное тело, восемь длинных
  // членистых ног, хоботок, светящиеся нервы и «лицо» из светящихся точек.
  // существо из вспышки: стоит в помещении (fx.trueForm.x), полупрозрачное, мерцает
  function drawTrueForm(hero, pass) {
    const x = sx(hero.x), b = sy(0), f = hero.facing;
    ctx.save();
    const tf = AB.Story.fx.trueForm, p = tf ? 1 - tf.t / tf.dur : 0;
    ctx.globalAlpha *= (0.78 + 0.22 * Math.sin(Math.min(1, p) * Math.PI)) * (Math.sin(time * 55) > -0.85 ? 1 : 0.15);
    const asset = AB.Assets.get('ASSET-CHAR002-02');
    if (asset.status === 'ready' && asset.img) {
      // картинка assets/char002/true/full.png: тело — на уровне груди человека, ноги — до пола
      const h = 120, w = asset.img.width * (h / asset.img.height);
      const jit = Math.sin(time * 47) * 2;
      ctx.save(); ctx.translate(x + jit, b); ctx.scale(f, 1);
      if (pass === 'body') {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.beginPath(); ctx.ellipse(0, 1, w * 0.45, 5, 0, 0, 7); ctx.fill();
        ctx.drawImage(asset.img, -w / 2, -h, w, h);
      } else if (pass === 'emissive') {
        const hx = w * 0.29, hy = -h * 0.86;
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 26);
        g.addColorStop(0, 'rgba(94,230,255,.55)'); g.addColorStop(1, 'rgba(94,230,255,0)');
        ctx.fillStyle = g; ctx.fillRect(hx - 26, hy - 26, 52, 52);
      }
      ctx.restore();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x, b); ctx.scale(f, 1);
    const bodyY = -96 + Math.sin(time * 9) * 2;
    const tw = (i) => Math.sin(time * 13 + i * 1.7) * 0.06;
    if (pass === 'body') {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(0, 1, 120, 5, 0, 0, 7); ctx.fill();
      // ноги: колено высоко над телом, кончик — игла на полу
      const leg = (i, far) => {
        const side = i < 4 ? 1 : -1, k = i % 4;
        const rx = side * (14 + k * 7), tipX = side * (52 + k * 38) + (far ? -10 : 0);
        const kneeX = rx + side * (26 + k * 9), kneeY = bodyY - 58 - (3 - k) * 10;
        ctx.strokeStyle = far ? 'rgba(120,140,155,.75)' : 'rgba(205,220,230,.92)';
        ctx.lineWidth = far ? 3 : 4.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(rx, bodyY); ctx.lineTo(kneeX, kneeY + tw(i) * 60);
        ctx.lineTo(tipX * 0.9, bodyY + 30); ctx.lineTo(tipX, 0); ctx.stroke();
      };
      for (let i = 0; i < 8; i++) leg(i, true);
      // брюшко и головогрудь
      ctx.fillStyle = 'rgba(190,210,222,.82)';
      ctx.beginPath(); ctx.ellipse(-34, bodyY + 4, 30, 13, 0.18, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2, bodyY - 2, 22, 15, -0.1, 0, 7); ctx.fill();
      // голова с хоботком
      ctx.beginPath(); ctx.ellipse(26, bodyY - 8, 12, 10, -0.3, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(190,210,222,.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(34, bodyY - 2); ctx.quadraticCurveTo(48, bodyY + 6 + Math.sin(time * 6) * 3, 54, bodyY + 18); ctx.stroke();
      // щупальца-пальпы
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(30, bodyY + 2); ctx.quadraticCurveTo(42, bodyY + 22, 36, bodyY + 34); ctx.stroke();
      for (let i = 0; i < 8; i++) if (i % 2 === 0) leg(i, false);
      for (let i = 1; i < 8; i += 2) leg(i, false);
    } else if (pass === 'emissive') {
      // нервы и «лицо» из светящихся точек — тень облика, который видит Марк
      ctx.strokeStyle = `rgba(94,230,255,${0.55 + Math.sin(time * 20) * 0.2})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-58, bodyY + 4); ctx.quadraticCurveTo(-20, bodyY - 6, 22, bodyY - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-40, bodyY + 10); ctx.quadraticCurveTo(-8, bodyY + 6, 14, bodyY + 4); ctx.stroke();
      ctx.fillStyle = 'rgba(160,245,255,.95)';
      for (const [dx, dy] of [[22, -12], [30, -12], [26, -6], [24, -2], [28, -2]]) { ctx.beginPath(); ctx.arc(dx, bodyY + dy, 1.6, 0, 7); ctx.fill(); }
      const g = ctx.createRadialGradient(26, bodyY - 8, 0, 26, bodyY - 8, 30);
      g.addColorStop(0, 'rgba(94,230,255,.35)'); g.addColorStop(1, 'rgba(94,230,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-4, bodyY - 38, 60, 60);
    }
    ctx.restore();
    ctx.restore();
  }
  function trueFormHere(r) {
    const tf = AB.Story.fx.trueForm;
    return tf && tf.room === r.id ? { id: 'TRUE-FORM', x: tf.x, facing: tf.facing } : null;
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
      else if (pass === 'emissive') { idTag(ctx, `${hero.appearance} · ${AB.Anim.current(hero.id)?.animId || ''}`, x, b - 142); nameTag(hero.id, x, b - 134); }
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
      const look = AB.ID.get(hero.id).look || {};
      const dark = look.dark || '#1c2026', mid = look.mid || '#363e48', light = look.light || '#4a5560';
      if (look.build) { ctx.scale(look.build, 1); }
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
      if (look.hair) {
        // длинные волосы до плеч (заглушка спутницы)
        ctx.fillStyle = look.hair;
        ctx.beginPath(); ctx.moveTo(-9, -20); ctx.quadraticCurveTo(-13, 0, -10, 10); ctx.lineTo(2, 8); ctx.lineTo(4, -20); ctx.fill();
      }
      ctx.fillStyle = mid;
      ctx.beginPath(); ctx.ellipse(1, -16, 9.5, 11, 0, 0, 7); ctx.fill();
      if (look.hair) {
        ctx.fillStyle = look.hair;
        ctx.beginPath(); ctx.ellipse(-1, -22, 10.5, 6.5, -0.2, Math.PI, 0); ctx.fill();
      }
      if (look.helmet) {
        // защитный шлем: купол, тёмный щиток, шланг дыхательной системы
        ctx.fillStyle = look.light;
        ctx.beginPath(); ctx.ellipse(1, -17, 12.5, 13.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#05080a';
        ctx.beginPath(); ctx.ellipse(6, -17, 6.5, 8.5, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,170,80,.35)';
        ctx.fillRect(7, -21, 3, 2);                     // отблеск на щитке
        ctx.strokeStyle = look.dark; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-8, -8); ctx.quadraticCurveTo(-16, 2, -10, 12); ctx.stroke();
      } else if (look.hood) {
        // капюшон: лица не видно, только темнота
        ctx.fillStyle = '#030303';
        ctx.beginPath(); ctx.ellipse(3, -15, 7.5, 9, 0, 0, 7); ctx.fill();
        ctx.fillStyle = look.mid;
        ctx.beginPath();
        ctx.moveTo(10, -6); ctx.quadraticCurveTo(13, -28, 0, -30); ctx.quadraticCurveTo(-14, -28, -13, -8);
        ctx.lineTo(-9, 2); ctx.lineTo(-2, -2); ctx.quadraticCurveTo(-4, -20, 6, -22); ctx.quadraticCurveTo(9, -14, 10, -6);
        ctx.fill();
      } else {
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.ellipse(-2, -19, 4, 6, 0, 0, 7); ctx.fill();
      }
      ctx.restore();
      // ближняя рука (и оружие в ней)
      const hand = limb(3, shY + 3, P.shL, 21, -P.elL, 20, 8.5, mid);
      if (hero.equipped) drawWeapon(hand, P.shL - P.elL + (P.pipe ?? 0.35), hero.equipped, P.shL - P.elL, hero.id);
      ctx.restore();
      // ближняя нога
      limb(2, hipY, P.hipL, 27, -P.kneeL, 27, 10, mid);
    } else if (pass === 'emissive') {
      // светящиеся элементы криокостюма — поверх темноты (только у Марка)
      if (hero.id !== 'CHAR-001') { ctx.restore(); nameTag(hero.id, x, b - 134); return; }
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
    if (pass === 'emissive') { idTag(ctx, `${hero.appearance} · ${AB.Anim.current(hero.id)?.animId || ''}`, x, b - 142); nameTag(hero.id, x, b - 134); }
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

  // затемнённая копия картинки — один раз, а не фильтром в каждом кадре (ctx.filter очень медленный)
  const tintCache = new WeakMap();
  function tinted(img, filter) {
    let m = tintCache.get(img);
    if (!m) { m = new Map(); tintCache.set(img, m); }
    let c = m.get(filter);
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.filter = filter;
      g.drawImage(img, 0, 0);
      m.set(filter, c);
    }
    return c;
  }

  function rigBone(img, spec, x1, y1, ang, len, darken) {
    const g = rigGeom(img, spec, len);
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(g.imgAng - ang);
    ctx.scale(g.s * g.sx, g.s);
    if (darken) img = tinted(img, `brightness(${darken})`);
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
    if (P.chest) torso.len *= 1 + P.chest * 0.012;   // вдох: грудь поднимается
    const shoulder = (side) => {
      const anchor = R.torso[`shoulder_${side}`] || R.torso.shoulder;
      const p = rigAnchor(torso.img, torso.spec, 0, hipY, torsoAng, torso.len, anchor);
      if (!R.torso[`shoulder_${side}`] && side === 'far') p.x -= 3;
      p.y += P.breath * 0.4 - (P.chest || 0) * 0.6;   // плечи поднимаются на вдохе
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
        drawWeapon(hand, foreAng + (P.pipe ?? 0.35), hero.equipped, foreAng, hero.id);
      }
    }
    ctx.restore();
  }

  // ---------- Оружие в руке: труба (ASSET-ITEM009-01) или гарпунное ружьё (ASSET-ITEM011-01) ----------
  function drawWeapon(hand, ang, itemId, foreAng, owner) {
    const wdef = itemId && AB.ID.get(itemId);
    if (wdef && wdef.weapon && wdef.weapon.dart) {
      // дротиковый пистолет: компактный корпус, зелёная капсула с препаратом
      ctx.save();
      ctx.translate(hand.fx, hand.fy);
      ctx.rotate(-ang + Math.PI / 2);
      ctx.fillStyle = '#23272b'; ctx.fillRect(-3, -3.5, 20, 7);      // корпус
      ctx.fillStyle = '#1a1d20'; ctx.fillRect(0, 3.5, 5, 7);          // рукоять
      ctx.fillStyle = '#3a4046'; ctx.fillRect(16, -1.8, 9, 3.6);     // ствол
      ctx.fillStyle = owner && AB.Combat.auraActive(owner) ? '#7dffb0' : '#3fa070';
      ctx.fillRect(4, -6.5, 8, 3);                                    // капсула
      ctx.restore();
      return;
    }
    if (wdef && wdef.weapon && wdef.weapon.energy) {
      // наручный плазмомёт: обруч на предплечье и излучатель у кисти, всегда вдоль руки
      const a = foreAng ?? ang;
      const ht = owner ? AB.Inventory.heat(owner) : null;
      const h = ht ? ht.heat : 0;
      ctx.save();
      ctx.translate(hand.fx, hand.fy);
      ctx.rotate(-a + Math.PI / 2);        // ось +x — от локтя к кисти
      const icon = AB.Assets.get(wdef.icon);
      if (icon.status === 'ready') {
        // картинка ASSET-ITEM011-01 вдоль предплечья, сопло у кисти
        const L = 40, H = L * icon.img.height / icon.img.width;
        ctx.drawImage(icon.img, -L + 12, -H / 2, L, H);
        if (h > 0.5) {   // перегрев: сопло наливается оранжевым
          const g = ctx.createRadialGradient(9, 0, 0, 9, 0, 9);
          g.addColorStop(0, `rgba(255,140,60,${(h - 0.5) * 1.6})`); g.addColorStop(1, 'rgba(255,90,30,0)');
          ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, -9, 18, 18);
        }
        ctx.restore();
        return;
      }
      ctx.fillStyle = '#2b3036';
      ctx.fillRect(-22, -5.5, 22, 11);     // корпус на предплечье
      ctx.fillStyle = '#3d444c';
      ctx.fillRect(-20, -6.5, 5, 13); ctx.fillRect(-9, -6.5, 5, 13);   // хомуты
      ctx.fillStyle = '#1a1d21';
      ctx.fillRect(0, -4, 7, 8);           // излучатель
      // катушки светятся от нагрева: голубой → фиолетовый → оранжевый
      const col = h < 0.5 ? [94, 230, 255] : h < 0.85 ? [180, 140, 255] : [255, 120, 60];
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.55 + h * 0.45})`;
      ctx.fillRect(-17, -2, 3, 4); ctx.fillRect(-12, -2, 3, 4); ctx.fillRect(-7, -2, 3, 4);
      ctx.beginPath(); ctx.arc(7.5, 0, 2.6, 0, 7); ctx.fill();
      ctx.restore();
      return;
    }
    if (wdef && wdef.weapon && wdef.weapon.ranged) {
      // ружьё: приклад у руки, ствол вдоль руки, гарпун торчит из дула
      ctx.save();
      ctx.translate(hand.fx, hand.fy);
      ctx.rotate(-ang + Math.PI / 2);     // ось +x — вдоль ствола
      ctx.fillStyle = '#26292d';
      ctx.fillRect(-14, -4, 18, 8);        // приклад
      ctx.fillStyle = '#3a3f45';
      ctx.fillRect(0, -3.5, 40, 7);        // корпус
      ctx.fillStyle = '#1c1f22';
      ctx.fillRect(10, 3.5, 6, 7);         // рукоять
      ctx.fillStyle = '#4b5158';
      ctx.fillRect(38, -2, 12, 4);         // ствол
      ctx.fillStyle = '#7a6a50';
      ctx.fillRect(48, -1, 10, 2);         // гарпун
      ctx.beginPath(); ctx.moveTo(58, -3); ctx.lineTo(64, 0); ctx.lineTo(58, 3); ctx.fill();
      ctx.fillStyle = 'rgba(94,230,255,.7)';
      ctx.fillRect(14, -5, 4, 2);          // индикатор давления
      ctx.restore();
      return;
    }
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

  // преследователь: человеческий силуэт (заглушка ASSET-ENEMY002-01), появляется и растворяется
  function drawPursuer(e, def, pass) {
    const fake = { id: e.id, x: e.x, facing: e.facing, stride: e.stride, appearance: def.appearance, equipped: 'ITEM-009', hidden: false, room: e.room };
    ctx.save();
    ctx.globalAlpha = U.clamp(e.alpha == null ? 1 : e.alpha, 0, 1) * ctx.globalAlpha;
    drawHero(fake, pass);
    if (pass === 'body' && e.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,220,200,${0.25 * e.flash})`;
      ctx.fillRect(sx(e.x) - 16, sy(-120), 32, 120);
    }
    ctx.restore();
  }

  // ---------- Мутант-гуманоид из частей (ASSET-ENEMY001-01, скелет MUTANT) ----------
  // Позы строятся от сгорбленной позы на исходной картинке: наклон торса, голова вперёд,
  // согнутые руки и ноги. Ноги всегда стоят на полу (подстраивается высота таза).
  const MUT_REST = { lean: 1.0, head: 0.4, shL: -0.45, elL: -1.2, shR: -0.1, elR: -1.05, hipL: 0.22, kneeL: 0.62, hipR: 0.08, kneeR: 0.55 };
  function mutantPose(e, rig) {
    const tr = AB.Anim.current(e.id);
    const action = tr ? tr.action : 'idle';
    const p = AB.Anim.progress(e.id);
    const P = { ...MUT_REST, bob: 0, dx: 0, crouch: 0, breath: 0, chest: 0 };
    const twitch = Math.sin(time * 9 + e.x) * Math.sin(time * 2.3);
    if (action === 'walk' || action === 'run') {
      const run = action === 'run';
      const cyc = (e.stride / (run ? 105 : 70)) * Math.PI * 2;
      const amp = run ? 0.5 : 0.32;
      P.hipL += Math.sin(cyc) * amp;
      P.hipR += Math.sin(cyc + Math.PI) * amp;
      P.kneeL += Math.max(0, Math.cos(cyc)) * (run ? 1.0 : 0.55);
      P.kneeR += Math.max(0, Math.cos(cyc + Math.PI)) * (run ? 1.0 : 0.55);
      // руки болтаются в такт, при беге вытянуты вперёд, когтями к добыче
      P.shL += -Math.sin(cyc) * amp * 0.7 + (run ? 0.55 : 0);
      P.shR += -Math.sin(cyc + Math.PI) * amp * 0.7 + (run ? 0.45 : 0);
      P.elL += run ? 0.35 : 0; P.elR += run ? 0.3 : 0;
      P.bob = Math.abs(Math.cos(cyc)) * (run ? 5 : 2.5);
      P.lean += run ? 0.18 : 0.05;
      P.head += run ? -0.12 : 0;
    } else if (action === 'alert') {
      // заметил: выпрямляется и ревёт, задрав голову
      const k = Math.sin(Math.min(1, p) * Math.PI);
      P.lean -= 0.45 * k; P.head -= 0.55 * k;
      P.shL += 0.9 * k; P.shR += 0.8 * k; P.elL += 0.5 * k; P.elR += 0.4 * k;
      P.lean += twitch * 0.03;
    } else if (action === 'attack') {
      // замах когтями над головой → удар сверху вниз с рывком → возврат
      const up = U.ease(U.clamp(p / 0.5, 0, 1)), hit = U.ease(U.clamp((p - 0.5) / 0.15, 0, 1)), back = U.ease(U.clamp((p - 0.7) / 0.3, 0, 1));
      const k = 1 - back;
      P.shL = U.lerp(MUT_REST.shL, U.lerp(2.5, 0.9, hit), k);
      P.elL = U.lerp(MUT_REST.elL, U.lerp(-0.6, -0.15, hit), k);
      P.shR = U.lerp(MUT_REST.shR, U.lerp(1.6, 0.6, hit), k);
      P.lean = MUT_REST.lean + (-0.3 * up + 0.5 * hit) * k;
      P.head = MUT_REST.head + (-0.35 * up + 0.2 * hit) * k;
      P.hipR = MUT_REST.hipR + 0.35 * hit * k; P.kneeR = MUT_REST.kneeR + 0.3 * hit * k;
    } else if (action === 'hurt') {
      const k = Math.sin(Math.min(1, p) * Math.PI);
      P.lean -= 0.4 * k; P.head -= 0.3 * k; P.shL -= 0.4 * k; P.shR -= 0.3 * k;
    } else if (action === 'death') {
      P.lean -= 0.3; P.shL -= 0.6; P.shR -= 0.4; P.head -= 0.3;
    } else {
      // ожидание: дышит и подёргивается
      P.lean += Math.sin(time * 1.6 + e.x) * 0.04 + twitch * 0.02;
      P.head += Math.sin(time * 0.9 + e.x) * 0.08;
      P.shL += Math.sin(time * 1.6 + e.x) * 0.05; P.shR += Math.sin(time * 1.6 + e.x + 1) * 0.05;
    }
    // ступни на полу: нижняя лодыжка там же, где на исходной картинке
    const B = rig.bones;
    const ankleY = (hip, knee, side) => rig.hipY + Math.cos(hip) * B[`thigh_${side}`] + Math.cos(hip - knee) * B[`shin_${side}`];
    const restAnkle = Math.max(ankleY(MUT_REST.hipL, MUT_REST.kneeL, 'near'), ankleY(MUT_REST.hipR, MUT_REST.kneeR, 'far'));
    const ankle = Math.max(ankleY(P.hipL, P.kneeL, 'near'), ankleY(P.hipR, P.kneeR, 'far'));
    P.crouch = restAnkle - ankle;
    return { P, action };
  }

  function drawMutantRig(e, def, asset, pass) {
    const rig = AB.RIGS[AB.ID.get(def.asset).rig];
    const { P, action } = mutantPose(e, rig);
    const x = sx(e.x), b = sy(0);
    const fake = { id: e.id, facing: e.facing, appearance: def.asset, equipped: null };
    if (pass === 'body') {
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); ctx.ellipse(x, b + 1, 38, 6, 0, 0, 7); ctx.fill();
      ctx.save();
      // наклон торса на исходной картинке уже учтён в MUT_REST: рисуем без поправки «прямого» героя
      drawHeroRig(fake, P, action, asset, x, b);
      ctx.restore();
      if (e.flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,220,200,${0.22 * e.flash})`;
        ctx.beginPath(); ctx.ellipse(x + e.facing * 14, b - 62, 46, 40, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      return;
    }
    if (pass === 'emissive') {
      // глаза: на конце головы; горят ярче, когда он охотится
      if (action !== 'death') {
        const hipY = rig.hipY + P.bob * 0.5 + P.crouch, tA = Math.PI - P.lean, hA = tA - P.head;
        const nx = Math.sin(tA) * rig.bones.torso, ny = hipY + Math.cos(tA) * rig.bones.torso;
        const ex = x + e.facing * (nx + Math.sin(hA) * rig.bones.head * 1.05), ey = b + ny + Math.cos(hA) * rig.bones.head * 1.05 + 1;
        const angry = ['ALERT', 'CHASE', 'ATTACK'].includes(e.state) ? 1 : 0.5;
        const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 11);
        g.addColorStop(0, `rgba(255,150,60,${0.85 * angry})`); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g; ctx.fillRect(ex - 11, ey - 11, 22, 22);
      }
      const tr = AB.Anim.current(e.id);
      idTag(ctx, `${def.asset} · ${tr ? tr.animId : ''} · ${e.state}`, x, b - 132);
      if (e.state !== 'DEAD') nameTag(e.id, x, b - 124);
    }
  }

  function drawEnemy(e, pass) {
    const def = AB.ID.get(e.id);
    if (def.humanoid) { drawPursuer(e, def, pass); return; }
    if (e.state === 'DORMANT') return;           // спит в резервуаре — не видно
    const asset = AB.Assets.get(def.asset);
    if (asset.status === 'ready' && asset.parts) { drawMutantRig(e, def, asset, pass); return; }
    const { Q, action } = enemyPose(e);
    const k = def.scale || 1;
    const x = sx(e.x + Q.dx * e.facing * k), b = sy(0);
    // босс поднимается из резервуара
    // только один раз — при пробуждении; повторная тревога после удара не «топит» его снова
    let rise = 1;
    if (def.type === 'boss' && !e.risen) {
      rise = e.state === 'ALERT' ? U.ease(U.clamp(e.t / 0.7, 0, 1)) : 1;
      if (rise >= 1) e.risen = true;
    }
    if (pass === 'body') {
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); ctx.ellipse(x, b + 1, (40 + Q.splay * 20) * k, 6 * k, 0, 0, 7); ctx.fill();
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
    if (k > 1) {
      // у увеличенного существа поза лап «проваливается» под пол — срезаем по полу
      ctx.beginPath(); ctx.rect(x - 400, b - 600, 800, 606); ctx.clip();
    }
    ctx.translate(x, b + (1 - rise) * 120 - (k - 1) * 10);
    ctx.scale(e.facing * k, k);
    ctx.globalAlpha *= rise;
    const bodyY = -Q.h;
    const tint = def.tint || {};
    const flesh = tint.flesh || '#7d6663', dark = tint.dark || '#3e3132', plate = tint.plate || '#323840';

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
      if (e.state !== 'DEAD') nameTag(e.id, x, b - 96 * k);
    }
  }

  // ---------- Кровь ----------
  function bleed(x, y, dir, n) {
    for (let i = 0; i < n; i++) {
      pushFx({ k: 'blood', x, y: y + (Math.random() - 0.5) * 20, vx: dir * (40 + Math.random() * 160), vy: -60 - Math.random() * 120, life: 1.2, age: 0, s: 1.5 + Math.random() * 2 });
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
    if (AB.Arena.active()) return;   // в испытании выход не ищем
    const h = AB.Nav.hint();
    const hero = AB.Party.lead();
    if (hero && drawRoom && drawRoom !== hero.room) return;   // в секторе — только в помещении ведущего
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
  // преобразование «помещение → экран»: обычное или для помещения боевой локации
  let segT = null;
  function applyT(g, k = 1) { if (segT) g.setTransform(segT.S * k, 0, 0, segT.S * k, segT.ox * k, segT.oy * k); else g.setTransform(scale * k, 0, 0, scale * k, 0, 0); }

  function drawLighting(r) { lightBegin(); lightHoles(r); lightEnd(); lightGlow(r); }
  function lightBegin() {
    const L = lctx;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = 'source-over';
    L.fillStyle = `rgba(2,3,5,${0.94 - AB.World.powerT() * 0.1})`;   // с питанием светлее
    L.fillRect(0, 0, lightCv.width, lightCv.height);
  }
  function lightHoles(r) {
    const L = lctx;
    applyT(L, LK);
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
    // преследователя видно и в темноте — едва-едва
    for (const e of AB.Enemies.inRoom(r.id)) {
      if (AB.ID.get(e.id).humanoid) hole(sx(e.x), sy(-70), 140, 0.32 * U.clamp(e.alpha || 0, 0, 1));
    }
    // герой видит немного вокруг себя
    // каждый в группе видит немного вокруг себя
    for (const m of AB.Party.members()) if (m.room === r.id) hole(sx(m.x), sy(-60), 190, 0.5);
    // тревога: весь отсек вспыхивает красным
    const a = alarmPulse();
    if (a > 0) { L.fillStyle = `rgba(0,0,0,${0.12 * a})`; L.fillRect(-10, -10, VW + 20, VH + 20); }
  }
  function lightEnd() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lightCv, 0, 0, cv.width, cv.height);
  }
  function lightGlow(r) {
    applyT(ctx);
    // цветное свечение (аддитивно)
    ctx.globalCompositeOperation = 'lighter';
    r.lights.forEach((l, i) => {
      const k = flicker(l, i);
      const [cr, cg, cb] = lightColor(l);
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
    drawEquipFx(r);
    drawWindowView(r);
    drawTargetHighlight();
    drawLogs(r, 'emissive');
    { const tf = trueFormHere(r); if (tf) drawTrueForm(tf, 'emissive'); }
    // аура лечения дротикового пистолета: мягкое зелёное кольцо у ног
    for (const c of AB.Party.members()) {
      if (c.room !== r.id || c.hidden || !AB.Combat.hasAura(c.id)) continue;
      const on = AB.Combat.auraActive(c.id), rad = AB.Combat.weaponOf(c.id).weapon.aura.radius;
      const a = (on ? 0.22 : 0.07) + Math.sin(time * 3) * (on ? 0.06 : 0.02);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(110,255,170,${a})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx(c.x), sy(0) - 2, rad * 0.98, 9, 0, 0, 7); ctx.stroke();
      if (on) for (let i = 0; i < 3; i++) {
        const t = (time * 0.6 + i / 3) % 1;
        ctx.fillStyle = `rgba(120,255,180,${0.45 * (1 - t)})`;
        ctx.fillRect(sx(c.x) + Math.sin(i * 2.1 + time) * 14, sy(-20 - t * 90), 2, 2);
      }
      ctx.restore();
    }
    AB.Enemies.inRoom(r.id).forEach((e) => drawEnemy(e, 'emissive'));
    drawNavMarker();
    ctx.globalCompositeOperation = 'source-over';
    AB.Chars.all().filter((c) => c.id !== AB.Party.leader() && c.room === r.id && !c.hidden).forEach((c) => drawHero(c, 'emissive'));
    { const l = AB.Party.lead(); if (l && (l.room === r.id || !AB.Arena.seamless())) drawHero(l, 'emissive'); }
    drawBarks(r);
  }

  // ---------- Реплики над головой (BARK SYSTEM) ----------
  function wrapText(text, maxW) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function drawBarks(r) {
    for (const bk of AB.Barks.active()) {
      const c = AB.Chars.get(bk.id), e = !c && AB.Enemies.get(bk.id);
      const who = c || e;
      if (!who || who.room !== r.id) continue;
      const mutant = e && AB.ID.get(e.id).type === 'mutant';
      const x = sx(who.x), y = sy(c ? -152 : mutant ? -150 : -150);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = bk.a;
      ctx.font = `${bk.think ? 'italic ' : ''}9.5px "Share Tech Mono", monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const text = bk.think ? `(${bk.text})` : bk.text;
      const lines = wrapText(text, 150);
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12, h = lines.length * 11 + 7;
      const bx = Math.max(sx(0) + 4, Math.min(x - w / 2, sx(r.width) - w - 4)), by = y - h;
      if (mutant) {
        // мутант: без рамки, дрожащий красноватый шёпот
        ctx.fillStyle = 'rgba(255,120,100,.85)';
        lines.forEach((l, i) => ctx.fillText(l, bx + 6 + Math.sin(time * 30 + i) * 0.8, by + 12 + i * 11));
      } else {
        ctx.fillStyle = bk.think ? 'rgba(8,10,12,.55)' : 'rgba(8,10,12,.82)';
        roundRect(bx, by, w, h, 4); ctx.fill();
        ctx.strokeStyle = bk.think ? 'rgba(255,255,255,.12)' : (AB.Party.isLeader(bk.id) ? 'rgba(94,230,255,.45)' : 'rgba(255,255,255,.22)');
        ctx.lineWidth = 1; roundRect(bx, by, w, h, 4); ctx.stroke();
        // хвостик: у мысли — кружки, у речи — уголок
        ctx.fillStyle = bk.think ? 'rgba(8,10,12,.55)' : 'rgba(8,10,12,.82)';
        if (bk.think) { ctx.beginPath(); ctx.arc(x, by + h + 4, 2.2, 0, 7); ctx.arc(x + 3, by + h + 9, 1.4, 0, 7); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(x - 4, by + h); ctx.lineTo(x + 4, by + h); ctx.lineTo(x, by + h + 6); ctx.fill(); }
        ctx.fillStyle = bk.think ? 'rgba(190,200,205,.9)' : 'rgba(240,236,228,.95)';
        lines.forEach((l, i) => ctx.fillText(l, bx + 6, by + 12 + i * 11));
      }
      ctx.restore();
    }
  }

  // ---------- Предметы на полу (заглушки ASSET-ITEM*) ----------
  const CAT_COLOR = { resource: [150, 160, 170], medical: [220, 225, 220], ammo: [190, 160, 90] };

  // ---------- Находки и записи экипажа (LOG-*) ----------
  function drawLogs(r, pass) {
    for (const lg of AB.Logs.inRoom(r.id)) {
      const l = lg.log, x = sx(lg.x), b = sy(lg.y || 0);
      if (pass === 'emissive') {
        // непрочитанное слабо пульсирует, прочитанное — едва заметно
        const a = lg.read ? 0.12 : 0.35 + Math.sin(time * 3 + lg.x) * 0.2;
        const col = l.form === 'trace' && l.look === 'algae' ? '150,230,120' : l.form === 'audio' ? '255,90,70' : '94,230,255';
        const cy = l.form === 'trace' ? b - 30 : b - 8;
        const g = ctx.createRadialGradient(x, cy, 0, x, cy, l.form === 'trace' ? 46 : 22);
        g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.fillRect(x - 50, cy - 50, 100, 100);
        idTag(ctx, l.id, x, b - 40);
        continue;
      }
      ctx.save();
      if (l.form === 'pad') {
        ctx.fillStyle = '#16191c'; ctx.fillRect(x - 11, b - 4, 22, 4);
        ctx.fillStyle = lg.read ? '#0d2a30' : '#1d6a78'; ctx.fillRect(x - 8, b - 3.5, 16, 2.5);
      } else if (l.form === 'terminal') {
        ctx.fillStyle = '#15181b'; ctx.fillRect(x - 22, b - 18, 44, 34);
        ctx.strokeStyle = '#2c3137'; ctx.lineWidth = 3; ctx.strokeRect(x - 22, b - 18, 44, 34);
        ctx.fillStyle = lg.read ? '#081a1d' : '#0e3e46'; ctx.fillRect(x - 17, b - 13, 34, 20);
        ctx.fillStyle = 'rgba(94,230,255,.5)';
        for (let i = 0; i < 4; i++) ctx.fillRect(x - 14, b - 10 + i * 4, 10 + ((i * 7 + 5) % 16), 1.5);
      } else if (l.form === 'audio') {
        ctx.fillStyle = '#1a1c1f'; ctx.fillRect(x - 8, b - 6, 16, 6);
        ctx.fillStyle = '#2c3036'; ctx.fillRect(x - 6, b - 9, 4, 3);
        ctx.fillStyle = lg.read ? '#401010' : (Math.sin(time * 4) > 0 ? '#ff3a2a' : '#601818'); ctx.fillRect(x + 3, b - 5, 3, 2);
      } else if (l.form === 'tag') {
        ctx.fillStyle = '#8a8f94'; ctx.fillRect(x - 5, b - 3, 10, 3);
        ctx.strokeStyle = 'rgba(160,160,165,.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 5, b - 2); ctx.quadraticCurveTo(x - 14, b - 1, x - 18, b); ctx.stroke();
      } else if (l.look === 'tally') {
        ctx.strokeStyle = 'rgba(190,185,170,.32)'; ctx.lineWidth = 1.2;
        for (let row = 0; row < 7; row++) for (let g = 0; g < 6; g++) {
          const gx = x - 54 + g * 18, gy = b - 50 + row * 12 + (g % 2);
          for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(gx + k * 3, gy); ctx.lineTo(gx + k * 3, gy + 8); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(gx - 2, gy + 6); ctx.lineTo(gx + 12, gy + 1); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(120,40,30,.45)'; ctx.lineWidth = 3;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 30 + k * 12, b + 40); ctx.lineTo(x - 18 + k * 12, b + 90); ctx.stroke(); }
      } else if (l.look === 'shelter') {
        ctx.fillStyle = '#2a2a22';
        ctx.beginPath(); ctx.moveTo(x - 60, b); ctx.lineTo(x - 50, b - 52); ctx.lineTo(x + 46, b - 46); ctx.lineTo(x + 58, b); ctx.fill();
        ctx.fillStyle = '#1b1c18'; ctx.fillRect(x - 40, b - 10, 70, 10);
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x + 30, b - 14, 10, 14);
        ctx.fillStyle = 'rgba(120,180,90,.5)'; ctx.fillRect(x + 31, b - 15, 8, 3);
      } else if (l.look === 'algae') {
        ctx.fillStyle = 'rgba(70,120,60,.55)';
        for (let i = 0; i < 9; i++) {
          const ax = x - 40 + i * 10, h = 30 + ((i * 37) % 40);
          ctx.beginPath(); ctx.moveTo(ax, b); ctx.quadraticCurveTo(ax + Math.sin(time + i) * 8, b - h / 2, ax + Math.sin(time * 0.7 + i) * 5, b - h); ctx.lineTo(ax + 4, b); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

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

  // ---------- Обзорный иллюминатор: вода за стеклом (поверх темноты) ----------
  function drawWindowView(r) {
    for (const p of r.props) {
      if (p._visor) {
        // визор целого экзокостюма слабо светится
        ctx.fillStyle = `rgba(94,230,255,${0.35 + Math.sin(time * 2) * 0.15})`;
        ctx.fillRect(p._visor.x - 18, p._visor.y - 4, 36, 4);
      }
      if (p.kind === 'glass') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(150,200,210,.08)'; ctx.lineWidth = 10;
        const x = sx(p.x);
        ctx.beginPath(); ctx.moveTo(x - p.w / 2 + 20, sy(-280)); ctx.lineTo(x - p.w / 2 + 70, sy(-20)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 10, sy(-290)); ctx.lineTo(x + 40, sy(-120)); ctx.stroke();
        ctx.restore();
      }
      if (p.kind !== 'window' || !p._win) continue;
      // окна и экраны внешних камер открываются в конце акта I (EVENT-012)
      const open = AB.Story.isDone('EVENT-012') ? 1 : AB.Story.fx.window;
      const { x, y, w, h } = p._win;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.rect(x + 7, y + 7, w - 14, h - 14); ctx.clip();
      if (open > 0) {
        // толща воды
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, '#000507'); g.addColorStop(0.5, '#03161c'); g.addColorStop(1, '#061e22');
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        // лучи наружных прожекторов
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 2; i++) {
          const bx = x + w * (0.3 + i * 0.4) + Math.sin(time * 0.3 + i) * 20;
          const bg = ctx.createLinearGradient(bx, y, bx, y + h);
          bg.addColorStop(0, 'rgba(120,200,210,.16)'); bg.addColorStop(1, 'rgba(120,200,210,0)');
          ctx.fillStyle = bg;
          ctx.beginPath(); ctx.moveTo(bx - 10, y); ctx.lineTo(bx + 10, y); ctx.lineTo(bx + 90, y + h); ctx.lineTo(bx - 90, y + h); ctx.fill();
        }
        // морской снег
        ctx.fillStyle = 'rgba(190,220,220,.5)';
        for (let i = 0; i < 70; i++) {
          const px = x + ((i * 97.3 + time * (6 + (i % 5))) % w);
          const py = y + ((i * 53.7 + time * (4 + (i % 3) * 2)) % h);
          ctx.fillRect(px, py, 1.3, 1.3);
        }
        ctx.globalCompositeOperation = 'source-over';
        // что-то огромное проплывает мимо (EVENT-007)
        const L = AB.Story.fx.leviathan;
        if (L >= 0) {
          const k = L / 9, lx = x + w * (1.3 - k * 1.7), ly = y + h * 0.62 + Math.sin(L * 0.8) * 8;
          const a = Math.min(1, L, 9 - L) * 0.85;
          ctx.fillStyle = `rgba(1,4,5,${a})`;
          ctx.beginPath(); ctx.ellipse(lx, ly, 260, 46, -0.03, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.moveTo(lx + 240, ly); ctx.lineTo(lx + 380, ly - 50 + Math.sin(L * 3) * 14); ctx.lineTo(lx + 380, ly + 40 + Math.sin(L * 3) * 14); ctx.fill();
          ctx.beginPath(); ctx.moveTo(lx - 60, ly - 30); ctx.lineTo(lx - 10, ly - 90); ctx.lineTo(lx + 40, ly - 32); ctx.fill();
          ctx.fillStyle = `rgba(140,255,230,${a * 0.6})`;
          for (let i = 0; i < 6; i++) ctx.fillRect(lx - 200 + i * 60, ly + 12, 3, 3);   // светящиеся точки вдоль бока
        }
        ctx.fillStyle = `rgba(0,0,0,${1 - open})`; ctx.fillRect(x, y, w, h);
      }
      // заслонки поднимаются вверх
      const shut = h * (1 - Math.max(0, open));
      ctx.fillStyle = '#1d2125';
      for (let yy = 0; yy < shut; yy += 18) {
        ctx.fillRect(x, y + yy, w, Math.min(16, shut - yy));
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x, y + yy + 14, w, 2); ctx.fillStyle = '#1d2125';
      }
      ctx.restore();
    }
  }

  // ---------- Оборудование энергоотсека: эффекты поверх фона ----------
  function led(x, y, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
    g.addColorStop(0, `rgba(${rgb},${0.55 * a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - 14, y - 14, 28, 28);
    ctx.fillStyle = `rgba(${rgb},${a})`;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }

  function drawEquipFx(r) {
    for (const e of AB.Equip.inRoom(r.id)) {
      const st = AB.Equip.state(e.id);
      const x = sx(e.x), y = sy(e.y);
      if (e.id === 'EQUIP-001') {
        // электрощит: красный мигает — пустое гнездо, зелёный — предохранитель на месте
        if (st === 'done') led(x + 30, y - 40, '80,255,140', 0.9);
        else led(x + 30, y - 40, '255,50,40', Math.sin(time * 5) > 0 ? 0.9 : 0.15);
      }
      if (e.id === 'EQUIP-002') {
        if (st === 'done') led(x, y - 60, '80,255,140', 0.9);
        else led(x, y - 60, '255,170,40', Math.sin(time * 3 + 1) > 0 ? 0.8 : 0.2);
      }
      if (e.id === 'EQUIP-003' && st === 'done') {
        // генератор работает: сердечник светится, по нему бегут блики вращения
        const p = AB.World.powerT();
        const pulse = 0.8 + Math.sin(time * 6) * 0.2;
        const g = ctx.createRadialGradient(x, y, 4, x, y, 112);
        g.addColorStop(0, `rgba(170,240,255,${0.55 * p * pulse})`);
        g.addColorStop(0.45, `rgba(90,200,255,${0.22 * p})`);
        g.addColorStop(1, 'rgba(90,200,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 112, y - 112, 224, 224);
        ctx.strokeStyle = `rgba(200,245,255,${0.28 * p})`;
        ctx.lineWidth = 3;
        const rot = time * 9;
        for (let k = 0; k < 8; k++) {
          const a = rot + (k * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15);
          ctx.lineTo(x + Math.cos(a) * 68, y + Math.sin(a) * 68);
          ctx.stroke();
        }
      }
      if (e.id === 'EQUIP-004' && AB.Story.fx.ghost > 0) {
        // EVENT-002: на среднем экране мелькает женский силуэт с помехами
        const g = AB.Story.fx.ghost;
        const a = Math.min(1, g * 2) * (Math.sin(time * 37) > -0.3 ? 1 : 0.25);
        // средний экран пульта (по картинке): x 1022–1065, y −157…−128
        const cx = sx(1043) + (Math.random() - 0.5) * 2, cy = sy(-143);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(150,255,210,${0.35 * a})`;
        ctx.fillRect(cx - 21, cy - 14, 42, 29);
        ctx.fillStyle = `rgba(4,10,8,${0.9 * a})`;
        ctx.beginPath(); ctx.ellipse(cx, cy - 5, 6, 7, 0, 0, 7); ctx.fill();          // голова
        ctx.beginPath(); ctx.moveTo(cx - 7, cy - 6); ctx.quadraticCurveTo(cx - 10, cy + 6, cx - 9, cy + 9);
        ctx.lineTo(cx + 9, cy + 9); ctx.quadraticCurveTo(cx + 10, cy + 6, cx + 7, cy - 6); ctx.fill(); // волосы
        ctx.beginPath(); ctx.moveTo(cx - 15, cy + 14); ctx.quadraticCurveTo(cx, cy + 2, cx + 15, cy + 14); ctx.fill();  // плечи
        ctx.fillStyle = `rgba(200,255,230,${0.5 * a})`;
        for (let k = 0; k < 3; k++) ctx.fillRect(cx - 21, cy - 14 + Math.random() * 29, 42, 1.2);
        ctx.restore();
      }
      if (e.id === 'EQUIP-004' && AB.World.hasPower()) {
        // пульт: оживают три экрана
        const p = AB.World.powerT();
        for (const [x0, x1] of [[977, 1017], [1022, 1065], [1070, 1111]]) {
          const fl = Math.sin(time * 23 + x0) > 0.96 ? 0.4 : 1;
          ctx.fillStyle = `rgba(90,255,190,${0.16 * p * fl})`;
          ctx.fillRect(sx(x0), sy(-157), x1 - x0, 29);
          ctx.fillStyle = `rgba(150,255,210,${0.45 * p * fl})`;
          for (let k = 0; k < 4; k++) ctx.fillRect(sx(x0) + 4, sy(-152) + k * 6, (x1 - x0 - 10) * (0.4 + ((k * 37 + x0) % 50) / 100), 1.5);
        }
      }
    }
  }

  // подсветка объекта, с которым сейчас можно взаимодействовать
  function drawTargetHighlight() {
    const t = AB.Interact.target(AB.Party.leader());
    const hero = AB.Party.lead();
    if (!t || !hero || !hero.controllable || t.kind === 'door') return;
    if (t.kind === 'equip') {
      const e = t.ref, a = 0.3 + Math.sin(time * 4) * 0.12;
      ctx.strokeStyle = `rgba(94,230,255,${a})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -time * 12;
      ctx.strokeRect(sx(e.x) - e.w / 2, sy(e.y) - e.h / 2, e.w, e.h);
      ctx.setLineDash([]);
      return;
    }
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
    fxRoom = r.id;
    // пыль в воздухе
    if (particles.filter((p) => p.k === 'dust' && p.room === r.id).length < 60) {
      pushFx({ k: 'dust', x: cam.x + Math.random() * VW, y: -Math.random() * r.height, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.3) * 4, life: 6 + Math.random() * 6, age: 0, s: 0.6 + Math.random() * 1.4 });
    }
    for (const x of r.fx.steam) {
      if (Math.random() < dt * 9) pushFx({ k: 'steam', x: x + (Math.random() - 0.5) * 10, y: -4, vx: (Math.random() - 0.5) * 10, vy: -25 - Math.random() * 25, life: 3 + Math.random() * 2, age: 0, s: 8 + Math.random() * 8 });
    }
    if (r.id === 'ROOM-003' && AB.Equip.state('EQUIP-002') !== 'done' && Math.random() < dt * 1.6) {
      for (let i = 0; i < 10; i++) pushFx({ k: 'spark', x: 859 + Math.random() * 25, y: -25, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 90, life: 0.5 + Math.random() * 0.6, age: 0, s: 1.5 });
    }
    for (const x of r.fx.sparks) {
      if (Math.random() < dt * 1.2) {
        for (let i = 0; i < 14; i++) pushFx({ k: 'spark', x, y: -320, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 80, life: 0.6 + Math.random() * 0.8, age: 0, s: 1.5 });
      }
    }
    for (const x of r.fx.drips) {
      if (Math.random() < dt * 0.6) pushFx({ k: 'drip', x: x + (Math.random() - 0.5) * 30, y: -r.height + 40, vx: 0, vy: 0, life: 3, age: 0, s: 1.6 });
    }
    fxRoom = null;
  }

  function updateFx(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age > p.life) { particles.splice(i, 1); continue; }
      fxRoom = p.room;
      if (p.k === 'spark' || p.k === 'drip' || p.k === 'blood') p.vy += 420 * dt;
      if (p.k === 'blood' && p.y > 0) {
        const r = p.room || AB.Rooms.current();
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
          for (let j = 0; j < 3; j++) pushFx({ k: 'splash', x: p.x, y: -1, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 30, life: 0.35, age: 0, s: 1 });
          particles.splice(i, 1);
          continue;
        }
        p.y = 0; p.vy *= -0.3; p.vx *= 0.5;
      }
      if (p.k === 'splash') p.vy += 300 * dt;
    }
    fxRoom = null;
  }

  function drawFx(layer) {
    for (const p of particles) {
      if (drawRoom && p.room !== drawRoom) continue;
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
      if (layer === 'glow' && p.k === 'bolt') {
        const t = Math.min(1, p.age / p.life);
        const bx = sx(p.x0 + (p.x2 - p.x0) * t), dir = Math.sign(p.x2 - p.x0) || 1;
        const tail = ctx.createLinearGradient(bx - dir * 46, 0, bx, 0);
        tail.addColorStop(0, 'rgba(150,110,255,0)');
        tail.addColorStop(1, 'rgba(170,140,255,.75)');
        ctx.strokeStyle = tail; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx - dir * 46, y); ctx.lineTo(bx, y); ctx.stroke();
        const g = ctx.createRadialGradient(bx, y, 0, bx, y, 16);
        g.addColorStop(0, 'rgba(240,250,255,1)'); g.addColorStop(0.35, 'rgba(140,220,255,.85)'); g.addColorStop(1, 'rgba(120,90,255,0)');
        ctx.fillStyle = g; ctx.fillRect(bx - 16, y - 16, 32, 32);
        if (t >= 0.85 && !p.done) {
          p.done = true;
          if (p.hit) for (let i = 0; i < 10; i++) pushFx({ room: p.room, k: 'spark', x: p.x2, y: p.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 160, life: 0.35, age: 0, s: 2 });
        }
        continue;
      }
      if (layer === 'glow' && p.k === 'tracer') {
        const g = ctx.createLinearGradient(sx(p.x), 0, sx(p.x2), 0);
        g.addColorStop(0, p.dart ? `rgba(120,255,170,${0.1 * a})` : `rgba(200,240,255,${0.1 * a})`);
        g.addColorStop(1, p.dart ? `rgba(170,255,200,${0.9 * a})` : `rgba(220,250,255,${0.9 * a})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx(p.x), y); ctx.lineTo(sx(p.x2), y); ctx.stroke();
        continue;
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
    const hero = AB.Party.lead();
    const low = hero ? 1 - hero.hp / AB.ID.get(hero.id).stats.maxHp : 0;
    const red = Math.max(hurtFlash, low > 0.65 ? (0.25 + Math.sin(time * 4) * 0.12) * (low - 0.4) : 0);
    if (red > 0.01) {
      const rv = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
      rv.addColorStop(0, 'rgba(120,0,0,0)');
      rv.addColorStop(1, `rgba(150,0,0,${0.75 * red})`);
      ctx.fillStyle = rv;
      ctx.fillRect(0, 0, w, h);
    }
    // истинный облик: холодная вспышка и строки помех
    const tf = AB.Story.fx.trueForm;
    if (tf) {
      const k = Math.sin(Math.min(1, 1 - tf.t / tf.dur) * Math.PI);
      ctx.fillStyle = `rgba(0,0,0,${0.5 * Math.min(1, k * 1.6)})`;   // свет почти гаснет
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(120,220,255,${0.10 * k + (Math.sin(time * 60) > 0.6 ? 0.06 : 0)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(200,250,255,${0.18 * k})`;
      for (let i = 0; i < 6; i++) { const y = ((time * 900 + i * 173) % h); ctx.fillRect(0, y, w, 2 * dpr); }
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

  // ---------- Кадр боевой локации: несколько помещений и этажей сразу ----------
  // камера отъезжает, чтобы было видно соседние помещения и этаж; отдаление меняет игрок (колесо, −/+)
  const ZMIN = 0.34, ZMAX = 1;   // 0,34 — видно три палубы сразу
  let ZOOM = 0.74;
  try { const z = parseFloat(localStorage.getItem('abyss_zoom')); if (z >= ZMIN && z <= ZMAX) ZOOM = z; } catch (e) { /* хранилище недоступно */ }
  function setZoom(z) {
    ZOOM = U.clamp(Math.round(z * 100) / 100, ZMIN, ZMAX);
    try { localStorage.setItem('abyss_zoom', String(ZOOM)); } catch (e) { /* хранилище недоступно */ }
    return ZOOM;
  }
  let look = 0;                 // плавный взгляд вперёд: не дёргается при развороте
  const camW = { x: 0, y: 0 };  // камера в координатах локации
  const statics = new Map();    // кэш фона помещений локации
  let arenaSnap = true;

  function arenaCamTarget() {
    const hero = AB.Party.lead(), segs = AB.Arena.segments();
    const s = hero && segs.find((q) => q.room === hero.room);
    if (!s) return { x: camW.x, y: camW.y };
    const vw = VW / ZOOM, vh = VH / ZOOM;
    const minX = Math.min(...segs.map((q) => q.x0)), maxX = Math.max(...segs.map((q) => q.x0 + q.width));
    let tx = s.x0 + hero.x - vw / 2 + look * vw * 0.06;
    tx = maxX - minX <= vw ? (minX + maxX - vw) / 2 : U.clamp(tx, minX, maxX - vw);
    const floors = Math.max(...segs.map((q) => q.floor)) + 1;
    const ty = U.clamp(s.floor * VH + VH / 2 - vh / 2 - 30, 0, Math.max(0, floors * VH - vh));
    return { x: tx, y: ty };
  }

  // где помещение локации на экране; cam.x — в координатах этого помещения
  function segXform(s, swayX = 0, swayY = 0) {
    const S = scale * ZOOM;
    return { S, ox: swayX * scale, oy: (swayY + (s.floor * VH - camW.y) * ZOOM) * scale, camx: camW.x - s.x0 };
  }
  function useSeg(s, swayX, swayY) {
    segT = segXform(s, swayX, swayY);
    cam.x = segT.camx;
    applyT(ctx);
    drawRoom = s.room;
  }
  // часть помещения, которая видна: до проёмов, ведущих в соседние помещения
  function segClip(s) {
    let a = -300, b = s.width + 300;
    for (const d of AB.Arena.doors()) {
      const x = d.room === s.room ? d.x : d.other && d.other.room === s.room ? d.other.x : null;
      if (x == null || !d.other) continue;
      if (x < s.width / 2) a = Math.max(a, x); else b = Math.min(b, x);
    }
    return { a, b };
  }
  // подъём или спуск по лестнице: персонаж плавно переходит на другой этаж
  function withClimb(c, s, segs, t, draw) {
    if (!c.climb) { draw(); return; }
    const to = segs.find((q) => q.room === c.climb.to.room);
    const k = U.clamp(c.climb.t / t, 0, 1);
    ctx.save();
    if (to) ctx.translate(((to.x0 + c.climb.to.x) - (s.x0 + c.x)) * k, (to.floor - s.floor) * VH * k);
    draw();
    ctx.restore();
  }

  function arenaFrame(dt, swayX, swayY) {
    const hero = AB.Party.lead();
    const segs = AB.Arena.segments();
    const vw0 = VW;
    const t = arenaCamTarget();
    if (hero) look = U.lerp(look, hero.facing, 1 - Math.pow(0.25, dt));
    if (arenaSnap) { camW.x = t.x; camW.y = t.y; arenaSnap = false; }
    // мягкое следование: при беге и переходах камера не рвётся
    camW.x = U.lerp(camW.x, t.x, 1 - Math.pow(0.02, dt));
    camW.y = U.lerp(camW.y, t.y, 1 - Math.pow(0.03, dt));
    VW = vw0 / ZOOM;
    // рисуются только помещения, которые попадают в кадр
    const vw = VW, vh = VH / ZOOM;
    const rooms = segs.filter((s) => s.x0 < camW.x + vw + 60 && s.x0 + s.width > camW.x - 60 &&
      s.floor * VH < camW.y + vh && (s.floor + 1) * VH > camW.y).map((s) => ({ s, r: AB.ID.get(s.room) }));
    for (const { s, r } of rooms) {
      if (!statics.has(r.id)) statics.set(r.id, buildStatic(r));
      useSeg(s, 0, 0); spawnFx(r, dt);
    }
    updateFx(dt);
    // фон, двери, предметы — каждое помещение до проёма в соседнее
    for (const { s, r } of rooms) {
      tagsDrawn = [];
      useSeg(s, swayX, swayY);
      const c = segClip(s);
      ctx.save();
      ctx.beginPath(); ctx.rect(sx(c.a), 0, c.b - c.a, VH); ctx.clip();
      ctx.drawImage(statics.get(r.id).canvas, sx(0), 0, r.width, VH);
      drawDecals(r);
      drawFx('back');
      drawProps(r);
      drawDoors(r);
      drawItems(r);
      drawLogs(r, 'body');
      ctx.restore();
    }
    // персонажи и противники — без обрезки: на пороге видны целиком
    for (const { s, r } of rooms) {
      useSeg(s, swayX, swayY);
      const enemies = AB.Enemies.inRoom(r.id);
      enemies.filter((e) => e.state === 'DEAD').forEach((e) => drawEnemy(e, 'body'));
      AB.Chars.all().filter((c) => c !== hero && c.room === r.id && !c.hidden).forEach((c) => withClimb(c, s, segs, 0.6, () => drawHero(c, 'body')));
      if (hero && hero.room === r.id) withClimb(hero, s, segs, 0.6, () => drawHero(hero, 'body'));
      enemies.filter((e) => e.state !== 'DEAD').forEach((e) => withClimb(e, s, segs, 0.8, () => drawEnemy(e, 'body')));
      if (hero && hero.room === r.id) { drawTargetHighlight(); }
    }
    // темнота: одна на всю локацию, свет каждого помещения — в его границах
    if (!AB.debugFullLight) {
      lightBegin();
      for (const { s, r } of rooms) {
        useSeg(s, 0, 0);
        const c = segClip(s);
        applyT(lctx, LK);
        lctx.save(); lctx.beginPath(); lctx.rect(sx(c.a), 0, c.b - c.a, VH); lctx.clip();
        lightHoles(r);
        lctx.restore();
      }
      lightEnd();
      for (const { s, r } of rooms) {
        useSeg(s, 0, 0);
        const c = segClip(s);
        ctx.save(); ctx.beginPath(); ctx.rect(sx(c.a), 0, c.b - c.a, VH); ctx.clip();
        lightGlow(r);
        ctx.restore();
      }
    }
    for (const { s, r } of rooms) {
      useSeg(s, swayX, swayY);
      drawEmissive(r);
      drawFx('glow');
    }
    VW = vw0;
    segT = null; drawRoom = null;
    const hs = hero && segs.find((q) => q.room === hero.room);
    cam.x = hs ? camW.x - hs.x0 : cam.x;
    drawPost();
    drawEdgeMarks(segs);
  }

  // кто за краем экрана: красные метки — противники, голубые — свои (откуда идут, куда бежать)
  function drawEdgeMarks(segs) {
    const W = cv.width, H = cv.height, pad = 14 * dpr;
    const list = [];
    for (const m of AB.Party.members()) if (!AB.Party.isLeader(m.id)) list.push({ c: m, ally: true });
    if (AB.Arena.active()) for (const s of segs) for (const e of AB.Enemies.inRoom(s.room)) if (e.state !== 'DEAD') list.push({ c: e, ally: false });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const { c, ally } of list) {
      const s = segs.find((q) => q.room === c.room);
      if (!s) continue;
      const T = segXform(s);
      const px = (c.x - T.camx) * T.S + T.ox, py = (FLOOR - 60) * T.S + T.oy;
      if (px > 0 && px < W && py > 0 && py < H) continue;
      const ex = U.clamp(px, pad, W - pad), ey = U.clamp(py, pad + 40 * dpr, H - pad);
      const ang = Math.atan2(py - ey, px - ex);
      ctx.save();
      ctx.translate(ex, ey); ctx.rotate(ang);
      ctx.fillStyle = ally ? 'rgba(94,230,255,.85)' : `rgba(255,70,50,${0.55 + Math.sin(time * 6) * 0.25})`;
      const k = dpr * (ally ? 1.1 : 0.9);
      ctx.beginPath(); ctx.moveTo(9 * k, 0); ctx.lineTo(-6 * k, -7 * k); ctx.lineTo(-6 * k, 7 * k); ctx.fill();
      ctx.restore();
    }
  }

  // ---------- Кадр ----------
  function frame(dt) {
    tagsDrawn = [];
    time += dt;
    const r = AB.Rooms.room();
    if (!r) return;
    if (AB.Arena.seamless()) {
      const swayY = Math.sin(time * 0.7) * 0.8 + (Math.random() - 0.5) * shake;
      const swayX = (Math.random() - 0.5) * shake;
      shake = Math.max(0, shake - dt * 30);
      hurtFlash = Math.max(0, hurtFlash - dt * 2.2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cv.width, cv.height);
      arenaFrame(dt, swayX, swayY);
      return;
    }
    arenaSnap = true;
    drawRoom = r.id;
    if (staticFor !== r.id) { staticLayer = buildStatic(r); staticFor = r.id; }

    // плавное следование камеры + лёгкое «дыхание» кадра
    cam.x = U.lerp(cam.x, camTarget(), 1 - Math.pow(0.0015, dt));
    const swayY = Math.sin(time * 0.7) * 0.8 + (Math.random() - 0.5) * shake;
    const swayX = (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 30);
    if (AB.Story.fx.shake > 0) shake = Math.max(shake, AB.Story.fx.shakePower);
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
    const hero = AB.Party.lead();
    if (hero && hero.inPod) drawHero(hero, 'body');   // за стеклом капсулы
    drawProps(r);
    drawDoors(r);
    drawItems(r);
    drawLogs(r, 'body');
    { const tf = trueFormHere(r); if (tf) drawTrueForm(tf, 'body'); }
    const enemies = AB.Enemies.inRoom(r.id);
    enemies.filter((e) => e.state === 'DEAD').forEach((e) => drawEnemy(e, 'body'));
    // остальные персонажи в этом помещении (спутница и др.)
    AB.Chars.all().filter((c) => c.id !== AB.Party.leader() && c.room === r.id && !c.hidden).forEach((c) => drawHero(c, 'body'));
    if (hero && !hero.inPod) drawHero(hero, 'body');   // ведущий — поверх остальных
    enemies.filter((e) => e.state !== 'DEAD').forEach((e) => drawEnemy(e, 'body'));
    if (!AB.debugFullLight) drawLighting(r);   // отладка: AB.debugFullLight = true — без темноты
    drawEmissive(r);
    drawFx('glow');
    drawForeground(r);
    drawPost();
  }

  // Составной персонаж (части тела по скелету или заглушка) в произвольной точке чужого холста —
  // для изометрической сцены (js/iso/). c — { id, appearance, facing, stride, equipped, hidden };
  // (px, py) — точка под ногами; k — масштаб. Рисует тем же кодом, что и вид сбоку.
  function drawFigure(target, c, px, py, k = 1) {
    const savedCtx = ctx, savedCam = cam.x;
    ctx = target;
    cam.x = c.x;                      // sx(c.x) = 0: фигура рисуется у начала координат
    ctx.save();
    ctx.translate(px, py); ctx.scale(k, k); ctx.translate(0, -FLOOR);
    try { drawHero(c, 'body'); } finally {
      ctx.restore();
      ctx = savedCtx; cam.x = savedCam;
    }
  }

  return {
    init, frame, snapCamera, drawFigure,
    tick(dt) { time += dt; },         // время анимаций (дыхание) — для сцен без frame()
    showCarry(id, item) { bubbles.set(id, { item, until: time + 2.5 }); },
    // экранная точка (CSS px) → персонаж под ней, если есть
    pick(cx, cy) {
      const r = cv.getBoundingClientRect();
      let wx = (cx - r.left) * dpr / scale + cam.x, wy = (cy - r.top) * dpr / scale - FLOOR;
      if (AB.Arena.seamless()) {
        const s = AB.Arena.segments().find((q) => q.room === AB.Rooms.current());
        if (!s) return null;
        const T = segXform(s);
        wx = ((cx - r.left) * dpr - T.ox) / T.S + T.camx; wy = ((cy - r.top) * dpr - T.oy) / T.S - FLOOR;
      }
      const list = [];
      const hero = AB.Party.lead();
      if (hero && !hero.hidden) list.push({ id: hero.id, x: hero.x, w: 22, h: 126 });
      for (const c of AB.Chars.all()) if (c.id !== hero.id && c.room === AB.Rooms.current()) list.push({ id: c.id, x: c.x, w: 22, h: 120 });
      for (const e of AB.Enemies.inRoom(AB.Rooms.current())) if (e.state !== 'DEAD') list.push({ id: e.id, x: e.x, w: 46, h: 90 });
      const hit = list.find((c) => Math.abs(wx - c.x) < c.w && wy < 4 && wy > -c.h);
      return hit ? hit.id : null;
    },
    // боевая локация: дверь под точкой экрана (CSS px) — для меню двери
    pickDoor(cx, cy) {
      if (!AB.Arena.active()) return null;
      const rc = cv.getBoundingClientRect();
      for (const s of AB.Arena.segments()) {
        const T = segXform(s);
        const x = ((cx - rc.left) * dpr - T.ox) / T.S + T.camx, y = ((cy - rc.top) * dpr - T.oy) / T.S - FLOOR;
        if (y > 6 || y < -200) continue;
        const d = AB.Arena.doors().find((q) => (q.room === s.room && Math.abs(q.x - x) < 56) || (q.other && q.other.room === s.room && Math.abs(q.other.x - x) < 56));
        if (d) return { door: d, room: s.room };
        const l = AB.Arena.ladders().find((q) => q.key === AB.Arena.jammed() && ((q.top.room === s.room && Math.abs(q.top.x - x) < 56) || (q.bottom.room === s.room && Math.abs(q.bottom.x - x) < 56)));
        if (l) return { door: l, room: s.room, ladder: true };
      }
      return null;
    },
    zoom: (dz) => (dz ? setZoom(ZOOM + dz) : ZOOM),
    // точка мира → экранные CSS-пиксели (для интерфейса и проверок)
    screenPos(x, y, room) {
      const s = AB.Arena.seamless() && AB.Arena.segments().find((q) => q.room === (room || AB.Rooms.current()));
      if (!s) return { x: (x - cam.x) * scale / dpr, y: (FLOOR + y) * scale / dpr, unit: scale / dpr };
      const T = segXform(s);
      return { x: ((x - T.camx) * T.S + T.ox) / dpr, y: ((FLOOR + y) * T.S + T.oy) / dpr, unit: T.S / dpr };
    },
    toggleIds() { showIds = !showIds; return showIds; },
    idsShown: () => showIds,
  };
})();
