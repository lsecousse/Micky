import { describe, it, expect } from 'vitest';
import { buildProgrammeExerciseFromCatalog, ensureSeries } from '../lib/programme-from-catalog.js';

describe('buildProgrammeExerciseFromCatalog', () => {
  const catalogEntry = {
    name: 'Curl barre',
    normalized_name: 'curl barre',
    category: 'fonte',
    default_activities: [{ type: 'weight' }],
    notes: 'Coude collé au corps',
  };

  it('returns 4 blank series when no client prev', () => {
    const result = buildProgrammeExerciseFromCatalog(catalogEntry, null);
    expect(result.name).toBe('Curl barre');
    expect(result.normalized_name).toBe('curl barre');
    expect(result.comment).toBe('Coude collé au corps');
    expect(result.activities).toEqual([{ type: 'weight' }]);
    expect(result.sets).toBe(4);
    expect(result.series).toHaveLength(4);
    expect(result.series[0]).toEqual({
      activityStates: {},
      values: [{ reps: 0, weight: 0 }],
    });
  });

  it('fills series values from client prev execution', () => {
    const clientPrev = {
      execution: {
        series: [
          { values: [{ reps: 12, weight: 25 }] },
          { values: [{ reps: 12, weight: 25 }] },
          { values: [{ reps: 10, weight: 27.5 }] },
        ],
      },
    };
    const result = buildProgrammeExerciseFromCatalog(catalogEntry, clientPrev);
    expect(result.series).toHaveLength(4);
    expect(result.series[0].values[0]).toEqual({ reps: 12, weight: 25 });
    expect(result.series[1].values[0]).toEqual({ reps: 12, weight: 25 });
    expect(result.series[2].values[0]).toEqual({ reps: 10, weight: 27.5 });
    expect(result.series[3].values[0]).toEqual({ reps: 0, weight: 0 });
  });

  it('handles countdown default activity', () => {
    const cdCatalog = {
      ...catalogEntry,
      name: 'Plank',
      normalized_name: 'plank',
      default_activities: [{ type: 'countdown', duration: 60 }],
      notes: '',
    };
    const result = buildProgrammeExerciseFromCatalog(cdCatalog, null);
    expect(result.activities).toEqual([{ type: 'countdown', duration: 60 }]);
    expect(result.series[0].values[0]).toEqual({ duration: 60 });
  });

  it('falls back to default activities when entry has none', () => {
    const emptyCatalog = {
      name: 'X',
      normalized_name: 'x',
      category: 'fonte',
      default_activities: null,
    };
    const result = buildProgrammeExerciseFromCatalog(emptyCatalog, null);
    expect(result.activities).toEqual([{ type: 'weight' }]);
    expect(result.series[0].values[0]).toEqual({ reps: 0, weight: 0 });
  });

  it('handles multi-activity catalog default', () => {
    const multiCatalog = {
      ...catalogEntry,
      default_activities: [{ type: 'weight' }, { type: 'countdown', duration: 30 }],
    };
    const result = buildProgrammeExerciseFromCatalog(multiCatalog, null);
    expect(result.series[0].values).toEqual([
      { reps: 0, weight: 0 },
      { duration: 30 },
    ]);
  });
});

describe('ensureSeries', () => {
  it('passes through when series already present', () => {
    const ex = {
      name: 'X',
      sets: 4,
      activities: [{ type: 'weight', reps: 10, weight: 20 }],
      series: [{ activityStates: {}, values: [{ reps: 8, weight: 15 }] }],
    };
    const result = ensureSeries(ex);
    expect(result.series).toBe(ex.series);
  });

  it('builds series from activity-level reps/weight when series missing (legacy)', () => {
    const legacy = {
      name: 'Climb box',
      sets: 4,
      activities: [{ type: 'weight', reps: 8, weight: 18, rest: 150 }],
    };
    const result = ensureSeries(legacy);
    expect(result.series).toHaveLength(4);
    expect(result.series[0]).toEqual({
      activityStates: {},
      values: [{ reps: 8, weight: 18 }],
    });
    expect(result.series[3].values[0]).toEqual({ reps: 8, weight: 18 });
  });

  it('builds series for countdown activities using duration default', () => {
    const legacy = {
      name: 'Plank',
      sets: 3,
      activities: [{ type: 'countdown', duration: 45 }],
    };
    const result = ensureSeries(legacy);
    expect(result.series).toHaveLength(3);
    expect(result.series[0].values).toEqual([{ duration: 45 }]);
  });

  it('defaults sets to 4 when missing', () => {
    const legacy = { name: 'X', activities: [{ type: 'weight' }] };
    const result = ensureSeries(legacy);
    expect(result.series).toHaveLength(4);
    expect(result.series[0].values).toEqual([{ reps: 0, weight: 0 }]);
  });

  it('handles series=[] as missing', () => {
    const ex = { name: 'X', sets: 2, activities: [{ type: 'weight', reps: 5, weight: 10 }], series: [] };
    const result = ensureSeries(ex);
    expect(result.series).toHaveLength(2);
    expect(result.series[0].values[0]).toEqual({ reps: 5, weight: 10 });
  });
});
