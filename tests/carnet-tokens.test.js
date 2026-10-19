import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { read, functionSource, cssRules } from './source-helpers.js';

const require = createRequire(import.meta.url);

const SCANNED_FILES = ['app.js', 'index.html', 'exercise-editor.js', 'backoffice.html', 'backoffice.js', 'set-password.html'];
const A_TOKENS = 'ink|inkAlt|paper|muted|border|todo|cyan|acid|racing|blood';
// Old unprefixed A variable names that Carnet does not reuse (Carnet owns --ink and --paper).
const A_ONLY_TOKENS = 'inkAlt|muted|border|todo|cyan|acid|racing|blood';
const A_HEX = ['#0A0A0A', '#141414', '#F5F4F0', '#888888', '#2A2A2A', '#444444', '#06B6D4', '#84CC16', '#FACC15', '#DC2626'];

// Lists consumed by later tasks: each migrated unit must be free of Direction A leftovers.
const MIGRATED_FUNCTIONS = [
  'showConfirm', 'showAlert', 'showToast',
  'renderHome', 'renderHomeSection', 'buildUserDropdown', 'renderSeanceScreen', 'renderProgrammeSelection',
  'renderLiveSession', 'renderExerciseList', 'renderExoMasthead', 'renderSeriesFocus', 'renderRestSplit',
  'renderExerciseDetail', 'openEditModalForActivity', 'openLiveEditModal', 'updateCountdownUI', 'finishSession',
  'showPostSessionFeedback',
  'renderLiveCardio', 'openChronoOverlay', 'startChrono', 'stopChronoOverlay', 'openMinuterieOverlay',
  'stopMinuterieOverlay',
  'seriesBandHtml', 'seriesLogRow', 'seriesLogHtml', 'createDock', 'exerciseViewWrap', 'previousValueText',
  'nextStepHint', 'activityLabel', 'formatKg',
  'focusEditButtonHtml', 'weightSuggestionSlot', 'loadWeightSuggestion', 'dockExosButtonHtml', 'focusDockHtml',
  'startRestDockSync', 'supersetHeadHtml', 'supersetSummaryRowHtml', 'supersetLogRowHtml', 'supersetLogHtml',
  'renderSupersetFocus', 'pauseTimerHtml', 'pauseStepButtonHtml', 'supersetPauseDockHtml', 'renderSupersetPause',
  'singleExerciseCard', 'memberLoadText', 'supersetMemberRowHtml', 'supersetListEntry', 'groupOpenButton',
  'openGroupSheet', 'groupPickPlanText', 'groupPickRowHtml', 'groupOffRowHtml', 'groupPickListHtml', 'groupCounterHtml',
  'groupRoundsHint', 'groupKeepRowHtml', 'groupSheetBodyHtml', 'renderGroupSheet',
  'checkboxRowHtml', 'openUngroupDialog', 'renderUngroupDialog',
  'renderHistory', 'resumeSessionFromHistory', 'openModal', 'closeModal', 'formatFeedback', 'feedbackCard',
  'openBodyAnalysisPopupLoading', 'fillBodyAnalysisPopup',
  'renderStats', 'statsSection', 'shortDayMonth', 'exoMetrics', 'buildStatsProgression', 'carnetColor',
  'renderMealPresetButtons', 'renderAlimentation', 'showFoodPhotoModal', 'openAddMealModal',
  'openMealPresetEditModal', 'openEveningAdviceModal', 'openAskQuestionModal',
  'fatCategory', 'corpsTrend', 'renderCorps', 'closeBodyAnalysisPopup', 'drawCorpsChart',
  'makeField', 'makeSegment', 'makeOptionList', 'accountMasthead', 'renderProfil', 'renderClaudeApi', 'renderLogin',
];
const MIGRATED_HTML_BLOCKS = ['DIALOG CUSTOM', 'TOAST', 'COUNTDOWN STICKY TOP BAR', 'HOME', 'À LA SALLE', 'MODAL ÉDITION ACTIVITÉ (live)',
  'TIROIR GROUPER (live)', 'CHRONO FULLSCREEN', 'MINUTERIE FULLSCREEN', 'DIALOG DÉGROUPER', 'HISTORIQUE', 'MODAL DÉTAIL SÉANCE',
  'STATS', 'ALIMENTATION', 'MODAL AJOUTER REPAS', 'MODAL PRESET PETIT-DEJ', 'COMPOSITION CORPORELLE',
  'PROFIL', 'CLÉ API CLAUDE', 'LOGIN', 'LOADING SCREEN'];
const MIGRATED_CSS_SELECTORS = ['#toast', '.dialog', '#countdown', '.live-edit', '.feedback-ia', '#chrono', '#minuterie', '.modal',
  '.series-not-done', '#loading-screen'];

// Text between `<!-- MARKER` and the next comment of the same indentation.
function htmlBlock(file, marker) {
  const src = read(file);
  const open = new RegExp(`^([ \\t]*)<!-- ${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm').exec(src);
  if (!open) throw new Error(`block ${marker} not found in ${file}`);
  const from = open.index;
  const next = new RegExp(`^${open[1]}<!--`, 'm');
  const rest = src.slice(from + open[0].length);
  const m = next.exec(rest);
  return m ? src.slice(from, from + open[0].length + m.index) : src.slice(from);
}

function directionALeftovers(src) {
  const patterns = [
    new RegExp(`(?<![\\w])a-(${A_TOKENS})(?![\\w])`, 'g'),
    new RegExp(A_HEX.join('|'), 'gi'),
    new RegExp(`var\\(--(${A_ONLY_TOKENS})\\)`, 'g'),
    /text-\[(8|9|10|11)px\]/g,
    /tracking-eyebrow/g,
  ];
  return patterns.flatMap((re) => src.match(re) ?? []);
}

describe('carnetTokensShould', () => {
  it('Direction A tokens are only exposed under the a- prefix', () => {
    const colors = require('../tailwind.config.js').theme.extend.colors;

    expect(colors['a-ink']).toBe('#0A0A0A');
    expect(colors['a-inkAlt']).toBe('#141414');
    expect(colors['a-paper']).toBe('#F5F4F0');
    expect(colors['a-muted']).toBe('#888888');
    expect(colors['a-border']).toBe('#2A2A2A');
    expect(colors['a-todo']).toBe('#444444');
    expect(colors['a-cyan']).toBe('#06B6D4');
    expect(colors['a-acid']).toBe('#84CC16');
    expect(colors['a-racing']).toBe('#FACC15');
    expect(colors['a-blood']).toBe('#DC2626');
    for (const key of ['inkAlt', 'muted', 'border', 'todo', 'cyan', 'acid', 'racing', 'blood']) {
      expect(colors).not.toHaveProperty(key);
    }
  });

  it('no unprefixed Direction A colour class remains', () => {
    const re = /(bg|text|border(-[lrtbxy])?|ring|fill|stroke|from|via|to|accent|decoration|divide|outline|placeholder|caret|shadow)-(inkAlt|muted|border|todo|cyan|acid|racing|blood)(?![\w-])/g;

    const found = SCANNED_FILES.flatMap((f) => (read(f).match(re) ?? []).map((c) => `${f}: ${c}`));

    expect(found).toEqual([]);
  });

  it('Direction A CSS variables are only defined under the a- prefix', () => {
    const css = read('src/input.css');

    expect(css).toMatch(/--a-ink:\s*#0A0A0A/);
    expect(css).not.toMatch(new RegExp(`--(${A_ONLY_TOKENS}):`));
    expect(css).not.toMatch(/--(ink|paper):\s*#(0A0A0A|F5F4F0)/i);
  });

  it('flags prefixed Direction A classes but not Carnet variables', () => {
    const found = directionALeftovers('<p class="!bg-a-ink text-a-paper" style="color:var(--ink);background:var(--paper)">');

    expect(found).toEqual(['a-ink', 'a-paper']);
  });

  it('exposes Carnet tokens with exact hex', () => {
    const colors = require('../tailwind.config.js').theme.extend.colors;
    const css = read('src/input.css');
    const carnet = {
      paper: '#EEEDE8', sheet: '#F7F6F2', ink: '#1B1C1F', mut: '#6F6C64',
      rule: '#D6D3C9', hl: '#FFE45C', done: '#1E6B4A', alert: '#A8321F',
    };

    for (const [name, hex] of Object.entries(carnet)) {
      expect(colors[name]).toBe(hex);
      expect(css).toMatch(new RegExp(`--${name}:\\s*${hex};`));
    }
  });

  it('uses Newsreader, IBM Plex Sans and IBM Plex Mono', () => {
    const fonts = require('../tailwind.config.js').theme.extend.fontFamily;

    expect([fonts.display[0], fonts.sans[0], fonts.mono[0]])
      .toEqual(['"Newsreader"', '"IBM Plex Sans"', '"IBM Plex Mono"']);
  });

  it('rounds corners at 6 px', () => {
    const radius = require('../tailwind.config.js').theme.extend.borderRadius;

    expect(radius.DEFAULT).toBe('6px');
  });

  it('loads Carnet fonts and a light status bar', () => {
    const html = read('index.html');
    const fontLink = html.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]+>/)[0];

    expect(fontLink).toContain('Newsreader');
    expect(fontLink).toContain('IBM+Plex+Sans');
    expect(fontLink).toContain('IBM+Plex+Mono');
    expect(fontLink).not.toMatch(/Fraunces|DM\+Sans/);
    expect(html).toContain('<meta name="theme-color" content="#EEEDE8" />');
    expect(html).toMatch(/<meta name="apple-mobile-web-app-status-bar-style" content="default"/);
  });

  it('back-office loads the Carnet fonts', () => {
    const html = read('backoffice.html');

    expect(html).toContain('Newsreader');
    expect(html).toContain('IBM+Plex+Sans');
    expect(html).toContain('IBM+Plex+Mono');
  });

  it('set-password page uses Carnet colours and fonts', () => {
    const page = read('set-password.html');
    const appFontLink = read('index.html').match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]+>/)[0];

    expect(page).toContain('#EEEDE8');
    expect(page).toContain('#1B1C1F');
    expect(page).toContain('#A8321F');
    expect(page).toContain(appFontLink);
    expect(directionALeftovers(page)).toEqual([]);
    expect(page).not.toMatch(/DM Mono|#9A7A30|#0f0f0f/i);
  });

  it('detail modal has no hard-coded colour', () => {
    expect(functionSource('app.js', 'openModal').match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
  });

  it('chart colours come from Carnet CSS variables', () => {
    const chart = functionSource('app.js', 'buildStatsProgression');

    expect(chart.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
    expect(chart).not.toContain("'DM Sans'");
    expect(read('app.js')).not.toMatch(/\bCHART_COLORS\b/);
  });

  it('chart series never use the alert colour', () => {
    const chart = functionSource('app.js', 'buildStatsProgression');

    expect(chart).not.toMatch(/token:\s*'alert'|carnetColor\('alert'\)/);
  });

  it('shortDayMonth turns an ISO date into JJ/MM', () => {
    const src = functionSource('app.js', 'shortDayMonth');
    const shortDayMonth = new Function(`${src}; return shortDayMonth;`)();

    expect(shortDayMonth('2026-08-18')).toBe('18/08');
  });

  it('both charts label their date axis with shortDayMonth', () => {
    expect(functionSource('app.js', 'buildStatsProgression')).toContain('shortDayMonth(d)');
    expect(functionSource('app.js', 'drawCorpsChart')).toContain('shortDayMonth(m.date)');
    expect(read('app.js')).not.toContain("d.slice(5).replace('-', '/')");
  });

  it('stats and history cards glue units with a narrow no-break space', () => {
    expect(functionSource('app.js', 'buildStatsProgression')).toContain('${fmt(last)}\\u202F${unit}');
    expect(functionSource('app.js', 'buildStatsProgression')).toContain('}${Math.round(delta)}\\u202F%');
    expect(functionSource('app.js', 'renderHistory')).toContain("toLocaleString('fr-FR')}\\u202Fkg");
  });

  it('history session title is not a heading inside the button', () => {
    expect(functionSource('app.js', 'renderHistory')).not.toContain('<h3');
  });

  it('the modal backdrop has no click handler (sheets are full screen)', () => {
    expect(read('app.js')).not.toContain("document.getElementById('modal').addEventListener('click'");
  });

  it('carnetColor reads a Carnet CSS variable', () => {
    expect(functionSource('app.js', 'carnetColor'))
      .toContain("getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim()");
  });

  it('alimentation modals have no inline colour', () => {
    const found = ['openEveningAdviceModal', 'openAskQuestionModal', 'openAddMealModal', 'openMealPresetEditModal']
      .flatMap((name) => (functionSource('app.js', name).match(/#[0-9a-fA-F]{3,6}\b|var\(--bg\)|var\(--a-|var\(--text/g) ?? [])
        .map((hit) => `${name}: ${hit}`));

    expect(found).toEqual([]);
  });

  it('account screens have no inline colour', () => {
    const found = ['makeField', 'makeSegment', 'makeOptionList', 'accountMasthead', 'renderProfil', 'renderClaudeApi', 'renderLogin']
      .flatMap((name) => (functionSource('app.js', name).match(/#[0-9a-fA-F]{3,6}\b|var\(--bg\)|var\(--text|var\(--a-/g) ?? [])
        .map((hit) => `${name}: ${hit}`));

    expect(found).toEqual([]);
  });

  it('corps chart colours come from Carnet CSS variables', () => {
    const chart = functionSource('app.js', 'drawCorpsChart');

    expect(chart.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
    expect(chart).not.toContain('DM Sans');
    expect(chart).toContain('carnetColor(');
  });

  it('corps screen has no inline colour', () => {
    const found = ['fatCategory', 'renderCorps']
      .flatMap((name) => (functionSource('app.js', name).match(/#[0-9a-fA-F]{3,6}\b|style\.color|color:|var\(--text/g) ?? [])
        .map((hit) => `${name}: ${hit}`));

    expect(found).toEqual([]);
  });

  it('corps in-page analysis looks like the feedback card', () => {
    expect(functionSource('app.js', 'renderCorps')).toContain('feedbackCard(');
  });

  it('dead corps analysis rules are gone', () => {
    expect(read('style.css')).not.toContain('.corps-analysis');
  });

  it('corps chart is sized for the device pixel ratio', () => {
    const chart = functionSource('app.js', 'drawCorpsChart');

    expect(chart).toContain('devicePixelRatio');
    expect(chart).toContain('ctx.scale(');
  });

  it('advice thread escapes the user text', () => {
    expect(functionSource('app.js', 'openEveningAdviceModal')).toContain("appendBubble('user', escapeHtml(txt))");
  });

  it.each(['openModal', 'showPostSessionFeedback', 'openBodyAnalysisPopupLoading', 'showFoodPhotoModal',
    'openEveningAdviceModal', 'openAskQuestionModal'])('%s opens the shared sheet scrolled to the top', (name) => {
    expect(functionSource('app.js', name)).toContain('showModalSheet()');
  });

  it('showModalSheet resets the sheet scroll before showing it', () => {
    expect(functionSource('app.js', 'showModalSheet')).toContain('scrollTop = 0');
  });

  it('measurement units keep a narrow no-break space', () => {
    expect(functionSource('app.js', 'renderCorps')).not.toMatch(/<\/span>\$\{unit\}|\)\}% —/);
  });

  it('preset settings glyph is forced to text presentation', () => {
    expect(functionSource('app.js', 'renderMealPresetButtons')).not.toContain("textContent = '⚙'");
  });

  it('legacy .btn-* rules are gone', () => {
    const legacy = /\.btn-(primary|secondary|danger|ghost)\b/g;

    expect([
      ...(read('style.css').match(legacy) ?? []),
      ...(read('app.js').match(/\bbtn-(primary|secondary|danger|ghost|disabled)\b/g) ?? []),
    ]).toEqual([]);
  });

  it('CLAUDE.md no longer describes the dark orange PWA', () => {
    const doc = read('.claude/CLAUDE.md');
    const stale = ['#FF6B00', '#0f0f0f', 'Gym Tracker', 'black-translucent', 'Thème sombre', 'Onglet "Nouvelle séance"', 'Export JSON'].filter((s) => doc.includes(s));
    expect(stale).toEqual([]);
  });

  it.each(MIGRATED_FUNCTIONS)('migrated function %s has no Direction A leftover', (name) => {
    expect(directionALeftovers(functionSource('app.js', name))).toEqual([]);
  });

  it.each(MIGRATED_HTML_BLOCKS)('migrated HTML block %s has no Direction A leftover', (marker) => {
    expect(directionALeftovers(htmlBlock('index.html', marker))).toEqual([]);
  });

  it.each(MIGRATED_CSS_SELECTORS)('migrated CSS selector %s has no Direction A leftover', (selector) => {
    expect(directionALeftovers(cssRules('style.css', selector))).toEqual([]);
  });
});
