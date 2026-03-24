/* ═══════════════════════════════════════════════════════
   VERSION
═══════════════════════════════════════════════════════ */
const APP_VERSION = '2026.mar.23-2';
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
const SESSIONS_KEY = 'gym_sessions';
const PROGRAMMES_KEY = 'gym_programmes';

function loadSessions() {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || []; } catch { return []; }
}
function saveSessions(s) { localStorage.setItem(SESSIONS_KEY, JSON.stringify(s)); }

function loadProgrammes() {
  try { return JSON.parse(localStorage.getItem(PROGRAMMES_KEY)) || []; } catch { return []; }
}
function saveProgrammes(p) { localStorage.setItem(PROGRAMMES_KEY, JSON.stringify(p)); }

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

function totalVolume(exercises) {
  return exercises.reduce((sum, ex) =>
    sum + ex.series
      .filter(s => s.done !== false)
      .reduce((s, se) => s + (se.reps || 0) * (se.weight || 0), 0)
  , 0);
}

function plannedVolume(exercises) {
  return exercises.reduce((sum, ex) =>
    sum + ex.series.reduce((s, se) => s + (se.reps || 0) * (se.weight || 0), 0)
  , 0);
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
  if (name === 'params')  renderParams();
}

document.getElementById('go-history').addEventListener('click', () => showScreen('history'));
document.getElementById('go-params').addEventListener('click',  () => showScreen('params'));
document.getElementById('back-history').addEventListener('click', () => showScreen('home'));
document.getElementById('back-params').addEventListener('click',  () => showScreen('home'));
document.getElementById('back-seance').addEventListener('click', () => {
  if (liveSession) {
    showConfirm('Abandonner la séance en cours ?', () => {
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
function drawHomeBarbell() {
  const canvas = document.getElementById('home-canvas');
  const dpr = window.devicePixelRatio || 1;
  const size = 80;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const ACCENT = '#FF6B00';
  const cx = size / 2, cy = size / 2;
  const bS = size * 0.72;
  const barW = bS * 0.72, barH = bS * 0.09;
  const plateW = bS * 0.13, plateH = bS * 0.42;
  const collarW = bS * 0.06, collarH = bS * 0.30;

  ctx.fillStyle = ACCENT;
  ctx.fillRect(cx - barW/2, cy - barH/2, barW, barH);
  ctx.fillRect(cx - barW/2, cy - plateH/2, plateW, plateH);
  ctx.fillRect(cx - barW/2 + plateW, cy - collarH/2, collarW, collarH);
  ctx.fillRect(cx + barW/2 - plateW, cy - plateH/2, plateW, plateH);
  ctx.fillRect(cx + barW/2 - plateW - collarW, cy - collarH/2, collarW, collarH);
}

function renderHome() {
  drawHomeBarbell();

  const main = document.getElementById('home-main');
  main.innerHTML = '';

  const programmes = loadProgrammes();

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

  const { ordered, lastSession } = cyclicProgrammes(programmes);
  const next = ordered[0];
  const seriesCount = next.exercises.reduce((s, e) => s + (e.count ?? e.series?.length ?? 0), 0);

  const card = document.createElement('div');
  card.className = 'home-next-card';
  card.innerHTML = `
    <span class="home-next-label">Prochain entraînement</span>
    <span class="home-next-name">${next.name}</span>
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

function renderSeanceScreen() {
  const body = document.getElementById('screen-seance-body');
  body.innerHTML = '';
  liveSession ? renderLiveSession(body) : renderProgrammeSelection(body);
}

function cyclicProgrammes(programmes) {
  if (!programmes.length) return { ordered: programmes, lastDoneId: null, lastDoneDate: null };

  const sessions = loadSessions();
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

function renderProgrammeSelection(tab) {
  const programmes = loadProgrammes();

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

  const { ordered, lastDoneId, lastSession } = cyclicProgrammes(programmes);
  const total = ordered.length;

  ordered.forEach((prog, displayIdx) => {
    const isNext = displayIdx === 0;
    const isDone = prog.id === lastDoneId;

    const card = document.createElement('div');
    card.className = 'programme-card';
    if (isNext) card.classList.add('programme-card--next');
    if (isDone) card.classList.add('programme-card--done');

    const seriesCount = prog.exercises.reduce((s, e) => {
      return s + (e.count ?? e.series?.length ?? 0);
    }, 0);

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
function startSession(programme) {
  liveSession = {
    id: generateId(),
    programmeId: programme.id,
    programmeName: programme.name,
    date: todayIso(),
    startedAt: new Date().toISOString(),
    exercises: programme.exercises.map(ex => {
      const count = ex.count ?? ex.series?.length ?? 1;
      const reps   = ex.reps   ?? ex.series?.[0]?.reps   ?? 0;
      const weight = ex.weight ?? ex.series?.[0]?.weight ?? 0;
      const rest   = ex.rest   ?? ex.series?.[0]?.rest   ?? 0;
      return {
        name: ex.name,
        muscle: ex.muscle || '',
        comment: ex.comment || '',
        series: Array.from({ length: count }, () => ({ reps, weight, rest, state: 'pending' })),
      };
    }),
  };
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

    if (ex.muscle) {
      const exMuscle = document.createElement('div');
      exMuscle.className = 'live-exercise-muscle';
      exMuscle.textContent = ex.muscle;
      exDiv.appendChild(exMuscle);
    }

    if (ex.comment) {
      const exComment = document.createElement('div');
      exComment.className = 'live-exercise-comment';
      exComment.textContent = ex.comment;
      exDiv.appendChild(exComment);
    }

    const labels = document.createElement('div');
    labels.className = 'live-series-labels';
    labels.innerHTML = '<span></span><span></span><span>reps</span><span></span><span>kg</span><span></span><span></span>';
    exDiv.appendChild(labels);

    ex.series.forEach((s, sIdx) => {
      exDiv.appendChild(buildLiveSeriesRow(exIdx, sIdx, s));
    });

    tab.appendChild(exDiv);
  });

  document.getElementById('finish-session').addEventListener('click', finishSession);
}

function buildLiveSeriesRow(exIdx, sIdx, s) {
  const row = document.createElement('div');
  row.className = `live-series-row ${s.state}`;

  row.innerHTML = `
    <button class="series-state-btn">${stateIcon(s.state)}</button>
    <span class="series-num">${sIdx + 1}</span>
    <input type="number" inputmode="decimal" class="live-reps" value="${s.reps}" min="1" />
    <span class="live-x">×</span>
    <input type="number" inputmode="decimal" class="live-weight" value="${s.weight}" min="0" step="0.5" />
    <span class="live-kg">kg</span>
    <input type="number" inputmode="numeric" class="live-rest" value="${s.rest}" min="0" />
  `;

  row.querySelector('.series-state-btn').addEventListener('click', () =>
    advanceSeriesState(exIdx, sIdx, row)
  );

  row.dataset.ex = exIdx;
  row.dataset.s  = sIdx;
  row.querySelector('.live-reps').setAttribute('data-ex', exIdx);
  row.querySelector('.live-reps').setAttribute('data-s', sIdx);
  row.querySelector('.live-weight').setAttribute('data-ex', exIdx);
  row.querySelector('.live-weight').setAttribute('data-s', sIdx);

  row.querySelector('.live-reps').addEventListener('input', e => {
    const val = parseFloat(e.target.value) || 0;
    propagateLiveValue(exIdx, sIdx, 'reps', val);
  });

  row.querySelector('.live-weight').addEventListener('input', e => {
    const val = parseFloat(e.target.value) || 0;
    propagateLiveValue(exIdx, sIdx, 'weight', val);
  });

  row.querySelector('.live-rest').addEventListener('change', e => {
    const val = parseInt(e.target.value) || 0;
    liveSession.exercises[exIdx].series[sIdx].rest = val;
  });

  return row;
}

function advanceSeriesState(exIdx, sIdx, row) {
  const s = liveSession.exercises[exIdx].series[sIdx];
  if (s.state === 'done') return;

  if (s.state === 'pending') {
    s.state = 'active';
  } else {
    s.state = 'done';
    const isLast = sIdx === liveSession.exercises[exIdx].series.length - 1;
    if (!isLast) startCountdown(s.rest, exIdx, sIdx);
  }

  row.className = `live-series-row ${s.state}`;
  row.querySelector('.series-state-btn').textContent = stateIcon(s.state);

  const allDone = liveSession.exercises[exIdx].series.every(se => se.state === 'done');
  const exDiv = row.closest('.live-exercise');
  exDiv.querySelector('.live-exercise-name').classList.toggle('live-exercise-name--done', allDone);
  if (allDone) exDiv.parentElement.appendChild(exDiv);
}

function propagateLiveValue(exIdx, sIdx, field, val) {
  const series = liveSession.exercises[exIdx].series;
  series.forEach((s, j) => {
    if (j >= sIdx) {
      s[field] = val;
      if (j > sIdx) {
        const input = document.querySelector(`.live-${field}[data-ex="${exIdx}"][data-s="${j}"]`);
        if (input) input.value = val;
      }
    }
  });
  updateProgrammeTemplate(exIdx, field, val);
}

function updateProgrammeTemplate(exIdx, field, val) {
  if (!liveSession.programmeId) return;
  const programmes = loadProgrammes();
  const prog = programmes.find(p => p.id === liveSession.programmeId);
  if (!prog || !prog.exercises[exIdx]) return;
  prog.exercises[exIdx][field] = val;
  saveProgrammes(programmes);
}

function finishSession() {
  showConfirm('Terminer et enregistrer la séance ?', () => {
    const sessions = loadSessions();
    const durationSecs = Math.round((Date.now() - new Date(liveSession.startedAt).getTime()) / 1000);
    sessions.push({
      id: liveSession.id,
      programmeId: liveSession.programmeId,
      programmeName: liveSession.programmeName,
      date: liveSession.date,
      startedAt: liveSession.startedAt,
      duration: durationSecs,
      exercises: liveSession.exercises.map(ex => ({
        name: ex.name,
        series: ex.series.map(s => ({
          reps: s.reps,
          weight: s.weight,
          rest: s.rest,
          done: s.state === 'done',
        })),
      })),
    });
    saveSessions(sessions);
    liveSession = null;
    stopCountdown();
    showScreen('home');
  });
}

/* ═══════════════════════════════════════════════════════
   COUNTDOWN
═══════════════════════════════════════════════════════ */
const GO_MESSAGES = [
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

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
let audioCtx = null;

function beep(freq = 880, duration = 120, volume = 0.4) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

let countdownTimer = null;
let countdownSecs  = 0;
let countdownTotal = 0;
let countdownNext  = null; // { exIdx, sIdx }
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

function startCountdown(seconds, exIdx, sIdx) {
  stopCountdown();
  if (!seconds || seconds <= 0) return;
  countdownSecs  = seconds;
  countdownTotal = seconds;
  countdownNext  = { exIdx, sIdx };

  document.getElementById('countdown-bar').classList.remove('hidden');
  document.getElementById('ring-progress').style.strokeDashoffset = 0;
  updateCountdownUI();

  countdownTimer = setInterval(() => {
    countdownSecs--;
    if (countdownSecs <= 0) {
      if (IS_IOS) beepSequence(5);
      else if (navigator.vibrate) navigator.vibrate([400, 100, 400, 100, 400]);
      finishCountdown();
    } else {
      if (countdownSecs <= 5) {
        if (IS_IOS) beep(660, 80, 0.2);
        else if (navigator.vibrate) navigator.vibrate(80);
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
  const next = countdownNext; // lire AVANT stopCountdown qui efface countdownNext
  stopCountdown();
  showToast(randomFrom(GO_MESSAGES));
  if (next) {
    const nextRow = document.querySelector(`.live-series-row[data-ex="${next.exIdx}"][data-s="${next.sIdx + 1}"]`);
    if (nextRow) advanceSeriesState(next.exIdx, next.sIdx + 1, nextRow);
  }
}

function stopCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = null;
  countdownNext  = null;
  const bar = document.getElementById('countdown-bar');
  bar.classList.add('hidden');
  bar.classList.remove('urgent');
}

document.getElementById('countdown-skip').addEventListener('click', finishCountdown);

/* ═══════════════════════════════════════════════════════
   HISTORIQUE
═══════════════════════════════════════════════════════ */
function renderHistory() {
  const list = document.getElementById('history-list');
  const sessions = loadSessions().slice().sort((a, b) => b.date.localeCompare(a.date));

  if (!sessions.length) {
    list.innerHTML = '<p class="empty-msg">Aucune séance enregistrée.</p>';
    return;
  }

  list.innerHTML = '';
  sessions.forEach(session => {
    const card = document.createElement('div');
    card.className = 'session-card';
    const done = totalVolume(session.exercises);
    const planned = plannedVolume(session.exercises);
    const name = session.programmeName || session.name || 'Séance';
    const volDisplay = planned > 0 && done !== planned
      ? `${done.toLocaleString('fr-FR')} kg / ${planned.toLocaleString('fr-FR')} kg`
      : `${done.toLocaleString('fr-FR')} kg`;
    card.innerHTML = `
      <div class="session-card-header">
        <span class="session-name">${name}</span>
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
    html += `<div class="modal-exercise">
      <div class="modal-exercise-name">${ex.name}</div>
      <table class="modal-series-table">
        <thead><tr><th>#</th><th>Reps</th><th>Poids (kg)</th><th>Repos (s)</th><th></th></tr></thead>
        <tbody>
          ${ex.series.map((s, i) => `
            <tr class="${s.done === false ? 'series-not-done' : ''}">
              <td>${i + 1}</td>
              <td>${s.reps}</td>
              <td>${s.weight}</td>
              <td>${s.rest}</td>
              <td>${s.done === false ? '—' : '✓'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
  });

  html += `<div class="modal-footer">
    <button class="btn-danger" id="delete-session">Supprimer la séance</button>
  </div>`;

  body.innerHTML = html;
  document.getElementById('delete-session').addEventListener('click', () => {
    showConfirm('Supprimer cette séance ?', () => {
      saveSessions(loadSessions().filter(s => s.id !== session.id));
      closeModal();
      renderHistory();
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
   PARAMÈTRES — liste des programmes
═══════════════════════════════════════════════════════ */
function renderParams() {
  const tab = document.getElementById('screen-params-body');
  tab.innerHTML = '';

  // Section programmes
  const progSection = document.createElement('div');
  progSection.style.display = 'flex';
  progSection.style.flexDirection = 'column';
  progSection.style.gap = '8px';

  const progTitle = document.createElement('p');
  progTitle.className = 'section-title';
  progTitle.textContent = 'Programmes';
  progSection.appendChild(progTitle);

  const programmes = loadProgrammes();
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
      row.querySelector('[data-dir="up"]').addEventListener('click', () => {
        const progs = loadProgrammes();
        [progs[idx - 1], progs[idx]] = [progs[idx], progs[idx - 1]];
        saveProgrammes(progs);
        renderParams();
      });
      row.querySelector('[data-dir="down"]').addEventListener('click', () => {
        const progs = loadProgrammes();
        [progs[idx], progs[idx + 1]] = [progs[idx + 1], progs[idx]];
        saveProgrammes(progs);
        renderParams();
      });
      row.querySelector('.btn-secondary').addEventListener('click', () => openProgrammeEditor(prog));
      row.querySelector('.btn-danger').addEventListener('click', () => {
        showConfirm(`Supprimer "${prog.name}" ?`, () => {
          saveProgrammes(loadProgrammes().filter(p => p.id !== prog.id));
          renderParams();
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
      const reps    = ex.reps   ?? ex.series?.[0]?.reps   ?? '';
      const weight  = ex.weight ?? ex.series?.[0]?.weight ?? '';
      const rest    = ex.rest   ?? ex.series?.[0]?.rest   ?? '';
      const count   = ex.count  ?? ex.series?.length      ?? 3;
      const comment = ex.comment ?? '';
      exercisesList.appendChild(makeExerciseCard({ name: ex.name, muscle: ex.muscle || '', reps, weight, rest, count, comment }));
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

function saveProgrammeFromEditor(existingId) {
  const name = document.getElementById('prog-name-input').value.trim();
  if (!name) { showAlert('Donne un nom au programme.'); return; }

  const cards = document.querySelectorAll('#prog-exercises-list .exercise-card');
  if (!cards.length) { showAlert('Ajoute au moins un exercice.'); return; }

  const exercises = Array.from(cards).map(card => ({
    name:    card.querySelector('.exercise-name').value.trim() || 'Sans nom',
    muscle:  card.querySelector('.exercise-muscle').value.trim(),
    reps:    parseFloat(card.querySelector('.series-reps').value)   || 0,
    weight:  parseFloat(card.querySelector('.series-weight').value) || 0,
    rest:    parseFloat(card.querySelector('.series-rest').value)   || 0,
    count:   parseInt(card.querySelector('.series-count').value)    || 1,
    comment: card.querySelector('.exercise-comment').value.trim(),
  }));

  const programmes = loadProgrammes();
  if (existingId) {
    const idx = programmes.findIndex(p => p.id === existingId);
    if (idx >= 0) programmes[idx] = { id: existingId, name, exercises };
    else programmes.push({ id: existingId, name, exercises });
  } else {
    programmes.push({ id: generateId(), name, exercises });
  }
  saveProgrammes(programmes);
  renderParams();
}

/* ═══════════════════════════════════════════════════════
   EXERCISE CARD BUILDER (éditeur de programme)
═══════════════════════════════════════════════════════ */
function makeExerciseCard({ name = '', muscle = '', reps = '', weight = '', rest = '', count = 3, comment = '' } = {}) {
  const card = document.createElement('div');
  card.className = 'exercise-card';

  const header = document.createElement('div');
  header.className = 'exercise-header';

  const nameRow = document.createElement('div');
  nameRow.className = 'exercise-name-row';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'exercise-name';
  nameInput.placeholder = 'Machine / exercice';
  nameInput.maxLength = 60;
  nameInput.value = name;
  nameRow.appendChild(nameInput);

  const removeExBtn = document.createElement('button');
  removeExBtn.className = 'btn-danger';
  removeExBtn.textContent = 'Suppr.';
  removeExBtn.addEventListener('click', () => card.remove());
  nameRow.appendChild(removeExBtn);

  const muscleInput = document.createElement('input');
  muscleInput.type = 'text';
  muscleInput.className = 'exercise-muscle';
  muscleInput.placeholder = 'Muscle ciblé';
  muscleInput.maxLength = 40;
  muscleInput.value = muscle;

  header.appendChild(nameRow);
  header.appendChild(muscleInput);

  const labels = document.createElement('div');
  labels.className = 'series-labels';
  labels.innerHTML = `
    <span class="series-label">séries</span>
    <span class="series-label">reps</span>
    <span class="series-label">kg</span>
    <span class="series-label">repos (s)</span>
  `;

  const row = document.createElement('div');
  row.className = 'series-row';
  row.innerHTML = `
    <input type="number" inputmode="numeric" class="series-count" placeholder="nb" min="1" value="${count}" />
    <input type="number" inputmode="decimal" class="series-reps" placeholder="reps" min="1" value="${reps}" />
    <input type="number" inputmode="decimal" class="series-weight" placeholder="kg" min="0" step="0.5" value="${weight}" />
    <input type="number" inputmode="decimal" class="series-rest" placeholder="sec" min="0" value="${rest}" />
  `;

  const commentInput = document.createElement('textarea');
  commentInput.className = 'exercise-comment';
  commentInput.placeholder = 'Commentaire (visible à la salle)';
  commentInput.rows = 2;
  commentInput.value = comment;

  card.appendChild(header);
  card.appendChild(labels);
  card.appendChild(row);
  card.appendChild(commentInput);

  return card;
}

/* ═══════════════════════════════════════════════════════
   DONNÉES
═══════════════════════════════════════════════════════ */
function exportData() {
  const data = {
    programmes: loadProgrammes(),
    sessions:   loadSessions(),
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
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const raw = JSON.parse(evt.target.result);
      const importedSessions   = raw.sessions   || [];
      const importedProgrammes = raw.programmes || [];

      const existingSessions = loadSessions();
      const sessionIds = new Set(existingSessions.map(s => s.id));
      const mergedSessions = [...existingSessions, ...importedSessions.filter(s => !sessionIds.has(s.id))];
      saveSessions(mergedSessions);

      const existingProgrammes = loadProgrammes();
      const progIds = new Set(existingProgrammes.map(p => p.id));
      const mergedProgrammes = [...existingProgrammes, ...importedProgrammes.filter(p => !progIds.has(p.id))];
      saveProgrammes(mergedProgrammes);

      const addedS = mergedSessions.length - existingSessions.length;
      const addedP = mergedProgrammes.length - existingProgrammes.length;
      const fb = document.getElementById('data-feedback');
      if (fb) fb.textContent = `${addedS} séance${addedS !== 1 ? 's' : ''} et ${addedP} programme${addedP !== 1 ? 's' : ''} importé${addedP !== 1 ? 's' : ''}.`;
    } catch {
      const fb = document.getElementById('data-feedback');
      if (fb) fb.textContent = 'Erreur : fichier JSON invalide.';
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* ═══════════════════════════════════════════════════════
   LOADING SCREEN
═══════════════════════════════════════════════════════ */
(function initLoadingScreen() {
  const canvas = document.getElementById('loading-canvas');
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(window.innerWidth * 0.4, 200);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const ACCENT = '#FF6B00';
  const cx = size / 2;
  const barbellSize = size * 0.72;
  const cy = size * 0.48;

  const barW = barbellSize * 0.72;
  const barH = barbellSize * 0.09;
  const plateW = barbellSize * 0.13;
  const plateH = barbellSize * 0.42;
  const collarW = barbellSize * 0.06;
  const collarH = barbellSize * 0.30;

  ctx.fillStyle = ACCENT;
  ctx.fillRect(cx - barW / 2, cy - barH / 2, barW, barH);
  ctx.fillRect(cx - barW / 2, cy - plateH / 2, plateW, plateH);
  ctx.fillRect(cx - barW / 2 + plateW, cy - collarH / 2, collarW, collarH);
  ctx.fillRect(cx + barW / 2 - plateW, cy - plateH / 2, plateW, plateH);
  ctx.fillRect(cx + barW / 2 - plateW - collarW, cy - collarH / 2, collarW, collarH);

  const screen = document.getElementById('loading-screen');
  setTimeout(() => {
    screen.classList.add('fade-out');
    screen.addEventListener('transitionend', () => screen.classList.add('hidden'), { once: true });
  }, 2000);
})();

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */
showScreen('home');
