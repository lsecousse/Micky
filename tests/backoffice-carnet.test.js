import { describe, it, expect } from 'vitest';
import { read, cssRules } from './source-helpers.js';

const CARNET_HEX = {
  paper: '#EEEDE8', sheet: '#F7F6F2', ink: '#1B1C1F', mut: '#6F6C64',
  rule: '#D6D3C9', hl: '#FFE45C', done: '#1E6B4A', alert: '#A8321F',
};
// Old back-office variable names, kept so the programme editor (lot C) follows the base.
const LEGACY_VARIABLES = {
  bg: 'paper', surface: 'sheet', text: 'ink', muted: 'mut', border: 'rule', danger: 'alert', accent: 'ink',
};
const DIRECTION_A = /#0A0A0A|#F5F4F0|#84CC16|#888888|#2A2A2A|#DC2626|#FACC15|#06B6D4|rgba\(132,\s*204,\s*22/i;
const BASE_SELECTORS = ['.btn-', '.bo-state--', '.bo-fab', '.login'];

const fontLink = (html) => html.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]+>/g) ?? [];
const rootRule = () => cssRules('backoffice.html', ':root');

describe('backofficeCarnetShould', () => {
  it('load exactly the Carnet font link of index.html', () => {
    expect(fontLink(read('backoffice.html'))).toEqual(fontLink(read('index.html')));
  });

  it('no longer reference Fraunces or DM Sans', () => {
    expect(read('backoffice.html')).not.toMatch(/Fraunces|DM Sans|DM\+Sans/);
  });

  it.each(Object.entries(CARNET_HEX))('define --%s with its exact Carnet hex', (name, hex) => {
    expect(rootRule()).toMatch(new RegExp(`--${name}:\\s*${hex};`, 'i'));
  });

  it.each(Object.entries(LEGACY_VARIABLES))('point the old --%s at a Carnet variable', (name, carnet) => {
    expect(rootRule()).toMatch(new RegExp(`--${name}:\\s*var\\(--${carnet}\\);`));
  });

  it.each(BASE_SELECTORS)('keep Direction A colours out of the %s rules', (selector) => {
    const rules = cssRules('backoffice.html', selector);

    expect(rules).not.toBe('');
    expect(rules).not.toMatch(DIRECTION_A);
  });
});
