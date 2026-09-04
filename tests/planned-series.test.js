import { describe, it, expect } from 'vitest';
import {
  plannedSeries, resizeValues, seriesFromColumns, blankValueFor,
} from '../lib/planned-series.js';

describe('blankValueFor', () => {
  it('returns zero reps and weight for weight', () => {
    expect(blankValueFor({ type: 'weight' })).toEqual({ reps: 0, weight: 0 });
  });

  it('returns zero duration for countdown', () => {
    expect(blankValueFor({ type: 'countdown' })).toEqual({ duration: 0 });
  });

  it('returns an empty object for stopwatch', () => {
    expect(blankValueFor({ type: 'stopwatch' })).toEqual({});
  });
});

describe('resizeValues', () => {
  it('grows by copying the last value', () => {
    const out = resizeValues([{ reps: 10, weight: 40 }, { reps: 8, weight: 40 }], 4, { reps: 0, weight: 0 });
    expect(out).toEqual([
      { reps: 10, weight: 40 }, { reps: 8, weight: 40 }, { reps: 8, weight: 40 }, { reps: 8, weight: 40 },
    ]);
  });

  it('copies objects instead of sharing references', () => {
    const src = [{ reps: 8, weight: 40 }];
    const out = resizeValues(src, 2, { reps: 0, weight: 0 });
    expect(out[0]).not.toBe(src[0]);
    expect(out[1]).not.toBe(out[0]);
  });

  it('truncates to n', () => {
    const out = resizeValues([{ duration: 30 }, { duration: 45 }, { duration: 60 }], 2, { duration: 0 });
    expect(out).toEqual([{ duration: 30 }, { duration: 45 }]);
  });

  it('starts from blank when empty', () => {
    expect(resizeValues([], 2, { duration: 0 })).toEqual([{ duration: 0 }, { duration: 0 }]);
  });
});

describe('seriesFromColumns', () => {
  it('transposes per-activity columns into series', () => {
    const columns = [
      [{ reps: 10, weight: 40 }, { reps: 8, weight: 40 }],
      [{ duration: 30 }, { duration: 45 }],
    ];
    expect(seriesFromColumns(columns, 2)).toEqual([
      { activityStates: {}, values: [{ reps: 10, weight: 40 }, { duration: 30 }] },
      { activityStates: {}, values: [{ reps: 8, weight: 40 },  { duration: 45 }] },
    ]);
  });
});

describe('plannedSeries', () => {
  it('uses series values when present, not activity-level values', () => {
    const ex = {
      sets: 2,
      activities: [{ type: 'weight', reps: 10, weight: 20 }],
      series: [
        { values: [{ reps: 8, weight: 15 }] },
        { values: [{ reps: 6, weight: 15 }] },
      ],
    };
    expect(plannedSeries(ex)).toEqual([
      { activityStates: {}, values: [{ reps: 8, weight: 15 }] },
      { activityStates: {}, values: [{ reps: 6, weight: 15 }] },
    ]);
  });

  it('builds series from activity-level reps/weight when series missing (legacy)', () => {
    const legacy = { sets: 4, activities: [{ type: 'weight', reps: 8, weight: 18, rest: 150 }] };
    const result = plannedSeries(legacy);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ activityStates: {}, values: [{ reps: 8, weight: 18 }] });
    expect(result[3].values[0]).toEqual({ reps: 8, weight: 18 });
  });

  it('builds countdown series from activity duration (legacy)', () => {
    const legacy = { sets: 3, activities: [{ type: 'countdown', duration: 45 }] };
    expect(plannedSeries(legacy)[0].values).toEqual([{ duration: 45 }]);
  });

  it('defaults to 4 sets when neither sets nor series', () => {
    const result = plannedSeries({ activities: [{ type: 'weight' }] });
    expect(result).toHaveLength(4);
    expect(result[0].values).toEqual([{ reps: 0, weight: 0 }]);
  });

  it('treats series=[] as missing', () => {
    const ex = { sets: 2, activities: [{ type: 'weight', reps: 5, weight: 10 }], series: [] };
    const result = plannedSeries(ex);
    expect(result).toHaveLength(2);
    expect(result[0].values[0]).toEqual({ reps: 5, weight: 10 });
  });

  it('uses series length when sets is missing', () => {
    const ex = {
      activities: [{ type: 'weight' }],
      series: [{ values: [{ reps: 10, weight: 40 }] }, { values: [{ reps: 8, weight: 40 }] }],
    };
    expect(plannedSeries(ex)).toHaveLength(2);
  });

  it('pads to sets by copying the last series', () => {
    const ex = {
      sets: 4,
      activities: [{ type: 'weight' }],
      series: [{ values: [{ reps: 10, weight: 40 }] }, { values: [{ reps: 8, weight: 45 }] }],
    };
    const result = plannedSeries(ex);
    expect(result.map(s => s.values[0])).toEqual([
      { reps: 10, weight: 40 }, { reps: 8, weight: 45 }, { reps: 8, weight: 45 }, { reps: 8, weight: 45 },
    ]);
  });

  it('truncates to sets', () => {
    const ex = {
      sets: 1,
      activities: [{ type: 'weight' }],
      series: [{ values: [{ reps: 10, weight: 40 }] }, { values: [{ reps: 8, weight: 45 }] }],
    };
    expect(plannedSeries(ex)).toHaveLength(1);
  });

  it('fills missing value keys from the activity fallback', () => {
    const ex = {
      sets: 1,
      activities: [{ type: 'weight', weight: 30 }],
      series: [{ values: [{ reps: 10 }] }],
    };
    expect(plannedSeries(ex)[0].values[0]).toEqual({ reps: 10, weight: 30 });
  });

  it('drops executed-state keys and non-planned value keys', () => {
    const ex = {
      sets: 1,
      activities: [{ type: 'weight' }],
      series: [{ done: true, state: 'done', activityStates: { 0: 'done' }, values: [{ reps: 10, weight: 40, extra: 1 }] }],
    };
    expect(plannedSeries(ex)[0]).toEqual({ activityStates: {}, values: [{ reps: 10, weight: 40 }] });
  });

  it('does not mutate the input exercise', () => {
    const ex = { sets: 2, activities: [{ type: 'weight' }], series: [{ values: [{ reps: 10, weight: 40 }] }] };
    const snapshot = JSON.stringify(ex);
    const result = plannedSeries(ex);
    expect(JSON.stringify(ex)).toBe(snapshot);
    expect(result[0].values[0]).not.toBe(ex.series[0].values[0]);
  });

  it('handles multi-activity exercises', () => {
    const ex = {
      sets: 2,
      activities: [{ type: 'weight' }, { type: 'countdown' }],
      series: [
        { values: [{ reps: 10, weight: 40 }, { duration: 30 }] },
        { values: [{ reps: 8,  weight: 40 }, { duration: 45 }] },
      ],
    };
    expect(plannedSeries(ex)[1].values).toEqual([{ reps: 8, weight: 40 }, { duration: 45 }]);
  });
});
