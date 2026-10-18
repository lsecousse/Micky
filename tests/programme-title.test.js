import { describe, it, expect } from 'vitest';
import { splitProgrammeTitle } from '../lib/programme-title.js';
import { escapeHtml } from '../lib/escape-html.js';

describe('splitProgrammeTitle', () => {
  it('returns the raw ampersand separator so the caller escapes it once', () => {
    const { sep } = splitProgrammeTitle('Pecs & Dos');

    expect(escapeHtml(sep)).toBe('&amp;');
  });

  it('splits on the first " / " separator', () => {
    expect(splitProgrammeTitle('Haut / Bas / Gainage')).toEqual({ line1: 'Haut', sep: '/', rest: 'Bas / Gainage' });
  });

  it('displays a dash separator as an em dash', () => {
    expect(splitProgrammeTitle('Jambes - Fessiers').sep).toBe('—');
  });

  it('keeps an unseparated title on one line', () => {
    expect(splitProgrammeTitle('  Full body  ')).toEqual({ line1: 'Full body', sep: null, rest: '' });
  });

  it('treats a missing title as empty', () => {
    expect(splitProgrammeTitle(null)).toEqual({ line1: '', sep: null, rest: '' });
  });
});
