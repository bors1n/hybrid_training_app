import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTokensCss, type Tokens } from './tokens-css.ts';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, 'tokens.json'), 'utf8')) as Tokens;
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'tokens.css'), buildTokensCss(tokens));
console.log('design/dist/tokens.css готов');
