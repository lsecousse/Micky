/* ═══════════════════════════════════════════════════════
   VERSION
═══════════════════════════════════════════════════════ */
const APP_VERSION = '2026.sept..24';
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

/* ── Filet de sécurité localStorage pour live session ────
   Persiste chaque snapshot en local + tente Supabase.
   En cas d'échec réseau (gym basement), les données sont
   préservées et seront pushées au prochain succès / relance. */
const LIVE_LS_KEY = (id) => `live-session:${id}`;
const LIVE_PENDING_KEY = 'live-session:pending';

function persistSnapshotLocal(snap) {
  try {
    localStorage.setItem(LIVE_LS_KEY(snap.id), JSON.stringify({ snap, savedAt: Date.now() }));
    localStorage.setItem(LIVE_PENDING_KEY, snap.id);
  } catch (_) {}
}

function clearSnapshotLocal(id) {
  try {
    localStorage.removeItem(LIVE_LS_KEY(id));
    const pending = localStorage.getItem(LIVE_PENDING_KEY);
    if (pending === id) localStorage.removeItem(LIVE_PENDING_KEY);
  } catch (_) {}
}

function readSnapshotLocal(id) {
  try {
    const raw = localStorage.getItem(LIVE_LS_KEY(id));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

let _pushFailureShown = false;
const localWrites = createLocalWriteTracker(Date.now);
async function pushSessionSafe(snap) {
  persistSnapshotLocal(snap);
  try {
    await localWrites.track(pushSession(snap));
    _pushFailureShown = false;
  } catch (e) {
    console.error('[pushSession] échec, snapshot gardé en localStorage', e);
    if (!_pushFailureShown) {
      _pushFailureShown = true;
      showToast?.('⚠ Connexion perdue — sauvegarde locale active');
    }
    throw e;
  }
}

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
document.getElementById('back-params').addEventListener('click',  () => (paramsEditing ? renderParams() : showScreen('home')));
document.getElementById('back-profil').addEventListener('click',     () => showScreen('home'));
document.getElementById('back-claude-api').addEventListener('click', () => showScreen('home'));
document.getElementById('back-seance').addEventListener('click', () => {
  if (liveSession) {
    stopAllChronos();
    stopCountdown();
    pushSessionSafe(liveSessionSnapshot()).catch(() => {});
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
    greeting.className = 'px-5';
    greeting.innerHTML = `
      <h1 class="font-display font-medium text-[52px] leading-[0.95] tracking-[-0.02em] text-ink break-words">Bonjour <em class="text-mut">${escapeHtml(prenom)}.</em></h1>
    `;
    main.appendChild(greeting);
  }

  const programmes = await loadProgrammes();

  if (!programmes.length) {
    const msg = document.createElement('div');
    msg.className = 'px-5 text-center py-16 space-y-2';
    msg.innerHTML = `
      <p class="font-display italic text-[20px] font-bold text-ink">Aucun programme.</p>
      <p class="font-sans text-[13px] text-mut">Crées-en un dans Programmes.</p>
    `;
    main.appendChild(msg);
    return;
  }

  const liveCat = liveSession?.category || null;
  const fonteProgrammes  = programmes.filter(p => (p.category || 'fonte') === 'fonte');
  const cardioProgrammes = programmes.filter(p => p.category === 'cardio');

  // Exactly one highlighter on screen: the live session, else the first section's next programme
  const markedCat = liveCat || (fonteProgrammes.length ? 'fonte' : 'cardio');

  if (fonteProgrammes.length)  await renderHomeSection(main, 'fonte',  fonteProgrammes,  liveCat === 'fonte',  markedCat === 'fonte');
  if (cardioProgrammes.length) await renderHomeSection(main, 'cardio', cardioProgrammes, liveCat === 'cardio', markedCat === 'cardio');
}

async function renderHomeSection(main, category, programmes, isLive, isMarked) {
  const labelMap = { fonte: 'Fonte', cardio: 'Cardio' };
  const section = document.createElement('section');
  const nameClass = isMarked ? 'mark' : '';

  if (isLive) {
    section.innerHTML = `
      <p class="px-5 pb-2 font-sans text-[13px] text-mut">${labelMap[category]} · séance en cours</p>
      <div class="flex items-center gap-3 px-5 py-3 border-0 border-solid border-t-[1.5px] border-ink border-b border-b-rule">
        <button data-role="resume-delete" class="w-11 h-11 shrink-0 flex items-center justify-center text-[18px] border-[1.5px] border-solid border-ink rounded active:border-alert transition" aria-label="Supprimer">🗑</button>
        <button data-role="resume-center" class="flex-1 min-w-0 text-left">
          <p class="font-sans text-[13px] text-mut">En cours</p>
          <p class="font-display italic text-[20px] font-bold leading-tight text-ink mt-0.5"><span class="${nameClass}">${escapeHtml(liveSession.programmeName)}</span></p>
        </button>
        <button data-role="resume-finish" class="w-11 h-11 shrink-0 flex items-center justify-center text-[18px] border-[1.5px] border-solid border-ink rounded active:bg-sheet transition" aria-label="Terminer">✅</button>
      </div>
    `;
    section.querySelector('[data-role="resume-center"]').addEventListener('click', () => showScreen('seance'));
    section.querySelector('[data-role="resume-delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirm('Supprimer cette séance ?', async () => {
        await deleteSessionDB(liveSession.id);
        clearSnapshotLocal(liveSession.id);
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
      <p class="px-5 pb-2 font-sans text-[13px] text-mut">${labelMap[category]} · prochaine séance</p>
      <button data-role="next-card" class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-baseline w-full text-left px-5 py-3 border-0 border-solid border-t-[1.5px] border-ink border-b border-b-rule active:bg-sheet transition">
        <h2 class="font-display italic text-[20px] font-bold leading-[1.15] text-ink"><span class="${nameClass}">${escapeHtml(next.name)}</span></h2>
        <span class="font-sans text-[14px] font-semibold text-ink whitespace-nowrap">Démarrer →</span>
        ${muscles.length ? `<p class="col-start-1 font-sans text-[13px] text-mut leading-snug">${muscles.map(escapeHtml).join(' · ')}</p>` : ''}
        <p class="col-start-1 font-sans text-[13px] text-mut num-stat">${meta}</p>
      </button>
    `;
    section.querySelector('[data-role="next-card"]').addEventListener('click', async () => {
      await startSession(next);
      showScreen('seance');
    });

    if (programmes.length > 1) {
      const other = document.createElement('button');
      other.className = 'block w-full h-12 px-4 border-[1.5px] border-solid border-ink rounded font-sans text-[14px] font-medium text-ink text-center active:bg-sheet transition';
      other.textContent = `Choisir un autre programme ${category}`;
      other.addEventListener('click', () => { pendingSelectionCategory = category; showScreen('seance'); });
      const otherWrap = document.createElement('div');
      otherWrap.className = 'px-5 pt-4';
      otherWrap.appendChild(other);
      section.appendChild(otherWrap);
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

  const baseClass = 'w-full text-left px-4 py-3 font-sans text-[14px] border-0 border-solid border-b border-rule last:border-b-0 transition active:bg-paper';
  items.forEach(({ label, danger, action }) => {
    const btn = document.createElement('button');
    const colorClass = danger ? 'text-alert' : 'text-ink';
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
  lab.className = 'font-sans text-[9px] uppercase tracking-[0.40em] text-a-muted mb-1.5';
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
  input.className = 'w-full bg-transparent border-b border-a-border focus:border-a-acid font-sans text-[16px] text-a-paper py-2 outline-none transition';
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
        ? 'py-3 border border-a-acid bg-a-acid/[0.10] text-a-acid font-sans text-[11px] uppercase tracking-eyebrow font-semibold transition'
        : 'py-3 border border-a-border text-a-paper font-sans text-[11px] uppercase tracking-eyebrow active:border-a-paper transition';
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
        ? 'py-3 px-4 border border-a-acid bg-a-acid/[0.10] text-a-acid font-sans text-[11px] uppercase tracking-eyebrow font-semibold text-left transition'
        : 'py-3 px-4 border border-a-border text-a-paper font-sans text-[11px] uppercase tracking-eyebrow text-left active:border-a-paper transition';
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
    <h1 class="font-display font-black h-display text-a-paper">
      Tes<br/>
      <span class="text-a-paper/40"><span class="text-a-acid not-italic font-black">·</span> infos.</span>
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
  sexeBlock.innerHTML = `<p class="font-sans text-[9px] uppercase tracking-[0.40em] text-a-muted mb-1.5">Sexe</p>`;
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
  actBlock.innerHTML = `<p class="font-sans text-[9px] uppercase tracking-[0.40em] text-a-muted mb-1.5">Niveau d'activité (hors sport)</p>`;
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
  saveBtn.className = 'w-full py-4 bg-a-acid text-a-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-a-acid/80 transition';
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
    <div class="px-5 pt-12 text-center font-display italic text-[16px] text-a-muted">Chargement…</div>
  `;

  const existingKey = await getClaudeApiKeyDB();

  body.innerHTML = '';

  // Masthead
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-9 pb-9 accent-line';
  masthead.innerHTML = `
    <h1 class="font-display font-black h-display text-a-paper">
      Clé<br/>
      <span class="text-a-paper/40"><span class="text-a-acid not-italic font-black">·</span> Claude.</span>
    </h1>
    <p class="font-sans text-[10px] uppercase tracking-eyebrow text-a-muted mt-5">
      Utilisée pour le feedback IA · chiffrée en base
    </p>
  `;
  body.appendChild(masthead);

  const form = document.createElement('div');
  form.className = 'px-5 pt-6 pb-12';

  const fieldWrap = document.createElement('div');
  fieldWrap.className = 'mb-6';
  fieldWrap.innerHTML = `<p class="font-sans text-[9px] uppercase tracking-[0.40em] text-a-muted mb-1.5">Clé API</p>`;
  const inputRow = document.createElement('div');
  inputRow.className = 'flex items-baseline gap-2';
  const keyInput = document.createElement('input');
  keyInput.type = 'password';
  keyInput.placeholder = 'sk-ant-…';
  keyInput.value = existingKey || '';
  keyInput.className = 'flex-1 bg-transparent border-b border-a-border focus:border-a-acid font-sans text-[16px] text-a-paper py-2 outline-none transition';
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'shrink-0 px-3 py-2 border border-a-border text-a-muted active:text-a-paper active:border-a-paper font-sans text-[12px] transition';
  toggleBtn.textContent = '👁';
  toggleBtn.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });
  inputRow.append(keyInput, toggleBtn);
  fieldWrap.appendChild(inputRow);
  form.appendChild(fieldWrap);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'w-full py-4 bg-a-acid text-a-ink font-display font-bold text-[14px] uppercase tracking-eyebrow active:bg-a-acid/80 transition';
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
  body.classList.remove('flex', 'flex-col'); // set again by the exercise views
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
      <p class="font-display italic text-[20px] font-bold text-ink">Aucun programme.</p>
      <p class="font-sans text-[13px] text-mut">Crées-en un dans Programmes.</p>
    `;
    const btn = document.createElement('button');
    btn.className = 'mt-6 w-full h-12 px-4 border-[1.5px] border-solid border-ink rounded font-sans text-[14px] font-medium text-ink active:bg-sheet transition';
    btn.textContent = '→ Programmes';
    btn.addEventListener('click', () => showScreen('params'));
    wrap.appendChild(btn);
    tab.appendChild(wrap);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'pt-6 pb-10';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'px-5 pb-2 font-sans text-[13px] text-mut';
  eyebrow.textContent = 'Choisir un programme';
  wrap.appendChild(eyebrow);

  const list = document.createElement('div');
  list.className = 'border-0 border-solid border-t-[1.5px] border-ink';
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
    card.className = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-baseline w-full text-left px-5 py-3 border-0 border-solid border-b border-rule active:bg-sheet transition';

    const status = isDone ? '<span class="font-sans text-[13px] font-semibold text-done">Fait</span>'
                  : isNext ? '<span class="font-sans text-[14px] font-semibold text-ink">Suivant →</span>'
                  : '';
    const nameColor = isDone ? 'text-mut' : 'text-ink';
    const name = isNext ? `<span class="mark">${escapeHtml(prog.name)}</span>` : escapeHtml(prog.name);

    card.innerHTML = `
      <h3 class="font-display font-bold italic text-[20px] leading-[1.15] ${nameColor} truncate">${name}</h3>
      <div class="whitespace-nowrap">${status}</div>
      <p class="col-start-1 font-sans text-[13px] text-mut num-stat truncate">${meta}</p>
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
    exoDurations:  liveSession.exoDurations || {},
    exercises:     liveSession.exercises.map((ex, exIdx) => {
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
      const serieDurs = liveSession.serieDurations?.[exIdx] || {};
      return {
        name:       ex.name,
        comment:    ex.comment || '',
        activities: ex.activities,
        series:     ex.series.map((s, sIdx) => ({
          done: ex.activities.every((_, i) => s.activityStates?.[i] === 'done'),
          activityStates:   s.activityStates || {},
          values:           s.values,
          duration_seconds: serieDurs[sIdx] ?? null,
        })),
        ...(ex.group ? { group: ex.group } : {}),
      };
    }),
  };
}

/* Pour chaque exercice de la séance live, attache la dernière exécution
   du même nom (toutes séances confondues). Robuste si l'exercice a été
   déplacé d'un programme à un autre. */
async function attachPrevValues(exercises, _programmeId, category, _excludeSessionId) {
  const normalizedNames = exercises
    .map(ex => normalizeExerciseName(ex.name))
    .filter(n => n.length > 0);

  if (normalizedNames.length === 0) return;

  const lastByName = await loadLastExercisesByNamesDB(normalizedNames);

  if (category === 'cardio') {
    exercises.forEach(ex => {
      const key = normalizeExerciseName(ex.name);
      ex.prev = lastByName.get(key)?.execution?.done || null;
    });
  } else {
    exercises.forEach(ex => {
      const key = normalizeExerciseName(ex.name);
      ex.prevSeries = lastByName.get(key)?.execution?.series || null;
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
      : programme.exercises.map(ex => liveFonteExercise(ex, migrateExercise(ex))),
  };
  initLiveTimingMaps(null);
  await attachPrevValues(liveSession.exercises, programme.id, liveSession.category, liveSession.id);
  prefillSeriesFromPrev(liveSession.exercises);
  pushSessionSafe(liveSessionSnapshot()).catch(() => {});
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

// Carnet display helpers for the live session
function formatRest(secs) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function formatKg(value) {
  return String(value).replace('.', ',');
}

function isExerciseDone(ex) {
  return ex.series.every(s => ex.activities.every((_, a) => s.activityStates?.[a] === 'done'));
}

function showExerciseList() {
  liveFocus = null;
  liveRest = null;
  renderSeanceScreen();
}

const OUTLINE_BTN = 'border-[1.5px] border-solid border-ink rounded text-ink active:bg-ink/10 transition';

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
  const pct = totalSeries > 0 ? Math.round((doneSeries / totalSeries) * 100) : 0;

  const header = document.createElement('header');
  header.className = 'sticky top-0 z-10 bg-paper text-ink font-sans';
  const finishBtn = (label) =>
    `<button id="finish-session" class="shrink-0 h-10 px-3.5 font-medium text-[13px] ${OUTLINE_BTN}">${label}</button>`;
  const progress = `
    <div class="relative mx-5 mt-2 h-[2px] bg-rule" aria-hidden="true">
      <div class="absolute left-0 top-0 h-full bg-ink" style="width:${pct}%"></div>
    </div>`;

  if (isCardio) {
    header.innerHTML = `
      <div class="px-5 pt-3 pb-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="font-display italic font-bold text-[20px] leading-tight text-ink truncate">${escapeHtml(liveSession.programmeName)}</div>
          <div class="text-[13px] text-mut mt-1 num-stat">${formatDate(liveSession.date)} · en cours</div>
        </div>
        ${finishBtn('Terminer')}
      </div>
    `;
  } else if (inDetail || liveRest) {
    // Exercise views (series, rest): back to the list + programme · session counter
    header.innerHTML = `
      <div class="px-5 pt-1.5 flex items-center justify-between gap-3 text-[13px] text-mut">
        ${inDetail ? `<button id="back-to-list" class="shrink-0 h-10 font-medium text-ink active:text-mut transition">‹ Liste</button>` : ''}
        <span class="min-w-0 truncate num-stat"><b class="font-medium text-ink">${escapeHtml(liveSession.programmeName)}</b> · ${doneSeries}/${totalSeries}</span>
        ${finishBtn('Fin')}
      </div>
      ${progress}
    `;
  } else {
    header.innerHTML = `
      <div class="px-5 pt-1.5 flex items-center justify-between gap-3 text-[13px] text-mut">
        <span class="min-w-0 truncate num-stat">${formatDate(liveSession.date)} · en cours</span>
        ${finishBtn('Fin')}
      </div>
      ${progress}
    `;
  }
  tab.appendChild(header);

  document.getElementById('finish-session')?.addEventListener('click', finishSession);
  document.getElementById('back-to-list')?.addEventListener('click', showExerciseList);
  document.getElementById('back-home')?.addEventListener('click', () => showScreen('home'));

  if (isCardio) {
    renderLiveCardio(tab);
    return;
  }

  // Masque la sticky countdown bar quand on est en rest split (chrono dans le dock)
  const cdBar = document.getElementById('countdown-bar');
  if (cdBar) cdBar.classList.toggle('in-rest-split', liveRest !== null);

  const supersetPause = liveRest && (liveRest.kind === 'roundRest' || liveRest.kind === 'transition');
  if (supersetPause)  renderSupersetPause(tab);
  else if (liveRest)  renderRestSplit(tab);
  else if (liveFocus && liveSupersetBlock(liveSession.exercises, liveFocus.exIdx)) renderSupersetFocus(tab);
  else if (liveFocus) renderSeriesFocus(tab);
  else                renderExerciseList(tab, { totalSeries, doneSeries, totalVolume, doneVolume, totalReps, doneReps });
}

function renderExerciseList(tab, totals = {}) {
  const { totalSeries = 0, doneSeries = 0, totalVolume = 0, doneVolume = 0, totalReps = 0, doneReps = 0 } = totals;

  // Compteurs pour le sous-titre du masthead
  const exoCount = liveSession.exercises.filter(ex => ex.type !== 'cardio').length;
  // Estim durée moyenne : ~1.5min par série + repos moyen ~75s par série
  const avgRest = liveSession.exercises.reduce((s, ex) => {
    return s + ex.series.length * (ex.activities[0]?.rest || 60);
  }, 0);
  const estimMin = Math.round((totalSeries * 30 + avgRest) / 60);
  const tonnage  = (doneVolume / 1000).toFixed(1).replace('.', ',');
  const cibleTon = (totalVolume / 1000).toFixed(1).replace('.', ',');

  const wrap = document.createElement('div');
  wrap.className = 'pb-8 text-ink';

  // Masthead H1 — split title on its first separator, second part muted
  const { line1, sep, rest } = splitProgrammeTitle(liveSession.programmeName);
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-5 pb-4';
  masthead.innerHTML = `
    <h1 class="font-display font-medium leading-[0.95] tracking-[-0.02em] text-ink" style="font-size:clamp(2.5rem, 12vw, 3.25rem)">
      ${escapeHtml(line1)}${sep ? ` <em class="text-mut">${escapeHtml(sep)} ${escapeHtml(rest)}</em>` : ''}
    </h1>
    <p class="text-[13px] text-mut mt-2.5 num-stat">
      ${exoCount} exercice${exoCount > 1 ? 's' : ''} · ${totalSeries} séries${estimMin ? ` · ≈ ${estimMin} min` : ''}${doneSeries ? ` · <b class="font-semibold text-done">${doneSeries}/${totalSeries} faites</b>` : ''}
    </p>
  `;
  wrap.appendChild(masthead);

  // Session metrics — no colour, IBM Plex Mono ink
  const metrics = document.createElement('div');
  metrics.className = 'grid grid-cols-4 gap-2 px-5 pb-4';
  metrics.innerHTML = [
    ['Volume', Math.round(doneVolume), 'kg'],
    ['Tonnage', tonnage, 't'],
    ['Reps', doneReps, `/${totalReps}`],
    ['Cible', cibleTon, 't'],
  ].map(([label, value, unit]) => `
    <div class="min-w-0">
      <p class="text-[12px] text-mut">${label}</p>
      <p class="font-mono font-medium text-[17px] leading-none text-ink num-stat truncate mt-1">${value}<span class="font-sans text-[12px] text-mut ml-1">${unit}</span></p>
    </div>`).join('');
  wrap.appendChild(metrics);

  // Exercise list — one entry per block, finished blocks at the bottom
  const list = document.createElement('div');
  list.className = 'border-0 border-solid border-t-[1.5px] border-ink';

  let marked = false; // one highlighter at a time: the first block in progress
  liveListBlocks(liveSession.exercises).forEach(block => {
    const isMarked = block.started && !block.done && !marked;
    if (isMarked) marked = true;
    list.appendChild(block.kind === 'group'
      ? supersetListEntry(block, isMarked)
      : singleExerciseCard(block.indices[0], isMarked));
  });

  wrap.appendChild(list);
  if (canOpenLiveGrouping(liveSession.exercises, Boolean(countdownTimer))) wrap.appendChild(groupOpenButton());
  tab.appendChild(wrap);
}

// Opens the next undone step of the block of `exIdx` (or its first activity when finished)
function openListEntry(exIdx) {
  const next = nextUndoneInBlock(liveSession.exercises, exIdx);
  // Si exo entièrement fait, on ouvre la première activité de la première série pour permettre l'édition
  liveFocus = next || { exIdx, sIdx: 0, actIdx: 0 };
  if (next) markExoSerieStart(next.exIdx, next.sIdx);
  renderSeanceScreen();
}

// Last entered weight value of an exercise (null when none)
function latestWeightValue(ex, wActIdx) {
  if (wActIdx < 0) return null;
  for (let i = ex.series.length - 1; i >= 0; i--) {
    const v = ex.series[i]?.values?.[wActIdx];
    if (v && (v.weight != null || v.reps != null)) return v;
  }
  return null;
}

// List card of a single exercise (mock .item)
function singleExerciseCard(exIdx, isMarked) {
  const ex = liveSession.exercises[exIdx];
  const totalSets = ex.series.length;
  const doneSets = ex.series.filter(s =>
    ex.activities.every((_, a) => s.activityStates?.[a] === 'done')
  ).length;
  const startedSets = ex.series.filter(s =>
    ex.activities.some((_, a) => s.activityStates?.[a])
  ).length;

  const isDone    = doneSets === totalSets;
  const isStarted = !isDone && startedSets > 0;

  const muscle = (ex.activities?.[0]?.name) || '';
  const wActIdx = ex.activities.findIndex(a => a.type === 'weight');
  const wAct = wActIdx >= 0 ? ex.activities[wActIdx] : null;
  // Affiche la dernière valeur saisie (sinon le planifié)
  const latestVal = latestWeightValue(ex, wActIdx);
  const dispWeight = latestVal?.weight ?? wAct?.weight ?? 0;
  const dispReps   = latestVal?.reps   ?? wAct?.reps   ?? 0;
  const summary = [
    wAct ? `${totalSets} × ${dispReps} · ${formatKg(dispWeight)} kg` : `${totalSets} série${totalSets > 1 ? 's' : ''}`,
    muscle ? escapeHtml(muscle) : '',
  ].filter(Boolean).join(' · ');
  const name = escapeHtml(ex.name);
  const countCls = isDone ? 'font-semibold text-done' : (isStarted ? 'text-ink' : 'text-mut');

  const card = document.createElement('button');
  card.className = 'w-full text-left grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-baseline px-5 py-3 border-0 border-solid border-b border-rule text-ink active:bg-sheet transition';
  card.innerHTML = `
      <h3 class="font-display italic font-bold text-[20px] leading-[1.15] ${isDone ? 'text-mut' : 'text-ink'}">${isMarked ? `<span class="mark">${name}</span>` : name}</h3>
      <span class="font-mono text-[14px] num-stat ${countCls}">${doneSets}/${totalSets}</span>
      <p class="col-start-1 text-[13px] text-mut num-stat">${summary}</p>
    `;
  card.addEventListener('click', () => openListEntry(exIdx));
  return card;
}

// Load of a group member in the list: last entered weight, else the planned one
function memberLoadText(ex) {
  const wActIdx = ex.activities.findIndex(a => a.type === 'weight');
  if (wActIdx < 0) return '';
  const weight = latestWeightValue(ex, wActIdx)?.weight ?? ex.activities[wActIdx].weight ?? 0;
  return `${formatKg(weight)} kg`;
}

function supersetMemberRowHtml(exIdx, position, isDone) {
  const ex = liveSession.exercises[exIdx];
  return `
      <span class="font-display italic font-bold text-[17px] ${isDone ? 'text-mut' : 'text-ink'}">${supersetMemberLetter(position)}</span>
      <span class="font-display italic font-bold text-[19px] leading-[1.3] truncate ${isDone ? 'text-mut' : 'text-ink'}">${escapeHtml(ex.name)}</span>
      <span class="font-mono text-[13px] text-mut num-stat">${memberLoadText(ex)}</span>`;
}

// List entry of a group (mock .grp): header, rounds counter, bracket of members
function supersetListEntry(block, isMarked) {
  const { roundsDone, rounds } = block.progress;
  const label = `${supersetKindLabel(block.indices.length)} · ${rounds} tour${rounds > 1 ? 's' : ''}`;
  const head = isMarked
    ? `<span class="mark font-semibold">${label} · en cours</span>`
    : `<span class="text-mut">${label}</span>`;
  const countCls = block.done ? 'font-semibold text-done' : (block.started ? 'text-ink' : 'text-mut');

  const entry = document.createElement('button');
  entry.className = 'w-full text-left block px-5 pt-3 pb-3.5 border-0 border-solid border-b border-rule text-ink active:bg-sheet transition select-none';
  entry.innerHTML = `
      <div class="flex justify-between items-baseline gap-3 text-[13px]">
        ${head}
        <span class="font-mono text-[14px] num-stat ${countCls}">${roundsDone}/${rounds}</span>
      </div>
      <div class="mt-2 pl-3 border-0 border-solid border-l-2 border-ink grid grid-cols-[20px_minmax(0,1fr)_auto] gap-x-2 gap-y-1.5 items-baseline">
        ${block.indices.map((exIdx, pos) => supersetMemberRowHtml(exIdx, pos, block.done)).join('')}
      </div>
    `;
  entry.style.webkitTouchCallout = 'none';
  onLongPress(entry, 500, () => openUngroupDialog(block.indices));
  entry.addEventListener('click', () => openListEntry(block.indices[0]));
  return entry;
}

// Dashed button (mock .dashed): « Grouper des exercices », « + Nouveau programme », « + Exercice »
const DASHED_BTN = 'w-full h-12 border-[1.5px] border-dashed border-ink rounded text-center text-[14px] font-medium text-ink active:bg-ink/10 transition';

// Dashed button under the list: opens the « Grouper » sheet
function groupOpenButton() {
  const box = document.createElement('div');
  box.className = 'px-5 pt-[18px] pb-5';
  box.innerHTML = `<button id="group-open" class="${DASHED_BTN}">Grouper des exercices</button>`;
  box.querySelector('#group-open').addEventListener('click', openGroupSheet);
  return box;
}

/* ── « Grouper » sheet (mock screen 05) ──────────────── */
let groupSheetState = null; // { picked, rounds (null = default), transition, roundRest, keep, escHandler }

const GROUP_SHEET_STEPS = {
  rounds:     { step: 1,  min: 1 },
  transition: { step: 5,  min: 0 },
  roundRest:  { step: 15, min: 0 },
};
const GROUP_COUNT_WORDS = { 2: 'des deux', 3: 'des trois', 4: 'des quatre' };

function openGroupSheet() {
  const escHandler = (e) => { if (e.key === 'Escape') closeGroupSheet(); };
  document.addEventListener('keydown', escHandler);
  groupSheetState = {
    picked: [], rounds: null, keep: false, escHandler,
    transition: SUPERSET_DEFAULT_TRANSITION, roundRest: SUPERSET_DEFAULT_ROUND_REST,
  };
  renderGroupSheet();
  document.getElementById('group-sheet').classList.remove('hidden');
}

function closeGroupSheet() {
  document.getElementById('group-sheet').classList.add('hidden');
  document.getElementById('group-sheet-body').innerHTML = '';
  if (groupSheetState) document.removeEventListener('keydown', groupSheetState.escHandler);
  groupSheetState = null;
}

function groupSheetSettings(state) {
  return {
    rounds:     groupDraftRounds(liveSession.exercises, state.picked, state.rounds),
    transition: state.transition,
    roundRest:  state.roundRest,
  };
}

// "4 × 8" for a weight exercise, "3 séries" otherwise
function groupPickPlanText(ex) {
  const wActIdx = ex.activities.findIndex(a => a.type === 'weight');
  const sets = ex.series.length;
  if (wActIdx < 0) return `${sets} série${sets > 1 ? 's' : ''}`;
  return `${sets} × ${latestWeightValue(ex, wActIdx)?.reps ?? ex.activities[wActIdx].reps ?? 0}`;
}

function groupPickRowHtml(exIdx, picked) {
  const pos = picked.indexOf(exIdx);
  const box = pos >= 0
    ? `<span class="w-[30px] h-[30px] shrink-0 flex items-center justify-center rounded border-[1.5px] border-solid border-ink bg-ink text-paper font-display italic font-bold text-[17px]">${supersetMemberLetter(pos)}</span>`
    : `<span class="w-[30px] h-[30px] shrink-0 rounded border-[1.5px] border-solid border-ink"></span>`;
  return `
    <li><button data-group-pick="${exIdx}" class="w-full flex items-center gap-3 h-[54px] px-5 text-left text-ink border-0 border-solid border-b border-rule active:bg-ink/10 transition">
      ${box}
      <span class="flex-1 min-w-0 truncate font-display italic font-bold text-[18px] leading-[1.3]">${escapeHtml(liveSession.exercises[exIdx].name)}</span>
      <small class="font-mono text-[12px] text-mut num-stat">${groupPickPlanText(liveSession.exercises[exIdx])}</small>
    </button></li>`;
}

function groupOffRowHtml(name, reason) {
  return `
    <li class="flex items-center gap-3 h-[54px] px-5 text-mut border-0 border-solid border-b border-rule">
      <span class="w-[30px] h-[30px] shrink-0 rounded border-[1.5px] border-solid border-rule"></span>
      <span class="flex-1 min-w-0 truncate font-display italic font-bold text-[18px] leading-[1.3]">${name}</span>
      <small class="text-[12px] text-mut">${reason}</small>
    </li>`;
}

// One row per fonte block: groupable exercises are pickable, the others greyed; cardio absent
function groupPickListHtml(picked) {
  const exs = liveSession.exercises;
  const groupable = groupableLiveIndices(exs);
  return exerciseBlocks(exs).map(({ kind, indices }) => {
    const ex = exs[indices[0]];
    if (kind === 'group') {
      const names = indices.map(i => escapeHtml(exs[i].name)).join(' + ');
      return groupOffRowHtml(`${supersetKindLabel(indices.length)} · ${names}`, 'déjà groupé');
    }
    if (ex.type === 'cardio') return '';
    if (groupable.includes(indices[0])) return groupPickRowHtml(indices[0], picked);
    return groupOffRowHtml(escapeHtml(ex.name), 'commencé');
  }).join('');
}

function groupCounterHtml(key, label, hint, valueText) {
  const btn = 'w-[38px] h-[38px] rounded border-[1.5px] border-solid border-ink font-mono text-[18px] text-center text-ink active:bg-ink/10 transition';
  return `
    <div class="flex items-center justify-between gap-3 px-5 py-2.5">
      <p class="text-[14px] font-medium text-ink">${label}<span class="block text-[12px] font-normal text-mut">${hint}</span></p>
      <div class="flex items-center gap-2">
        <button data-group-step="${key}" data-dir="-1" class="${btn}" aria-label="${label} moins">−</button>
        <b class="w-16 text-center font-mono font-semibold text-[22px] text-ink num-stat">${valueText}</b>
        <button data-group-step="${key}" data-dir="1" class="${btn}" aria-label="${label} plus">+</button>
      </div>
    </div>`;
}

function groupRoundsHint(picked) {
  const longest = groupDraftRounds(liveSession.exercises, picked, null);
  const among = GROUP_COUNT_WORDS[picked.length] || 'des exercices';
  return `le plus long ${among} : <span class="font-mono num-stat">${longest}</span>`;
}

// Labelled checkbox row (« Garder dans le programme », « Retirer aussi du programme »)
function checkboxRowHtml(id, label, hint, checked, rowCls = 'px-5 pt-3 pb-2.5') {
  return `
    <div class="flex items-center justify-between gap-3 ${rowCls}">
      <p class="text-[14px] font-medium text-ink">${label}<span class="block text-[12px] font-normal text-mut">${hint}</span></p>
      <button id="${id}" role="checkbox" aria-checked="${checked}" aria-label="${label}"
        class="w-[30px] h-[30px] shrink-0 flex items-center justify-center rounded border-[1.5px] border-solid border-ink text-[16px] ${checked ? 'bg-ink text-paper' : 'text-ink'}">${checked ? '✓' : ''}</button>
    </div>`;
}

function groupKeepRowHtml(keep) {
  return checkboxRowHtml('group-keep', 'Garder dans le programme', 'sinon, pour cette séance seulement', keep);
}

function groupSheetBodyHtml(state) {
  const settings = groupSheetSettings(state);
  const n = state.picked.length;
  return `
    <p class="px-5 text-[13px] leading-normal text-mut">Touche 2 à 4 exercices pas encore commencés, dans l'ordre voulu : le premier touché devient A.</p>
    <ul class="list-none mt-3.5 border-0 border-solid border-t border-rule">${groupPickListHtml(state.picked)}</ul>
    <div class="pt-2">
      ${groupCounterHtml('rounds', 'Tours', groupRoundsHint(state.picked), settings.rounds)}
      ${groupCounterHtml('transition', 'Transition', 'entre exercices', formatRest(settings.transition))}
      ${groupCounterHtml('roundRest', 'Repos de tour', 'après le dernier', formatRest(settings.roundRest))}
    </div>
    ${groupKeepRowHtml(state.keep)}
    <div class="px-4 pt-3.5">
      <button id="group-submit" ${n < 2 ? 'disabled' : ''} class="w-full h-14 bg-ink text-paper rounded text-[16px] font-semibold active:bg-ink/80 disabled:opacity-40 transition">Grouper ${n} exercice${n > 1 ? 's' : ''}</button>
    </div>`;
}

function renderGroupSheet() {
  document.getElementById('group-sheet-body').innerHTML = groupSheetBodyHtml(groupSheetState);
}

function stepGroupSetting(key, dir) {
  const { step, min } = GROUP_SHEET_STEPS[key];
  const current = groupSheetSettings(groupSheetState)[key];
  groupSheetState[key] = Math.max(min, current + dir * step);
}

function handleGroupSheetClick(e) {
  if (!liveSession) return closeGroupSheet();
  if (!groupSheetState) return;
  const pick = e.target.closest('[data-group-pick]');
  const step = e.target.closest('[data-group-step]');
  if (pick) groupSheetState.picked = togglePickedExercise(groupSheetState.picked, Number(pick.dataset.groupPick));
  else if (step) stepGroupSetting(step.dataset.groupStep, Number(step.dataset.dir));
  else if (e.target.closest('#group-keep')) groupSheetState.keep = !groupSheetState.keep;
  else if (e.target.closest('#group-submit')) return submitLiveGrouping();
  else return;
  renderGroupSheet();
}

// Groups the picked exercises in the live session (timing maps follow), optionally in the programme too
function submitLiveGrouping() {
  const { picked, keep } = groupSheetState;
  if (countdownTimer) return closeGroupSheet();
  if (!canGroupLive(liveSession.exercises, picked)) return;
  const settings = groupSheetSettings(groupSheetState);
  const before = liveSession.exercises;
  const { exercises, timing } = applyLiveGrouping(liveSession, picked, settings);
  liveSession.exercises = exercises;
  Object.assign(liveSession, timing);
  closeGroupSheet();
  pushSessionSafe(liveSessionSnapshot()).catch(() => {});
  if (keep) keepGroupInProgramme(before, picked, settings);
  renderSeanceScreen();
}

// Carries a live change over to the programme on its write queue; `transform(programmeExercises)`
// gives the new exercises, or null when it cannot apply (the session keeps the change, a toast says so)
function applyToProgramme(transform, fallbackToast, label) {
  const programmeId = liveSession.programmeId;
  programmeTemplateQueue = programmeTemplateQueue.then(async () => {
    const prog = programmeId ? (await loadProgrammes()).find(p => p.id === programmeId) : null;
    const exercises = prog ? transform(prog.exercises || []) : null;
    if (!exercises) return showToast(fallbackToast);
    await updateProgrammeDB({ ...prog, exercises });
  }).catch(err => console.error(`${label} error:`, err));
  return programmeTemplateQueue;
}

// Same grouping on the programme; a refusal keeps the session grouped
function keepGroupInProgramme(sessionExercises, picked, settings) {
  return applyToProgramme(exercises => programmeGrouping(exercises, sessionExercises, picked, settings),
    'Groupe gardé pour cette séance seulement', 'keepGroupInProgramme');
}

document.getElementById('group-sheet-body').addEventListener('click', handleGroupSheetClick);
document.getElementById('group-close').addEventListener('click', closeGroupSheet);
document.querySelector('#group-sheet .live-edit-modal-overlay').addEventListener('click', closeGroupSheet);

/* ── « Dégrouper » dialog (long press on a group entry) ── */
let ungroupDialogState = null; // { indices, groupId, remove }

function openUngroupDialog(indices) {
  if (countdownTimer) return showToast('Dégrouper après le décompte');
  ungroupDialogState = { indices, groupId: liveSession.exercises[indices[0]].group.id, remove: false };
  renderUngroupDialog();
  document.getElementById('ungroup-dialog').classList.remove('hidden');
}

function renderUngroupDialog() {
  const { title, members } = ungroupDialogText(liveSession.exercises, ungroupDialogState.indices);
  document.getElementById('ungroup-title').textContent = title;
  document.getElementById('ungroup-members').textContent = members;
  document.getElementById('ungroup-programme-slot').innerHTML =
    checkboxRowHtml('ungroup-programme', 'Retirer aussi du programme', 'sinon, il revient à la prochaine séance',
      ungroupDialogState.remove, '');
}

function closeUngroupDialog() {
  document.getElementById('ungroup-dialog').classList.add('hidden');
  ungroupDialogState = null;
}

function handleUngroupDialogClick(e) {
  if (!liveSession) return closeUngroupDialog();
  if (!ungroupDialogState) return;
  if (e.target.closest('#ungroup-cancel')) return closeUngroupDialog();
  if (e.target.closest('#ungroup-ok')) return submitLiveUngrouping();
  if (!e.target.closest('#ungroup-programme')) return;
  ungroupDialogState.remove = !ungroupDialogState.remove;
  renderUngroupDialog();
}

// Ungroups in the live session (no reorder, timing maps untouched), optionally in the programme too
function submitLiveUngrouping() {
  const { groupId, remove } = ungroupDialogState;
  closeUngroupDialog();
  if (countdownTimer) return showToast('Dégrouper après le décompte');
  const before = liveSession.exercises;
  const indices = before.flatMap((ex, i) => (ex.group && ex.group.id === groupId ? [i] : []));
  if (!indices.length) return;
  liveSession.exercises = ungroupSuperset(before, groupId);
  pushSessionSafe(liveSessionSnapshot()).catch(() => {});
  if (remove) removeGroupFromProgramme(before, indices);
  renderSeanceScreen();
}

// Same ungrouping on the programme
function removeGroupFromProgramme(sessionExercises, memberIndices) {
  return applyToProgramme(exercises => programmeUngrouping(exercises, sessionExercises, memberIndices),
    'Dégroupé pour cette séance seulement', 'removeGroupFromProgramme');
}

document.getElementById('ungroup-dialog').addEventListener('click', handleUngroupDialogClick);

// The live session ended: its sheets must not outlive it
function closeLiveGroupingSheets() {
  closeGroupSheet();
  closeUngroupDialog();
}

// Exercise header (mock .head) — shared by the series focus and the rest split
function renderExoMasthead(wrap, exIdx, kick) {
  const ex = liveSession.exercises[exIdx];
  let doneSeries = 0;
  const totalSeries = ex.series.length;
  ex.series.forEach((s) => {
    const allDone = ex.activities.every((_, a) => s.activityStates?.[a] === 'done');
    if (allDone) doneSeries++;
  });

  const muscle = ex.activities?.[0]?.name || '';
  const restSecs = ex.activities?.[0]?.rest || 0;
  const details = [
    muscle ? escapeHtml(muscle) : '',
    restSecs > 0 ? `repos <b class="font-medium text-ink num-stat">${formatRest(restSecs)}</b>` : '',
  ].filter(Boolean).join(' · ');
  const exoHead = document.createElement('header');
  exoHead.className = 'px-5 pt-5 pb-3.5';
  exoHead.innerHTML = `
    <p class="flex justify-between gap-3 text-[13px] text-mut">
      <span class="min-w-0">${kick}</span>
      <span class="shrink-0 num-stat ${doneSeries ? 'font-semibold text-done' : ''}">${doneSeries}/${totalSeries} séries</span>
    </p>
    <h2 class="font-display italic font-medium text-[31px] leading-[1.05] tracking-[-0.01em] text-ink mt-1.5">${escapeHtml(ex.name)}</h2>
    ${details ? `<p class="text-[13px] text-mut mt-2.5">${details}</p>` : ''}
  `;
  wrap.appendChild(exoHead);
}

function activityLabel(ex, actIdx) {
  const act = ex.activities[actIdx];
  return act.label || act.name || `Activité ${actIdx + 1}`;
}

// "Préc." line of a series, from the previous session
function previousValueText(ex, sIdx, actIdx) {
  const act = ex.activities[actIdx];
  const prevVal = ex.prevSeries?.[sIdx]?.values?.[actIdx];
  if (act.type === 'weight' && (prevVal?.reps || prevVal?.weight)) {
    return `Préc. : ${prevVal.weight != null ? formatKg(prevVal.weight) : '—'} × ${prevVal.reps ?? '—'}`;
  }
  if (act.type === 'countdown' && prevVal?.duration) return `Préc. : ${prevVal.duration} s`;
  if (act.type === 'stopwatch' && prevVal?.duration) return `Préc. : ${formatSeconds(prevVal.duration)}`;
  return '';
}

// Highlighted (act) or framed (prep) series band: who + big mono values + optional action
function seriesBandHtml(ex, sIdx, actIdx, { prep = false, action = '', who: whoText = '' } = {}) {
  const act = ex.activities[actIdx];
  const v = ex.series[sIdx].values?.[actIdx] || {};
  const unit = (u) => `<small class="font-sans text-[14px] font-medium tracking-normal ml-1">${u}</small>`;
  let values;
  if (act.type === 'weight') {
    values = `${formatKg(v.weight ?? act.weight ?? 0)}${unit('kg')}<span class="text-[28px] ml-3">× ${v.reps ?? act.reps ?? 0}</span>`;
  } else if (act.type === 'countdown') {
    values = `${v.duration ?? act.duration ?? 0}${unit('s')}`;
  } else {
    values = `<span class="font-display italic font-bold tracking-normal">Chrono</span>`;
  }
  const who = whoText ? [whoText] : [`Série ${sIdx + 1} sur ${ex.series.length}`];
  if (ex.activities.length > 1) who.push(escapeHtml(activityLabel(ex, actIdx)));
  const prevText = previousValueText(ex, sIdx, actIdx);
  const tone = prep
    ? 'bg-sheet border-y-[1.5px] border-ink'
    : 'bg-hl border-b border-rule';
  return `
    <div class="px-5 pt-3.5 pb-4 border-0 border-solid ${tone}">
      <div class="flex justify-between items-baseline gap-2.5 text-[13px]">
        <b class="min-w-0 font-display italic font-bold text-[20px] leading-tight text-ink">${who.join(' · ')}</b>
        ${prevText ? `<span class="shrink-0 num-stat ${prep ? 'text-mut' : 'text-ink/75'}">${prevText}</span>` : ''}
      </div>
      <div class="flex items-end justify-between gap-3 mt-2.5">
        <p class="min-w-0 font-mono font-semibold ${prep ? 'text-[38px]' : 'text-[44px]'} leading-none tracking-[-0.04em] num-stat text-ink">${values}</p>
        ${action}
      </div>
    </div>
  `;
}

// One logbook row (mock .lr): series number, activity, kg, reps, rest or state
function seriesLogRow(ex, sIdx, actIdx, stateHtml) {
  const act = ex.activities[actIdx];
  const v = ex.series[sIdx].values?.[actIdx] || {};
  const done = ex.series[sIdx].activityStates?.[actIdx] === 'done';
  const num = 'font-mono font-medium text-[17px] leading-none num-stat text-right';
  let values;
  if (act.type === 'weight') {
    values = `<span class="${num}">${formatKg(v.weight ?? act.weight ?? 0)}</span><span class="${num}">${v.reps ?? act.reps ?? 0}</span>`;
  } else {
    const dur = act.type === 'countdown' ? `${v.duration ?? act.duration ?? 0} s` : (v.duration ? formatSeconds(v.duration) : '—');
    values = `<span class="col-span-2 ${num}">${dur}</span>`;
  }
  const state = stateHtml || (done
    ? `<span class="text-right text-[13px] font-semibold text-done">fait</span>`
    : `<span class="text-right text-[12px] text-mut num-stat">${act.rest ? formatRest(act.rest) : ''}</span>`);
  return `
    <div class="grid grid-cols-[30px_minmax(0,1fr)_52px_34px_66px] items-baseline min-h-[40px] px-5 py-2.5 border-0 border-solid border-b border-rule text-[14px] ${done ? 'text-ink' : 'text-mut'}">
      <span class="text-[12px] text-mut num-stat">${actIdx === 0 ? sIdx + 1 : ''}</span>
      <span class="truncate pr-1.5">${ex.activities.length > 1 ? escapeHtml(activityLabel(ex, actIdx)) : ''}</span>
      ${values}
      ${state}
    </div>
  `;
}

// Logbook of an exercise (mock .log): `band` replaces the row it targets, `rowState` overrides one row's state cell
function seriesLogHtml(ex, band, rowState = null) {
  const hasWeight = ex.activities.some(a => a.type === 'weight');
  const head = `
    <div class="grid grid-cols-[30px_minmax(0,1fr)_52px_34px_66px] items-baseline min-h-[30px] px-5 pt-2 pb-1.5 border-0 border-solid border-b border-rule text-[12px] text-mut">
      <span class="whitespace-nowrap">Série</span><span></span>
      ${hasWeight ? '<span class="text-right">kg</span><span class="text-right">reps</span>' : '<span class="col-span-2 text-right">durée</span>'}
      <span class="text-right">repos</span>
    </div>`;
  const rows = ex.series.flatMap((_, sIdx) => ex.activities.map((__, actIdx) => {
    if (band && band.sIdx === sIdx && band.actIdx === actIdx) return band.html;
    const state = rowState && rowState.sIdx === sIdx && rowState.actIdx === actIdx ? rowState.html : '';
    return seriesLogRow(ex, sIdx, actIdx, state);
  }));
  return `<div class="border-0 border-solid border-t-[1.5px] border-ink">${head}${rows.join('')}</div>`;
}

// What the validate button leads to (mirrors completeFocusedActivity)
function nextStepHint(ex, sIdx, actIdx) {
  const act = ex.activities[actIdx];
  const others = ex.series.some((s, j) => ex.activities.some((_, a) =>
    (j !== sIdx || a !== actIdx) && s.activityStates?.[a] !== 'done'));
  if (!others) return 'puis retour à la liste';
  return act.rest > 0 ? `puis repos ${formatRest(act.rest)}` : 'puis série suivante';
}

// Exercise view laid out as a column filling the screen, so the dock sits at the bottom
function exerciseViewWrap(tab) {
  tab.classList.add('flex', 'flex-col');
  const wrap = document.createElement('div');
  wrap.className = 'flex-1 flex flex-col text-ink';
  return wrap;
}

// Thumb dock (mock .dock) pinned at the bottom of the scrolling screen
function createDock(innerHtml) {
  const dock = document.createElement('div');
  dock.className = 'sticky bottom-0 z-10 mt-auto';
  dock.innerHTML = `
    <div class="bg-paper border-0 border-solid border-t-[1.5px] border-ink px-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      ${innerHtml}
    </div>
  `;
  return dock;
}

// Vue focus série — tableau-carnet de l'exercice, la série en cours surlignée
function renderSeriesFocus(tab) {
  const { exIdx, sIdx, actIdx } = liveFocus;
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const totalSets = ex.series.length;

  const wrap = exerciseViewWrap(tab);

  renderExoMasthead(wrap, exIdx, `Série <b class="font-semibold text-ink">${sIdx + 1}</b> sur ${totalSets}`);

  const log = document.createElement('section');
  log.className = 'mb-6';
  log.innerHTML = seriesLogHtml(ex, { sIdx, actIdx, html: seriesBandHtml(ex, sIdx, actIdx, { action: focusEditButtonHtml(act) }) });
  wrap.appendChild(log);

  if (act.type === 'weight') wrap.appendChild(weightSuggestionSlot());

  const hint = act.type === 'weight' ? nextStepHint(ex, sIdx, actIdx) : '';
  wrap.appendChild(createDock(focusDockHtml(act, hint)));

  tab.appendChild(wrap);

  if (act.type === 'weight') loadWeightSuggestion(ex.name);
  bindFocusActions(exIdx, sIdx, actIdx);
}

// "Modifier" button of the highlighted band (a stopwatch is edited by its overlay)
function focusEditButtonHtml(act) {
  return act.type === 'stopwatch'
    ? ''
    : `<button id="focus-edit" class="shrink-0 h-12 px-4 text-[14px] font-medium ${OUTLINE_BTN}">Modifier</button>`;
}

// Placeholder of the async AI weight suggestion under the logbook
function weightSuggestionSlot() {
  const sug = document.createElement('div');
  sug.id = 'focus-suggestion';
  sug.className = 'hidden mx-5 -mt-2 mb-6 flex items-center gap-2 text-[13px] leading-snug text-mut italic';
  return sug;
}

function loadWeightSuggestion(targetExName) {
  const sugEl = document.getElementById('focus-suggestion');
  if (!sugEl) return;
  sugEl.innerHTML = `<div class="live-edit-suggestion-spinner"></div><span>Suggestion…</span>`;
  sugEl.classList.remove('hidden');
  generateWeightSuggestion(targetExName).then(text => {
    if (!liveFocus || liveSession.exercises[liveFocus.exIdx]?.name !== targetExName) return;
    const el = document.getElementById('focus-suggestion');
    if (!el) return;
    if (!text) { el.classList.add('hidden'); return; }
    el.textContent = text;
  }).catch(() => {
    const el = document.getElementById('focus-suggestion');
    if (el) el.classList.add('hidden');
  });
}

// "Exercices · n/N faits" button of the thumb dock
function dockExosButtonHtml() {
  const doneExos = liveSession.exercises.filter(isExerciseDone).length;
  return `<button id="dock-exos" class="w-[84px] h-14 shrink-0 text-[13px] leading-tight text-center ${OUTLINE_BTN}">Exercices<span class="block text-[12px] text-mut num-stat">${doneExos}/${liveSession.exercises.length} faits</span></button>`;
}

// Dock of a focused activity: exercise list + validate (or start the timer)
function focusDockHtml(act, hint) {
  const validateLabel = act.type === 'stopwatch'
    ? 'Démarrer chrono'
    : (act.type === 'countdown' ? 'Démarrer minuterie' : 'Valider');
  return `
    <div class="flex gap-2.5 pt-3">
      ${dockExosButtonHtml()}
      <button id="focus-validate" class="flex-1 min-w-0 h-14 px-3 bg-ink text-paper rounded text-[16px] font-semibold leading-tight text-center active:bg-ink/80 transition">${validateLabel}${hint ? `<span class="block text-[12px] font-normal opacity-70 truncate">${hint}</span>` : ''}</button>
    </div>
  `;
}

function bindFocusActions(exIdx, sIdx, actIdx) {
  const act = liveSession.exercises[exIdx].activities[actIdx];
  document.getElementById('dock-exos').addEventListener('click', showExerciseList);
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

// Vue repos split — décompte surligné dans le dock, série suivante encadrée (jamais surlignée)
function renderRestSplit(tab) {
  const { exIdx, sIdx, actIdx } = liveRest;
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const totalSets = ex.series.length;

  const wrap = exerciseViewWrap(tab);

  renderExoMasthead(wrap, exIdx, `Série <b class="font-semibold text-ink">${sIdx + 1}</b> sur ${totalSets} validée`);

  // Logbook — the series just done stays editable, the next one is framed (prep)
  const editBtn = act.type === 'stopwatch'
    ? ''
    : `<button id="rest-edit" class="text-right text-[13px] font-semibold text-ink underline underline-offset-4">modifier</button>`;
  const next = liveRest.next || nextUndoneActivity(exIdx);
  const band = next ? { ...next, html: seriesBandHtml(ex, next.sIdx, next.actIdx, { prep: true }) } : null;
  const log = document.createElement('section');
  log.className = 'mb-6';
  log.innerHTML = seriesLogHtml(ex, band, editBtn ? { sIdx, actIdx, html: editBtn } : null);
  wrap.appendChild(log);

  // Dock — the rest countdown is the one highlighted zone
  const dock = createDock(`
    <div class="-mx-4 mb-3 px-4 py-3 bg-hl">
      <p class="text-[13px] text-ink truncate"><span class="font-semibold">Repos</span> · <span id="rest-split-next"></span></p>
      <p id="rest-split-time" class="font-mono font-semibold text-[42px] leading-none tracking-[-0.04em] num-stat text-ink mt-1">--:--</p>
      <div class="relative h-[3px] bg-ink/15 mt-2" aria-hidden="true"><div id="rest-split-bar" class="absolute left-0 top-0 h-full bg-ink" style="width:100%"></div></div>
    </div>
    <button id="rest-split-skip" class="w-full h-14 text-[16px] font-semibold text-center ${OUTLINE_BTN}">Passer le repos</button>
  `);
  wrap.appendChild(dock);

  tab.appendChild(wrap);

  startRestDockSync();

  document.getElementById('rest-edit')?.addEventListener('click', () => {
    openEditModalForActivity(exIdx, sIdx, actIdx);
  });
  document.getElementById('rest-split-skip').addEventListener('click', () => {
    showConfirm('Passer le repos ?', finishCountdown);
  });
}

// Mirrors the sticky countdown (hidden via .in-rest-split) into the dock of a rest screen
function startRestDockSync() {
  const sync = () => {
    const cdDisplay = document.getElementById('countdown-display');
    const splitTime = document.getElementById('rest-split-time');
    const nextLabel = document.getElementById('countdown-exercise-name');
    const splitNext = document.getElementById('rest-split-next');
    const splitBar  = document.getElementById('rest-split-bar');
    if (cdDisplay && splitTime) {
      splitTime.textContent = cdDisplay.textContent;
      const urgent = document.getElementById('countdown-bar')?.classList.contains('urgent') ?? false;
      splitTime.classList.toggle('text-alert', urgent);
      splitTime.classList.toggle('text-ink', !urgent);
    }
    if (nextLabel && splitNext) splitNext.textContent = nextLabel.textContent ? `À suivre : ${nextLabel.textContent.replace(/^À suivre :\s*/, '')}` : '';
    if (splitBar && countdownTotal > 0) splitBar.style.width = `${(countdownSecs / countdownTotal) * 100}%`;
  };
  sync();
  const restSyncId = setInterval(sync, 200);
  if (window.__restSyncId) clearInterval(window.__restSyncId);
  window.__restSyncId = restSyncId;
}

/* ── Super set views (screens 01, 02, 02b, 03) ───────── */

const SUPERSET_LOG_GRID = 'grid grid-cols-[30px_22px_minmax(0,1fr)_52px_34px_66px] items-baseline px-5 border-0 border-solid border-b border-rule';

// Group header (mock .head): kind · round, rounds done, "A + B", optional settings line
function supersetHeadHtml(block, model, withSettings) {
  const names = block.indices.map(i => escapeHtml(liveSession.exercises[i].name));
  const done = model.roundsDone;
  const plural = done > 1 ? 's' : '';
  const doneCount = done ? `<span class="shrink-0 num-stat font-semibold text-done">${done} tour${plural} fait${plural}</span>` : '';
  const settings = withSettings
    ? `<p class="text-[13px] text-mut mt-2.5">Transition <b class="font-medium text-ink num-stat">${supersetSettingText(block.transition ?? 0)}</b> · repos de tour <b class="font-medium text-ink num-stat">${supersetSettingText(block.roundRest ?? 0)}</b></p>`
    : '';
  return `
    <header class="px-5 pt-5 pb-3.5">
      <p class="flex justify-between gap-3 text-[13px] text-mut">
        <span class="min-w-0">${supersetKindLabel(block.indices.length)} · <b class="font-semibold text-ink num-stat">tour ${model.round}</b> sur ${model.rounds}</span>
        ${doneCount}
      </p>
      <h2 class="font-display italic font-medium text-[31px] leading-[1.05] tracking-[-0.01em] text-ink mt-1.5">${names[0]}${names.slice(1).map(n => `<br><span class="text-mut">+ ${n}</span>`).join('')}</h2>
      ${settings}
    </header>
  `;
}

// "2 · A · Développé couché": who line of the band of a group step
function supersetBandWho(model, row) {
  return `${model.round} · ${row.letter} · ${escapeHtml(row.name)}`;
}

// One summary row (mock .lr.sum): a finished round, or the remaining rounds
function supersetSummaryRowHtml(label, text, stateHtml, tone) {
  return `
    <div class="grid grid-cols-[34px_minmax(0,1fr)_auto] gap-x-2 items-baseline min-h-[40px] px-5 py-2.5 border-0 border-solid border-b border-rule text-[14px] ${tone}">
      <span class="text-[12px] text-mut num-stat">${label}</span>
      <span class="truncate num-stat">${escapeHtml(text)}</span>
      ${stateHtml || '<span></span>'}
    </div>
  `;
}

// One row of the current round (mock .lr): round, letter, exercise, kg, reps, planned pause after it
function supersetLogRowHtml(row, roundLabel, stateHtml) {
  const ex = liveSession.exercises[row.exIdx];
  const label = row.actIdx === 0 ? row.name : activityLabel(ex, row.actIdx);
  const num = 'font-mono font-medium text-[17px] leading-none num-stat text-right';
  const values = row.duration === null
    ? `<span class="${num}">${formatKg(row.weight)}</span><span class="${num}">${row.reps}</span>`
    : `<span class="col-span-2 ${num}">${formatRest(row.duration)}</span>`;
  const after = row.after ? formatRest(row.after.seconds) : '';
  return `
    <div class="${SUPERSET_LOG_GRID} min-h-[40px] py-2.5 text-[14px] ${row.state === 'done' ? 'text-ink' : 'text-mut'}">
      <span class="text-[12px] text-mut num-stat">${roundLabel}</span>
      <span class="font-display italic font-bold text-[18px] leading-none">${row.actIdx === 0 ? row.letter : ''}</span>
      <span class="truncate pr-1.5">${escapeHtml(label)}</span>
      ${values}
      ${stateHtml || `<span class="text-right text-[12px] text-mut num-stat">${after}</span>`}
    </div>
  `;
}

// Group logbook (mock .log): finished rounds summed up, the current round row by row
// (`bandHtml(row)` replaces the focused step, `rowAction` overrides one row's last cell), remaining rounds summed up
function supersetLogHtml(model, bandHtml, rowAction = null) {
  const head = `
    <div class="${SUPERSET_LOG_GRID} min-h-[30px] pt-2 pb-1.5 text-[12px] text-mut">
      <span>Tour</span><span></span><span>Exercice</span><span class="text-right">kg</span><span class="text-right">reps</span><span class="text-right">puis</span>
    </div>`;
  const doneCell = '<span class="text-right text-[13px] font-semibold text-done">fait</span>';
  const finished = model.finished.map(f => supersetSummaryRowHtml(f.round, f.text, doneCell, 'text-ink'));
  const current = model.current.map((row, k) => {
    if (row.state === 'focus') return bandHtml(row);
    const action = rowAction && rowAction.exIdx === row.exIdx && rowAction.actIdx === row.actIdx ? rowAction.html : '';
    return supersetLogRowHtml(row, k === 0 ? model.round : '', action);
  });
  const { remaining } = model;
  const rest = remaining
    ? supersetSummaryRowHtml(remaining.from === remaining.to ? remaining.from : `${remaining.from}–${remaining.to}`, remaining.text, '', 'text-mut')
    : '';
  return `<div class="border-0 border-solid border-t-[1.5px] border-ink">${head}${finished.join('')}${current.join('')}${rest}</div>`;
}

// Screen 01 — a step of a group in focus: the group logbook, the step highlighted
function renderSupersetFocus(tab) {
  const { exIdx, sIdx, actIdx } = liveFocus;
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const block = liveSupersetBlock(liveSession.exercises, exIdx);
  const model = supersetRoundLog(liveSession.exercises, block.indices, liveFocus);

  const wrap = exerciseViewWrap(tab);
  wrap.insertAdjacentHTML('beforeend', supersetHeadHtml(block, model, true));

  const log = document.createElement('section');
  log.className = 'mb-6';
  log.innerHTML = supersetLogHtml(model, row =>
    seriesBandHtml(ex, sIdx, actIdx, { action: focusEditButtonHtml(act), who: supersetBandWho(model, row) }));
  wrap.appendChild(log);

  if (act.type === 'weight') wrap.appendChild(weightSuggestionSlot());

  const hint = supersetNextHint(liveSession.exercises, liveFocus)
    ?? (act.type === 'weight' ? nextStepHint(ex, sIdx, actIdx) : '');
  wrap.appendChild(createDock(focusDockHtml(act, hint)));

  tab.appendChild(wrap);

  if (act.type === 'weight') loadWeightSuggestion(ex.name);
  bindFocusActions(exIdx, sIdx, actIdx);
}

// Highlighted countdown block of a pause dock, with its ± buttons
function pauseTimerHtml(label, buttons) {
  return `
    <div class="-mx-4 mb-3 px-4 py-3 bg-hl flex items-center gap-2.5">
      <div class="flex-1 min-w-0">
        <p class="text-[13px] text-ink truncate">${label}</p>
        <p id="rest-split-time" class="font-mono font-semibold text-[42px] leading-none tracking-[-0.04em] num-stat text-ink mt-1">--:--</p>
        <div class="relative h-[3px] bg-ink/15 mt-2" aria-hidden="true"><div id="rest-split-bar" class="absolute left-0 top-0 h-full bg-ink" style="width:100%"></div></div>
      </div>
      ${buttons}
    </div>
  `;
}

function pauseStepButtonHtml(id, label) {
  return `<button id="${id}" class="w-[58px] h-[46px] shrink-0 text-[13px] font-semibold text-center ${OUTLINE_BTN}">${label}</button>`;
}

// Dock of a group pause: highlighted countdown (or stop) + exercise list + the way on
function supersetPauseDockHtml(view, nextWho, nextName, round) {
  const line = (id, label) => `
    <div class="flex gap-2.5">
      ${dockExosButtonHtml()}
      <button id="${id}" class="flex-1 min-w-0 h-14 text-[16px] font-semibold text-center ${OUTLINE_BTN}">${label}</button>
    </div>`;
  if (view === 'transitionStop') {
    return `
      <div class="-mx-4 mb-3 px-4 py-3 bg-hl">
        <p class="text-[13px] text-ink">Va au poste suivant</p>
        <p class="font-display italic font-bold text-[28px] leading-tight text-ink mt-1 truncate">${nextWho}</p>
      </div>
      ${line('transition-ready', "J'y suis")}`;
  }
  if (view === 'transitionCountdown') {
    return pauseTimerHtml(`<span class="font-semibold">Transition</span> · va au ${escapeHtml(nextName.toLowerCase())}`,
      pauseStepButtonHtml('transition-more', '+15 s')) + line('transition-ready', 'Je suis prêt');
  }
  return pauseTimerHtml(`<span class="font-semibold">Repos</span> · fin du tour ${round}`,
    pauseStepButtonHtml('round-rest-less', '−15 s') + pauseStepButtonHtml('round-rest-more', '+15 s'))
    + line('rest-split-skip', 'Passer le repos');
}

// Screens 02, 02b, 03 — transition or round rest: the next step framed, the countdown highlighted
function renderSupersetPause(tab) {
  const { exIdx, sIdx, actIdx, next } = liveRest;
  const nextEx = liveSession.exercises[next.exIdx];
  const block = liveSupersetBlock(liveSession.exercises, exIdx);
  const model = supersetRoundLog(liveSession.exercises, block.indices, next);
  const view = livePauseView(liveRest);

  const wrap = exerciseViewWrap(tab);
  wrap.insertAdjacentHTML('beforeend', supersetHeadHtml(block, model, false));

  // The step just done stays correctable while it is in the round shown
  const doneAct = liveSession.exercises[exIdx].activities[actIdx];
  const fix = sIdx === next.sIdx && doneAct.type !== 'stopwatch'
    ? { exIdx, actIdx, html: '<button id="rest-edit" class="text-right text-[13px] font-semibold text-ink underline underline-offset-4">corriger</button>' }
    : null;
  const log = document.createElement('section');
  log.className = 'mb-6';
  log.innerHTML = supersetLogHtml(model, row =>
    seriesBandHtml(nextEx, next.sIdx, next.actIdx, { prep: true, who: supersetBandWho(model, row) }), fix);
  wrap.appendChild(log);

  const letter = supersetMemberLetter(block.indices.indexOf(next.exIdx));
  const nextWho = `${letter} · ${escapeHtml(nextEx.name)}`;
  wrap.appendChild(createDock(supersetPauseDockHtml(view, nextWho, nextEx.name, sIdx + 1)));
  tab.appendChild(wrap);

  if (view !== 'transitionStop') startRestDockSync();
  bindSupersetPause(exIdx, sIdx, actIdx, next);
}

function bindSupersetPause(exIdx, sIdx, actIdx, next) {
  document.getElementById('dock-exos').addEventListener('click', showExerciseList);
  document.getElementById('rest-edit')?.addEventListener('click', () => openEditModalForActivity(exIdx, sIdx, actIdx));
  document.getElementById('transition-more')?.addEventListener('click', () => adjustCountdown(15));
  document.getElementById('round-rest-more')?.addEventListener('click', () => adjustCountdown(15));
  document.getElementById('round-rest-less')?.addEventListener('click', () => adjustCountdown(-15));
  document.getElementById('transition-ready')?.addEventListener('click', () => {
    stopCountdown();
    focusLiveStep(next);
  });
  document.getElementById('rest-split-skip')?.addEventListener('click', () => {
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

// Réinitialise les maps de timing sur liveSession, en restaurant les durées
// déjà enregistrées si on reprend une séance existante (snapshot localStorage ou row Supabase recomposée).
function initLiveTimingMaps(source) {
  liveSession.exoStartedAt   = {};
  liveSession.exoDurations   = {};
  liveSession.serieStartedAt = {};
  liveSession.serieDurations = {};
  if (!source) return;

  if (source.exoDurations && typeof source.exoDurations === 'object') {
    Object.assign(liveSession.exoDurations, source.exoDurations);
  }
  (source.exercises || []).forEach((ex, exIdx) => {
    if (ex?.duration_seconds != null && liveSession.exoDurations[exIdx] == null) {
      liveSession.exoDurations[exIdx] = ex.duration_seconds;
    }
    (ex?.series || []).forEach((s, sIdx) => {
      if (s?.duration_seconds != null) {
        if (!liveSession.serieDurations[exIdx]) liveSession.serieDurations[exIdx] = {};
        liveSession.serieDurations[exIdx][sIdx] = s.duration_seconds;
      }
    });
  });
}

// Durée réelle d'une séance, source de vérité = valeur saisie quand elle existe.
// Cardio : somme des durées saisies par activité (done.duration en min, fallback ex.duration).
// Fonte  : wall clock (du début de séance à maintenant).
function computeSessionDurationSecs() {
  if (liveSession.category === 'cardio') {
    const totalMin = (liveSession.exercises || []).reduce((acc, ex) => {
      const d = ex.done?.duration ?? ex.duration ?? 0;
      return acc + (Number(d) || 0);
    }, 0);
    return Math.round(totalMin * 60);
  }
  return Math.round((Date.now() - new Date(liveSession.startedAt).getTime()) / 1000);
}

// Stamp les timestamps de début quand l'utilisateur entre dans une (exo, série).
// Idempotent : ne réécrase pas une valeur déjà posée.
function markExoSerieStart(exIdx, sIdx) {
  const now = Date.now();
  if (!liveSession.exoStartedAt[exIdx]) liveSession.exoStartedAt[exIdx] = now;
  if (!liveSession.serieStartedAt[exIdx]) liveSession.serieStartedAt[exIdx] = {};
  if (liveSession.serieStartedAt[exIdx][sIdx] == null) liveSession.serieStartedAt[exIdx][sIdx] = now;
}

function completeFocusedActivity() {
  if (!liveFocus) return;
  const { exIdx, sIdx, actIdx } = liveFocus;
  const ex = liveSession.exercises[exIdx];
  const set = ex.series[sIdx];
  if (!set.activityStates) set.activityStates = {};
  set.activityStates[actIdx] = 'done';

  // Filet de sécurité si l'utilisateur a tapé "done" sans passer par le flow nominal
  markExoSerieStart(exIdx, sIdx);

  // Per-series duration : si tous les actes de CETTE série sont done
  const setAllDone = ex.activities.every((_, a) => set.activityStates?.[a] === 'done');
  if (setAllDone) {
    if (!liveSession.serieDurations[exIdx]) liveSession.serieDurations[exIdx] = {};
    if (liveSession.serieDurations[exIdx][sIdx] == null) {
      const startTs = liveSession.serieStartedAt[exIdx]?.[sIdx] ?? liveSession.exoStartedAt[exIdx];
      liveSession.serieDurations[exIdx][sIdx] = Math.max(1, Math.round((Date.now() - startTs) / 1000));
    }
  }

  const allDone = ex.series.every(s => ex.activities.every((_, a) => s.activityStates?.[a] === 'done'));
  if (allDone && !liveSession.exoDurations[exIdx] && liveExerciseDurationAllowed(liveSession.exercises, exIdx)) {
    liveSession.exoDurations[exIdx] = Math.max(1, Math.round((Date.now() - liveSession.exoStartedAt[exIdx]) / 1000));
  }

  pushSessionSafe(liveSessionSnapshot()).catch(() => {});

  const { next, pause } = nextLiveStep(liveSession.exercises, { exIdx, sIdx, actIdx });

  // Plus aucune étape non faite dans ce bloc → retour à la liste
  if (!next) {
    liveFocus = null;
    liveRest = null;
    stopCountdown();
    renderSeanceScreen();
    return;
  }

  if (pause.kind !== 'rest') {
    startSupersetPause({ exIdx, sIdx, actIdx }, next, pause);
  } else if (pause.seconds > 0) {
    // Mode rest split : chrono mega + recap série juste faite + Modifier
    liveRest = { exIdx, sIdx, actIdx, next };
    liveFocus = null;
    renderSeanceScreen();
    startCountdown(pause.seconds, labelOfActivity(next), () => focusLiveStep(next));
  } else {
    // Pas de repos → direct série suivante
    focusLiveStep(next);
  }
}

// Focus a step of the session and stamp its start
function focusLiveStep(step) {
  liveRest = null;
  liveFocus = step;
  markExoSerieStart(step.exIdx, step.sIdx);
  renderSeanceScreen();
}

// Transition or round rest between two steps of a group (screens 02, 02b, 03)
function startSupersetPause(done, next, pause) {
  const state = { ...done, next, kind: pause.kind, seconds: pause.seconds, stop: false };
  liveRest = { ...state, stop: livePauseView(state) === 'transitionStop' };
  liveFocus = null;
  renderSeanceScreen();
  if (liveRest.stop) { stopCountdown(); return; }
  // A transition always ends on a stop to confirm, never on an automatic focus
  const onFinish = pause.kind === 'roundRest'
    ? () => focusLiveStep(next)
    : () => { liveRest = { ...state, stop: true }; liveFocus = null; renderSeanceScreen(); };
  // Quiet on a transition: the toast would cover the exercise name of screen 02b
  startCountdown(pause.seconds, labelOfActivity(next), onFinish, pause.kind === 'transition');
}

function labelOfActivity({ exIdx, sIdx, actIdx }) {
  const ex = liveSession.exercises[exIdx];
  const parts = [ex.name, `Série ${sIdx + 1}`];
  if (ex.activities.length > 1) parts.push(activityLabel(ex, actIdx));
  return parts.join(' · ');
}

function openEditModalForActivity(exIdx, sIdx, actIdx) {
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const v = ex.series[sIdx].values?.[actIdx] || {};
  if (act.type === 'stopwatch') return;

  const actLabel = act.label || act.name || '';
  const title = actLabel ? `${ex.name} — ${actLabel}` : ex.name;
  const inputCls = 'w-full bg-transparent border-0 border-solid border-b border-rule focus:border-ink font-mono font-semibold text-[26px] num-stat text-ink py-1.5 outline-none transition';
  const labelCls = 'text-[13px] text-mut mb-1';
  const unitCls  = 'text-[13px] text-mut shrink-0';

  if (act.type === 'weight') {
    const currentReps   = v.reps   ?? act.reps   ?? 0;
    const currentWeight = v.weight ?? act.weight ?? 0;
    const currentRest   = act.rest ?? 0;
    const originalWeight = currentWeight;

    const bodyHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="${labelCls}">Poids</p>
          <div class="flex items-baseline gap-2">
            <input type="number" inputmode="decimal" class="live-weight ${inputCls}" value="${currentWeight}" min="0" step="0.5">
            <span class="${unitCls}">kg</span>
          </div>
        </div>
        <div>
          <p class="${labelCls}">Reps</p>
          <div class="flex items-baseline gap-2">
            <input type="number" inputmode="decimal" class="live-reps ${inputCls}" value="${currentReps}" min="1">
            <span class="${unitCls}">×</span>
          </div>
        </div>
      </div>
      <div>
        <p class="${labelCls}">Repos</p>
        <div class="flex items-baseline gap-2">
          <input type="number" inputmode="numeric" class="live-rest ${inputCls}" value="${currentRest}" min="0">
          <span class="${unitCls}">s</span>
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
      pushSessionSafe(liveSessionSnapshot()).catch(() => {});
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

    const bodyHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="${labelCls}">Durée</p>
          <div class="flex items-baseline gap-2">
            <input type="number" inputmode="numeric" class="live-duration ${inputCls}" value="${currentDur}" min="1">
            <span class="${unitCls}">s</span>
          </div>
        </div>
        <div>
          <p class="${labelCls}">Repos</p>
          <div class="flex items-baseline gap-2">
            <input type="number" inputmode="numeric" class="live-rest ${inputCls}" value="${currentRest}" min="0">
            <span class="${unitCls}">s</span>
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
        pushSessionSafe(liveSessionSnapshot()).catch(() => {});
        renderSeanceScreen();
      },
    });
  }
}

function renderLiveCardio(tab) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-5 pb-8 text-ink';

  liveSession.exercises.forEach((ex, exIdx) => {
    const isDone = ex.state === 'done';

    const article = document.createElement('article');
    article.className = 'mb-10';

    // Header — counter + state (mock .kick), italic name (mock .h2), comment
    const header = document.createElement('header');
    header.className = 'px-5 mb-4';
    header.innerHTML = `
      <p class="flex justify-between gap-3 text-[13px] text-mut">
        <span class="min-w-0 num-stat">Exercice <b class="font-semibold text-ink">${exIdx + 1}</b> sur ${liveSession.exercises.length}</span>
        <span class="shrink-0 ${isDone ? 'font-semibold text-done' : ''}">${isDone ? 'fait' : 'à faire'}</span>
      </p>
      <h2 class="font-display italic font-medium text-[31px] leading-[1.05] tracking-[-0.01em] ${isDone ? 'text-mut' : 'text-ink'} mt-1.5">${escapeHtml(ex.name)}</h2>
      ${ex.comment ? `<p class="text-[13px] text-mut mt-2.5">${escapeHtml(ex.comment)}</p>` : ''}
    `;
    article.appendChild(header);

    // Fields — 3 underlined logbook inputs (Temps / Puissance / Distance)
    const fields = document.createElement('div');
    fields.className = 'grid grid-cols-3 gap-4 px-5 pt-3 border-0 border-solid border-t-[1.5px] border-ink';

    const makeField = (label, unit, value, type, step, onChange) => {
      const wrap = document.createElement('label');
      wrap.className = 'block min-w-0';
      wrap.innerHTML = `
        <span class="block text-[12px] text-mut mb-1.5">${label}</span>
        <span class="flex items-baseline gap-1 pb-1.5 border-0 border-solid border-b border-rule focus-within:border-ink">
          <input type="number" inputmode="${type}" ${step ? `step="${step}"` : ''} min="0" value="${value || ''}"
            class="font-mono font-semibold text-[26px] leading-none tracking-[-0.03em] num-stat text-ink bg-transparent w-full min-w-0 outline-none" />
          <span class="text-[13px] text-mut shrink-0">${unit}</span>
        </span>
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

    // Previous session — mono figures, muted
    if (ex.prev) {
      const parts = [
        `${ex.prev.duration || '—'} min`,
        `${ex.prev.power || '—'} W`,
      ];
      if (ex.prev.km) parts.push(`${formatKg(ex.prev.km)} km`);
      const prev = document.createElement('p');
      prev.className = 'text-[13px] text-mut num-stat mt-3 px-5';
      prev.textContent = `Préc. : ${parts.join(' · ')}`;
      article.appendChild(prev);
    }

    // State btn — solid ink to validate, outlined in done once done
    const btnWrap = document.createElement('div');
    btnWrap.className = 'mt-4 px-5';
    const stateBtn = document.createElement('button');
    const refreshStateBtn = () => {
      const done = ex.state === 'done';
      stateBtn.className = done
        ? 'w-full h-14 border-[1.5px] border-solid border-done rounded text-done text-[16px] font-semibold active:bg-done/10 transition'
        : 'w-full h-14 bg-ink text-paper rounded text-[16px] font-semibold active:bg-ink/80 transition';
      stateBtn.textContent = done ? '✓ Fait' : '✓ Valider';
    };
    refreshStateBtn();
    stateBtn.addEventListener('click', () => {
      ex.state = ex.state === 'done' ? 'pending' : 'done';
      refreshStateBtn();
      pushSessionSafe(liveSessionSnapshot()).catch(() => {});
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
    const progIdx = programmeIndexOf(prog?.exercises || [], liveSession.exercises, exIdx);
    if (!prog?.exercises[progIdx]?.activities?.[actIdx]) return;
    prog.exercises[progIdx].activities[actIdx][field] = val;
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
    liveSession.exercises.forEach((ex, exIdx) => {
      if (!liveSession.exoDurations[exIdx] && liveSession.exoStartedAt[exIdx] && liveExerciseDurationAllowed(liveSession.exercises, exIdx)) {
        liveSession.exoDurations[exIdx] = Math.max(1, Math.round((Date.now() - liveSession.exoStartedAt[exIdx]) / 1000));
      }
    });
    const durationSecs = computeSessionDurationSecs();
    const snapshot = liveSessionSnapshot(durationSecs);
    try {
      await pushSessionSafe(snapshot);
      clearSnapshotLocal(snapshot.id);
    } catch (_) {
      // Réseau KO : on garde le backup local, sera repush au prochain init
    }

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
    closeLiveGroupingSheets();
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
  syncPollTimer = setInterval(syncFromDBOnce, 500);
}

function stopSyncPolling() {
  if (syncPollTimer) { clearInterval(syncPollTimer); syncPollTimer = null; }
}

const syncFromDBOnce = createSingleFlight(syncFromDB);

async function syncFromDB() {
  if (!liveSession) return;
  try {
    const requestedAt = Date.now();
    const sessions = await loadSessions();
    // Local push pending or newer than this read: the phone wins.
    if (!liveSession || !localWrites.isRemoteFresh(requestedAt)) return;
    const remote = sessions.find(s => s.id === liveSession.id);
    if (!remote) return;

    // Session terminee sur la montre ?
    if (remote.duration && remote.duration > 0) {
      liveSession = null;
      liveFocus = null;
      liveRest = null;
      closeLiveGroupingSheets();
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
let countdownQuiet = false;
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

function startCountdown(seconds, nextLabel, onFinish, quiet = false) {
  stopCountdown();
  if (!seconds || seconds <= 0) {
    if (onFinish) onFinish();
    return;
  }
  countdownSecs     = seconds;
  countdownTotal    = seconds;
  countdownOnFinish = onFinish;
  countdownQuiet    = quiet;

  // Sync countdown to watch
  if (liveSession) {
    liveSession.sync = { type: 'rest', startedAt: new Date().toISOString(), duration: seconds, label: nextLabel || '' };
    pushSessionSafe(liveSessionSnapshot()).catch(() => {});
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
        if (countdownSecs === 5 && !countdownQuiet) showToast('Prenez place !');
      }
      updateCountdownUI();
    }
  }, 1000);
}

// ±15 s buttons of the superset pauses: shifts the running countdown and the watch sync
function adjustCountdown(delta) {
  if (!countdownTimer) return;
  countdownSecs = Math.max(0, countdownSecs + delta);
  if (countdownSecs > countdownTotal) countdownTotal = countdownSecs;
  if (liveSession?.sync?.type === 'rest') {
    liveSession.sync.duration = Math.max(0, liveSession.sync.duration + delta);
    pushSessionSafe(liveSessionSnapshot()).catch(() => {});
  }
  if (countdownSecs === 0) { finishCountdown(); return; }
  updateCountdownUI();
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
  const quiet = countdownQuiet;
  stopCountdown();
  if (!quiet) showToast(randomFrom(goMessages()));
  if (fn) fn();
}

function stopCountdown() {
  clearInterval(countdownTimer);
  countdownTimer    = null;
  countdownOnFinish = null;
  countdownQuiet    = false;
  const bar = document.getElementById('countdown-bar');
  bar.classList.add('hidden');
  bar.classList.remove('urgent');
  if (liveSession?.sync?.type === 'rest') {
    liveSession.sync = null;
    pushSessionSafe(liveSessionSnapshot()).catch(() => {});
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
  if (pct < 10) return { label: 'Très maigre' };
  if (pct < 18) return { label: 'Athlétique' };
  if (pct < 25) return { label: 'Normal' };
  if (pct < 30) return { label: 'Élevé' };
  return           { label: 'Obèse' };
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
  masthead.className = 'px-5 pt-8 pb-6';
  masthead.innerHTML = `
    <h1 class="font-display font-medium text-[52px] leading-[0.95] tracking-[-0.02em] text-ink">Ton <em class="text-mut">corps.</em></h1>
  `;
  body.appendChild(masthead);

  const measurements = await loadBodyMeasurementsDB();

  // Formulaire
  const form = document.createElement('div');
  form.className = 'px-5 pb-6';

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
  dateRow.innerHTML = `<p class="font-sans text-[13px] text-mut">Jour</p>`;
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = todayIso();
  dateInput.className = 'flex-1 min-w-0 h-11 bg-paper border border-solid border-rule rounded focus:border-ink focus:ring-0 focus:outline-none font-mono text-[15px] text-ink px-3';
  dateRow.appendChild(dateInput);
  form.appendChild(dateRow);

  // Grid 2 cols
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-2 gap-x-3 gap-y-4';

  const inputs = {};
  const diffSpans = {};
  const DIFF_CLS = 'shrink-0 font-mono text-[12px] num-stat';
  fields.forEach(({ key, label, unit, step }) => {
    const cell = document.createElement('div');
    cell.className = 'min-w-0';
    const lbl = document.createElement('p');
    lbl.className = 'font-sans text-[12px] text-mut mb-1.5';
    lbl.textContent = label;
    const row = document.createElement('div');
    row.className = 'flex items-baseline gap-1.5 px-3 bg-paper border border-solid border-rule rounded focus-within:border-ink transition';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.inputMode = 'decimal';
    inp.step = step;
    inp.min = '0';
    inp.placeholder = '—';
    inp.className = 'flex-1 min-w-0 bg-transparent font-mono text-[20px] num-stat text-ink py-2 outline-none';
    inputs[key] = inp;
    const unitSpan = document.createElement('span');
    unitSpan.className = 'font-sans text-[13px] text-mut shrink-0';
    unitSpan.textContent = unit;
    row.append(inp, unitSpan);
    if (key === 'poids' || key === 'graisseKg') {
      const diff = document.createElement('span');
      diff.className = DIFF_CLS;
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
    span.className = DIFF_CLS;
    const dbKey = formKey === 'graisseKg' ? 'graisse_kg' : formKey;
    const cur = current?.[dbKey];
    const prv = prev?.[dbKey];
    if (cur == null || prv == null) return;
    const delta = +(cur - prv).toFixed(1);
    if (delta === 0) return;
    span.textContent = (delta > 0 ? '+' : '') + formatKg(delta);
    // Weight / fat: up = alert (worse), down = done (better)
    span.classList.add(delta > 0 ? 'text-alert' : 'text-done');
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
  saveBtn.className = 'w-full mt-6 h-14 bg-ink text-paper rounded font-sans text-[16px] font-semibold active:bg-ink/80 transition';
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
    empty.className = 'px-5 pt-4 font-display italic text-[20px] text-mut';
    empty.textContent = 'Aucune mesure enregistrée.';
    body.appendChild(empty);
    return;
  }

  // ── Trend strip ───────────────────────────────────────
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
      <header class="px-5 pb-2">
        <h2 class="font-display italic font-medium text-[22px] leading-tight text-ink">Tendance</h2>
        <p class="font-sans text-[13px] text-mut mt-1">10 dernières mesures · variation hebdo</p>
      </header>
    `;
    const grid4 = document.createElement('div');
    grid4.className = 'grid grid-cols-2 border-0 border-solid border-t-[1.5px] border-ink border-b border-b-rule';
    const lastRow = Math.floor((trendItems.length - 1) / 2);

    trendItems.forEach(({ label, field, unit, lowerIsBetter, latest, trend }, idx) => {
      const cell = document.createElement('div');
      const borderR = (idx % 2 === 0) ? 'border-r' : '';
      const borderB = (Math.floor(idx / 2) < lastRow) ? 'border-b' : '';
      cell.className = `px-5 py-3 min-w-0 border-0 border-solid border-rule ${borderR} ${borderB}`;

      let arrow = '';
      let arrowColor = 'text-mut';
      if (trend && !trend.neutral) {
        arrow = trend.up ? `↑ ${formatKg(trend.delta)}/sem` : `↓ ${formatKg(trend.delta)}/sem`;
        let positive;
        if (field === 'poids' && trend.up && trendGraisse && !trendGraisse.neutral && !trendGraisse.up) {
          positive = true;
        } else {
          positive = lowerIsBetter ? !trend.up : trend.up;
        }
        arrowColor = positive ? 'text-done' : 'text-alert';
      } else if (trend?.neutral) {
        arrow = '→ stable';
        arrowColor = 'text-mut';
      }

      // Fat category: plain mut text next to the label
      const cat = field === 'img' ? fatCategory(latest) : null;
      const catText = cat ? ` · ${cat.label}` : '';

      cell.innerHTML = `
        <p class="font-sans text-[12px] text-mut truncate">${label}${catText}</p>
        <p class="font-mono text-[20px] leading-none num-stat text-ink truncate mt-1.5">${formatKg(latest)}<span class="font-sans text-[13px] text-mut ml-1">${unit}</span></p>
        ${arrow ? `<p class="font-mono text-[12px] num-stat ${arrowColor} mt-1.5">${arrow}</p>` : ''}
      `;
      grid4.appendChild(cell);
    });
    trendSection.appendChild(grid4);
    body.appendChild(trendSection);
  }

  // ── Curves (weight, fat %, water, muscle) ─────────────
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
      <header class="pb-2 mb-3 flex items-baseline justify-between gap-3 border-0 border-solid border-b-[1.5px] border-ink">
        <h3 class="font-display italic font-bold text-[20px] leading-tight text-ink">${label}</h3>
        <span class="font-mono text-[14px] num-stat text-ink whitespace-nowrap">${formatKg(chartData[chartData.length - 1][field])}<span class="font-sans text-[13px] text-mut ml-1">${unit}</span></span>
      </header>
    `;
    const canvas = document.createElement('canvas');
    canvas.className = 'block w-full h-[120px]';
    chartWrap.appendChild(canvas);
    body.appendChild(chartWrap);
    requestAnimationFrame(() => drawCorpsChart(canvas, chartData, field, unit));
  });

  // ── Body analysis (shown only if already generated in this tab) ──
  if (bodyAnalysisCache !== null) {
    const analysisCard = document.createElement('div');
    analysisCard.className = 'mx-5 mb-8';
    analysisCard.innerHTML = feedbackCard('Ton évolution', formatFeedback(bodyAnalysisCache));
    body.appendChild(analysisCard);
  }

  // ── Historique ────────────────────────────────────────
  const histSection = document.createElement('section');
  histSection.className = 'mt-12';
  histSection.innerHTML = `
    <header class="px-5 pb-4">
      <h2 class="font-display font-medium text-[40px] leading-[0.95] tracking-[-0.02em] text-ink">Tes <em class="text-mut">mesures.</em></h2>
      <p class="font-sans text-[13px] text-mut mt-3 num-stat"><span class="font-mono text-ink">${measurements.length}</span> entrée${measurements.length > 1 ? 's' : ''}</p>
    </header>
  `;
  body.appendChild(histSection);

  // Logbook (mock .log / .lr): ink rule on top, one rule-lined row per measurement
  const log = document.createElement('ul');
  log.className = 'list-none border-0 border-solid border-t-[1.5px] border-ink';
  histSection.appendChild(log);

  measurements.forEach(m => {
    const card = document.createElement('li');
    card.className = 'px-5 py-3 border-0 border-solid border-b border-rule';

    const header = document.createElement('div');
    header.className = 'flex items-baseline justify-between gap-3';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'font-mono text-[14px] num-stat text-ink';
    dateSpan.textContent = formatDate(m.date);
    const delBtn = document.createElement('button');
    delBtn.className = 'font-sans text-[13px] text-mut active:text-alert transition';
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
      const badge = document.createElement('p');
      badge.className = 'font-sans text-[13px] text-mut mt-0.5';
      badge.textContent = `Graisse ${formatKg(grPct)}\u202F% — ${cat.label}`;
      card.appendChild(badge);
    }

    const values = document.createElement('div');
    values.className = 'flex flex-wrap gap-x-4 gap-y-1 mt-1.5';
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
      chip.className = 'font-sans text-[13px] text-mut whitespace-nowrap';
      chip.innerHTML = `${label} <span class="font-mono text-[14px] text-ink num-stat">${formatKg(value)}</span>\u202F${unit}`;
      values.appendChild(chip);
    });

    card.appendChild(values);
    log.appendChild(card);
  });
}

function openBodyAnalysisPopupLoading() {
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = `
    <div id="body-analysis-popup" class="px-5 pt-5 pb-10 text-ink font-sans">
      <p class="pr-16 text-[13px] text-mut leading-[40px]">Ton évolution</p>
      <h2 class="font-display font-medium text-[52px] leading-[0.95] tracking-[-0.02em] text-ink mt-3">Analyse <em class="text-mut">en cours.</em></h2>
      <div class="flex items-center gap-2 mt-8 text-[13px] text-mut">
        <div class="live-edit-suggestion-spinner"></div>
        <p>Patiente…</p>
      </div>
    </div>
  `;
  showModalSheet();
}

function fillBodyAnalysisPopup(text) {
  const popup = document.getElementById('body-analysis-popup');
  if (!popup) return;
  popup.innerHTML = `
    <p class="pr-16 text-[13px] text-mut leading-[40px]">Ton évolution</p>
    <h2 class="font-display font-medium text-[52px] leading-[0.95] tracking-[-0.02em] text-ink mt-3">Le <em class="text-mut">bilan.</em></h2>
    <div class="mt-8 pt-3 border-0 border-solid border-t-[1.5px] border-ink text-[15px] leading-relaxed text-ink break-words">${formatFeedback(text)}</div>
  `;
}

function closeBodyAnalysisPopup() {
  const popup = document.getElementById('body-analysis-popup');
  if (popup) document.getElementById('modal').classList.add('hidden');
}

function drawCorpsChart(canvas, data, field, unit) {
  const C_RULE = carnetColor('rule');
  const C_MUT  = carnetColor('mut');
  const C_INK  = carnetColor('ink');
  const FONT   = '12px "IBM Plex Mono", monospace';

  // Bitmap at the rendered size × device pixel ratio; drawing in CSS pixels
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 340, H = canvas.clientHeight || 120;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const pad = { top: 10, right: 10, bottom: 24, left: 48 };
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

  // Grid
  ctx.strokeStyle = C_RULE;
  ctx.lineWidth = 1;
  [0, 0.5, 1].forEach(t => {
    const y = pad.top + iH * (1 - t);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = C_MUT;
    ctx.font = FONT;
    ctx.textAlign = 'right';
    ctx.fillText(formatKg((minV + t * (maxV - minV)).toFixed(1)), pad.left - 6, y + 4);
  });

  // Line
  ctx.beginPath();
  ctx.strokeStyle = C_INK;
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
    ctx.fillStyle = C_INK;
    ctx.fill();

    if (i === 0 || i === data.length - 1) {
      ctx.fillStyle = C_MUT;
      ctx.font = FONT;
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(shortDayMonth(m.date), xOf(i), H - 4);
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
      <p class="px-5 pt-12 font-display italic text-[20px] text-mut">
        Aucune séance enregistrée.
      </p>
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
  masthead.className = 'px-5 pt-8 pb-7';
  masthead.innerHTML = `
    <h1 class="font-display font-medium text-[52px] leading-[0.95] tracking-[-0.02em] text-ink">Tes <em class="text-mut">séances.</em></h1>
    <p class="font-sans text-[13px] text-mut mt-3 num-stat">
      <span class="font-mono text-ink">${totalSessions}</span> séances · <span class="font-mono text-ink">${totalExos}</span> exercices · <span class="font-mono text-ink">${totalTon}</span> t cumulées
    </p>
  `;
  list.appendChild(masthead);

  // Exactly one highlighter on screen: the most recent session still in progress
  const markedSession = sessions.find(s => !s.duration);

  // Groupes mois
  [...groups.entries()].forEach(([monthKey, monthSessions]) => {
    const section = document.createElement('section');
    section.className = 'mb-8';

    const monthHeader = document.createElement('header');
    monthHeader.className = 'flex items-baseline justify-between gap-3 px-5 pb-2';
    const monthVol = monthSessions.reduce((s, x) => s + totalVolume(x.exercises), 0);
    monthHeader.innerHTML = `
      <h2 class="font-display italic font-medium text-[22px] leading-tight text-ink first-letter:uppercase">${monthLabel(monthKey)}</h2>
      ${monthVol > 0 ? `<span class="font-mono text-[14px] text-ink num-stat whitespace-nowrap">${(monthVol / 1000).toFixed(1).replace('.', ',')} t</span>` : ''}
    `;
    section.appendChild(monthHeader);

    const ul = document.createElement('ul');
    ul.className = 'list-none border-0 border-solid border-t-[1.5px] border-ink';

    monthSessions.forEach((session) => {
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

      const name = session.programmeName || session.name || 'Séance';
      const nameHtml = session === markedSession ? `<span class="mark">${escapeHtml(name)}</span>` : escapeHtml(name);
      const volume = done > 0
        ? `<span class="font-mono text-[14px] text-ink num-stat whitespace-nowrap">${done.toLocaleString('fr-FR')}\u202Fkg</span>`
        : `<span class="font-mono text-[14px] text-mut">—</span>`;
      const li = document.createElement('li');
      li.innerHTML = `
        <button class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-baseline w-full text-left px-5 py-3 border-0 border-solid border-b border-rule active:bg-sheet transition">
          <span class="block font-display font-bold italic text-[20px] leading-[1.15] text-ink truncate">${nameHtml}</span>
          ${volume}
          <p class="font-sans text-[13px] text-mut num-stat">
            ${formatDate(session.date)}
            · ${session.duration ? formatDuration(session.duration) : `<span class="font-semibold text-ink">En cours</span>`}
            · ${session.exercises.length} exo${session.exercises.length > 1 ? 's' : ''}
          </p>
          ${reps > 0 ? `<span class="font-sans text-[13px] text-mut num-stat text-right whitespace-nowrap">${reps}\u202Freps</span>` : ''}
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
    exercises:     restoreLiveExercises(session.exercises, session.category, migrateExercise),
  };
  initLiveTimingMaps(session);
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

  const stat = (label, value, unit, last = false) => `
    <div class="px-5 py-3 min-w-0 ${last ? '' : 'border-0 border-solid border-r border-rule'}">
      <p class="font-sans text-[12px] text-mut">${label}</p>
      <p class="font-mono text-[20px] leading-none num-stat text-ink truncate mt-1.5">${value}${unit ? `<span class="font-sans text-[13px] text-mut ml-1">${unit}</span>` : ''}</p>
    </div>`;

  // Status row + masthead H1 split + stats strip
  let html = `
    <p class="px-5 pt-5 pr-20 font-sans text-[13px] text-mut num-stat leading-[40px]">
      ${formatDate(session.date)}${session.startedAt ? ` · ${formatTime(session.startedAt)}` : ''}
      · ${session.duration ? formatDuration(session.duration) : `<span class="font-semibold text-ink">En cours</span>`}
    </p>

    <section class="px-5 pt-3 pb-6">
      <h1 class="font-display font-medium leading-[0.95] tracking-[-0.02em] text-ink break-words" style="font-size:clamp(2.5rem, 12vw, 3.25rem)">
        ${escapeHtml(line1)}${sep ? ` <em class="text-mut">${escapeHtml(sep)} ${escapeHtml(rest)}.</em>` : ''}
      </h1>
    </section>

    <div class="grid grid-cols-3 border-0 border-solid border-t-[1.5px] border-ink border-b border-b-rule">
      ${stat('Volume', done.toLocaleString('fr-FR'), 'kg')}
      ${stat('Tonnage', tonnage, 't')}
      ${stat('Reps', totalRepsDone.toLocaleString('fr-FR'), '', true)}
    </div>
  `;

  // Exercices — logbook per exercise (mock .log / .lr)
  const cols = 'grid grid-cols-[30px_minmax(0,1fr)_52px_34px_66px] items-baseline px-5 border-0 border-solid border-b border-rule';
  session.exercises.forEach(ex => {
    const e = migrateExercise(ex);
    const muscle = e.activities?.[0]?.name || '';
    const hasWeight = (e.activities || []).some(a => a.type === 'weight');
    html += `
      <article class="mt-8">
        <header class="px-5 pb-2">
          <h2 class="font-display italic font-bold text-[22px] leading-[1.15] text-ink">${escapeHtml(e.name)}</h2>
          ${muscle ? `<p class="font-sans text-[13px] text-mut mt-0.5">${escapeHtml(muscle)}</p>` : ''}
        </header>
        <div class="border-0 border-solid border-t-[1.5px] border-ink">
          <div class="${cols} min-h-[30px] pt-2 pb-1.5 text-[12px] text-mut">
            <span>Série</span><span></span>
            ${hasWeight ? '<span class="text-right">kg</span><span class="text-right">reps</span>' : '<span class="col-span-2 text-right">durée</span>'}
            <span class="text-right">repos</span>
          </div>
          ${(e.series || []).map((s, i) => {
            const allDone = (e.activities || []).every((_, a) => s.activityStates?.[a] === 'done' || s.done !== false);
            const rowColor = allDone ? 'text-ink' : 'text-mut';
            const restColor = allDone ? 'text-done font-semibold' : 'text-mut';
            return e.activities.map((act, j) => {
              const v = s.values?.[j] || {};
              const isWeight = act.type === 'weight';
              const num = 'font-mono font-medium text-[17px] leading-none num-stat text-right';
              const values = isWeight
                ? `<span class="${num}">${v.weight != null ? formatKg(v.weight) : '—'}</span><span class="${num}">${v.reps ?? '—'}</span>`
                : `<span class="col-span-2 ${num}">${v.duration ?? '—'} s</span>`;
              const label = isWeight
                ? (e.activities.length > 1 ? act.label || act.name || '' : '')
                : (act.label || act.name || '—');
              const restSecs = act.rest || 0;
              const restLabel = restSecs > 0 ? `${Math.floor(restSecs / 60)}:${String(restSecs % 60).padStart(2, '0')}` : '—';
              return `
                <div class="${cols} min-h-[40px] py-2.5 text-[14px] ${rowColor}">
                  <span class="text-[12px] text-mut num-stat">${j === 0 ? i + 1 : ''}</span>
                  <span class="truncate pr-1.5">${escapeHtml(label)}</span>
                  ${values}
                  <span class="text-right text-[13px] num-stat ${restColor}">${restLabel}</span>
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
    html += `<div class="px-5 mt-10">${feedbackCard('Feedback IA', formatFeedback(session.feedbackIa))}</div>`;
  } else if (!isAbandoned) {
    html += `
      <div class="px-5 mt-10" id="feedback-ia-generate-wrap">
        <button id="feedback-ia-generate" class="w-full min-h-14 px-4 py-3 border-[1.5px] border-solid border-ink rounded font-sans text-[16px] font-semibold text-ink active:bg-paper disabled:border-rule disabled:text-mut transition">Générer l'analyse IA</button>
      </div>
    `;
  }

  // Footer actions
  html += `
    <div class="px-5 mt-10 mb-8 grid gap-2">
      ${isAbandoned ? `<button id="resume-session" class="h-14 bg-ink text-paper rounded font-sans text-[16px] font-semibold active:opacity-80 transition">Reprendre</button>` : ''}
      <button id="delete-session" class="h-12 font-sans text-[15px] font-semibold text-alert active:opacity-60 transition">Supprimer</button>
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
    } else {
      generateBtn.addEventListener('click', async () => {
        const wrap = document.getElementById('feedback-ia-generate-wrap');
        wrap.innerHTML = feedbackCard('Feedback IA', `
          <div class="flex items-center gap-2 text-[13px] text-mut">
            <div class="live-edit-suggestion-spinner"></div>
            <p>Analyse en cours…</p>
          </div>
        `);
        try {
          const feedback = await generateAndPersistFeedback(session);
          session.feedbackIa = feedback;
          wrap.outerHTML = `<div class="px-5 mt-10">${feedbackCard('Feedback IA', formatFeedback(feedback))}</div>`;
        } catch (e) {
          wrap.innerHTML = feedbackCard('Erreur', escapeHtml(e.message), 'text-alert');
        }
      });
    }
  }

  showModalSheet();
}

// Every opener of the shared full-screen sheet starts at the top
function showModalSheet() {
  document.querySelector('#modal .modal-content').scrollTop = 0;
  document.getElementById('modal').classList.remove('hidden');
}

// "2026-08-18" -> "18/08"
function shortDayMonth(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModal);

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

  const body = document.getElementById('modal-body');

  const name = session.programmeName || session.name || 'Séance';
  const vol = totalVolume(session.exercises);
  const durStr = session.duration ? formatDuration(session.duration) : '';
  // Carnet sheet inside the modal shell (which draws the top rule)
  const sheet = (content) => `
    <div class="feedback-ia-modal bg-sheet text-ink font-sans px-5 pt-14 pb-10">
      <p class="text-[13px] text-mut">Fin de séance</p>
      <h2 class="font-display italic font-bold text-[28px] leading-[1.1] text-ink mt-1">${escapeHtml(name)}</h2>
      ${content}
    </div>
  `;
  const meta = `<p class="text-[13px] text-mut mt-2 num-stat">${formatDate(session.date)}${durStr ? ' · ' + durStr : ''} · <span class="font-mono text-ink">${vol.toLocaleString('fr-FR')}</span> kg</p>`;
  const card = (title, content, titleCls) => `<div class="mt-5">${feedbackCard(title, content, titleCls)}</div>`;

  body.innerHTML = sheet(`
    ${meta}
    <div class="flex items-center gap-2 mt-5 text-[13px] text-mut">
      <div class="live-edit-suggestion-spinner"></div>
      <p>Analyse en cours...</p>
    </div>
  `);
  showModalSheet();

  try {
    const feedback = await generateAndPersistFeedback(session);
    body.innerHTML = sheet(`${meta}${card('Feedback IA', formatFeedback(feedback), 'text-ink')}`);
  } catch (e) {
    body.innerHTML = sheet(card('Erreur', escapeHtml(e.message), 'text-alert'));
  }
}

// AI feedback block (Carnet): rule on top, 13 px title, 15 px text that wraps
function feedbackCard(title, content, titleCls = 'text-ink') {
  return `
    <div class="pt-3 border-0 border-solid border-t-[1.5px] border-ink">
      <p class="font-sans text-[13px] font-semibold ${titleCls}">${title}</p>
      <div class="font-sans text-[15px] leading-relaxed text-ink mt-2 break-words">${content}</div>
    </div>
  `;
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
  return escapeHtml(text)
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
    { slot: 'pre_gym',  label: 'Petit-dej avant salle' },
    { slot: 'post_gym', label: 'Petit-dej après salle' },
  ];

  for (const { slot, label } of slots) {
    const preset = bySlot[slot] || null;
    const row = document.createElement('div');
    row.className = 'flex items-stretch gap-2 mb-2';

    const mainBtn = document.createElement('button');
    mainBtn.className = 'flex-1 min-h-12 px-4 py-2.5 border-[1.5px] border-solid border-ink rounded font-sans text-[15px] font-semibold text-ink text-left active:bg-sheet transition';
    mainBtn.textContent = label;

    const editBtn = document.createElement('button');
    editBtn.className = 'shrink-0 w-12 border-[1.5px] border-solid border-ink rounded font-sans text-[18px] text-ink active:bg-sheet transition';
    editBtn.setAttribute('aria-label', 'Modifier');
    editBtn.textContent = '⚙\uFE0E';
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
    <p class="px-5 pt-12 font-display italic text-[20px] text-mut">Chargement…</p>
  `;

  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) {
    body.innerHTML = `
      <section class="px-5 pt-8 pb-7">
        <h1 class="font-display font-medium text-[52px] leading-[0.95] tracking-[-0.02em] text-ink">Clé <em class="text-mut">manquante.</em></h1>
        <p class="font-sans text-[13px] text-mut mt-3">Configure ta clé API Claude pour activer le suivi</p>
      </section>
      <div class="px-5">
        <button id="alim-go-key" class="w-full h-14 bg-ink text-paper rounded font-sans text-[16px] font-semibold active:bg-ink/80 transition">→ Configurer la clé</button>
      </div>
    `;
    document.getElementById('alim-go-key').addEventListener('click', () => showScreen('claude-api'));
    return;
  }

  body.innerHTML = '';

  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-8 pb-6';
  masthead.innerHTML = `
    <h1 class="font-display font-medium text-[52px] leading-[0.95] tracking-[-0.02em] text-ink">Ton <em class="text-mut">assiette.</em></h1>
  `;
  body.appendChild(masthead);

  // Day navigation: the date field drives every block below
  const dateRow = document.createElement('div');
  dateRow.className = 'px-5 mb-5 flex items-center gap-3';
  dateRow.innerHTML = `<p class="font-sans text-[13px] text-mut">Jour</p>`;
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = todayIso();
  dateInput.className = 'flex-1 min-w-0 h-11 bg-paper border border-solid border-rule rounded focus:border-ink focus:ring-0 focus:outline-none font-mono text-[15px] text-ink px-3';
  dateRow.appendChild(dateInput);
  body.appendChild(dateRow);

  // Day balance
  const bilanCard = document.createElement('div');
  bilanCard.id = 'alim-bilan';
  body.appendChild(bilanCard);

  // Preset buttons (petit-dej avant/après salle)
  const presetContainer = document.createElement('div');
  presetContainer.className = 'px-5 mt-8';
  body.appendChild(presetContainer);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'px-5 mt-3 grid grid-cols-2 gap-2.5';
  body.appendChild(actions);

  const lineBtnCls = 'min-h-14 px-3 py-2 border-[1.5px] border-solid border-ink rounded font-sans text-[15px] font-semibold leading-tight text-ink active:bg-sheet transition';

  const addBtn = document.createElement('button');
  addBtn.className = 'col-span-2 h-14 bg-ink text-paper rounded font-sans text-[16px] font-semibold active:bg-ink/80 transition';
  addBtn.textContent = '+ Ajouter un repas';
  actions.appendChild(addBtn);

  const adviceBtn = document.createElement('button');
  adviceBtn.className = lineBtnCls;
  adviceBtn.textContent = 'Conseil pour ce soir';
  actions.appendChild(adviceBtn);

  const askBtn = document.createElement('button');
  askBtn.className = lineBtnCls;
  askBtn.textContent = 'Poser une question';
  actions.appendChild(askBtn);

  // Timeline section
  const timelineSec = document.createElement('section');
  timelineSec.className = 'mt-10';
  const timelineHdr = document.createElement('header');
  timelineHdr.className = 'px-5 pb-2';
  timelineHdr.innerHTML = `
    <h2 class="font-display italic font-medium text-[22px] leading-tight text-ink">Timeline</h2>
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
      bmrNote = `<p class="font-sans text-[13px] text-mut px-5 mt-3">Configure taille / âge / sexe / activité dans Profil</p>`;
    }

    const net = apports - depenses - bmrToday;
    const netColor = net > 200 ? 'text-alert' : net < -200 ? 'text-done' : 'text-ink';
    const hasMeal = entries.some(e => e.type === 'meal');
    const hasBurn = entries.some(e => e.type === 'session_burn');

    // A dash instead of a misleading 0 when nothing is known yet
    const dash = `<span class="font-mono text-[22px] text-mut leading-none">—</span>`;
    const kcal = (value, cls = 'text-ink') => `<span class="font-mono text-[22px] num-stat ${cls} leading-none">${value}</span><span class="font-sans text-[13px] text-mut ml-1">kcal</span>`;
    const cell = (label, value, cls = '') => `
      <div class="px-5 py-3 min-w-0 ${cls}">
        <p class="font-sans text-[13px] text-mut mb-1.5 truncate">${label}</p>
        <p class="whitespace-nowrap">${value}</p>
      </div>`;
    const macro = (label, grams) => `<span class="whitespace-nowrap"><span class="text-mut">${label}</span> ${hasMeal ? `<span class="font-mono text-ink num-stat">${Math.round(grams)}</span><span class="text-mut"> g</span>` : `<span class="font-mono text-mut">—</span>`}</span>`;

    bilanCard.innerHTML = `
      <div class="grid grid-cols-2 border-0 border-solid border-t-[1.5px] border-b border-t-ink border-b-rule">
        ${cell('Apports', hasMeal ? kcal(Math.round(apports)) : dash, 'border-0 border-solid border-r border-b border-rule')}
        ${cell(bmrLabel, bmr ? kcal(Math.round(bmrToday)) : dash, 'border-0 border-solid border-b border-rule')}
        ${cell('Dépenses', hasBurn ? kcal(Math.round(depenses)) : dash, 'border-0 border-solid border-r border-rule')}
        ${cell('Net', (hasMeal || hasBurn) ? kcal(`${net >= 0 ? '+' : ''}${Math.round(net)}`, netColor) : dash)}
      </div>
      ${bmrNote}
      <p class="flex flex-wrap gap-x-4 gap-y-1 px-5 mt-3 font-sans text-[13px]">
        ${macro('Prot', totP)}${macro('Gluc', totG)}${macro('Lip', totL)}
      </p>
      ${(depFonte > 0 || depCardio > 0) ? `
        <p class="flex flex-wrap gap-x-4 px-5 mt-1.5 font-sans text-[13px] text-mut">
          ${depFonte > 0  ? `<span>↳ Fonte <span class="font-mono text-ink num-stat">${Math.round(depFonte)}</span> kcal</span>` : ''}
          ${depCardio > 0 ? `<span>↳ Cardio <span class="font-mono text-ink num-stat">${Math.round(depCardio)}</span> kcal</span>` : ''}
        </p>` : ''}
    `;

    // Timeline
    timeline.innerHTML = '';
    if (!entries.length) {
      timeline.innerHTML = `
        <p class="px-5 py-4 border-0 border-solid border-t-[1.5px] border-ink font-display italic text-[20px] text-mut">Aucune entrée pour ce jour.</p>
      `;
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'list-none border-0 border-solid border-t-[1.5px] border-ink';

    entries.forEach((e) => {
      const isMeal  = e.type === 'meal';
      const arrow = isMeal ? '↑' : '↓';
      const time = (e.time || '').slice(0, 5);
      const macros = isMeal && e.proteines_g != null
        ? `<p class="font-sans text-[13px] text-mut num-stat mt-1">P <span class="font-mono text-ink">${e.proteines_g}</span> g · G <span class="font-mono text-ink">${e.glucides_g}</span> g · L <span class="font-mono text-ink">${e.lipides_g}</span> g</p>`
        : '';

      const li = document.createElement('li');
      li.className = 'grid grid-cols-[44px_minmax(0,1fr)_auto] gap-x-3 items-baseline px-5 py-3 border-0 border-solid border-b border-rule';
      const photoClickable = e.photo_path ? 'cursor-pointer' : '';
      li.innerHTML = `
        <div class="${photoClickable}">
          <p class="font-mono text-[13px] num-stat text-mut leading-none">${time}</p>
        </div>
        <div class="min-w-0 ${photoClickable}" data-photo="${escapeHtml(e.photo_path || '')}">
          <p class="font-sans text-[15px] leading-snug text-ink break-words">${escapeHtml(e.description)}</p>
          ${macros}
        </div>
        <div class="text-right">
          <p class="font-mono text-[14px] num-stat text-ink whitespace-nowrap leading-none">${arrow} ${Math.round(e.kcal || 0)}<span class="font-sans text-[13px] text-mut ml-1">kcal</span></p>
          <button class="font-sans text-[13px] text-mut active:text-alert transition mt-2 alim-entry-del" data-id="${e.id}" data-photo="${escapeHtml(e.photo_path || '')}">✕ Suppr</button>
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
  const body = document.getElementById('modal-body');
  body.innerHTML = `<div class="px-5 pt-16 pb-10"><img src="${url}" alt="" class="block w-full h-auto rounded border border-solid border-rule" /></div>`;
  showModalSheet();
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
      preview.innerHTML = `<img src="${url}" alt="" class="inline-block max-w-full max-h-[180px] rounded border border-solid border-rule" />`;
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
    <div class="feedback-ia-modal bg-sheet text-ink font-sans px-5 pt-14 pb-10 flex flex-col gap-4">
      <h2 class="font-display italic font-bold text-[28px] leading-[1.1] text-ink pr-12">Conseil pour ce soir</h2>
      <div id="advice-thread" class="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pt-3 border-0 border-solid border-t-[1.5px] border-ink"></div>
      <textarea id="advice-input" placeholder="Une question, une précision…" rows="2"
                class="w-full bg-paper border border-solid border-rule rounded focus:border-ink focus:ring-0 font-sans text-[15px] leading-normal text-ink placeholder:text-mut p-3 outline-none transition resize-y"></textarea>
      <div class="flex gap-2.5">
        <button class="flex-1 h-14 border-[1.5px] border-solid border-ink rounded font-sans text-ink text-[16px] font-semibold active:bg-ink/10 transition" id="advice-close">Fermer</button>
        <button class="flex-1 min-h-14 px-3 py-2 leading-tight bg-ink text-paper rounded font-sans text-[16px] font-semibold active:bg-ink/80 disabled:opacity-60 transition" id="advice-send">Envoyer</button>
      </div>
    </div>
  `;
  showModalSheet();

  const thread = document.getElementById('advice-thread');
  const input = document.getElementById('advice-input');
  const sendBtn = document.getElementById('advice-send');
  document.getElementById('advice-close').onclick = () => modal.classList.add('hidden');

  function appendBubble(role, html) {
    const div = document.createElement('div');
    // AI speaks plainly on the sheet; the user's lines sit on paper, right-aligned
    div.className = role === 'assistant'
      ? 'font-sans text-[15px] leading-relaxed text-ink break-words'
      : 'self-end max-w-[90%] bg-paper border border-solid border-rule rounded px-3 py-2 font-sans text-[15px] leading-snug text-ink break-words';
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
      loadingBubble.innerHTML = `<span class="text-alert">${escapeHtml(e.message)}</span>`;
    }
    sendBtn.disabled = false;
    sendBtn.textContent = 'Envoyer';
  }

  // Initial assistant reply
  const firstLoading = appendBubble('assistant', `<div class="flex items-center gap-2 text-[13px] text-mut"><div class="live-edit-suggestion-spinner"></div><span>Réflexion en cours…</span></div>`);
  await sendAndRender(firstLoading);

  setTimeout(() => input.focus(), 100);

  sendBtn.onclick = async () => {
    const txt = input.value.trim();
    if (!txt) return;
    appendBubble('user', escapeHtml(txt));
    conversation.push({ role: 'user', content: txt });
    input.value = '';
    const loading = appendBubble('assistant', `<div class="flex items-center gap-2 text-[13px] text-mut"><div class="live-edit-suggestion-spinner"></div><span>…</span></div>`);
    await sendAndRender(loading);
    input.focus();
  };
}

async function openAskQuestionModal(dateIso) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  body.innerHTML = `
    <div class="feedback-ia-modal bg-sheet text-ink font-sans px-5 pt-14 pb-10 flex flex-col gap-4">
      <h2 class="font-display italic font-bold text-[28px] leading-[1.1] text-ink pr-12">Poser une question</h2>
      <textarea id="ask-text" placeholder="Ex : je repars à la salle à 18h, je dois manger quelque chose avant ?" rows="3"
                class="w-full bg-paper border border-solid border-rule rounded focus:border-ink focus:ring-0 font-sans text-[15px] leading-normal text-ink placeholder:text-mut p-3 outline-none transition resize-y"></textarea>
      <div id="ask-response" class="hidden pt-3 border-0 border-solid border-t-[1.5px] border-ink"></div>
      <div class="flex gap-2.5">
        <button class="flex-1 h-14 border-[1.5px] border-solid border-ink rounded font-sans text-ink text-[16px] font-semibold active:bg-ink/10 transition" id="ask-close">Fermer</button>
        <button class="flex-1 min-h-14 px-3 py-2 leading-tight bg-ink text-paper rounded font-sans text-[16px] font-semibold active:bg-ink/80 disabled:opacity-60 transition" id="ask-send">Envoyer</button>
      </div>
    </div>
  `;
  showModalSheet();

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
    responseEl.innerHTML = `<div class="flex items-center gap-2 text-[13px] text-mut"><div class="live-edit-suggestion-spinner"></div><span>Réflexion en cours…</span></div>`;
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

      responseEl.innerHTML = `<div class="font-sans text-[15px] leading-relaxed text-ink break-words">${formatFeedback(text)}</div>`;
      sendBtn.textContent = 'Reposer';
      sendBtn.disabled = false;
      textEl.value = '';
      textEl.focus();
    } catch (e) {
      responseEl.innerHTML = `<div class="font-sans text-[15px] leading-relaxed text-alert break-words">${escapeHtml(e.message)}</div>`;
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
      <p class="px-5 pt-12 font-display italic text-[20px] text-mut">
        Aucune séance enregistrée.
      </p>
    `;
    return;
  }

  // Masthead
  const masthead = document.createElement('section');
  masthead.className = 'px-5 pt-8 pb-7';
  masthead.innerHTML = `
    <h1 class="font-display font-medium text-[52px] leading-[0.95] tracking-[-0.02em] text-ink">Tes <em class="text-mut">progrès.</em></h1>
    <p class="font-sans text-[13px] text-mut mt-3">Évolution par exercice</p>
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

// Carnet token value (hex) read from the CSS variables of src/input.css
function carnetColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
}

function buildStatsProgression(sessions) {
  const section = statsSection('Progression');

  const progNames = [...new Set(sessions.map(s => s.programmeName).filter(Boolean))].sort();
  if (!progNames.length) return section;

  // Programme pills — active: solid ink, others: rule outline
  const pillClass = active => `shrink-0 px-3 py-2 rounded font-sans text-[13px] font-semibold border border-solid transition ${
    active ? 'bg-ink border-ink text-paper' : 'bg-transparent border-rule text-mut active:text-ink'
  }`;
  const pills = document.createElement('div');
  pills.className = 'flex gap-2 overflow-x-auto px-5 pb-5';
  progNames.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className = pillClass(i === 0);
    btn.textContent = name;
    btn.dataset.prog = name;
    pills.appendChild(btn);
  });
  section.appendChild(pills);

  // Metric toggle — tabs: ink rule on top, active tab bold with an ink marker
  const tabClass = active => `relative h-[54px] bg-transparent border-0 font-display italic text-[16px] transition ${
    active
      ? "text-ink font-bold before:content-[''] before:absolute before:-top-[1.5px] before:left-[28%] before:right-[28%] before:h-[3px] before:bg-ink"
      : 'text-mut font-normal active:text-ink'
  }`;
  const toggle = document.createElement('div');
  toggle.className = 'grid grid-cols-3 border-0 border-solid border-t-[1.5px] border-ink';
  [
    { label: 'Volume', metric: 'volume' },
    { label: '1RM',    metric: 'e1rm' },
    { label: 'Max',    metric: 'topWeight' },
  ].forEach(({ label, metric }, i) => {
    const btn = document.createElement('button');
    btn.className = tabClass(i === 0);
    btn.textContent = label;
    btn.dataset.metric = metric;
    toggle.appendChild(btn);
  });
  section.appendChild(toggle);

  // Cards container
  const cardsGrid = document.createElement('ul');
  cardsGrid.className = 'list-none m-0 p-0 mb-8 border-0 border-solid border-t border-rule';
  section.appendChild(cardsGrid);

  // Chart container
  const chartWrap = document.createElement('div');
  chartWrap.className = 'px-5 mb-12 h-[300px]';
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
    const fmt = v => activeMetric === 'volume' ? Math.round(v).toLocaleString('fr-FR') : formatKg(v.toFixed(1));

    // Cards — delta done (up) / alert (down) / mut (=)
    cardsGrid.innerHTML = '';
    exoData.forEach(exo => {
      if (!exo.points.length) return;
      const first = exo.points[0][activeMetric];
      const last = exo.points[exo.points.length - 1][activeMetric];
      const delta = first > 0 ? ((last - first) / first * 100) : 0;
      let deltaColor;
      if (delta > 0)      deltaColor = 'text-done';
      else if (delta < 0) deltaColor = 'text-alert';
      else                deltaColor = 'text-mut';
      const deltaStr = delta === 0 ? '=' : `${delta > 0 ? '+' : ''}${Math.round(delta)}\u202F%`;

      const card = document.createElement('li');
      card.className = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-baseline px-5 py-3 border-0 border-solid border-b border-rule';
      card.innerHTML = `
        <span class="font-display font-bold italic text-[20px] leading-[1.15] text-ink truncate">${escapeHtml(exo.name)}</span>
        <span class="font-mono text-[14px] text-ink num-stat whitespace-nowrap">${fmt(last)}\u202F${unit}</span>
        <span class="font-sans text-[13px] text-mut num-stat">depuis <span class="font-mono">${fmt(first)}\u202F${unit}</span></span>
        <span class="font-mono text-[13px] font-semibold ${deltaColor} num-stat text-right whitespace-nowrap">${deltaStr}</span>
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

    // Series: ink, done, mut solid, then dashed (alert is reserved for events)
    const seriesStyles = [
      { token: 'ink' }, { token: 'done' }, { token: 'mut' },
      { token: 'ink', dash: [6, 4] }, { token: 'done', dash: [6, 4] }, { token: 'mut', dash: [6, 4] },
    ];
    const ink = carnetColor('ink');
    const paper = carnetColor('paper');
    const mut = carnetColor('mut');
    const rule = carnetColor('rule');
    const mono = size => ({ family: "'IBM Plex Mono', monospace", size });

    const datasets = multiPointExos.map((exo, i) => {
      const style = seriesStyles[i % seriesStyles.length];
      const color = carnetColor(style.token);
      const dateMap = {};
      exo.points.forEach(p => { dateMap[p.date] = p[activeMetric]; });
      return {
        label: exo.name,
        data: allDates.map(d => dateMap[d] ?? null),
        borderColor: color,
        backgroundColor: color + '22',
        borderDash: style.dash ?? [],
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
      data: { labels: allDates.map(d => shortDayMonth(d)), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: mut,
              font: mono(12),
              boxWidth: 24,
              boxHeight: 0,
              padding: 12,
            },
          },
          tooltip: {
            backgroundColor: ink,
            borderWidth: 0,
            titleColor: paper,
            bodyColor: paper,
            titleFont: { ...mono(12), weight: '600' },
            bodyFont: mono(12),
            cornerRadius: 6,
            padding: 10,
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)} ${unit}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: mut, font: mono(12), maxRotation: 45, padding: 8 },
            grid: { color: rule, drawTicks: false },
            border: { color: rule },
          },
          y: {
            ticks: {
              color: mut,
              font: mono(12),
              callback: v => fmt(v),
            },
            grid: { color: rule, drawTicks: false },
            border: { color: rule },
          },
        },
      },
    });
  }

  render();

  // Programme pill click — re-render with the selected programme
  pills.addEventListener('click', e => {
    const btn = e.target.closest('button[data-prog]');
    if (!btn) return;
    pills.querySelectorAll('button[data-prog]').forEach(b => { b.className = pillClass(b === btn); });
    activeProg = btn.dataset.prog;
    render();
  });

  // Metric toggle click — re-render with the selected metric
  toggle.addEventListener('click', e => {
    const btn = e.target.closest('button[data-metric]');
    if (!btn) return;
    toggle.querySelectorAll('button[data-metric]').forEach(b => { b.className = tabClass(b === btn); });
    activeMetric = btn.dataset.metric;
    render();
  });

  return section;
}

/* ═══════════════════════════════════════════════════════
   PARAMÈTRES — liste des programmes
═══════════════════════════════════════════════════════ */
let paramsEditing = false; // true while the programme editor fills #screen-params-body

const PARAMS_BACK_ARROW = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
const PARAMS_MOVE_BTN = `${_BTN_GHOST} disabled:opacity-30 disabled:active:bg-transparent`; // _BTN_GHOST: exercise-editor.js

// Header of the params screen: arrow + « Programmes » (list) or mock 06 top bar « Annuler » · title · action (editor)
function setParamsHeader({ editing, title, action = null }) {
  paramsEditing = editing;
  const back = document.getElementById('back-params');
  back.className = editing
    ? 'h-10 shrink-0 text-[14px] font-medium text-ink active:text-mut transition'
    : 'w-10 h-10 -ml-2 flex items-center justify-center shrink-0 text-ink active:text-mut transition';
  back.innerHTML = editing ? 'Annuler' : PARAMS_BACK_ARROW;
  if (editing) back.removeAttribute('aria-label');
  else back.setAttribute('aria-label', 'Retour');
  const titleEl = document.getElementById('params-title');
  titleEl.textContent = title;
  // Editor title follows mock .top b (13 px sans); list title matches the other screen headers
  titleEl.className = editing
    ? 'flex-1 min-w-0 truncate text-center font-sans text-[13px] font-medium text-ink'
    : 'flex-1 min-w-0 truncate font-display italic text-[20px] font-bold tracking-tight text-ink';
  const slot = document.getElementById('params-action');
  slot.innerHTML = '';
  if (action) slot.appendChild(action);
}

// gutter: px-5 on the list (header alignment), px-4 in the editor (mock .ed, aligned with the cards)
function paramsDashedButton(label, onClick, gutter = 'px-5') {
  const box = document.createElement('div');
  box.className = `${gutter} pt-[18px] pb-5`;
  box.innerHTML = `<button type="button" class="${DASHED_BTN}">${label}</button>`;
  box.querySelector('button').addEventListener('click', onClick);
  return box;
}

async function renderParams() {
  setParamsHeader({ editing: false, title: 'Programmes' });
  const tab = document.getElementById('screen-params-body');
  tab.innerHTML = '';

  const programmes = await loadProgrammes();

  if (!programmes.length) {
    const msg = document.createElement('p');
    msg.className = 'm-0 px-5 pt-6 pb-2 text-[14px] text-mut';
    msg.textContent = 'Aucun programme.';
    tab.appendChild(msg);
  } else {
    const list = document.createElement('div');
    programmes.forEach((prog, idx) => list.appendChild(programmeRow(prog, idx, programmes.length)));
    tab.appendChild(list);
  }

  tab.appendChild(paramsDashedButton('+ Nouveau programme', () => openProgrammeEditor()));
}

// One notebook line of the programme list: ↑ ↓ · name + meta · Modifier / Suppr
function programmeRow(prog, idx, count) {
  const row = document.createElement('div');
  row.className = 'flex items-center gap-3 px-5 py-3.5 border-0 border-solid border-b border-rule';
  row.innerHTML = `
    <div class="flex flex-col gap-1.5 shrink-0">
      <button type="button" data-dir="up" ${idx === 0 ? 'disabled' : ''} class="${PARAMS_MOVE_BTN}" aria-label="Monter">↑</button>
      <button type="button" data-dir="down" ${idx === count - 1 ? 'disabled' : ''} class="${PARAMS_MOVE_BTN}" aria-label="Descendre">↓</button>
    </div>
    <div class="flex-1 min-w-0">
      <p class="m-0 font-display italic font-bold text-[19px] leading-tight text-ink truncate">${escapeHtml(prog.name)}</p>
      <p class="m-0 mt-1 text-[13px] text-mut">${escapeHtml(programmeListMeta(prog))}</p>
    </div>
    <div class="flex flex-col items-end gap-1.5 shrink-0">
      <button type="button" data-action="edit" class="h-9 px-3 border-[1.5px] border-solid border-ink rounded text-[13px] font-medium text-ink active:bg-ink/10 transition">Modifier</button>
      <button type="button" data-action="del" class="h-9 px-1 text-[13px] font-medium text-alert active:opacity-60 transition">Suppr</button>
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
    if (idx === count - 1) return;
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
  return row;
}

/* ═══════════════════════════════════════════════════════
   ÉDITEUR DE PROGRAMME (maquette 06)
═══════════════════════════════════════════════════════ */
function openProgrammeEditor(programme = null) {
  const tab = document.getElementById('screen-params-body');
  tab.innerHTML = '';
  let category = programme?.category || 'fonte';

  const saveBtn = document.createElement('button');
  saveBtn.id = 'prog-save';
  saveBtn.type = 'button';
  saveBtn.className = 'h-10 px-3.5 bg-ink text-paper rounded text-[14px] font-medium active:opacity-80 transition';
  saveBtn.textContent = 'Enregistrer';
  saveBtn.addEventListener('click', () => saveProgrammeFromEditor(programme ? programme.id : null, category));
  setParamsHeader({ editing: true, title: programme?.name || 'Nouveau programme', action: saveBtn });

  const form = document.createElement('div');
  form.className = 'px-4 pt-4 pb-2 space-y-5';
  tab.appendChild(form);

  form.insertAdjacentHTML('beforeend', `
    <div>
      <p class="m-0 mb-1 text-[13px] text-mut">Nom du programme</p>
      <input id="prog-name-input" type="text" maxlength="60" placeholder="Pectoraux & Bras" value="${escapeHtml(programme?.name)}"
        class="w-full bg-transparent border-0 border-solid border-b border-rule rounded-none focus:border-ink focus:ring-0 font-display italic font-bold text-[22px] text-ink placeholder:text-mut px-0 py-2 outline-none transition" />
    </div>`);

  // Fonte / Cardio switch: the category lives in `category`, the active button carries data-active="1"
  const catWrap = document.createElement('div');
  catWrap.className = 'prog-category-toggle grid grid-cols-2 gap-2';
  const catBtnClass = active => `prog-cat-btn h-10 rounded text-[14px] font-medium border-[1.5px] border-solid border-ink transition ${
    active ? 'bg-ink text-paper' : 'bg-transparent text-ink active:bg-ink/10'
  }`;
  const renderCatBtns = () => {
    catWrap.innerHTML = ['fonte', 'cardio'].map(cat =>
      `<button type="button" data-cat="${cat}" ${cat === category ? 'data-active="1"' : ''} class="${catBtnClass(cat === category)}">${cat === 'fonte' ? 'Fonte' : 'Cardio'}</button>`
    ).join('');
  };
  catWrap.addEventListener('click', e => {
    const btn = e.target.closest('.prog-cat-btn');
    if (!btn || btn.dataset.cat === category) return;
    category = btn.dataset.cat;
    renderCatBtns();
    fillExercises(category, null);
  });
  renderCatBtns();
  form.appendChild(catWrap);

  const exercisesList = document.createElement('div');
  exercisesList.id = 'prog-exercises-list';
  exercisesList.className = 'space-y-3';
  form.appendChild(exercisesList);

  function fillExercises(cat, exercises) {
    exercisesList.innerHTML = '';
    if (cat === 'cardio') {
      if (exercises?.length) {
        exercises.forEach(ex => exercisesList.appendChild(makeCardioExerciseCard({
          name: ex.name || '', duration: ex.duration ?? '', power: ex.power ?? '', comment: ex.comment || '',
          source: ex,
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
            activities: acts, comment: ex.comment || '', source: m,
          }));
        });
      } else {
        exercisesList.appendChild(makeExerciseCard());
      }
    }
  }
  fillExercises(category, programme?.exercises);

  tab.appendChild(paramsDashedButton('+ Exercice', () => {
    exercisesList.appendChild(category === 'cardio' ? makeCardioExerciseCard() : makeExerciseCard());
  }, 'px-4'));
}

async function saveProgrammeFromEditor(existingId, category) {
  const name = document.getElementById('prog-name-input').value.trim();
  if (!name) { showAlert('Donne un nom au programme.'); return; }

  const cards = document.querySelectorAll('#prog-exercises-list .exercise-card');
  if (!cards.length) { showAlert('Ajoute au moins un exercice.'); return; }

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

    let sessions = [];
    try { sessions = await loadSessions(); } catch (_) { sessions = []; }
    let inProgress = sessions.find(s => s.duration === 0 || s.duration == null);

    // Filet de sécurité : si localStorage a un snapshot plus récent que Supabase
    // (réseau coupé en salle), on l'utilise comme source de vérité + repush.
    try {
      const pendingId = localStorage.getItem(LIVE_PENDING_KEY);
      if (pendingId) {
        const { session, repush } = resolveResumeSession(inProgress, readSnapshotLocal(pendingId)?.snap);
        inProgress = session;
        // Retente le push silencieusement (le toast s'affichera si encore offline)
        if (repush) {
          pushSessionSafe(repush)
            .then(() => { if (repush.duration > 0) clearSnapshotLocal(repush.id); })
            .catch(() => {});
        }
      }
    } catch (_) {}

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
        exercises:     restoreLiveExercises(inProgress.exercises, inProgress.category, migrateExercise),
      };
      initLiveTimingMaps(inProgress);
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
