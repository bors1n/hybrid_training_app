export interface ColorToken {
  name: string;
  value: Record<string, string>;
}
export interface Tokens {
  color: { themes: { id: string }[]; tokens: ColorToken[] };
  type: { families: Record<string, string> };
  spacing: { tokens: { name: string; value: string }[] };
  radius: { tokens: { name: string; value: string }[] };
  shadow: { tokens: { name: string; value: Record<string, string> | string }[] };
  rotate: { tokens: { name: string; value: string }[] };
}

const ALIAS = /^\{([A-Za-z0-9_.-]+)\}$/;

function resolve(token: ColorToken, theme: string, byName: Map<string, ColorToken>, first: string, depth = 0): string {
  const raw = token.value[theme] ?? token.value[first];
  if (raw === undefined) throw new Error(`Нет значения у токена ${token.name}`);
  const m = ALIAS.exec(raw);
  if (!m) return raw;
  if (depth > 8) throw new Error(`Цикл алиасов у токена ${token.name}`);
  const target = byName.get(m[1]!);
  if (!target) throw new Error(`Алиас ${raw} в токене ${token.name} указывает на несуществующий токен`);
  return resolve(target, theme, byName, first, depth + 1);
}

function colorBlock(tokens: Tokens, theme: string): string {
  const byName = new Map(tokens.color.tokens.map((t) => [t.name, t]));
  const first = tokens.color.themes[0]!.id;
  return tokens.color.tokens.map((t) => `  --${t.name}: ${resolve(t, theme, byName, first)};`).join('\n');
}

/** CSS-переменные: светлая тема по умолчанию, тёмная по системной настройке и по [data-theme]. */
export function buildTokensCss(tokens: Tokens): string {
  const [light, dark] = [tokens.color.themes[0]!.id, tokens.color.themes[1]!.id];
  const fonts = Object.entries(tokens.type.families).map(([k, v]) => `  --font-${k}: ${v};`).join('\n');
  const space = tokens.spacing.tokens.map((t) => `  --${t.name}: ${t.value};`).join('\n');
  const radius = tokens.radius.tokens.map((t) => `  --${t.name}: ${t.value};`).join('\n');
  const rotate = tokens.rotate.tokens.map((t) => `  --${t.name}: ${t.value};`).join('\n');
  const shadow = (theme: string) =>
    tokens.shadow.tokens
      .map((t) => `  --${t.name}: ${typeof t.value === 'string' ? t.value : (t.value[theme] ?? t.value[light]!)};`)
      .join('\n');

  return `/* Сгенерировано из design/tokens.json — не править вручную. */
:root {
  color-scheme: light;
${colorBlock(tokens, light)}
${shadow(light)}
${fonts}
${space}
${radius}
${rotate}
}

:root[data-theme='light'] { color-scheme: light; }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${colorBlock(tokens, dark)}
${shadow(dark)}
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
${colorBlock(tokens, dark)}
${shadow(dark)}
}
`;
}
