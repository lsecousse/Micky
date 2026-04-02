/* ═══════════════════════════════════════════════════════
   VERSION
═══════════════════════════════════════════════════════ */
const APP_VERSION = '2026.avril.02';
document.querySelectorAll('.app-version').forEach(el => el.textContent = APP_VERSION);

/* ═══════════════════════════════════════════════════════
   NUMERIC INPUTS — vider au focus, restaurer si vide
═══════════════════════════════════════════════════════ */
document.addEventListener('focusin', e => {
  if (e.target.type === 'number') {
    e.target.dataset.prev = e.target.value;
    e.target.value = '';
  }
});
document.addEventListener('focusout', e => {
  if (e.target.type === 'number' && e.target.value === '') {
    e.target.value = e.target.dataset.prev ?? '';
  }
});

/* ═══════════════════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════════════════ */
let currentUser    = null;
let currentProfile = null;

async function loadSessions()   { return loadSessionsDB();   }
async function loadProgrammes() { return loadProgrammesDB(); }

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/* migrateExercise, makeExerciseCard, makeActivityRow, readExerciseCard → exercise-editor.js */

function totalVolume(exercises) {
  return exercises.reduce((sum, ex) => {
    const e = migrateExercise(ex);
    return sum + e.series
      .filter(s => s.done !== false)
      .reduce((sv, set) => sv + e.activities.reduce((sa, act, i) => {
        if (act.type !== 'weight') return sa;
        const v = set.values?.[i] || {};
        return sa + (v.reps || 0) * (v.weight || 0);
      }, 0), 0);
  }, 0);
}

function plannedVolume(exercises) {
  return exercises.reduce((sum, ex) => {
    const e = migrateExercise(ex);
    const actVol = e.activities.reduce((sa, act) =>
      act.type === 'weight' ? sa + (act.reps || 0) * (act.weight || 0) : sa, 0);
    return sum + e.series.length * actVol;
  }, 0);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatSeconds(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h${String(rem).padStart(2, '0')}` : `${h}h`;
}

function stateIcon(state) {
  if (state === 'done') return '✓';
  if (state === 'active') return '▶';
  return '○';
}

/* ═══════════════════════════════════════════════════════
   DIALOGS
═══════════════════════════════════════════════════════ */
function showConfirm(msg, onOk) {
  const dialog = document.getElementById('dialog');
  document.getElementById('dialog-msg').textContent = msg;
  document.getElementById('dialog-cancel').classList.remove('hidden');
  dialog.classList.remove('hidden');

  const ok = document.getElementById('dialog-ok');
  const cancel = document.getElementById('dialog-cancel');

  const cleanup = () => {
    dialog.classList.add('hidden');
    ok.removeEventListener('click', handleOk);
    cancel.removeEventListener('click', cleanup);
  };
  const handleOk = () => { cleanup(); onOk(); };

  ok.addEventListener('click', handleOk);
  cancel.addEventListener('click', cleanup);
}

function showAlert(msg) {
  const dialog = document.getElementById('dialog');
  document.getElementById('dialog-msg').textContent = msg;
  document.getElementById('dialog-cancel').classList.add('hidden');
  dialog.classList.remove('hidden');

  const ok = document.getElementById('dialog-ok');
  const cleanup = () => {
    dialog.classList.add('hidden');
    document.getElementById('dialog-cancel').classList.remove('hidden');
    ok.removeEventListener('click', cleanup);
  };
  ok.addEventListener('click', cleanup);
}

/* ═══════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════ */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s =>
    s.classList.toggle('active', s.id === `screen-${name}`)
  );
  if (name === 'home')    renderHome();
  if (name === 'seance')  renderSeanceScreen();
  if (name === 'history') renderHistory();
  if (name === 'stats')   renderStats();
  if (name === 'params')  renderParams();
  if (name === 'login')   renderLogin();
}

document.getElementById('go-history').addEventListener('click', () => showScreen('history'));
document.getElementById('go-stats').addEventListener('click',   () => showScreen('stats'));
document.getElementById('go-params').addEventListener('click',  () => showScreen('params'));
document.getElementById('back-history').addEventListener('click', () => showScreen('home'));
document.getElementById('back-stats').addEventListener('click',   () => showScreen('home'));
document.getElementById('back-params').addEventListener('click',  () => showScreen('home'));
document.getElementById('back-seance').addEventListener('click', () => {
  if (liveSession) {
    showConfirm('Abandonner la séance en cours ?', () => {
      stopAllChronos();
      liveSession = null;
      stopCountdown();
      showScreen('home');
    });
  } else {
    showScreen('home');
  }
});

/* ═══════════════════════════════════════════════════════
   HOME
═══════════════════════════════════════════════════════ */

async function renderHome() {
  const main = document.getElementById('home-main');
  main.innerHTML = '';

  const prenom = currentProfile?.prenom;
  if (prenom) {
    const greeting = document.createElement('p');
    greeting.className = 'home-greeting';
    greeting.textContent = `Bonjour ${prenom} 👋`;
    main.appendChild(greeting);
  }

  const programmes = await loadProgrammes();

  if (!programmes.length) {
    const msg = document.createElement('p');
    msg.className = 'home-empty';
    msg.textContent = 'Aucun programme.\nCrées-en un dans Paramètres ⚙';
    main.appendChild(msg);
    return;
  }

  if (liveSession) {
    const card = document.createElement('div');
    card.className = 'home-resume-card';
    card.innerHTML = `
      <span class="home-resume-label">Séance en cours</span>
      <span class="home-resume-name">${liveSession.programmeName}</span>
      <span class="home-resume-cta">Tap pour reprendre →</span>
    `;
    card.addEventListener('click', () => showScreen('seance'));
    main.appendChild(card);
    return;
  }

  const { ordered, lastSession } = await cyclicProgrammes(programmes);
  const next = ordered[0];
  const seriesCount = next.exercises.reduce((s, e) => s + (e.count ?? e.series?.length ?? 0), 0);
  const muscles = [...new Set(next.exercises.flatMap(e => migrateExercise(e).activities.map(a => a.name).filter(Boolean)))];

  const card = document.createElement('div');
  card.className = 'home-next-card';
  card.innerHTML = `
    <span class="home-next-label">Prochain entraînement</span>
    <span class="home-next-name">${next.name}</span>
    ${muscles.length ? `<span class="home-next-muscles">${muscles.join(' · ')}</span>` : ''}
    <span class="home-next-meta">${next.exercises.length} exercice${next.exercises.length > 1 ? 's' : ''} · ${seriesCount} séries</span>
    <button class="home-next-cta">C'est parti →</button>
  `;
  card.querySelector('.home-next-cta').addEventListener('click', () => {
    startSession(next);
    showScreen('seance');
  });
  main.appendChild(card);

  if (programmes.length > 1) {
    const other = document.createElement('button');
    other.className = 'home-other-btn';
    other.textContent = 'Choisir un autre programme';
    other.addEventListener('click', () => showScreen('seance'));
    main.appendChild(other);
  }
}

/* ═══════════════════════════════════════════════════════
   SÉANCE SCREEN
═══════════════════════════════════════════════════════ */
let liveSession = null;

async function renderSeanceScreen() {
  const body = document.getElementById('screen-seance-body');
  body.innerHTML = '';
  liveSession ? renderLiveSession(body) : await renderProgrammeSelection(body);
}

async function cyclicProgrammes(programmes) {
  if (!programmes.length) return { ordered: programmes, lastDoneId: null, lastDoneDate: null };

  const sessions = await loadSessions();
  if (!sessions.length) return { ordered: programmes, lastDoneId: null, lastDoneDate: null };

  const last = sessions.slice().sort((a, b) => {
    const ta = a.startedAt || a.date;
    const tb = b.startedAt || b.date;
    return tb.localeCompare(ta);
  })[0];
  const lastIdx = programmes.findIndex(p => p.id === last.programmeId);
  if (lastIdx === -1) return { ordered: programmes, lastDoneId: null, lastDoneDate: null };

  const start = (lastIdx + 1) % programmes.length;
  const ordered = [...programmes.slice(start), ...programmes.slice(0, start)];
  return { ordered, lastDoneId: last.programmeId, lastSession: last };
}

async function renderProgrammeSelection(tab) {
  const programmes = await loadProgrammes();

  if (!programmes.length) {
    const msg = document.createElement('p');
    msg.className = 'empty-msg';
    msg.textContent = 'Aucun programme. Crées-en un dans Paramètres.';
    const btn = document.createElement('button');
    btn.className = 'btn-secondary btn-full';
    btn.textContent = '→ Paramètres';
    btn.addEventListener('click', () => showScreen('params'));
    tab.appendChild(msg);
    tab.appendChild(btn);
    return;
  }

  const title = document.createElement('p');
  title.className = 'section-title';
  title.textContent = 'Choisir un programme';
  tab.appendChild(title);

  const { ordered, lastDoneId, lastSession } = await cyclicProgrammes(programmes);
  const total = ordered.length;

  ordered.forEach((prog, displayIdx) => {
    const isNext = displayIdx === 0;
    const isDone = prog.id === lastDoneId;

    const card = document.createElement('div');
    card.className = 'programme-card';
    if (isNext) card.classList.add('programme-card--next');
    if (isDone) card.classList.add('programme-card--done');

    const seriesCount = prog.exercises.reduce((s, e) => s + (e.sets || e.count || e.series?.length || 3), 0);

    let meta;
    if (isDone && lastSession) {
      const timePart = lastSession.startedAt ? formatTime(lastSession.startedAt) : formatDate(lastSession.date);
      const durPart  = lastSession.duration != null ? ` · ${formatDuration(lastSession.duration)}` : '';
      meta = `${timePart}${durPart}`;
    } else {
      meta = `${prog.exercises.length} exercice${prog.exercises.length > 1 ? 's' : ''} · ${seriesCount} séries`;
    }

    card.innerHTML = `
      <span class="programme-name">${prog.name}</span>
      <span class="programme-meta">${meta}</span>
    `;
    card.addEventListener('click', () => startSession(prog));
    tab.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════
   SÉANCE LIVE
═══════════════════════════════════════════════════════ */
function liveSessionSnapshot(durationSecs = 0) {
  return {
    id:            liveSession.id,
    programmeId:   liveSession.programmeId,
    programmeName: liveSession.programmeName,
    date:          liveSession.date,
    startedAt:     liveSession.startedAt,
    duration:      durationSecs,
    exercises:     liveSession.exercises.map(ex => ({
      name:       ex.name,
      comment:    ex.comment || '',
      activities: ex.activities,
      series:     ex.series.map(s => ({
        done: ex.activities.every((_, i) => s.activityStates?.[i] === 'done'),
        values: s.values,
      })),
    })),
  };
}

function startSession(programme) {
  liveSession = {
    id: generateId(),
    programmeId: programme.id,
    programmeName: programme.name,
    date: todayIso(),
    startedAt: new Date().toISOString(),
    exercises: programme.exercises.map(ex => {
      const m    = migrateExercise(ex);
      const sets = ex.sets ?? m.series.length ?? (ex.count ?? 3);
      return {
        name:       ex.name,
        comment:    ex.comment || '',
        activities: m.activities,
        series: Array.from({ length: sets }, () => ({
          activityStates: {},
          values: m.activities.map(act =>
            act.type === 'weight'
              ? { reps: act.reps || 0, weight: act.weight || 0 }
              : { duration: act.duration || 0 }
          ),
        })),
      };
    }),
  };
  pushSession(liveSessionSnapshot()).catch(() => {});
  renderSeanceScreen();
}

function renderLiveSession(tab) {
  const header = document.createElement('div');
  header.className = 'live-header';
  header.innerHTML = `
    <div>
      <div class="live-title">${liveSession.programmeName}</div>
      <div class="live-date">${formatDate(liveSession.date)}</div>
    </div>
    <button class="btn-danger" id="finish-session">Terminer</button>
  `;
  tab.appendChild(header);

  liveSession.exercises.forEach((ex, exIdx) => {
    const exDiv = document.createElement('div');
    exDiv.className = 'live-exercise';

    const exName = document.createElement('div');
    exName.className = 'live-exercise-name';
    exName.textContent = ex.name;
    exDiv.appendChild(exName);

    if (ex.comment) {
      const exComment = document.createElement('div');
      exComment.className = 'live-exercise-comment';
      exComment.textContent = ex.comment;
      exDiv.appendChild(exComment);
    }

    ex.series.forEach((s, sIdx) => {
      ex.activities.forEach((_, actIdx) => {
        exDiv.appendChild(buildActivityRow(exIdx, sIdx, actIdx));
      });
    });

    tab.appendChild(exDiv);
  });

  document.getElementById('finish-session').addEventListener('click', finishSession);
}

/* ── Chrono / Minuterie overlays ───────────────────── */
let chronoInterval    = null;
let currentChronoCtx    = null; // { exIdx, sIdx, actIdx, startTime, row }
let minuterieInterval   = null;
let currentMinuterieCtx = null; // { exIdx, sIdx, actIdx, duration, row }

function openActivityOverlay(exIdx, sIdx, actIdx, row) {
  const type = liveSession.exercises[exIdx]?.activities[actIdx]?.type;
  if (type === 'stopwatch')      openChronoOverlay(exIdx, sIdx, actIdx, row);
  else if (type === 'countdown') openMinuterieOverlay(exIdx, sIdx, actIdx, row);
}

function openChronoOverlay(exIdx, sIdx, actIdx, row) {
  const overlay = document.getElementById('chrono-overlay');
  const display = document.getElementById('chrono-display');
  let   stopBtn = document.getElementById('chrono-stop');
  if (!overlay || !display || !stopBtn) return;

  const startTime = Date.now();
  display.textContent = '00:00';
  const nameEl = document.getElementById('chrono-exercise-name');
  if (nameEl) {
    const ex = liveSession.exercises[exIdx];
    const actName = ex?.activities[actIdx]?.name || '';
    nameEl.textContent = [ex?.name, actName].filter(Boolean).join(' - ');
  }
  overlay.classList.remove('hidden');

  currentChronoCtx = { exIdx, sIdx, actIdx, startTime, row };

  chronoInterval = setInterval(() => {
    const el = document.getElementById('chrono-display');
    if (el) el.textContent = formatSeconds(Math.floor((Date.now() - startTime) / 1000));
  }, 500);

  const newStop = stopBtn.cloneNode(true);
  stopBtn.parentNode.replaceChild(newStop, stopBtn);
  newStop.addEventListener('click', () => stopChronoOverlay());
}

function stopChronoOverlay() {
  if (!currentChronoCtx) return;
  clearInterval(chronoInterval);
  chronoInterval = null;

  const { exIdx, sIdx, actIdx, startTime, row } = currentChronoCtx;
  currentChronoCtx = null;

  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  if (!liveSession.exercises[exIdx].series[sIdx].values[actIdx])
    liveSession.exercises[exIdx].series[sIdx].values[actIdx] = {};
  liveSession.exercises[exIdx].series[sIdx].values[actIdx].duration = elapsed;

  const span = row.querySelector(`.live-chrono-result[data-act="${actIdx}"]`);
  if (span) span.textContent = formatSeconds(elapsed);

  document.getElementById('chrono-overlay').classList.add('hidden');
  doneActivity(exIdx, sIdx, actIdx, row);
}

function openMinuterieOverlay(exIdx, sIdx, actIdx, row) {
  const overlay = document.getElementById('minuterie-overlay');
  const display = document.getElementById('minuterie-display');
  let   stopBtn = document.getElementById('minuterie-stop');
  if (!overlay || !display || !stopBtn) return;

  const duration = liveSession.exercises[exIdx].series[sIdx].values[actIdx]?.duration || 0;
  let remaining = duration;
  display.textContent = formatSeconds(remaining);

  const nameEl = document.getElementById('minuterie-exercise-name');
  if (nameEl) {
    const ex = liveSession.exercises[exIdx];
    nameEl.textContent = [ex?.name, ex?.activities[actIdx]?.name].filter(Boolean).join(' - ');
  }
  overlay.classList.remove('hidden');

  currentMinuterieCtx = { exIdx, sIdx, actIdx, duration, row };

  minuterieInterval = setInterval(() => {
    remaining--;
    const el = document.getElementById('minuterie-display');
    if (el) el.textContent = formatSeconds(Math.max(0, remaining));
    if (remaining <= 0) stopMinuterieOverlay();
  }, 1000);

  const newStop = stopBtn.cloneNode(true);
  stopBtn.parentNode.replaceChild(newStop, stopBtn);
  newStop.addEventListener('click', () => stopMinuterieOverlay());
}

function stopMinuterieOverlay() {
  if (!currentMinuterieCtx) return;
  clearInterval(minuterieInterval);
  minuterieInterval = null;

  const { exIdx, sIdx, actIdx, row } = currentMinuterieCtx;
  currentMinuterieCtx = null;

  document.getElementById('minuterie-overlay').classList.add('hidden');
  doneActivity(exIdx, sIdx, actIdx, row);
}

function buildActivityRow(exIdx, sIdx, actIdx) {
  const ex  = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const set = ex.series[sIdx];
  const v   = set.values?.[actIdx] || {};

  if (!set.activityStates) set.activityStates = {};
  if (set.activityStates[actIdx] === undefined) set.activityStates[actIdx] = 'pending';

  const state = set.activityStates[actIdx];
  const row = document.createElement('div');
  row.className = `live-series-row ${state}`;
  row.dataset.ex  = exIdx;
  row.dataset.s   = sIdx;
  row.dataset.act = actIdx;

  const stateBtn = document.createElement('button');
  stateBtn.className = 'series-state-btn';
  stateBtn.textContent = stateIcon(state);
  stateBtn.addEventListener('click', () => advanceActivityState(exIdx, sIdx, actIdx, row));
  row.appendChild(stateBtn);

  const numSpan = document.createElement('span');
  numSpan.className = 'series-num';
  numSpan.textContent = ex.activities.length === 1 ? sIdx + 1 : actIdx + 1;
  row.appendChild(numSpan);

  if (act.name) {
    const nameSpan = document.createElement('span');
    nameSpan.className = 'live-act-name';
    nameSpan.textContent = act.name;
    row.appendChild(nameSpan);
  }

  if (act.type === 'weight') {
    const repsInput = document.createElement('input');
    repsInput.type = 'number';
    repsInput.inputMode = 'decimal';
    repsInput.className = 'live-reps';
    repsInput.value = v.reps ?? act.reps ?? 0;
    repsInput.min = '1';
    repsInput.dataset.ex  = exIdx;
    repsInput.dataset.s   = sIdx;
    repsInput.dataset.act = actIdx;
    repsInput.addEventListener('input', e =>
      propagateLiveValue(exIdx, sIdx, actIdx, 'reps', parseFloat(e.target.value) || 0));

    const xSpan = document.createElement('span');
    xSpan.className = 'live-x';
    xSpan.textContent = '×';

    const wInput = document.createElement('input');
    wInput.type = 'number';
    wInput.inputMode = 'decimal';
    wInput.className = 'live-weight';
    wInput.value = v.weight ?? act.weight ?? 0;
    wInput.min = '0';
    wInput.step = '0.5';
    wInput.dataset.ex  = exIdx;
    wInput.dataset.s   = sIdx;
    wInput.dataset.act = actIdx;
    wInput.addEventListener('input', e =>
      propagateLiveValue(exIdx, sIdx, actIdx, 'weight', parseFloat(e.target.value) || 0));

    const kgSpan = document.createElement('span');
    kgSpan.className = 'live-kg';
    kgSpan.textContent = 'kg';

    const reposLabel = document.createElement('span');
    reposLabel.className = 'live-repos-label';
    reposLabel.textContent = 'Repos:';

    const restInput = document.createElement('input');
    restInput.type = 'number';
    restInput.inputMode = 'numeric';
    restInput.className = 'live-rest';
    restInput.value = act.rest ?? 0;
    restInput.min = '0';
    restInput.addEventListener('change', e => {
      const val = parseInt(e.target.value) || 0;
      liveSession.exercises[exIdx].activities[actIdx].rest = val;
      document.querySelectorAll(`.live-rest[data-ex="${exIdx}"][data-act="${actIdx}"]`)
        .forEach(inp => { inp.value = val; });
    });
    restInput.dataset.ex  = exIdx;
    restInput.dataset.act = actIdx;

    const sSpan = document.createElement('span');
    sSpan.className = 'live-x';
    sSpan.textContent = 's';

    row.append(repsInput, xSpan, wInput, kgSpan, reposLabel, restInput, sSpan);
  } else if (act.type === 'countdown') {
    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.inputMode = 'numeric';
    durInput.className = 'live-duration';
    durInput.value = v.duration ?? act.duration ?? 0;
    durInput.min = '1';
    durInput.dataset.ex  = exIdx;
    durInput.dataset.s   = sIdx;
    durInput.dataset.act = actIdx;
    durInput.addEventListener('change', e => {
      liveSession.exercises[exIdx].series[sIdx].values[actIdx].duration = parseInt(e.target.value) || 0;
    });
    const sSpan = document.createElement('span');
    sSpan.className = 'live-x';
    sSpan.textContent = 's';
    row.append(durInput, sSpan);
  } else {
    // stopwatch
    const resultSpan = document.createElement('span');
    resultSpan.className = 'live-chrono-result';
    resultSpan.dataset.act = actIdx;
    resultSpan.textContent = v.duration ? formatSeconds(v.duration) : '⏱';
    row.appendChild(resultSpan);
  }

  // Badge repos statique pour les activités chrono uniquement (le weight a déjà l'input inline)
  if (act.type !== 'weight' && act.rest > 0) {
    const restSpan = document.createElement('span');
    restSpan.className = 'live-act-rest';
    restSpan.textContent = `${act.rest}s`;
    row.appendChild(restSpan);
  }

  return row;
}

function advanceActivityState(exIdx, sIdx, actIdx, row) {
  const ex  = liveSession.exercises[exIdx];
  const set = ex.series[sIdx];
  if (!set.activityStates) set.activityStates = {};
  const state = set.activityStates[actIdx] ?? 'pending';

  if (state === 'done') return;

  if (state === 'pending') {
    set.activityStates[actIdx] = 'active';
    row.className = 'live-series-row active';
    row.querySelector('.series-state-btn').textContent = stateIcon('active');
    const act = ex.activities[actIdx];
    if (act.type === 'stopwatch' || act.type === 'countdown') {
      openActivityOverlay(exIdx, sIdx, actIdx, row);
    }
    return;
  }

  // active → done (weight only; timed overlays call doneActivity directly)
  doneActivity(exIdx, sIdx, actIdx, row);
}

function doneActivity(exIdx, sIdx, actIdx, row) {
  const ex  = liveSession.exercises[exIdx];
  const set = ex.series[sIdx];
  if (!set.activityStates) set.activityStates = {};
  set.activityStates[actIdx] = 'done';
  row.className = 'live-series-row done';
  row.querySelector('.series-state-btn').textContent = stateIcon('done');

  pushSession(liveSessionSnapshot()).catch(() => {});

  const allDone = ex.series.every(s =>
    ex.activities.every((_, i) => s.activityStates?.[i] === 'done')
  );
  const exDiv = row.closest('.live-exercise');
  exDiv.querySelector('.live-exercise-name').classList.toggle('live-exercise-name--done', allDone);
  if (allDone) exDiv.parentElement.appendChild(exDiv);

  // Trouver la prochaine activité
  let nextRow = null;
  if (actIdx + 1 < ex.activities.length) {
    nextRow = document.querySelector(`.live-series-row[data-ex="${exIdx}"][data-s="${sIdx}"][data-act="${actIdx + 1}"]`);
  } else if (sIdx + 1 < ex.series.length) {
    nextRow = document.querySelector(`.live-series-row[data-ex="${exIdx}"][data-s="${sIdx + 1}"][data-act="0"]`);
  }

  if (nextRow) {
    const nex     = +nextRow.dataset.ex;
    const ns      = +nextRow.dataset.s;
    const na      = +nextRow.dataset.act;
    const nextEx  = liveSession.exercises[nex];
    const nextAct = nextEx?.activities?.[na];
    const label   = [nextEx?.name, nextAct?.name].filter(Boolean).join(' - ');
    const rest    = ex.activities[actIdx]?.rest || 0;
    startCountdown(rest, label, () => advanceActivityState(nex, ns, na, nextRow));
  }
}

function propagateLiveValue(exIdx, sIdx, actIdx, field, val) {
  const series = liveSession.exercises[exIdx].series;
  series.forEach((s, j) => {
    if (j >= sIdx) {
      if (!s.values[actIdx]) s.values[actIdx] = {};
      s.values[actIdx][field] = val;
      if (j > sIdx) {
        const input = document.querySelector(`.live-${field}[data-ex="${exIdx}"][data-s="${j}"][data-act="${actIdx}"]`);
        if (input) input.value = val;
      }
    }
  });
  updateProgrammeTemplate(exIdx, actIdx, field, val);
}

async function updateProgrammeTemplate(exIdx, actIdx, field, val) {
  if (!liveSession.programmeId) return;
  const programmes = await loadProgrammes();
  const prog = programmes.find(p => p.id === liveSession.programmeId);
  if (!prog?.exercises[exIdx]?.activities?.[actIdx]) return;
  prog.exercises[exIdx].activities[actIdx][field] = val;
  await updateProgrammeDB(prog);
}

function stopAllChronos() {
  if (chronoInterval && currentChronoCtx) {
    clearInterval(chronoInterval);
    chronoInterval = null;
    const { exIdx, sIdx, actIdx, startTime } = currentChronoCtx;
    currentChronoCtx = null;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (!liveSession.exercises[exIdx].series[sIdx].values[actIdx])
      liveSession.exercises[exIdx].series[sIdx].values[actIdx] = {};
    liveSession.exercises[exIdx].series[sIdx].values[actIdx].duration = elapsed;
    document.getElementById('chrono-overlay').classList.add('hidden');
  }
  if (minuterieInterval && currentMinuterieCtx) {
    clearInterval(minuterieInterval);
    minuterieInterval = null;
    currentMinuterieCtx = null;
    document.getElementById('minuterie-overlay').classList.add('hidden');
  }
}

function finishSession() {
  showConfirm('Terminer et enregistrer la séance ?', () => {
    stopAllChronos();
    const durationSecs = Math.round((Date.now() - new Date(liveSession.startedAt).getTime()) / 1000);
    pushSession(liveSessionSnapshot(durationSecs)).catch(() => {});
    liveSession = null;
    stopCountdown();
    showScreen('home');
  });
}

/* ═══════════════════════════════════════════════════════
   COUNTDOWN
═══════════════════════════════════════════════════════ */
function goMessages() {
  const p = currentProfile?.prenom;
  const msgs = [
    "C'est parti ! 🔥",
    'Let\'s go ! 🚀',
    'Tu gères ! ⚡',
    'En forme ! 💥',
    'Allez, encore ! 🏋️',
    'Dans ta tête d\'abord ! 🧠',
    'Focus total ! 🎯',
    'T\'as vu ce que t\'as fait ? 🔥',
    'Inarrêtable ! ⚡',
    'Vas-y, envoie ! 💥',
  ];
  if (p) msgs.push(`Allez ${p}, tu gères ! 🔥`, `${p}, inarrêtable ! ⚡`, `C'est ton moment ${p} ! 💥`);
  return msgs;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
let audioCtx = null;

// Initialise l'AudioContext au premier geste utilisateur (requis par les navigateurs)
document.addEventListener('touchstart', () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } else if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}, { once: false, passive: true });

function beep(freq = 880, duration = 120, volume = 0.4) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + duration / 1000);
}

function beepSequence(count, interval = 1000) {
  for (let i = 0; i < count; i++) setTimeout(() => beep(), i * interval);
}

let countdownTimer    = null;
let countdownSecs     = 0;
let countdownTotal    = 0;
let countdownOnFinish = null;
const RING_CIRCUMFERENCE = 2 * Math.PI * 85; // ≈ 534

function updateCountdownUI() {
  const display = document.getElementById('countdown-display');
  const ring    = document.getElementById('ring-progress');
  const bar     = document.getElementById('countdown-bar');

  display.textContent = formatSeconds(countdownSecs);

  const progress = countdownTotal > 0 ? countdownSecs / countdownTotal : 0;
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  // Pulse — remove then re-add to retrigger animation
  display.classList.remove('pulse');
  void display.offsetWidth;
  display.classList.add('pulse');

  bar.classList.toggle('urgent', countdownSecs <= 5);
}

function startCountdown(seconds, nextLabel, onFinish) {
  stopCountdown();
  if (!seconds || seconds <= 0) {
    if (onFinish) onFinish();
    return;
  }
  countdownSecs     = seconds;
  countdownTotal    = seconds;
  countdownOnFinish = onFinish;

  document.getElementById('countdown-bar').classList.remove('hidden');
  document.getElementById('ring-progress').style.strokeDashoffset = 0;
  const cdNameEl = document.getElementById('countdown-exercise-name');
  if (cdNameEl) cdNameEl.textContent = nextLabel ? `À suivre : ${nextLabel}` : '';
  updateCountdownUI();

  countdownTimer = setInterval(() => {
    countdownSecs--;
    if (countdownSecs <= 0) {
      beepSequence(5);
      if (navigator.vibrate) navigator.vibrate([400, 100, 400, 100, 400]);
      finishCountdown();
    } else {
      if (countdownSecs <= 5) {
        beep(660, 80, 0.2);
        if (navigator.vibrate) navigator.vibrate(80);
        if (countdownSecs === 5) showToast('Prenez place !');
      }
      updateCountdownUI();
    }
  }, 1000);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden', 'toast-hide');
  toast.classList.add('toast-show');
  setTimeout(() => {
    toast.classList.replace('toast-show', 'toast-hide');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 2000);
}

function finishCountdown() {
  const fn = countdownOnFinish;
  stopCountdown();
  showToast(randomFrom(goMessages()));
  if (fn) fn();
}

function stopCountdown() {
  clearInterval(countdownTimer);
  countdownTimer    = null;
  countdownOnFinish = null;
  const bar = document.getElementById('countdown-bar');
  bar.classList.add('hidden');
  bar.classList.remove('urgent');
}

document.getElementById('countdown-skip').addEventListener('click', finishCountdown);

/* ═══════════════════════════════════════════════════════
   HISTORIQUE
═══════════════════════════════════════════════════════ */
async function renderHistory() {
  const list = document.getElementById('history-list');
  const sessions = (await loadSessions()).slice().sort((a, b) => b.date.localeCompare(a.date));

  if (!sessions.length) {
    list.innerHTML = '<p class="empty-msg">Aucune séance enregistrée.</p>';
    return;
  }

  list.innerHTML = '';
  sessions.forEach(session => {
    const card = document.createElement('div');
    const isAbandoned = !session.duration;
    card.className = 'session-card' + (isAbandoned ? ' session-card--inprogress' : '');
    const done = totalVolume(session.exercises);
    const planned = plannedVolume(session.exercises);
    const name = session.programmeName || session.name || 'Séance';
    const volDisplay = planned > 0 && done !== planned
      ? `${done.toLocaleString('fr-FR')} kg / ${planned.toLocaleString('fr-FR')} kg`
      : `${done.toLocaleString('fr-FR')} kg`;
    card.innerHTML = `
      <div class="session-card-header">
        <span class="session-name">${name}${isAbandoned ? ' <span class="session-badge-inprogress">En cours</span>' : ''}</span>
        <span class="session-date">${formatDate(session.date)}</span>
      </div>
      <div class="session-meta">
        ${session.exercises.length} exercice${session.exercises.length > 1 ? 's' : ''}
        · ${volDisplay}
      </div>
    `;
    card.addEventListener('click', () => openModal(session));
    list.appendChild(card);
  });
}

function resumeSessionFromHistory(session) {
  liveSession = {
    id:            session.id,
    programmeId:   session.programmeId,
    programmeName: session.programmeName,
    date:          session.date,
    startedAt:     session.startedAt,
    exercises:     session.exercises.map(ex => {
      const e = migrateExercise(ex);
      return {
        name:       e.name,
        comment:    e.comment || '',
        activities: e.activities,
        series:     e.series.map(s => ({ state: s.state || (s.done ? 'done' : 'pending'), values: s.values })),
      };
    }),
  };
  closeModal();
  showScreen('seance');
}

/* ═══════════════════════════════════════════════════════
   MODAL — détail séance
═══════════════════════════════════════════════════════ */
function openModal(session) {
  const body = document.getElementById('modal-body');
  const done = totalVolume(session.exercises);
  const planned = plannedVolume(session.exercises);
  const name = session.programmeName || session.name || 'Séance';
  const volDisplay = planned > 0 && done !== planned
    ? `${done.toLocaleString('fr-FR')} kg / ${planned.toLocaleString('fr-FR')} kg`
    : `${done.toLocaleString('fr-FR')} kg`;

  const timeLine = session.startedAt
    ? `${formatDate(session.date)} · ${formatTime(session.startedAt)}${session.duration ? ` · ${formatDuration(session.duration)}` : ''}`
    : formatDate(session.date);

  let html = `
    <div class="modal-title">${name}</div>
    <div class="modal-date">${timeLine} · ${volDisplay}</div>
  `;

  session.exercises.forEach(ex => {
    const e = migrateExercise(ex);
    const actHeaders = e.activities.map(act => {
      const label = act.name ? `<span class="modal-act-label">${act.name}</span> ` : '';
      return act.type === 'weight'
        ? `<th>${label}Reps</th><th>kg</th>`
        : `<th>${label}Durée (s)</th>`;
    }).join('');
    html += `<div class="modal-exercise">
      <div class="modal-exercise-name">${e.name}</div>
      <table class="modal-series-table">
        <thead><tr><th>#</th>${actHeaders}<th></th></tr></thead>
        <tbody>
          ${e.series.map((s, i) => `
            <tr class="${s.done === false ? 'series-not-done' : ''}">
              <td>${i + 1}</td>
              ${e.activities.map((act, j) => {
                const v = s.values?.[j] || {};
                return act.type === 'weight'
                  ? `<td>${v.reps ?? '—'}</td><td>${v.weight ?? '—'}</td>`
                  : `<td>${v.duration ?? '—'}</td>`;
              }).join('')}
              <td>${s.done === false ? '—' : '✓'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
  });

  const isAbandoned = !session.duration;
  html += `<div class="modal-footer${isAbandoned ? ' modal-footer--two' : ''}">
    ${isAbandoned ? '<button class="btn-primary" id="resume-session">Reprendre la séance</button>' : ''}
    <button class="btn-danger" id="delete-session">Supprimer la séance</button>
  </div>`;

  body.innerHTML = html;
  if (isAbandoned) {
    document.getElementById('resume-session').addEventListener('click', () => resumeSessionFromHistory(session));
  }
  document.getElementById('delete-session').addEventListener('click', () => {
    showConfirm('Supprimer cette séance ?', async () => {
      await deleteSessionDB(session.id);
      closeModal();
      await renderHistory();
    });
  });

  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

/* ═══════════════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════════════ */
async function renderStats() {
  const body = document.getElementById('screen-stats-body');
  body.innerHTML = '';
  const sessions = (await loadSessions()).slice().sort((a, b) => a.date.localeCompare(b.date));

  if (!sessions.length) {
    body.innerHTML = '<p class="empty-msg">Aucune séance enregistrée.</p>';
    return;
  }

  body.appendChild(buildStatsSummary(sessions));
  body.appendChild(buildStatsFrequency(sessions));
  body.appendChild(await buildStatsProgression(sessions));
}

function statsSection(title) {
  const section = document.createElement('div');
  section.className = 'stats-section';
  const h = document.createElement('h3');
  h.className = 'stats-section-title';
  h.textContent = title;
  section.appendChild(h);
  return section;
}

function sessionVolume(session) {
  return totalVolume(session.exercises);
}

function buildStatsSummary(sessions) {
  const section = statsSection('Résumé');

  const totalVol = sessions.reduce((s, se) => s + sessionVolume(se), 0);
  const totalDur = sessions.reduce((s, se) => s + (se.duration || 0), 0);
  const best = sessions.reduce((b, s) => {
    const v = sessionVolume(s);
    return v > b.vol ? { vol: v, name: s.programmeName } : b;
  }, { vol: 0, name: '' });

  const grid = document.createElement('div');
  grid.className = 'stats-summary-grid';

  [
    { value: sessions.length,                      label: 'Séances' },
    { value: `${(totalVol / 1000).toFixed(1)} t`,  label: 'Volume total' },
    { value: `${Math.round(totalDur / 3600)} h`,   label: 'Temps total' },
    { value: `${(best.vol / 1000).toFixed(1)} t`,  label: 'Meilleure séance', sub: best.name },
  ].forEach(({ value, label, sub }) => {
    const card = document.createElement('div');
    card.className = 'stats-card';
    card.innerHTML = `
      <span class="stats-card-value">${value}</span>
      <span class="stats-card-label">${label}</span>
      ${sub ? `<span class="stats-card-sub">${sub}</span>` : ''}
    `;
    grid.appendChild(card);
  });

  section.appendChild(grid);
  return section;
}

function isoWeekKey(dateStr) {
  const d = new Date(dateStr);
  const day = (d.getDay() + 6) % 7; // lundi = 0
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

function buildStatsFrequency(sessions) {
  const section = statsSection('Fréquence');

  const weekMap = {};
  sessions.forEach(s => {
    const k = isoWeekKey(s.date);
    weekMap[k] = (weekMap[k] || 0) + 1;
  });

  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = isoWeekKey(d.toISOString().slice(0, 10));
    const label = `${String(monday.getDate()).padStart(2,'0')}/${String(monday.getMonth()+1).padStart(2,'0')}`;
    weeks.push({ key: k, count: weekMap[k] || 0, label });
  }

  const maxCount = Math.max(...weeks.map(w => w.count), 1);

  const chart = document.createElement('div');
  chart.className = 'stats-bar-chart';

  weeks.forEach(({ count, label }) => {
    const col = document.createElement('div');
    col.className = 'stats-bar-col';

    const countLbl = document.createElement('span');
    countLbl.className = 'stats-bar-count';
    countLbl.textContent = count || '';

    const bar = document.createElement('div');
    bar.className = 'stats-bar' + (count === 0 ? ' stats-bar--empty' : '');
    bar.style.height = `${Math.round((count / maxCount) * 100)}%`;

    const dateLbl = document.createElement('span');
    dateLbl.className = 'stats-bar-label';
    dateLbl.textContent = label;

    col.appendChild(countLbl);
    col.appendChild(bar);
    col.appendChild(dateLbl);
    chart.appendChild(col);
  });

  section.appendChild(chart);
  return section;
}

async function buildStatsProgression(sessions) {
  const section = statsSection('Machines');

  const names = [...new Set(sessions.flatMap(s => s.exercises.map(e => e.name)))].sort();
  if (!names.length) return section;

  // Calcul des données par exercice (max poids parmi les activités weight)
  const machineData = names.map(name => {
    const points = sessions.map(s => {
      const ex = s.exercises.find(e => e.name === name);
      if (!ex) return null;
      const e = migrateExercise(ex);
      const weights = e.series
        .filter(se => se.done !== false)
        .flatMap(set => e.activities.map((act, i) =>
          act.type === 'weight' ? (set.values?.[i]?.weight || 0) : 0
        ))
        .filter(w => w > 0);
      if (!weights.length) return null;
      return { date: s.date, weight: Math.max(...weights) };
    }).filter(Boolean);
    return { name, muscle: '', points };
  }).filter(d => d.points.length >= 1);

  if (!machineData.length) return section;

  // Muscles uniques triés, avec "Tous" en premier
  const muscles = ['Tous', ...[...new Set(machineData.map(d => d.muscle).filter(Boolean))].sort()];

  // Sélecteur muscle — pills
  const pills = document.createElement('div');
  pills.className = 'stats-pills';
  let activeMuscle = 'Tous';
  muscles.forEach(m => {
    const pill = document.createElement('button');
    pill.className = 'stats-pill' + (m === 'Tous' ? ' active' : '');
    pill.textContent = m;
    pill.dataset.muscle = m;
    pills.appendChild(pill);
  });
  section.appendChild(pills);

  // Shim select pour réutiliser le listener existant
  const select = { value: 'Tous', addEventListener: (ev, fn) => { select._fn = fn; } };

  let current = 0;
  let filtered = machineData;

  // Conteneur carousel
  const carousel = document.createElement('div');
  carousel.className = 'stats-carousel';

  const track = document.createElement('div');
  track.className = 'stats-carousel-track';

  const buildCards = (data) => {
    track.innerHTML = '';
    data.forEach(({ name, muscle, points }) => {
      const card = document.createElement('div');
      card.className = 'stats-machine-card';

      const startW  = points[0].weight;
    const currentW = points[points.length - 1].weight;
    const delta   = currentW - startW;
    const deltaStr = delta === 0 ? '=' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg`;
    const deltaClass = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';

    let svgHtml = '';
    if (points.length >= 2) {
      const W = 280, H = 90;
      const minW = Math.min(...points.map(p => p.weight));
      const maxW = Math.max(...points.map(p => p.weight));
      const range = maxW - minW || 1;
      const pad = { t: 10, b: 22, l: 34, r: 8 };
      const x = i => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
      const y = w => pad.t + (1 - (w - minW) / range) * (H - pad.t - pad.b);
      const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
      svgHtml = `
        <svg viewBox="0 0 ${W} ${H}" class="stats-svg">
          <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H-pad.b}" stroke="#2a2a2a" stroke-width="1"/>
          <line x1="${pad.l}" y1="${H-pad.b}" x2="${W-pad.r}" y2="${H-pad.b}" stroke="#2a2a2a" stroke-width="1"/>
          <text x="${pad.l-4}" y="${y(maxW)+4}" text-anchor="end" font-size="9" fill="#555">${maxW}kg</text>
          <text x="${pad.l-4}" y="${y(minW)+4}" text-anchor="end" font-size="9" fill="#555">${minW}kg</text>
          <path d="${path}" fill="none" stroke="#9A7A30" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${points.map((p,i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.weight).toFixed(1)}" r="2.5" fill="#9A7A30"/>`).join('')}
          <text x="${x(0)}" y="${H}" text-anchor="middle" font-size="9" fill="#555">${points[0].date.slice(5)}</text>
          <text x="${x(points.length-1)}" y="${H}" text-anchor="middle" font-size="9" fill="#555">${points[points.length-1].date.slice(5)}</text>
        </svg>`;
    }

      card.innerHTML = `
        <div class="stats-machine-name">${name}</div>
        ${muscle ? `<div class="stats-machine-muscle">${muscle}</div>` : ''}
        <div class="stats-machine-weights">
          <span class="stats-machine-weight-item"><span class="stats-weight-lbl">Départ</span><span class="stats-weight-val">${startW} kg</span></span>
          <span class="stats-machine-arrow">→</span>
          <span class="stats-machine-weight-item"><span class="stats-weight-lbl">Actuel</span><span class="stats-weight-val stats-weight-val--current">${currentW} kg</span></span>
          <span class="stats-delta ${deltaClass}">${deltaStr}</span>
        </div>
        ${svgHtml}
      `;
      track.appendChild(card);
    });
  };

  buildCards(machineData);

  // Dots
  const dots = document.createElement('div');
  dots.className = 'stats-carousel-dots';

  const rebuildDots = (count) => {
    dots.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('span');
      dot.className = 'stats-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () => goTo(i));
      dots.appendChild(dot);
    }
  };

  const goTo = (idx) => {
    current = Math.max(0, Math.min(idx, filtered.length - 1));
    track.style.transform = `translateX(calc(-${current} * 100%))`;
    dots.querySelectorAll('.stats-dot').forEach((d, i) => d.classList.toggle('active', i === current));
  };

  rebuildDots(machineData.length);

  pills.addEventListener('click', e => {
    const pill = e.target.closest('.stats-pill');
    if (!pill) return;
    pills.querySelectorAll('.stats-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const muscle = pill.dataset.muscle;
    filtered = muscle === 'Tous' ? machineData : machineData.filter(d => d.muscle === muscle);
    current = 0;
    track.style.transition = 'none';
    track.style.transform = 'translateX(0)';
    buildCards(filtered);
    rebuildDots(filtered.length);
    setTimeout(() => { track.style.transition = ''; }, 50);
  });

  // Swipe touch
  let touchStartX = 0;
  carousel.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', e => {
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) goTo(current + (delta > 0 ? 1 : -1));
  });

  carousel.appendChild(track);
  carousel.appendChild(dots);
  section.appendChild(carousel);
  return section;
}

/* ═══════════════════════════════════════════════════════
   PARAMÈTRES — liste des programmes
═══════════════════════════════════════════════════════ */
async function renderParams() {
  const tab = document.getElementById('screen-params-body');
  tab.innerHTML = '';

  // Section compte
  const accountSection = document.createElement('div');
  accountSection.style.display = 'flex';
  accountSection.style.flexDirection = 'column';
  accountSection.style.gap = '8px';

  const accountTitle = document.createElement('p');
  accountTitle.className = 'section-title';
  accountTitle.textContent = 'Compte';
  accountSection.appendChild(accountTitle);

  if (currentUser) {
    const emailLine = document.createElement('p');
    emailLine.style.cssText = 'font-size:13px;color:var(--text-muted);padding:4px 0';
    emailLine.textContent = currentUser.email;
    accountSection.appendChild(emailLine);

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn-secondary btn-full';
    logoutBtn.textContent = 'Se déconnecter';
    logoutBtn.addEventListener('click', async () => {
      showConfirm('Se déconnecter ?', async () => {
        await db.auth.signOut();
        currentUser = null;
        loginReady = false;
        showScreen('login');
      });
    });
    accountSection.appendChild(logoutBtn);
  } else {
    const loginBtn = document.createElement('button');
    loginBtn.className = 'btn-primary btn-full';
    loginBtn.textContent = 'Se connecter';
    loginBtn.addEventListener('click', () => { loginReady = false; showScreen('login'); });
    accountSection.appendChild(loginBtn);
  }

  tab.appendChild(accountSection);

  // Section programmes
  const progSection = document.createElement('div');
  progSection.style.display = 'flex';
  progSection.style.flexDirection = 'column';
  progSection.style.gap = '8px';

  const progTitle = document.createElement('p');
  progTitle.className = 'section-title';
  progTitle.textContent = 'Programmes';
  progSection.appendChild(progTitle);

  const programmes = await loadProgrammes();
  if (!programmes.length) {
    const msg = document.createElement('p');
    msg.className = 'empty-msg';
    msg.textContent = 'Aucun programme.';
    progSection.appendChild(msg);
  } else {
    programmes.forEach((prog, idx) => {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = `
        <div class="param-row-order">
          <button class="btn-order" data-dir="up" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-order" data-dir="down" ${idx === programmes.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <span class="param-row-name">${prog.name}</span>
        <div class="param-row-actions">
          <button class="btn-secondary btn-sm">Modifier</button>
          <button class="btn-danger btn-sm">Suppr.</button>
        </div>
      `;
      row.querySelector('[data-dir="up"]').addEventListener('click', async () => {
        const progs = await loadProgrammes();
        [progs[idx - 1], progs[idx]] = [progs[idx], progs[idx - 1]];
        await reorderProgrammesDB(progs);
        await renderParams();
      });
      row.querySelector('[data-dir="down"]').addEventListener('click', async () => {
        const progs = await loadProgrammes();
        [progs[idx], progs[idx + 1]] = [progs[idx + 1], progs[idx]];
        await reorderProgrammesDB(progs);
        await renderParams();
      });
      row.querySelector('.btn-secondary').addEventListener('click', () => openProgrammeEditor(prog));
      row.querySelector('.btn-danger').addEventListener('click', () => {
        showConfirm(`Supprimer "${prog.name}" ?`, async () => {
          await deleteProgrammeDB(prog.id);
          await renderParams();
        });
      });
      progSection.appendChild(row);
    });
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-secondary btn-full';
  addBtn.textContent = '+ Nouveau programme';
  addBtn.addEventListener('click', () => openProgrammeEditor());
  progSection.appendChild(addBtn);

  tab.appendChild(progSection);

  // Section données
  const dataSection = document.createElement('div');
  dataSection.style.display = 'flex';
  dataSection.style.flexDirection = 'column';
  dataSection.style.gap = '8px';

  const dataTitle = document.createElement('p');
  dataTitle.className = 'section-title';
  dataTitle.textContent = 'Données';
  dataSection.appendChild(dataTitle);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-primary btn-full';
  exportBtn.textContent = 'Exporter les séances (JSON)';
  exportBtn.addEventListener('click', exportData);

  const importLabel = document.createElement('label');
  importLabel.className = 'btn-secondary btn-full';
  importLabel.htmlFor = 'import-file';
  importLabel.textContent = 'Importer des séances (JSON)';

  const feedback = document.createElement('p');
  feedback.className = 'data-feedback';
  feedback.id = 'data-feedback';

  dataSection.appendChild(exportBtn);
  dataSection.appendChild(importLabel);
  dataSection.appendChild(feedback);

  tab.appendChild(dataSection);
}

/* ═══════════════════════════════════════════════════════
   ÉDITEUR DE PROGRAMME
═══════════════════════════════════════════════════════ */
function openProgrammeEditor(programme = null) {
  const tab = document.getElementById('screen-params-body');
  tab.innerHTML = '';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn-secondary btn-sm back-btn';
  backBtn.textContent = '← Retour';
  backBtn.addEventListener('click', renderParams);
  tab.appendChild(backBtn);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Nom du programme';
  nameInput.maxLength = 60;
  nameInput.value = programme ? programme.name : '';
  nameInput.id = 'prog-name-input';
  tab.appendChild(nameInput);

  const exercisesList = document.createElement('div');
  exercisesList.id = 'prog-exercises-list';
  exercisesList.style.display = 'flex';
  exercisesList.style.flexDirection = 'column';
  exercisesList.style.gap = '12px';
  tab.appendChild(exercisesList);

  if (programme) {
    programme.exercises.forEach(ex => {
      const m    = migrateExercise(ex);
      const acts = m.activities.map(act => ({
        type:     act.type,
        name:     act.name     || '',
        reps:     act.type === 'weight' ? (act.reps     ?? '') : '',
        weight:   act.type === 'weight' ? (act.weight   ?? '') : '',
        duration: act.type !== 'weight' ? (act.duration ?? '') : '',
        rest:     act.rest ?? '',
      }));
      exercisesList.appendChild(makeExerciseCard({
        name:       ex.name || '',
        sets:       ex.sets || m.series?.length || ex.count || 3,
        activities: acts,
        comment:    ex.comment || '',
      }));
    });
  } else {
    exercisesList.appendChild(makeExerciseCard());
  }

  const addExBtn = document.createElement('button');
  addExBtn.className = 'btn-secondary btn-full';
  addExBtn.textContent = '+ Exercice';
  addExBtn.addEventListener('click', () => exercisesList.appendChild(makeExerciseCard()));
  tab.appendChild(addExBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary btn-full';
  saveBtn.textContent = 'Enregistrer le programme';
  saveBtn.addEventListener('click', () => saveProgrammeFromEditor(programme ? programme.id : null));
  tab.appendChild(saveBtn);
}

async function saveProgrammeFromEditor(existingId) {
  const name = document.getElementById('prog-name-input').value.trim();
  if (!name) { showAlert('Donne un nom au programme.'); return; }

  const cards = document.querySelectorAll('#prog-exercises-list .exercise-card');
  if (!cards.length) { showAlert('Ajoute au moins un exercice.'); return; }

  const exercises = Array.from(cards).map(readExerciseCard);

  const programmes = await loadProgrammes();
  if (existingId) {
    await updateProgrammeDB({ id: existingId, name, exercises });
  } else {
    await upsertProgrammeDB({ id: generateId(), name, exercises, ordre: programmes.length });
  }
  await renderParams();
}

/* ACTIVITY_TYPES/LABELS, updateActivityFields, makeActivityRow, makeExerciseCard → exercise-editor.js */

/* ═══════════════════════════════════════════════════════
   LOGIN / AUTH
═══════════════════════════════════════════════════════ */
let loginReady = false;

function renderLogin() {
  if (loginReady) return;
  loginReady = true;

  document.getElementById('btn-login').addEventListener('click', async () => {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');
    errEl.classList.add('hidden');
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    currentUser = data.user;
    const profile = await getMyProfile();
    if (profile?.role === 'coach') { window.location.href = 'backoffice.html'; return; }
    currentProfile = profile;
    showScreen('home');
  });

}

/* ═══════════════════════════════════════════════════════
   DONNÉES
═══════════════════════════════════════════════════════ */
async function exportData() {
  const data = {
    programmes: await loadProgrammes(),
    sessions:   await loadSessions(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gym-tracker-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('import-file').addEventListener('change', e => {
  e.target.value = '';
  const fb = document.getElementById('data-feedback');
  if (fb) fb.textContent = 'Import non disponible — gérez vos données via le backoffice.';
});

/* ═══════════════════════════════════════════════════════
   LOADING SCREEN
═══════════════════════════════════════════════════════ */
(function initLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  setTimeout(() => {
    screen.classList.add('fade-out');
    screen.addEventListener('transitionend', () => screen.classList.add('hidden'), { once: true });
  }, 2000);
})();

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */
(async function init() {
  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user || null;

  if (currentUser) {
    const profile = await getMyProfile();
    if (profile?.role === 'coach') { window.location.href = 'backoffice.html'; return; }
    currentProfile = profile;

    const sessions = await loadSessions();
    const inProgress = sessions.find(s => s.duration === 0 || s.duration == null);
    if (inProgress?.exercises?.length) {
      liveSession = {
        id:            inProgress.id,
        programmeId:   inProgress.programmeId,
        programmeName: inProgress.programmeName,
        date:          inProgress.date,
        startedAt:     inProgress.startedAt,
        exercises:     inProgress.exercises.map(ex => {
          const e = migrateExercise(ex);
          return {
            name:       e.name,
            comment:    e.comment || '',
            activities: e.activities,
            series:     e.series.map(s => ({ state: s.state || (s.done ? 'done' : 'pending'), values: s.values })),
          };
        }),
      };
    }
  }

  await Promise.all([
    Promise.resolve(),
    new Promise(r => setTimeout(r, 2200)),
  ]);

  showScreen(currentUser ? 'home' : 'login');
})();
