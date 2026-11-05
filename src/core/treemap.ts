/**
 * Squarified treemaps: rectangles whose areas are proportional to values, kept as close
 * to square as possible, so they are easy to compare and label (Bruls, Huizing and van
 * Wijk, 2000).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Split `rect` into one rectangle per value, in the same order as `values`. Values
 * should be sorted largest first for the squarest result; zero or negative values get
 * empty rectangles.
 */
export function squarify(values: readonly number[], rect: Rect): Rect[] {
  const out: Rect[] = values.map(() => ({ x: rect.x, y: rect.y, w: 0, h: 0 }));
  const total = values.reduce((s, v) => s + Math.max(v, 0), 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return out;
  const scale = (rect.w * rect.h) / total;
  const items = values.map((v, i) => ({ i, a: Math.max(v, 0) * scale })).filter((it) => it.a > 0);

  let { x, y, w, h } = rect;
  // The worst aspect ratio of a row of areas laid along a side of length `side`.
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    const max = Math.max(...row);
    const min = Math.min(...row);
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };

  let start = 0;
  while (start < items.length) {
    const side = Math.min(w, h);
    let end = start + 1;
    while (end < items.length) {
      const row = items.slice(start, end).map((it) => it.a);
      if (worst([...row, items[end].a], side) > worst(row, side)) break;
      end++;
    }
    // Lay the row along the shorter side, then continue in what is left.
    const row = items.slice(start, end);
    const sum = row.reduce((s, it) => s + it.a, 0);
    const last = end === items.length;
    if (w >= h) {
      const rw = last ? w : sum / h;
      let yy = y;
      row.forEach((it, k) => {
        const rh = k === row.length - 1 ? y + h - yy : it.a / rw;
        out[it.i] = { x, y: yy, w: rw, h: rh };
        yy += rh;
      });
      x += rw;
      w -= rw;
    } else {
      const rh = last ? h : sum / w;
      let xx = x;
      row.forEach((it, k) => {
        const rw = k === row.length - 1 ? x + w - xx : it.a / rh;
        out[it.i] = { x: xx, y, w: rw, h: rh };
        xx += rw;
      });
      y += rh;
      h -= rh;
    }
    start = end;
  }
  return out;
}
