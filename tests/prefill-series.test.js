import { describe, it, expect } from 'vitest';
import { prefillSeriesFromPrev } from '../lib/prefill-series.js';

describe('prefillSeriesFromPrev', () => {
  it('fills weight + reps where current values are 0', () => {
    const exercises = [{
      activities: [{ type: 'weight' }],
      series: [
        { values: [{ reps: 0, weight: 0 }], activityStates: {} },
        { values: [{ reps: 0, weight: 0 }], activityStates: {} },
      ],
      prevSeries: [
        { values: [{ reps: 12, weight: 25 }] },
        { values: [{ reps: 10, weight: 27.5 }] },
      ],
    }];
    prefillSeriesFromPrev(exercises);
    expect(exercises[0].series[0].values[0]).toEqual({ reps: 12, weight: 25 });
    expect(exercises[0].series[1].values[0]).toEqual({ reps: 10, weight: 27.5 });
  });

  it('respects explicit non-zero programme values (does not override)', () => {
    const exercises = [{
      activities: [{ type: 'weight' }],
      series: [{ values: [{ reps: 8, weight: 100 }], activityStates: {} }],
      prevSeries: [{ values: [{ reps: 12, weight: 25 }] }],
    }];
    prefillSeriesFromPrev(exercises);
    expect(exercises[0].series[0].values[0]).toEqual({ reps: 8, weight: 100 });
  });

  it('fills weight only when reps is set but weight is 0', () => {
    const exercises = [{
      activities: [{ type: 'weight' }],
      series: [{ values: [{ reps: 10, weight: 0 }], activityStates: {} }],
      prevSeries: [{ values: [{ reps: 12, weight: 25 }] }],
    }];
    prefillSeriesFromPrev(exercises);
    expect(exercises[0].series[0].values[0]).toEqual({ reps: 10, weight: 25 });
  });

  it('fills countdown duration where current is 0', () => {
    const exercises = [{
      activities: [{ type: 'countdown' }],
      series: [{ values: [{ duration: 0 }], activityStates: {} }],
      prevSeries: [{ values: [{ duration: 60 }] }],
    }];
    prefillSeriesFromPrev(exercises);
    expect(exercises[0].series[0].values[0]).toEqual({ duration: 60 });
  });

  it('does nothing when prevSeries is null', () => {
    const exercises = [{
      activities: [{ type: 'weight' }],
      series: [{ values: [{ reps: 0, weight: 0 }], activityStates: {} }],
      prevSeries: null,
    }];
    prefillSeriesFromPrev(exercises);
    expect(exercises[0].series[0].values[0]).toEqual({ reps: 0, weight: 0 });
  });

  it('does nothing when prev value is also 0/null', () => {
    const exercises = [{
      activities: [{ type: 'weight' }],
      series: [{ values: [{ reps: 0, weight: 0 }], activityStates: {} }],
      prevSeries: [{ values: [{ reps: 0, weight: null }] }],
    }];
    prefillSeriesFromPrev(exercises);
    expect(exercises[0].series[0].values[0]).toEqual({ reps: 0, weight: 0 });
  });

  it('handles series count mismatch (programme has more sets than prev)', () => {
    const exercises = [{
      activities: [{ type: 'weight' }],
      series: [
        { values: [{ reps: 0, weight: 0 }], activityStates: {} },
        { values: [{ reps: 0, weight: 0 }], activityStates: {} },
        { values: [{ reps: 0, weight: 0 }], activityStates: {} },
      ],
      prevSeries: [
        { values: [{ reps: 12, weight: 25 }] },
      ],
    }];
    prefillSeriesFromPrev(exercises);
    expect(exercises[0].series[0].values[0]).toEqual({ reps: 12, weight: 25 });
    expect(exercises[0].series[1].values[0]).toEqual({ reps: 0, weight: 0 });
    expect(exercises[0].series[2].values[0]).toEqual({ reps: 0, weight: 0 });
  });

  it('skips when activity type differs from prev value shape', () => {
    const exercises = [{
      activities: [{ type: 'countdown' }],
      series: [{ values: [{ duration: 0 }], activityStates: {} }],
      prevSeries: [{ values: [{ reps: 12, weight: 25 }] }],
    }];
    prefillSeriesFromPrev(exercises);
    expect(exercises[0].series[0].values[0]).toEqual({ duration: 0 });
  });

  it('handles stopwatch activities (no prefill needed)', () => {
    const exercises = [{
      activities: [{ type: 'stopwatch' }],
      series: [{ values: [{}], activityStates: {} }],
      prevSeries: [{ values: [{ duration: 45 }] }],
    }];
    prefillSeriesFromPrev(exercises);
    expect(exercises[0].series[0].values[0]).toEqual({});
  });

  it('handles multi-activity exercise', () => {
    const exercises = [{
      activities: [{ type: 'weight' }, { type: 'countdown' }],
      series: [{
        values: [{ reps: 0, weight: 0 }, { duration: 0 }],
        activityStates: {},
      }],
      prevSeries: [{
        values: [{ reps: 12, weight: 25 }, { duration: 30 }],
      }],
    }];
    prefillSeriesFromPrev(exercises);
    expect(exercises[0].series[0].values[0]).toEqual({ reps: 12, weight: 25 });
    expect(exercises[0].series[0].values[1]).toEqual({ duration: 30 });
  });
});
