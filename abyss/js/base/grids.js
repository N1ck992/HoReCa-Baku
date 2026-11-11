// =====================================================================
// СТРОИТЕЛЬНЫЕ СЕТКИ (дополнение №71). Каждая сетка — отдельный модуль с одним
// и тем же набором функций, стройка и экономика обращаются к сетке только через
// них. Новая сетка (шестиугольная, модульная) — новая запись здесь, без
// переделки стройки: она описывает, какие клетки капсулы занимает фигура,
// где её стены и проходы и как нарисовать её контур.
//
// Мир капсулы (ходьба, пути, отрисовка) всегда на квадратных клетках:
// сетка переводит свои фигуры в эти клетки.
// =====================================================================

AB.BaseGrids = (() => {
  const list = new Map();
  function define(g) { list.set(g.id, g); AB.ID.register(g.id, { id: g.id, name: g.name, pending: true }); return g; }

  // ---------- GRID-001: квадратная сетка (доступна с начала) ----------
  define({
    id: 'GRID-001', name: 'Квадратная', start: true,
    // клетки фигуры
    cells(r) { const out = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]); return out; },
    // точка мира → привязка фигуры размера w×h (центр фигуры под пальцем)
    snap(p, w, h) { return { x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2) }; },
    overlap: (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
    // проход между двумя помещениями: ровно одна клетка стены между ними и общий отрезок стороны
    door(a, b) {
      const span = (a0, a1, b0, b1) => [Math.max(a0, b0), Math.min(a1, b1)];
      let line = null;
      if (a.x + a.w + 1 === b.x || b.x + b.w + 1 === a.x) {           // по горизонтали
        const [lo, hi] = span(a.y, a.y + a.h, b.y, b.y + b.h);
        if (hi > lo) line = { x: a.x + a.w + 1 === b.x ? a.x + a.w : b.x + b.w, lo, hi, vert: true };
      } else if (a.y + a.h + 1 === b.y || b.y + b.h + 1 === a.y) {    // по вертикали
        const [lo, hi] = span(a.x, a.x + a.w, b.x, b.x + b.w);
        if (hi > lo) line = { y: a.y + a.h + 1 === b.y ? a.y + a.h : b.y + b.h, lo, hi, vert: false };
      }
      if (!line) return null;
      const L = line.hi - line.lo, n = L >= 3 ? 2 : 1, s = line.lo + Math.floor((L - n) / 2), cells = [];
      for (let i = 0; i < n; i++) cells.push(line.vert ? [line.x, s + i] : [s + i, line.y]);
      return cells;
    },
    // между фигурами должна остаться хотя бы клетка стены
    apart(a, b) { return !(a.x - 1 < b.x + b.w && b.x < a.x + a.w + 1 && a.y - 1 < b.y + b.h && b.y < a.y + a.h + 1); },
    // контур фигуры (углы в координатах мира) — для подсветки при стройке
    outline: (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]],
  });

  return { define, get: (id) => list.get(id), all: () => [...list.values()] };
})();
