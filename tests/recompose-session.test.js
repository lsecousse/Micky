import { describe, it, expect } from 'vitest';
import { recomposeSession } from '../lib/recompose-session.js';

describe('recomposeSession', () => {
  const baseRow = {
    id: 'sess-123',
    programme_name: 'Pectoraux',
    programme_id: 'prog-1',
    category: 'fonte',
    date: '2026-05-18',
    started_at: '2026-05-18T08:00:00Z',
    duration: 3600,
    sync: null,
    feedback_ia: null,
  };

  it('maps snake_case columns to camelCase, preserves all fields', () => {
    const result = recomposeSession(baseRow, []);
    expect(result).toEqual({
      id:            'sess-123',
      programmeName: 'Pectoraux',
      programmeId:   'prog-1',
      category:      'fonte',
      date:          '2026-05-18',
      startedAt:     '2026-05-18T08:00:00Z',
      duration:      3600,
      sync:          null,
      feedbackIa:    null,
      exercises:     [],
    });
  });

  it('sorts exercises by ordre asc and recomposes fonte exercise', () => {
    const exoRows = [
      {
        ordre: 1, name: 'Écarté', comment: '',
        activities: [{ type: 'weight' }],
        execution:  { series: [{ values: [{ reps: 12, weight: 10 }], activityStates: {} }] },
      },
      {
        ordre: 0, name: 'Développé', comment: 'lourd',
        activities: [{ type: 'weight' }],
        execution:  { series: [{ values: [{ reps: 8, weight: 80 }], activityStates: { 0: 'done' } }] },
      },
    ];
    const result = recomposeSession(baseRow, exoRows);
    expect(result.exercises).toHaveLength(2);
    expect(result.exercises[0].name).toBe('Développé');
    expect(result.exercises[0].comment).toBe('lourd');
    expect(result.exercises[0].activities).toEqual([{ type: 'weight' }]);
    expect(result.exercises[0].series).toEqual([{ values: [{ reps: 8, weight: 80 }], activityStates: { 0: 'done' } }]);
    expect(result.exercises[1].name).toBe('Écarté');
  });

  it('recomposes cardio exercise with done + state + type', () => {
    const cardioRow = { ...baseRow, category: 'cardio' };
    const exoRows = [
      {
        ordre: 0, name: 'Vélo', comment: '',
        activities: [],
        execution:  { type: 'cardio', duration: 1800, power: 100, done: { duration: 1800, power: 100, km: 12 }, state: 'done' },
      },
    ];
    const result = recomposeSession(cardioRow, exoRows);
    expect(result.exercises[0]).toMatchObject({
      name:    'Vélo',
      type:    'cardio',
      duration: 1800,
      power:    100,
      done:    { duration: 1800, power: 100, km: 12 },
      state:   'done',
    });
  });

  it('handles missing optional fields defensively', () => {
    const exoRows = [{ ordre: 0, name: 'X', comment: null, activities: null, execution: null }];
    const result = recomposeSession(baseRow, exoRows);
    expect(result.exercises[0]).toEqual({
      name: 'X', comment: '', activities: [], series: undefined, prevSeries: null, duration_seconds: null,
    });
  });

  it('preserves per-exercise duration_seconds when present', () => {
    const exoRows = [
      {
        ordre: 0, name: 'Squat', comment: '',
        activities: [{ type: 'weight' }],
        execution:  { series: [] },
        duration_seconds: 720,
      },
    ];
    const result = recomposeSession(baseRow, exoRows);
    expect(result.exercises[0].duration_seconds).toBe(720);
  });
});
