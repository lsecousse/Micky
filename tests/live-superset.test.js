import { describe, it, expect } from 'vitest';
import {
  liveFonteExercise, programmeIndexOf, reorderLiveTiming, liveExerciseDurationAllowed,
  supersetKindLabel, supersetSettingText, liveSupersetBlock, supersetRoundLog, livePauseView, supersetNextHint,
  liveListBlocks, togglePickedExercise, groupDraftRounds, applyLiveGrouping, programmeGrouping,
  canOpenLiveGrouping,
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

// ── Déroulé d'un groupe ─────────────────────────────────

const GROUP = { id: 'g1', rounds: 4, transition: 15, roundRest: 90 };

function member(name, weight, reps, extra = {}) {
  const activities = extra.activities || [{ type: 'weight', weight, reps, rest: 60 }];
  return {
    name, activities, group: { ...GROUP },
    series: Array.from({ length: 4 }, () => ({
      activityStates: {},
      values: activities.map(a => (a.type === 'weight' ? { weight: a.weight, reps: a.reps } : { duration: a.duration })),
    })),
  };
}

// Développé couché (A) + Rowing barre (B), the first `steps` steps done (A1 B1 A2 B2 …).
function pair(steps = 0) {
  const exs = [member('Développé couché', 60, 10), member('Rowing barre', 50, 10), { name: 'Curl', activities: [{ type: 'weight', weight: 12, reps: 12, rest: 60 }], series: [{ activityStates: {}, values: [{}] }] }];
  for (let k = 0; k < steps; k++) exs[k % 2].series[Math.floor(k / 2)].activityStates[0] = 'done';
  return exs;
}

describe('supersetKindLabelShould', () => {
  it('name a group of two a super set', () => {
    expect(supersetKindLabel(2)).toBe('Super set');
  });

  it('name a group of three a tri-set', () => {
    expect(supersetKindLabel(3)).toBe('Tri-set');
  });

  it('name a group of four a circuit', () => {
    expect(supersetKindLabel(4)).toBe('Circuit');
  });
});

describe('supersetSettingTextShould', () => {
  it('write seconds under a minute', () => {
    expect(supersetSettingText(15)).toBe('15 s');
  });

  it('write minutes and seconds', () => {
    expect(supersetSettingText(90)).toBe('1 min 30');
  });

  it('write whole minutes', () => {
    expect(supersetSettingText(120)).toBe('2 min');
  });
});

describe('liveSupersetBlockShould', () => {
  it('return the group block of a member', () => {
    expect(liveSupersetBlock(pair(), 1)).toEqual({ kind: 'group', indices: [0, 1], ...GROUP });
  });

  it('return null for a single exercise', () => {
    expect(liveSupersetBlock(pair(), 2)).toBeNull();
  });
});

describe('supersetRoundLogShould', () => {
  it('describe round 1 in progress with the planned pauses', () => {
    const log = supersetRoundLog(pair(), [0, 1], { exIdx: 0, sIdx: 0, actIdx: 0 });

    expect(log).toEqual({
      round: 1, rounds: 4, roundsDone: 0, finished: [],
      current: [
        { exIdx: 0, actIdx: 0, letter: 'A', name: 'Développé couché', weight: 60, reps: 10, duration: null,
          state: 'focus', after: { kind: 'transition', seconds: 15 } },
        { exIdx: 1, actIdx: 0, letter: 'B', name: 'Rowing barre', weight: 50, reps: 10, duration: null,
          state: 'todo', after: { kind: 'roundRest', seconds: 90 } },
      ],
      remaining: { from: 2, to: 4, text: 'A 60 × 10 · B 50 × 10' },
    });
  });

  it('summarize round 1 once finished and keep rounds 3 to 4 remaining', () => {
    const exs = pair(3);
    exs[0].series[0].values[0].weight = 62.5;

    const log = supersetRoundLog(exs, [0, 1], { exIdx: 1, sIdx: 1, actIdx: 0 });

    expect(log.finished).toEqual([{ round: 1, text: 'A 62,5 × 10 · B 50 × 10' }]);
    expect(log.current.map(row => row.state)).toEqual(['done', 'focus']);
    expect(log.remaining).toEqual({ from: 3, to: 4, text: 'A 60 × 10 · B 50 × 10' });
    expect([log.round, log.roundsDone]).toEqual([2, 1]);
  });

  it('have nothing remaining and no round rest on the last round', () => {
    const log = supersetRoundLog(pair(6), [0, 1], { exIdx: 0, sIdx: 3, actIdx: 0 });

    expect(log.remaining).toBeNull();
    expect(log.current[1].after).toBeNull();
    expect(log.finished.map(f => f.round)).toEqual([1, 2, 3]);
  });

  it('write one row per activity of a member and a clock for a timed activity', () => {
    const plank = { type: 'countdown', duration: 45, rest: 0 };
    const exs = [
      member('Pompes', 0, 15, { activities: [{ type: 'weight', weight: 0, reps: 15, rest: 0 }, plank] }),
      member('Rowing barre', 50, 10),
    ];
    exs[0].series[0].activityStates = { 0: 'done', 1: 'done' };
    exs[1].series[0].activityStates = { 0: 'done' };

    const log = supersetRoundLog(exs, [0, 1], { exIdx: 0, sIdx: 1, actIdx: 0 });

    expect(log.finished).toEqual([{ round: 1, text: 'A 0 × 15 + 0:45 · B 50 × 10' }]);
    expect(log.current.map(row => [row.letter, row.actIdx, row.duration, row.after])).toEqual([
      ['A', 0, null, null],
      ['A', 1, 45, { kind: 'transition', seconds: 15 }],
      ['B', 0, null, { kind: 'roundRest', seconds: 90 }],
    ]);
  });
});

describe('livePauseViewShould', () => {
  it('keep the activity rest screen', () => {
    expect(livePauseView({ kind: 'rest', seconds: 60 })).toBe('rest');
  });

  it('show the round rest screen', () => {
    expect(livePauseView({ kind: 'roundRest', seconds: 90 })).toBe('roundRest');
  });

  it('count a transition down when it lasts', () => {
    expect(livePauseView({ kind: 'transition', seconds: 15 })).toBe('transitionCountdown');
  });

  it('stop at once on a transition of 0 s', () => {
    expect(livePauseView({ kind: 'transition', seconds: 0 })).toBe('transitionStop');
  });

  it('stop once the transition countdown is over', () => {
    expect(livePauseView({ kind: 'transition', seconds: 15, stop: true })).toBe('transitionStop');
  });
});

describe('supersetNextHintShould', () => {
  it('announce the next member after a transition', () => {
    expect(supersetNextHint(pair(), { exIdx: 0, sIdx: 0, actIdx: 0 })).toBe('puis B · Rowing barre');
  });

  it('announce the round rest after the last member', () => {
    expect(supersetNextHint(pair(1), { exIdx: 1, sIdx: 0, actIdx: 0 })).toBe('puis repos de tour 1:30');
  });

  it('announce the list after the last step', () => {
    expect(supersetNextHint(pair(7), { exIdx: 1, sIdx: 3, actIdx: 0 })).toBe('puis retour à la liste');
  });

  it('leave a single exercise to the usual hint', () => {
    expect(supersetNextHint(pair(), { exIdx: 2, sIdx: 0, actIdx: 0 })).toBeNull();
  });

  it('not mutate the session', () => {
    const exs = pair();

    supersetNextHint(exs, { exIdx: 0, sIdx: 0, actIdx: 0 });

    expect(exs[0].series[0].activityStates).toEqual({});
  });
});

/* ── List by blocks and « Grouper » sheet ─────────────── */

function single(name, sets = 3, doneCount = 0) {
  const act = { type: 'weight', weight: 20, reps: 10, rest: 60 };
  return {
    name, activities: [act],
    series: Array.from({ length: sets }, (_, k) => ({
      activityStates: k < doneCount ? { 0: 'done' } : {},
      values: [{ weight: 20, reps: 10 }],
    })),
  };
}

describe('liveListBlocksShould', () => {
  it('give one entry per block', () => {
    const exs = pair();

    const result = liveListBlocks(exs);

    expect(result.map(b => b.indices)).toEqual([[0, 1], [2]]);
  });

  it('move finished blocks to the end keeping the order of the others', () => {
    const exs = [single('Tractions', 3, 3), single('Dips'), single('Curl', 2, 2), single('Squat')];

    const result = liveListBlocks(exs);

    expect(result.map(b => b.indices[0])).toEqual([1, 3, 0, 2]);
  });

  it('flag a block done when every series of every member is done', () => {
    const exs = pair(8);

    const result = liveListBlocks(exs);

    expect(result.find(b => b.kind === 'group').done).toBe(true);
  });

  it('flag a group started when one member has a series in progress', () => {
    const exs = pair(1);

    const result = liveListBlocks(exs);

    expect(result[0].started).toBe(true);
  });

  it('flag a single exercise not started when no activity has a state', () => {
    const exs = [single('Dips')];

    const result = liveListBlocks(exs);

    expect(result[0].started).toBe(false);
  });

  it('give the rounds progress of a group', () => {
    const exs = pair(4);

    const result = liveListBlocks(exs);

    expect(result[0].progress).toEqual({ roundsDone: 2, rounds: 4 });
  });

  it('give no progress for a single exercise', () => {
    const exs = [single('Dips')];

    const result = liveListBlocks(exs);

    expect(result[0].progress).toBeUndefined();
  });
});

describe('togglePickedExerciseShould', () => {
  it('append an exercise not yet picked', () => {
    const result = togglePickedExercise([3, 1], 5);

    expect(result).toEqual([3, 1, 5]);
  });

  it('remove a picked exercise so the next ones move up', () => {
    const result = togglePickedExercise([3, 1, 5], 1);

    expect(result).toEqual([3, 5]);
  });

  it('ignore a fifth exercise', () => {
    const result = togglePickedExercise([0, 1, 2, 3], 4);

    expect(result).toEqual([0, 1, 2, 3]);
  });

  it('leave the given array untouched', () => {
    const picked = [3, 1];

    togglePickedExercise(picked, 5);

    expect(picked).toEqual([3, 1]);
  });
});

describe('groupDraftRoundsShould', () => {
  it('take the longest picked exercise by default', () => {
    const exs = [single('Militaire', 4), single('Dips', 3)];

    const result = groupDraftRounds(exs, [1, 0], null);

    expect(result).toBe(4);
  });

  it('keep the rounds set by the user', () => {
    const exs = [single('Militaire', 4), single('Dips', 3)];

    const result = groupDraftRounds(exs, [1, 0], 2);

    expect(result).toBe(2);
  });

  it('propose 4 rounds while nothing is picked', () => {
    const result = groupDraftRounds([single('Dips', 3)], [], null);

    expect(result).toBe(4);
  });
});

function liveSessionWith(exercises) {
  return {
    exercises,
    exoStartedAt:   { 0: 100 },
    exoDurations:   { 0: 300 },
    serieStartedAt: { 0: { 0: 100 } },
    serieDurations: { 0: { 0: 40 } },
  };
}

describe('applyLiveGroupingShould', () => {
  it('group the picked exercises in the picked order at the first picked place', () => {
    const session = liveSessionWith([single('Tractions', 3, 3), single('Militaire', 4), single('Rowing'), single('Dips')]);

    const { exercises } = applyLiveGrouping(session, [3, 1], { rounds: 4, transition: 15, roundRest: 90 });

    expect(exercises.map(e => e.name)).toEqual(['Tractions', 'Dips', 'Militaire', 'Rowing']);
  });

  it('give the members the chosen settings', () => {
    const session = liveSessionWith([single('Militaire', 4), single('Dips')]);

    const { exercises } = applyLiveGrouping(session, [0, 1], { rounds: 4, transition: 20, roundRest: 105 });

    expect(exercises[1].group).toEqual({ id: 'g1', rounds: 4, transition: 20, roundRest: 105 });
  });

  it('give resized series an empty activity state', () => {
    const session = liveSessionWith([single('Militaire', 4), single('Dips', 3)]);

    const { exercises } = applyLiveGrouping(session, [0, 1], { rounds: 4, transition: 15, roundRest: 90 });

    expect(exercises[1].series.map(s => s.activityStates)).toEqual([{}, {}, {}, {}]);
  });

  it('reindex the timing maps by the same permutation', () => {
    const session = liveSessionWith([single('Tractions', 3, 3), single('Militaire'), single('Dips')]);
    session.exoDurations = { 0: 300, 2: 50 };

    const { timing } = applyLiveGrouping(session, [2, 1], { rounds: 3, transition: 15, roundRest: 90 });

    expect(timing.exoDurations).toEqual({ 0: 300, 1: 50 });
  });
});

describe('programmeGroupingShould', () => {
  const settings = { rounds: 3, transition: 15, roundRest: 90 };

  it('group the programme exercises matching the picked session exercises', () => {
    const programme = [programmeEx({ name: 'Militaire' }), programmeEx({ name: 'Rowing' }), programmeEx({ name: 'Dips' })];
    const session = [single('Rowing'), single('Militaire'), single('Dips')];

    const result = programmeGrouping(programme, session, [2, 1], settings);

    expect(result.map(e => [e.name, e.group?.id])).toEqual([['Dips', 'g1'], ['Militaire', 'g1'], ['Rowing', undefined]]);
  });

  it('give null when a picked exercise is missing from the programme', () => {
    const programme = [programmeEx({ name: 'Militaire' })];
    const session = [single('Militaire'), single('Dips')];

    const result = programmeGrouping(programme, session, [0, 1], settings);

    expect(result).toBeNull();
  });

  it('give null when the programme refuses the group', () => {
    const programme = [programmeEx({ name: 'Militaire', group: { ...GROUP } }), programmeEx({ name: 'Rowing', group: { ...GROUP } }), programmeEx({ name: 'Dips' })];
    const session = [single('Militaire'), single('Dips')];

    const result = programmeGrouping(programme, session, [0, 1], settings);

    expect(result).toBeNull();
  });
});

describe('canOpenLiveGroupingShould', () => {
  it('allow grouping with two groupable exercises and no countdown', () => {
    const result = canOpenLiveGrouping([single('Militaire'), single('Dips')], false);

    expect(result).toBe(true);
  });

  it('refuse while a countdown is running', () => {
    const result = canOpenLiveGrouping([single('Militaire'), single('Dips')], true);

    expect(result).toBe(false);
  });

  it('refuse with fewer than two groupable exercises', () => {
    const result = canOpenLiveGrouping([single('Militaire'), single('Dips', 3, 1)], false);

    expect(result).toBe(false);
  });
});
