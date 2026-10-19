// Source-reading helpers shared by the Carnet look tests.
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

export const read = (file) => readFileSync(new URL(file, root), 'utf8');

// Source of a top-level function, up to its closing brace at column 0.
export function functionSource(file, name) {
  const src = read(file);
  const start = src.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
  if (start === -1) throw new Error(`function ${name} not found in ${file}`);
  const end = src.indexOf('\n}', start);
  if (end === -1) throw new Error(`end of function ${name} not found in ${file}`);
  return src.slice(start, end + 2);
}

// Concatenation of the CSS rules whose selector contains selectorPart.
export function cssRules(file, selectorPart) {
  const src = read(file);
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1].includes(selectorPart)) rules.push(m[0].trim());
  }
  return rules.join('\n');
}
