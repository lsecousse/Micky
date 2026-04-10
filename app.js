/* ═══════════════════════════════════════════════════════
   VERSION
═══════════════════════════════════════════════════════ */
const APP_VERSION = '2026.avril.10';
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
  if (name === 'corps')   renderCorps();
  if (name === 'stats')   renderStats();
  if (name === 'params')  renderParams();
  if (name === 'login')   renderLogin();
}

document.getElementById('go-history').addEventListener('click', () => showScreen('history'));
document.getElementById('go-corps').addEventListener('click',   () => showScreen('corps'));
document.getElementById('go-stats').addEventListener('click',   () => showScreen('stats'));
document.getElementById('go-params').addEventListener('click',  () => showScreen('params'));
document.getElementById('back-history').addEventListener('click', () => showScreen('home'));
document.getElementById('back-corps').addEventListener('click',   () => showScreen('home'));
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
    msg.textContent = 'Aucun programme.\nCrées-en un dans Programmes ⚙';
    main.appendChild(msg);
    return;
  }

  const liveCat = liveSession?.category || null;

  const fonteProgrammes = programmes.filter(p => (p.category || 'fonte') === 'fonte');
  const cardioProgrammes = programmes.filter(p => p.category === 'cardio');

  // ── Section Fonte ──
  if (fonteProgrammes.length) {
    if (liveCat === 'fonte') {
      const card = document.createElement('div');
      card.className = 'home-resume-card';
      card.innerHTML = `
        <span class="home-resume-label">🏋️ Séance en cours</span>
        <span class="home-resume-name">${liveSession.programmeName}</span>
        <span class="home-resume-cta">Tap pour reprendre →</span>
      `;
      card.addEventListener('click', () => showScreen('seance'));
      main.appendChild(card);
    } else {
      const { ordered } = await cyclicProgrammes(fonteProgrammes);
      const next = ordered[0];
      const seriesCount = next.exercises.reduce((s, e) => s + (e.sets || e.count || e.series?.length || 3), 0);
      const muscles = [...new Set(next.exercises.flatMap(e => migrateExercise(e).activities.map(a => a.name).filter(Boolean)))];

      const card = document.createElement('div');
      card.className = 'home-next-card';
      card.innerHTML = `
        <span class="home-next-label">🏋️ Fonte</span>
        <span class="home-next-name">${next.name}</span>
        ${muscles.length ? `<span class="home-next-muscles">${muscles.join(' · ')}</span>` : ''}
        <span class="home-next-meta">${next.exercises.length} exercice${next.exercises.length > 1 ? 's' : ''} · ${seriesCount} séries</span>
      `;
      card.addEventListener('click', async () => {
        await startSession(next);
        showScreen('seance');
      });
      main.appendChild(card);
    }
    if (fonteProgrammes.length > 1) {
      const other = document.createElement('button');
      other.className = 'home-other-btn';
      other.textContent = '🏋️ Choisir un autre programme fonte';
      other.addEventListener('click', () => showScreen('seance'));
      main.appendChild(other);
    }
  }

  // ── Section Cardio ──
  if (cardioProgrammes.length) {
    if (liveCat === 'cardio') {
      const card = document.createElement('div');
      card.className = 'home-resume-card';
      card.innerHTML = `
        <span class="home-resume-label">🏃 Séance en cours</span>
        <span class="home-resume-name">${liveSession.programmeName}</span>
        <span class="home-resume-cta">Tap pour reprendre →</span>
      `;
      card.addEventListener('click', () => showScreen('seance'));
      main.appendChild(card);
    } else {
      const { ordered } = await cyclicProgrammes(cardioProgrammes);
      const next = ordered[0];
      const totalDur = next.exercises.reduce((s, e) => s + (e.duration || 0), 0);

      const card = document.createElement('div');
      card.className = 'home-next-card home-next-cardio';
      card.innerHTML = `
        <span class="home-next-label">🏃 Cardio</span>
        <span class="home-next-name">${next.name}</span>
        <span class="home-next-meta">${next.exercises.length} machine${next.exercises.length > 1 ? 's' : ''} · ${totalDur} min</span>
      `;
      card.addEventListener('click', async () => {
        await startSession(next);
        showScreen('seance');
      });
      main.appendChild(card);
    }
    if (cardioProgrammes.length > 1) {
      const other = document.createElement('button');
      other.className = 'home-other-btn';
      other.textContent = '🏃 Choisir un autre programme cardio';
      other.addEventListener('click', () => showScreen('seance'));
      main.appendChild(other);
    }
  }
}

/* ═══════════════════════════════════════════════════════
   SÉANCE SCREEN
═══════════════════════════════════════════════════════ */
let liveSession = null;
let wakeLock    = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
}
function releaseWakeLock() { wakeLock?.release(); wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && liveSession) requestWakeLock();
});

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
    msg.textContent = 'Aucun programme. Crées-en un dans Programmes.';
    const btn = document.createElement('button');
    btn.className = 'btn-secondary btn-full';
    btn.textContent = '→ Programmes';
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
    category:      liveSession.category || 'fonte',
    date:          liveSession.date,
    startedAt:     liveSession.startedAt,
    duration:      durationSecs,
    exercises:     liveSession.exercises.map(ex => {
      if (ex.type === 'cardio') {
        return {
          name:    ex.name,
          type:    'cardio',
          comment: ex.comment || '',
          duration: ex.duration,
          power:    ex.power,
          done:     ex.done,
          state:    ex.state,
        };
      }
      return {
        name:       ex.name,
        comment:    ex.comment || '',
        activities: ex.activities,
        series:     ex.series.map(s => ({
          done: ex.activities.every((_, i) => s.activityStates?.[i] === 'done'),
          values: s.values,
        })),
      };
    }),
  };
}

async function startSession(programme) {
  requestWakeLock();
  const isCardio = programme.category === 'cardio';
  const sessions   = await loadSessions();
  const prevSession = sessions
    .filter(s => s.programmeId === programme.id)
    .sort((a, b) => (b.startedAt || b.date).localeCompare(a.startedAt || a.date))[0] || null;

  liveSession = {
    id: generateId(),
    programmeId: programme.id,
    programmeName: programme.name,
    category: programme.category || 'fonte',
    date: todayIso(),
    startedAt: new Date().toISOString(),
    exercises: isCardio
      ? programme.exercises.map(ex => {
          const prevEx = prevSession?.exercises?.find(e => e.name === ex.name) || null;
          return {
            name:     ex.name,
            type:     'cardio',
            comment:  ex.comment || '',
            duration: ex.duration || 0,
            power:    ex.power    || 0,
            done:     { duration: ex.duration || 0, power: ex.power || 0 },
            prev:     prevEx?.done || null,
            state:    'pending',
          };
        })
      : programme.exercises.map(ex => {
          const m      = migrateExercise(ex);
          const sets   = ex.sets ?? m.series.length ?? (ex.count ?? 3);
          const prevEx = prevSession?.exercises?.find(e => e.name === ex.name) || null;
          return {
            name:       ex.name,
            comment:    ex.comment || '',
            activities: m.activities,
            prevSeries: prevEx?.series || null,
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

  if (liveSession.category === 'cardio') {
    renderLiveCardio(tab);
  } else {
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
  }

  document.getElementById('finish-session').addEventListener('click', finishSession);
}

function renderLiveCardio(tab) {
  liveSession.exercises.forEach((ex, exIdx) => {
    const exDiv = document.createElement('div');
    exDiv.className = 'live-exercise live-cardio-exercise';

    const nameRow = document.createElement('div');
    nameRow.className = 'live-exercise-name';
    nameRow.textContent = ex.name;
    exDiv.appendChild(nameRow);

    if (ex.comment) {
      const exComment = document.createElement('div');
      exComment.className = 'live-exercise-comment';
      exComment.textContent = ex.comment;
      exDiv.appendChild(exComment);
    }

    const fieldsRow = document.createElement('div');
    fieldsRow.className = 'live-cardio-fields';

    // Temps effectué
    const durWrap = document.createElement('div');
    durWrap.className = 'live-cardio-field';
    const durLabel = document.createElement('span');
    durLabel.className = 'live-cardio-label';
    durLabel.textContent = 'Temps';
    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.inputMode = 'numeric';
    durInput.className = 'live-cardio-input';
    durInput.value = ex.done.duration || '';
    durInput.min = '0';
    durInput.addEventListener('input', e => {
      liveSession.exercises[exIdx].done.duration = parseInt(e.target.value) || 0;
    });
    const durUnit = document.createElement('span');
    durUnit.className = 'live-cardio-unit';
    durUnit.textContent = 'min';
    durWrap.append(durLabel, durInput, durUnit);

    // Puissance
    const powWrap = document.createElement('div');
    powWrap.className = 'live-cardio-field';
    const powLabel = document.createElement('span');
    powLabel.className = 'live-cardio-label';
    powLabel.textContent = 'Puissance';
    const powInput = document.createElement('input');
    powInput.type = 'number';
    powInput.inputMode = 'numeric';
    powInput.className = 'live-cardio-input';
    powInput.value = ex.done.power || '';
    powInput.min = '0';
    powInput.addEventListener('input', e => {
      liveSession.exercises[exIdx].done.power = parseInt(e.target.value) || 0;
    });
    const powUnit = document.createElement('span');
    powUnit.className = 'live-cardio-unit';
    powUnit.textContent = 'W';
    powWrap.append(powLabel, powInput, powUnit);

    fieldsRow.append(durWrap, powWrap);
    exDiv.appendChild(fieldsRow);

    // Valeurs précédentes
    if (ex.prev) {
      const prevSpan = document.createElement('div');
      prevSpan.className = 'live-cardio-prev';
      prevSpan.textContent = `Précédent : ${ex.prev.duration || '—'} min · ${ex.prev.power || '—'} W`;
      exDiv.appendChild(prevSpan);
    }

    // Bouton état
    const stateBtn = document.createElement('button');
    stateBtn.className = `btn-sm live-cardio-state ${ex.state}`;
    stateBtn.textContent = ex.state === 'done' ? '✓ Fait' : '○ À faire';
    stateBtn.addEventListener('click', () => {
      ex.state = ex.state === 'done' ? 'pending' : 'done';
      stateBtn.textContent = ex.state === 'done' ? '✓ Fait' : '○ À faire';
      stateBtn.className = `btn-sm live-cardio-state ${ex.state}`;
    });
    exDiv.appendChild(stateBtn);

    tab.appendChild(exDiv);
  });
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

  const nameEl = document.getElementById('chrono-exercise-name');
  if (nameEl) {
    const ex = liveSession.exercises[exIdx];
    const act = ex?.activities[actIdx];
    const actName = ex.activities.length > 1 ? (act?.label || act?.name) : null;
    nameEl.textContent = [ex?.name, actName].filter(Boolean).join(' - ');
  }

  overlay.classList.remove('hidden');

  // Remplace le bouton stop pour nettoyer les anciens listeners
  const newStop = stopBtn.cloneNode(true);
  stopBtn.parentNode.replaceChild(newStop, stopBtn);
  newStop.style.display = 'none';

  // Compte à rebours 3-2-1 avant le chrono
  let countdown = 3;
  display.textContent = countdown;
  display.classList.add('chrono-countdown-active');
  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      display.textContent = countdown;
    } else {
      clearInterval(countdownInterval);
      display.classList.remove('chrono-countdown-active');
      startChrono(exIdx, sIdx, actIdx, row, display, newStop);
    }
  }, 1000);

  newStop.addEventListener('click', () => {
    clearInterval(countdownInterval);
    display.classList.remove('chrono-countdown-active');
    if (currentChronoCtx) {
      stopChronoOverlay();
    } else {
      overlay.classList.add('hidden');
    }
  });
}

function startChrono(exIdx, sIdx, actIdx, row, display, stopBtn) {
  const startTime = Date.now();
  display.textContent = '00:00';
  stopBtn.style.display = '';

  currentChronoCtx = { exIdx, sIdx, actIdx, startTime, row };

  chronoInterval = setInterval(() => {
    const el = document.getElementById('chrono-display');
    if (el) el.textContent = formatSeconds(Math.floor((Date.now() - startTime) / 1000));
  }, 500);
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
    const mAct = ex?.activities[actIdx];
    const mActPart = ex.activities.length > 1 ? (mAct?.label || mAct?.name) : null;
    nameEl.textContent = [ex?.name, mActPart].filter(Boolean).join(' - ');
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

  const displayName = ex.activities.length > 1 ? (act.label || act.name) : null;
  if (displayName) {
    const nameSpan = document.createElement('span');
    nameSpan.className = 'live-act-name';
    nameSpan.textContent = displayName;
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
      updateProgrammeTemplate(exIdx, actIdx, 'rest', val);
    });
    restInput.dataset.ex  = exIdx;
    restInput.dataset.act = actIdx;

    const sSpan = document.createElement('span');
    sSpan.className = 'live-x';
    sSpan.textContent = 's';

    const prevVal = ex.prevSeries?.[sIdx]?.values?.[actIdx];
    if (prevVal?.reps || prevVal?.weight) {
      const prevSpan = document.createElement('span');
      prevSpan.className = 'live-prev';
      prevSpan.textContent = `${prevVal.reps ?? '—'}×${prevVal.weight ?? '—'}`;
      row.append(repsInput, xSpan, wInput, kgSpan, prevSpan, reposLabel, restInput, sSpan);
    } else {
      row.append(repsInput, xSpan, wInput, kgSpan, reposLabel, restInput, sSpan);
    }
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

  // Input repos pour les activités chrono (le weight a déjà l'input inline)
  if (act.type !== 'weight') {
    const reposLabel = document.createElement('span');
    reposLabel.className = 'live-repos-label';
    reposLabel.textContent = 'Repos:';

    const restInput = document.createElement('input');
    restInput.type = 'number';
    restInput.inputMode = 'numeric';
    restInput.className = 'live-rest';
    restInput.value = act.rest ?? 0;
    restInput.min = '0';
    restInput.dataset.ex  = exIdx;
    restInput.dataset.act = actIdx;
    restInput.addEventListener('change', e => {
      const val = parseInt(e.target.value) || 0;
      liveSession.exercises[exIdx].activities[actIdx].rest = val;
      document.querySelectorAll(`.live-rest[data-ex="${exIdx}"][data-act="${actIdx}"]`)
        .forEach(inp => { inp.value = val; });
      updateProgrammeTemplate(exIdx, actIdx, 'rest', val);
    });

    const sSpan = document.createElement('span');
    sSpan.className = 'live-x';
    sSpan.textContent = 's';

    row.append(reposLabel, restInput, sSpan);
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
    const nextActPart = nextEx?.activities?.length > 1 ? (nextAct?.label || nextAct?.name) : null;
    const label   = [nextEx?.name, nextActPart].filter(Boolean).join(' - ');
    const rest    = ex.activities[actIdx]?.rest || 0;
    startCountdown(rest, label, () => advanceActivityState(nex, ns, na, nextRow));
  }
}

function propagateLiveValue(exIdx, sIdx, actIdx, field, val) {
  const series = liveSession.exercises[exIdx].series;
  series.forEach((s, j) => {
    if (j < sIdx) return;
    const isDone = s.activityStates?.[actIdx] === 'done';
    if (j === sIdx || !isDone) {
      if (!s.values[actIdx]) s.values[actIdx] = {};
      s.values[actIdx][field] = val;
    }
    if (j > sIdx && !isDone) {
      const input = document.querySelector(`.live-${field}[data-ex="${exIdx}"][data-s="${j}"][data-act="${actIdx}"]`);
      if (input) input.value = val;
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
    releaseWakeLock();
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
   COMPOSITION CORPORELLE
═══════════════════════════════════════════════════════ */
function fatCategory(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct < 10) return { label: 'Très maigre', color: '#6ab0f5' };
  if (pct < 18) return { label: 'Athlétique',  color: '#5cb85c' };
  if (pct < 25) return { label: 'Normal',       color: '#9A7A30' };
  if (pct < 30) return { label: 'Élevé',        color: '#f0ad4e' };
  return           { label: 'Obèse',            color: '#ff5c5c' };
}

function corpsTrend(data, field) {
  const points = data
    .slice(0, 10)
    .filter(m => m[field] !== null && m[field] !== undefined && m.date)
    .map(m => ({ t: new Date(m.date).getTime(), v: m[field] }))
    .reverse(); // oldest → newest
  if (points.length < 2) return null;

  const n   = points.length;
  const t0  = points[0].t;
  const xs  = points.map(p => (p.t - t0) / (1000 * 60 * 60 * 24 * 7)); // en semaines
  const ys  = points.map(p => p.v);
  const sumX  = xs.reduce((a, b) => a + b, 0);
  const sumY  = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (!denom) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  if (!isFinite(slope)) return null;

  return {
    delta:   Math.abs(slope).toFixed(2),
    up:      slope > 0,
    neutral: Math.abs(slope) < 0.05,
  };
}

async function renderCorps() {
  const body = document.getElementById('screen-corps-body');
  body.innerHTML = '';

  // ── Logo ─────────────────────────────────────────────
  const logoWrap = document.createElement('div');
  logoWrap.className = 'corps-logo-wrap';
  const logoImg = document.createElement('img');
  logoImg.src = 'icons/logo.jpg';
  logoImg.className = 'corps-logo';
  logoWrap.appendChild(logoImg);
  body.appendChild(logoWrap);

  const measurements = await loadBodyMeasurementsDB();

  // ── Formulaire ────────────────────────────────────────
  const form = document.createElement('div');
  form.className = 'corps-form';

  const fields = [
    { key: 'poids',       label: 'Poids',        unit: 'kg', step: '0.1' },
    { key: 'masseGrasse', label: 'Masse grasse',  unit: 'kg', step: '0.1' },
    { key: 'eau',         label: 'Eau',           unit: '%',  step: '0.1' },
    { key: 'muscle',      label: 'Muscle',        unit: '%',  step: '0.1' },
    { key: 'graisse',     label: 'Graisse',       unit: '%',  step: '0.1' },
    { key: 'os',          label: 'Os',            unit: '%',  step: '0.1' },
  ];

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'corps-date-input';
  dateInput.value = todayIso();
  form.appendChild(dateInput);

  const grid = document.createElement('div');
  grid.className = 'corps-grid';

  const inputs = {};
  const diffSpans = {};
  fields.forEach(({ key, label, unit, step }) => {
    const cell = document.createElement('div');
    cell.className = 'corps-field';
    const lbl = document.createElement('span');
    lbl.className = 'corps-field-label';
    lbl.textContent = label;
    const row = document.createElement('div');
    row.className = 'corps-field-row';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.inputMode = 'decimal';
    inp.step = step;
    inp.min = '0';
    inp.className = 'corps-field-input';
    inp.placeholder = '—';
    inputs[key] = inp;
    const unitSpan = document.createElement('span');
    unitSpan.className = 'corps-field-unit';
    unitSpan.textContent = unit;
    row.append(inp, unitSpan);
    if (key === 'poids' || key === 'masseGrasse') {
      const diff = document.createElement('span');
      diff.className = 'corps-field-diff';
      diffSpans[key] = diff;
      row.appendChild(diff);
    }
    cell.append(lbl, row);
    grid.appendChild(cell);
  });

  // Mapping DB snake_case → form camelCase
  const dbToForm = { poids: 'poids', masse_grasse: 'masseGrasse', eau: 'eau', muscle: 'muscle', graisse: 'graisse', os: 'os' };

  let editingId = null;

  function fillFormForDate(date) {
    const existing = measurements.find(m => m.date === date);
    // Trouver la mesure précédente (date < date sélectionnée)
    const prev = measurements.find(m => m.date < date);

    if (existing) {
      editingId = existing.id;
      for (const [dbKey, formKey] of Object.entries(dbToForm)) {
        inputs[formKey].value = existing[dbKey] ?? '';
      }
    } else {
      editingId = null;
      for (const formKey of Object.values(dbToForm)) {
        inputs[formKey].value = '';
      }
    }

    // Afficher les diffs poids / masse grasse
    showDiff('poids', existing, prev);
    showDiff('masseGrasse', existing, prev);
  }

  function showDiff(formKey, current, prev) {
    const span = diffSpans[formKey];
    if (!span) return;
    span.textContent = '';
    span.className = 'corps-field-diff';
    const dbKey = formKey === 'masseGrasse' ? 'masse_grasse' : formKey;
    const cur = current?.[dbKey];
    const prv = prev?.[dbKey];
    if (cur == null || prv == null) return;
    const delta = +(cur - prv).toFixed(1);
    if (delta === 0) return;
    span.textContent = (delta > 0 ? '+' : '') + delta;
    span.classList.add(delta > 0 ? 'diff-up' : 'diff-down');
  }

  fillFormForDate(dateInput.value);
  dateInput.addEventListener('change', () => fillFormForDate(dateInput.value));

  // Auto-calcul % graisse ↔ masse grasse
  const syncGraisse = () => {
    const p = parseFloat(inputs.poids.value);
    const mg = parseFloat(inputs.masseGrasse.value);
    const gp = parseFloat(inputs.graisse.value);
    if (p && mg && !inputs.graisse.value)
      inputs.graisse.value = ((mg / p) * 100).toFixed(1);
    else if (p && gp && !inputs.masseGrasse.value)
      inputs.masseGrasse.value = ((gp / 100) * p).toFixed(1);
  };
  inputs.poids.addEventListener('change', syncGraisse);
  inputs.masseGrasse.addEventListener('change', syncGraisse);
  inputs.graisse.addEventListener('change', syncGraisse);

  form.appendChild(grid);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary btn-full';
  saveBtn.textContent = 'Enregistrer';
  saveBtn.addEventListener('click', async () => {
    const m = {
      id:          editingId || crypto.randomUUID(),
      date:        dateInput.value || todayIso(),
      poids:       parseFloat(inputs.poids.value)       || null,
      masseGrasse: parseFloat(inputs.masseGrasse.value) || null,
      eau:         parseFloat(inputs.eau.value)         || null,
      muscle:      parseFloat(inputs.muscle.value)      || null,
      graisse:     parseFloat(inputs.graisse.value)     || null,
      os:          parseFloat(inputs.os.value)          || null,
    };
    if (!Object.values(m).slice(2).some(v => v !== null)) {
      showAlert('Renseigne au moins une valeur.'); return;
    }
    await pushBodyMeasurementDB(m);
    showToast('Mesure enregistrée ✓');
    renderCorps();
  });
  form.appendChild(saveBtn);
  body.appendChild(form);

  if (!measurements.length) {
    const empty = document.createElement('p');
    empty.className = 'home-empty';
    empty.textContent = 'Aucune mesure enregistrée.';
    body.appendChild(empty);
    return;
  }

  // ── Tableau de tendance (10 dernières) ────────────────
  const trendPoids   = corpsTrend(measurements, 'poids');
  const trendGraisse = corpsTrend(measurements, 'graisse');

  const trendItems = [
    { label: 'Poids',  field: 'poids',   unit: 'kg', lowerIsBetter: true  },
    { label: 'IMG',    field: 'graisse', unit: '%',  lowerIsBetter: true  },
    { label: 'Eau',    field: 'eau',     unit: '%',  lowerIsBetter: false },
    { label: 'Muscle', field: 'muscle',  unit: '%',  lowerIsBetter: false },
  ].map(({ label, field, unit, lowerIsBetter }) => {
    const latest = measurements.find(m => m[field] !== null && m[field] !== undefined);
    const trend  = corpsTrend(measurements, field);
    return { label, field, unit, lowerIsBetter, latest: latest?.[field], trend };
  }).filter(t => t.latest !== undefined);

  if (trendItems.length) {
    const trendWrap = document.createElement('div');
    trendWrap.className = 'corps-trend-wrap';
    const trendTitle = document.createElement('p');
    trendTitle.className = 'section-title';
    trendTitle.textContent = 'Tendance — 10 dernières mesures (/ semaine)';
    trendWrap.appendChild(trendTitle);

    const trendRow = document.createElement('div');
    trendRow.className = 'corps-trend-row';

    trendItems.forEach(({ label, field, unit, lowerIsBetter, latest, trend }) => {
      const cell = document.createElement('div');
      cell.className = 'corps-trend-cell';

      const val = document.createElement('span');
      val.className = 'corps-trend-val';
      val.textContent = `${latest}${unit}`;

      const lbl = document.createElement('span');
      lbl.className = 'corps-trend-label';
      lbl.textContent = label;

      let arrow = '';
      let arrowColor = '#666';
      if (trend && !trend.neutral) {
        arrow = trend.up ? `↑ ${trend.delta}${unit}/sem` : `↓ ${trend.delta}${unit}/sem`;
        let positive;
        if (field === 'poids' && trend.up && trendGraisse && !trendGraisse.neutral && !trendGraisse.up) {
          // Poids ↑ mais IMG ↓ → prise de muscle → vert
          positive = true;
        } else {
          positive = lowerIsBetter ? !trend.up : trend.up;
        }
        arrowColor = positive ? '#5cb85c' : '#ff5c5c';
      } else if (trend?.neutral) {
        arrow = '→ stable';
        arrowColor = '#666';
      }

      const arrowSpan = document.createElement('span');
      arrowSpan.className = 'corps-trend-arrow';
      arrowSpan.style.color = arrowColor;
      arrowSpan.textContent = arrow;

      // Catégorie graisse
      if (field === 'graisse') {
        const cat = fatCategory(latest);
        if (cat) {
          const badge = document.createElement('span');
          badge.className = 'corps-cat-badge';
          badge.style.color = cat.color;
          badge.textContent = cat.label;
          cell.append(val, lbl, arrowSpan, badge);
          trendRow.appendChild(cell);
          return;
        }
      }

      cell.append(val, lbl, arrowSpan);
      trendRow.appendChild(cell);
    });

    trendWrap.appendChild(trendRow);
    body.appendChild(trendWrap);
  }

  // ── Courbes (poids, IMG, eau, muscle) ─────────────────
  const chartDefs = [
    { field: 'poids',   label: 'Évolution du poids',   unit: 'kg' },
    { field: 'graisse', label: 'Évolution de l\'IMG',   unit: '%'  },
    { field: 'eau',     label: 'Évolution de l\'eau',   unit: '%'  },
    { field: 'muscle',  label: 'Évolution du muscle',   unit: '%'  },
  ];
  chartDefs.forEach(({ field, label, unit }) => {
    const chartData = measurements.filter(m => m[field] != null).slice(0, 20).reverse();
    if (chartData.length < 2) return;
    const chartWrap = document.createElement('div');
    chartWrap.className = 'corps-chart-wrap';
    const title = document.createElement('p');
    title.className = 'section-title';
    title.textContent = label;
    chartWrap.appendChild(title);
    const canvas = document.createElement('canvas');
    canvas.className = 'corps-chart';
    canvas.width  = 340;
    canvas.height = 120;
    chartWrap.appendChild(canvas);
    body.appendChild(chartWrap);
    requestAnimationFrame(() => drawCorpsChart(canvas, chartData, field, unit));
  });

  // ── Historique ────────────────────────────────────────
  const histTitle = document.createElement('p');
  histTitle.className = 'section-title';
  histTitle.style.marginTop = '16px';
  histTitle.textContent = 'Historique';
  body.appendChild(histTitle);

  measurements.forEach(m => {
    const card = document.createElement('div');
    card.className = 'corps-card';

    const header = document.createElement('div');
    header.className = 'corps-card-header';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'corps-card-date';
    dateSpan.textContent = formatDateFr(m.date);
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon-danger';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      showConfirm('Supprimer cette mesure ?', async () => {
        await deleteBodyMeasurementDB(m.id);
        renderCorps();
      });
    });
    header.append(dateSpan, delBtn);
    card.appendChild(header);

    // Indice masse grasse calculé si besoin
    let grPct = m.graisse;
    if (!grPct && m.poids && m.masse_grasse)
      grPct = +((m.masse_grasse / m.poids) * 100).toFixed(1);
    const cat = fatCategory(grPct);
    if (cat) {
      const badge = document.createElement('span');
      badge.className = 'corps-cat-badge';
      badge.style.color = cat.color;
      badge.style.fontSize = '12px';
      badge.style.marginBottom = '6px';
      badge.style.display = 'block';
      badge.textContent = `Graisse ${grPct}% — ${cat.label}`;
      card.appendChild(badge);
    }

    const values = document.createElement('div');
    values.className = 'corps-card-values';
    [
      { label: 'Poids',    value: m.poids,        unit: 'kg' },
      { label: 'Gr. (kg)', value: m.masse_grasse,  unit: 'kg' },
      { label: 'Eau',      value: m.eau,           unit: '%'  },
      { label: 'Muscle',   value: m.muscle,        unit: '%'  },
      { label: 'Graisse',  value: m.graisse,       unit: '%'  },
      { label: 'Os',       value: m.os,            unit: '%'  },
    ].filter(e => e.value !== null && e.value !== undefined).forEach(({ label, value, unit }) => {
      const chip = document.createElement('span');
      chip.className = 'corps-chip';
      chip.textContent = `${label} ${value}${unit}`;
      values.appendChild(chip);
    });

    card.appendChild(values);
    body.appendChild(card);
  });
}

function drawCorpsChart(canvas, data, field, unit) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = { top: 10, right: 10, bottom: 24, left: 38 };
  const iW = W - pad.left - pad.right;
  const iH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  const vals = data.map(m => m[field]);
  const spread = Math.max(...vals) - Math.min(...vals);
  const margin = spread < 0.5 ? 0.5 : spread * 0.1;
  const minV = Math.min(...vals) - margin;
  const maxV = Math.max(...vals) + margin;

  const xOf = i => pad.left + (i / (data.length - 1)) * iW;
  const yOf = v => pad.top + iH - ((v - minV) / (maxV - minV)) * iH;

  // Grille
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1;
  [0, 0.5, 1].forEach(t => {
    const y = pad.top + iH * (1 - t);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText((minV + t * (maxV - minV)).toFixed(1), pad.left - 4, y + 4);
  });

  // Ligne
  ctx.beginPath();
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#9A7A30';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  data.forEach((m, i) => {
    i === 0 ? ctx.moveTo(xOf(i), yOf(m[field])) : ctx.lineTo(xOf(i), yOf(m[field]));
  });
  ctx.stroke();

  // Points + dates
  data.forEach((m, i) => {
    ctx.beginPath();
    ctx.arc(xOf(i), yOf(m[field]), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#9A7A30';
    ctx.fill();

    if (i === 0 || i === data.length - 1) {
      ctx.fillStyle = '#666';
      ctx.font = '9px monospace';
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(m.date.slice(5), xOf(i), H - 4);
    }
  });
}

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
  const section = statsSection('Progression par exercice');

  const names = [...new Set(sessions.flatMap(s => s.exercises.map(e => e.name)))].sort();
  if (!names.length) return section;

  // Calcul des données par exercice — poids max + volume par séance
  const machineData = names.map(name => {
    let muscle = '';
    const points = sessions.map(s => {
      const ex = s.exercises.find(e => e.name === name);
      if (!ex) return null;
      const e = migrateExercise(ex);
      if (!muscle && e.activities?.[0]?.name) muscle = e.activities[0].name;
      let maxWeight = 0, volume = 0, maxReps = 0;
      e.series.filter(se => se.done !== false).forEach(set => {
        e.activities.forEach((act, i) => {
          if (act.type !== 'weight') return;
          const v = set.values?.[i] || {};
          const w = v.weight || 0, r = v.reps || 0;
          if (w > maxWeight) maxWeight = w;
          if (r > maxReps) maxReps = r;
          volume += w * r;
        });
      });
      if (!maxWeight && !volume) return null;
      return { date: s.date, weight: maxWeight, volume, reps: maxReps };
    }).filter(Boolean);
    return { name, muscle, points };
  }).filter(d => d.points.length >= 1);

  if (!machineData.length) return section;

  // Muscles pills
  const muscles = ['Tous', ...[...new Set(machineData.map(d => d.muscle).filter(Boolean))].sort()];
  const pills = document.createElement('div');
  pills.className = 'stats-pills';
  muscles.forEach(m => {
    const pill = document.createElement('button');
    pill.className = 'stats-pill' + (m === 'Tous' ? ' active' : '');
    pill.textContent = m;
    pill.dataset.muscle = m;
    pills.appendChild(pill);
  });
  section.appendChild(pills);

  // Exercise swap selector
  const swapBar = document.createElement('div');
  swapBar.className = 'stats-swap';
  const prevBtn = document.createElement('button');
  prevBtn.className = 'stats-swap-btn';
  prevBtn.textContent = '‹';
  const swapName = document.createElement('span');
  swapName.className = 'stats-swap-name';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'stats-swap-btn';
  nextBtn.textContent = '›';
  swapBar.appendChild(prevBtn);
  swapBar.appendChild(swapName);
  swapBar.appendChild(nextBtn);
  section.appendChild(swapBar);

  const swapCounter = document.createElement('div');
  swapCounter.className = 'stats-swap-counter';
  section.appendChild(swapCounter);

  // Metric toggle (poids / volume / reps)
  const metricPills = document.createElement('div');
  metricPills.className = 'stats-metric-pills';
  ['Poids max', 'Volume', 'Reps max'].forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'stats-metric-pill' + (i === 0 ? ' active' : '');
    btn.textContent = label;
    btn.dataset.metric = ['weight', 'volume', 'reps'][i];
    metricPills.appendChild(btn);
  });
  section.appendChild(metricPills);

  // Graph container
  const graphWrap = document.createElement('div');
  graphWrap.className = 'stats-graph-wrap';
  section.appendChild(graphWrap);

  // Summary line
  const summaryLine = document.createElement('div');
  summaryLine.className = 'stats-progression-summary';
  section.appendChild(summaryLine);

  let filtered = machineData;
  let activeMetric = 'weight';
  let currentIdx = 0;

  function updateSwapUI() {
    const data = filtered[currentIdx];
    swapName.textContent = data ? data.name : '—';
    swapCounter.textContent = filtered.length > 1 ? `${currentIdx + 1} / ${filtered.length}` : '';
    prevBtn.disabled = currentIdx <= 0;
    nextBtn.disabled = currentIdx >= filtered.length - 1;
  }

  function populateSelect(data) {
    currentIdx = 0;
    updateSwapUI();
  }

  function metricUnit(metric) {
    return metric === 'weight' ? 'kg' : metric === 'volume' ? 'kg' : 'reps';
  }

  function metricValue(pt, metric) {
    return metric === 'weight' ? pt.weight : metric === 'volume' ? pt.volume : pt.reps;
  }

  function renderGraph() {
    graphWrap.innerHTML = '';
    summaryLine.innerHTML = '';
    updateSwapUI();
    const data = filtered[currentIdx];
    if (!data) { graphWrap.innerHTML = '<p class="stats-no-data">Aucune donnée</p>'; return; }

    const points = data.points;
    const unit = metricUnit(activeMetric);
    const vals = points.map(p => metricValue(p, activeMetric));

    // Summary
    const first = vals[0], last = vals[vals.length - 1];
    const delta = last - first;
    const deltaStr = delta === 0 ? '=' : `${delta > 0 ? '+' : ''}${activeMetric === 'volume' ? Math.round(delta) : delta.toFixed(1)} ${unit}`;
    const deltaClass = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
    summaryLine.innerHTML = `
      <span class="stats-prog-start">${activeMetric === 'volume' ? Math.round(first) : first} ${unit}</span>
      <span class="stats-machine-arrow">→</span>
      <span class="stats-prog-current">${activeMetric === 'volume' ? Math.round(last) : last} ${unit}</span>
      <span class="stats-delta ${deltaClass}">${deltaStr}</span>
    `;

    if (points.length < 2) {
      graphWrap.innerHTML = '<p class="stats-no-data">Pas assez de données pour un graphique</p>';
      return;
    }

    const W = 340, H = 180;
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const pad = { t: 16, b: 34, l: 44, r: 12 };
    const x = i => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
    const y = v => pad.t + (1 - (v - minV) / range) * (H - pad.t - pad.b);

    // Grid lines (3 horizontal)
    const gridLines = [minV, minV + range / 2, maxV];
    const gridSvg = gridLines.map(v =>
      `<line x1="${pad.l}" y1="${y(v).toFixed(1)}" x2="${W - pad.r}" y2="${y(v).toFixed(1)}" stroke="#1a1a1a" stroke-width="1"/>
       <text x="${pad.l - 6}" y="${y(v).toFixed(1)}" dy="3.5" text-anchor="end" font-size="10" fill="#555">${activeMetric === 'volume' ? Math.round(v) : v}${unit === 'reps' ? '' : ''}</text>`
    ).join('');

    // Area fill
    const areaPath = `M${x(0).toFixed(1)},${y(vals[0]).toFixed(1)} ` +
      vals.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') +
      ` L${x(vals.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;

    const linePath = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

    // Date labels — first, middle, last
    const dateIdxs = [0, Math.floor(points.length / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    const dateLbls = dateIdxs.map(i =>
      `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#555">${points[i].date.slice(5).replace('-', '/')}</text>`
    ).join('');

    const circlesSvg = vals.map((v, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="#9A7A30" stroke="#0f0f0f" stroke-width="1.5"/>`
    ).join('');

    graphWrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="stats-svg stats-svg--large">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#9A7A30" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#9A7A30" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" stroke="#2a2a2a" stroke-width="1"/>
        ${gridSvg}
        <path d="${areaPath}" fill="url(#areaGrad)"/>
        <path d="${linePath}" fill="none" stroke="#9A7A30" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${circlesSvg}
        ${dateLbls}
      </svg>
    `;
  }

  populateSelect(machineData);
  renderGraph();

  prevBtn.addEventListener('click', () => {
    if (currentIdx > 0) { currentIdx--; renderGraph(); }
  });
  nextBtn.addEventListener('click', () => {
    if (currentIdx < filtered.length - 1) { currentIdx++; renderGraph(); }
  });

  // Swipe support (mobile)
  let touchStartX = 0;
  graphWrap.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  graphWrap.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && currentIdx < filtered.length - 1) { currentIdx++; renderGraph(); }
    else if (dx > 0 && currentIdx > 0) { currentIdx--; renderGraph(); }
  }, { passive: true });

  metricPills.addEventListener('click', e => {
    const btn = e.target.closest('.stats-metric-pill');
    if (!btn) return;
    metricPills.querySelectorAll('.stats-metric-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMetric = btn.dataset.metric;
    renderGraph();
  });

  pills.addEventListener('click', e => {
    const pill = e.target.closest('.stats-pill');
    if (!pill) return;
    pills.querySelectorAll('.stats-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const muscle = pill.dataset.muscle;
    filtered = muscle === 'Tous' ? machineData : machineData.filter(d => d.muscle === muscle);
    populateSelect(filtered);
    renderGraph();
  });

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
        <span class="param-row-name">${prog.category === 'cardio' ? '🏃' : '🏋️'} ${prog.name}</span>
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

  const currentCat = programme?.category || 'fonte';

  const catWrap = document.createElement('div');
  catWrap.className = 'prog-category-toggle';

  const exercisesList = document.createElement('div');
  exercisesList.id = 'prog-exercises-list';
  exercisesList.style.display = 'flex';
  exercisesList.style.flexDirection = 'column';
  exercisesList.style.gap = '12px';

  const addExBtn = document.createElement('button');
  addExBtn.className = 'btn-secondary btn-full';
  addExBtn.textContent = '+ Exercice';

  function getActiveCat() {
    return catWrap.querySelector('.prog-cat-btn.active')?.dataset.cat || 'fonte';
  }

  function fillExercises(cat, exercises) {
    exercisesList.innerHTML = '';
    if (cat === 'cardio') {
      if (exercises?.length) {
        exercises.forEach(ex => exercisesList.appendChild(makeCardioExerciseCard({
          name: ex.name || '', duration: ex.duration ?? '', power: ex.power ?? '', comment: ex.comment || '',
        })));
      } else {
        exercisesList.appendChild(makeCardioExerciseCard());
      }
    } else {
      if (exercises?.length) {
        exercises.forEach(ex => {
          const m = migrateExercise(ex);
          const acts = m.activities.map(act => ({
            type: act.type, label: act.label || '', name: act.name || '',
            reps: act.type === 'weight' ? (act.reps ?? '') : '',
            weight: act.type === 'weight' ? (act.weight ?? '') : '',
            duration: act.type !== 'weight' ? (act.duration ?? '') : '',
            rest: act.rest ?? '',
          }));
          exercisesList.appendChild(makeExerciseCard({
            name: ex.name || '', sets: ex.sets || m.series?.length || ex.count || 3,
            activities: acts, comment: ex.comment || '',
          }));
        });
      } else {
        exercisesList.appendChild(makeExerciseCard());
      }
    }
  }

  ['fonte', 'cardio'].forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'prog-cat-btn' + (currentCat === cat ? ' active' : '');
    btn.dataset.cat = cat;
    btn.textContent = cat === 'fonte' ? '🏋️ Fonte' : '🏃 Cardio';
    btn.addEventListener('click', () => {
      if (getActiveCat() === cat) return;
      catWrap.querySelectorAll('.prog-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fillExercises(cat, null);
    });
    catWrap.appendChild(btn);
  });
  tab.appendChild(catWrap);

  fillExercises(currentCat, programme?.exercises);
  tab.appendChild(exercisesList);

  addExBtn.addEventListener('click', () => {
    exercisesList.appendChild(getActiveCat() === 'cardio' ? makeCardioExerciseCard() : makeExerciseCard());
  });
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

  const category = document.querySelector('.prog-cat-btn.active')?.dataset.cat || 'fonte';
  const exercises = Array.from(cards).map(category === 'cardio' ? readCardioExerciseCard : readExerciseCard);

  const programmes = await loadProgrammes();
  if (existingId) {
    await updateProgrammeDB({ id: existingId, name, category, exercises });
  } else {
    await upsertProgrammeDB({ id: crypto.randomUUID(), name, category, exercises, ordre: programmes.length });
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
    if (profile?.state && profile.state !== 'connected') {
      await db.from('profiles').update({ state: 'connected' }).eq('id', currentUser.id);
    }
    currentProfile = profile;
    showScreen('home');
  });

}


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
