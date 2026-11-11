// =====================================================================
// СТРОИТЕЛЬНЫЕ СЕТКИ (дополнение №71, расширено в №74). Каждая сетка — отдельный
// модуль с одним набором функций; стройка и экономика обращаются к сетке только
// через них, поэтому новая сетка — новая запись здесь, без переделки стройки.
//
// Мир капсулы (ходьба, пути, отрисовка) всегда на квадратных клетках: сетка
// переводит свою фигуру (помещение) в набор этих клеток. Общие правила для всех
// сеток — проход между помещениями и зазор-стена — считаются по клеткам фигур.
//
//   shape(r)        — клетки фигуры с рамкой r = { x, y, w, h }
//   snap(p, w, h)   — привязка рамки к точке под пальцем
//   sizeOk(b, w, h) — подходит ли размер для чертежа (null или причина)
//   step            — шаг изменения размера
//   costK / workK   — множители цены и работы строителей на клетку
//   touch           — помещения этой сетки могут стоять вплотную, без стены (открытая планировка)
// =====================================================================

AB.BaseGrids = (() => {
  const list = new Map();
  function define(g) { list.set(g.id, g); AB.ID.register(g.id, { id: g.id, name: g.name, pending: true }); return g; }
  const get = (id) => list.get(id || 'GRID-001');
  const rectCells = (r) => { const out = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]); return out; };
  const sizeByBp = (b, w, h) => {
    const s = Math.min(w, h), l = Math.max(w, h);
    if (s < b.size.short[0] || s > b.size.short[1] || l < b.size.long[0] || l > b.size.long[1]) return `Размер: от ${b.size.short[0]}×${b.size.long[0]} до ${b.size.short[1]}×${b.size.long[1]}`;
    return null;
  };

  // ---------- GRID-001: квадратная (с начала) ----------
  define({
    id: 'GRID-001', name: 'Квадратная', short: 'квадрат', start: true, step: 1, costK: 1, workK: 1, touch: false,
    desc: 'Прямоугольные помещения любого размера; между помещениями — клетка стены с проходом.',
    shape: rectCells,
    snap: (p, w, h) => ({ x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2) }),
    sizeOk: sizeByBp,
  });
  // ---------- GRID-002: шестигранная (исследование) ----------
  // многогранник, вписанный в рамку: верхние и нижние ряды срезаны; меньше углов — дешевле стены
  define({
    id: 'GRID-002', name: 'Шестигранная', short: 'шестигранник', step: 1, costK: 0.8, workK: 0.9, touch: false,
    desc: 'Помещения-многогранники со срезанными углами: на 20% дешевле на клетку, обходят соседей углами.',
    shape(r) {
      const out = [], q = Math.floor(r.h / 4);
      for (let row = 0; row < r.h; row++) {
        const inset = Math.max(0, Math.ceil(Math.abs(row - (r.h - 1) / 2)) - q);
        for (let x = r.x + inset; x < r.x + r.w - inset; x++) out.push([x, r.y + row]);
      }
      return out;
    },
    snap: (p, w, h) => ({ x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2) }),
    sizeOk(b, w, h) { if (Math.min(w, h) < 4) return 'Шестигранник — от 4×4'; if (Math.max(w, h) > 9) return 'Шестигранник — до 9×9'; return null; },
  });
  // ---------- GRID-003: модульная (исследование) ----------
  // блоки 3×3 по сетке модулей; соседние модульные отсеки стыкуются вплотную — общий пол без стены
  define({
    id: 'GRID-003', name: 'Модульная', short: 'модули 3×3', step: 3, costK: 1, workK: 0.6, touch: true,
    desc: 'Сборные блоки 3×3: строятся быстрее и стыкуются вплотную без стен — открытая планировка без потерь на стены.',
    shape: rectCells,
    snap: (p, w, h) => ({ x: 1 + 3 * Math.round((p.x - w / 2 - 1) / 3), y: 1 + 3 * Math.round((p.y - h / 2 - 1) / 3) }),
    sizeOk(b, w, h) { if (w % 3 || h % 3 || w < 3 || h < 3 || w > 9 || h > 9) return 'Модульный отсек — 3, 6 или 9 клеток по каждой стороне'; return null; },
  });

  // ---------- общие правила по клеткам фигур ----------
  const K = (x, y) => y * 4096 + x;
  const cellsOf = (o) => (o.grid ? get(o.grid).shape(o) : rectCells(o));
  const setOf = (o) => new Set(cellsOf(o).map(([x, y]) => K(x, y)));
  const touchable = (a, b) => !!(a.grid && b.grid && get(a.grid).touch && get(b.grid).touch);
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // проход между помещениями: клетки стены, по обе стороны которых (по прямой) пол a и пол b.
  // [] — помещения стоят вплотную (модульные): общий пол, отдельный проход не нужен; null — не соседи
  function door(a, b) {
    const A = setOf(a), B = setOf(b);
    if (touchable(a, b)) for (const k of A) { const x = k % 4096, y = (k / 4096) | 0; for (const [dx, dy] of D4) if (B.has(K(x + dx, y + dy))) return []; }
    const cand = new Map();
    for (const k of A) {
      const x = k % 4096, y = (k / 4096) | 0;
      for (const [dx, dy] of D4) {
        const wx = x + dx, wy = y + dy;
        if (A.has(K(wx, wy)) || B.has(K(wx, wy)) || !B.has(K(wx + dx, wy + dy))) continue;
        cand.set(K(wx, wy), { x: wx, y: wy, vert: !!dx });
      }
    }
    if (!cand.size) return null;
    // самый длинный ряд подряд — посередине 1–2 клетки
    const runs = [];
    const sorted = [...cand.values()].sort((p, q) => (p.vert - q.vert) || (p.vert ? p.x - q.x || p.y - q.y : p.y - q.y || p.x - q.x));
    for (const c of sorted) {
      const r = runs[runs.length - 1], l = r && r[r.length - 1];
      if (l && l.vert === c.vert && (c.vert ? l.x === c.x && c.y === l.y + 1 : l.y === c.y && c.x === l.x + 1)) r.push(c); else runs.push([c]);
    }
    const run = runs.sort((p, q) => q.length - p.length)[0], n = run.length >= 3 ? 2 : 1, s = Math.floor((run.length - n) / 2);
    return run.slice(s, s + n).map((c) => [c.x, c.y]);
  }
  // между помещениями должна остаться клетка стены (кроме модульных, которые стыкуются вплотную)
  function apart(a, b) {
    const A = cellsOf(a), B = setOf(b);
    if (touchable(a, b)) return !A.some(([x, y]) => B.has(K(x, y)));
    for (const [x, y] of A) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (B.has(K(x + dx, y + dy))) return false;
    return true;
  }
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  return { define, get, all: () => [...list.values()], cellsOf, door, apart, overlap, rectCells, touchable };
})();
