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
});
