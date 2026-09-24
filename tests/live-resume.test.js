import { describe, it, expect } from 'vitest';
import { restoreLiveExercises, resolveResumeSession } from '../lib/live-resume.js';

const identity = ex => ex;

describe('restoreLiveExercises', () => {
  it('keeps cardio exercises in cardio shape with their inputs', () => {
    const cardio = {
      name: 'Rameur', type: 'cardio', comment: '', duration: 20, power: 150,
      done: { duration: 12, power: 180, km: 3.2 }, state: 'pending',
    };

    const [restored] = restoreLiveExercises([cardio], 'cardio', identity);

    expect(restored).toEqual({
      name: 'Rameur', type: 'cardio', comment: '', duration: 20, power: 150,
      done: { duration: 12, power: 180, km: 3.2 }, prev: null, state: 'pending',
    });
  });

  it('defaults cardio inputs to planned values when done is missing', () => {
    const cardio = { name: 'Vélo', type: 'cardio', duration: 30, power: 200, done: null, state: 'pending' };

    const [restored] = restoreLiveExercises([cardio], 'cardio', identity);

    expect(restored.done).toEqual({ duration: 30, power: 200, km: 0 });
  });

  it('treats exercises of a cardio session as cardio even without type', () => {
    const cardio = { name: 'Tapis', duration: 10 };

    const [restored] = restoreLiveExercises([cardio], 'cardio', identity);

    expect(restored.type).toBe('cardio');
  });

  it('never passes cardio exercises through migrate', () => {
    const migrate = () => { throw new Error('migrate called'); };

    const restore = () => restoreLiveExercises([{ name: 'Rameur', type: 'cardio' }], 'cardio', migrate);

    expect(restore).not.toThrow();
  });

  it('rebuilds fonte series from the migrated exercise', () => {
    const migrated = {
      name: 'Squat', comment: 'lent',
      activities: [{ type: 'weight', reps: 10, weight: 80 }],
      series: [
        { done: true, values: [{ reps: 10, weight: 80 }] },
        { state: 'pending', activityStates: { 0: 'pending' }, values: [{ reps: 8, weight: 85 }] },
      ],
    };

    const [restored] = restoreLiveExercises([{}], 'fonte', () => migrated);

    expect(restored).toEqual({
      name: 'Squat', comment: 'lent',
      activities: [{ type: 'weight', reps: 10, weight: 80 }],
      series: [
        { state: 'done', activityStates: {}, values: [{ reps: 10, weight: 80 }] },
        { state: 'pending', activityStates: { 0: 'pending' }, values: [{ reps: 8, weight: 85 }] },
      ],
    });
  });
});

describe('resolveResumeSession', () => {
  const unfinished = { id: 'abc', duration: 0 };
  const finished   = { id: 'abc', duration: 1800 };

  it('resumes the server session when there is no local snapshot', () => {
    const result = resolveResumeSession(unfinished, null);

    expect(result).toEqual({ session: unfinished, repush: null });
  });

  it('resumes and repushes an unfinished local snapshot when the server has none', () => {
    const result = resolveResumeSession(null, unfinished);

    expect(result).toEqual({ session: unfinished, repush: unfinished });
  });

  it('prefers the local snapshot of the same session', () => {
    const server = { id: 'abc', duration: 0, exercises: [] };

    const result = resolveResumeSession(server, unfinished);

    expect(result).toEqual({ session: unfinished, repush: unfinished });
  });

  it('keeps the server session when the local snapshot belongs to another session', () => {
    const server = { id: 'xyz', duration: 0 };

    const result = resolveResumeSession(server, unfinished);

    expect(result).toEqual({ session: server, repush: null });
  });

  it('repushes a session finished offline without resuming it', () => {
    const server = { id: 'abc', duration: 0 };

    const result = resolveResumeSession(server, finished);

    expect(result).toEqual({ session: null, repush: finished });
  });

  it('repushes a session finished offline while resuming another server session', () => {
    const server = { id: 'xyz', duration: 0 };

    const result = resolveResumeSession(server, finished);

    expect(result).toEqual({ session: server, repush: finished });
  });
});
