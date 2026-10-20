import { describe, it, expect } from 'vitest';
import {
  boDropIntent, boCanDropOnto, boApplyDrop, boClock, boRowSummary,
} from '../lib/bo-programme-editor.js';

const WEIGHT = { type: 'weight', reps: 10, weight: 60 };
const GROUP  = { id: 'g1', rounds: 3, transition: 15, roundRest: 90 };
const ROW    = { top: 100, height: 60 };

function ex(name, extra = {}) {
  return { name, sets: 3, activities: [WEIGHT], ...extra };
}

function member(name, group = GROUP) {
  return ex(name, { group: { ...group } });
}

// Weight exercise whose planned series hold the given [reps, kg] pairs.
function planned(pairs, rest = 0) {
  const series = pairs.map(([reps, weight]) => ({ activityStates: {}, values: [{ reps, weight }] }));
  return { name: 'X', sets: pairs.length, activities: [{ type: 'weight', rest }], series };
}

const names = exercises => exercises.map(e => e.name);

describe('boDropIntentShould', () => {
  it('insert before when hovering the top edge of a first row', () => {
    expect(boDropIntent(ROW, 105, { canJoin: true, firstRow: true })).toBe('before');
  });

  it('insert after when hovering the top edge of a group member row', () => {
    expect(boDropIntent(ROW, 105, { canJoin: true, firstRow: false })).toBe('after');
  });

  it('insert after when hovering the bottom edge', () => {
    expect(boDropIntent(ROW, 155, { canJoin: true, firstRow: true })).toBe('after');
  });

  it('drop onto when hovering the middle of a row that can join', () => {
    expect(boDropIntent(ROW, 130, { canJoin: true, firstRow: true })).toBe('onto');
  });

  it('insert after when hovering the middle of a row that cannot join', () => {
    expect(boDropIntent(ROW, 130, { canJoin: false, firstRow: true })).toBe('after');
  });

  it('use a quarter of a short row as edge', () => {
    expect(boDropIntent({ top: 100, height: 20 }, 106, { canJoin: true, firstRow: true })).toBe('onto');
  });
});

describe('boCanDropOntoShould', () => {
  it('allow a single exercise onto another single', () => {
    expect(boCanDropOnto([ex('A'), ex('B')], { blockPos: 1 }, 0)).toBe(true);
  });

  it('allow a catalog exercise onto a single', () => {
    expect(boCanDropOnto([ex('A')], { exercise: ex('X') }, 0)).toBe(true);
  });

  it('allow a single exercise onto a group of two', () => {
    expect(boCanDropOnto([member('A'), member('B'), ex('C')], { blockPos: 1 }, 0)).toBe(true);
  });

  it('forbid dropping a block onto itself', () => {
    expect(boCanDropOnto([ex('A'), ex('B')], { blockPos: 0 }, 0)).toBe(false);
  });

  it('forbid dropping a group block', () => {
    expect(boCanDropOnto([ex('A'), member('B'), member('C')], { blockPos: 1 }, 0)).toBe(false);
  });

  it('forbid a cardio source', () => {
    expect(boCanDropOnto([ex('A')], { exercise: ex('X', { type: 'cardio' }) }, 0)).toBe(false);
  });

  it('forbid a cardio target', () => {
    expect(boCanDropOnto([ex('A', { type: 'cardio' }), ex('B')], { blockPos: 1 }, 0)).toBe(false);
  });

  it('forbid dropping onto a full group', () => {
    const exercises = [member('A'), member('B'), member('C'), member('D'), ex('E')];

    expect(boCanDropOnto(exercises, { blockPos: 1 }, 0)).toBe(false);
  });
});

describe('boApplyDropShould', () => {
  it('move a block before another block', () => {
    const result = boApplyDrop([ex('A'), ex('B'), ex('C')], { blockPos: 2 }, { blockPos: 0, intent: 'before' });

    expect(names(result)).toEqual(['C', 'A', 'B']);
  });

  it('move a block after another block', () => {
    const result = boApplyDrop([ex('A'), ex('B'), ex('C')], { blockPos: 0 }, { blockPos: 1, intent: 'after' });

    expect(names(result)).toEqual(['B', 'A', 'C']);
  });

  it('move a block to the end without target', () => {
    const result = boApplyDrop([ex('A'), ex('B'), ex('C')], { blockPos: 0 }, null);

    expect(names(result)).toEqual(['B', 'C', 'A']);
  });

  it('keep the order when a block is dropped next to itself', () => {
    const result = boApplyDrop([ex('A'), ex('B')], { blockPos: 0 }, { blockPos: 0, intent: 'after' });

    expect(names(result)).toEqual(['A', 'B']);
  });

  it('move a whole group block before a single', () => {
    const result = boApplyDrop([ex('A'), member('B'), member('C')], { blockPos: 1 }, { blockPos: 0, intent: 'before' });

    expect(result.map(e => [e.name, e.group?.id])).toEqual([['B', 'g1'], ['C', 'g1'], ['A', undefined]]);
  });

  it('insert a catalog exercise between two blocks', () => {
    const result = boApplyDrop([ex('A'), ex('B')], { exercise: ex('X') }, { blockPos: 1, intent: 'before' });

    expect(names(result)).toEqual(['A', 'X', 'B']);
  });

  it('append a catalog exercise without target', () => {
    const result = boApplyDrop([ex('A')], { exercise: ex('X') }, null);

    expect(names(result)).toEqual(['A', 'X']);
  });

  it('form a super set when a single is dropped onto a single', () => {
    const result = boApplyDrop([ex('A'), ex('B')], { blockPos: 1 }, { blockPos: 0, intent: 'onto' });

    expect(result.map(e => [e.name, Boolean(e.group)])).toEqual([['A', true], ['B', true]]);
  });

  it('form a super set when a catalog exercise is dropped onto a single', () => {
    const result = boApplyDrop([ex('A'), ex('B')], { exercise: ex('X') }, { blockPos: 0, intent: 'onto' });

    expect(result.map(e => [e.name, e.group?.id])).toEqual([['A', 'g1'], ['X', 'g1'], ['B', undefined]]);
  });

  it('grow a group of two to three members with the same settings', () => {
    const result = boApplyDrop([member('A'), member('B'), ex('C')], { blockPos: 1 }, { blockPos: 0, intent: 'onto' });

    expect(result.map(e => [e.name, e.group])).toEqual([['A', GROUP], ['B', GROUP], ['C', GROUP]]);
  });

  it('insert after a full group, group intact, when dropped in its middle', () => {
    const exercises = [ex('A'), member('B'), member('C'), member('D'), member('E')];
    const source    = { blockPos: 0 };
    const intent    = boDropIntent(ROW, 130, { canJoin: boCanDropOnto(exercises, source, 1), firstRow: false });

    const result = boApplyDrop(exercises, source, { blockPos: 1, intent });

    expect(result.map(e => [e.name, e.group?.id])).toEqual([['B', 'g1'], ['C', 'g1'], ['D', 'g1'], ['E', 'g1'], ['A', undefined]]);
  });

  it('append at the end when the target block no longer exists', () => {
    const result = boApplyDrop([ex('A'), ex('B')], { exercise: ex('X') }, { blockPos: 5, intent: 'before' });

    expect(names(result)).toEqual(['A', 'B', 'X']);
  });

  it('insert after a group that became full instead of dropping onto it', () => {
    const exercises = [ex('A'), member('B'), member('C'), member('D'), member('E')];

    const result = boApplyDrop(exercises, { blockPos: 0 }, { blockPos: 1, intent: 'onto' });

    expect(result.map(e => [e.name, e.group?.id])).toEqual([['B', 'g1'], ['C', 'g1'], ['D', 'g1'], ['E', 'g1'], ['A', undefined]]);
  });

  it('leave the input list untouched', () => {
    const exercises = [ex('A'), ex('B')];

    boApplyDrop(exercises, { blockPos: 1 }, { blockPos: 0, intent: 'onto' });

    expect(exercises).toEqual([ex('A'), ex('B')]);
  });
});

describe('boClockShould', () => {
  it('format minutes and seconds', () => {
    expect(boClock(105)).toBe('1:45');
  });

  it('pad seconds under a minute', () => {
    expect(boClock(15)).toBe('0:15');
  });

  it('pad zero seconds', () => {
    expect(boClock(120)).toBe('2:00');
  });
});

describe('boRowSummaryShould', () => {
  it('summarise a weight exercise with its rest', () => {
    const legacy = { name: 'X', sets: 4, activities: [{ type: 'weight', reps: 8, weight: 35, rest: 105 }] };

    expect(boRowSummary(legacy)).toBe('4 × 8 reps · 35 kg · repos 1:45');
  });

  it('omit the rest when there is none', () => {
    expect(boRowSummary(planned([[8, 35], [8, 35]]))).toBe('2 × 8 reps · 35 kg');
  });

  it('join variable reps with a slash', () => {
    expect(boRowSummary(planned([[10, 60], [8, 60]]))).toBe('2 × 10/8 reps · 60 kg');
  });

  it('join variable weights with a slash', () => {
    expect(boRowSummary(planned([[8, 60], [8, 70]]))).toBe('2 × 8 reps · 60/70 kg');
  });

  it('write a decimal weight with a comma', () => {
    expect(boRowSummary(planned([[8, 62.5]]))).toBe('1 × 8 reps · 62,5 kg');
  });

  it('show a zero load as the mobile editor does', () => {
    expect(boRowSummary(planned([[12, 0], [12, 0]]))).toBe('2 × 12 reps · 0 kg');
  });

  it('count the series when sets is missing', () => {
    const { sets, ...noSets } = planned([[8, 35], [8, 35], [8, 35]]);

    expect(boRowSummary(noSets)).toBe('3 × 8 reps · 35 kg');
  });

  it('summarise a timer exercise with its rest', () => {
    const timer = { name: 'X', sets: 3, activities: [{ type: 'countdown', duration: 45, rest: 60 }] };

    expect(boRowSummary(timer)).toBe('3 × 45 s · repos 1:00');
  });

  it('summarise a stopwatch exercise', () => {
    const chrono = { name: 'X', sets: 3, activities: [{ type: 'chrono' }] };

    expect(boRowSummary(chrono)).toBe('3 × chrono');
  });
});
