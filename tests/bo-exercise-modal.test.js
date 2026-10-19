import { describe, it, expect } from 'vitest';
import { boModalCardOptions, boModalSavedExercise } from '../lib/bo-exercise-modal.js';
import { mergeEditedExercise } from '../lib/planned-series.js';

// Bench press of a back-office programme: super set member, planned series by series.
function benchPress() {
  return {
    name: 'Développé couché',
    normalized_name: 'developpe couche',
    category: 'fonte',
    sets: 4,
    activities: [{ type: 'weight', label: '', name: 'Pectoraux', rest: 90, tempo: '3-1-1' }],
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

// The modal card for benchPress(), read back without any change.
function unchangedEdit() {
  const row = { type: 'weight', label: '', name: 'Pectoraux', reps: 10, weight: 59, duration: 0, rest: 90 };
  return {
    shown:   { name: 'Développé couché', sets: 4, comment: 'Barre' },
    current: { name: 'Développé couché', sets: 4, comment: 'Barre' },
    rows: [{ sourceIndex: 0, shown: { ...row }, current: { ...row } }],
  };
}

describe('boModalCardOptionsShould', () => {
  it('give the card the programme exercise as its source', () => {
    const exo = benchPress();

    const options = boModalCardOptions(exo);

    expect(options.source).toBe(exo);
  });

  it('show the values of the first planned series', () => {
    const options = boModalCardOptions(benchPress());

    expect(options.activities).toEqual([
      { type: 'weight', label: '', name: 'Pectoraux', reps: 10, weight: 59, duration: '', rest: 90 },
    ]);
  });
});

describe('boModalSavedExerciseShould', () => {
  it('save an exercise validated without change exactly as it was', () => {
    const readBack = mergeEditedExercise(benchPress(), unchangedEdit());

    const saved = boModalSavedExercise(readBack, 'fonte');

    expect(saved).toEqual(benchPress());
  });

  it('write an edited load into every series and keep the super set group', () => {
    const edit = unchangedEdit();
    edit.rows[0].current.weight = 65;

    const saved = boModalSavedExercise(mergeEditedExercise(benchPress(), edit), 'fonte');

    expect(saved.series.map(s => s.values[0])).toEqual([
      { reps: 10, weight: 65 }, { reps: 10, weight: 65 }, { reps: 8, weight: 65 }, { reps: 8, weight: 65 },
    ]);
    expect(saved.group).toEqual({ id: 'g1', rounds: 4, transition: 15, roundRest: 90 });
  });

  it('normalize the name of a renamed exercise', () => {
    const edit = unchangedEdit();
    edit.current.name = 'Développé incliné';

    const saved = boModalSavedExercise(mergeEditedExercise(benchPress(), edit), 'fonte');

    expect(saved.normalized_name).toBe('developpe incline');
  });

  it('file the exercise in the programme category', () => {
    const saved = boModalSavedExercise({ ...benchPress(), category: undefined }, 'fonte');

    expect(saved.category).toBe('fonte');
  });
});
