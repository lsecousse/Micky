/* ═══════════════════════════════════════════════════════
   VERSION
═══════════════════════════════════════════════════════ */
const APP_VERSION = '2026.mai.14';
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
  if (name === 'alim')    renderAlimentation();
  if (name === 'params')      renderParams();
  if (name === 'login')       renderLogin();
  if (name === 'profil')      renderProfil();
  if (name === 'claude-api')  renderClaudeApi();
}

document.getElementById('go-corps').addEventListener('click',   () => showScreen('corps'));
document.getElementById('go-alim').addEventListener('click',    () => showScreen('alim'));
document.getElementById('back-history').addEventListener('click', () => showScreen('home'));
document.getElementById('back-corps').addEventListener('click',   () => showScreen('home'));
document.getElementById('back-stats').addEventListener('click',   () => showScreen('home'));
document.getElementById('back-alim').addEventListener('click',    () => showScreen('home'));
document.getElementById('back-params').addEventListener('click',  () => showScreen('home'));
document.getElementById('back-profil').addEventListener('click',     () => showScreen('home'));
document.getElementById('back-claude-api').addEventListener('click', () => showScreen('home'));
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
    const greeting = document.createElement('div');
    greeting.className = 'space-y-1';
    greeting.innerHTML = `
      <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted">Bonjour</p>
      <p class="font-display text-3xl font-semibold leading-tight text-paper">${prenom}.</p>
      <span class="block w-10 h-px bg-acid mt-2"></span>
    `;
    main.appendChild(greeting);
  }

  const programmes = await loadProgrammes();

  if (!programmes.length) {
    const msg = document.createElement('div');
    msg.className = 'text-center py-16 space-y-2';
    msg.innerHTML = `
      <p class="font-display text-xl text-paper">Aucun programme.</p>
      <p class="font-sans text-[13px] text-muted">Crées-en un dans Programmes.</p>
    `;
    main.appendChild(msg);
    return;
  }

  const liveCat = liveSession?.category || null;
  const fonteProgrammes  = programmes.filter(p => (p.category || 'fonte') === 'fonte');
  const cardioProgrammes = programmes.filter(p => p.category === 'cardio');

  if (fonteProgrammes.length)  await renderHomeSection(main, 'fonte',  fonteProgrammes,  liveCat === 'fonte');
  if (cardioProgrammes.length) await renderHomeSection(main, 'cardio', cardioProgrammes, liveCat === 'cardio');
}

async function renderHomeSection(main, category, programmes, isLive) {
  const labelMap = { fonte: 'Fonte', cardio: 'Cardio' };
  const section = document.createElement('section');
  section.className = 'space-y-4';

  if (isLive) {
    section.innerHTML = `
      <p class="font-sans text-[10px] uppercase tracking-eyebrow text-racing flex items-center gap-3 font-semibold">
        <span>${labelMap[category]} · Séance en cours</span>
        <span class="flex-1 h-px bg-border"></span>
      </p>
      <div class="flex items-center gap-3 bg-inkAlt border-l-[3px] border-l-racing border-y border-r border-border p-5">
        <button data-role="resume-delete" class="w-11 h-11 flex items-center justify-center text-[18px] text-muted border border-border active:text-blood active:border-blood transition" aria-label="Supprimer">🗑</button>
        <button data-role="resume-center" class="flex-1 text-left">
          <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted">En cours</p>
          <p class="font-display text-[22px] font-semibold leading-tight text-racing mt-1">${liveSession.programmeName}</p>
        </button>
        <button data-role="resume-finish" class="w-11 h-11 flex items-center justify-center text-[18px] text-acid border border-acid bg-acid/[0.12] active:bg-acid active:text-ink transition" aria-label="Terminer">✅</button>
      </div>
    `;
    section.querySelector('[data-role="resume-center"]').addEventListener('click', () => showScreen('seance'));
    section.querySelector('[data-role="resume-delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirm('Supprimer cette séance ?', async () => {
        await deleteSessionDB(liveSession.id);
        liveSession = null;
        liveFocus = null;
        liveRest = null;
        showScreen('home');
      });
    });
    section.querySelector('[data-role="resume-finish"]').addEventListener('click', (e) => {
      e.stopPropagation();
      finishSession();
    });
  } else {
    const { ordered } = await cyclicProgrammes(programmes);
    const next = ordered[0];
    const isFonte = category === 'fonte';
    const seriesCount = isFonte
      ? next.exercises.reduce((s, e) => s + (e.sets || e.count || e.series?.length || 3), 0)
      : 0;
    const totalDur = !isFonte
      ? next.exercises.reduce((s, e) => s + (e.duration || 0), 0)
      : 0;
    const muscles = isFonte
      ? [...new Set(next.exercises.flatMap(e => migrateExercise(e).activities.map(a => a.name).filter(Boolean)))]
      : [];

    const meta = isFonte
      ? `${next.exercises.length} exercice${next.exercises.length > 1 ? 's' : ''} · ${seriesCount} séries`
      : `${next.exercises.length} machine${next.exercises.length > 1 ? 's' : ''} · ${totalDur} min`;

    section.innerHTML = `
      <p class="font-sans text-[10px] uppercase tracking-eyebrow text-acid flex items-center gap-3 font-semibold">
        <span>${labelMap[category]} · Prochaine séance</span>
        <span class="flex-1 h-px bg-border"></span>
      </p>
      <button data-role="next-card" class="block w-full text-left bg-inkAlt border border-border p-5 active:border-acid transition">
        <h2 class="font-display text-[26px] font-semibold leading-tight text-paper">${next.name}</h2>
        <span class="block w-12 h-px bg-acid my-3"></span>
        ${muscles.length ? `<p class="font-sans text-[12px] text-acid leading-relaxed">${muscles.join(' · ')}</p>` : ''}
        <div class="mt-4 flex items-center justify-between">
          <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted">${meta}</p>
          <span class="font-sans text-[10px] uppercase tracking-eyebrow text-acid font-semibold">Démarrer →</span>
        </div>
      </button>
    `;
    section.querySelector('[data-role="next-card"]').addEventListener('click', async () => {
      await startSession(next);
      showScreen('seance');
    });

    if (programmes.length > 1) {
      const other = document.createElement('button');
      other.className = 'block w-full text-left py-3 px-4 border border-border font-sans text-[11px] uppercase tracking-eyebrow text-paper active:border-acid active:text-acid transition';
      other.textContent = `Choisir un autre programme ${category}`;
      other.addEventListener('click', () => { pendingSelectionCategory = category; showScreen('seance'); });
      section.appendChild(other);
    }
  }

  main.appendChild(section);
}

/* ═══════════════════════════════════════════════════════
   MENU UTILISATEUR (dropdown)
═══════════════════════════════════════════════════════ */
(function initUserMenu() {
  const btn = document.getElementById('user-menu-btn');
  const dropdown = document.getElementById('user-dropdown');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) buildUserDropdown();
  });

  document.addEventListener('click', () => dropdown.classList.add('hidden'));
  dropdown.addEventListener('click', (e) => e.stopPropagation());
})();

function buildUserDropdown() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.innerHTML = '';

  const items = [
    { label: 'Profil',         action: () => { dropdown.classList.add('hidden'); showScreen('profil'); } },
    { label: 'Clé API Claude', action: () => { dropdown.classList.add('hidden'); showScreen('claude-api'); } },
    { label: 'Historique',     action: () => { dropdown.classList.add('hidden'); showScreen('history'); } },
    { label: 'Stats',          action: () => { dropdown.classList.add('hidden'); showScreen('stats'); } },
    { label: 'Programmes',     action: () => { dropdown.classList.add('hidden'); showScreen('params'); } },
    { label: 'Déconnexion',    danger: true, action: () => {
      dropdown.classList.add('hidden');
      showConfirm('Se déconnecter ?', async () => {
        await db.auth.signOut();
        currentUser = null;
        loginReady = false;
        showScreen('login');
      });
    }},
  ];

  const baseClass = 'w-full text-left px-4 py-3 font-sans text-[12px] uppercase tracking-[0.20em] border-b border-border last:border-b-0 transition active:bg-[rgba(255,255,255,0.04)]';
  items.forEach(({ label, danger, action }) => {
    const btn = document.createElement('button');
    const colorClass = danger ? 'text-blood' : 'text-paper';
    btn.className = `${baseClass} ${colorClass}`;
    btn.textContent = label;
    btn.addEventListener('click', action);
    dropdown.appendChild(btn);
  });
}

/* ═══════════════════════════════════════════════════════
   PROFIL
═══════════════════════════════════════════════════════ */
// Helper : champ formulaire tokens A (label eyebrow muted + input border-bottom)
function makeField(label, opts = {}) {
  const { type = 'text', value = '', placeholder = '', readonly = false, inputMode = '', min, max, maxLength } = opts;
  const wrap = document.createElement('div');
  wrap.className = 'mb-5';
  const lab = document.createElement('p');
  lab.className = 'font-sans text-[9px] uppercase tracking-[0.40em] text-muted mb-1.5';
  lab.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = value ?? '';
  if (placeholder) input.placeholder = placeholder;
  if (readonly) { input.readOnly = true; input.classList.add('opacity-50'); }
  if (inputMode) input.inputMode = inputMode;
  if (min != null) input.min = String(min);
  if (max != null) input.max = String(max);
  if (maxLength != null) input.maxLength = maxLength;
  input.className = 'w-full bg-transparent border-b border-border focus:border-acid font-sans text-[16px] text-paper py-2 outline-none transition';
  wrap.append(lab, input);
  return { wrap, input };
}

// Helper : segmented buttons (radio-like)
function makeSegment(options, selected, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'grid grid-cols-2 gap-2';
  const buttons = [];
  const refresh = (active) => {
    buttons.forEach(b => {
      b.className = (b.dataset.val === active)
        ? 'py-3 border border-acid bg-acid/[0.10] text-acid font-sans text-[11px] uppercase tracking-eyebrow font-semibold transition'
        : 'py-3 border border-border text-paper font-sans text-[11px] uppercase tracking-eyebrow active:border-paper transition';
    });
  };
  options.forEach(({ val, label }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.val = val;
    b.addEventListener('click', () => { onChange(val); refresh(val); });
    buttons.push(b);
    wrap.appendChild(b);
  });
  refresh(selected);
  return wrap;
}

// Helper : option list (full-width buttons stacked)
function makeOptionList(options, selected, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col gap-2';
  const buttons = [];
  const refresh = (active) => {
    buttons.forEach(b => {
      b.className = (b.dataset.val === active)
        ? 'py-3 px-4 border border-acid bg-acid/[0.10] text-acid font-sans text-[11px] uppercase tracking-eyebrow font-semibold text-left transition'
        : 'py-3 px-4 border border-border text-paper font-sans text-[11px] uppercase tracking-eyebrow text-left active:border-paper transition';
    });
  };
  options.forEach(({ val, label }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.val = val;
    b.addEventListener('click', () => { onChange(val); refresh(val); });
    buttons.push(b);
    wrap.appendChild(b);
  });
  refresh(selected);
  return wrap;
}

function renderProfil() {
  const body = document.getElementById('screen-profil-body');
  body.innerHTML = '';

  // Masthead
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-9 pb-9 accent-line';
  masthead.innerHTML = `
    <h1 class="font-display font-black h-display text-paper">
      Tes<br/>
      <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> infos.</span>
    </h1>
  `;
  body.appendChild(masthead);

  const form = document.createElement('div');
  form.className = 'px-5 pt-6 pb-12';

  const { wrap: emailWrap }  = makeField('Email', { value: currentUser?.email || '', readonly: true });
  const { wrap: nomWrap,    input: nomInput }    = makeField('Nom',    { placeholder: 'Nom',    maxLength: 60, value: currentProfile?.nom || '' });
  const { wrap: prenomWrap, input: prenomInput } = makeField('Prénom', { placeholder: 'Prénom', maxLength: 60, value: currentProfile?.prenom || '' });
  const { wrap: tailleWrap, input: tailleInput } = makeField('Taille (cm)', {
    type: 'number', inputMode: 'numeric', min: 50, max: 250, placeholder: '180', value: currentProfile?.taille_cm ?? ''
  });
  const { wrap: dnWrap, input: dnInput } = makeField('Date de naissance', { type: 'date', value: currentProfile?.date_naissance || '' });

  // Sexe (segmented)
  const sexeBlock = document.createElement('div');
  sexeBlock.className = 'mb-5';
  sexeBlock.innerHTML = `<p class="font-sans text-[9px] uppercase tracking-[0.40em] text-muted mb-1.5">Sexe</p>`;
  let selectedSexe = currentProfile?.sexe || null;
  const sexeSeg = makeSegment(
    [{ val: 'h', label: 'Homme' }, { val: 'f', label: 'Femme' }],
    selectedSexe,
    (v) => { selectedSexe = v; }
  );
  sexeBlock.appendChild(sexeSeg);

  // Niveau d'activité (option list)
  const actBlock = document.createElement('div');
  actBlock.className = 'mb-8';
  actBlock.innerHTML = `<p class="font-sans text-[9px] uppercase tracking-[0.40em] text-muted mb-1.5">Niveau d'activité (hors sport)</p>`;
  let selectedActivite = currentProfile?.niveau_activite || null;
  const actList = makeOptionList(
    [
      { val: 'sedentaire', label: 'Sédentaire — bureau assis toute la journée' },
      { val: 'leger',      label: 'Léger — bureau + déplacements occasionnels' },
      { val: 'modere',     label: 'Modéré — debout fréquent / marche régulière' },
      { val: 'actif',      label: 'Actif — métier manuel, beaucoup de marche' },
    ],
    selectedActivite,
    (v) => { selectedActivite = v; }
  );
  actBlock.appendChild(actList);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'w-full py-4 bg-acid text-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-acid/80 transition';
  saveBtn.textContent = 'Enregistrer';
  saveBtn.addEventListener('click', async () => {
    const fields = {
      nom: nomInput.value.trim(),
      prenom: prenomInput.value.trim(),
      taille_cm: parseInt(tailleInput.value) || null,
      date_naissance: dnInput.value || null,
      sexe: selectedSexe,
      niveau_activite: selectedActivite,
    };
    await updateProfileDB(fields);
    Object.assign(currentProfile, fields);
    showToast('Profil mis à jour');
  });

  form.append(emailWrap, nomWrap, prenomWrap, tailleWrap, dnWrap, sexeBlock, actBlock, saveBtn);
  body.appendChild(form);
}

/* ═══════════════════════════════════════════════════════
   CLÉ API CLAUDE
═══════════════════════════════════════════════════════ */
async function renderClaudeApi() {
  const body = document.getElementById('screen-claude-api-body');
  body.innerHTML = `
    <div class="px-5 pt-12 text-center font-display italic text-[16px] text-muted">Chargement…</div>
  `;

  const existingKey = await getClaudeApiKeyDB();

  body.innerHTML = '';

  // Masthead
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-9 pb-9 accent-line';
  masthead.innerHTML = `
    <h1 class="font-display font-black h-display text-paper">
      Clé<br/>
      <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> Claude.</span>
    </h1>
    <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-5">
      Utilisée pour le feedback IA · chiffrée en base
    </p>
  `;
  body.appendChild(masthead);

  const form = document.createElement('div');
  form.className = 'px-5 pt-6 pb-12';

  const fieldWrap = document.createElement('div');
  fieldWrap.className = 'mb-6';
  fieldWrap.innerHTML = `<p class="font-sans text-[9px] uppercase tracking-[0.40em] text-muted mb-1.5">Clé API</p>`;
  const inputRow = document.createElement('div');
  inputRow.className = 'flex items-baseline gap-2';
  const keyInput = document.createElement('input');
  keyInput.type = 'password';
  keyInput.placeholder = 'sk-ant-…';
  keyInput.value = existingKey || '';
  keyInput.className = 'flex-1 bg-transparent border-b border-border focus:border-acid font-sans text-[16px] text-paper py-2 outline-none transition';
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'shrink-0 px-3 py-2 border border-border text-muted active:text-paper active:border-paper font-sans text-[12px] transition';
  toggleBtn.textContent = '👁';
  toggleBtn.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });
  inputRow.append(keyInput, toggleBtn);
  fieldWrap.appendChild(inputRow);
  form.appendChild(fieldWrap);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'w-full py-4 bg-acid text-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-acid/80 transition';
  saveBtn.textContent = 'Enregistrer';
  saveBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) { showAlert('Saisis une clé API.'); return; }
    await setClaudeApiKeyDB(key);
    showToast('Clé API sauvegardée');
  });
  form.appendChild(saveBtn);

  body.appendChild(form);
}

/* ═══════════════════════════════════════════════════════
   SÉANCE SCREEN
═══════════════════════════════════════════════════════ */
let liveSession = null;
let liveFocus = null; // { exIdx, sIdx, actIdx } : activité actuellement en focus dans state B
let liveRest  = null; // { exIdx, sIdx, actIdx } : activité juste validée, en cours de repos (state C)
let wakeLock    = null;

function nextUndoneActivity(exIdx) {
  const ex = liveSession?.exercises?.[exIdx];
  if (!ex || ex.type === 'cardio') return null;
  for (let s = 0; s < ex.series.length; s++) {
    const set = ex.series[s];
    for (let a = 0; a < ex.activities.length; a++) {
      const state = set.activityStates?.[a];
      if (state !== 'done') return { exIdx, sIdx: s, actIdx: a };
    }
  }
  return null;
}

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

  const progIds = new Set(programmes.map(p => p.id));
  const same = sessions.filter(s => progIds.has(s.programmeId));
  if (!same.length) return { ordered: programmes, lastDoneId: null, lastDoneDate: null };

  const last = same.slice().sort((a, b) => {
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

let pendingSelectionCategory = null;

async function renderProgrammeSelection(tab) {
  let programmes = await loadProgrammes();
  if (pendingSelectionCategory) {
    programmes = programmes.filter(p => (p.category || 'fonte') === pendingSelectionCategory);
    pendingSelectionCategory = null;
  }

  if (!programmes.length) {
    const wrap = document.createElement('div');
    wrap.className = 'px-5 pt-10 space-y-4 text-center';
    wrap.innerHTML = `
      <p class="font-display text-xl text-paper">Aucun programme.</p>
      <p class="font-sans text-[13px] text-muted">Crées-en un dans Programmes.</p>
    `;
    const btn = document.createElement('button');
    btn.className = 'mt-6 w-full py-3 px-4 border border-border font-sans text-[11px] uppercase tracking-eyebrow text-paper active:border-acid active:text-acid transition';
    btn.textContent = '→ Programmes';
    btn.addEventListener('click', () => showScreen('params'));
    wrap.appendChild(btn);
    tab.appendChild(wrap);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'px-5 py-6';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'font-sans text-[10px] uppercase tracking-eyebrow text-muted mb-5 flex items-center gap-3';
  eyebrow.innerHTML = `<span>Choisir un programme</span><span class="flex-1 h-px bg-border"></span>`;
  wrap.appendChild(eyebrow);

  const list = document.createElement('div');
  list.className = 'border-y border-border';
  wrap.appendChild(list);

  const { ordered, lastDoneId, lastSession } = await cyclicProgrammes(programmes);

  ordered.forEach((prog, displayIdx) => {
    const isNext = displayIdx === 0;
    const isDone = prog.id === lastDoneId;

    const seriesCount = prog.exercises.reduce((s, e) => s + (e.sets || e.count || e.series?.length || 3), 0);

    let meta;
    if (isDone && lastSession) {
      const timePart = lastSession.startedAt ? formatTime(lastSession.startedAt) : formatDate(lastSession.date);
      const durPart  = lastSession.duration != null ? ` · ${formatDuration(lastSession.duration)}` : '';
      meta = `${timePart}${durPart}`;
    } else {
      meta = `${prog.exercises.length} exercice${prog.exercises.length > 1 ? 's' : ''} · ${seriesCount} séries`;
    }

    const card = document.createElement('button');
    const borderLeft = isNext ? 'border-l-[3px] border-l-acid' : (isDone ? 'border-l-[3px] border-l-muted opacity-60' : 'border-l-[3px] border-l-transparent');
    card.className = `w-full text-left flex items-center gap-4 px-5 py-4 border-b border-border/70 ${borderLeft} active:bg-inkAlt transition`;

    const status = isDone ? '<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted">Fait</span>'
                  : isNext ? '<span class="font-sans text-[9px] uppercase tracking-eyebrow text-acid font-semibold">Suivant →</span>'
                  : '';

    card.innerHTML = `
      <div class="flex-1 min-w-0">
        <h3 class="font-display font-bold italic text-[18px] leading-tight text-paper truncate">${prog.name}</h3>
        <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-1 truncate">${meta}</p>
      </div>
      <div class="shrink-0">${status}</div>
    `;
    card.addEventListener('click', () => startSession(prog));
    list.appendChild(card);
  });

  tab.appendChild(wrap);
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

async function attachPrevValues(exercises, programmeId, category, excludeSessionId) {
  const sessions   = await loadSessions();
  const prevSession = sessions
    .filter(s => s.programmeId === programmeId && s.id !== excludeSessionId)
    .sort((a, b) => (b.startedAt || b.date).localeCompare(a.startedAt || a.date))[0] || null;

  if (category === 'cardio') {
    exercises.forEach(ex => {
      const prevEx = prevSession?.exercises?.find(e => e.name === ex.name) || null;
      ex.prev = prevEx?.done || null;
    });
  } else {
    exercises.forEach(ex => {
      const prevEx = prevSession?.exercises?.find(e => e.name === ex.name) || null;
      ex.prevSeries = prevEx?.series || null;
    });
  }
}

async function startSession(programme) {
  requestWakeLock();
  const isCardio = programme.category === 'cardio';

  liveFocus = null;
  liveRest = null;
  liveSession = {
    id: generateId(),
    programmeId: programme.id,
    programmeName: programme.name,
    category: programme.category || 'fonte',
    date: todayIso(),
    startedAt: new Date().toISOString(),
    exercises: isCardio
      ? programme.exercises.map(ex => ({
          name:     ex.name,
          type:     'cardio',
          comment:  ex.comment || '',
          duration: ex.duration || 0,
          power:    ex.power    || 0,
          done:     { duration: ex.duration || 0, power: ex.power || 0, km: ex.km || 0 },
          prev:     null,
          state:    'pending',
        }))
      : programme.exercises.map(ex => {
          const m    = migrateExercise(ex);
          const sets = ex.sets ?? m.series.length ?? (ex.count ?? 3);
          return {
            name:       ex.name,
            comment:    ex.comment || '',
            activities: m.activities,
            prevSeries: null,
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
  await attachPrevValues(liveSession.exercises, programme.id, liveSession.category, liveSession.id);
  pushSession(liveSessionSnapshot()).catch(() => {});
  startSyncPolling();
  renderSeanceScreen();
}

/* ═══════════════════════════════════════════════════════
   LIVE EDIT MODAL
═══════════════════════════════════════════════════════ */
let liveEditModalCtx = null; // { onOk: fn, escHandler: fn }

function openLiveEditModal({ title, bodyHTML, focusSelector, onOk }) {
  const modal = document.getElementById('live-edit-modal');
  const titleEl = document.getElementById('live-edit-modal-title');
  const bodyEl  = document.getElementById('live-edit-modal-body');

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHTML;
  modal.classList.remove('hidden');

  requestAnimationFrame(() => {
    const el = bodyEl.querySelector(focusSelector);
    if (el) { el.focus(); el.select?.(); }
  });

  const escHandler = (e) => { if (e.key === 'Escape') closeLiveEditModal(); };
  document.addEventListener('keydown', escHandler);

  liveEditModalCtx = { onOk, escHandler };
}

function closeLiveEditModal() {
  const modal = document.getElementById('live-edit-modal');
  modal.classList.add('hidden');
  document.getElementById('live-edit-modal-body').innerHTML = '';
  if (liveEditModalCtx?.escHandler) {
    document.removeEventListener('keydown', liveEditModalCtx.escHandler);
  }
  liveEditModalCtx = null;
}

document.getElementById('live-edit-modal-cancel').addEventListener('click', closeLiveEditModal);
document.querySelector('#live-edit-modal .live-edit-modal-overlay').addEventListener('click', closeLiveEditModal);
document.getElementById('live-edit-modal-ok').addEventListener('click', () => {
  if (liveEditModalCtx?.onOk) liveEditModalCtx.onOk();
});

// Split programme title sur premier séparateur " / ", " & " ou " - " pour mise en
// page éditoriale (signature Direction A : line1 paper + line2 paper/40 avec sep acid)
function splitProgrammeTitle(raw) {
  const s = (raw || '').trim();
  const m = s.match(/^(.+?)\s+([\/&\-])\s+(.+)$/);
  if (!m) return { line1: s, sep: null, rest: '' };
  const sepDisplay = m[2] === '-' ? '—' : (m[2] === '&' ? '&amp;' : m[2]);
  return { line1: m[1], sep: sepDisplay, rest: m[3] };
}

function renderLiveSession(tab) {
  const inDetail = liveFocus && liveSession.category !== 'cardio';
  const isCardio = liveSession.category === 'cardio';

  // Compute session totals (utilisés dans le sticky + masthead pour la liste)
  let totalSeries = 0, doneSeries = 0, totalVolume = 0, doneVolume = 0, totalReps = 0, doneReps = 0;
  if (!isCardio) {
    liveSession.exercises.forEach(ex => {
      if (ex.type === 'cardio') return;
      ex.series.forEach((s) => {
        totalSeries++;
        const allDone = ex.activities.every((_, a) => s.activityStates?.[a] === 'done');
        if (allDone) doneSeries++;
        ex.activities.forEach((act, a) => {
          if (act.type !== 'weight') return;
          const v = s.values?.[a] || {};
          const reps = v.reps ?? act.reps ?? 0;
          const weight = v.weight ?? act.weight ?? 0;
          totalVolume += reps * weight;
          totalReps += reps;
          if (s.activityStates?.[a] === 'done') {
            doneVolume += reps * weight;
            doneReps += reps;
          }
        });
      });
    });
  }
  const pct      = totalSeries > 0 ? Math.round((doneSeries / totalSeries) * 100) : 0;
  const tonnage  = (doneVolume / 1000).toFixed(1).replace('.', ',');
  const cibleTon = (totalVolume / 1000).toFixed(1).replace('.', ',');

  const header = document.createElement('header');
  header.className = 'sticky top-0 z-10 bg-ink/96 backdrop-blur-sm border-b border-border';

  if (inDetail) {
    header.innerHTML = `
      <!-- Status row : back + date + En cours + Fin -->
      <div class="px-5 pt-4 pb-3 flex items-center justify-between font-sans text-[10px] uppercase tracking-eyebrow text-muted">
        <button id="back-to-list" class="flex items-center gap-2 active:text-paper transition">
          <span aria-hidden>←</span><span>Liste</span>
        </button>
        <div class="flex items-center gap-2">
          <span>${formatDate(liveSession.date)}</span>
          <span class="text-muted/50">·</span>
          <span class="text-racing">En cours</span>
        </div>
        <button id="finish-session" class="font-semibold text-acid border border-acid bg-acid/[0.10] px-3 py-1.5 active:bg-acid active:text-ink transition text-[10px]">Fin</button>
      </div>

      <!-- Counter + progress -->
      <div class="px-5 pb-3">
        <div class="flex items-baseline justify-end mb-2">
          <span class="font-display text-[13px] num-stat font-bold leading-none">
            <span class="text-acid">${String(doneSeries).padStart(2, '0')}</span><span class="text-muted">/${String(totalSeries).padStart(2, '0')}</span>
            <span class="font-sans font-medium text-[9px] uppercase tracking-eyebrow text-muted ml-1">séries</span>
          </span>
        </div>
        <div class="h-[3px] bg-border relative overflow-hidden">
          <div class="absolute left-0 top-0 h-full bg-acid" style="width:${pct}%"></div>
        </div>
      </div>

      <!-- Stats strip 4 cols cyan -->
      <div class="grid grid-cols-4 border-t border-border">
        <div class="px-2.5 py-3 border-r border-border min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Volume</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${Math.round(doneVolume)}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">kg</span></p>
        </div>
        <div class="px-2.5 py-3 border-r border-border min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Tonnage</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${tonnage}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">t</span></p>
        </div>
        <div class="px-2.5 py-3 border-r border-border min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Reps</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${doneReps}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">/${totalReps}</span></p>
        </div>
        <div class="px-2.5 py-3 min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Cible</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${cibleTon}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">t</span></p>
        </div>
      </div>
    `;
  } else if (isCardio) {
    header.innerHTML = `
      <div class="px-5 py-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="font-display font-bold text-[20px] leading-tight text-paper truncate">${liveSession.programmeName}</div>
          <div class="font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-1">${formatDate(liveSession.date)} · En cours</div>
        </div>
        <button id="finish-session" class="shrink-0 font-sans text-[11px] uppercase tracking-eyebrow font-semibold text-acid border border-acid bg-acid/[0.10] px-4 py-2 active:bg-acid active:text-ink transition">Terminer</button>
      </div>
    `;
  } else {
    // Sticky riche pour la vue liste — calque le mock Direction A
    header.innerHTML = `
      <!-- Status row : date · En cours + Terminer -->
      <div class="px-5 pt-4 pb-3 flex items-center justify-between font-sans text-[10px] uppercase tracking-eyebrow text-muted">
        <div class="flex items-center gap-2">
          <span>${formatDate(liveSession.date)}</span>
          <span class="text-muted/50">·</span>
          <span class="text-racing">En cours</span>
        </div>
        <button id="finish-session" class="font-semibold text-acid border border-acid bg-acid/[0.10] px-3 py-1.5 active:bg-acid active:text-ink transition text-[10px]">Fin</button>
      </div>

      <!-- Counter + progress -->
      <div class="px-5 pb-3">
        <div class="flex items-baseline justify-end mb-2">
          <span class="font-display text-[13px] num-stat font-bold leading-none">
            <span class="text-acid">${String(doneSeries).padStart(2, '0')}</span><span class="text-muted">/${String(totalSeries).padStart(2, '0')}</span>
            <span class="font-sans font-medium text-[9px] uppercase tracking-eyebrow text-muted ml-1">séries</span>
          </span>
        </div>
        <div class="h-[3px] bg-border relative overflow-hidden">
          <div class="absolute left-0 top-0 h-full bg-acid" style="width:${pct}%"></div>
        </div>
      </div>

      <!-- Stats strip 4 cols cyan -->
      <div class="grid grid-cols-4 border-t border-border">
        <div class="px-2.5 py-3 border-r border-border min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Volume</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${Math.round(doneVolume)}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">kg</span></p>
        </div>
        <div class="px-2.5 py-3 border-r border-border min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Tonnage</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${tonnage}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">t</span></p>
        </div>
        <div class="px-2.5 py-3 border-r border-border min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Reps</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${doneReps}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">/${totalReps}</span></p>
        </div>
        <div class="px-2.5 py-3 min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Cible</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${cibleTon}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">t</span></p>
        </div>
      </div>
    `;
  }
  tab.appendChild(header);

  document.getElementById('finish-session')?.addEventListener('click', finishSession);
  document.getElementById('back-to-list')?.addEventListener('click', () => { liveFocus = null; liveRest = null; renderSeanceScreen(); });
  document.getElementById('back-home')?.addEventListener('click', () => showScreen('home'));

  if (isCardio) {
    renderLiveCardio(tab);
    return;
  }

  // Masque la sticky countdown bar quand on est en rest split (chrono mid-screen visible)
  const cdBar = document.getElementById('countdown-bar');
  if (cdBar) cdBar.classList.toggle('in-rest-split', liveRest !== null);

  if (liveRest)       renderRestSplit(tab);
  else if (liveFocus) renderSeriesFocus(tab);
  else                renderExerciseList(tab, { totalSeries, doneSeries, totalVolume, doneVolume, totalReps, doneReps });
}

function renderExerciseList(tab, totals = {}) {
  const { totalSeries = 0 } = totals;

  // Compteurs pour le sous-titre du masthead
  const exoCount = liveSession.exercises.filter(ex => ex.type !== 'cardio').length;
  // Estim durée moyenne : ~1.5min par série + repos moyen ~75s par série
  const avgRest = liveSession.exercises.reduce((s, ex) => {
    return s + ex.series.length * (ex.activities[0]?.rest || 60);
  }, 0);
  const estimMin = Math.round((totalSeries * 30 + avgRest) / 60);

  const wrap = document.createElement('div');
  wrap.className = '';

  // Masthead H1 — split title sur premier sep, ligne 2 paper/40 avec sep acid
  const { line1, sep, rest } = splitProgrammeTitle(liveSession.programmeName);
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-9 pb-9 accent-line';
  masthead.innerHTML = `
    <h1 class="font-display font-black h-display text-paper">
      ${line1}${sep ? `<br/><span class="text-paper/40"><span class="text-acid not-italic font-black">${sep}</span> ${rest}.</span>` : ''}
    </h1>
    <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-5">
      ${String(exoCount).padStart(2, '0')} exercice${exoCount > 1 ? 's' : ''} · ${String(totalSeries).padStart(2, '0')} séries${estimMin ? ` · ≈ ${estimMin} min` : ''}
    </p>
  `;
  wrap.appendChild(masthead);

  // Exercise list — done at the bottom
  const indexed = liveSession.exercises.map((ex, exIdx) => {
    const totalSets = ex.series.length;
    const doneSets = ex.series.filter(s =>
      ex.activities.every((_, a) => s.activityStates?.[a] === 'done')
    ).length;
    return { ex, exIdx, totalSets, doneSets };
  });
  indexed.sort((a, b) => {
    const aDone = a.doneSets === a.totalSets ? 1 : 0;
    const bDone = b.doneSets === b.totalSets ? 1 : 0;
    return aDone - bDone;
  });

  const list = document.createElement('div');
  list.className = 'border-y border-border';

  indexed.forEach(({ ex, exIdx, totalSets, doneSets }) => {
    const startedSets = ex.series.filter(s =>
      ex.activities.some((_, a) => s.activityStates?.[a])
    ).length;

    const isDone    = doneSets === totalSets;
    const isStarted = !isDone && startedSets > 0;

    let statusHtml, borderLeft, nameColor, weightColor, unitColor, repsColor, muscleColor, xColor, dotColor;
    if (isDone) {
      statusHtml  = `<span class="font-display italic font-semibold text-[10px] uppercase tracking-eyebrow text-acid">Fait</span>`;
      borderLeft  = 'border-l-[3px] border-l-acid bg-acid/[0.03]';
      nameColor   = 'text-muted';
      weightColor = 'text-muted';
      unitColor   = 'text-muted';
      repsColor   = 'text-muted';
      muscleColor = 'text-acid/70';
      xColor      = 'text-acid/60';
      dotColor    = 'bg-acid';
    } else if (isStarted) {
      statusHtml  = `<span class="font-display italic font-semibold text-[10px] uppercase tracking-eyebrow text-racing flex items-center gap-1.5"><span aria-hidden class="w-1.5 h-1.5 bg-racing animate-pulse"></span>${doneSets}/${totalSets}</span>`;
      borderLeft  = 'border-l-[3px] border-l-racing bg-racing/[0.07]';
      nameColor   = 'text-paper';
      weightColor = 'text-racing';
      unitColor   = 'text-muted';
      repsColor   = 'text-paper';
      muscleColor = 'text-racing';
      xColor      = 'text-racing';
      dotColor    = 'bg-racing';
    } else {
      statusHtml  = '';
      borderLeft  = 'border-l-[3px] border-l-transparent';
      nameColor   = 'text-paper';
      weightColor = 'text-paper';
      unitColor   = 'text-muted';
      repsColor   = 'text-paper';
      muscleColor = 'text-paper';
      xColor      = 'text-acid';
      dotColor    = 'bg-paper';
    }

    const muscle = (ex.activities?.[0]?.name) || '';
    const wActIdx = ex.activities.findIndex(a => a.type === 'weight');
    const wAct = wActIdx >= 0 ? ex.activities[wActIdx] : null;
    // Affiche la dernière valeur saisie (sinon le planifié)
    const latestVal = (() => {
      if (wActIdx < 0) return null;
      for (let i = ex.series.length - 1; i >= 0; i--) {
        const v = ex.series[i]?.values?.[wActIdx];
        if (v && (v.weight != null || v.reps != null)) return v;
      }
      return null;
    })();
    const dispWeight = latestVal?.weight ?? wAct?.weight ?? 0;
    const dispReps   = latestVal?.reps   ?? wAct?.reps   ?? 0;
    const weightTxt  = wAct ? `${dispWeight}` : '';
    const repsTxt    = wAct
      ? `${totalSets}<span class="${xColor} mx-1 font-display font-black not-italic">×</span>${dispReps}`
      : `${totalSets} série${totalSets > 1 ? 's' : ''}`;

    const card = document.createElement('button');
    card.className = `w-full text-left flex items-center gap-4 px-5 py-5 border-b border-border/70 ${borderLeft} active:bg-inkAlt transition`;
    card.innerHTML = `
      <div class="flex-1 min-w-0">
        <h3 class="font-display font-black italic text-[22px] leading-[1.05] ${nameColor} truncate">${ex.name}</h3>
        <p class="font-sans text-[9px] uppercase tracking-eyebrow ${muscleColor} mt-1.5 flex items-center gap-2 truncate">
          ${muscle ? `<span aria-hidden class="w-1 h-1 ${dotColor} shrink-0"></span><span class="truncate">${muscle}</span>` : ''}
          ${statusHtml ? `<span aria-hidden class="w-2 h-px ${isDone ? 'bg-acid/40' : 'bg-racing/40'}"></span>${statusHtml}` : ''}
        </p>
      </div>
      <div class="text-right shrink-0 leading-none">
        ${weightTxt ? `<p class="font-display font-black text-[26px] num-stat ${weightColor} leading-none tracking-tight">${weightTxt}<span class="font-sans font-medium text-[10px] tracking-eyebrow ${unitColor} ml-1 align-baseline">kg</span></p>` : ''}
        <p class="font-sans font-medium text-[11px] uppercase tracking-eyebrow ${repsColor} num-stat mt-1.5">${repsTxt}</p>
      </div>
    `;
    card.addEventListener('click', () => {
      const next = nextUndoneActivity(exIdx);
      // Si exo entièrement fait, on ouvre la première activité de la première série pour permettre l'édition
      liveFocus = next || { exIdx, sIdx: 0, actIdx: 0 };
      renderSeanceScreen();
    });
    list.appendChild(card);
  });

  wrap.appendChild(list);
  tab.appendChild(wrap);
}

// Header commun (masthead session + exo header) — utilisé par focus et rest split
function renderExoMasthead(wrap, exIdx) {
  const ex = liveSession.exercises[exIdx];
  let doneSeries = 0;
  const totalSeries = ex.series.length;
  ex.series.forEach((s) => {
    const allDone = ex.activities.every((_, a) => s.activityStates?.[a] === 'done');
    if (allDone) doneSeries++;
  });

  // Session masthead
  const { line1, sep, rest } = splitProgrammeTitle(liveSession.programmeName);
  const sessionMast = document.createElement('section');
  sessionMast.className = 'px-5 pt-9 pb-9 accent-line';
  const exoCount = liveSession.exercises.filter(e => e.type !== 'cardio').length;
  const totalSeriesAll = liveSession.exercises.reduce((s, e) => e.type === 'cardio' ? s : s + e.series.length, 0);
  sessionMast.innerHTML = `
    <h1 class="font-display font-black h-display text-paper">
      ${line1}${sep ? `<br/><span class="text-paper/40"><span class="text-acid not-italic font-black">${sep}</span> ${rest}.</span>` : ''}
    </h1>
    <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-5">
      ${String(exoCount).padStart(2, '0')} exercices · ${String(totalSeriesAll).padStart(2, '0')} séries
    </p>
  `;
  wrap.appendChild(sessionMast);

  // Exercise header
  const muscle = ex.activities?.[0]?.name || '';
  const restSecs = ex.activities?.[0]?.rest || 0;
  const restStr = restSecs > 0 ? `Repos ${Math.floor(restSecs / 60)}:${String(restSecs % 60).padStart(2, '0')}` : '';
  const exoHead = document.createElement('header');
  exoHead.className = 'px-5 mb-5';
  exoHead.innerHTML = `
    <div class="flex items-baseline gap-3 flex-wrap">
      <h2 class="font-display font-bold text-[24px] leading-[1.1] text-paper">${ex.name}</h2>
      <span class="font-sans text-[9px] uppercase tracking-eyebrow text-acid font-semibold flex items-center gap-1.5 shrink-0">
        <span aria-hidden class="w-1.5 h-1.5 bg-acid"></span>
        ${String(doneSeries).padStart(2, '0')}/${String(totalSeries).padStart(2, '0')} fait
      </span>
    </div>
    ${(muscle || restStr) ? `<p class="font-sans text-[11px] uppercase tracking-eyebrow text-muted mt-2">${[muscle, restStr].filter(Boolean).join(' · ')}</p>` : ''}
  `;
  wrap.appendChild(exoHead);
}

// Vue focus série — affiche UNE seule série à valider, avec mega values
function renderSeriesFocus(tab) {
  const { exIdx, sIdx, actIdx } = liveFocus;
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const v = ex.series[sIdx].values?.[actIdx] || {};
  const totalSets = ex.series.length;

  const wrap = document.createElement('div');
  wrap.className = 'pb-8';

  renderExoMasthead(wrap, exIdx);

  // Bloc focus série — eyebrow racing + mega values + accent line racing
  const focus = document.createElement('section');
  focus.className = 'px-5 mt-8';
  const subParts = [`Série ${sIdx + 1} / ${totalSets}`];
  if (ex.activities.length > 1) subParts.push(act.label || act.name || `Activité ${actIdx + 1}`);

  let valuesHtml;
  if (act.type === 'weight') {
    const reps = v.reps ?? act.reps ?? 0;
    const kg   = v.weight ?? act.weight ?? 0;
    valuesHtml = `
      <span class="font-display font-black num-set-hot text-racing">${kg}<span class="font-sans font-medium text-[14px] uppercase tracking-eyebrow text-racing/80 ml-2 align-baseline">kg</span></span>
      <span class="font-display font-bold text-[28px] num-stat text-paper pb-3">× ${reps}</span>
    `;
  } else if (act.type === 'countdown') {
    const dur = v.duration ?? act.duration ?? 0;
    valuesHtml = `<span class="font-display font-black num-set-hot text-racing">${dur}<span class="font-sans font-medium text-[14px] uppercase tracking-eyebrow text-racing/80 ml-2 align-baseline">s</span></span>`;
  } else {
    valuesHtml = `<span class="font-display font-black num-set-hot text-racing">Chrono</span>`;
  }

  // Préc
  const prevVal = ex.prevSeries?.[sIdx]?.values?.[actIdx];
  let prevText = '';
  if (act.type === 'weight' && (prevVal?.reps || prevVal?.weight)) {
    prevText = `Préc : ${prevVal.weight ?? '—'}×${prevVal.reps ?? '—'} kg`;
  } else if (act.type === 'countdown' && prevVal?.duration) {
    prevText = `Préc : ${prevVal.duration}s`;
  } else if (act.type === 'stopwatch' && prevVal?.duration) {
    prevText = `Préc : ${formatSeconds(prevVal.duration)}`;
  }

  focus.innerHTML = `
    <p class="font-sans text-[10px] uppercase tracking-eyebrow text-racing font-semibold mb-4 flex items-center gap-2">
      <span aria-hidden class="w-1.5 h-1.5 bg-racing animate-pulse"></span>
      ${subParts.join(' · ')}
    </p>
    <div class="flex items-end gap-5 mb-3">
      ${valuesHtml}
    </div>
    <span aria-hidden class="block w-10 h-px bg-racing mt-3"></span>
    ${prevText ? `<p class="font-sans text-[11px] uppercase tracking-eyebrow text-muted mt-5">${prevText}</p>` : ''}
  `;
  wrap.appendChild(focus);

  // Suggestion IA placeholder
  if (act.type === 'weight') {
    const sug = document.createElement('div');
    sug.id = 'focus-suggestion';
    sug.className = 'hidden font-sans text-[12px] text-muted italic mx-5 mt-5 mb-2 px-3 py-2 border border-border bg-inkAlt';
    wrap.appendChild(sug);
  }

  // Actions — Modifier border + Valider/Démarrer acid
  const isTimed = (act.type === 'stopwatch' || act.type === 'countdown');
  const validateLabel = act.type === 'stopwatch'
    ? '▶ Démarrer chrono'
    : (act.type === 'countdown' ? '▶ Démarrer minuterie' : '✓ Valider');

  const actions = document.createElement('div');
  actions.className = 'mt-10 px-5 grid grid-cols-2 gap-3';
  let actionsHtml = '';
  if (act.type !== 'stopwatch') {
    actionsHtml += `<button id="focus-edit" class="py-4 border border-border text-paper font-sans text-[12px] uppercase tracking-eyebrow active:border-acid active:text-acid transition">✎ Modifier</button>`;
  } else {
    actionsHtml += `<span></span>`;
  }
  actionsHtml += `<button id="focus-validate" class="py-4 bg-acid text-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-acid/80 transition">${validateLabel}</button>`;
  actions.innerHTML = actionsHtml;
  wrap.appendChild(actions);

  tab.appendChild(wrap);

  // Suggestion IA — async
  if (act.type === 'weight') {
    const sugEl = document.getElementById('focus-suggestion');
    if (sugEl) {
      sugEl.innerHTML = `<div class="live-edit-suggestion-spinner"></div><span>Suggestion…</span>`;
      sugEl.classList.remove('hidden');
      const targetExName = ex.name;
      generateWeightSuggestion(targetExName).then(text => {
        if (!liveFocus || liveSession.exercises[liveFocus.exIdx]?.name !== targetExName) return;
        const el = document.getElementById('focus-suggestion');
        if (!el) return;
        if (!text) { el.classList.add('hidden'); return; }
        el.innerHTML = `💡 ${text}`;
      }).catch(() => {
        const el = document.getElementById('focus-suggestion');
        if (el) el.classList.add('hidden');
      });
    }
  }

  document.getElementById('focus-edit')?.addEventListener('click', () => {
    openEditModalForActivity(exIdx, sIdx, actIdx);
  });
  document.getElementById('focus-validate').addEventListener('click', () => {
    if (act.type === 'stopwatch') {
      openChronoOverlay(exIdx, sIdx, actIdx, null);
    } else if (act.type === 'countdown') {
      openMinuterieOverlay(exIdx, sIdx, actIdx, null);
    } else {
      completeFocusedActivity();
    }
  });
}

// Vue repos split — mega chrono central + recap série modifiable
function renderRestSplit(tab) {
  const { exIdx, sIdx, actIdx } = liveRest;
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const v = ex.series[sIdx].values?.[actIdx] || {};
  const totalSets = ex.series.length;

  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col min-h-[calc(100svh-180px)] pb-8';

  // Top mini header — exo name + série done badge
  const muscle = ex.activities?.[0]?.name || '';
  const topHeader = document.createElement('header');
  topHeader.className = 'px-5 pt-6 pb-3';
  topHeader.innerHTML = `
    <p class="font-sans text-[9px] uppercase tracking-eyebrow text-acid font-semibold mb-1.5 flex items-center gap-2">
      <span aria-hidden class="w-1.5 h-1.5 bg-acid"></span>
      Série ${sIdx + 1} / ${totalSets} validée
    </p>
    <h2 class="font-display font-bold italic text-[20px] leading-tight text-paper truncate">${ex.name}</h2>
    ${muscle ? `<p class="font-sans text-[9px] uppercase tracking-eyebrow text-muted mt-1">${muscle}</p>` : ''}
  `;
  wrap.appendChild(topHeader);

  // Mega chrono central
  const center = document.createElement('div');
  center.className = 'flex-1 flex flex-col items-center justify-center text-center px-6 py-10 gap-5';
  center.innerHTML = `
    <p class="font-sans text-[10px] uppercase tracking-[0.40em] text-racing font-semibold flex items-center gap-2">
      <span aria-hidden class="w-1.5 h-1.5 bg-racing animate-pulse"></span>
      Repos
    </p>
    <div id="rest-split-time" class="font-display font-black num-stat text-racing leading-none tracking-tight" style="font-size:clamp(4.5rem, 24vw, 7.5rem)">--:--</div>
    <p id="rest-split-next" class="font-sans text-[11px] uppercase tracking-eyebrow text-muted max-w-[30ch]"></p>
    <button id="rest-split-skip" class="mt-2 py-3 px-6 border border-border text-paper font-sans text-[11px] uppercase tracking-eyebrow active:border-acid active:text-acid transition">⏭ Passer le repos</button>
  `;
  wrap.appendChild(center);

  // Recap série juste validée — modifiable
  let valHtml;
  if (act.type === 'weight') {
    valHtml = `
      <span class="font-display font-bold text-[26px] num-stat text-paper">${v.weight ?? 0}<span class="font-sans font-medium text-[11px] uppercase tracking-eyebrow text-muted ml-1.5 align-baseline">kg</span></span>
      <span class="font-display font-bold text-[18px] num-stat text-paper">× ${v.reps ?? 0}</span>
    `;
  } else {
    valHtml = `<span class="font-display font-bold text-[26px] num-stat text-paper">${v.duration ?? 0}<span class="font-sans font-medium text-[11px] uppercase tracking-eyebrow text-muted ml-1.5 align-baseline">s</span></span>`;
  }
  const editBtn = act.type === 'stopwatch'
    ? ''
    : `<button id="rest-edit" class="shrink-0 py-2 px-4 border border-border text-paper font-sans text-[10px] uppercase tracking-eyebrow active:border-acid active:text-acid transition">✎ Modifier</button>`;

  const recap = document.createElement('div');
  recap.className = 'border-y border-border border-l-[3px] border-l-acid bg-acid/[0.04] px-5 py-4 mt-6 mx-5 flex items-center justify-between gap-4';
  recap.innerHTML = `
    <div class="min-w-0 space-y-1">
      <p class="font-sans text-[9px] uppercase tracking-eyebrow text-acid font-semibold">Série ${sIdx + 1} ✓</p>
      <div class="flex items-baseline gap-3 flex-wrap">${valHtml}</div>
    </div>
    ${editBtn}
  `;
  wrap.appendChild(recap);

  tab.appendChild(wrap);

  // Mirror du countdown du bandeau sticky (qui est masqué via .in-rest-split)
  const sync = () => {
    const cdDisplay = document.getElementById('countdown-display');
    const splitTime = document.getElementById('rest-split-time');
    const nextLabel = document.getElementById('countdown-exercise-name');
    const splitNext = document.getElementById('rest-split-next');
    if (cdDisplay && splitTime) splitTime.textContent = cdDisplay.textContent;
    if (nextLabel && splitNext) splitNext.textContent = nextLabel.textContent ? `À suivre : ${nextLabel.textContent.replace(/^À suivre :\s*/, '')}` : '';
  };
  sync();
  const restSyncId = setInterval(sync, 200);
  if (window.__restSyncId) clearInterval(window.__restSyncId);
  window.__restSyncId = restSyncId;

  document.getElementById('rest-edit')?.addEventListener('click', () => {
    openEditModalForActivity(exIdx, sIdx, actIdx);
  });
  document.getElementById('rest-split-skip').addEventListener('click', () => {
    showConfirm('Passer le repos ?', finishCountdown);
  });
}

// Stub kept for backwards-compat references — no longer called directly
function renderExerciseDetail(tab) {
  return renderSeriesFocus(tab);
}

// Compute exo totals helper (kept for any future use, was inlined)
function _computeExoTotalsLegacy(ex) {
  let doneSeries = 0;
  const totalSeries = ex.series.length;
  let volume = 0, repsAccum = 0;
  ex.series.forEach((s) => {
    const allDone = ex.activities.every((_, a) => s.activityStates?.[a] === 'done');
    if (allDone) doneSeries++;
    ex.activities.forEach((act, a) => {
      if (act.type !== 'weight') return;
      const v = s.values?.[a] || {};
      const r = v.reps ?? act.reps ?? 0;
      const w = v.weight ?? act.weight ?? 0;
      if (s.activityStates?.[a] === 'done') {
        volume += r * w;
        repsAccum += r;
      }
    });
  });
  return { doneSeries, totalSeries, volume, repsAccum };
}

function completeFocusedActivity() {
  if (!liveFocus) return;
  const { exIdx, sIdx, actIdx } = liveFocus;
  const ex = liveSession.exercises[exIdx];
  const set = ex.series[sIdx];
  if (!set.activityStates) set.activityStates = {};
  set.activityStates[actIdx] = 'done';
  pushSession(liveSessionSnapshot()).catch(() => {});

  const act = ex.activities[actIdx];
  const restSecs = act.rest || 0;

  const nextInSame = nextUndoneActivity(exIdx);

  // Plus aucune série non faite dans cet exo → retour à la liste
  if (!nextInSame) {
    liveFocus = null;
    liveRest = null;
    stopCountdown();
    renderSeanceScreen();
    return;
  }

  if (restSecs > 0) {
    // Mode rest split : chrono mega + recap série juste faite + Modifier
    liveRest = { exIdx, sIdx, actIdx };
    liveFocus = null;
    renderSeanceScreen();
    const nextLabel = labelOfActivity(nextInSame);
    startCountdown(restSecs, nextLabel, () => {
      liveRest = null;
      liveFocus = nextInSame; // bascule sur la série suivante
      renderSeanceScreen();
    });
  } else {
    // Pas de repos → direct série suivante
    liveRest = null;
    liveFocus = nextInSame;
    renderSeanceScreen();
  }
}

function labelOfActivity({ exIdx, sIdx, actIdx }) {
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const parts = [ex.name, `Série ${sIdx + 1}`];
  if (ex.activities.length > 1) parts.push(act.label || act.name || `Activité ${actIdx + 1}`);
  return parts.join(' · ');
}

function openEditModalForActivity(exIdx, sIdx, actIdx) {
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const v = ex.series[sIdx].values?.[actIdx] || {};
  if (act.type === 'stopwatch') return;

  const actLabel = act.label || act.name || '';
  const title = actLabel ? `${ex.name} — ${actLabel}` : ex.name;

  if (act.type === 'weight') {
    const currentReps   = v.reps   ?? act.reps   ?? 0;
    const currentWeight = v.weight ?? act.weight ?? 0;
    const currentRest   = act.rest ?? 0;
    const originalWeight = currentWeight;

    const inputCls = 'w-full bg-transparent border-b border-border focus:border-acid font-display font-bold text-[22px] num-stat text-paper py-2 outline-none transition';
    const labelCls = 'font-sans text-[9px] uppercase tracking-[0.40em] text-muted mb-1.5';
    const bodyHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="${labelCls}">Poids</p>
          <div class="flex items-baseline gap-2">
            <input type="number" inputmode="decimal" class="live-weight ${inputCls}" value="${currentWeight}" min="0" step="0.5">
            <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0">kg</span>
          </div>
        </div>
        <div>
          <p class="${labelCls}">Reps</p>
          <div class="flex items-baseline gap-2">
            <input type="number" inputmode="decimal" class="live-reps ${inputCls}" value="${currentReps}" min="1">
            <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0">×</span>
          </div>
        </div>
      </div>
      <div>
        <p class="${labelCls}">Repos</p>
        <div class="flex items-baseline gap-2">
          <input type="number" inputmode="numeric" class="live-rest ${inputCls}" value="${currentRest}" min="0">
          <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0">s</span>
        </div>
      </div>
    `;

    const applyEdit = () => {
      const rI = document.querySelector('#live-edit-modal-body .live-reps');
      const wI = document.querySelector('#live-edit-modal-body .live-weight');
      const restI = document.querySelector('#live-edit-modal-body .live-rest');
      const r = parseFloat(rI.value) || 0;
      const w = parseFloat(wI.value) || 0;
      const restVal = parseInt(restI.value) || 0;

      propagateLiveValue(exIdx, sIdx, actIdx, 'reps', r);
      propagateLiveValue(exIdx, sIdx, actIdx, 'weight', w);
      liveSession.exercises[exIdx].activities[actIdx].rest = restVal;
      updateProgrammeTemplate(exIdx, actIdx, 'rest', restVal);

      closeLiveEditModal();
      pushSession(liveSessionSnapshot()).catch(() => {});
      renderSeanceScreen();
    };

    openLiveEditModal({
      title, bodyHTML, focusSelector: '.live-weight',
      onOk: () => {
        const newWeight = parseFloat(document.querySelector('#live-edit-modal-body .live-weight').value) || 0;
        if (newWeight < originalWeight && originalWeight > 0) {
          showConfirm(`Réduire le poids de ${originalWeight} kg à ${newWeight} kg ?`, applyEdit);
          return;
        }
        applyEdit();
      },
    });
    return;
  }

  if (act.type === 'countdown') {
    const currentDur  = v.duration ?? act.duration ?? 0;
    const currentRest = act.rest ?? 0;

    const inputCls = 'w-full bg-transparent border-b border-border focus:border-acid font-display font-bold text-[22px] num-stat text-paper py-2 outline-none transition';
    const labelCls = 'font-sans text-[9px] uppercase tracking-[0.40em] text-muted mb-1.5';
    const bodyHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="${labelCls}">Durée</p>
          <div class="flex items-baseline gap-2">
            <input type="number" inputmode="numeric" class="live-duration ${inputCls}" value="${currentDur}" min="1">
            <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0">s</span>
          </div>
        </div>
        <div>
          <p class="${labelCls}">Repos</p>
          <div class="flex items-baseline gap-2">
            <input type="number" inputmode="numeric" class="live-rest ${inputCls}" value="${currentRest}" min="0">
            <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0">s</span>
          </div>
        </div>
      </div>
    `;

    openLiveEditModal({
      title, bodyHTML, focusSelector: '.live-duration',
      onOk: () => {
        const dI = document.querySelector('#live-edit-modal-body .live-duration');
        const restI = document.querySelector('#live-edit-modal-body .live-rest');
        const dur = parseInt(dI.value) || 0;
        const restVal = parseInt(restI.value) || 0;
        if (!liveSession.exercises[exIdx].series[sIdx].values[actIdx]) {
          liveSession.exercises[exIdx].series[sIdx].values[actIdx] = {};
        }
        liveSession.exercises[exIdx].series[sIdx].values[actIdx].duration = dur;
        liveSession.exercises[exIdx].activities[actIdx].rest = restVal;
        updateProgrammeTemplate(exIdx, actIdx, 'rest', restVal);
        closeLiveEditModal();
        pushSession(liveSessionSnapshot()).catch(() => {});
        renderSeanceScreen();
      },
    });
  }
}

function renderLiveCardio(tab) {
  const wrap = document.createElement('div');
  wrap.className = 'py-5';

  liveSession.exercises.forEach((ex, exIdx) => {
    const isDone = ex.state === 'done';
    const ord = String(exIdx + 1).padStart(2, '0');

    const article = document.createElement('article');
    article.className = 'mb-10';

    // Header — numero + nom + status
    const header = document.createElement('header');
    header.className = 'px-5 mb-4';
    header.innerHTML = `
      <div class="flex items-baseline gap-5">
        <span class="font-display font-black text-[34px] ${isDone ? 'text-muted' : 'text-racing'} leading-none num-stat tracking-tight">${ord}</span>
        <div class="flex-1 pt-1 space-y-2">
          <div class="flex items-baseline gap-3 flex-wrap">
            <h2 class="font-display font-bold text-[24px] leading-[1.1] text-paper">${ex.name}</h2>
            <span class="font-sans text-[9px] uppercase tracking-eyebrow ${isDone ? 'text-acid' : 'text-muted'} font-semibold flex items-center gap-1.5 shrink-0">
              <span aria-hidden class="w-1.5 h-1.5 ${isDone ? 'bg-acid' : 'bg-muted'}"></span>
              ${isDone ? 'Fait' : 'À faire'}
            </span>
          </div>
          ${ex.comment ? `<p class="font-sans text-[11px] uppercase tracking-eyebrow text-muted">${ex.comment}</p>` : ''}
        </div>
      </div>
    `;
    article.appendChild(header);

    // Fields — 3 inputs (Temps / Puissance / Distance)
    const fields = document.createElement('div');
    fields.className = 'grid grid-cols-3 border-y border-border';

    const makeField = (label, unit, value, type, step, onChange) => {
      const wrap = document.createElement('div');
      wrap.className = 'px-3 py-3 border-r border-border last:border-r-0';
      wrap.innerHTML = `
        <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">${label}</p>
        <div class="flex items-baseline gap-1.5">
          <input type="number" inputmode="${type}" ${step ? `step="${step}"` : ''} min="0" value="${value || ''}"
            class="font-display font-bold text-[20px] num-stat text-cyan leading-none bg-transparent w-full min-w-0 outline-none focus:text-paper" />
          <span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted shrink-0">${unit}</span>
        </div>
      `;
      const inp = wrap.querySelector('input');
      inp.addEventListener('input', onChange);
      return wrap;
    };

    fields.appendChild(makeField('Temps', 'min', ex.done.duration, 'numeric', null, e => {
      const v = parseInt(e.target.value) || 0;
      liveSession.exercises[exIdx].done.duration = v;
      updateCardioTemplate(exIdx, 'duration', v);
    }));
    fields.appendChild(makeField('Puissance', 'W', ex.done.power, 'numeric', null, e => {
      const v = parseInt(e.target.value) || 0;
      liveSession.exercises[exIdx].done.power = v;
      updateCardioTemplate(exIdx, 'power', v);
    }));
    fields.appendChild(makeField('Distance', 'km', ex.done.km, 'decimal', '0.1', e => {
      const v = parseFloat(e.target.value) || 0;
      liveSession.exercises[exIdx].done.km = v;
      updateCardioTemplate(exIdx, 'km', v);
    }));
    article.appendChild(fields);

    // Prev — eyebrow muted
    if (ex.prev) {
      const parts = [
        `${ex.prev.duration || '—'} min`,
        `${ex.prev.power || '—'} W`,
      ];
      if (ex.prev.km) parts.push(`${ex.prev.km} km`);
      const prev = document.createElement('p');
      prev.className = 'font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-3 px-5';
      prev.textContent = `Préc : ${parts.join(' · ')}`;
      article.appendChild(prev);
    }

    // State btn
    const btnWrap = document.createElement('div');
    btnWrap.className = 'mt-4 px-5';
    const stateBtn = document.createElement('button');
    const refreshStateBtn = () => {
      const done = ex.state === 'done';
      stateBtn.className = done
        ? 'w-full py-4 border border-acid text-acid font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-acid/[0.08] transition'
        : 'w-full py-4 bg-acid text-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-acid/80 transition';
      stateBtn.textContent = done ? '✓ Fait' : '✓ Valider';
    };
    refreshStateBtn();
    stateBtn.addEventListener('click', () => {
      ex.state = ex.state === 'done' ? 'pending' : 'done';
      refreshStateBtn();
      pushSession(liveSessionSnapshot()).catch(() => {});
    });
    btnWrap.appendChild(stateBtn);
    article.appendChild(btnWrap);

    wrap.appendChild(article);
  });

  tab.appendChild(wrap);
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

  if (row) {
    const span = row.querySelector(`.live-chrono-result[data-act="${actIdx}"]`);
    if (span) span.textContent = formatSeconds(elapsed);
  }

  document.getElementById('chrono-overlay').classList.add('hidden');
  // S'assurer que liveFocus pointe sur cette activité avant de la valider
  liveFocus = { exIdx, sIdx, actIdx };
  completeFocusedActivity();
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

  const { exIdx, sIdx, actIdx } = currentMinuterieCtx;
  currentMinuterieCtx = null;

  document.getElementById('minuterie-overlay').classList.add('hidden');
  liveFocus = { exIdx, sIdx, actIdx };
  completeFocusedActivity();
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
  });
  updateProgrammeTemplate(exIdx, actIdx, field, val);
}

// Sérialisée pour éviter les races entre updates concurrents du même programme
let programmeTemplateQueue = Promise.resolve();

function updateProgrammeTemplate(exIdx, actIdx, field, val) {
  if (!liveSession.programmeId) return programmeTemplateQueue;
  programmeTemplateQueue = programmeTemplateQueue.then(async () => {
    const programmes = await loadProgrammes();
    const prog = programmes.find(p => p.id === liveSession.programmeId);
    if (!prog?.exercises[exIdx]?.activities?.[actIdx]) return;
    prog.exercises[exIdx].activities[actIdx][field] = val;
    await updateProgrammeDB(prog);
  }).catch(err => console.error('updateProgrammeTemplate error:', err));
  return programmeTemplateQueue;
}

function updateCardioTemplate(exIdx, field, val) {
  if (!liveSession.programmeId) return programmeTemplateQueue;
  programmeTemplateQueue = programmeTemplateQueue.then(async () => {
    const programmes = await loadProgrammes();
    const prog = programmes.find(p => p.id === liveSession.programmeId);
    if (!prog?.exercises[exIdx]) return;
    prog.exercises[exIdx][field] = val;
    await updateProgrammeDB(prog);
  }).catch(err => console.error('updateCardioTemplate error:', err));
  return programmeTemplateQueue;
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
  showConfirm('Terminer et enregistrer la séance ?', async () => {
    stopAllChronos();
    stopSyncPolling();
    const durationSecs = Math.round((Date.now() - new Date(liveSession.startedAt).getTime()) / 1000);
    const snapshot = liveSessionSnapshot(durationSecs);
    await pushSession(snapshot);

    // Auto-injection de la dépense calorique dans le suivi alimentaire (fire-and-forget)
    (async () => {
      const burn = await estimateSessionBurn(snapshot);
      if (burn?.kcal) {
        const now = new Date();
        await insertFoodEntryDB({
          date: snapshot.date,
          time: now.toTimeString().slice(0, 8),
          type: 'session_burn',
          description: snapshot.programmeName || 'Séance',
          kcal: burn.kcal,
          session_category: snapshot.category || 'fonte',
        });
      }
    })().catch(() => {});

    liveSession = null;
    liveFocus = null;
    liveRest = null;
    releaseWakeLock();
    stopCountdown();
    showScreen('home');
    showPostSessionFeedback(snapshot);
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
      liveFocus = null;
      liveRest = null;
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

      // Cardio sync : seul l'état (done/pending) est synchronisé.
      // Les valeurs done.duration/power/km sont saisies uniquement sur le téléphone,
      // les écraser depuis la DB provoquerait un reset pendant la saisie.
      if (dbEx.type === 'cardio' && localEx.type === 'cardio') {
        if (dbEx.state !== localEx.state) { localEx.state = dbEx.state; changed = true; }
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
// Keep in sync with stroke-dasharray on .ring-progress in style.css
const RING_CIRCUMFERENCE = 2 * Math.PI * 42; // ≈ 264 (ring compact, r=42)

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

document.getElementById('countdown-skip').addEventListener('click', () => {
  showConfirm('Passer le repos ?', finishCountdown);
});

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

  // Masthead
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-9 pb-9 accent-line';
  masthead.innerHTML = `
    <h1 class="font-display font-black h-display text-paper">
      Ton<br/>
      <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> corps.</span>
    </h1>
  `;
  body.appendChild(masthead);

  const measurements = await loadBodyMeasurementsDB();

  // Formulaire
  const form = document.createElement('div');
  form.className = 'px-5 pt-6 pb-6';

  const fields = [
    { key: 'poids',        label: 'Poids',          unit: 'kg', step: '0.1' },
    { key: 'graisseKg',    label: 'Graisse',        unit: 'kg', step: '0.1' },
    { key: 'eau',          label: 'Eau',            unit: '%',  step: '0.1' },
    { key: 'muscle',       label: 'Muscle',         unit: '%',  step: '0.1' },
    { key: 'img',          label: 'IMG',            unit: '%',  step: '0.1' },
    { key: 'os',           label: 'Os',             unit: '%',  step: '0.1' },
    { key: 'tourDeVentre', label: 'Tour de ventre', unit: 'cm', step: '0.1' },
  ];

  // Date input
  const dateRow = document.createElement('div');
  dateRow.className = 'mb-6 flex items-center gap-3';
  dateRow.innerHTML = `
    <p class="font-sans text-[9px] uppercase tracking-[0.40em] text-muted">Jour</p>
    <span class="flex-1 h-px bg-border"></span>
  `;
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = todayIso();
  dateInput.className = 'font-sans text-[12px] text-paper border border-border bg-transparent px-3 py-1.5 focus:border-acid focus:outline-none transition';
  dateRow.appendChild(dateInput);
  form.appendChild(dateRow);

  // Grid 2 cols
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-2 gap-x-4 gap-y-5';

  const inputs = {};
  const diffSpans = {};
  fields.forEach(({ key, label, unit, step }) => {
    const cell = document.createElement('div');
    cell.className = 'min-w-0';
    const lbl = document.createElement('p');
    lbl.className = 'font-sans text-[9px] uppercase tracking-[0.40em] text-muted mb-1.5';
    lbl.textContent = label;
    const row = document.createElement('div');
    row.className = 'flex items-baseline gap-2 border-b border-border focus-within:border-acid transition';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.inputMode = 'decimal';
    inp.step = step;
    inp.min = '0';
    inp.placeholder = '—';
    inp.className = 'flex-1 min-w-0 bg-transparent font-display font-bold text-[20px] num-stat text-paper py-1.5 outline-none';
    inputs[key] = inp;
    const unitSpan = document.createElement('span');
    unitSpan.className = 'font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0';
    unitSpan.textContent = unit;
    row.append(inp, unitSpan);
    if (key === 'poids' || key === 'graisseKg') {
      const diff = document.createElement('span');
      diff.className = 'shrink-0 font-sans text-[10px] uppercase tracking-eyebrow font-semibold ml-1';
      diffSpans[key] = diff;
      row.appendChild(diff);
    }
    cell.append(lbl, row);
    grid.appendChild(cell);
  });

  // Mapping DB snake_case → form camelCase
  const dbToForm = { poids: 'poids', graisse_kg: 'graisseKg', eau: 'eau', muscle: 'muscle', img: 'img', os: 'os', tour_de_ventre: 'tourDeVentre' };

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
    showDiff('graisseKg', existing, prev);
  }

  function showDiff(formKey, current, prev) {
    const span = diffSpans[formKey];
    if (!span) return;
    span.textContent = '';
    span.className = 'shrink-0 font-sans text-[10px] uppercase tracking-eyebrow font-semibold ml-1';
    const dbKey = formKey === 'graisseKg' ? 'graisse_kg' : formKey;
    const cur = current?.[dbKey];
    const prv = prev?.[dbKey];
    if (cur == null || prv == null) return;
    const delta = +(cur - prv).toFixed(1);
    if (delta === 0) return;
    span.textContent = (delta > 0 ? '+' : '') + delta;
    // Pour poids/graisse : up = blood (mauvais), down = acid (mieux)
    span.classList.add(delta > 0 ? 'text-blood' : 'text-acid');
  }

  fillFormForDate(dateInput.value);
  dateInput.addEventListener('change', () => fillFormForDate(dateInput.value));

  // Auto-calcul IMG ↔ graisse kg
  const syncGraisse = () => {
    const p = parseFloat(inputs.poids.value);
    const mg = parseFloat(inputs.graisseKg.value);
    const gp = parseFloat(inputs.img.value);
    if (p && mg && !inputs.img.value)
      inputs.img.value = ((mg / p) * 100).toFixed(1);
    else if (p && gp && !inputs.graisseKg.value)
      inputs.graisseKg.value = ((gp / 100) * p).toFixed(1);
  };
  inputs.poids.addEventListener('change', syncGraisse);
  inputs.graisseKg.addEventListener('change', syncGraisse);
  inputs.img.addEventListener('change', syncGraisse);

  form.appendChild(grid);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'w-full mt-8 py-4 bg-acid text-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-acid/80 transition';
  saveBtn.textContent = 'Enregistrer';
  saveBtn.addEventListener('click', async () => {
    const m = {
      id:          editingId || crypto.randomUUID(),
      date:        dateInput.value || todayIso(),
      poids:        parseFloat(inputs.poids.value)        || null,
      graisseKg:    parseFloat(inputs.graisseKg.value)   || null,
      eau:          parseFloat(inputs.eau.value)          || null,
      muscle:       parseFloat(inputs.muscle.value)       || null,
      img:          parseFloat(inputs.img.value)          || null,
      os:           parseFloat(inputs.os.value)           || null,
      tourDeVentre: parseFloat(inputs.tourDeVentre.value) || null,
    };
    if (!Object.values(m).slice(2).some(v => v !== null)) {
      showAlert('Renseigne au moins une valeur.'); return;
    }
    bodyAnalysisCache = null;
    await pushBodyMeasurementDB(m);
    showToast('Mesure enregistrée ✓');
    openBodyAnalysisPopupLoading();
    const fresh = await loadBodyMeasurementsDB();
    generateBodyAnalysis(fresh).then(text => {
      if (!text) { closeBodyAnalysisPopup(); return; }
      fillBodyAnalysisPopup(text);
    }).catch(() => closeBodyAnalysisPopup());
    renderCorps();
  });
  form.appendChild(saveBtn);
  body.appendChild(form);

  if (!measurements.length) {
    const empty = document.createElement('p');
    empty.className = 'font-display italic text-[14px] text-muted px-5 py-4';
    empty.textContent = 'Aucune mesure enregistrée.';
    body.appendChild(empty);
    return;
  }

  // ── Tendance — stats strip cyan ───────────────────────
  const trendGraisse = corpsTrend(measurements, 'img');

  const trendItems = [
    { label: 'Poids',  field: 'poids',  unit: 'kg', lowerIsBetter: true  },
    { label: 'IMG',    field: 'img',    unit: '%',  lowerIsBetter: true  },
    { label: 'Eau',    field: 'eau',    unit: '%',  lowerIsBetter: false },
    { label: 'Muscle', field: 'muscle', unit: '%',  lowerIsBetter: false },
  ].map(({ label, field, unit, lowerIsBetter }) => {
    const latest = measurements.find(m => m[field] !== null && m[field] !== undefined);
    const trend  = corpsTrend(measurements, field);
    return { label, field, unit, lowerIsBetter, latest: latest?.[field], trend };
  }).filter(t => t.latest !== undefined);

  if (trendItems.length) {
    const trendSection = document.createElement('section');
    trendSection.className = 'mt-4 mb-8';
    trendSection.innerHTML = `
      <header class="px-5 mb-3">
        <h3 class="font-display italic font-bold text-[14px] uppercase tracking-eyebrow text-paper">Tendance</h3>
        <p class="font-sans text-[9px] uppercase tracking-eyebrow text-muted mt-1">10 dernières mesures · variation hebdo</p>
      </header>
    `;
    const grid4 = document.createElement('div');
    grid4.className = 'grid grid-cols-2 border-y border-border';

    trendItems.forEach(({ label, field, unit, lowerIsBetter, latest, trend }, idx) => {
      const cell = document.createElement('div');
      const borderR = (idx % 2 === 0) ? 'border-r border-border' : '';
      const borderB = (idx < 2) ? 'border-b border-border' : '';
      cell.className = `px-4 py-3 min-w-0 ${borderR} ${borderB}`;

      let arrow = '';
      let arrowColor = 'text-muted';
      if (trend && !trend.neutral) {
        arrow = trend.up ? `↑ ${trend.delta}/sem` : `↓ ${trend.delta}/sem`;
        let positive;
        if (field === 'poids' && trend.up && trendGraisse && !trendGraisse.neutral && !trendGraisse.up) {
          positive = true;
        } else {
          positive = lowerIsBetter ? !trend.up : trend.up;
        }
        arrowColor = positive ? 'text-acid' : 'text-blood';
      } else if (trend?.neutral) {
        arrow = '→ stable';
        arrowColor = 'text-muted';
      }

      // Catégorie IMG en badge
      let catBadge = '';
      if (field === 'img') {
        const cat = fatCategory(latest);
        if (cat) {
          catBadge = `<span class="font-sans text-[8px] uppercase tracking-eyebrow font-semibold ml-2" style="color:${cat.color}">${cat.label}</span>`;
        }
      }

      cell.innerHTML = `
        <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5 flex items-center">${label}${catBadge}</p>
        <p class="font-display font-bold text-[18px] num-stat text-cyan leading-none truncate">${latest}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">${unit}</span></p>
        ${arrow ? `<p class="font-sans text-[9px] uppercase tracking-eyebrow font-semibold ${arrowColor} num-stat mt-1.5">${arrow}</p>` : ''}
      `;
      grid4.appendChild(cell);
    });
    trendSection.appendChild(grid4);
    body.appendChild(trendSection);
  }

  // ── Courbes (poids, IMG, eau, muscle) ─────────────────
  const chartDefs = [
    { field: 'poids',  label: 'Poids',   unit: 'kg' },
    { field: 'img',    label: 'IMG',     unit: '%'  },
    { field: 'eau',    label: 'Eau',     unit: '%'  },
    { field: 'muscle', label: 'Muscle',  unit: '%'  },
  ];
  chartDefs.forEach(({ field, label, unit }) => {
    const chartData = measurements.filter(m => m[field] != null).slice(0, 20).reverse();
    if (chartData.length < 2) return;
    const chartWrap = document.createElement('section');
    chartWrap.className = 'px-5 mb-8';
    chartWrap.innerHTML = `
      <header class="mb-3 flex items-baseline justify-between">
        <h3 class="font-display italic font-bold text-[14px] uppercase tracking-eyebrow text-paper">${label}</h3>
        <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted num-stat">${chartData[chartData.length - 1][field]} ${unit}</span>
      </header>
    `;
    const canvas = document.createElement('canvas');
    canvas.className = 'w-full';
    canvas.width  = 340;
    canvas.height = 120;
    chartWrap.appendChild(canvas);
    body.appendChild(chartWrap);
    requestAnimationFrame(() => drawCorpsChart(canvas, chartData, field, unit));
  });

  // ── Analyse bienveillante (affichée seulement si déjà générée dans ce tab) ──
  if (bodyAnalysisCache !== null) {
    const analysisCard = document.createElement('div');
    analysisCard.className = 'mx-5 mb-8 border border-border bg-inkAlt p-4 space-y-2';
    analysisCard.innerHTML = `
      <p class="font-sans text-[10px] uppercase tracking-eyebrow text-acid font-semibold">Ton évolution</p>
      <div class="font-sans text-[13px] text-paper leading-relaxed">${formatFeedback(bodyAnalysisCache)}</div>
    `;
    body.appendChild(analysisCard);
  }

  // ── Historique ────────────────────────────────────────
  const histSection = document.createElement('section');
  histSection.className = 'mt-12';
  histSection.innerHTML = `
    <header class="px-5 pb-6 accent-line mb-4">
      <h2 class="font-display font-black text-paper" style="font-size:clamp(2rem, 9vw, 2.75rem); line-height:0.92; letter-spacing:-0.025em">
        Tes<br/>
        <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> mesures.</span>
      </h2>
      <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-5">${measurements.length} entrée${measurements.length > 1 ? 's' : ''}</p>
    </header>
  `;
  body.appendChild(histSection);

  measurements.forEach(m => {
    const card = document.createElement('div');
    card.className = 'px-5 py-4 border-b border-border/70';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-3 mb-2';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'font-sans text-[10px] uppercase tracking-eyebrow text-muted';
    dateSpan.textContent = formatDate(m.date);
    const delBtn = document.createElement('button');
    delBtn.className = 'font-sans text-[10px] uppercase tracking-eyebrow text-muted active:text-blood transition';
    delBtn.textContent = '✕ Suppr';
    delBtn.addEventListener('click', () => {
      showConfirm('Supprimer cette mesure ?', async () => {
        await deleteBodyMeasurementDB(m.id);
        renderCorps();
      });
    });
    header.append(dateSpan, delBtn);
    card.appendChild(header);

    let grPct = m.img;
    if (!grPct && m.poids && m.graisse_kg)
      grPct = +((m.graisse_kg / m.poids) * 100).toFixed(1);
    const cat = fatCategory(grPct);
    if (cat) {
      const badge = document.createElement('span');
      badge.className = 'inline-block font-sans text-[9px] uppercase tracking-eyebrow font-semibold mb-2';
      badge.style.color = cat.color;
      badge.style.display = 'block';
      badge.textContent = `Graisse ${grPct}% — ${cat.label}`;
      card.appendChild(badge);
    }

    const values = document.createElement('div');
    values.className = 'flex flex-wrap gap-x-3 gap-y-1';
    [
      { label: 'Poids',    value: m.poids,          unit: 'kg' },
      { label: 'Gr.',      value: m.graisse_kg,     unit: 'kg' },
      { label: 'Eau',      value: m.eau,            unit: '%'  },
      { label: 'Muscle',   value: m.muscle,         unit: '%'  },
      { label: 'IMG',      value: m.img,            unit: '%'  },
      { label: 'Os',       value: m.os,             unit: '%'  },
      { label: 'Ventre',   value: m.tour_de_ventre, unit: 'cm' },
    ].filter(e => e.value !== null && e.value !== undefined).forEach(({ label, value, unit }) => {
      const chip = document.createElement('span');
      chip.className = 'font-sans text-[10px] uppercase tracking-eyebrow';
      chip.innerHTML = `<span class="text-muted">${label}</span> <span class="text-paper font-semibold num-stat">${value}</span><span class="text-muted">${unit}</span>`;
      values.appendChild(chip);
    });

    card.appendChild(values);
    histSection.appendChild(card);
  });
}

function openBodyAnalysisPopupLoading() {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = `
    <div id="body-analysis-popup" class="px-5 py-9">
      <p class="font-sans text-[10px] uppercase tracking-eyebrow text-acid font-semibold mb-3">Ton évolution</p>
      <h2 class="font-display font-black h-display text-paper mb-6">
        Analyse<br/>
        <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> en cours.</span>
      </h2>
      <div class="flex items-center gap-3 mt-8">
        <span aria-hidden class="w-1.5 h-1.5 bg-acid animate-pulse"></span>
        <p class="font-sans text-[11px] uppercase tracking-eyebrow text-muted">Patiente…</p>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

function fillBodyAnalysisPopup(text) {
  const popup = document.getElementById('body-analysis-popup');
  if (!popup) return;
  popup.innerHTML = `
    <p class="font-sans text-[10px] uppercase tracking-eyebrow text-acid font-semibold mb-3">Ton évolution</p>
    <h2 class="font-display font-black h-display text-paper accent-line pb-7">
      Le<br/>
      <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> bilan.</span>
    </h2>
    <div class="font-sans text-[14px] text-paper leading-relaxed mt-8 space-y-3">${formatFeedback(text)}</div>
  `;
}

function closeBodyAnalysisPopup() {
  const popup = document.getElementById('body-analysis-popup');
  if (popup) document.getElementById('modal').classList.add('hidden');
}

function drawCorpsChart(canvas, data, field, unit) {
  // Tokens Direction A
  const C_BORDER = '#2A2A2A';
  const C_MUTED  = '#888888';
  const C_CYAN   = '#06B6D4';

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = { top: 10, right: 10, bottom: 24, left: 42 };
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
  ctx.strokeStyle = C_BORDER;
  ctx.lineWidth = 1;
  [0, 0.5, 1].forEach(t => {
    const y = pad.top + iH * (1 - t);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = C_MUTED;
    ctx.font = '10px "DM Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText((minV + t * (maxV - minV)).toFixed(1), pad.left - 6, y + 4);
  });

  // Ligne — cyan
  ctx.beginPath();
  ctx.strokeStyle = C_CYAN;
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
    ctx.fillStyle = C_CYAN;
    ctx.fill();

    if (i === 0 || i === data.length - 1) {
      ctx.fillStyle = C_MUTED;
      ctx.font = '9px "DM Sans", sans-serif';
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
    list.innerHTML = `
      <div class="px-5 pt-12 text-center font-display italic text-[16px] text-muted">
        Aucune séance enregistrée.
      </div>
    `;
    return;
  }

  // Group by year-month
  const groups = new Map();
  sessions.forEach(s => {
    const key = (s.date || '').slice(0, 7); // YYYY-MM
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });

  const monthLabel = (key) => {
    const [y, m] = key.split('-');
    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };

  list.innerHTML = '';

  // Header avec totaux globaux
  const totalSessions = sessions.length;
  const totalVol      = sessions.reduce((s, x) => s + totalVolume(x.exercises), 0);
  const totalTon      = (totalVol / 1000).toFixed(1).replace('.', ',');
  const totalExos     = sessions.reduce((s, x) => s + x.exercises.length, 0);

  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-9 pb-9 accent-line';
  masthead.innerHTML = `
    <h1 class="font-display font-black h-display text-paper">
      Tes<br/>
      <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> séances.</span>
    </h1>
    <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-5">
      ${String(totalSessions).padStart(2, '0')} séances · ${totalExos} exercices · ${totalTon} t cumulées
    </p>
  `;
  list.appendChild(masthead);

  // Groupes mois
  [...groups.entries()].forEach(([monthKey, monthSessions]) => {
    const section = document.createElement('section');
    section.className = 'mb-8';

    const monthHeader = document.createElement('header');
    monthHeader.className = 'flex items-baseline justify-between mb-3 px-5';
    const monthVol = monthSessions.reduce((s, x) => s + totalVolume(x.exercises), 0);
    monthHeader.innerHTML = `
      <h3 class="font-display italic font-bold text-[14px] uppercase tracking-eyebrow text-paper">${monthLabel(monthKey)}</h3>
      <span class="font-sans text-[10px] uppercase tracking-eyebrow text-cyan num-stat">${(monthVol / 1000).toFixed(1).replace('.', ',')} t</span>
    `;
    section.appendChild(monthHeader);

    const ul = document.createElement('ul');
    ul.className = 'border-y border-border';

    monthSessions.forEach((session, idx) => {
      const isAbandoned = !session.duration;
      const done    = Math.round(totalVolume(session.exercises));
      const planned = Math.round(plannedVolume(session.exercises));
      const reps    = session.exercises.reduce((acc, ex) => {
        const e = migrateExercise(ex);
        return acc + (e.series?.reduce((sa, s) => {
          return sa + (e.activities || []).reduce((aa, act, j) => {
            const v = s.values?.[j];
            return aa + (act.type === 'weight' && s.activityStates?.[j] === 'done' ? (v?.reps || 0) : 0);
          }, 0);
        }, 0) || 0);
      }, 0);

      const borderLeft = isAbandoned ? 'border-l-[3px] border-l-racing bg-racing/[0.04]' : 'border-l-[3px] border-l-acid';
      const isLast = idx === monthSessions.length - 1;

      const name = session.programmeName || session.name || 'Séance';
      const li = document.createElement('li');
      li.innerHTML = `
        <button class="w-full text-left flex items-start gap-4 px-5 py-4 ${isLast ? '' : 'border-b border-border/70'} ${borderLeft} active:bg-inkAlt transition">
          <div class="flex-1 min-w-0">
            <h4 class="font-display font-bold italic text-[18px] leading-tight text-paper truncate">${name}</h4>
            <p class="font-sans text-[9px] uppercase tracking-eyebrow text-muted mt-1.5 flex items-center gap-2 flex-wrap">
              <span>${formatDate(session.date)}</span>
              ${session.duration ? `<span class="text-muted/50">·</span><span>${formatDuration(session.duration)}</span>` : `<span class="text-muted/50">·</span><span class="text-racing">En cours</span>`}
              <span class="text-muted/50">·</span>
              <span>${session.exercises.length} exo${session.exercises.length > 1 ? 's' : ''}</span>
            </p>
          </div>
          <div class="text-right shrink-0 leading-none">
            <p class="font-display font-bold text-[18px] num-stat text-cyan leading-none">${done.toLocaleString('fr-FR')}<span class="font-sans font-medium text-[9px] tracking-eyebrow text-muted ml-1 align-baseline">kg</span></p>
            ${reps > 0 ? `<p class="font-sans font-medium text-[10px] uppercase tracking-eyebrow text-muted num-stat mt-1.5">${reps} reps</p>` : ''}
          </div>
        </button>
      `;
      li.querySelector('button').addEventListener('click', () => openModal(session));
      ul.appendChild(li);
    });

    section.appendChild(ul);
    list.appendChild(section);
  });
}

async function resumeSessionFromHistory(session) {
  liveFocus = null;
  liveRest = null;
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
  await attachPrevValues(liveSession.exercises, liveSession.programmeId, liveSession.category, liveSession.id);
  closeModal();
  startSyncPolling();
  showScreen('seance');
}

/* ═══════════════════════════════════════════════════════
   MODAL — détail séance
═══════════════════════════════════════════════════════ */
async function openModal(session) {
  const body = document.getElementById('modal-body');
  const done = Math.round(totalVolume(session.exercises));
  const planned = Math.round(plannedVolume(session.exercises));
  const name = session.programmeName || session.name || 'Séance';
  const isAbandoned = !session.duration;
  const tonnage = (done / 1000).toFixed(1).replace('.', ',');
  const { line1, sep, rest } = splitProgrammeTitle(name);

  // Reps cumulés
  const totalRepsDone = session.exercises.reduce((acc, ex) => {
    const e = migrateExercise(ex);
    return acc + (e.series || []).reduce((sa, s) => {
      return sa + (e.activities || []).reduce((aa, act, j) => {
        const v = s.values?.[j];
        return aa + (act.type === 'weight' && s.activityStates?.[j] === 'done' ? (v?.reps || 0) : 0);
      }, 0);
    }, 0);
  }, 0);

  // Masthead H1 split + status row
  let html = `
    <!-- Status row -->
    <div class="px-5 pt-5 pb-3 flex items-center justify-between font-sans text-[10px] uppercase tracking-eyebrow text-muted">
      <div class="flex items-center gap-2">
        <span>${formatDate(session.date)}</span>
        ${session.startedAt ? `<span class="text-muted/50">·</span><span>${formatTime(session.startedAt)}</span>` : ''}
        ${session.duration ? `<span class="text-muted/50">·</span><span>${formatDuration(session.duration)}</span>` : `<span class="text-muted/50">·</span><span class="text-racing">En cours</span>`}
      </div>
    </div>

    <!-- Masthead H1 -->
    <section class="px-5 pt-2 pb-7 accent-line">
      <h1 class="font-display font-black h-display text-paper">
        ${line1}${sep ? `<br/><span class="text-paper/40"><span class="text-acid not-italic font-black">${sep}</span> ${rest}.</span>` : ''}
      </h1>
    </section>

    <!-- Stats strip cyan -->
    <div class="grid grid-cols-3 border-y border-border">
      <div class="px-3 py-3 border-r border-border min-w-0">
        <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Volume</p>
        <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${done.toLocaleString('fr-FR')}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">kg</span></p>
      </div>
      <div class="px-3 py-3 border-r border-border min-w-0">
        <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Tonnage</p>
        <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${tonnage}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">t</span></p>
      </div>
      <div class="px-3 py-3 min-w-0">
        <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Reps</p>
        <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${totalRepsDone.toLocaleString('fr-FR')}</p>
      </div>
    </div>
  `;

  // Exercices
  session.exercises.forEach(ex => {
    const e = migrateExercise(ex);
    const muscle = e.activities?.[0]?.name || '';
    html += `
      <article class="mt-6">
        <header class="px-5 mb-3">
          <h2 class="font-display font-bold text-[20px] leading-[1.1] text-paper">${e.name}</h2>
          ${muscle ? `<p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-1.5">${muscle}</p>` : ''}
        </header>
        <div class="border-y border-border">
          ${e.series.map((s, i) => {
            const allDone = (e.activities || []).every((_, a) => s.activityStates?.[a] === 'done' || s.done !== false);
            const borderLeft = allDone ? 'border-l-[3px] border-l-acid' : 'border-l-[3px] border-l-transparent opacity-50';
            const restColor = allDone ? 'text-acid' : 'text-muted';
            return e.activities.map((act, j) => {
              const v = s.values?.[j] || {};
              const isWeight = act.type === 'weight';
              const charge = isWeight
                ? `${v.weight ?? '—'}<span class="font-sans font-medium text-[10px] tracking-eyebrow text-muted ml-1.5">kg</span>`
                : `${v.duration ?? '—'}<span class="font-sans font-medium text-[10px] tracking-eyebrow text-muted ml-1.5">s</span>`;
              const second = isWeight ? `× ${v.reps ?? '—'}` : (act.label || act.name || '—');
              const restSecs = act.rest || 0;
              const restLabel = restSecs > 0 ? `${Math.floor(restSecs / 60)}:${String(restSecs % 60).padStart(2, '0')}` : '—';
              return `
                <div class="grid grid-cols-[1fr_60px_70px] gap-4 items-baseline px-5 py-3 ${borderLeft} border-b border-border/70 last:border-b-0">
                  <span class="font-display font-bold text-[20px] num-stat text-paper">${charge}</span>
                  <span class="font-display font-bold text-[14px] num-stat text-paper text-right">${second}</span>
                  <span class="font-sans text-[9px] uppercase tracking-eyebrow ${restColor} num-stat text-right font-semibold">${restLabel}</span>
                </div>
              `;
            }).join('');
          }).join('')}
        </div>
      </article>
    `;
  });

  // Feedback IA
  if (session.feedbackIa) {
    html += `
      <div class="mx-5 mt-8 border border-border bg-inkAlt p-4 space-y-2">
        <p class="font-sans text-[10px] uppercase tracking-eyebrow text-acid font-semibold">Feedback IA</p>
        <div class="font-sans text-[13px] text-paper leading-relaxed">${formatFeedback(session.feedbackIa)}</div>
      </div>
    `;
  } else if (!isAbandoned) {
    html += `
      <div class="px-5 mt-8" id="feedback-ia-generate-wrap">
        <button id="feedback-ia-generate" class="w-full py-3 border border-border text-paper font-sans text-[11px] uppercase tracking-eyebrow active:border-acid active:text-acid transition">Générer l'analyse IA</button>
      </div>
    `;
  }

  // Footer actions
  html += `
    <div class="px-5 mt-8 mb-6 grid ${isAbandoned ? 'grid-cols-2 gap-3' : 'grid-cols-1'}">
      ${isAbandoned ? `<button id="resume-session" class="py-4 bg-racing text-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-racing/80 transition">▶ Reprendre</button>` : ''}
      <button id="delete-session" class="py-4 border border-blood text-blood font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-blood active:text-paper transition">Supprimer</button>
    </div>
  `;

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

  const generateBtn = document.getElementById('feedback-ia-generate');
  if (generateBtn) {
    const apiKey = await getClaudeApiKeyDB();
    if (!apiKey) {
      generateBtn.disabled = true;
      generateBtn.textContent = 'Configurez votre clé API Claude dans Profil';
      generateBtn.classList.add('btn-disabled');
    } else {
      generateBtn.addEventListener('click', async () => {
        const wrap = document.getElementById('feedback-ia-generate-wrap');
        wrap.innerHTML = `
          <div class="feedback-ia-card">
            <div class="feedback-ia-title">🤖 Feedback IA</div>
            <div class="feedback-ia-loading">
              <div class="feedback-ia-spinner"></div>
              <p>Analyse en cours…</p>
            </div>
          </div>
        `;
        try {
          const feedback = await generateAndPersistFeedback(session);
          session.feedbackIa = feedback;
          wrap.outerHTML = `
            <div class="feedback-ia-card">
              <div class="feedback-ia-title">🤖 Feedback IA</div>
              <div class="feedback-ia-content">${formatFeedback(feedback)}</div>
            </div>
          `;
        } catch (e) {
          wrap.innerHTML = `
            <div class="feedback-ia-card" style="border-color:#ff5c5c">
              <div class="feedback-ia-title" style="color:#ff5c5c">Erreur</div>
              <div class="feedback-ia-content">${e.message}</div>
            </div>
          `;
        }
      });
    }
  }

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
   FEEDBACK IA (Claude API)
═══════════════════════════════════════════════════════ */
const PHASE2_CONTEXT = `Contexte programme : phase 2 d'hypertrophie sarcoplasmique, démarrée lundi 27 avril 2026.
- Semaine 1 (27 avril – 3 mai 2026) : poids constants, repos 2 min entre séries.
- Semaine 2 (4 – 10 mai 2026) : poids constants, repos 1 min 45.
- Semaine 3 (11 – 17 mai 2026) : augmentation des poids, repos 1 min 30.
- Semaine 4 (18 – 24 mai 2026) : poids constants, repos 1 min 30.

Identifie la semaine en cours via la date de la séance. La stagnation des poids est attendue sauf en semaine 3 (où la progression est l'objectif). L'enjeu hypertrophie sarcoplasmique = volume + densité (réduction du repos), pas charge max.`;

const COACH_PROMPT = `Coach sportif. Analyse séance musculation vs historique même programme.

${PHASE2_CONTEXT}

Feedback 3 parties, français, max 250 mots, droit au but :

1. Progression : tendance par exercice (progression/stagnation/régression). Comparer via 1RM Epley (poids × (1 + reps/30)) si reps changent. Juge la cohérence avec la semaine en cours (stagnation OK semaines 1/2/4, progression attendue semaine 3). Regarde aussi le repos (champ repos_s, en secondes) : sa réduction d'une semaine à l'autre est une vraie progression sur la densité.

2. Forces/faiblesses : 2-3 points forts. 1-2 axes à améliorer uniquement s'il y en a vraiment (ne rien inventer ; la stagnation des poids hors semaine 3 n'est PAS une faiblesse). Pas de compliments creux.

3. Conseil prochaine séance : 1-2 actions concrètes basées sur tendances et semaine de phase.`;

const COACH_PROMPT_CARDIO = `Coach sportif. Analyse séance cardio vs historique même programme. Feedback 3 parties, français, max 250 mots, droit au but :

1. Progression : tendance par exercice sur la durée (minutes), la distance (km) et la puissance moyenne (watts). Progression/stagnation/régression.

2. Forces/faiblesses : 2-3 points forts, 1-2 à améliorer. Pas de compliments creux.

3. Conseil prochaine séance : 1-2 actions concrètes (durée, intensité, allure) basées sur les tendances.`;

const SUGGESTION_PROMPT = `Coach sportif. L'utilisateur ouvre un exercice à la salle. Donne UNE phrase courte (max 25 mots, français, droit au but) : indique un poids cible à viser sur la dernière série aujourd'hui, basé sur la tendance récente.

${PHASE2_CONTEXT}

Aligne ta suggestion sur la semaine en cours : poids identique à la séance précédente sauf en semaine 3 (augmentation).`;

const suggestionCache = new Map();

async function generateWeightSuggestion(exerciseName) {
  if (suggestionCache.has(exerciseName)) {
    return suggestionCache.get(exerciseName);
  }

  const promise = (async () => {
    const apiKey = await getClaudeApiKeyDB();
    if (!apiKey) return null;

    const sessions = (await loadSessions())
      .filter(s => s.duration > 0)
      .sort((a, b) => (a.startedAt || a.date).localeCompare(b.startedAt || b.date));

    const matching = sessions
      .map(s => {
        const ex = (s.exercises || []).find(e => migrateExercise(e).name === exerciseName);
        if (!ex) return null;
        const e = migrateExercise(ex);
        const series = e.series.filter(sr => sr.done !== false).map(sr =>
          e.activities.map((act, i) => {
            const v = sr.values?.[i] || {};
            return act.type === 'weight'
              ? { reps: v.reps || 0, kg: v.weight || 0 }
              : null;
          }).filter(Boolean)
        ).filter(arr => arr.length > 0);
        if (!series.length) return null;
        return { date: s.date, series: series.flat() };
      })
      .filter(Boolean);

    if (matching.length < 2) return null;

    const first = matching[0];
    const recent = matching.slice(-5).filter(m => m !== first);

    const payload = { exercise: exerciseName, first, recent };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 80,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        system: SUGGESTION_PROMPT,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.content?.[0]?.text || null;
  })();

  suggestionCache.set(exerciseName, promise);
  promise.catch(() => suggestionCache.delete(exerciseName));
  return promise;
}

const BODY_ANALYSIS_PROMPT = `Coach bienveillant et non jugeant. L'utilisateur partage son évolution de composition corporelle (poids, graisse, eau, muscle, IMG, os, tour de ventre). Écris 2-3 phrases courtes en français :
- Célèbre les tendances positives sur la durée (depuis la première mesure).
- Mets les petites variations récentes en perspective (un poids fluctue au quotidien).
- Encourage, jamais de jugement ni de pression, aucun conseil diététique ou médical, pas d'objectif chiffré.
- Ton chaleureux, deuxième personne du singulier (tu).`;

let bodyAnalysisCache = null;

function cleanMeasurement(m) {
  const out = { date: m.date };
  if (m.poids != null)          out.poids = m.poids;
  if (m.graisse_kg != null)     out.graisseKg = m.graisse_kg;
  if (m.eau != null)            out.eau = m.eau;
  if (m.muscle != null)         out.muscle = m.muscle;
  if (m.img != null)            out.img = m.img;
  if (m.os != null)             out.os = m.os;
  if (m.tour_de_ventre != null) out.tourDeVentre = m.tour_de_ventre;
  return out;
}

async function generateBodyAnalysis(measurements) {
  if (bodyAnalysisCache !== null) return bodyAnalysisCache;
  if (!measurements || measurements.length < 2) return null;

  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) return null;

  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const first = cleanMeasurement(sorted[0]);
  const recent = sorted.slice(-5).filter(m => m !== sorted[0]).map(cleanMeasurement);

  const payload = { first, recent };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 180,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        system: BODY_ANALYSIS_PROMPT,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.[0]?.text || null;
    bodyAnalysisCache = text;
    return text;
  } catch {
    return null;
  }
}

/**
 * Appelle l'API Claude avec la séance + son historique, persiste le feedback
 * en DB, et renvoie le texte brut au caller. Lève si l'API échoue.
 */
async function generateAndPersistFeedback(session) {
  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) throw new Error('Clé API Claude non configurée');

  const allSessions = await loadSessions();
  const history = allSessions
    .filter(s => s.programmeName === session.programmeName && s.id !== session.id && s.duration)
    .slice(0, 5);

  const sessionData = formatSessionForAI(session);
  const historyData = history.map(formatSessionForAI);

  const userMessage = `Séance actuelle :\n${JSON.stringify(sessionData, null, 1)}\n\nHistorique (${history.length} dernières séances) :\n${JSON.stringify(historyData, null, 1)}`;

  const systemPrompt = session.category === 'cardio' ? COACH_PROMPT_CARDIO : COACH_PROMPT;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erreur ${response.status}`);
  }

  const data = await response.json();
  const feedback = data.content?.[0]?.text || 'Pas de réponse.';

  await updateSessionFeedbackDB(session.id, feedback);

  return feedback;
}

async function showPostSessionFeedback(session) {
  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) return;

  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  const name = session.programmeName || session.name || 'Séance';
  const vol = totalVolume(session.exercises);
  const durStr = session.duration ? formatDuration(session.duration) : '';

  body.innerHTML = `
    <div class="feedback-ia-modal">
      <div class="modal-title">${name}</div>
      <div class="modal-date">${formatDate(session.date)}${durStr ? ' · ' + durStr : ''} · ${vol.toLocaleString('fr-FR')} kg</div>
      <div class="feedback-ia-loading">
        <div class="feedback-ia-spinner"></div>
        <p>Analyse en cours...</p>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');

  try {
    const feedback = await generateAndPersistFeedback(session);
    body.innerHTML = `
      <div class="feedback-ia-modal">
        <div class="modal-title">${name}</div>
        <div class="modal-date">${formatDate(session.date)}${durStr ? ' · ' + durStr : ''} · ${vol.toLocaleString('fr-FR')} kg</div>
        <div class="feedback-ia-card">
          <div class="feedback-ia-title">🤖 Feedback IA</div>
          <div class="feedback-ia-content">${formatFeedback(feedback)}</div>
        </div>
      </div>
    `;
  } catch (e) {
    body.innerHTML = `
      <div class="feedback-ia-modal">
        <div class="modal-title">${name}</div>
        <div class="feedback-ia-card" style="border-color:#ff5c5c">
          <div class="feedback-ia-title" style="color:#ff5c5c">Erreur</div>
          <div class="feedback-ia-content">${e.message}</div>
        </div>
      </div>
    `;
  }
}

function formatSessionForAI(session) {
  const isCardio = session.category === 'cardio';

  if (isCardio) {
    return {
      programme: session.programmeName,
      date: session.date,
      type: 'cardio',
      exercices: (session.exercises || []).map(ex => ({
        nom: ex.name,
        duree_min: ex.done?.duration || 0,
        puissance_w: ex.done?.power || 0,
        distance_km: ex.done?.km || 0,
      })),
    };
  }

  return {
    programme: session.programmeName,
    date: session.date,
    type: 'fonte',
    duree: session.duration ? formatDuration(session.duration) : null,
    exercices: (session.exercises || []).map(ex => {
      const e = migrateExercise(ex);
      const weightAct = e.activities.find(a => a.type === 'weight');
      return {
        nom: e.name,
        repos_s: weightAct?.rest || 0,
        series: e.series.filter(s => s.done !== false).map(s =>
          e.activities.map((act, i) => {
            const v = s.values?.[i] || {};
            return act.type === 'weight'
              ? { reps: v.reps || 0, kg: v.weight || 0 }
              : { duree_s: v.duration || 0 };
          })
        ),
      };
    }),
  };
}

function formatFeedback(text) {
  return text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

const ACTIVITY_FACTOR = { sedentaire: 1.2, leger: 1.4, modere: 1.55, actif: 1.7 };

/**
 * Dépense énergétique journalière estimée en kcal/24h
 * = BMR (Mifflin-St Jeor) × facteur d'activité quotidienne (NEAT, hors sport).
 * Renvoie null si données manquantes.
 */
async function computeBmrKcal() {
  const p = currentProfile;
  if (!p?.taille_cm || !p?.date_naissance || !p?.sexe || !p?.niveau_activite) return null;
  const measurements = await loadBodyMeasurementsDB();
  const lastWithWeight = measurements.find(m => m.poids != null);
  if (!lastWithWeight) return null;
  const poids = parseFloat(lastWithWeight.poids);
  const taille = parseFloat(p.taille_cm);
  const ageYears = (new Date() - new Date(p.date_naissance)) / (365.25 * 24 * 3600 * 1000);
  const base = 10 * poids + 6.25 * taille - 5 * ageYears;
  const bmr = base + (p.sexe === 'h' ? 5 : -161);
  const factor = ACTIVITY_FACTOR[p.niveau_activite] || 1.2;
  return Math.round(bmr * factor);
}

/* ═══════════════════════════════════════════════════════
   ALIMENTATION
═══════════════════════════════════════════════════════ */

/**
 * Construit la ligne UI [bouton principal | ⚙️] pour un slot preset.
 * Tap principal :
 *   - preset vide → ouvre modal mode 'define'
 *   - preset rempli → addMealFromPreset + toast
 * Tap ⚙️ : ouvre modal mode 'edit' (caché si preset vide).
 */
async function renderMealPresetButtons(container, dateIso, onChanged) {
  const presets = await loadMealPresets();
  const bySlot = Object.fromEntries(presets.map(p => [p.slot, p]));

  const slots = [
    { slot: 'pre_gym',  emoji: '☕', label: 'Petit-dej avant salle' },
    { slot: 'post_gym', emoji: '🥛', label: 'Petit-dej après salle' },
  ];

  for (const { slot, emoji, label } of slots) {
    const preset = bySlot[slot] || null;
    const row = document.createElement('div');
    row.className = 'flex items-stretch gap-2 mb-2';

    const mainBtn = document.createElement('button');
    mainBtn.className = 'flex-1 py-3 px-4 border border-border text-paper font-sans text-[11px] uppercase tracking-eyebrow text-left active:border-acid active:text-acid transition';
    mainBtn.innerHTML = `<span class="text-[14px] mr-2">${emoji}</span>${label}`;

    const editBtn = document.createElement('button');
    editBtn.className = 'shrink-0 py-3 px-3 border border-border text-muted active:text-paper active:border-paper transition';
    editBtn.textContent = '⚙';
    if (!preset) editBtn.classList.add('hidden');

    mainBtn.addEventListener('click', async () => {
      if (mainBtn.disabled) return;
      mainBtn.disabled = true;
      try {
        const fresh = await loadMealPreset(slot);
        if (!fresh || !fresh.description) {
          mainBtn.disabled = false;
          openMealPresetEditModal(slot, 'define', dateIso, onChanged);
          return;
        }
        const entry = await addMealFromPreset(dateIso, slot);
        if (entry) {
          const t = (entry.time || '').slice(0, 5);
          showToast(`Petit-dej ajouté à ${t}`);
          if (onChanged) await onChanged();
        } else {
          showToast('Erreur ajout');
        }
      } finally {
        mainBtn.disabled = false;
      }
    });

    editBtn.addEventListener('click', () => {
      openMealPresetEditModal(slot, 'edit', dateIso, onChanged);
    });

    row.appendChild(mainBtn);
    row.appendChild(editBtn);
    container.appendChild(row);
  }
}

async function renderAlimentation() {
  const body = document.getElementById('screen-alim-body');
  body.innerHTML = `
    <div class="px-5 pt-12 text-center font-display italic text-[16px] text-muted">Chargement…</div>
  `;

  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) {
    body.innerHTML = `
      <section class="px-5 pt-9 pb-9 accent-line">
        <h1 class="font-display font-black h-display text-paper">
          Clé<br/>
          <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> manquante.</span>
        </h1>
        <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-5">
          Configure ta clé API Claude pour activer le suivi
        </p>
      </section>
      <div class="px-5 mt-4">
        <button id="alim-go-key" class="w-full py-4 bg-acid text-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-acid/80 transition">→ Configurer la clé</button>
      </div>
    `;
    document.getElementById('alim-go-key').addEventListener('click', () => showScreen('claude-api'));
    return;
  }

  body.innerHTML = '';

  // Masthead H1 split
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-9 pb-9 accent-line';
  masthead.innerHTML = `
    <h1 class="font-display font-black h-display text-paper">
      Tes<br/>
      <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> apports.</span>
    </h1>
  `;
  body.appendChild(masthead);

  // Date selector (Tailwind-styled)
  const dateRow = document.createElement('div');
  dateRow.className = 'px-5 mt-6 mb-3 flex items-center gap-3';
  dateRow.innerHTML = `
    <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted">Jour</p>
    <span class="flex-1 h-px bg-border"></span>
  `;
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = todayIso();
  dateInput.className = 'font-sans text-[12px] text-paper border border-border bg-transparent px-3 py-1.5 focus:border-acid focus:outline-none';
  dateRow.appendChild(dateInput);
  body.appendChild(dateRow);

  // Bilan strip cyan
  const bilanCard = document.createElement('div');
  bilanCard.id = 'alim-bilan';
  body.appendChild(bilanCard);

  // Preset buttons (petit-dej avant/après salle)
  const presetContainer = document.createElement('div');
  presetContainer.className = 'px-5 mt-6';
  body.appendChild(presetContainer);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'px-5 mt-4 space-y-3';
  body.appendChild(actions);

  const addBtn = document.createElement('button');
  addBtn.className = 'w-full py-4 bg-acid text-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-acid/80 transition';
  addBtn.textContent = '+ Ajouter un repas';
  actions.appendChild(addBtn);

  const adviceBtn = document.createElement('button');
  adviceBtn.className = 'w-full py-3 border border-border text-paper font-sans text-[11px] uppercase tracking-eyebrow active:border-acid active:text-acid transition';
  adviceBtn.textContent = 'Conseil pour ce soir';
  actions.appendChild(adviceBtn);

  const askBtn = document.createElement('button');
  askBtn.className = 'w-full py-3 border border-border text-paper font-sans text-[11px] uppercase tracking-eyebrow active:border-acid active:text-acid transition';
  askBtn.textContent = 'Poser une question';
  actions.appendChild(askBtn);

  // Timeline section
  const timelineSec = document.createElement('section');
  timelineSec.className = 'mt-10';
  const timelineHdr = document.createElement('header');
  timelineHdr.className = 'flex items-baseline justify-between mb-3 px-5';
  timelineHdr.innerHTML = `
    <h3 class="font-display italic font-bold text-[14px] uppercase tracking-eyebrow text-paper">Timeline</h3>
  `;
  timelineSec.appendChild(timelineHdr);
  const timeline = document.createElement('div');
  timeline.id = 'alim-timeline';
  timelineSec.appendChild(timeline);
  body.appendChild(timelineSec);

  async function refresh() {
    const entries = await loadFoodEntriesForDate(dateInput.value);

    // Bilan
    let apports = 0, depFonte = 0, depCardio = 0;
    let totP = 0, totG = 0, totL = 0;
    entries.forEach(e => {
      const k = parseFloat(e.kcal) || 0;
      if (e.type === 'meal') {
        apports += k;
        totP += parseFloat(e.proteines_g) || 0;
        totG += parseFloat(e.glucides_g) || 0;
        totL += parseFloat(e.lipides_g) || 0;
      } else if (e.type === 'session_burn') {
        if (e.session_category === 'cardio') depCardio += k;
        else depFonte += k; // défaut fonte si non renseigné
      }
    });
    const depenses = depFonte + depCardio;

    // Métabolisme : pro-rata selon l'heure si date = aujourd'hui, sinon journée pleine
    const bmr = await computeBmrKcal();
    let bmrToday = 0;
    let bmrLabel = 'Métabolisme';
    let bmrNote = '';
    if (bmr) {
      const isToday = dateInput.value === todayIso();
      if (isToday) {
        const now = new Date();
        const fraction = (now.getHours() + now.getMinutes() / 60) / 24;
        bmrToday = Math.round(bmr * fraction);
        bmrLabel = `Métabolisme · ${now.toTimeString().slice(0, 5)}`;
      } else {
        bmrToday = bmr;
        bmrLabel = 'Métabolisme · 24h';
      }
    } else {
      bmrNote = `<p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted px-5 mt-3 italic">Configure taille / âge / sexe / activité dans Profil</p>`;
    }

    const net = apports - depenses - bmrToday;
    const netColor = net > 200 ? 'text-blood' : net < -200 ? 'text-acid' : 'text-cyan';

    // Stats 4 cols cyan (Apports / Métabolisme / Dépenses / Net)
    bilanCard.innerHTML = `
      <div class="grid grid-cols-4 border-y border-border">
        <div class="px-2.5 py-3 border-r border-border min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Apports</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${Math.round(apports)}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">kcal</span></p>
        </div>
        <div class="px-2.5 py-3 border-r border-border min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5 truncate">${bmrLabel}</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${Math.round(bmrToday)}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">kcal</span></p>
        </div>
        <div class="px-2.5 py-3 border-r border-border min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Dépenses</p>
          <p class="font-display font-bold text-[17px] num-stat text-cyan leading-none truncate">${Math.round(depenses)}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">kcal</span></p>
        </div>
        <div class="px-2.5 py-3 min-w-0">
          <p class="font-sans text-[8px] uppercase tracking-[0.40em] text-muted mb-1.5">Net</p>
          <p class="font-display font-bold text-[17px] num-stat ${netColor} leading-none truncate">${net >= 0 ? '+' : ''}${Math.round(net)}<span class="font-sans text-[9px] uppercase tracking-eyebrow text-muted ml-1">kcal</span></p>
        </div>
      </div>
      ${bmrNote}
      <div class="grid grid-cols-3 px-5 mt-3 gap-x-3 gap-y-1 font-sans text-[10px] uppercase tracking-eyebrow">
        <div class="flex items-baseline gap-1.5"><span class="text-muted">Prot</span><span class="text-paper font-semibold num-stat">${Math.round(totP)}<span class="text-muted ml-0.5">g</span></span></div>
        <div class="flex items-baseline gap-1.5"><span class="text-muted">Gluc</span><span class="text-paper font-semibold num-stat">${Math.round(totG)}<span class="text-muted ml-0.5">g</span></span></div>
        <div class="flex items-baseline gap-1.5"><span class="text-muted">Lip</span><span class="text-paper font-semibold num-stat">${Math.round(totL)}<span class="text-muted ml-0.5">g</span></span></div>
      </div>
      ${(depFonte > 0 || depCardio > 0) ? `
        <div class="flex items-center gap-3 px-5 mt-3 font-sans text-[10px] uppercase tracking-eyebrow text-muted">
          ${depFonte > 0  ? `<span>↳ Fonte ${Math.round(depFonte)} kcal</span>` : ''}
          ${depCardio > 0 ? `<span>↳ Cardio ${Math.round(depCardio)} kcal</span>` : ''}
        </div>` : ''}
    `;

    // Timeline
    timeline.innerHTML = '';
    if (!entries.length) {
      timeline.innerHTML = `
        <p class="font-display italic text-[14px] text-muted px-5 py-4">Aucune entrée pour ce jour.</p>
      `;
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'border-y border-border';

    entries.forEach((e, idx) => {
      const isMeal  = e.type === 'meal';
      const borderLeft = isMeal
        ? 'border-l-[3px] border-l-acid'
        : 'border-l-[3px] border-l-racing bg-racing/[0.04]';
      const kcalColor = isMeal ? 'text-acid' : 'text-racing';
      const arrow = isMeal ? '↑' : '↓';
      const isLast = idx === entries.length - 1;
      const time = (e.time || '').slice(0, 5);
      const macros = isMeal && e.proteines_g != null
        ? `<p class="font-sans text-[9px] uppercase tracking-eyebrow text-muted num-stat mt-1.5">P ${e.proteines_g}g · G ${e.glucides_g}g · L ${e.lipides_g}g</p>`
        : '';

      const li = document.createElement('li');
      li.className = `flex items-start gap-3 px-5 py-4 ${isLast ? '' : 'border-b border-border/70'} ${borderLeft}`;
      const photoClickable = e.photo_path ? 'cursor-pointer' : '';
      li.innerHTML = `
        <div class="shrink-0 w-12 pt-1 ${photoClickable}">
          <p class="font-display font-bold text-[14px] num-stat text-paper leading-none">${time}</p>
        </div>
        <div class="flex-1 min-w-0 ${photoClickable}" data-photo="${e.photo_path || ''}">
          <p class="font-display font-bold italic text-[15px] leading-tight text-paper">${e.description}</p>
          ${macros}
        </div>
        <div class="text-right shrink-0 leading-none">
          <p class="font-display font-bold text-[16px] num-stat ${kcalColor} leading-none">${arrow} ${Math.round(e.kcal || 0)}<span class="font-sans font-medium text-[9px] tracking-eyebrow text-muted ml-1">kcal</span></p>
          <button class="font-sans text-[10px] uppercase tracking-eyebrow text-muted active:text-blood transition mt-2 alim-entry-del" data-id="${e.id}" data-photo="${e.photo_path || ''}">✕ Suppr</button>
        </div>
      `;

      if (e.photo_path) {
        li.querySelectorAll('.cursor-pointer').forEach(el => {
          el.addEventListener('click', async () => {
            const url = await getFoodPhotoSignedUrl(e.photo_path);
            if (url) showFoodPhotoModal(url);
          });
        });
      }

      ul.appendChild(li);
    });
    timeline.appendChild(ul);

    timeline.querySelectorAll('.alim-entry-del').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        showConfirm('Supprimer cette entrée ?', async () => {
          if (btn.dataset.photo) await deleteFoodPhoto(btn.dataset.photo);
          await deleteFoodEntryDB(btn.dataset.id);
          await refresh();
        });
      });
    });
  }

  async function refreshAll() {
    presetContainer.innerHTML = '';
    await renderMealPresetButtons(presetContainer, dateInput.value, refreshAll);
    await refresh();
  }

  dateInput.addEventListener('change', refreshAll);
  addBtn.addEventListener('click', () => openAddMealModal(dateInput.value, refreshAll));
  adviceBtn.addEventListener('click', () => openEveningAdviceModal(dateInput.value));
  askBtn.addEventListener('click', () => openAskQuestionModal(dateInput.value));

  await refreshAll();
}

function showFoodPhotoModal(url) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  body.innerHTML = `<img src="${url}" style="width:100%;height:auto;border-radius:8px" />`;
  modal.classList.remove('hidden');
}

function openAddMealModal(dateIso, onSaved) {
  const modal = document.getElementById('add-meal-modal');
  const textEl = document.getElementById('meal-text');
  const photoInput = document.getElementById('meal-photo');
  const photoBtn = document.getElementById('meal-photo-btn');
  const preview = document.getElementById('meal-photo-preview');
  const errorEl = document.getElementById('meal-error');
  const saveBtn = document.getElementById('meal-save');
  const cancelBtn = document.getElementById('meal-cancel');

  textEl.value = '';
  photoInput.value = '';
  preview.innerHTML = '';
  preview.classList.add('hidden');
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
  saveBtn.disabled = false;
  saveBtn.textContent = 'Estimer & sauvegarder';

  let pendingFile = null;

  photoBtn.onclick = () => photoInput.click();
  photoInput.onchange = () => {
    pendingFile = photoInput.files?.[0] || null;
    if (pendingFile) {
      const url = URL.createObjectURL(pendingFile);
      preview.innerHTML = `<img src="${url}" style="max-width:100%;max-height:180px;border-radius:8px;margin-top:8px" />`;
      preview.classList.remove('hidden');
    } else {
      preview.innerHTML = '';
      preview.classList.add('hidden');
    }
  };

  function close() {
    modal.classList.add('hidden');
    pendingFile = null;
  }

  cancelBtn.onclick = close;
  modal.querySelector('.live-edit-modal-overlay').onclick = close;

  saveBtn.onclick = async () => {
    const text = textEl.value.trim();
    if (!text) {
      errorEl.textContent = 'Décris ton repas.';
      errorEl.classList.remove('hidden');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Estimation…';
    errorEl.classList.add('hidden');

    try {
      const macros = await estimateMealMacros(text);
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      const entry = await insertFoodEntryDB({
        date: dateIso,
        time,
        type: 'meal',
        description: text,
        kcal:        macros?.kcal        ?? null,
        proteines_g: macros?.proteines_g ?? null,
        glucides_g:  macros?.glucides_g  ?? null,
        lipides_g:   macros?.lipides_g   ?? null,
      });
      if (!entry) throw new Error('Échec sauvegarde.');

      if (pendingFile) {
        const path = await uploadFoodPhoto(pendingFile, entry.id);
        if (path) {
          await db.from('food_entries').update({ photo_path: path }).eq('id', entry.id);
        }
      }

      close();
      if (onSaved) await onSaved();
    } catch (e) {
      errorEl.textContent = e.message || 'Erreur lors de la sauvegarde.';
      errorEl.classList.remove('hidden');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Estimer & sauvegarder';
    }
  };

  modal.classList.remove('hidden');
  setTimeout(() => textEl.focus(), 50);
}

/**
 * Ouvre le modal de définition/édition d'un preset petit-dej.
 * mode: 'define' (preset vide → save crée preset + insère food_entry)
 *       'edit'   (preset existe → save met à jour preset uniquement)
 * @param {'pre_gym'|'post_gym'} slot
 * @param {'define'|'edit'} mode
 * @param {string} dateIso  date du jour (utile uniquement en mode 'define' pour insertion)
 * @param {() => Promise<void>} onSaved  callback de refresh
 */
function openMealPresetEditModal(slot, mode, dateIso, onSaved) {
  const modal     = document.getElementById('meal-preset-modal');
  const titleEl   = document.getElementById('meal-preset-title');
  const textEl    = document.getElementById('meal-preset-text');
  const errorEl   = document.getElementById('meal-preset-error');
  const saveBtn   = document.getElementById('meal-preset-save');
  const cancelBtn = document.getElementById('meal-preset-cancel');

  const slotLabel = slot === 'pre_gym' ? 'avant salle' : 'après salle';
  titleEl.textContent = mode === 'define'
    ? `Définir petit-dej ${slotLabel}`
    : `Modifier petit-dej ${slotLabel}`;

  textEl.value = '';
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
  saveBtn.disabled = false;
  saveBtn.textContent = 'Estimer & sauvegarder';

  // En mode édition, pré-remplir avec la description existante
  if (mode === 'edit') {
    loadMealPreset(slot).then(p => { if (p?.description) textEl.value = p.description; });
  }

  function close() {
    modal.classList.add('hidden');
  }

  cancelBtn.onclick = close;
  modal.querySelector('.live-edit-modal-overlay').onclick = close;

  saveBtn.onclick = async () => {
    const text = textEl.value.trim();
    if (!text) {
      errorEl.textContent = 'Décris ton petit-dej.';
      errorEl.classList.remove('hidden');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Estimation…';
    errorEl.classList.add('hidden');

    try {
      const macros = await estimateMealMacros(text);
      const preset = await upsertMealPreset(slot, {
        description: text,
        kcal:        macros?.kcal        ?? null,
        proteines_g: macros?.proteines_g ?? null,
        glucides_g:  macros?.glucides_g  ?? null,
        lipides_g:   macros?.lipides_g   ?? null,
      });
      if (!preset) throw new Error('Échec sauvegarde du preset.');

      // En mode 'define', insérer aussi une entrée alimentaire avec ce preset
      if (mode === 'define') {
        const entry = await addMealFromPreset(dateIso, slot);
        if (!entry) throw new Error("Preset sauvegardé, mais l'insertion de l'entrée a échoué.");
      }

      close();
      if (onSaved) await onSaved();
    } catch (e) {
      errorEl.textContent = e.message || 'Erreur lors de la sauvegarde.';
      errorEl.classList.remove('hidden');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Estimer & sauvegarder';
    }
  };

  modal.classList.remove('hidden');
  setTimeout(() => textEl.focus(), 50);
}

/**
 * Insère une entrée alimentaire à partir d'un preset (sans appel Claude).
 * @param {string} dateIso
 * @param {'pre_gym'|'post_gym'} slot
 * @returns {Promise<object|null>} l'entrée créée, ou null si preset absent.
 */
async function addMealFromPreset(dateIso, slot) {
  const preset = await loadMealPreset(slot);
  if (!preset || !preset.description) return null;

  const now  = new Date();
  const time = now.toTimeString().slice(0, 8);
  const entry = await insertFoodEntryDB({
    date: dateIso,
    time,
    type: 'meal',
    description: preset.description,
    kcal:        preset.kcal        ?? null,
    proteines_g: preset.proteines_g ?? null,
    glucides_g:  preset.glucides_g  ?? null,
    lipides_g:   preset.lipides_g   ?? null,
  });
  return entry;
}

async function estimateMealMacros(text) {
  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) throw new Error('Clé API Claude manquante.');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: text }],
      system: `Tu es un nutritionniste. L'utilisateur décrit un repas. Estime ses macros et calories en JSON STRICT (pas de markdown, pas d'autres mots) :
{ "kcal": <int>, "proteines_g": <int>, "glucides_g": <int>, "lipides_g": <int> }
Sois conservateur si l'estimation est ambiguë.`,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erreur API ${response.status}`);
  }
  const data = await response.json();
  const raw = data.content?.[0]?.text?.trim() || '';
  // Tenter de parser même si Claude entoure de markdown
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Réponse IA invalide.');
  return JSON.parse(match[0]);
}

async function openEveningAdviceModal(dateIso) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  const SYSTEM = `Coach nutrition bienveillant. L'utilisateur a fait sa journée alimentaire et te pose des questions ou demande des conseils. Réponds court (3-4 phrases max, français, ton chaleureux et direct). Pas de recette détaillée sauf si demandée. Pas de jugement sur ce qu'il a mangé. Tu peux répondre à plusieurs questions de suite, l'historique est conservé.`;

  // Build initial context
  const entries = await loadFoodEntriesForDate(dateIso);
  let apports = 0, depFonte = 0, depCardio = 0;
  let totP = 0, totG = 0, totL = 0;
  entries.forEach(e => {
    const k = parseFloat(e.kcal) || 0;
    if (e.type === 'meal') {
      apports += k;
      totP += parseFloat(e.proteines_g) || 0;
      totG += parseFloat(e.glucides_g) || 0;
      totL += parseFloat(e.lipides_g) || 0;
    } else if (e.type === 'session_burn') {
      if (e.session_category === 'cardio') depCardio += k;
      else depFonte += k;
    }
  });
  const depenses = depFonte + depCardio;

  // Métabolisme pro-rata (même calcul que le bilan affiché)
  const bmr24h = await computeBmrKcal();
  let metabolisme = 0;
  let metabolismeNote = null;
  if (bmr24h) {
    const isToday = dateIso === todayIso();
    if (isToday) {
      const now = new Date();
      const fraction = (now.getHours() + now.getMinutes() / 60) / 24;
      metabolisme = Math.round(bmr24h * fraction);
      metabolismeNote = `pro-rata jusqu'à ${now.toTimeString().slice(0, 5)}`;
    } else {
      metabolisme = bmr24h;
      metabolismeNote = '24h';
    }
  }
  const netReel = apports - depenses - metabolisme;

  const initialPayload = JSON.stringify({
    demande: 'Conseil pour le repas du soir',
    apports_kcal: Math.round(apports),
    proteines_g: Math.round(totP),
    glucides_g: Math.round(totG),
    lipides_g: Math.round(totL),
    depenses_seance_kcal: Math.round(depenses),
    depenses_fonte_kcal: Math.round(depFonte),
    depenses_cardio_kcal: Math.round(depCardio),
    metabolisme_kcal: metabolisme,
    metabolisme_note: metabolismeNote,
    net_reel_kcal: Math.round(netReel),
    entries: entries.map(e => ({
      time: e.time, type: e.type, description: e.description,
      kcal: e.kcal, P: e.proteines_g, G: e.glucides_g, L: e.lipides_g,
      session_category: e.session_category,
    })),
  });

  const conversation = [{ role: 'user', content: initialPayload }];

  body.innerHTML = `
    <div class="feedback-ia-modal" style="display:flex;flex-direction:column;gap:10px">
      <div class="modal-title" style="color:#5abe78">🌙 Conseil pour ce soir</div>
      <div id="advice-thread" style="display:flex;flex-direction:column;gap:10px;max-height:50vh;overflow-y:auto;padding-right:4px"></div>
      <textarea id="advice-input" placeholder="Une question, une précision…" rows="2"
                style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:14px;resize:vertical"></textarea>
      <div class="live-edit-modal-actions">
        <button class="btn-secondary" id="advice-close">Fermer</button>
        <button class="btn-primary"   id="advice-send">Envoyer</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');

  const thread = document.getElementById('advice-thread');
  const input = document.getElementById('advice-input');
  const sendBtn = document.getElementById('advice-send');
  document.getElementById('advice-close').onclick = () => modal.classList.add('hidden');

  function appendBubble(role, html) {
    const div = document.createElement('div');
    div.style.cssText = role === 'assistant'
      ? 'background:rgba(90,190,120,0.08);border-left:3px solid #5abe78;padding:10px 12px;border-radius:6px;font-size:14px;line-height:1.5'
      : 'background:rgba(255,255,255,0.05);padding:8px 12px;border-radius:6px;align-self:flex-end;max-width:90%;font-size:14px';
    div.innerHTML = html;
    thread.appendChild(div);
    thread.scrollTop = thread.scrollHeight;
    return div;
  }

  async function callClaude() {
    const apiKey = await getClaudeApiKeyDB();
    if (!apiKey) throw new Error('Clé API Claude manquante.');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 350,
        messages: conversation,
        system: SYSTEM,
      }),
    });
    if (!response.ok) throw new Error(`Erreur API ${response.status}`);
    const data = await response.json();
    return data.content?.[0]?.text || 'Pas de réponse.';
  }

  async function sendAndRender(loadingBubble) {
    sendBtn.disabled = true;
    sendBtn.textContent = '…';
    try {
      const reply = await callClaude();
      conversation.push({ role: 'assistant', content: reply });
      loadingBubble.innerHTML = formatFeedback(reply);
    } catch (e) {
      loadingBubble.innerHTML = `<span style="color:#ff5c5c">${e.message}</span>`;
    }
    sendBtn.disabled = false;
    sendBtn.textContent = 'Envoyer';
  }

  // Initial assistant reply
  const firstLoading = appendBubble('assistant', `<div class="feedback-ia-loading" style="margin:0"><div class="feedback-ia-spinner"></div><span>Réflexion en cours…</span></div>`);
  await sendAndRender(firstLoading);

  setTimeout(() => input.focus(), 100);

  sendBtn.onclick = async () => {
    const txt = input.value.trim();
    if (!txt) return;
    appendBubble('user', txt);
    conversation.push({ role: 'user', content: txt });
    input.value = '';
    const loading = appendBubble('assistant', `<div class="feedback-ia-loading" style="margin:0"><div class="feedback-ia-spinner"></div><span>…</span></div>`);
    await sendAndRender(loading);
    input.focus();
  };
}

async function openAskQuestionModal(dateIso) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  body.innerHTML = `
    <div class="feedback-ia-modal">
      <div class="modal-title" style="color:#5abe78">💬 Poser une question</div>
      <textarea id="ask-text" placeholder="Ex : je repars à la salle à 18h, je dois manger quelque chose avant ?" rows="3"
                style="width:100%;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:14px;resize:vertical;margin-top:8px"></textarea>
      <div id="ask-response" class="hidden" style="margin-top:12px"></div>
      <div class="live-edit-modal-actions" style="margin-top:12px">
        <button class="btn-secondary" id="ask-close">Fermer</button>
        <button class="btn-primary"   id="ask-send">Envoyer</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');

  const textEl = document.getElementById('ask-text');
  const responseEl = document.getElementById('ask-response');
  const sendBtn = document.getElementById('ask-send');
  const closeBtn = document.getElementById('ask-close');

  closeBtn.onclick = () => modal.classList.add('hidden');
  setTimeout(() => textEl.focus(), 50);

  sendBtn.onclick = async () => {
    const question = textEl.value.trim();
    if (!question) return;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Réflexion…';
    responseEl.innerHTML = `<div class="feedback-ia-loading"><div class="feedback-ia-spinner"></div><p>Réflexion en cours…</p></div>`;
    responseEl.classList.remove('hidden');

    try {
      const apiKey = await getClaudeApiKeyDB();
      if (!apiKey) throw new Error('Clé API Claude manquante.');

      const entries = await loadFoodEntriesForDate(dateIso);
      let apports = 0, depFonte = 0, depCardio = 0;
      let totP = 0, totG = 0, totL = 0;
      entries.forEach(e => {
        const k = parseFloat(e.kcal) || 0;
        if (e.type === 'meal') {
          apports += k;
          totP += parseFloat(e.proteines_g) || 0;
          totG += parseFloat(e.glucides_g) || 0;
          totL += parseFloat(e.lipides_g) || 0;
        } else if (e.type === 'session_burn') {
          if (e.session_category === 'cardio') depCardio += k;
          else depFonte += k;
        }
      });
      const depenses = depFonte + depCardio;

      const bmr24h = await computeBmrKcal();
      let metabolisme = 0;
      let metabolismeNote = null;
      if (bmr24h) {
        const isToday = dateIso === todayIso();
        if (isToday) {
          const nowD = new Date();
          const fraction = (nowD.getHours() + nowD.getMinutes() / 60) / 24;
          metabolisme = Math.round(bmr24h * fraction);
          metabolismeNote = `pro-rata jusqu'à ${nowD.toTimeString().slice(0, 5)}`;
        } else {
          metabolisme = bmr24h;
          metabolismeNote = '24h';
        }
      }
      const netReel = apports - depenses - metabolisme;

      const now = new Date();
      const heure = now.toTimeString().slice(0, 5);

      const payload = {
        question,
        heure_actuelle: heure,
        apports_kcal: Math.round(apports),
        proteines_g: Math.round(totP),
        glucides_g: Math.round(totG),
        lipides_g: Math.round(totL),
        depenses_seance_kcal: Math.round(depenses),
        depenses_fonte_kcal: Math.round(depFonte),
        depenses_cardio_kcal: Math.round(depCardio),
        metabolisme_kcal: metabolisme,
        metabolisme_note: metabolismeNote,
        net_reel_kcal: Math.round(netReel),
        entries: entries.map(e => ({
          time: e.time, type: e.type, description: e.description,
          kcal: e.kcal, P: e.proteines_g, G: e.glucides_g, L: e.lipides_g,
          session_category: e.session_category,
        })),
      };

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          messages: [{ role: 'user', content: JSON.stringify(payload) }],
          system: `Coach nutrition bienveillant. L'utilisateur pose une question sur son alimentation, dans le contexte de sa journée. Réponds court (max 4 phrases, français, ton chaleureux et direct). Tiens compte des apports/dépenses du jour, de l'heure actuelle, et de toute séance de sport déjà faite ou à venir mentionnée. Pas de jugement sur ce qu'il a mangé.`,
        }),
      });
      if (!response.ok) throw new Error(`Erreur API ${response.status}`);
      const data = await response.json();
      const text = data.content?.[0]?.text || 'Pas de réponse.';

      responseEl.innerHTML = `<div class="corps-analysis-content">${formatFeedback(text)}</div>`;
      sendBtn.textContent = 'Reposer';
      sendBtn.disabled = false;
      textEl.value = '';
      textEl.focus();
    } catch (e) {
      responseEl.innerHTML = `<div class="corps-analysis-content" style="color:#ff5c5c">${e.message}</div>`;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Envoyer';
    }
  };
}

async function estimateSessionBurn(session) {
  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) return null;

  const isCardio = session.category === 'cardio';
  const exercises = (session.exercises || []).map(e => e.name);

  // Cardio : on utilise le Temps saisi par l'utilisateur (done.duration en min) car
  // session.duration peut être très court si on termine vite après saisie.
  // Fonte : on utilise la durée écoulée de la session.
  let duree_min;
  if (isCardio) {
    duree_min = Math.round((session.exercises || []).reduce((s, e) => s + (e.done?.duration || 0), 0));
  } else {
    duree_min = session.duration ? Math.round(session.duration / 60) : null;
  }

  const volume_kg = isCardio ? null : Math.round(totalVolume(session.exercises));
  const power_w = isCardio ? Math.round((session.exercises || []).reduce((s, e) => Math.max(s, e.done?.power || 0), 0)) : null;
  const km = isCardio ? +(session.exercises || []).reduce((s, e) => s + (e.done?.km || 0), 0).toFixed(1) : null;

  const payload = {
    type: session.category || 'fonte',
    duree_min,
    volume_kg,
    power_w,
    km,
    exercices: exercises,
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 80,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        system: `Tu es préparateur physique. Estime les calories dépensées pour une séance. Réponds en JSON STRICT (pas de markdown) :
{ "kcal": <int> }
Sois conservateur (musculation = endurance + force, pas de pic cardio sauf si cardio).`,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.content?.[0]?.text?.trim() || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════════════ */
async function renderStats() {
  const body = document.getElementById('screen-stats-body');
  body.innerHTML = '';
  const sessions = (await loadSessions()).slice().sort((a, b) => a.date.localeCompare(b.date));

  if (!sessions.length) {
    body.innerHTML = `
      <div class="px-5 pt-12 text-center font-display italic text-[16px] text-muted">
        Aucune séance enregistrée.
      </div>
    `;
    return;
  }

  // Masthead
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-9 pb-9 accent-line';
  masthead.innerHTML = `
    <h1 class="font-display font-black h-display text-paper">
      Tes<br/>
      <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> progrès.</span>
    </h1>
    <p class="font-sans text-[10px] uppercase tracking-eyebrow text-muted mt-5">
      Évolution par exercice
    </p>
  `;
  body.appendChild(masthead);

  body.appendChild(buildStatsProgression(sessions));
}

function statsSection(title) {
  const section = document.createElement('section');
  section.className = 'mt-2';
  return section;
}

function exoMetrics(ex, session) {
  const e = migrateExercise(ex);
  let volume = 0, best1RM = 0, topWeight = 0;
  e.series.filter(s => s.done !== false).forEach(set => {
    e.activities.forEach((act, i) => {
      if (act.type !== 'weight') return;
      const v = set.values?.[i] || {};
      const w = v.weight || 0, r = v.reps || 0;
      volume += w * r;
      const rm = w * (1 + r / 30);
      if (rm > best1RM) best1RM = rm;
      if (w > topWeight) topWeight = w;
    });
  });
  return {
    date: session.date,
    volume,
    e1rm: Math.round(best1RM * 10) / 10,
    topWeight: Math.round(topWeight * 10) / 10,
  };
}

// Palette Direction A — cyan (mesure) puis acid, racing, paper, en rotation
const CHART_COLORS = ['#06B6D4', '#84CC16', '#FACC15', '#F5F4F0', '#DC2626'];

function buildStatsProgression(sessions) {
  const section = statsSection('Progression');

  const progNames = [...new Set(sessions.map(s => s.programmeName).filter(Boolean))].sort();
  if (!progNames.length) return section;

  // Programme pills — eyebrow border default, racing accent active
  const pills = document.createElement('div');
  pills.className = 'flex gap-2 overflow-x-auto px-5 pb-4 -mx-px';
  progNames.forEach((name, i) => {
    const btn = document.createElement('button');
    const isActive = i === 0;
    btn.className = `shrink-0 px-3 py-2 font-sans text-[10px] uppercase tracking-eyebrow font-semibold border transition ${
      isActive ? 'border-racing text-racing bg-racing/[0.08]' : 'border-border text-muted active:border-paper active:text-paper'
    }`;
    btn.textContent = name;
    btn.dataset.prog = name;
    pills.appendChild(btn);
  });
  section.appendChild(pills);

  // Metric toggle — segmented bar acid active
  const toggle = document.createElement('div');
  toggle.className = 'grid grid-cols-3 border-y border-border mb-6';
  [
    { label: 'Volume', metric: 'volume' },
    { label: '1RM',    metric: 'e1rm' },
    { label: 'Max',    metric: 'topWeight' },
  ].forEach(({ label, metric }, i) => {
    const btn = document.createElement('button');
    const isActive = i === 0;
    btn.className = `py-3 font-sans text-[11px] uppercase tracking-eyebrow font-semibold border-r border-border last:border-r-0 transition ${
      isActive ? 'text-acid bg-acid/[0.06] border-t-2 border-t-acid -mt-px' : 'text-muted active:text-paper'
    }`;
    btn.textContent = label;
    btn.dataset.metric = metric;
    toggle.appendChild(btn);
  });
  section.appendChild(toggle);

  // Cards container
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'px-5 mb-6 space-y-2';
  section.appendChild(cardsGrid);

  // Chart container
  const chartWrap = document.createElement('div');
  chartWrap.className = 'px-5 mb-12 h-[280px]';
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

    // Cards — delta acid (up) / blood (down) / muted (=)
    cardsGrid.innerHTML = '';
    exoData.forEach(exo => {
      if (!exo.points.length) return;
      const first = exo.points[0][activeMetric];
      const last = exo.points[exo.points.length - 1][activeMetric];
      const delta = first > 0 ? ((last - first) / first * 100) : 0;
      let deltaColor;
      if (delta > 0)      deltaColor = 'text-acid';
      else if (delta < 0) deltaColor = 'text-blood';
      else                deltaColor = 'text-muted';
      const deltaStr = delta === 0 ? '=' : `${delta > 0 ? '+' : ''}${Math.round(delta)}%`;
      const fmt = v => activeMetric === 'volume' ? Math.round(v).toLocaleString('fr-FR') : v.toFixed(1);

      const card = document.createElement('div');
      card.className = 'flex items-baseline justify-between gap-3 py-3 border-b border-border/70 last:border-b-0';
      card.innerHTML = `
        <span class="font-display font-bold italic text-[14px] text-paper truncate flex-1 min-w-0">${exo.name}</span>
        <div class="flex items-baseline gap-2 shrink-0 font-display num-stat">
          <span class="text-[12px] text-muted">${fmt(first)}</span>
          <span class="font-sans text-[10px] text-muted">→</span>
          <span class="text-[14px] font-bold text-cyan">${fmt(last)}<span class="font-sans font-medium text-[9px] tracking-eyebrow text-muted ml-1">${unit}</span></span>
          <span class="font-sans text-[10px] uppercase tracking-eyebrow font-semibold ${deltaColor} num-stat min-w-[42px] text-right">${deltaStr}</span>
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
        backgroundColor: color + '22',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
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
            labels: {
              color: '#888888',
              font: { family: "'DM Sans', sans-serif", size: 10, weight: '500' },
              boxWidth: 8,
              boxHeight: 8,
              padding: 10,
              usePointStyle: false,
            },
          },
          tooltip: {
            backgroundColor: '#0A0A0A',
            borderColor: '#2A2A2A',
            borderWidth: 1,
            titleColor: '#F5F4F0',
            bodyColor: '#F5F4F0',
            titleFont: { family: "'DM Sans', sans-serif", size: 11, weight: '600' },
            bodyFont: { family: "'DM Sans', sans-serif", size: 11 },
            cornerRadius: 0,
            padding: 10,
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${activeMetric === 'volume' ? Math.round(ctx.parsed.y) : ctx.parsed.y.toFixed(1)} ${unit}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#888888', font: { family: "'DM Sans', sans-serif", size: 9 }, maxRotation: 45 },
            grid: { color: '#2A2A2A', drawTicks: false },
            border: { color: '#2A2A2A' },
          },
          y: {
            ticks: {
              color: '#888888',
              font: { family: "'DM Sans', sans-serif", size: 9 },
              callback: v => activeMetric === 'volume' ? Math.round(v) : v.toFixed(1),
            },
            grid: { color: '#2A2A2A', drawTicks: false },
            border: { color: '#2A2A2A' },
          },
        },
      },
    });
  }

  render();

  // Programme pill click — re-render with active state racing
  pills.addEventListener('click', e => {
    const btn = e.target.closest('button[data-prog]');
    if (!btn) return;
    pills.querySelectorAll('button[data-prog]').forEach(b => {
      b.className = 'shrink-0 px-3 py-2 font-sans text-[10px] uppercase tracking-eyebrow font-semibold border transition border-border text-muted active:border-paper active:text-paper';
    });
    btn.className = 'shrink-0 px-3 py-2 font-sans text-[10px] uppercase tracking-eyebrow font-semibold border transition border-racing text-racing bg-racing/[0.08]';
    activeProg = btn.dataset.prog;
    render();
  });

  // Metric toggle click — acid active
  toggle.addEventListener('click', e => {
    const btn = e.target.closest('button[data-metric]');
    if (!btn) return;
    toggle.querySelectorAll('button[data-metric]').forEach(b => {
      b.className = 'py-3 font-sans text-[11px] uppercase tracking-eyebrow font-semibold border-r border-border last:border-r-0 transition text-muted active:text-paper';
    });
    btn.className = 'py-3 font-sans text-[11px] uppercase tracking-eyebrow font-semibold border-r border-border last:border-r-0 transition text-acid bg-acid/[0.06] border-t-2 border-t-acid -mt-px';
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

  // Masthead
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-9 pb-9 accent-line';
  masthead.innerHTML = `
    <h1 class="font-display font-black h-display text-paper">
      Tes<br/>
      <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> programmes.</span>
    </h1>
  `;
  tab.appendChild(masthead);

  const programmes = await loadProgrammes();

  if (!programmes.length) {
    const msg = document.createElement('p');
    msg.className = 'font-display italic text-[14px] text-muted px-5 py-4';
    msg.textContent = 'Aucun programme.';
    tab.appendChild(msg);
  } else {
    const list = document.createElement('div');
    list.className = 'border-y border-border';

    programmes.forEach((prog, idx) => {
      const row = document.createElement('div');
      const isLast = idx === programmes.length - 1;
      row.className = `flex items-center gap-3 px-5 py-4 ${isLast ? '' : 'border-b border-border/70'}`;
      row.innerHTML = `
        <div class="flex flex-col gap-1 shrink-0">
          <button data-dir="up" ${idx === 0 ? 'disabled' : ''} class="w-7 h-7 flex items-center justify-center border border-border text-paper text-[12px] active:border-acid active:text-acid disabled:opacity-30 disabled:active:border-border disabled:active:text-paper transition">↑</button>
          <button data-dir="down" ${idx === programmes.length - 1 ? 'disabled' : ''} class="w-7 h-7 flex items-center justify-center border border-border text-paper text-[12px] active:border-acid active:text-acid disabled:opacity-30 disabled:active:border-border disabled:active:text-paper transition">↓</button>
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="font-display font-bold italic text-[17px] leading-tight text-paper truncate">${prog.name}</h4>
          <p class="font-sans text-[9px] uppercase tracking-eyebrow text-muted mt-1">${prog.category === 'cardio' ? 'Cardio' : 'Fonte'} · ${prog.exercises.length} exo${prog.exercises.length > 1 ? 's' : ''}</p>
        </div>
        <div class="flex flex-col gap-1 shrink-0">
          <button data-action="edit" class="px-3 py-1.5 border border-border text-paper font-sans text-[10px] uppercase tracking-eyebrow active:border-acid active:text-acid transition">Modifier</button>
          <button data-action="del" class="px-3 py-1.5 border border-blood text-blood font-sans text-[10px] uppercase tracking-eyebrow active:bg-blood active:text-paper transition">Suppr</button>
        </div>
      `;
      row.querySelector('[data-dir="up"]').addEventListener('click', async () => {
        if (idx === 0) return;
        const progs = await loadProgrammes();
        [progs[idx - 1], progs[idx]] = [progs[idx], progs[idx - 1]];
        await reorderProgrammesDB(progs);
        await renderParams();
      });
      row.querySelector('[data-dir="down"]').addEventListener('click', async () => {
        if (idx === programmes.length - 1) return;
        const progs = await loadProgrammes();
        [progs[idx], progs[idx + 1]] = [progs[idx + 1], progs[idx]];
        await reorderProgrammesDB(progs);
        await renderParams();
      });
      row.querySelector('[data-action="edit"]').addEventListener('click', () => openProgrammeEditor(prog));
      row.querySelector('[data-action="del"]').addEventListener('click', () => {
        showConfirm(`Supprimer "${prog.name}" ?`, async () => {
          await deleteProgrammeDB(prog.id);
          await renderParams();
        });
      });
      list.appendChild(row);
    });
    tab.appendChild(list);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'mx-5 mt-6 mb-12 w-[calc(100%-2.5rem)] py-3 border border-border text-paper font-sans text-[11px] uppercase tracking-eyebrow active:border-acid active:text-acid transition';
  addBtn.textContent = '+ Nouveau programme';
  addBtn.addEventListener('click', () => openProgrammeEditor());
  tab.appendChild(addBtn);
}

/* ═══════════════════════════════════════════════════════
   ÉDITEUR DE PROGRAMME
═══════════════════════════════════════════════════════ */
function openProgrammeEditor(programme = null) {
  const tab = document.getElementById('screen-params-body');
  tab.innerHTML = '';

  const isEdit = !!programme;

  // Masthead
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-9 pb-9 accent-line';
  masthead.innerHTML = `
    <h1 class="font-display font-black h-display text-paper">
      ${isEdit ? 'Édite' : 'Crée'}<br/>
      <span class="text-paper/40"><span class="text-acid not-italic font-black">·</span> ton programme.</span>
    </h1>
    <button id="prog-back" class="font-sans text-[10px] uppercase tracking-eyebrow text-muted active:text-paper transition flex items-center gap-2 mt-5">
      <span aria-hidden>←</span><span>Retour</span>
    </button>
  `;
  tab.appendChild(masthead);
  masthead.querySelector('#prog-back').addEventListener('click', renderParams);

  const form = document.createElement('div');
  form.className = 'px-5 pt-6 pb-12 space-y-6';
  tab.appendChild(form);

  // Nom programme
  const nameBlock = document.createElement('div');
  nameBlock.innerHTML = `
    <p class="font-sans text-[9px] uppercase tracking-[0.40em] text-muted mb-1.5">Nom du programme</p>
    <input id="prog-name-input" type="text" maxlength="60" placeholder="Pectoraux & Bras" value="${programme?.name || ''}"
      class="w-full bg-transparent border-b border-border focus:border-acid font-display font-black italic text-[22px] text-paper py-2 outline-none transition" />
  `;
  form.appendChild(nameBlock);

  // Toggle catégorie (segmented)
  const currentCat = programme?.category || 'fonte';
  const catBlock = document.createElement('div');
  catBlock.innerHTML = `<p class="font-sans text-[9px] uppercase tracking-[0.40em] text-muted mb-1.5">Catégorie</p>`;
  const catWrap = document.createElement('div');
  catWrap.className = 'prog-category-toggle grid grid-cols-2 gap-2';
  const renderCatBtn = (cat, isActive) => `<button type="button" data-cat="${cat}" class="prog-cat-btn py-3 border ${isActive ? 'border-acid bg-acid/[0.10] text-acid' : 'border-border text-paper active:border-paper'} font-sans text-[11px] uppercase tracking-eyebrow font-semibold transition">${cat === 'fonte' ? 'Fonte' : 'Cardio'}</button>`;
  catWrap.innerHTML = renderCatBtn('fonte', currentCat === 'fonte') + renderCatBtn('cardio', currentCat === 'cardio');
  catBlock.appendChild(catWrap);
  form.appendChild(catBlock);

  function getActiveCat() {
    return catWrap.querySelector('.prog-cat-btn[data-cat][data-active="1"]')?.dataset.cat
      || (catWrap.querySelector('.prog-cat-btn.border-acid')?.dataset.cat)
      || currentCat;
  }

  // Re-style les boutons cat selon le cat actif
  function refreshCatBtns(active) {
    catWrap.innerHTML = renderCatBtn('fonte', active === 'fonte') + renderCatBtn('cardio', active === 'cardio');
    catWrap.querySelectorAll('.prog-cat-btn').forEach(b => {
      b.addEventListener('click', () => {
        const cat = b.dataset.cat;
        if (cat === active) return;
        refreshCatBtns(cat);
        fillExercises(cat, null);
      });
    });
  }
  refreshCatBtns(currentCat);

  // Section exercices
  const exoSec = document.createElement('div');
  exoSec.innerHTML = `<p class="font-sans text-[9px] uppercase tracking-[0.40em] text-muted mb-3">Exercices</p>`;
  const exercisesList = document.createElement('div');
  exercisesList.id = 'prog-exercises-list';
  exercisesList.className = 'space-y-4';
  exoSec.appendChild(exercisesList);
  form.appendChild(exoSec);

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
  fillExercises(currentCat, programme?.exercises);

  // CTAs : + Exercice / Enregistrer
  const addExBtn = document.createElement('button');
  addExBtn.className = 'w-full py-3 border border-border text-paper font-sans text-[11px] uppercase tracking-eyebrow active:border-acid active:text-acid transition';
  addExBtn.textContent = '+ Exercice';
  addExBtn.addEventListener('click', () => {
    const cat = catWrap.querySelector('.prog-cat-btn.border-acid')?.dataset.cat || currentCat;
    exercisesList.appendChild(cat === 'cardio' ? makeCardioExerciseCard() : makeExerciseCard());
  });
  form.appendChild(addExBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'w-full py-4 bg-acid text-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-acid/80 transition';
  saveBtn.textContent = isEdit ? 'Mettre à jour' : 'Créer le programme';
  saveBtn.addEventListener('click', () => saveProgrammeFromEditor(programme ? programme.id : null));
  form.appendChild(saveBtn);
}

async function saveProgrammeFromEditor(existingId) {
  const name = document.getElementById('prog-name-input').value.trim();
  if (!name) { showAlert('Donne un nom au programme.'); return; }

  const cards = document.querySelectorAll('#prog-exercises-list .exercise-card');
  if (!cards.length) { showAlert('Ajoute au moins un exercice.'); return; }

  const category = document.querySelector('.prog-cat-btn.border-acid')?.dataset.cat || 'fonte';
  const exercises = Array.from(cards).map(category === 'cardio' ? readCardioExerciseCard : readExerciseCard);

  const programmes = await loadProgrammes();
  if (existingId) {
    await updateProgrammeDB({ id: existingId, name, category, exercises });
  } else {
    const sameCategoryCount = programmes.filter(p => (p.category || 'fonte') === category).length;
    await upsertProgrammeDB({ id: crypto.randomUUID(), name, category, exercises, ordre: sameCategoryCount });
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
      liveFocus = null;
      liveRest = null;
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
      await attachPrevValues(liveSession.exercises, liveSession.programmeId, liveSession.category, liveSession.id);
      startSyncPolling();
    }
  }

  await Promise.all([
    Promise.resolve(),
    new Promise(r => setTimeout(r, 2200)),
  ]);

  showScreen(currentUser ? 'home' : 'login');
})();
