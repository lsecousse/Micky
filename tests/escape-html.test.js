import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../lib/escape-html.js';

describe('escapeHtmlShould', () => {
  it('renderImgPayloadAsInertText', () => {
    // Arrange
    const name = '<img src=x onerror=alert(1)>';

    // Act
    const result = escapeHtml(name);

    // Assert
    expect(result).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapeAmpersandFirstSoEntitiesAreNotDoubleDecoded', () => {
    expect(escapeHtml('Pecs & Bras &lt;')).toBe('Pecs &amp; Bras &amp;lt;');
  });

  it('escapeQuotesSoValuesAreSafeInAttributes', () => {
    expect(escapeHtml(`"x" onmouseover='y'`)).toBe('&quot;x&quot; onmouseover=&#39;y&#39;');
  });

  it('returnEmptyStringForNullOrUndefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('stringifyNumbers', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
