import { describe, it, expect } from 'vitest';
import { mergeEditedExercise, mergeEditedFields } from '../lib/planned-series.js';

// Bench press 4 × 10 at 59 kg, planned series by series, in a super set.
function benchPress() {
  return {
    name: 'Développé couché',
    sets: 4,
    activities: [{ type: 'weight', name: 'Pectoraux', reps: 10, weight: 59, rest: 90 }],
    series: [
      { activityStates: {}, values: [{ reps: 10, weight: 59 }] },
      { activityStates: {}, values: [{ reps: 10, weight: 59 }] },
      { activityStates: {}, values: [{ reps: 8, weight: 61 }] },
      { activityStates: {}, values: [{ reps: 8, weight: 61 }] },
    ],
    group: { id: 'g1', rounds: 4, transition: 15, roundRest: 90 },
    comment: 'Barre',
  };
}

// What the card shows for benchPress(), as read back from its inputs.
function shownBenchPress() {
  return {
    shown:   { name: 'Développé couché', sets: 4, comment: 'Barre' },
    current: { name: 'Développé couché', sets: 4, comment: 'Barre' },
    rows: [{
      sourceIndex: 0,
      shown:   { type: 'weight', label: '', name: 'Pectoraux', reps: 10, weight: 59, duration: 0, rest: 90 },
      current: { type: 'weight', label: '', name: 'Pectoraux', reps: 10, weight: 59, duration: 0, rest: 90 },
    }],
  };
}

describe('mergeEditedExerciseShould', () => {
  it('return the source unchanged when nothing was edited', () => {
    const source = benchPress();

    const result = mergeEditedExercise(source, shownBenchPress());

    expect(result).toEqual(benchPress());
  });

  it('keep the super set group of the source', () => {
    const edit = shownBenchPress();
    edit.current.comment = 'Barre, prise large';

    const result = mergeEditedExercise(benchPress(), edit);

    expect(result.group).toEqual({ id: 'g1', rounds: 4, transition: 15, roundRest: 90 });
  });

  it('apply an edited exercise field', () => {
    const edit = shownBenchPress();
    edit.current.comment = 'Barre, prise large';

    const result = mergeEditedExercise(benchPress(), edit);

    expect(result.comment).toBe('Barre, prise large');
  });

  it('keep the per-series values the card does not show', () => {
    const edit = shownBenchPress();
    edit.current.comment = 'Barre, prise large';

    const result = mergeEditedExercise(benchPress(), edit);

    expect(result.series.map(s => s.values[0])).toEqual([
      { reps: 10, weight: 59 }, { reps: 10, weight: 59 }, { reps: 8, weight: 61 }, { reps: 8, weight: 61 },
    ]);
  });

  it('write an edited load into every series of that activity', () => {
    const edit = shownBenchPress();
    edit.rows[0].current.weight = 60;

    const result = mergeEditedExercise(benchPress(), edit);

    expect(result.series.map(s => s.values[0])).toEqual([
      { reps: 10, weight: 60 }, { reps: 10, weight: 60 }, { reps: 8, weight: 60 }, { reps: 8, weight: 60 },
    ]);
  });

  it('keep the unknown fields of an activity', () => {
    const source = benchPress();
    source.activities[0].tempo = '3-1-1';
    const edit = shownBenchPress();
    edit.rows[0].current.rest = 120;

    const result = mergeEditedExercise(source, edit);

    expect(result.activities).toEqual([
      { type: 'weight', name: 'Pectoraux', reps: 10, weight: 59, rest: 120, tempo: '3-1-1' },
    ]);
  });

  it('give an added activity its own column in every series', () => {
    const edit = shownBenchPress();
    edit.rows.push({
      sourceIndex: null,
      shown: null,
      current: { type: 'countdown', label: 'Gainage', name: 'Abdos', reps: 0, weight: 0, duration: 30, rest: 0 },
    });

    const result = mergeEditedExercise(benchPress(), edit);

    expect(result.series.map(s => s.values[1])).toEqual([
      { duration: 30 }, { duration: 30 }, { duration: 30 }, { duration: 30 },
    ]);
  });

  it('drop the column of a removed activity', () => {
    const source = benchPress();
    source.activities.unshift({ type: 'countdown', name: 'Gainage', duration: 30, rest: 0 });
    source.series.forEach(s => s.values.unshift({ duration: 30 }));
    const edit = shownBenchPress();
    edit.rows[0].sourceIndex = 1;

    const result = mergeEditedExercise(source, edit);

    expect(result.series.map(s => s.values)).toEqual(benchPress().series.map(s => s.values));
  });

  it('build the exercise from the card alone when it has no source', () => {
    const edit = shownBenchPress();
    edit.rows[0].sourceIndex = null;

    const result = mergeEditedExercise(null, edit);

    expect(result).toEqual({
      name: 'Développé couché', sets: 4, comment: 'Barre',
      activities: [{ type: 'weight', label: '', name: 'Pectoraux', reps: 10, weight: 59, duration: 0, rest: 90 }],
    });
  });
});

describe('mergeEditedFieldsShould', () => {
  it('keep the source fields and apply only the changed ones', () => {
    const source = { name: 'Vélo', type: 'cardio', duration: 20, power: 150, comment: '', zone: 2 };
    const shown  = { name: 'Vélo', type: 'cardio', duration: 20, power: 150, comment: '' };
    const current = { ...shown, duration: 25 };

    const result = mergeEditedFields(source, shown, current);

    expect(result).toEqual({ name: 'Vélo', type: 'cardio', duration: 25, power: 150, comment: '', zone: 2 });
  });
});
