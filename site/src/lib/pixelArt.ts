/**
 * Пиксельные спрайты из геометрии: отрезки, прямоугольники и круги растеризуются в сетку и собираются в SVG-путь.
 * Кадр = набор фигур в порядке рисования (дальнее — раньше, ближнее — позже).
 */

export type Shape =
  | { color: string; line: number[]; t?: number }
  | { color: string; rect: [x: number, y: number, w: number, h: number] }
  | { color: string; circle: [cx: number, cy: number, r: number] }
  /** Залитый круг: центр и радиус могут быть дробными, пиксель закрашен, если его центр внутри. */
  | { color: string; disc: [cx: number, cy: number, r: number] };

export interface Sprite {
  /** Размеры сетки одного кадра в пикселях. */
  w: number;
  h: number;
  frames: Shape[][];
}

export type Grid = (string | null)[][];

export function emptyGrid(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array<string | null>(w).fill(null));
}

/** Квадрат t×t с центром в точке (для чётной толщины — смещён вправо-вниз). */
function put(g: Grid, x: number, y: number, color: string, t = 1): void {
  const o = Math.floor((t - 1) / 2);
  for (let dy = 0; dy < t; dy += 1) {
    for (let dx = 0; dx < t; dx += 1) {
      const row = g[y + dy - o];
      const cx = x + dx - o;
      if (row && cx >= 0 && cx < row.length) row[cx] = color;
    }
  }
}

/** Алгоритм Брезенхема между двумя точками; `t` — толщина в пикселях. */
function drawLine(g: Grid, x0: number, y0: number, x1: number, y1: number, color: string, t: number): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(g, x, y, color, t);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** Окружность без заливки (колесо). */
function drawCircle(g: Grid, cx: number, cy: number, r: number, color: string): void {
  let x = r;
  let y = 0;
  let err = 1 - r;
  while (x >= y) {
    for (const [px, py] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]] as const) put(g, cx + px, cy + py, color);
    y += 1;
    if (err < 0) err += 2 * y + 1;
    else { x -= 1; err += 2 * (y - x) + 1; }
  }
}

function drawDisc(g: Grid, cx: number, cy: number, r: number, color: string): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(g, x, y, color);
    }
  }
}

export function rasterize(shapes: readonly Shape[], w: number, h: number): Grid {
  const g = emptyGrid(w, h);
  for (const s of shapes) {
    if ('line' in s) {
      if (s.line.length === 2) put(g, s.line[0]!, s.line[1]!, s.color, s.t ?? 1);
      for (let i = 0; i + 3 < s.line.length; i += 2) drawLine(g, s.line[i]!, s.line[i + 1]!, s.line[i + 2]!, s.line[i + 3]!, s.color, s.t ?? 1);
    } else if ('rect' in s) {
      const [x, y, rw, rh] = s.rect;
      for (let j = 0; j < rh; j += 1) for (let i = 0; i < rw; i += 1) put(g, x + i, y + j, s.color);
    } else if ('circle' in s) {
      drawCircle(g, s.circle[0], s.circle[1], s.circle[2], s.color);
    } else {
      drawDisc(g, s.disc[0], s.disc[1], s.disc[2], s.color);
    }
  }
  return g;
}

/** Все кадры спрайта в одну полосу слева направо: её сдвигают на ширину кадра, и картинка «оживает». */
export function rasterizeStrip(sprite: Sprite): Grid {
  const strip = emptyGrid(sprite.w * sprite.frames.length, sprite.h);
  sprite.frames.forEach((frame, i) => {
    rasterize(frame, sprite.w, sprite.h).forEach((row, y) => row.forEach((c, x) => { if (c) strip[y]![i * sprite.w + x] = c; }));
  });
  return strip;
}

/** Сдвиг фигур целиком: нужен, чтобы проверить, что поза не обрезается краем кадра. */
export function translate(shapes: readonly Shape[], dx: number, dy: number): Shape[] {
  return shapes.map((s): Shape => {
    if ('line' in s) return { ...s, line: s.line.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };
    if ('rect' in s) return { ...s, rect: [s.rect[0] + dx, s.rect[1] + dy, s.rect[2], s.rect[3]] };
    if ('circle' in s) return { ...s, circle: [s.circle[0] + dx, s.circle[1] + dy, s.circle[2]] };
    return { ...s, disc: [s.disc[0] + dx, s.disc[1] + dy, s.disc[2]] };
  });
}

export const filledCount = (g: Grid): number => g.reduce((n, row) => n + row.filter(Boolean).length, 0);

/** Путь SVG по цветам: горизонтальные отрезки одного цвета склеены в один прямоугольник. */
export function gridToPaths(g: Grid): { color: string; d: string }[] {
  const byColor = new Map<string, string[]>();
  g.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = row[x];
      if (!color) { x += 1; continue; }
      let end = x;
      while (end + 1 < row.length && row[end + 1] === color) end += 1;
      byColor.set(color, [...(byColor.get(color) ?? []), `M${x} ${y}h${end - x + 1}v1h-${end - x + 1}z`]);
      x = end + 1;
    }
  });
  return [...byColor].map(([color, parts]) => ({ color, d: parts.join('') }));
}

/** Текстовый вид кадра для отладки и тестов: буква цвета или точка. */
export function toAscii(g: Grid, legend: Record<string, string>): string {
  return g.map((row) => row.map((c) => (c ? (legend[c] ?? '#') : '.')).join('')).join('\n');
}
