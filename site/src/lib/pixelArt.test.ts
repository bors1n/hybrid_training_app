import { describe, expect, it } from 'vitest';
import { emptyGrid, filledCount, gridToPaths, rasterize, rasterizeStrip, toAscii, translate } from './pixelArt.ts';
import { CYCLIST, FRAMES, RUNNER, SKIER } from './sprites.ts';

describe('растеризация', () => {
  it('отрезок Брезенхема: диагональ и горизонталь', () => {
    const g = rasterize([{ color: 'x', line: [0, 0, 3, 3] }], 4, 4);
    expect(toAscii(g, { x: 'x' })).toBe('x...\n.x..\n..x.\n...x');
    expect(toAscii(rasterize([{ color: 'x', line: [0, 1, 3, 1] }], 4, 3), { x: 'x' })).toBe('....\nxxxx\n....');
  });

  it('толщина: 2 — блок вправо-вниз, 3 — по центру; за край сетки рисунок не выходит', () => {
    expect(toAscii(rasterize([{ color: 'x', line: [2, 2, 3, 2], t: 2 }], 4, 4), { x: 'x' })).toBe('....\n....\n..xx\n..xx');
    expect(toAscii(rasterize([{ color: 'x', line: [1, 1], t: 3 }], 4, 4), { x: 'x' })).toBe('xxx.\nxxx.\nxxx.\n....');
    expect(toAscii(rasterize([{ color: 'x', line: [0, 0], t: 3 }], 3, 3), { x: 'x' })).toBe('xx.\nxx.\n...');
  });

  it('прямоугольник, окружность и круг', () => {
    expect(toAscii(rasterize([{ color: 'x', rect: [1, 1, 2, 2] }], 4, 4), { x: 'x' })).toBe('....\n.xx.\n.xx.\n....');
    const ring = rasterize([{ color: 'x', circle: [3, 3, 2] }], 7, 7);
    expect(ring[3]![1]).toBe('x');
    expect(ring[3]![3]).toBeNull();
    // Круг 5×5 без углов — голова спортсмена.
    expect(toAscii(rasterize([{ color: 'x', disc: [2.5, 2.5, 2.7] }], 5, 5), { x: 'x' })).toBe('.xxx.\nxxxxx\nxxxxx\nxxxxx\n.xxx.');
  });

  it('пути: подряд идущие пиксели одного цвета склеены, цвета не смешиваются', () => {
    const g = emptyGrid(4, 1);
    g[0]![0] = 'a'; g[0]![1] = 'a'; g[0]![2] = 'b';
    expect(gridToPaths(g)).toEqual([
      { color: 'a', d: 'M0 0h2v1h-2z' },
      { color: 'b', d: 'M2 0h1v1h-1z' },
    ]);
  });

  it('лента кадров: кадры стоят рядом, слева направо', () => {
    const strip = rasterizeStrip({ w: 2, h: 1, frames: [[{ color: 'a', line: [0, 0] }], [{ color: 'b', line: [1, 0] }]] });
    expect(toAscii(strip, { a: 'a', b: 'b' })).toBe('a..b');
  });
});

describe('спортсмены', () => {
  const sprites = [['бегун', RUNNER], ['лыжник', SKIER], ['велосипедист', CYCLIST]] as const;

  it.each(sprites)('%s: %d кадров цикла, все разные', (_name, sprite) => {
    expect(sprite.frames).toHaveLength(FRAMES);
    const pictures = sprite.frames.map((f) => JSON.stringify(rasterize(f, sprite.w, sprite.h)));
    expect(new Set(pictures).size).toBe(FRAMES);
  });

  it.each(sprites)('%s: ни один кадр не обрезан краем', (_name, sprite) => {
    for (const frame of sprite.frames) {
      const inside = filledCount(rasterize(frame, sprite.w, sprite.h));
      const padded = filledCount(rasterize(translate(frame, 6, 6), sprite.w + 12, sprite.h + 12));
      expect(inside).toBe(padded);
    }
  });

  it.each(sprites)('%s: стоит на земле — в каждом кадре занята нижняя строка или строка над ней', (_name, sprite) => {
    for (const frame of sprite.frames) {
      const g = rasterize(frame, sprite.w, sprite.h);
      expect(g[sprite.h - 1]!.some(Boolean) || g[sprite.h - 2]!.some(Boolean)).toBe(true);
    }
  });

  it.each(sprites)('%s: смотрит вправо — голова в правой половине фигуры', (_name, sprite) => {
    const g = rasterize(sprite.frames[0]!, sprite.w, sprite.h);
    const cols = g.flatMap((row) => row.flatMap((c, x) => (c ? [x] : [])));
    const middle = (Math.min(...cols) + Math.max(...cols)) / 2;
    const top = g.findIndex((row) => row.some(Boolean));
    const headCols = g[top + 2]!.flatMap((c, x) => (c ? [x] : []));
    expect(Math.min(...headCols)).toBeGreaterThanOrEqual(middle - 4);
  });
});
