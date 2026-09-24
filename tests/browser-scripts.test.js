import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Classic <script> tags share one global scope: a top-level const declared
// twice across lib files makes the browser reject the second script.
function libScriptsOf(page) {
  const html = readFileSync(page, 'utf8');
  return [...html.matchAll(/<script src="(lib\/[^"]+)"><\/script>/g)].map(m => m[1]);
}

function loadInSharedScope(scripts) {
  const context = vm.createContext({});
  context.window = context;
  scripts.forEach(src => vm.runInContext(readFileSync(src, 'utf8'), context, { filename: src }));
  return context;
}

describe('browser lib scripts', () => {
  it('load together in backoffice.html shared global scope', () => {
    const context = loadInSharedScope(libScriptsOf('backoffice.html'));

    expect(typeof context.buildProgrammeExerciseFromCatalog).toBe('function');
    expect(typeof context.escapeHtml).toBe('function');
  });

  it('load together in index.html shared global scope', () => {
    const context = loadInSharedScope(libScriptsOf('index.html'));

    expect(typeof context.plannedSeries).toBe('function');
    expect(typeof context.escapeHtml).toBe('function');
  });
});
