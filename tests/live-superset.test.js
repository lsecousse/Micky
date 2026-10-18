import { describe, it, expect } from 'vitest';
import {
  liveFonteExercise, programmeIndexOf, reorderLiveTiming, liveExerciseDurationAllowed,
} from '../lib/live-superset.js';

const WEIGHT = { type: 'weight', reps: 10, weight: 40, rest: 60 };
const migrated = { activities: [WEIGHT], series: [{}, {}, {}] };

function programmeEx(extra = {}) {
  return { name: 'Curl', comment: 'c', sets: 3, activities: [WEIGHT], ...extra };
}

describe('liveFonteExerciseShould', () => {
  it('keep the current output for an exercise without group', () => {
    const result = liveFonteExercise(programmeEx(), migrated);

    expect(result).toEqual({
      name: 'Curl', comment: 'c', activities: [WEIGHT], prevSeries: null,
      series: [0, 1, 2].map(() => ({ activityStates: {}, values: [{ reps: 10, weight: 40 }] })),
    });
  });

  it('copy the group instead of sharing the reference', () => {
    const group = { id: 'g1', rounds: 2, transition: 15, roundRest: 90 };

    const result = liveFonteExercise(programmeEx({ group }), migrated);

    expect(result.group).toEqual(group);
    expect(result.group).not.toBe(group);
  });

  it('build as many series as the group rounds', () => {
    const group = { id: 'g1', rounds: 2, transition: 15, roundRest: 90 };

    const result = liveFonteExercise(programmeEx({ group }), migrated);

    expect(result.series).toHaveLength(2);
  });
});

describe('programmeIndexOfShould', () => {
  const prog = [{ name: 'Curl' }, { name: 'Squat' }, { name: 'curl' }];

  it('return the same index when the order is unchanged', () => {
    expect(programmeIndexOf(prog, [{ name: 'Curl' }, { name: 'Squat' }, { name: 'Curl' }], 1)).toBe(1);
  });

  it('follow an exercise moved in the session', () => {
    expect(programmeIndexOf(prog, [{ name: 'Squat' }, { name: 'Curl' }, { name: 'Curl' }], 0)).toBe(1);
  });

  it('match duplicated names by occurrence rank', () => {
    expect(programmeIndexOf(prog, [{ name: 'Curl' }, { name: 'Squat' }, { name: 'Curl' }], 2)).toBe(2);
  });

  it('return -1 when the exercise is not in the programme', () => {
    expect(programmeIndexOf(prog, [{ name: 'Pompes' }], 0)).toBe(-1);
  });
});

describe('reorderLiveTimingShould', () => {
  it('reindex the four maps following the permutation', () => {
    const maps = {
      exoStartedAt: { 0: 100, 1: 200 }, exoDurations: { 0: 5 },
      serieStartedAt: { 1: { 0: 7 } }, serieDurations: { 0: { 0: 3 }, 1: { 0: 4 } },
    };

    const result = reorderLiveTiming(maps, [1, 0]);

    expect(result).toEqual({
      exoStartedAt: { 0: 200, 1: 100 }, exoDurations: { 1: 5 },
      serieStartedAt: { 0: { 0: 7 } }, serieDurations: { 0: { 0: 4 }, 1: { 0: 3 } },
    });
  });
});

describe('liveExerciseDurationAllowedShould', () => {
  const group = { id: 'g1', rounds: 2, transition: 15, roundRest: 90 };

  it('refuse a member of a real group', () => {
    expect(liveExerciseDurationAllowed([{ group }, { group }, {}], 1)).toBe(false);
  });

  it('allow a single exercise', () => {
    expect(liveExerciseDurationAllowed([{ group }, { group }, {}], 2)).toBe(true);
  });

  it('allow an isolated member read as single', () => {
    expect(liveExerciseDurationAllowed([{ group }, {}], 0)).toBe(true);
  });
});
