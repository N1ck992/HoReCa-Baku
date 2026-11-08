// =====================================================================
// ISO WORLD (этап 1 изометрии, дополнение №45). Невидимая техническая сетка
// сцены: где пол, где стена, где препятствие; поиск пути (A*) и столкновения.
// Координаты мира — в клетках (дробные): x — на юго-восток, y — на юго-запад.
// На экран клетки не выводятся — сетка нужна только для расчётов.
// =====================================================================

AB.IsoWorld = (() => {
  const FLOOR = 1, WALL = 2, PROP = 3, DOOR = 4;   // DOOR — закрытая дверь на месте пола
  let W = 0, H = 0, cells = null, roomOf = null, layout = null;
  let props = [];

  const idx = (x, y) => y * W + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const cell = (x, y) => (inside(x, y) ? cells[idx(x, y)] : 0);
  const walkable = (x, y) => cell(x, y) === FLOOR;

  function build(sectorId) {
    layout = AB.ISO_LAYOUTS[sectorId];
    W = 0; H = 0;
    for (const a of layout.areas) { W = Math.max(W, a.x + a.w + 2); H = Math.max(H, a.y + a.h + 2); }
    cells = new Uint8Array(W * H);
    roomOf = new Array(W * H).fill(null);
    for (const a of layout.areas) {
      for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) { cells[idx(x, y)] = FLOOR; roomOf[idx(x, y)] = a.room; }
    }
    // стены — по краю пола (всё, что не пол, но касается пола)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (cells[idx(x, y)]) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (cell(x + dx, y + dy) === FLOOR) { edge = true; break; }
      if (edge) cells[idx(x, y)] = WALL;
    }
    props = layout.props.map((p, i) => ({ ...p, n: i }));
    for (const p of props) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (cell(x, y) === FLOOR) cells[idx(x, y)] = PROP;
    AB.Bus.emit('iso:world', { sectorId, w: W, h: H });
    return layout;
  }

  // свободна ли точка для персонажа радиуса r
  function free(x, y, r = 0.28) {
    return walkable(Math.floor(x - r), Math.floor(y - r)) && walkable(Math.floor(x + r), Math.floor(y - r)) &&
      walkable(Math.floor(x - r), Math.floor(y + r)) && walkable(Math.floor(x + r), Math.floor(y + r));
  }

  // движение со скольжением вдоль препятствий
  function move(p, dx, dy, r = 0.28) {
    if (free(p.x + dx, p.y + dy, r)) { p.x += dx; p.y += dy; return true; }
    let moved = false;
    if (dx && free(p.x + dx, p.y, r)) { p.x += dx; moved = true; }
    if (dy && free(p.x, p.y + dy, r)) { p.y += dy; moved = true; }
    return moved;
  }

  // ближайшая проходимая клетка к точке (если нажали на стену или ящик)
  function nearestFree(x, y, max = 6) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (walkable(cx, cy)) return { x: cx, y: cy };
    for (let r = 1; r <= max; r++) {
      let best = null, bd = 1e9;
      for (let yy = cy - r; yy <= cy + r; yy++) for (let xx = cx - r; xx <= cx + r; xx++) {
        if (Math.max(Math.abs(xx - cx), Math.abs(yy - cy)) !== r || !walkable(xx, yy)) continue;
        const d = (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2;
        if (d < bd) { bd = d; best = { x: xx, y: yy }; }
      }
      if (best) return best;
    }
    return null;
  }

  // прямая видимость для сглаживания пути: отрезок не задевает непроходимое (с запасом r)
  function clear(ax, ay, bx, by, r = 0.3) {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / 0.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!free(ax + (bx - ax) * t, ay + (by - ay) * t, r)) return false;
    }
    return true;
  }

  // A* по 8 направлениям (без срезания углов) → список точек (центры клеток), сглаженный
  function path(fx, fy, tx, ty) {
    const s = nearestFree(fx, fy, 2), g = nearestFree(tx, ty);
    if (!s || !g) return null;
    const start = idx(s.x, s.y), goal = idx(g.x, g.y);
    const gs = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1);
    const closed = new Uint8Array(W * H);
    const open = [start];                 // двоичная куча по f
    const f = new Float32Array(W * H).fill(Infinity);
    const h = (i) => { const x = i % W, y = (i / W) | 0, dx = Math.abs(x - g.x), dy = Math.abs(y - g.y); return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    gs[start] = 0; f[start] = h(start);
    const push = (i) => { open.push(i); let c = open.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (f[open[p]] <= f[open[c]]) break; [open[p], open[c]] = [open[c], open[p]]; c = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < open.length && f[open[l]] < f[open[m]]) m = l; if (r < open.length && f[open[r]] < f[open[m]]) m = r; if (m === c) break; [open[m], open[c]] = [open[c], open[m]]; c = m; } } return top; };
    let found = start === goal, guard = 0;
    while (open.length && !found && guard++ < W * H * 2) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) { found = true; break; }
      const cx = cur % W, cy = (cur / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!walkable(nx, ny)) continue;
        if (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;   // угол не срезать
        const ni = idx(nx, ny), ng = gs[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < gs[ni]) { gs[ni] = ng; f[ni] = ng + h(ni); from[ni] = cur; push(ni); }
      }
    }
    if (!found) return null;
    const pts = [];
    for (let i = goal; i !== -1; i = from[i]) pts.push({ x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 });
    pts.reverse();
    // точная конечная точка, если туда можно встать
    if (Math.floor(tx) === g.x && Math.floor(ty) === g.y && free(tx, ty)) pts[pts.length - 1] = { x: tx, y: ty };
    // сглаживание: пропускаем точки, до которых видно напрямую
    const out = [];
    let a = { x: fx, y: fy }, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !clear(a.x, a.y, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]); a = pts[j]; i = j + 1;
    }
    return out;
  }

  return {
    FLOOR, WALL, PROP, DOOR, build,
    // дверь закрылась/открылась: клетки створки становятся непроходимыми или снова полом
    setDoor(tiles, closed) { for (const [x, y] of tiles) if (inside(x, y) && (cells[idx(x, y)] === FLOOR || cells[idx(x, y)] === DOOR)) cells[idx(x, y)] = closed ? DOOR : FLOOR; }, free, move, path, nearestFree, clear, walkable,
    cell, room: (x, y) => (inside(Math.floor(x), Math.floor(y)) ? roomOf[idx(Math.floor(x), Math.floor(y))] : null),
    size: () => ({ w: W, h: H }), props: () => props, layout: () => layout,
  };
})();
