import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTokensCss, type Tokens } from './tokens-css.ts';

const tokens = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8')) as Tokens;
const css = buildTokensCss(tokens);

describe('buildTokensCss', () => {
  it('раскрывает алиасы: strength = cobalt в обеих темах', () => {
    expect(css).toContain('--strength: #1D46E8;');
    expect(css).toContain('--strength: #7C9BFF;');
  });
  it('цвета типов тренировок на месте', () => {
    expect(css).toContain('--cardio: #3091D8;');
    expect(css).toContain('--conditioning: #E2591A;');
    expect(css).toContain('--mobility: #7D8796;');
    expect(css).toContain('--bodyweight: #7A4FD6;');
    expect(css).toContain('--core: #148F7E;');
  });
  it('радиусы, отступы и шрифты', () => {
    expect(css).toContain('--radius-pill: 999px;');
    expect(css).toContain('--space-4: 16px;');
    expect(css).toContain('--font-display:');
  });
  it('тёмная тема и по системной настройке, и по атрибуту', () => {
    expect(css).toContain('prefers-color-scheme: dark');
    expect(css).toContain(":root[data-theme='dark']");
  });
});
