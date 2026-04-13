/* ═══════════════════════════════════════════════════════
   VERSION
═══════════════════════════════════════════════════════ */
const APP_VERSION = '2026.avril.13';
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
  if (state === 'locked') return '🔒';
  return '○';
}

function isSeriesLocked(exIdx, sIdx) {
  if (sIdx === 0) return false;
  const ex = liveSession.exercises[exIdx];
  const prevSet = ex.series[sIdx - 1];
  return !ex.activities.every((_, i) => prevSet.activityStates?.[i] === 'done');
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
    stopAllChronos();
    stopCountdown();
    pushSession(liveSessionSnapshot()).catch(() => {});
    showScreen('home');
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
        <button class="home-resume-icon home-resume-icon--delete" title="Supprimer">🗑</button>
        <div class="home-resume-center">
          <span class="home-resume-label">🏋️ Séance en cours</span>
          <span class="home-resume-name">${liveSession.programmeName}</span>
        </div>
        <button class="home-resume-icon home-resume-icon--finish" title="Terminer">✅</button>
      `;
      card.querySelector('.home-resume-center').addEventListener('click', () => showScreen('seance'));
      card.querySelector('.home-resume-icon--delete').addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirm('Supprimer cette séance ?', async () => {
          await deleteSessionDB(liveSession.id);
          liveSession = null;
          showScreen('home');
        });
      });
      card.querySelector('.home-resume-icon--finish').addEventListener('click', (e) => {
        e.stopPropagation();
        finishSession();
      });
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
        <button class="home-resume-icon home-resume-icon--delete" title="Supprimer">🗑</button>
        <div class="home-resume-center">
          <span class="home-resume-label">🏃 Séance en cours</span>
          <span class="home-resume-name">${liveSession.programmeName}</span>
        </div>
        <button class="home-resume-icon home-resume-icon--finish" title="Terminer">✅</button>
      `;
      card.querySelector('.home-resume-center').addEventListener('click', () => showScreen('seance'));
      card.querySelector('.home-resume-icon--delete').addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirm('Supprimer cette séance ?', async () => {
          await deleteSessionDB(liveSession.id);
          liveSession = null;
          showScreen('home');
        });
      });
      card.querySelector('.home-resume-icon--finish').addEventListener('click', (e) => {
        e.stopPropagation();
        finishSession();
      });
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
    sync:          liveSession.sync || null,
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
          activityStates: s.activityStates || {},
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
  startSyncPolling();
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
  if (set.activityStates[actIdx] === undefined) {
    // Backward compat: if series was marked done before activityStates existed
    set.activityStates[actIdx] = (set.done || set.state === 'done') ? 'done' : 'pending';
  }

  const state = set.activityStates[actIdx];
  const locked = state !== 'done' && isSeriesLocked(exIdx, sIdx);
  const displayState = locked ? 'locked' : state;
  const row = document.createElement('div');
  row.className = `live-series-row ${displayState}`;
  row.dataset.ex  = exIdx;
  row.dataset.s   = sIdx;
  row.dataset.act = actIdx;

  const stateBtn = document.createElement('button');
  stateBtn.className = 'series-state-btn';
  stateBtn.textContent = stateIcon(displayState);
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

  // ── Display mode (read-only) ──
  const valuesSpan = document.createElement('span');
  valuesSpan.className = 'live-values';

  if (act.type === 'weight') {
    const reps   = v.reps   ?? act.reps   ?? 0;
    const weight = v.weight ?? act.weight ?? 0;
    const rest   = act.rest ?? 0;
    valuesSpan.innerHTML = `<b>${reps}</b> <span class="live-x">×</span> <b>${weight}</b> <span class="live-kg">kg</span>`
      + (rest ? `<span class="live-rest-display">repos ${rest}s</span>` : '');
  } else if (act.type === 'countdown') {
    const dur = v.duration ?? act.duration ?? 0;
    const rest = act.rest ?? 0;
    valuesSpan.innerHTML = `<b>${dur}</b><span class="live-x">s</span>`
      + (rest ? `<span class="live-rest-display">repos ${rest}s</span>` : '');
  } else {
    const resultSpan = document.createElement('span');
    resultSpan.className = 'live-chrono-result';
    resultSpan.dataset.act = actIdx;
    resultSpan.textContent = v.duration ? formatSeconds(v.duration) : '⏱';
    valuesSpan.appendChild(resultSpan);
  }

  row.appendChild(valuesSpan);

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'live-edit-btn';
  editBtn.textContent = '✎';
  row.appendChild(editBtn);

  // ── Edit mode (hidden by default) ──
  const editZone = document.createElement('div');
  editZone.className = 'live-edit-zone hidden';

  if (act.type === 'weight') {
    editZone.innerHTML = `
      <label>Reps<input type="number" inputmode="decimal" class="live-reps" value="${v.reps ?? act.reps ?? 0}" min="1"
        data-ex="${exIdx}" data-s="${sIdx}" data-act="${actIdx}"></label>
      <label>Poids<input type="number" inputmode="decimal" class="live-weight" value="${v.weight ?? act.weight ?? 0}" min="0" step="0.5"
        data-ex="${exIdx}" data-s="${sIdx}" data-act="${actIdx}"></label>
      <label>Repos<input type="number" inputmode="numeric" class="live-rest" value="${act.rest ?? 0}" min="0"
        data-ex="${exIdx}" data-act="${actIdx}">s</label>
    `;
  } else if (act.type === 'countdown') {
    editZone.innerHTML = `
      <label>Durée<input type="number" inputmode="numeric" class="live-duration" value="${v.duration ?? act.duration ?? 0}" min="1"
        data-ex="${exIdx}" data-s="${sIdx}" data-act="${actIdx}">s</label>
      <label>Repos<input type="number" inputmode="numeric" class="live-rest" value="${act.rest ?? 0}" min="0"
        data-ex="${exIdx}" data-act="${actIdx}">s</label>
    `;
  }

  // Confirm button inside edit zone
  if (act.type !== 'stopwatch') {
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'live-edit-confirm';
    confirmBtn.textContent = 'OK';
    editZone.appendChild(confirmBtn);

    const originalWeight = v.weight ?? act.weight ?? 0;

    function applyWeightEdit() {
      const rI = editZone.querySelector('.live-reps');
      const wI = editZone.querySelector('.live-weight');
      const restI = editZone.querySelector('.live-rest');
      propagateLiveValue(exIdx, sIdx, actIdx, 'reps', parseFloat(rI.value) || 0);
      propagateLiveValue(exIdx, sIdx, actIdx, 'weight', parseFloat(wI.value) || 0);
      const restVal = parseInt(restI.value) || 0;
      liveSession.exercises[exIdx].activities[actIdx].rest = restVal;
      document.querySelectorAll(`.live-rest[data-ex="${exIdx}"][data-act="${actIdx}"]`)
        .forEach(inp => { inp.value = restVal; });
      updateProgrammeTemplate(exIdx, actIdx, 'rest', restVal);
      const r = parseFloat(rI.value) || 0, w = parseFloat(wI.value) || 0;
      valuesSpan.innerHTML = `<b>${r}</b> <span class="live-x">×</span> <b>${w}</b> <span class="live-kg">kg</span>`
        + (restVal ? `<span class="live-rest-display">repos ${restVal}s</span>` : '');
      editZone.classList.add('hidden');
      editBtn.classList.remove('hidden');
      pushSession(liveSessionSnapshot()).catch(() => {});
    }

    confirmBtn.addEventListener('click', () => {
      // Save values from inputs
      if (act.type === 'weight') {
        const newWeight = parseFloat(editZone.querySelector('.live-weight').value) || 0;
        if (newWeight < originalWeight && originalWeight > 0) {
          showConfirm(`Réduire le poids de ${originalWeight} kg à ${newWeight} kg ?`, applyWeightEdit);
          return;
        }
        applyWeightEdit();
        return;
      } else {
        const dI = editZone.querySelector('.live-duration');
        const restI = editZone.querySelector('.live-rest');
        liveSession.exercises[exIdx].series[sIdx].values[actIdx].duration = parseInt(dI.value) || 0;
        const restVal = parseInt(restI.value) || 0;
        liveSession.exercises[exIdx].activities[actIdx].rest = restVal;
        document.querySelectorAll(`.live-rest[data-ex="${exIdx}"][data-act="${actIdx}"]`)
          .forEach(inp => { inp.value = restVal; });
        updateProgrammeTemplate(exIdx, actIdx, 'rest', restVal);
        valuesSpan.innerHTML = `<b>${parseInt(dI.value) || 0}</b><span class="live-x">s</span>`
          + (restVal ? `<span class="live-rest-display">repos ${restVal}s</span>` : '');
      }
      editZone.classList.add('hidden');
      editBtn.classList.remove('hidden');
      pushSession(liveSessionSnapshot()).catch(() => {});
    });
  }

  row.appendChild(editZone);

  editBtn.addEventListener('click', () => {
    editZone.classList.remove('hidden');
    editBtn.classList.add('hidden');
    const firstInput = editZone.querySelector('input');
    if (firstInput) { firstInput.focus(); firstInput.select(); }
  });

  // ── Previous session line ──
  const prevVal = ex.prevSeries?.[sIdx]?.values?.[actIdx];
  if (act.type === 'weight' && (prevVal?.reps || prevVal?.weight)) {
    const prevLine = document.createElement('div');
    prevLine.className = 'live-prev-line';
    prevLine.textContent = `Préc: ${prevVal.reps ?? '—'} × ${prevVal.weight ?? '—'} kg`;
    row.appendChild(prevLine);
  } else if (act.type === 'countdown' && prevVal?.duration) {
    const prevLine = document.createElement('div');
    prevLine.className = 'live-prev-line';
    prevLine.textContent = `Préc: ${prevVal.duration} s`;
    row.appendChild(prevLine);
  } else if (act.type === 'stopwatch' && prevVal?.duration) {
    const prevLine = document.createElement('div');
    prevLine.className = 'live-prev-line';
    prevLine.textContent = `Préc: ${formatSeconds(prevVal.duration)}`;
    row.appendChild(prevLine);
  }

  return row;
}

function advanceActivityState(exIdx, sIdx, actIdx, row) {
  if (isSeriesLocked(exIdx, sIdx)) return;
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

  // Check if current series is fully done → unlock next series
  const seriesDone = ex.activities.every((_, i) => set.activityStates?.[i] === 'done');
  if (seriesDone && sIdx + 1 < ex.series.length) {
    ex.activities.forEach((_, ai) => {
      const lockedRow = document.querySelector(`.live-series-row[data-ex="${exIdx}"][data-s="${sIdx + 1}"][data-act="${ai}"]`);
      if (lockedRow && lockedRow.classList.contains('locked')) {
        lockedRow.classList.remove('locked');
        lockedRow.classList.add('pending');
        const btn = lockedRow.querySelector('.series-state-btn');
        if (btn) btn.textContent = stateIcon('pending');
      }
    });
  }

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
  const ex = liveSession.exercises[exIdx];
  const series = ex.series;
  series.forEach((s, j) => {
    if (j < sIdx) return;
    const isDone = s.activityStates?.[actIdx] === 'done';
    if (j === sIdx || !isDone) {
      if (!s.values[actIdx]) s.values[actIdx] = {};
      s.values[actIdx][field] = val;
    }
    if (j > sIdx && !isDone) {
      // Update hidden edit inputs
      const input = document.querySelector(`.live-${field}[data-ex="${exIdx}"][data-s="${j}"][data-act="${actIdx}"]`);
      if (input) input.value = val;
      // Update display text
      const row = document.querySelector(`.live-series-row[data-ex="${exIdx}"][data-s="${j}"][data-act="${actIdx}"]`);
      if (row) refreshRowDisplay(row, exIdx, j, actIdx);
    }
  });
  updateProgrammeTemplate(exIdx, actIdx, field, val);
}

function refreshRowDisplay(row, exIdx, sIdx, actIdx) {
  const ex  = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const v   = ex.series[sIdx].values?.[actIdx] || {};
  const display = row.querySelector('.live-values');
  if (!display) return;
  if (act.type === 'weight') {
    const r = v.reps ?? 0, w = v.weight ?? 0, rest = act.rest ?? 0;
    display.innerHTML = `<b>${r}</b> <span class="live-x">×</span> <b>${w}</b> <span class="live-kg">kg</span>`
      + (rest ? `<span class="live-rest-display">repos ${rest}s</span>` : '');
  } else if (act.type === 'countdown') {
    const d = v.duration ?? 0, rest = act.rest ?? 0;
    display.innerHTML = `<b>${d}</b><span class="live-x">s</span>`
      + (rest ? `<span class="live-rest-display">repos ${rest}s</span>` : '');
  }
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
    stopSyncPolling();
    const durationSecs = Math.round((Date.now() - new Date(liveSession.startedAt).getTime()) / 1000);
    pushSession(liveSessionSnapshot(durationSecs)).catch(() => {});
    liveSession = null;
    releaseWakeLock();
    stopCountdown();
    showScreen('home');
  });
}

/* ═══════════════════════════════════════════════════════
   SYNC POLLING — bidirectionnel avec la montre
═══════════════════════════════════════════════════════ */
let syncPollTimer = null;

function startSyncPolling() {
  stopSyncPolling();
  syncPollTimer = setInterval(syncFromDB, 500);
}

function stopSyncPolling() {
  if (syncPollTimer) { clearInterval(syncPollTimer); syncPollTimer = null; }
}

async function syncFromDB() {
  if (!liveSession) return;
  try {
    const sessions = await loadSessions();
    const remote = sessions.find(s => s.id === liveSession.id);
    if (!remote) return;

    // Session terminee sur la montre ?
    if (remote.duration && remote.duration > 0) {
      liveSession = null;
      stopCountdown();
      stopAllChronos();
      stopSyncPolling();
      showScreen('home');
      return;
    }

    let changed = false;
    remote.exercises.forEach((dbEx, exIdx) => {
      const localEx = liveSession.exercises[exIdx];
      if (!localEx) return;

      // Cardio sync
      if (dbEx.type === 'cardio' && localEx.type === 'cardio') {
        if (dbEx.state !== localEx.state) { localEx.state = dbEx.state; changed = true; }
        if (dbEx.done?.duration !== localEx.done?.duration || dbEx.done?.power !== localEx.done?.power) {
          localEx.done = dbEx.done; changed = true;
        }
        return;
      }

      // Fonte sync
      const eDb = migrateExercise(dbEx);
      eDb.series.forEach((dbSet, sIdx) => {
        const localSet = localEx.series?.[sIdx];
        if (!localSet) return;
        const dbStates = dbSet.activityStates || {};
        localEx.activities?.forEach((_, actIdx) => {
          // Sync states (done > active > pending)
          const dbState = dbStates[actIdx];
          const localState = localSet.activityStates?.[actIdx];
          if (dbState === 'done' && localState !== 'done') {
            if (!localSet.activityStates) localSet.activityStates = {};
            localSet.activityStates[actIdx] = 'done';
            changed = true;
          } else if (dbState === 'active' && localState === 'pending') {
            if (!localSet.activityStates) localSet.activityStates = {};
            localSet.activityStates[actIdx] = 'active';
            changed = true;
          }
        });
        // Sync values
        (dbSet.values || []).forEach((dbVal, actIdx) => {
          const localVal = localSet.values?.[actIdx];
          if (!localVal) return;
          if (dbVal.reps !== localVal.reps || dbVal.weight !== localVal.weight) {
            localSet.values[actIdx] = { ...dbVal };
            changed = true;
          }
        });
      });
    });

    // Sync countdown from watch
    if (remote.sync?.type === 'rest' && !countdownTimer) {
      const elapsed = (Date.now() - new Date(remote.sync.startedAt).getTime()) / 1000;
      const remaining = Math.round(remote.sync.duration - elapsed);
      if (remaining > 0) {
        liveSession.sync = remote.sync;
        startCountdown(remaining, remote.sync.label, null);
      }
    }

    if (changed) renderSeanceScreen();
  } catch { /* network error, skip */ }
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

  // Sync countdown to watch
  if (liveSession) {
    liveSession.sync = { type: 'rest', startedAt: new Date().toISOString(), duration: seconds, label: nextLabel || '' };
    pushSession(liveSessionSnapshot()).catch(() => {});
  }

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
  if (liveSession?.sync?.type === 'rest') {
    liveSession.sync = null;
    pushSession(liveSessionSnapshot()).catch(() => {});
  }
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
    category:      session.category || 'fonte',
    date:          session.date,
    startedAt:     session.startedAt,
    exercises:     session.exercises.map(ex => {
      const e = migrateExercise(ex);
      return {
        name:       e.name,
        comment:    e.comment || '',
        activities: e.activities,
        series:     e.series.map(s => ({
          state: s.state || (s.done ? 'done' : 'pending'),
          activityStates: s.activityStates || {},
          values: s.values,
        })),
      };
    }),
  };
  closeModal();
  startSyncPolling();
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

  body.appendChild(buildStatsProgression(sessions));
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

function exoMetrics(ex, session) {
  const e = migrateExercise(ex);
  let volume = 0, best1RM = 0;
  e.series.filter(s => s.done !== false).forEach(set => {
    e.activities.forEach((act, i) => {
      if (act.type !== 'weight') return;
      const v = set.values?.[i] || {};
      const w = v.weight || 0, r = v.reps || 0;
      volume += w * r;
      const rm = w * (1 + r / 30);
      if (rm > best1RM) best1RM = rm;
    });
  });
  return { date: session.date, volume, e1rm: Math.round(best1RM * 10) / 10 };
}

const CHART_COLORS = [
  '#9A7A30', '#4caf50', '#2196f3', '#e53e3e', '#ff9800',
  '#9c27b0', '#00bcd4', '#8bc34a', '#ff5722', '#607d8b',
];

function buildStatsProgression(sessions) {
  const section = statsSection('Progression');

  const progNames = [...new Set(sessions.map(s => s.programmeName).filter(Boolean))].sort();
  if (!progNames.length) return section;

  // Programme pills
  const pills = document.createElement('div');
  pills.className = 'stats-prog-pills';
  progNames.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className = 'stats-prog-pill' + (i === 0 ? ' active' : '');
    btn.textContent = name;
    btn.dataset.prog = name;
    pills.appendChild(btn);
  });
  section.appendChild(pills);

  // Volume / 1RM toggle
  const toggle = document.createElement('div');
  toggle.className = 'stats-metric-toggle';
  ['Volume total', '1RM estimé'].forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'stats-metric-btn' + (i === 0 ? ' active' : '');
    btn.textContent = label;
    btn.dataset.metric = i === 0 ? 'volume' : 'e1rm';
    toggle.appendChild(btn);
  });
  section.appendChild(toggle);

  // Cards container
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'stats-cards-grid';
  section.appendChild(cardsGrid);

  // Chart container
  const chartWrap = document.createElement('div');
  chartWrap.className = 'stats-chart-wrap';
  const canvas = document.createElement('canvas');
  chartWrap.appendChild(canvas);
  section.appendChild(chartWrap);

  let activeProg = progNames[0];
  let activeMetric = 'volume';
  let chartInstance = null;

  function buildExoData(progName) {
    const progSessions = sessions.filter(s => s.programmeName === progName);
    const exoNames = [...new Set(progSessions.flatMap(s => (s.exercises || []).map(e => e.name)))].sort();

    return exoNames.map(name => {
      const points = progSessions.map(s => {
        const ex = (s.exercises || []).find(e => e.name === name);
        if (!ex) return null;
        return exoMetrics(ex, s);
      }).filter(Boolean);
      return { name, points };
    }).filter(d => d.points.length >= 1);
  }

  function render() {
    const exoData = buildExoData(activeProg);
    const unit = 'kg';

    // Cards
    cardsGrid.innerHTML = '';
    exoData.forEach(exo => {
      if (!exo.points.length) return;
      const first = exo.points[0][activeMetric];
      const last = exo.points[exo.points.length - 1][activeMetric];
      const delta = first > 0 ? ((last - first) / first * 100) : 0;
      const deltaClass = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
      const deltaStr = delta === 0 ? '=' : `${delta > 0 ? '+' : ''}${Math.round(delta)}%`;
      const fmt = v => activeMetric === 'volume' ? Math.round(v) : v.toFixed(1);

      const card = document.createElement('div');
      card.className = 'stats-exo-card';
      card.innerHTML = `
        <span class="stats-exo-name">${exo.name}</span>
        <div class="stats-exo-values">
          <span class="stats-exo-start">${fmt(first)}</span>
          <span class="stats-exo-arrow">→</span>
          <span class="stats-exo-end">${fmt(last)} ${unit}</span>
          <span class="stats-exo-delta ${deltaClass}">${deltaStr}</span>
        </div>
      `;
      cardsGrid.appendChild(card);
    });

    // Chart
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const multiPointExos = exoData.filter(d => d.points.length >= 2);
    if (!multiPointExos.length) {
      chartWrap.style.display = 'none';
      return;
    }
    chartWrap.style.display = 'block';

    const allDates = [...new Set(multiPointExos.flatMap(d => d.points.map(p => p.date)))].sort();

    const datasets = multiPointExos.map((exo, i) => {
      const color = CHART_COLORS[i % CHART_COLORS.length];
      const dateMap = {};
      exo.points.forEach(p => { dateMap[p.date] = p[activeMetric]; });
      return {
        label: exo.name,
        data: allDates.map(d => dateMap[d] ?? null),
        borderColor: color,
        backgroundColor: color + '33',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.3,
        spanGaps: true,
      };
    });

    chartInstance = new Chart(canvas, {
      type: 'line',
      data: { labels: allDates.map(d => d.slice(5).replace('-', '/')), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#888', font: { family: "'DM Mono', monospace", size: 10 }, boxWidth: 10, padding: 8 },
          },
          tooltip: {
            backgroundColor: '#1a1a1a',
            borderColor: '#2e2e2e',
            borderWidth: 1,
            titleColor: '#f0f0f0',
            bodyColor: '#f0f0f0',
            titleFont: { family: "'DM Mono', monospace", size: 11 },
            bodyFont: { family: "'DM Mono', monospace", size: 11 },
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${activeMetric === 'volume' ? Math.round(ctx.parsed.y) : ctx.parsed.y.toFixed(1)} ${unit}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#555', font: { family: "'DM Mono', monospace", size: 9 }, maxRotation: 45 },
            grid: { color: '#1a1a1a' },
          },
          y: {
            ticks: {
              color: '#555',
              font: { family: "'DM Mono', monospace", size: 9 },
              callback: v => activeMetric === 'volume' ? Math.round(v) : v.toFixed(1),
            },
            grid: { color: '#1a1a1a' },
          },
        },
      },
    });
  }

  render();

  // Programme pill click
  pills.addEventListener('click', e => {
    const btn = e.target.closest('.stats-prog-pill');
    if (!btn) return;
    pills.querySelectorAll('.stats-prog-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeProg = btn.dataset.prog;
    render();
  });

  // Metric toggle click
  toggle.addEventListener('click', e => {
    const btn = e.target.closest('.stats-metric-btn');
    if (!btn) return;
    toggle.querySelectorAll('.stats-metric-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMetric = btn.dataset.metric;
    render();
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

    const watchBtn = document.createElement('button');
    watchBtn.className = 'btn-secondary btn-full';
    watchBtn.textContent = '⌚ Connecter la montre';
    watchBtn.addEventListener('click', async () => {
      watchBtn.textContent = '⌚ ...';
      try {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const { data: { session } } = await db.auth.getSession();
        if (!session) { watchBtn.textContent = '⌚ Erreur session'; return; }
        // Supprimer les anciens codes de cet utilisateur
        await db.from('watch_codes').delete().eq('user_id', currentUser.id);
        // Insérer le nouveau code
        const { error } = await db.from('watch_codes').insert({
          user_id: currentUser.id,
          code,
          refresh_token: session.refresh_token,
        });
        if (error) { watchBtn.textContent = '⌚ Erreur: ' + error.message; return; }
        watchBtn.textContent = `Code : ${code}`;
      } catch (e) { watchBtn.textContent = '⌚ Erreur: ' + e.message; return; }
      watchBtn.style.cssText = 'font-size:24px;font-weight:700;color:var(--accent);letter-spacing:0.15em;padding:16px;text-align:center';
      // Expirer au bout de 5 minutes visuellement
      setTimeout(() => {
        watchBtn.textContent = '⌚ Connecter la montre';
        watchBtn.style.cssText = '';
      }, 5 * 60 * 1000);
    });
    accountSection.appendChild(watchBtn);
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
        category:      inProgress.category || 'fonte',
        date:          inProgress.date,
        startedAt:     inProgress.startedAt,
        exercises:     inProgress.exercises.map(ex => {
          const e = migrateExercise(ex);
          return {
            name:       e.name,
            comment:    e.comment || '',
            activities: e.activities,
            series:     e.series.map(s => ({
              state: s.state || (s.done ? 'done' : 'pending'),
              activityStates: s.activityStates || {},
              values: s.values,
            })),
          };
        }),
      };
      startSyncPolling();
    }
  }

  await Promise.all([
    Promise.resolve(),
    new Promise(r => setTimeout(r, 2200)),
  ]);

  showScreen(currentUser ? 'home' : 'login');
})();
