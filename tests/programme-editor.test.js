import { describe, it, expect } from 'vitest';
import {
  editorBlocks, readGroupSettings, programmeForSave, memberSummary, programmeListMeta,
  memberMoveDirs, applyGroupSettingsInput, newEditorExercise, editorCardFields,
} from '../lib/programme-editor.js';

const WEIGHT = { type: 'weight', reps: 10, weight: 60 };
const TIMER  = { type: 'countdown', duration: 45 };
const CHRONO = { type: 'chrono' };
const GROUP  = { id: 'g1', rounds: 3, transition: 15, roundRest: 90 };

function ex(name, extra = {}) {
  return { name, sets: 3, activities: [WEIGHT], ...extra };
}

function member(name, group = GROUP) {
  return ex(name, { group: { ...group } });
}

describe('editorBlocksShould', () => {
  it('label a group with its kind and expose its settings', () => {
    const [block] = editorBlocks([member('A'), member('B')]);

    expect([block.label, block.settings]).toEqual(['Super set', { rounds: 3, transition: 15, roundRest: 90 }]);
  });

  it('label a three member group as a tri-set', () => {
    const [block] = editorBlocks([member('A'), member('B'), member('C')]);

    expect(block.label).toBe('Tri-set');
  });

  it('leave label and settings null on a single exercise', () => {
    const [block] = editorBlocks([ex('A')]);

    expect([block.label, block.settings]).toEqual([null, null]);
  });

  it('allow linking a block to the next one', () => {
    const [first] = editorBlocks([ex('A'), ex('B')]);

    expect(first.canLinkNext).toBe(true);
  });

  it('forbid linking the last block', () => {
    const blocks = editorBlocks([ex('A'), ex('B')]);

    expect(blocks[1].canLinkNext).toBe(false);
  });

  it('forbid linking when the next block is cardio', () => {
    const [first] = editorBlocks([ex('A'), ex('B', { type: 'cardio' })]);

    expect(first.canLinkNext).toBe(false);
  });

  it('forbid linking when the block itself is cardio', () => {
    const [first] = editorBlocks([ex('A', { type: 'cardio' }), ex('B')]);

    expect(first.canLinkNext).toBe(false);
  });

  it('allow linking up to a total size of four', () => {
    const [first] = editorBlocks([member('A'), member('B'), member('C'), ex('D')]);

    expect(first.canLinkNext).toBe(true);
  });

  it('forbid linking beyond a total size of four', () => {
    const other = { ...GROUP, id: 'g2' };
    const [first] = editorBlocks([member('A'), member('B'), member('C'), member('D', other), member('E', other)]);

    expect(first.canLinkNext).toBe(false);
  });

  it('forbid linking two groups whose total size exceeds four', () => {
    const other = { ...GROUP, id: 'g2' };
    const [first] = editorBlocks([member('A'), member('B'), member('C', other), member('D', other), member('E', other)]);

    expect(first.canLinkNext).toBe(false);
  });

  it('keep the block indices', () => {
    const blocks = editorBlocks([ex('A'), member('B'), member('C')]);

    expect(blocks.map(b => b.indices)).toEqual([[0], [1, 2]]);
  });
});

describe('readGroupSettingsShould', () => {
  const previous = { rounds: 4, transition: 15, roundRest: 90 };

  it('keep the previous value of every invalid field', () => {
    const result = readGroupSettings({ rounds: '0', transition: '20', roundRest: 'abc' }, previous);

    expect(result).toEqual({ rounds: 4, transition: 20, roundRest: 90 });
  });

  it('read valid integers', () => {
    const result = readGroupSettings({ rounds: '5', transition: '0', roundRest: '120' }, previous);

    expect(result).toEqual({ rounds: 5, transition: 0, roundRest: 120 });
  });

  it('reject an empty value', () => {
    const result = readGroupSettings({ rounds: '', transition: '', roundRest: '' }, previous);

    expect(result).toEqual(previous);
  });

  it('reject a decimal value', () => {
    const result = readGroupSettings({ rounds: '2.5', transition: '1,5', roundRest: '10.2' }, previous);

    expect(result).toEqual(previous);
  });

  it('reject a negative rest', () => {
    const result = readGroupSettings({ rounds: '3', transition: '-1', roundRest: '-30' }, previous);

    expect(result).toEqual({ rounds: 3, transition: 15, roundRest: 90 });
  });
});

describe('programmeForSaveShould', () => {
  it('copy the group rounds into the sets of every member', () => {
    const result = programmeForSave([member('A'), member('B')]);

    expect(result.map(e => e.sets)).toEqual([3, 3]);
  });

  it('leave a single exercise unchanged', () => {
    const result = programmeForSave([ex('A', { sets: 5 })]);

    expect(result[0].sets).toBe(5);
  });

  it('not mutate its input', () => {
    const input = [member('A', { ...GROUP, rounds: 6 })];

    programmeForSave(input);

    expect(input[0].sets).toBe(3);
  });
});

describe('memberSummaryShould', () => {
  it('summarize a uniform weight exercise', () => {
    expect(memberSummary(ex('A'))).toBe('10 reps · 60 kg');
  });

  it('use the decimal comma for the weight', () => {
    const result = memberSummary(ex('A', { activities: [{ ...WEIGHT, weight: 62.5 }] }));

    expect(result).toBe('10 reps · 62,5 kg');
  });

  it('list varying reps', () => {
    const series = [10, 10, 8, 8].map(reps => ({ values: [{ reps, weight: 60 }] }));

    expect(memberSummary(ex('A', { series, sets: 4 }))).toBe('10/10/8/8 reps · 60 kg');
  });

  it('list varying weights with the decimal comma', () => {
    const series = [60, 62.5].map(weight => ({ values: [{ reps: 10, weight }] }));

    expect(memberSummary(ex('A', { series, sets: 2 }))).toBe('10 reps · 60/62,5 kg');
  });

  it('summarize a uniform timer', () => {
    expect(memberSummary(ex('A', { activities: [TIMER] }))).toBe('45 s');
  });

  it('list varying timer durations', () => {
    const series = [45, 30].map(duration => ({ values: [{ duration }] }));

    expect(memberSummary(ex('A', { activities: [TIMER], series, sets: 2 }))).toBe('45/30 s');
  });

  it('name a stopwatch exercise', () => {
    expect(memberSummary(ex('A', { activities: [CHRONO] }))).toBe('chrono');
  });
});

describe('programmeListMetaShould', () => {
  it('count the exercises of a fonte programme', () => {
    const result = programmeListMeta({ exercises: [ex('A'), ex('B'), ex('C'), ex('D'), ex('E')] });

    expect(result).toBe('Fonte · 5 exercices');
  });

  it('use the singular for one cardio exercise', () => {
    const result = programmeListMeta({ category: 'cardio', exercises: [ex('A')] });

    expect(result).toBe('Cardio · 1 exercice');
  });

  it('add one super set', () => {
    const result = programmeListMeta({ exercises: [member('A'), member('B'), ex('C')] });

    expect(result).toBe('Fonte · 3 exercices · 1 super set');
  });

  it('pluralize the super sets, whatever their size', () => {
    const other = { ...GROUP, id: 'g2' };
    const exercises = [member('A'), member('B'), member('C', other), member('D', other), member('E', other)];

    expect(programmeListMeta({ exercises })).toBe('Fonte · 5 exercices · 2 super sets');
  });
});

describe('memberMoveDirsShould', () => {
  it('only move the first member down', () => {
    expect(memberMoveDirs(0, 3)).toEqual([1]);
  });

  it('only move the last member up', () => {
    expect(memberMoveDirs(2, 3)).toEqual([-1]);
  });

  it('move a middle member up and down', () => {
    expect(memberMoveDirs(1, 3)).toEqual([-1, 1]);
  });
});

describe('applyGroupSettingsInputShould', () => {
  it('apply the typed settings to every member', () => {
    const out = applyGroupSettingsInput([member('A'), member('B')], 'g1', { rounds: '4', transition: '0', roundRest: '60' });

    expect(out.map(e => e.group)).toEqual([
      { id: 'g1', rounds: 4, transition: 0, roundRest: 60 },
      { id: 'g1', rounds: 4, transition: 0, roundRest: 60 },
    ]);
  });

  it('keep the previous value of an invalid field', () => {
    const out = applyGroupSettingsInput([member('A'), member('B')], 'g1', { rounds: '0', transition: 'x', roundRest: '' });

    expect(out[0].group).toEqual(GROUP);
  });

  it('leave the exercises of other groups unchanged', () => {
    const other = ex('C');
    const out = applyGroupSettingsInput([member('A'), member('B'), other], 'g1', { rounds: '5', transition: '15', roundRest: '90' });

    expect(out[2]).toBe(other);
  });
});

describe('newEditorExerciseShould', () => {
  it('start with three series of one weight activity', () => {
    expect(newEditorExercise()).toEqual({ name: '', sets: 3, activities: [{ type: 'weight' }], comment: '' });
  });

  it('return a fresh object each time', () => {
    expect(newEditorExercise()).not.toBe(newEditorExercise());
  });
});

describe('editorCardFieldsShould', () => {
  it('show the weight values and leave the duration empty', () => {
    const fields = editorCardFields(ex('A', { comment: 'lent' }));

    expect(fields).toEqual({
      name: 'A', sets: 3, comment: 'lent',
      activities: [{ type: 'weight', label: '', name: '', reps: 10, weight: 60, duration: '', rest: '' }],
    });
  });

  it('show the duration of a timer and leave reps and weight empty', () => {
    const [act] = editorCardFields(ex('A', { activities: [{ ...TIMER, rest: 30 }] })).activities;

    expect([act.reps, act.weight, act.duration, act.rest]).toEqual(['', '', 45, 30]);
  });

  it('fall back on the series count when sets is missing', () => {
    expect(editorCardFields({ name: 'A', activities: [WEIGHT], series: [{}, {}] }).sets).toBe(2);
  });

  it('fall back on three series and an empty name', () => {
    expect([editorCardFields({ activities: [WEIGHT] }).sets, editorCardFields({ activities: [WEIGHT] }).name]).toEqual([3, '']);
  });
});
