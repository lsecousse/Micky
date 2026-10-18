import { describe, it, expect } from 'vitest';
import { computeEstimatedDuration } from '../lib/duration-estimate.js';

describe('computeEstimatedDuration', () => {
  it('returns 0 for empty programme', () => {
    expect(computeEstimatedDuration({ exercises: [] }, new Map())).toBe(0);
  });

  it('uses 45s per series + rest for weight when no avgMap entry', () => {
    const programme = {
      exercises: [{
        name: 'Curl',
        activities: [{ type: 'weight', rest: 60 }],
        sets: 4,
      }],
    };
    expect(computeEstimatedDuration(programme, new Map())).toBe(420);
  });

  it('uses act.duration + rest for countdown (no fallback needed)', () => {
    const programme = {
      exercises: [{
        name: 'Plank',
        activities: [{ type: 'countdown', duration: 60, rest: 30 }],
        sets: 3,
      }],
    };
    expect(computeEstimatedDuration(programme, new Map())).toBe(270);
  });

  it('uses 45s per series + rest for stopwatch when no avgMap entry', () => {
    const programme = {
      exercises: [{
        name: 'Sprint',
        activities: [{ type: 'stopwatch', rest: 90 }],
        sets: 2,
      }],
    };
    expect(computeEstimatedDuration(programme, new Map())).toBe(2 * (45 + 90));
  });

  it('uses avgMap value divided across sets when historical avg exists', () => {
    const programme = {
      exercises: [{
        name: 'Squat',
        normalized_name: 'squat',
        activities: [{ type: 'weight', rest: 90 }],
        sets: 4,
      }],
    };
    const avgMap = new Map([['squat', 600]]);
    expect(computeEstimatedDuration(programme, avgMap)).toBe(600);
  });

  it('multi-exercise programme sums correctly', () => {
    const programme = {
      exercises: [
        { name: 'Squat', activities: [{ type: 'weight', rest: 60 }], sets: 3 },
        { name: 'Plank', activities: [{ type: 'countdown', duration: 30, rest: 15 }], sets: 2 },
      ],
    };
    expect(computeEstimatedDuration(programme, new Map())).toBe(405);
  });

  it('sums per-series countdown durations when series values differ', () => {
    const programme = {
      exercises: [{
        name: 'Plank',
        activities: [{ type: 'countdown', rest: 15 }],
        sets: 3,
        series: [30, 30, 60].map(d => ({ activityStates: {}, values: [{ duration: d }] })),
      }],
    };
    expect(computeEstimatedDuration(programme, new Map())).toBe(165);
  });

  it('keeps 45s per series for weight even when series values are present', () => {
    const programme = {
      exercises: [{
        name: 'Curl',
        activities: [{ type: 'weight', rest: 60 }],
        sets: 2,
        series: [{ values: [{ reps: 10, weight: 20 }] }, { values: [{ reps: 8, weight: 22 }] }],
      }],
    };
    expect(computeEstimatedDuration(programme, new Map())).toBe(210);
  });
});

describe('computeEstimatedDuration with super sets', () => {
  const g1 = { id: 'g1', rounds: 4, transition: 15, roundRest: 90 };
  const member = (name, extra = {}) => ({
    name, normalized_name: name.toLowerCase(), activities: [{ type: 'weight', rest: 60 }], sets: 4, group: g1, ...extra,
  });

  it('walks the rounds with transition and round rest instead of the activity rest', () => {
    const programme = { exercises: [member('A'), member('B')] };

    expect(computeEstimatedDuration(programme, new Map())).toBe(780);
  });

  it('ignores the historical average of a member', () => {
    const programme = { exercises: [member('A'), member('B')] };

    expect(computeEstimatedDuration(programme, new Map([['a', 999]]))).toBe(780);
  });

  it('sums a single exercise and a group', () => {
    const curl      = { name: 'Curl', activities: [{ type: 'weight', rest: 60 }], sets: 4 };
    const programme = { exercises: [curl, member('A'), member('B')] };

    expect(computeEstimatedDuration(programme, new Map())).toBe(420 + 780);
  });

  it('uses the planned duration of each series for a countdown member', () => {
    const plank = member('Plank', {
      activities: [{ type: 'countdown', rest: 60 }],
      series: [20, 20, 20, 20].map(d => ({ values: [{ duration: d }] })),
    });

    expect(computeEstimatedDuration({ exercises: [plank, member('B')] }, new Map())).toBe(4 * 20 + 4 * (15 + 45 + 90));
  });

  it('rests between the activities of a member, then transition or round rest after the last one', () => {
    const g      = { ...g1, rounds: 2 };
    const multi  = member('A', { sets: 2, group: g, activities: [{ type: 'weight', rest: 30 }, { type: 'weight', rest: 60 }] });
    const single = member('B', { sets: 2, group: g });

    expect(computeEstimatedDuration({ exercises: [multi, single] }, new Map())).toBe(2 * (45 + 30 + 45 + 15 + 45 + 90));
  });
});
