import { describe, it, expect } from 'vitest';
import {
  isExerciseStarted, groupableLiveIndices, canGroupLive, nextUndoneInBlock, nextLiveStep, supersetProgress,
} from '../lib/superset-flow.js';

const g1 = (settings = {}) => ({ id: 'g1', rounds: 2, transition: 15, roundRest: 90, ...settings });

// Live fonte exercise with `n` series and one weight activity per default.
function liveEx(name, n, extra = {}) {
  const activities = extra.activities || [{ type: 'weight', rest: 60 }];
  return {
    name,
    activities,
    series: Array.from({ length: n }, () => ({
      activityStates: {},
      values: activities.map(() => ({ reps: 10, weight: 40 })),
    })),
    ...extra,
  };
}

const cardio = (state = 'pending') => ({ name: 'Rameur', type: 'cardio', duration: 10, state });

// Marks the given [exIdx, sIdx, actIdx] steps as done (fixtures only).
function withDone(exercises, steps) {
  steps.forEach(([e, s, a = 0]) => { exercises[e].series[s].activityStates[a] = 'done'; });
  return exercises;
}

// Group g1 = [A, B], each with `n` series (2 by default).
const pair = (nA = 2, nB = 2, settings = {}) => [
  liveEx('A', nA, { group: g1(settings) }), liveEx('B', nB, { group: g1(settings) }),
];

const step = (exIdx, sIdx, actIdx = 0) => ({ exIdx, sIdx, actIdx });

describe('isExerciseStarted', () => {
  it('is false when no activity is done', () => {
    expect(isExerciseStarted(liveEx('A', 3))).toBe(false);
  });

  it('is true when one activity is done', () => {
    const [ex] = withDone([liveEx('A', 3)], [[0, 1]]);

    expect(isExerciseStarted(ex)).toBe(true);
  });

  it('is false for a pending cardio exercise', () => {
    expect(isExerciseStarted(cardio('pending'))).toBe(false);
  });

  it('is true for a done cardio exercise', () => {
    expect(isExerciseStarted(cardio('done'))).toBe(true);
  });
});

describe('groupableLiveIndices', () => {
  it('lists the fonte exercises not started', () => {
    expect(groupableLiveIndices([liveEx('A', 3), liveEx('B', 3)])).toEqual([0, 1]);
  });

  it('excludes a started exercise', () => {
    const exercises = withDone([liveEx('A', 3), liveEx('B', 3)], [[0, 0]]);

    expect(groupableLiveIndices(exercises)).toEqual([1]);
  });

  it('excludes a cardio exercise', () => {
    expect(groupableLiveIndices([cardio(), liveEx('B', 3)])).toEqual([1]);
  });

  it('excludes an exercise already grouped', () => {
    expect(groupableLiveIndices([...pair(), liveEx('C', 3)])).toEqual([2]);
  });
});

describe('canGroupLive', () => {
  const fresh = () => ['A', 'B', 'C', 'D', 'E'].map(n => liveEx(n, 3));

  it('accepts two groupable exercises', () => {
    expect(canGroupLive(fresh(), [0, 3])).toBe(true);
  });

  it('refuses a single exercise', () => {
    expect(canGroupLive(fresh(), [0])).toBe(false);
  });

  it('refuses five exercises', () => {
    expect(canGroupLive(fresh(), [0, 1, 2, 3, 4])).toBe(false);
  });

  it('refuses a started exercise', () => {
    const exercises = withDone(fresh(), [[1, 0]]);

    expect(canGroupLive(exercises, [0, 1])).toBe(false);
  });

  it('refuses a duplicated index', () => {
    expect(canGroupLive(fresh(), [2, 2])).toBe(false);
  });
});

describe('nextUndoneInBlock', () => {
  const multi = () => liveEx('M', 2, { activities: [{ type: 'weight', rest: 30 }, { type: 'countdown', rest: 60 }] });

  it('goes to the next activity of the same series for a single exercise', () => {
    const exercises = withDone([multi()], [[0, 0, 0]]);

    expect(nextUndoneInBlock(exercises, 0)).toEqual(step(0, 0, 1));
  });

  it('goes to the next series once the series is done for a single exercise', () => {
    const exercises = withDone([multi()], [[0, 0, 0], [0, 0, 1]]);

    expect(nextUndoneInBlock(exercises, 0)).toEqual(step(0, 1, 0));
  });

  it('starts a group with A1', () => {
    expect(nextUndoneInBlock(pair(), 0)).toEqual(step(0, 0));
  });

  it('goes from A1 to B1', () => {
    const exercises = withDone(pair(), [[0, 0]]);

    expect(nextUndoneInBlock(exercises, 0)).toEqual(step(1, 0));
  });

  it('goes from B1 to A2', () => {
    const exercises = withDone(pair(), [[0, 0], [1, 0]]);

    expect(nextUndoneInBlock(exercises, 0)).toEqual(step(0, 1));
  });

  it('returns null when the whole group is done', () => {
    const exercises = withDone(pair(), [[0, 0], [1, 0], [0, 1], [1, 1]]);

    expect(nextUndoneInBlock(exercises, 0)).toBeNull();
  });

  it('returns A1 when called with the index of B', () => {
    expect(nextUndoneInBlock(pair(), 1)).toEqual(step(0, 0));
  });

  it('skips the series missing from a shorter member', () => {
    const exercises = withDone(pair(2, 3), [[0, 0], [1, 0], [0, 1], [1, 1]]);

    expect(nextUndoneInBlock(exercises, 0)).toEqual(step(1, 2));
  });

  it('returns null for a cardio exercise', () => {
    expect(nextUndoneInBlock([cardio()], 0)).toBeNull();
  });
});

describe('nextLiveStep', () => {
  it('rests the activity rest before the next series of a single exercise', () => {
    const exercises = withDone([liveEx('S', 2)], [[0, 0]]);

    expect(nextLiveStep(exercises, step(0, 0))).toEqual({ next: step(0, 1), pause: { kind: 'rest', seconds: 60 } });
  });

  it('returns no next step and no pause when a single exercise is done', () => {
    const exercises = withDone([liveEx('S', 1)], [[0, 0]]);

    expect(nextLiveStep(exercises, step(0, 0))).toEqual({ next: null, pause: null });
  });

  it('asks for a confirmed transition from A1 to B1', () => {
    const exercises = withDone(pair(), [[0, 0]]);

    expect(nextLiveStep(exercises, step(0, 0))).toEqual({
      next: step(1, 0), pause: { kind: 'transition', seconds: 15, confirm: true },
    });
  });

  it('still asks for a confirmed transition at 0 s', () => {
    const exercises = withDone(pair(2, 2, { transition: 0 }), [[0, 0]]);

    expect(nextLiveStep(exercises, step(0, 0)).pause).toEqual({ kind: 'transition', seconds: 0, confirm: true });
  });

  it('rests the round rest from B1 to A2', () => {
    const exercises = withDone(pair(), [[0, 0], [1, 0]]);

    expect(nextLiveStep(exercises, step(1, 0))).toEqual({ next: step(0, 1), pause: { kind: 'roundRest', seconds: 90 } });
  });

  it('returns no next step after the last B', () => {
    const exercises = withDone(pair(), [[0, 0], [1, 0], [0, 1], [1, 1]]);

    expect(nextLiveStep(exercises, step(1, 1))).toEqual({ next: null, pause: null });
  });

  it('rests the activity rest between two activities of the same member series', () => {
    const activities = [{ type: 'weight', rest: 30 }, { type: 'weight', rest: 60 }];
    const exercises  = withDone([liveEx('A', 2, { activities, group: g1() }), liveEx('B', 2, { group: g1() })], [[0, 0, 0]]);

    expect(nextLiveStep(exercises, step(0, 0, 0))).toEqual({ next: step(0, 0, 1), pause: { kind: 'rest', seconds: 30 } });
  });
});

describe('supersetProgress', () => {
  it('counts no round when nothing is done', () => {
    expect(supersetProgress(pair(), 0)).toEqual({ roundsDone: 0, rounds: 2 });
  });

  it('counts no round when only A1 is done', () => {
    const exercises = withDone(pair(), [[0, 0]]);

    expect(supersetProgress(exercises, 0).roundsDone).toBe(0);
  });

  it('counts one round when A1 and B1 are done', () => {
    const exercises = withDone(pair(), [[0, 0], [1, 0]]);

    expect(supersetProgress(exercises, 1).roundsDone).toBe(1);
  });

  it('counts every round when the group is done', () => {
    const exercises = withDone(pair(), [[0, 0], [1, 0], [0, 1], [1, 1]]);

    expect(supersetProgress(exercises, 0)).toEqual({ roundsDone: 2, rounds: 2 });
  });
});

describe('review fixes', () => {
  it('groupableLiveIndices includes an isolated member not started', () => {
    expect(groupableLiveIndices([liveEx('A', 2, { group: g1() }), liveEx('B', 2)])).toEqual([0, 1]);
  });

  it('nextLiveStep asks for a confirmed transition back to B1 after A2', () => {
    const exercises = withDone(pair(), [[0, 0], [0, 1]]);

    expect(nextLiveStep(exercises, step(0, 1))).toEqual({
      next: step(1, 0), pause: { kind: 'transition', seconds: 15, confirm: true },
    });
  });

  it('nextLiveStep rests the activity rest back to A1 after A2 on the same station', () => {
    const exercises = withDone(pair(), [[0, 1]]);

    expect(nextLiveStep(exercises, step(0, 1))).toEqual({ next: step(0, 0), pause: { kind: 'rest', seconds: 60 } });
  });

  it('nextLiveStep rests the round rest from B2 to A3 when B is shorter', () => {
    const exercises = withDone(pair(3, 2), [[0, 0], [1, 0], [0, 1], [1, 1]]);

    expect(nextLiveStep(exercises, step(1, 1))).toEqual({ next: step(0, 2), pause: { kind: 'roundRest', seconds: 90 } });
  });

  it('supersetProgress returns null for a single exercise', () => {
    expect(supersetProgress([liveEx('S', 2)], 0)).toBeNull();
  });

  it('supersetProgress returns null for a cardio exercise', () => {
    expect(supersetProgress([cardio()], 0)).toBeNull();
  });
});
