import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Classic <script> tags share one global scope: a top-level const declared
// twice across lib files makes the browser reject the second script.
// A function declared twice is silently overwritten instead (not detected
// here), hence the specific public names of the super set scripts.
function libScriptsOf(page) {
  const html = readFileSync(page, 'utf8');
  return [...html.matchAll(/<script src="(lib\/[^"]+)"><\/script>/g)].map(m => m[1]);
}

function loadInSharedScope(scripts) {
  const context = vm.createContext({});
  context.window = context;
  scripts.forEach(src => vm.runInContext(readFileSync(src, 'utf8'), context, { filename: src }));
  return context;
}

// Super set g1 = [A, B], 2 rounds, nothing done.
function groupOfTwo() {
  const group  = { id: 'g1', rounds: 2, transition: 15, roundRest: 90 };
  const series = () => [0, 1].map(() => ({ activityStates: {}, values: [{ reps: 10, weight: 40 }] }));
  const ex     = name => ({ name, activities: [{ type: 'weight', rest: 60 }], sets: 2, series: series(), group });
  return [ex('A'), ex('B')];
}

describe('browser lib scripts', () => {
  it('load together in backoffice.html shared global scope', () => {
    const context = loadInSharedScope(libScriptsOf('backoffice.html'));

    expect(typeof context.buildProgrammeExerciseFromCatalog).toBe('function');
    expect(typeof context.escapeHtml).toBe('function');
  });

  it('expose the exercise modal helpers in backoffice.html shared global scope', () => {
    const context = loadInSharedScope(libScriptsOf('backoffice.html'));

    expect(typeof context.boModalCardOptions).toBe('function');
    expect(typeof context.boModalSavedExercise).toBe('function');
  });

  it('estimate a programme duration in backoffice.html shared global scope', () => {
    const context   = loadInSharedScope(libScriptsOf('backoffice.html'));
    const programme = { exercises: [{ name: 'Curl', activities: [{ type: 'weight', rest: 60 }], sets: 4 }] };

    expect(context.computeEstimatedDuration(programme, new Map())).toBe(420);
  });

  it('list each lib script once in index.html', () => {
    const scripts = libScriptsOf('index.html');

    expect(new Set(scripts).size).toBe(scripts.length);
  });

  it('load together in index.html shared global scope', () => {
    const context = loadInSharedScope(libScriptsOf('index.html'));

    expect(typeof context.plannedSeries).toBe('function');
    expect(typeof context.escapeHtml).toBe('function');
  });

  it('expose watch sync guards in index.html shared global scope', () => {
    const context = loadInSharedScope(libScriptsOf('index.html'));

    expect(typeof context.createLocalWriteTracker).toBe('function');
  });

  it('load super set scripts with index.html lib scripts in one shared global scope', () => {
    const context = loadInSharedScope(libScriptsOf('index.html'));

    expect(typeof context.groupExercises).toBe('function');
    expect(typeof context.nextLiveStep).toBe('function');
  });

  it('list each lib script once in backoffice.html', () => {
    const scripts = libScriptsOf('backoffice.html');

    expect(new Set(scripts).size).toBe(scripts.length);
  });

  it('load the super set scripts in backoffice.html shared global scope', () => {
    const context = loadInSharedScope(libScriptsOf('backoffice.html'));
    const names   = ['dropExerciseOnto', 'editorBlocks', 'supersetKindLabel', 'boApplyDrop'];

    expect(names.map(name => typeof context[name])).toEqual(names.map(() => 'function'));
  });

  it('walk a super set with the browser globals', () => {
    const context   = loadInSharedScope(libScriptsOf('index.html'));
    const exercises = groupOfTwo();
    exercises[0].series[0].activityStates[0] = 'done';

    expect(context.nextUndoneInBlock(exercises, 0)).toEqual({ exIdx: 1, sIdx: 0, actIdx: 0 });
  });

  it('expose the live super set wiring in index.html shared global scope', () => {
    const context = loadInSharedScope(libScriptsOf('index.html'));

    expect(typeof context.liveFonteExercise).toBe('function');
  });

  it('read the editor blocks of a programme with the browser globals', () => {
    const context = loadInSharedScope(libScriptsOf('index.html'));

    expect(context.editorBlocks(groupOfTwo()).map(b => b.label)).toEqual(['Super set']);
  });

  it('expose the long press helper in index.html shared global scope', () => {
    const context = loadInSharedScope(libScriptsOf('index.html'));

    expect(typeof context.onLongPress).toBe('function');
  });

  it('ungroup a programme super set with the browser globals', () => {
    const context   = loadInSharedScope(libScriptsOf('index.html'));
    const programme = groupOfTwo();

    const result = context.programmeUngrouping(programme, groupOfTwo(), [0, 1]);

    expect(result.map(e => e.group)).toEqual([undefined, undefined]);
  });

  it('estimate a super set duration with the backoffice.html globals', () => {
    const context = loadInSharedScope(libScriptsOf('backoffice.html'));

    expect(context.computeEstimatedDuration({ exercises: groupOfTwo() }, new Map())).toBe(2 * (45 + 15 + 45 + 90));
  });
});
