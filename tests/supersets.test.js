import { describe, it, expect } from 'vitest';
import {
  exerciseBlocks, defaultRounds, groupOrder, memberLetter, groupExercises,
  ungroup, setGroupSettings, linkNext, moveBlock, moveInGroup,
  removeExercise, dropOnto, isGroupSize,
} from '../lib/supersets.js';

// Weight exercise with `n` planned series of `reps` reps.
function weightEx(name, n, extra = {}) {
  return {
    name,
    activities: [{ type: 'weight', rest: 60 }],
    sets: n,
    series: Array.from({ length: n }, (_, i) => ({ activityStates: {}, values: [{ reps: 10 - i, weight: 40 }] })),
    ...extra,
  };
}

const group = (id, settings = {}) => ({ id, rounds: 3, transition: 15, roundRest: 90, ...settings });

describe('exerciseBlocks', () => {
  it('returns one single block per exercise when nothing is grouped', () => {
    const exercises = [weightEx('A', 3), weightEx('B', 3)];

    const blocks = exerciseBlocks(exercises);

    expect(blocks).toEqual([{ kind: 'single', indices: [0] }, { kind: 'single', indices: [1] }]);
  });

  it('merges contiguous members of the same id into a group block with the first member settings', () => {
    const exercises = [
      weightEx('A', 3), weightEx('B', 3, { group: group('g1', { transition: 20 }) }),
      weightEx('C', 3, { group: group('g1', { transition: 99 }) }),
    ];

    const blocks = exerciseBlocks(exercises);

    expect(blocks[1]).toEqual({ kind: 'group', id: 'g1', indices: [1, 2], rounds: 3, transition: 20, roundRest: 90 });
  });

  it('reads an isolated member as a single exercise', () => {
    const exercises = [weightEx('A', 3, { group: group('g1') }), weightEx('B', 3)];

    const blocks = exerciseBlocks(exercises);

    expect(blocks[0]).toEqual({ kind: 'single', indices: [0] });
  });

  it('splits two non contiguous runs of the same id into distinct blocks', () => {
    const exercises = [
      weightEx('A', 3, { group: group('g1') }), weightEx('B', 3, { group: group('g1') }),
      weightEx('C', 3),
      weightEx('D', 3, { group: group('g1') }), weightEx('E', 3, { group: group('g1') }),
    ];

    const blocks = exerciseBlocks(exercises);

    expect(blocks.map(b => b.indices)).toEqual([[0, 1], [2], [3, 4]]);
  });

  it('returns no block for an empty programme', () => {
    expect(exerciseBlocks([])).toEqual([]);
  });
});

describe('defaultRounds', () => {
  it('returns the largest number of planned series', () => {
    expect(defaultRounds([weightEx('A', 3), weightEx('B', 4)])).toBe(4);
  });

  it('uses the plannedSeries default for an exercise without series nor sets', () => {
    expect(defaultRounds([{ name: 'A', activities: [{ type: 'weight' }] }])).toBe(4);
  });
});

describe('groupOrder', () => {
  it('puts the chosen members, in the chosen order, at the smallest index', () => {
    expect(groupOrder(5, [3, 1])).toEqual([0, 3, 1, 2, 4]);
  });

  it('keeps the identity when members are already contiguous and ordered', () => {
    expect(groupOrder(3, [0, 1])).toEqual([0, 1, 2]);
  });
});

describe('memberLetter', () => {
  it('names the first member A', () => {
    expect(memberLetter(0)).toBe('A');
  });

  it('names the fourth member D', () => {
    expect(memberLetter(3)).toBe('D');
  });
});

describe('groupExercises', () => {
  const programme = () => [weightEx('A', 3), weightEx('B', 3), weightEx('C', 4), weightEx('D', 3)];

  it('places the members at the smallest index in the chosen order', () => {
    const result = groupExercises(programme(), [3, 1]);

    expect(result.map(ex => ex.name)).toEqual(['A', 'D', 'B', 'C']);
  });

  it('gives every member the default settings', () => {
    const result = groupExercises(programme(), [0, 1]);

    expect(result[1].group).toEqual({ id: 'g1', rounds: 3, transition: 15, roundRest: 90 });
  });

  it('lets passed settings override the defaults', () => {
    const result = groupExercises(programme(), [0, 1], { rounds: 5, transition: 0, roundRest: 120 });

    expect(result[0].group).toEqual({ id: 'g1', rounds: 5, transition: 0, roundRest: 120 });
  });

  it('defaults rounds to the largest number of series', () => {
    const result = groupExercises(programme(), [1, 2]);

    expect(result[1].group.rounds).toBe(4);
  });

  it('pads the shorter member series by copying the last one', () => {
    const result = groupExercises(programme(), [1, 2]);

    expect(result[1].series.map(s => s.values[0].reps)).toEqual([10, 9, 8, 8]);
  });

  it('sets the member sets to the rounds', () => {
    const result = groupExercises(programme(), [1, 2]);

    expect(result[1].sets).toBe(4);
  });

  it('takes the smallest free gN id', () => {
    const exercises = [weightEx('A', 3, { group: group('g1') }), weightEx('B', 3, { group: group('g1') }), weightEx('C', 3), weightEx('D', 3)];

    const result = groupExercises(exercises, [2, 3]);

    expect(result[2].group.id).toBe('g2');
  });

  it('does not mutate the input array', () => {
    const exercises = programme();
    const snapshot  = JSON.stringify(exercises);

    groupExercises(exercises, [3, 1]);

    expect(JSON.stringify(exercises)).toBe(snapshot);
  });

  it('refuses a single exercise', () => {
    expect(() => groupExercises(programme(), [0])).toThrow(/2 à 4/);
  });

  it('refuses five exercises', () => {
    const exercises = [...programme(), weightEx('E', 3)];

    expect(() => groupExercises(exercises, [0, 1, 2, 3, 4])).toThrow(/2 à 4/);
  });

  it('refuses a duplicated index', () => {
    expect(() => groupExercises(programme(), [1, 1])).toThrow(/doublon/);
  });

  it('refuses an index out of bounds', () => {
    expect(() => groupExercises(programme(), [0, 4])).toThrow(/introuvable/);
  });

  it('refuses a cardio exercise', () => {
    const exercises = [weightEx('A', 3), { name: 'Rameur', type: 'cardio', duration: 10 }];

    expect(() => groupExercises(exercises, [0, 1])).toThrow(/cardio/);
  });

  it('refuses an exercise already grouped', () => {
    const exercises = [weightEx('A', 3, { group: group('g1') }), weightEx('B', 3, { group: group('g1') }), weightEx('C', 3)];

    expect(() => groupExercises(exercises, [1, 2])).toThrow(/déjà/);
  });
});

// Two groups: g1 = [A, B] (3 rounds), single C, g2 = [D, E] (3 rounds).
const grouped = () => [
  weightEx('A', 3, { group: group('g1') }), weightEx('B', 3, { group: group('g1') }),
  weightEx('C', 2),
  weightEx('D', 3, { group: group('g2') }), weightEx('E', 3, { group: group('g2') }),
];

describe('ungroup', () => {
  it('removes group from the members of that id only', () => {
    const result = ungroup(grouped(), 'g1');

    expect(result.map(ex => ex.group && ex.group.id)).toEqual([undefined, undefined, undefined, 'g2', 'g2']);
  });

  it('removes the group key itself', () => {
    const result = ungroup(grouped(), 'g1');

    expect('group' in result[0]).toBe(false);
  });

  it('keeps the member series', () => {
    const exercises = grouped();

    const result = ungroup(exercises, 'g1');

    expect(result[1].series).toEqual(exercises[1].series);
  });

  it('does not mutate the input array', () => {
    const exercises = grouped();
    const snapshot  = JSON.stringify(exercises);

    ungroup(exercises, 'g1');

    expect(JSON.stringify(exercises)).toBe(snapshot);
  });
});

describe('setGroupSettings', () => {
  it('applies transition and round rest to every member', () => {
    const result = setGroupSettings(grouped(), 'g2', { transition: 0, roundRest: 120 });

    expect(result.slice(3).map(ex => ex.group)).toEqual([
      group('g2', { transition: 0, roundRest: 120 }), group('g2', { transition: 0, roundRest: 120 }),
    ]);
  });

  it('leaves the other groups untouched', () => {
    const exercises = grouped();

    const result = setGroupSettings(exercises, 'g2', { transition: 0 });

    expect(result[0]).toBe(exercises[0]);
  });

  it('resizes the series of every member when rounds change', () => {
    const result = setGroupSettings(grouped(), 'g1', { rounds: 5 });

    expect(result.slice(0, 2).map(ex => ex.series.length)).toEqual([5, 5]);
  });

  it('sets the sets of every member when rounds change', () => {
    const result = setGroupSettings(grouped(), 'g1', { rounds: 2 });

    expect(result.slice(0, 2).map(ex => ex.sets)).toEqual([2, 2]);
  });

  it('does not mutate the input array', () => {
    const exercises = grouped();
    const snapshot  = JSON.stringify(exercises);

    setGroupSettings(exercises, 'g1', { rounds: 5 });

    expect(JSON.stringify(exercises)).toBe(snapshot);
  });
});

describe('linkNext', () => {
  it('groups two single exercises with the default settings', () => {
    const result = linkNext([weightEx('A', 3), weightEx('B', 4)], 0);

    expect(result.map(ex => ex.group)).toEqual([group('g1', { rounds: 4 }), group('g1', { rounds: 4 })]);
  });

  it('adds the next single exercise to the group with the group settings', () => {
    const result = linkNext(grouped(), 1);

    expect(result[2].group).toEqual(group('g1'));
  });

  it('resizes the series of the exercise joining a group', () => {
    const result = linkNext(grouped(), 1);

    expect(result[2].series).toHaveLength(3);
  });

  it('makes a single exercise the first member of the following group', () => {
    const result = linkNext(grouped(), 2);

    expect(result.slice(2).map(ex => ex.group.id)).toEqual(['g2', 'g2', 'g2']);
  });

  it('merges two groups with the settings of the first one', () => {
    const exercises = [
      weightEx('A', 3, { group: group('g1') }), weightEx('B', 3, { group: group('g1') }),
      weightEx('C', 4, { group: group('g2', { rounds: 4, transition: 0 }) }),
      weightEx('D', 4, { group: group('g2', { rounds: 4, transition: 0 }) }),
    ];

    const result = linkNext(exercises, 0);

    expect(result.map(ex => ex.group)).toEqual([group('g1'), group('g1'), group('g1'), group('g1')]);
  });

  it('refuses a group larger than four exercises', () => {
    const exercises = [...grouped().slice(0, 2), weightEx('X', 3, { group: group('g1') }), ...grouped().slice(3)];

    expect(() => linkNext(exercises, 0)).toThrow(/2 à 4/);
  });

  it('refuses to link the last block', () => {
    expect(() => linkNext(grouped(), 4)).toThrow(/suivant/);
  });

  it('refuses to link a cardio exercise', () => {
    const exercises = [{ name: 'Rameur', type: 'cardio' }, weightEx('A', 3)];

    expect(() => linkNext(exercises, 0)).toThrow(/cardio/);
  });

  it('does not mutate the input array', () => {
    const exercises = grouped();
    const snapshot  = JSON.stringify(exercises);

    linkNext(exercises, 1);

    expect(JSON.stringify(exercises)).toBe(snapshot);
  });
});

const names = exercises => exercises.map(ex => ex.name);

describe('moveBlock', () => {
  it('moves a single exercise below a whole group of two', () => {
    const exercises = [weightEx('S', 3), ...grouped().slice(0, 2), weightEx('X', 3)];

    const result = moveBlock(exercises, 0, 1);

    expect(names(result)).toEqual(['A', 'B', 'S', 'X']);
  });

  it('moves a whole group above a single exercise', () => {
    const exercises = [weightEx('S', 3), ...grouped().slice(0, 2)];

    const result = moveBlock(exercises, 2, -1);

    expect(names(result)).toEqual(['A', 'B', 'S']);
  });

  it('does nothing at the edge', () => {
    const result = moveBlock(grouped(), 0, -1);

    expect(names(result)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('does not mutate the input array', () => {
    const exercises = grouped();

    moveBlock(exercises, 2, 1);

    expect(names(exercises)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('moveInGroup', () => {
  it('swaps a member with its neighbour of the same group', () => {
    const result = moveInGroup(grouped(), 1, -1);

    expect(names(result)).toEqual(['B', 'A', 'C', 'D', 'E']);
  });

  it('does nothing at the edge of the group', () => {
    const result = moveInGroup(grouped(), 1, 1);

    expect(names(result)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('does not mutate the input array', () => {
    const exercises = grouped();

    moveInGroup(exercises, 1, -1);

    expect(names(exercises)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

const groupIds = exercises => exercises.map(ex => ex.group && ex.group.id);

describe('removeExercise', () => {
  it('removes the exercise', () => {
    const result = removeExercise(grouped(), 2);

    expect(names(result)).toEqual(['A', 'B', 'D', 'E']);
  });

  it('dissolves a group reduced to one member', () => {
    const result = removeExercise(grouped(), 0);

    expect('group' in result[0]).toBe(false);
  });

  it('keeps a group of three grouped with two members', () => {
    const exercises = [...grouped().slice(0, 2), weightEx('X', 3, { group: group('g1') })];

    const result = removeExercise(exercises, 0);

    expect(groupIds(result)).toEqual(['g1', 'g1']);
  });

  it('does not mutate the input array', () => {
    const exercises = grouped();
    const snapshot  = JSON.stringify(exercises);

    removeExercise(exercises, 0);

    expect(JSON.stringify(exercises)).toBe(snapshot);
  });
});

describe('dropOnto', () => {
  it('groups a single dropped onto a single, the target first', () => {
    const exercises = [weightEx('S', 3), weightEx('T', 3), weightEx('U', 3)];

    const result = dropOnto(exercises, 2, 0);

    expect(names(result)).toEqual(['S', 'U', 'T']);
  });

  it('gives the new pair the default group', () => {
    const exercises = [weightEx('S', 3), weightEx('T', 3), weightEx('U', 3)];

    const result = dropOnto(exercises, 2, 0);

    expect(groupIds(result)).toEqual(['g1', 'g1', undefined]);
  });

  it('adds a single dropped onto a member at the end of the group', () => {
    const result = dropOnto(grouped(), 2, 0);

    expect(groupIds(result)).toEqual(['g1', 'g1', 'g1', 'g2', 'g2']);
  });

  it('gives the joining exercise the target group settings', () => {
    const result = dropOnto(grouped(), 3, 0);

    expect(result[2]).toMatchObject({ name: 'D', group: group('g1') });
  });

  it('dissolves the old group of two of the dropped member', () => {
    const result = dropOnto(grouped(), 3, 2);

    expect('group' in result[4]).toBe(false);
  });

  it('groups the dropped member with the single target', () => {
    const result = dropOnto(grouped(), 3, 2);

    expect(groupIds(result).slice(2, 4)).toEqual(['g2', 'g2']);
  });

  it('refuses a target group that already has four members', () => {
    const full = ['A', 'B', 'C', 'D'].map(n => weightEx(n, 3, { group: group('g1') }));

    expect(() => dropOnto([...full, weightEx('E', 3)], 4, 0)).toThrow(/2 à 4/);
  });

  it('does nothing when dropped onto itself', () => {
    const exercises = grouped();

    const result = dropOnto(exercises, 1, 1);

    expect(result).toEqual(exercises);
  });

  it('does not mutate the input array', () => {
    const exercises = grouped();
    const snapshot  = JSON.stringify(exercises);

    dropOnto(exercises, 3, 0);

    expect(JSON.stringify(exercises)).toBe(snapshot);
  });
});

describe('isGroupSize', () => {
  it('accepts two exercises', () => {
    expect(isGroupSize(2)).toBe(true);
  });

  it('accepts four exercises', () => {
    expect(isGroupSize(4)).toBe(true);
  });

  it('refuses one exercise', () => {
    expect(isGroupSize(1)).toBe(false);
  });

  it('refuses five exercises', () => {
    expect(isGroupSize(5)).toBe(false);
  });
});
