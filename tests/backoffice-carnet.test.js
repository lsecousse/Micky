import { describe, it, expect } from 'vitest';
import { read, functionSource, cssRules } from './source-helpers.js';

const CARNET_HEX = {
  paper: '#EEEDE8', sheet: '#F7F6F2', ink: '#1B1C1F', mut: '#6F6C64',
  rule: '#D6D3C9', hl: '#FFE45C', done: '#1E6B4A', alert: '#A8321F',
};
// Old back-office variable names, kept so the programme editor (lot C) follows the base.
const LEGACY_VARIABLES = {
  bg: 'paper', surface: 'sheet', text: 'ink', muted: 'mut', border: 'rule', danger: 'alert', accent: 'ink',
};
const DIRECTION_A = /#0A0A0A|#F5F4F0|#84CC16|#888888|#2A2A2A|#DC2626|#FACC15|#06B6D4|rgba\(132,\s*204,\s*22/i;
const BASE_SELECTORS = ['.btn-', '.bo-state--', '.bo-fab', '.login'];

// Back-office units repainted in lot 6 (the programme editor belongs to lot C).
const LOT6_FUNCTIONS = [
  'stateLabel', 'renderLogin', 'logout', 'renderDashboard', 'renderClientList', 'selectClient',
  'renderClientDetail', 'renderDetailBody', 'renderProgrammeList', 'showCopyProgrammeModal', 'renderSessionList',
  'renderUserData', 'saveMesures', 'renderBodyTracking', 'boStatsSection', 'boExoMetrics', 'boStatsProgression',
  'showConfirmModal', 'sendInvite', 'showSuccessModal', 'showAddClientModal', 'deleteClient',
  'boColor', 'boSeriesStyle', 'boChartOptions',
];
const LOT6_SELECTORS = [
  '.login', '.bo-sidebar', '.bo-logo', '.bo-client', '.bo-empty', '.bo-main', '.bo-detail', '.bo-state', '.bo-tab',
  '.bo-id-', '.section-title', '.prog-row', '.session-', '.modal', '.stats-', '.btn-', '.error-msg', '.bo-fab',
];
// Programme editor units (lot C), from renderProgrammeEditor to saveProgramme.
const LOTC_FUNCTIONS = [
  'renderProgrammeEditor', 'refreshEstimateHeader', 'promptEstOverride', 'renderCatalogSidebar', 'renderMuscleChips',
  'renderCatalogList', 'boCatalogRowHtml', 'openCatalogForm', 'renderProgrammeZone', 'boProgrammeListHtml',
  'boSingleRowHtml', 'boGroupCardHtml', 'boGroupSettingsHtml', 'boMemberRowHtml', 'boArrowsHtml', 'boEditorAct',
  'boZoneClick', 'boZoneChange', 'boConfirmRemove', 'boStartCatalogDrag', 'boStartBlockDrag', 'boDragOver',
  'boProbeSource', 'boHoverTarget', 'boClearDropMark', 'boShowDropMark', 'boDragLeave', 'boEndDrag', 'boDrop', 'boDropCatalogEntry',
  'openExoModal', 'boPlaceExercise', 'saveProgramme',
];
const LOTC_SELECTORS = ['.pz-', '.cat-', '.bo-exo-modal', '.bo-ed-'];
const A_CLASS = /(?<!\w)a-(ink|inkAlt|paper|muted|border|todo|cyan|acid|racing|blood)\b/;
const LEGACY_NAMES = /var\(--(bg|surface2?|text|muted|border|danger|accent|font|font-display)\)/;
const boFunction = (name) => functionSource('backoffice.js', name);
const evalFunction = (name) => new Function(`${boFunction(name)}; return ${name};`)();

const fontLink = (html) => html.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]+>/g) ?? [];
const rootRule = () => cssRules('backoffice.html', ':root');

describe('backofficeCarnetShould', () => {
  it('load exactly the Carnet font link of index.html', () => {
    expect(fontLink(read('backoffice.html'))).toEqual(fontLink(read('index.html')));
  });

  it('no longer reference Fraunces or DM Sans', () => {
    expect(read('backoffice.html')).not.toMatch(/Fraunces|DM Sans|DM\+Sans/);
  });

  it.each(Object.entries(CARNET_HEX))('define --%s with its exact Carnet hex', (name, hex) => {
    expect(rootRule()).toMatch(new RegExp(`--${name}:\\s*${hex};`, 'i'));
  });

  it.each(Object.entries(LEGACY_VARIABLES))('point the old --%s at a Carnet variable', (name, carnet) => {
    expect(rootRule()).toMatch(new RegExp(`--${name}:\\s*var\\(--${carnet}\\);`));
  });

  it.each(BASE_SELECTORS)('keep Direction A colours out of the %s rules', (selector) => {
    const rules = cssRules('backoffice.html', selector);

    expect(rules).not.toBe('');
    expect(rules).not.toMatch(DIRECTION_A);
  });

  it.each(LOT6_FUNCTIONS)('keep hard-coded colours and old fonts out of %s', (name) => {
    const src = boFunction(name);

    expect(src.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
    expect(src).not.toMatch(/'DM Sans'|'DM Mono'|Fraunces/);
  });

  it.each(LOT6_FUNCTIONS)('use Carnet variables by name in %s', (name) => {
    expect(boFunction(name)).not.toMatch(LEGACY_NAMES);
  });

  it.each(LOT6_SELECTORS)('use Carnet variables by name in the %s rules', (selector) => {
    expect(cssRules('backoffice.html', selector)).not.toMatch(LEGACY_NAMES);
  });

  it.each(LOT6_SELECTORS)('keep %s text at 12 px or more, without capitals eyebrows', (selector) => {
    const rules = cssRules('backoffice.html', selector);

    expect(rules).not.toMatch(/font-size:\s*([0-9]|1[01])px/);
    expect(rules).not.toMatch(/text-transform:\s*uppercase/);
  });

  it.each(LOTC_FUNCTIONS)('keep Direction A classes out of %s', (name) => {
    expect(boFunction(name)).not.toMatch(A_CLASS);
  });

  it.each(LOTC_FUNCTIONS)('keep hard-coded colours out of %s', (name) => {
    expect(boFunction(name).match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
  });

  it.each(LOTC_FUNCTIONS)('use Carnet variables by name in %s', (name) => {
    expect(boFunction(name)).not.toMatch(LEGACY_NAMES);
  });

  it.each(LOTC_FUNCTIONS)('keep %s text at 12 px or more, without capitals eyebrows', (name) => {
    const src = boFunction(name);

    expect(src).not.toMatch(/text-\[(8|9|10|11)px\]/);
    expect(src).not.toMatch(/tracking-eyebrow|uppercase/);
  });

  it.each(LOTC_SELECTORS)('style the editor with %s rules at 12 px or more, without capitals', (selector) => {
    const rules = cssRules('backoffice.html', selector);

    expect(rules).not.toBe('');
    expect(rules).not.toMatch(/font-size:\s*([0-9]|1[01])px/);
    expect(rules).not.toMatch(/text-transform:\s*uppercase/);
    expect(rules).not.toMatch(LEGACY_NAMES);
    expect(rules.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
  });

  it('drop the provisional lot 6 editor rules and the dead editor rules', () => {
    const html = read('backoffice.html');

    expect(html).not.toMatch(/\.bo-editor \.text-a-paper|\.bo-editor \.pz-card|\.bo-editor-title|\.exercise-block/);
  });

  it('drop the inherited exercise card rules', () => {
    expect(cssRules('backoffice.html', '.activity-')).toBe('');
    expect(read('backoffice.html')).not.toMatch(/^\s*\.exercise-card \{/m);
  });

  it('leave the exercise card out of the back-office field rule', () => {
    expect(read('backoffice.html')).toMatch(
      /input\[type=text\]:where\(:not\(\.exercise-card \*\)\),[^{]*textarea:where\(:not\(\.exercise-card \*\)\) \{/);
  });

  it('hide the card arrows and delete button inside the exercise modal', () => {
    expect(cssRules('backoffice.html', '.bo-exo-modal .exercise-move-btn')).toMatch(/display:\s*none/);
    expect(cssRules('backoffice.html', '.bo-exo-modal .exercise-del-btn')).toMatch(/display:\s*none/);
  });

  it('no longer load SortableJS', () => {
    expect(read('backoffice.html')).not.toMatch(/sortable/i);
    expect(read('backoffice.js')).not.toMatch(/\bSortable\b/);
  });

  it.each(['makeProgrammeCard', 'moveExo', 'deleteExoFromProgramme'])('drop the replaced %s', (name) => {
    expect(read('backoffice.js')).not.toMatch(new RegExp(`function ${name}\\(`));
  });

  it('save the programme in its saved shape', () => {
    expect(boFunction('saveProgramme')).toContain('programmeForSave(_progEditorState.exercises)');
  });

  it('beat the forms plugin on input focus and placeholder (ink, mut)', () => {
    const html = read('backoffice.html');

    expect(html).toMatch(/body input:focus, body textarea:focus \{[^}]*border-color: var\(--ink\)[^}]*box-shadow: 0 0 0 1px var\(--ink\)/);
    expect(html).toMatch(/body input::placeholder, body textarea::placeholder \{ color: var\(--mut\); \}/);
  });

  it('read chart colours from the CSS variables', () => {
    expect(boFunction('boColor')).toContain("getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim()");
  });

  it('drop the hard-coded chart palette', () => {
    expect(read('backoffice.js')).not.toMatch(/\bCHART_COLORS\b/);
    expect(boFunction('boStatsProgression')).toContain('boColor(');
    expect(boFunction('renderBodyTracking')).toContain('boColor(');
  });

  it('draw series in ink, done, mut, then the same dashed', () => {
    const boSeriesStyle = evalFunction('boSeriesStyle');

    expect([0, 1, 2, 3, 4, 5, 6].map(boSeriesStyle)).toEqual([
      { token: 'ink', dash: [] }, { token: 'done', dash: [] }, { token: 'mut', dash: [] },
      { token: 'ink', dash: [6, 4] }, { token: 'done', dash: [6, 4] }, { token: 'mut', dash: [6, 4] },
      { token: 'ink', dash: [] },
    ]);
  });

  it('never draw a chart series in the alert colour', () => {
    const charts = ['boSeriesStyle', 'boStatsProgression', 'renderBodyTracking', 'boChartOptions'].map(boFunction).join('\n');

    expect(charts).not.toMatch(/'alert'/);
  });

  it('show a rise in done and a fall in alert', () => {
    expect(cssRules('backoffice.html', '.stats-exo-delta.up')).toContain('var(--done)');
    expect(cssRules('backoffice.html', '.stats-exo-delta.down')).toContain('var(--alert)');
  });

  it('give no status an emoji icon', () => {
    const states = read('backoffice.js').match(/const STATE_META = \{[\s\S]*?\n\};/)[0];

    expect(states).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});
