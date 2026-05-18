import { describe, it, expect } from 'vitest';
import { normalizeExerciseName } from '../lib/exercise-name.js';

describe('normalizeExerciseName', () => {
  it('lowercases', () => {
    expect(normalizeExerciseName('Développé Couché')).toBe('developpe couche');
  });

  it('strips accents', () => {
    expect(normalizeExerciseName('Élévations Latérales')).toBe('elevations laterales');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeExerciseName('  Squat  ')).toBe('squat');
  });

  it('collapses inner whitespace', () => {
    expect(normalizeExerciseName('Tirage   horizontal\tassis')).toBe('tirage horizontal assis');
  });

  it('handles apostrophes and dashes as-is', () => {
    expect(normalizeExerciseName("Curl biceps haltère")).toBe('curl biceps haltere');
    expect(normalizeExerciseName('Tirage poulie-haute')).toBe('tirage poulie-haute');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeExerciseName(null)).toBe('');
    expect(normalizeExerciseName(undefined)).toBe('');
    expect(normalizeExerciseName('')).toBe('');
  });

  it('is idempotent', () => {
    const once  = normalizeExerciseName('Développé Couché');
    const twice = normalizeExerciseName(once);
    expect(twice).toBe(once);
  });
});
