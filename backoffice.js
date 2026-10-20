/* ═══════════════════════════════════════════════════════
   COACH MIKE — Backoffice
═══════════════════════════════════════════════════════ */

let coachId   = null;
let clients   = [];
let selClient = null; // client complet sélectionné
let selTab    = 'programmes';

const root = document.getElementById('bo-root');

const STATE_META = {
  new:              { label: 'Nouveau',      icon: '○' },
  invited:          { label: 'Invité',       icon: '✉' },
  password_created: { label: 'Mot de passe créé', icon: '●' },
  connected:        { label: 'Connecté',     icon: '✓' },
};
function stateLabel(state) { return STATE_META[state || 'new']?.label || state; }

/* ─── INIT ─────────────────────────────────────────── */
(async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { renderLogin(); return; }
  const profile = await getMyProfile();
  if (profile?.role !== 'coach') { window.location.href = '/'; return; }
  coachId = session.user.id;
  await loadClients();
  renderDashboard();
})();

/* ─── AUTH ─────────────────────────────────────────── */
function renderLogin() {
  root.innerHTML = `
    <div class="login-page">
      <div class="login-box">
        <h1>Mike Coach</h1>
        <p class="sub">Espace coach</p>
        <input id="l-email" type="email" placeholder="Email" autocomplete="email" />
        <input id="l-pass"  type="password" placeholder="Mot de passe" autocomplete="current-password" />
        <button class="btn-primary btn-full" id="l-btn">Se connecter</button>
        <p class="error-msg hidden" id="l-err"></p>
      </div>
    </div>`;
  document.getElementById('l-btn').addEventListener('click', async () => {
    const email    = document.getElementById('l-email').value.trim();
    const password = document.getElementById('l-pass').value;
    const errEl    = document.getElementById('l-err');
    errEl.classList.add('hidden');
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    const profile = await getMyProfile();
    if (profile?.role !== 'coach') { window.location.href = '/'; return; }
    coachId = data.user.id;
    await loadClients();
    renderDashboard();
  });
}

async function logout() {
  await db.auth.signOut();
  coachId = null; clients = []; selClient = null;
  renderLogin();
}

/* ─── DATA ─────────────────────────────────────────── */
async function loadClients() {
  const { data } = await db.from('profiles')
    .select('*')
    .eq('coach_id', coachId)
    .order('nom');
  clients = data || [];
}

async function loadProgrammes(clientId) {
  const { data } = await db.from('programmes')
    .select('*')
    .eq('client_id', clientId)
    .order('ordre');
  return data || [];
}

async function loadSessions(clientId) {
  const { data: sessions, error: sErr } = await db.from('sessions')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
    .limit(50);
  if (sErr) { console.error('loadSessions sessions:', sErr); return []; }
  if (!sessions || sessions.length === 0) return [];

  const ids = sessions.map(s => s.id);
  const { data: exos, error: eErr } = await db.from('session_exercises')
    .select('*')
    .in('session_id', ids);
  if (eErr) { console.error('loadSessions exos:', eErr); return []; }

  const exosBySession = new Map();
  for (const row of (exos || [])) {
    if (!exosBySession.has(row.session_id)) exosBySession.set(row.session_id, []);
    exosBySession.get(row.session_id).push(row);
  }

  return sessions.map(s => recomposeSession(s, exosBySession.get(s.id) || []));
}

async function loadBodyMeasurements(clientId) {
  const { data } = await db.from('body_measurements')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false });
  return data || [];
}

/* ─── DASHBOARD ─────────────────────────────────────── */
function renderDashboard() {
  root.innerHTML = `
    <button class="bo-sidebar-toggle" id="bo-sidebar-toggle">☰</button>
    <button class="bo-fab" id="bo-add-client" title="Nouveau client" aria-label="Nouveau client">+</button>
    <div class="bo-sidebar-overlay" id="bo-sidebar-overlay"></div>
    <div class="bo-layout">
      <div class="bo-sidebar" id="bo-sidebar">
        <div class="bo-sidebar-header">
          <span class="bo-logo">Mike Coach</span>
          <button class="btn-ghost btn-sm" id="bo-logout">Déconnexion</button>
        </div>
        <div class="bo-clients" id="bo-clients-list"></div>
      </div>
      <div class="bo-main" id="bo-main">
        <div class="bo-main-placeholder">← Sélectionnez un client</div>
      </div>
    </div>`;

  document.getElementById('bo-logout').addEventListener('click', logout);
  document.getElementById('bo-add-client').addEventListener('click', showAddClientModal);

  // Sidebar toggle (mobile)
  const sidebar = document.getElementById('bo-sidebar');
  const overlay = document.getElementById('bo-sidebar-overlay');
  const toggle  = document.getElementById('bo-sidebar-toggle');
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }
  toggle.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
  overlay.addEventListener('click', closeSidebar);

  renderClientList();
}

function renderClientList() {
  const el = document.getElementById('bo-clients-list');
  if (!el) return;
  if (!clients.length) {
    el.innerHTML = '<p class="bo-empty">Aucun client.<br>Ajoutez-en un !</p>';
    return;
  }
  el.innerHTML = clients.map(c => {
    const s = STATE_META[c.state || 'new'];
    return `
    <div class="bo-client-item ${selClient?.id === c.id ? 'active' : ''}" data-id="${c.id}">
      <div class="bo-client-name">${escapeHtml(c.prenom || '')} ${escapeHtml(c.nom || '')} <span class="bo-state-dot bo-state--${c.state || 'new'}" title="${s.label}">${s.icon}</span></div>
      <div class="bo-client-email">${escapeHtml(c.email || '')}</div>
    </div>`;
  }).join('');
  el.querySelectorAll('.bo-client-item').forEach(el => {
    el.addEventListener('click', () => selectClient(el.dataset.id));
  });
}

async function selectClient(id) {
  selClient = clients.find(c => c.id === id) || null;
  selTab = 'userdata';
  // Close sidebar on mobile
  const sidebar = document.getElementById('bo-sidebar');
  const overlay = document.getElementById('bo-sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  renderClientList();
  await renderClientDetail();
}

async function renderClientDetail() {
  const main = document.getElementById('bo-main');
  if (!selClient) { main.innerHTML = '<div class="bo-main-placeholder">← Sélectionnez un client</div>'; return; }

  main.innerHTML = `
    <div class="bo-detail">
      <div class="bo-detail-header">
        <div class="bo-detail-title">
          <span class="bo-detail-name">${escapeHtml(selClient.prenom || '')} ${escapeHtml(selClient.nom || '')}</span>
          <span class="bo-detail-email">${escapeHtml(selClient.email || '')}</span>
          <span class="bo-state bo-state--${selClient.state || 'new'}">${stateLabel(selClient.state)}</span>
          ${(selClient.state || 'new') === 'new' ? '<button class="btn-primary btn-sm" id="send-invite">Envoyer l\'invitation</button>' : ''}
          <button class="btn-danger btn-sm" id="del-client">Supprimer</button>
        </div>
        <div class="bo-tabs">
          <button class="bo-tab ${selTab === 'userdata' ? 'active' : ''}" data-tab="userdata">Données utilisateur</button>
          <button class="bo-tab ${selTab === 'body' ? 'active' : ''}" data-tab="body">Suivi corporel</button>
          <button class="bo-tab ${selTab === 'programmes' ? 'active' : ''}" data-tab="programmes">Programmes</button>
          <button class="bo-tab ${selTab === 'sessions' ? 'active' : ''}" data-tab="sessions">Séances</button>
        </div>
      </div>
      <div class="bo-detail-body" id="bo-detail-body">
        <p class="bo-note">Chargement…</p>
      </div>
    </div>`;

  document.getElementById('del-client').addEventListener('click', () => deleteClient(selClient.id));
  const inviteBtn = document.getElementById('send-invite');
  if (inviteBtn) inviteBtn.addEventListener('click', () => sendInvite(selClient));
  main.querySelectorAll('.bo-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      selTab = btn.dataset.tab;
      main.querySelectorAll('.bo-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === selTab));
      await renderDetailBody();
    });
  });

  await renderDetailBody();
}

async function renderDetailBody() {
  const body = document.getElementById('bo-detail-body');
  if (!body) return;
  if (selTab === 'programmes') await renderProgrammeList(body);
  else if (selTab === 'sessions') await renderSessionList(body);
  else if (selTab === 'userdata') await renderUserData(body);
  else if (selTab === 'body') await renderBodyTracking(body);
}

/* ─── PROGRAMMES ────────────────────────────────────── */
async function renderProgrammeList(body) {
  const progs = await loadProgrammes(selClient.id);

  // Durées moyennes par exo (pour estimer la durée des programmes)
  const normalizedNames = [...new Set(
    progs.flatMap(p => (p.exercises || []).map(e => e.normalized_name).filter(Boolean))
  )];
  const avgMap = await loadAvgExerciseDurationsDB(selClient.id, normalizedNames);

  let html = `<button class="btn-primary btn-sm" id="new-prog" style="margin-bottom:16px">+ Nouveau programme</button>`;
  if (!progs.length) {
    html += '<p class="bo-note">Aucun programme pour ce client.</p>';
  } else {
    html += progs.map(p => {
      const total = p.estimated_duration_seconds != null
        ? p.estimated_duration_seconds
        : computeEstimatedDuration({ exercises: p.exercises || [] }, avgMap);
      const minutes = Math.round(total / 60);
      return `
      <div class="prog-row">
        <div>
          <div class="prog-row-name">${escapeHtml(p.name)}</div>
          <div class="prog-row-count"><span class="bo-num">${(p.exercises || []).length}</span> exercice(s) · <span class="bo-num">~${minutes} min</span></div>
        </div>
        <div class="prog-row-actions">
          <button class="btn-secondary btn-sm" data-edit="${p.id}">Modifier</button>
          <button class="btn-secondary btn-sm" data-copy="${p.id}">Copier</button>
          <button class="btn-danger btn-sm" data-del="${p.id}">Suppr.</button>
        </div>
      </div>`;
    }).join('');
  }
  body.innerHTML = html;
  document.getElementById('new-prog').addEventListener('click', () => renderProgrammeEditor(null));
  body.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prog = progs.find(p => p.id === btn.dataset.edit);
      if (prog) renderProgrammeEditor(prog);
    });
  });
  body.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prog = progs.find(p => p.id === btn.dataset.copy);
      if (prog) showCopyProgrammeModal(prog);
    });
  });
  body.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteProgramme(btn.dataset.del));
  });
}

function showCopyProgrammeModal(prog) {
  const targets = clients.filter(c => c.id !== selClient.id);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  if (!targets.length) {
    overlay.innerHTML = `
      <div class="modal">
        <h2>Copier "${escapeHtml(prog.name)}"</h2>
        <p class="bo-note">Aucun autre client à qui copier ce programme.</p>
        <div class="flex-row" style="justify-content:flex-end">
          <button class="btn-secondary" id="cp-close">Fermer</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#cp-close').addEventListener('click', () => overlay.remove());
    return;
  }
  overlay.innerHTML = `
    <div class="modal">
      <h2>Copier "${escapeHtml(prog.name)}" vers :</h2>
      <div id="cp-targets" style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto">
        ${targets.map(c => `
          <button class="btn-secondary" data-target="${c.id}" style="text-align:left">
            ${escapeHtml((c.prenom || '') + ' ' + (c.nom || ''))} <span class="bo-copy-email">${escapeHtml(c.email || '')}</span>
          </button>
        `).join('')}
      </div>
      <p class="error-msg hidden" id="cp-err"></p>
      <div class="flex-row" style="justify-content:flex-end">
        <button class="btn-secondary" id="cp-cancel">Annuler</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cp-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('[data-target]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.dataset.target;
      btn.disabled = true;
      const targetProgs = await loadProgrammes(targetId);
      const sameCat = targetProgs.filter(p => (p.category || 'fonte') === (prog.category || 'fonte'));
      const payload = {
        name:      prog.name,
        category:  prog.category || 'fonte',
        exercises: prog.exercises || [],
        client_id: targetId,
        coach_id:  coachId,
        ordre:     sameCat.length,
      };
      const { error } = await db.from('programmes').insert(payload);
      if (error) {
        const errEl = overlay.querySelector('#cp-err');
        errEl.textContent = error.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        return;
      }
      overlay.remove();
    });
  });
}

let _progEditorState = null; // { existingId, name, category, exercises, estOverride, catalog, avgMap }
let _sidebarFilters = { search: '', muscles: new Set() };
let _editingCatalogId = null;
let _boDrag = null; // { source, target } while dragging; target undefined = no mark shown yet

const MUSCLE_OPTIONS = ['Pec', 'Dos', 'Jambes', 'Épaules', 'Bras', 'Abdos'];

async function renderProgrammeEditor(existingProg) {
  const body = document.getElementById('bo-detail-body');
  const category = existingProg?.category || 'fonte';

  _progEditorState = {
    existingId:  existingProg?.id || null,
    name:        existingProg?.name || '',
    category,
    // ensureSeries migrates old programmes (reps/weight on the activity only)
    // to the series[].values[] shape
    exercises:   (existingProg?.exercises || []).map(e => ensureSeries({ ...e })),
    estOverride: existingProg?.estimated_duration_seconds ?? null,
    catalog:     [],
    avgMap:      new Map(),
  };

  body.innerHTML = `
    <div class="bo-editor">
      <header class="bo-ed-head">
        <div class="bo-ed-bar">
          <button class="btn-ghost" id="ed-back">← Retour</button>
          <input type="text" id="ed-name" class="bo-ed-name" placeholder="Nom du programme" value="${escapeHtml(_progEditorState.name)}">
          <span class="bo-ed-est">Estimé : <span id="ed-est">—</span></span>
          <button id="ed-est-edit" class="btn-ghost btn-sm">Modifier</button>
          <button class="btn-primary" id="ed-save">Enregistrer</button>
        </div>
        <p class="bo-ed-help">Glisse depuis le catalogue. Dépose <b>entre</b> deux exercices pour insérer, <b>sur</b> un exercice pour former un super set.</p>
        <p class="error-msg hidden" id="ed-err"></p>
      </header>
      <div class="bo-ed-cols">
        <aside id="ed-sidebar" class="cat-col"></aside>
        <section id="ed-zone" class="pz-zone"></section>
      </div>
    </div>`;

  document.getElementById('ed-back').addEventListener('click', () => renderDetailBody());
  document.getElementById('ed-save').addEventListener('click', () => saveProgramme());
  const nameInput = document.getElementById('ed-name');
  nameInput.addEventListener('input', e => { _progEditorState.name = e.target.value; });
  if (!_progEditorState.existingId) nameInput.focus();
  document.getElementById('ed-est-edit').addEventListener('click', () => promptEstOverride());

  // Catalog and duration averages, loaded in parallel
  const normalizedNames = _progEditorState.exercises
    .map(e => normalizeExerciseName(e.name || ''))
    .filter(n => n);

  const [catalog, avgMap] = await Promise.all([
    loadExerciseCatalogDB(),
    loadAvgExerciseDurationsDB(selClient.id, normalizedNames),
  ]);
  _progEditorState.catalog = catalog.filter(c => c.category === category);
  _progEditorState.avgMap  = avgMap;

  renderCatalogSidebar();
  renderProgrammeZone();
  refreshEstimateHeader();
}

function refreshEstimateHeader() {
  const el = document.getElementById('ed-est');
  if (!el) return;
  const override = _progEditorState.estOverride;
  const total = override != null
    ? override
    : computeEstimatedDuration(
        { exercises: _progEditorState.exercises },
        _progEditorState.avgMap
      );
  el.textContent = `${Math.round(total / 60)} min${override != null ? ' (manuel)' : ''}`;
}

function promptEstOverride() {
  const current = _progEditorState.estOverride;
  const raw = prompt('Durée estimée en minutes (laisser vide pour calcul auto) :', current != null ? Math.round(current / 60) : '');
  if (raw === null) return;
  const v = raw.trim();
  _progEditorState.estOverride = v === '' ? null : Math.max(1, parseInt(v, 10) * 60);
  refreshEstimateHeader();
}

function renderCatalogSidebar() {
  const aside = document.getElementById('ed-sidebar');
  aside.innerHTML = `
    <div class="cat-head">
      <p class="cat-title">Catalogue</p>
      <button id="cat-new" class="btn-secondary btn-sm">+ Nouvel exercice</button>
    </div>
    <input id="cat-search" type="text" class="cat-search" placeholder="Rechercher un exercice">
    <div id="cat-chips" class="cat-chips"></div>
    <div id="cat-list" class="cat-list"></div>
    <div id="cat-form" class="cat-form hidden"></div>`;

  document.getElementById('cat-new').addEventListener('click', () => openCatalogForm(null));
  document.getElementById('cat-search').addEventListener('input', e => {
    _sidebarFilters.search = e.target.value;
    renderCatalogList();
  });
  renderMuscleChips();
  renderCatalogList();
}

function renderMuscleChips() {
  const wrap = document.getElementById('cat-chips');
  wrap.innerHTML = MUSCLE_OPTIONS.map(m =>
    `<button type="button" data-m="${m}" class="cat-chip${_sidebarFilters.muscles.has(m) ? ' on' : ''}">${m}</button>`
  ).join('');
  wrap.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const m = b.dataset.m;
      if (_sidebarFilters.muscles.has(m)) _sidebarFilters.muscles.delete(m);
      else _sidebarFilters.muscles.add(m);
      renderMuscleChips();
      renderCatalogList();
    });
  });
}

function boCatalogRowHtml(entry) {
  return `
    <div data-id="${entry.id}" class="cat-item" draggable="true">
      <span class="cat-name">${escapeHtml(entry.name)}</span>
      <button type="button" class="cat-edit btn-ghost btn-sm" data-id="${entry.id}">Modifier</button>
    </div>`;
}

function renderCatalogList() {
  const list = document.getElementById('cat-list');
  const term = normalizeExerciseName(_sidebarFilters.search);
  const muscles = _sidebarFilters.muscles;
  const filtered = _progEditorState.catalog.filter(c => {
    if (term && !c.normalized_name.includes(term)) return false;
    return muscles.size === 0 || (c.muscle_groups || []).some(m => muscles.has(m));
  });
  list.innerHTML = filtered.map(boCatalogRowHtml).join('') || '<p class="cat-empty">Catalogue vide.</p>';
  list.querySelectorAll('.cat-item').forEach(row => {
    const entry = _progEditorState.catalog.find(c => c.id === row.dataset.id);
    row.addEventListener('dragstart', e => boStartCatalogDrag(e, entry));
    row.querySelector('.cat-edit').addEventListener('click', e => {
      e.stopPropagation();
      openCatalogForm(entry);
    });
  });
}

function openCatalogForm(existing) {
  _editingCatalogId = existing?.id || null;
  const form = document.getElementById('cat-form');
  form.classList.remove('hidden');
  const isEdit = !!existing;
  const actType = existing?.default_activities?.[0]?.type || 'weight';
  form.innerHTML = `
    <p class="cat-title">${isEdit ? 'Modifier l’exercice' : 'Nouvel exercice'}</p>
    <label class="cat-label">Nom
      <input id="cf-name" type="text" value="${escapeHtml(existing?.name || '')}">
    </label>
    <p class="cat-label">Groupes musculaires</p>
    <div id="cf-muscles" class="cat-chips">${
      MUSCLE_OPTIONS.map(m =>
        `<button data-m="${m}" type="button" class="cat-chip${(existing?.muscle_groups || []).includes(m) ? ' on' : ''}">${m}</button>`
      ).join('')
    }</div>
    <label class="cat-label">Type d’activité par défaut
      <select id="cf-acttype" class="cat-select">
        <option value="weight"    ${actType === 'weight'    ? 'selected' : ''}>Poids</option>
        <option value="countdown" ${actType === 'countdown' ? 'selected' : ''}>Minuterie</option>
        <option value="stopwatch" ${actType === 'stopwatch' ? 'selected' : ''}>Chrono</option>
      </select>
    </label>
    <label class="cat-label">Notes
      <textarea id="cf-notes" placeholder="Consignes…">${escapeHtml(existing?.notes || '')}</textarea>
    </label>
    <div class="flex-row">
      <button id="cf-save" class="btn-primary btn-sm">${isEdit ? 'Mettre à jour' : 'Créer'}</button>
      <button id="cf-cancel" class="btn-ghost btn-sm">Annuler</button>
      ${isEdit ? '<button id="cf-delete" class="btn-danger btn-sm">Suppr</button>' : ''}
    </div>`;

  form.querySelectorAll('#cf-muscles button').forEach(b => {
    b.addEventListener('click', () => b.classList.toggle('on'));
  });

  document.getElementById('cf-cancel').addEventListener('click', () => {
    form.classList.add('hidden');
    _editingCatalogId = null;
  });

  document.getElementById('cf-save').addEventListener('click', async () => {
    const name = document.getElementById('cf-name').value.trim();
    if (!name) return alert('Nom obligatoire');
    const muscle_groups = Array.from(form.querySelectorAll('#cf-muscles button.on')).map(b => b.dataset.m);
    const acttype = document.getElementById('cf-acttype').value;
    const default_activities = [{ type: acttype }];
    const notes = document.getElementById('cf-notes').value.trim();
    try {
      const saved = await upsertExerciseCatalogEntryDB({
        id: _editingCatalogId,
        name,
        category: _progEditorState.category,
        muscle_groups,
        default_activities,
        notes,
      });
      const idx = _progEditorState.catalog.findIndex(c => c.id === saved.id);
      if (idx >= 0) _progEditorState.catalog[idx] = saved;
      else _progEditorState.catalog.push(saved);
      _progEditorState.catalog.sort((a, b) => a.name.localeCompare(b.name));
      form.classList.add('hidden');
      _editingCatalogId = null;
      renderCatalogList();
    } catch (e) {
      alert('Erreur sauvegarde : ' + e.message);
    }
  });

  const delBtn = document.getElementById('cf-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet exercice du catalogue ?')) return;
      try {
        await deleteExerciseCatalogEntryDB(_editingCatalogId);
        _progEditorState.catalog = _progEditorState.catalog.filter(c => c.id !== _editingCatalogId);
        form.classList.add('hidden');
        _editingCatalogId = null;
        renderCatalogList();
      } catch (e) {
        alert('Erreur suppression : ' + e.message);
      }
    });
  }
}

/* ─── Programme zone (one element per block) ─── */

function renderProgrammeZone() {
  const zone = document.getElementById('ed-zone');
  zone.innerHTML = `<div id="pz-list" class="pz-list">${boProgrammeListHtml(_progEditorState.exercises)}</div>`;
  const list = document.getElementById('pz-list');
  list.addEventListener('click', boZoneClick);
  list.addEventListener('change', boZoneChange);
  list.addEventListener('dragstart', boStartBlockDrag);
  list.addEventListener('dragenter', e => { if (_boDrag) e.preventDefault(); });
  list.addEventListener('dragover', boDragOver);
  list.addEventListener('dragleave', boDragLeave);
  list.addEventListener('drop', boDrop);
}

function boProgrammeListHtml(exercises) {
  if (!exercises.length) return '<p class="pz-empty">Glisse un exercice du catalogue ici</p>';
  return editorBlocks(exercises).map((block, pos) => block.kind === 'group'
    ? boGroupCardHtml(block, pos, exercises)
    : boSingleRowHtml(exercises[block.indices[0]], block.indices[0], pos)).join('');
}

// ↑ / ↓ buttons; `dirs` are -1 and / or 1, `kind` is "block" or "member".
function boArrowsHtml(kind, dirs, index) {
  return dirs.map(dir => dir < 0
    ? `<button type="button" class="btn-ghost btn-sm" data-action="${kind}-up" data-index="${index}" aria-label="Monter">↑</button>`
    : `<button type="button" class="btn-ghost btn-sm" data-action="${kind}-down" data-index="${index}" aria-label="Descendre">↓</button>`
  ).join('');
}

function boSingleRowHtml(ex, index, pos) {
  return `
    <div class="pz-row" data-block="${pos}" data-drop-row data-first-row>
      <span class="pz-handle" data-drag-handle draggable="true" aria-label="Déplacer">⋮⋮</span>
      <span class="pz-name">${escapeHtml(ex.name || 'Sans nom')}</span>
      <span class="pz-sum">${escapeHtml(boRowSummary(ex))}</span>
      <span class="pz-acts">
        ${boArrowsHtml('block', [-1, 1], index)}
        <button type="button" class="btn-ghost btn-sm" data-action="edit" data-index="${index}">Modifier</button>
        <button type="button" class="btn-danger btn-sm" data-action="delete" data-index="${index}">Suppr</button>
      </span>
    </div>`;
}

function boGroupCardHtml(block, pos, exercises) {
  const first = block.indices[0];
  const count = block.indices.length;
  const members = block.indices.map((index, at) => boMemberRowHtml(exercises[index], at, count, index)).join('');
  return `
    <div class="pz-group" data-block="${pos}" data-index="${first}">
      <div class="pz-head" data-drop-row data-first-row>
        <span class="pz-handle" data-drag-handle draggable="true" aria-label="Déplacer">⋮⋮</span>
        <span class="pz-name">${escapeHtml(block.label)}</span>
        ${boGroupSettingsHtml(block.settings)}
        <span class="pz-acts">
          ${boArrowsHtml('block', [-1, 1], first)}
          <button type="button" class="btn-ghost btn-sm" data-action="ungroup" data-index="${first}">Dégrouper</button>
        </span>
      </div>
      ${members}
    </div>`;
}

const BO_GROUP_SETTING_FIELDS = [
  { key: 'rounds',     label: 'Tours',         min: 1, unit: '' },
  { key: 'transition', label: 'Transition',    min: 0, unit: 's' },
  { key: 'roundRest',  label: 'Repos de tour', min: 0, unit: 's' },
];

function boGroupSettingsHtml(settings) {
  return BO_GROUP_SETTING_FIELDS.map(f => `
    <label class="pz-setting">${f.label}
      <input type="number" inputmode="numeric" min="${f.min}" class="pz-set" data-group-setting="${f.key}" value="${settings[f.key] ?? ''}">${f.unit ? `<span class="pz-unit">${f.unit}</span>` : ''}
    </label>`).join('');
}

function boMemberRowHtml(ex, posInGroup, count, index) {
  return `
    <div class="pz-member" data-drop-row data-member-index="${index}">
      <span class="pz-letter">${supersetMemberLetter(posInGroup)}</span>
      <span class="pz-name">${escapeHtml(ex.name || 'Sans nom')}</span>
      <span class="pz-sum">${escapeHtml(memberSummary(ex))}</span>
      <span class="pz-acts">
        ${boArrowsHtml('member', memberMoveDirs(posInGroup, count), index)}
        <button type="button" class="btn-ghost btn-sm" data-action="edit" data-index="${index}">Modifier</button>
        <button type="button" class="btn-danger btn-sm" data-action="delete" data-index="${index}">Suppr</button>
      </span>
    </div>`;
}

// Applies a pure change to the exercise list, then redraws.
function boEditorAct(fn) {
  _progEditorState.exercises = fn(_progEditorState.exercises);
  renderProgrammeZone();
  refreshEstimateHeader();
}

const BO_ZONE_ACTIONS = {
  'block-up':    (xs, i) => moveExerciseBlock(xs, i, -1),
  'block-down':  (xs, i) => moveExerciseBlock(xs, i, 1),
  'member-up':   (xs, i) => moveWithinSuperset(xs, i, -1),
  'member-down': (xs, i) => moveWithinSuperset(xs, i, 1),
  'ungroup':     (xs, i) => ungroupSuperset(xs, xs[i].group.id),
};

function boZoneClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;
  const index = Number(btn.dataset.index);
  if (action === 'edit') openExoModal(_progEditorState.exercises[index], { index });
  else if (action === 'delete') boConfirmRemove(index);
  else boEditorAct(xs => BO_ZONE_ACTIONS[action](xs, index));
}

// The three fields are read together; an invalid one keeps its previous value, written back
// in place (no redraw, so the focus stays where the coach is typing).
function boZoneChange(e) {
  const card = e.target.closest('.pz-group');
  if (!card || !e.target.matches('[data-group-setting]')) return;
  const raw = Object.fromEntries([...card.querySelectorAll('[data-group-setting]')]
    .map(input => [input.dataset.groupSetting, input.value]));
  const first = Number(card.dataset.index);
  _progEditorState.exercises = applyGroupSettingsInput(_progEditorState.exercises, _progEditorState.exercises[first].group.id, raw);
  boFillGroupSettings(card, _progEditorState.exercises[first].group);
  refreshEstimateHeader();
}

function boFillGroupSettings(card, group) {
  card.querySelectorAll('[data-group-setting]').forEach(input => { input.value = group[input.dataset.groupSetting]; });
}

function boConfirmRemove(index) {
  showConfirmModal('Retirer cet exercice du programme ?',
    () => boEditorAct(xs => removeExerciseKeepingGroups(xs, index)));
}

/* ─── Native drag and drop ─── */

function boStartCatalogDrag(e, entry) {
  _boDrag = { source: { catalogId: entry.id } };
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('text/plain', entry.name);
  e.currentTarget.classList.add('gone');
}

function boStartBlockDrag(e) {
  const handle = e.target.closest('[data-drag-handle]');
  if (!handle) return;
  const block = handle.closest('[data-block]');
  _boDrag = { source: { blockPos: Number(block.dataset.block) } };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', '');
  e.dataTransfer.setDragImage(block, 24, 24);
}

// Source as boCanDropOnto sees it: a catalog entry is a provisional exercise.
function boProbeSource(source) {
  if (!source.catalogId) return source;
  const entry = _progEditorState.catalog.find(c => c.id === source.catalogId);
  return { exercise: { name: entry.name, activities: entry.default_activities || [{ type: 'weight' }] } };
}

// Hovered target: null (the end) on an empty list; between blocks the current one is kept
// (undefined when none was computed yet).
function boHoverTarget(e, list) {
  const block = e.target.closest('[data-block]');
  const row   = e.target.closest('[data-drop-row]');
  if (!list.querySelector('[data-block]')) return null;
  if (!block || !row) return _boDrag.target;
  const pos = Number(block.dataset.block);
  const canJoin = _progEditorState.category !== 'cardio'
    && boCanDropOnto(_progEditorState.exercises, boProbeSource(_boDrag.source), pos);
  const intent = boDropIntent(row.getBoundingClientRect(), e.clientY, { canJoin, firstRow: row.hasAttribute('data-first-row') });
  return { blockPos: pos, intent };
}

function boClearDropMark() {
  document.querySelectorAll('#pz-list .drop-onto, #pz-list .drop-before, #pz-list .drop-after')
    .forEach(el => el.classList.remove('drop-onto', 'drop-before', 'drop-after'));
  document.querySelectorAll('#pz-list .pz-tip').forEach(el => el.remove());
}

// One mark at a time: the highlighted "onto" row, or a 2 px rule at a block edge.
function boShowDropMark(target) {
  boClearDropMark();
  const list  = document.getElementById('pz-list');
  const block = target ? list.querySelector(`[data-block="${target.blockPos}"]`) : list.lastElementChild;
  if (!block) return;
  if (!target || target.intent !== 'onto') {
    block.classList.add(target && target.intent === 'before' ? 'drop-before' : 'drop-after');
    return;
  }
  const row = block.matches('[data-first-row]') ? block : block.querySelector('[data-first-row]');
  row.classList.add('drop-onto');
  row.querySelector('.pz-name').insertAdjacentHTML('afterend', `<span class="pz-tip">${boOntoTip(block, target.blockPos)}</span>`);
}

function boOntoTip(block, blockPos) {
  if (block.matches('.pz-group')) return 'Déposer : ajouter au super set';
  const xs = _progEditorState.exercises;
  return `Déposer : super set avec ${escapeHtml(xs[editorBlocks(xs)[blockPos].indices[0]].name || 'Sans nom')}`;
}

// No target computed yet (entering through a gap): the drop is refused (no preventDefault).
function boDragOver(e) {
  if (!_boDrag) return;
  const target = boHoverTarget(e, e.currentTarget);
  if (target === undefined) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = _boDrag.source.catalogId ? 'copy' : 'move';
  if (JSON.stringify(target) === JSON.stringify(_boDrag.target)) return;
  _boDrag.target = target;
  boShowDropMark(target);
}

function boDragLeave(e) {
  if (!_boDrag || e.currentTarget.contains(e.relatedTarget)) return;
  _boDrag.target = undefined;
  boClearDropMark();
}

function boEndDrag() {
  _boDrag = null;
  boClearDropMark();
  document.querySelectorAll('#cat-list .gone').forEach(el => el.classList.remove('gone'));
}

// Delegated once for both sources (catalog rows, block handles); a drop also ends the drag itself.
document.addEventListener('dragend', boEndDrag);

async function boDrop(e) {
  if (!_boDrag) return;
  e.preventDefault();
  const source = _boDrag.source;
  const target = _boDrag.target ?? null;
  boEndDrag();
  if (source.catalogId) {
    await boDropCatalogEntry(_progEditorState.catalog.find(c => c.id === source.catalogId), target);
  } else {
    boEditorAct(xs => boApplyDrop(xs, source, target));
  }
}

// Last execution of this exercise by the client, or null.
async function boClientPrev(name) {
  const normName = normalizeExerciseName(name);
  const prevMap  = await loadLastExercisesForClientDB(selClient.id, [normName]);
  return prevMap.get(normName) || null;
}

// A client who already did this exercise gets it directly; otherwise the « Ajouter » modal opens first.
async function boDropCatalogEntry(entry, target) {
  if (!entry) return;
  const prev = await boClientPrev(entry.name);
  if (prev?.activities?.length && prev?.execution?.series?.length) {
    boPlaceExercise(buildProgrammeExerciseFromCatalog(entry, prev), { target });
    return;
  }
  await openExoModal(entry, { target, prev });
}

/* ─── Exercise modal (✎ or catalog add) ─── */

// `placement`: { index } replaces that exercise, { target } adds a new one at that drop target.
function boPlaceExercise(exo, placement) {
  if (placement.index !== undefined) {
    boEditorAct(xs => xs.map((ex, i) => i === placement.index ? exo : ex));
  } else {
    boEditorAct(xs => boApplyDrop(xs, { exercise: exo }, placement.target ?? null));
  }
}

function boExoModalHtml(seed, isNew) {
  return `
    <div class="modal bo-exo-modal">
      <header class="flex-row">
        <h2 class="spacer">${isNew ? 'Ajouter' : 'Modifier'} : ${escapeHtml(seed.name)}</h2>
        <button id="mx-close" class="btn-ghost btn-sm">Fermer</button>
      </header>
      <div id="mx-card-wrap"></div>
      <div class="flex-row" style="justify-content:flex-end">
        <button id="mx-cancel" class="btn-ghost">Annuler</button>
        <button id="mx-ok" class="btn-primary">${isNew ? 'Ajouter au programme' : 'Enregistrer'}</button>
      </div>
    </div>`;
}

// ✎ ({ index }) seeds the card with the exercise itself, without waiting; an add ({ target, prev? })
// loads the client history only when the caller did not pass it.
async function openExoModal(entryOrExo, placement) {
  const isNew = placement.index === undefined;
  const prev  = isNew && !('prev' in placement) ? await boClientPrev(entryOrExo.name) : placement.prev;
  const seed  = isNew ? buildProgrammeExerciseFromCatalog(entryOrExo, prev ?? null) : entryOrExo;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = boExoModalHtml(seed, isNew);
  document.body.appendChild(overlay);

  const wrap = overlay.querySelector('#mx-card-wrap');
  wrap.appendChild(makeExerciseCard(boModalCardOptions(seed)));

  const close = () => overlay.remove();
  overlay.querySelector('#mx-close').addEventListener('click', close);
  overlay.querySelector('#mx-cancel').addEventListener('click', close);
  overlay.querySelector('#mx-ok').addEventListener('click', () => {
    const card = wrap.querySelector('.exercise-card');
    boPlaceExercise(boModalSavedExercise(readExerciseCard(card), _progEditorState.category), placement);
    close();
  });
}

async function saveProgramme() {
  const errEl = document.getElementById('ed-err');
  const nameEl = document.getElementById('ed-name');
  errEl.classList.add('hidden');
  if (nameEl) nameEl.style.borderColor = '';
  const name = _progEditorState.name.trim();
  if (!name) {
    errEl.textContent = 'Donne un nom au programme.';
    errEl.classList.remove('hidden');
    if (nameEl) { nameEl.style.borderColor = 'var(--alert)'; nameEl.focus(); }
    return;
  }

  const payload = {
    name,
    exercises:                  programmeForSave(_progEditorState.exercises),
    category:                   _progEditorState.category,
    client_id:                  selClient.id,
    coach_id:                   coachId,
    estimated_duration_seconds: _progEditorState.estOverride,
  };

  let error;
  if (_progEditorState.existingId) {
    ({ error } = await db.from('programmes').update(payload).eq('id', _progEditorState.existingId));
  } else {
    const progs = await loadProgrammes(selClient.id);
    payload.ordre = progs.length;
    ({ error } = await db.from('programmes').insert(payload));
  }
  if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
  await renderDetailBody();
}

async function deleteProgramme(id) {
  showConfirmModal('Supprimer ce programme ?', async () => {
    await db.from('programmes').delete().eq('id', id);
    await renderDetailBody();
  });
}

/* ─── SESSIONS ──────────────────────────────────────── */
async function renderSessionList(body) {
  const sessions = await loadSessions(selClient.id);
  if (!sessions.length) {
    body.innerHTML = '<p class="bo-note">Aucune séance enregistrée.</p>';
    return;
  }
  body.innerHTML = sessions.map(s => {
    const dur = s.duration ? `${Math.floor(s.duration / 60)}min` : '';
    const exCount = (s.exercises || []).length;
    return `
      <div class="session-row">
        <div class="session-row-header">
          <span class="session-prog">${escapeHtml(s.programmeName || 'Séance libre')}</span>
          <span class="session-date">${s.date || ''}</span>
        </div>
        <div class="session-meta"><span class="bo-num">${exCount}</span> exercice(s)${dur ? ' · <span class="bo-num">' + dur + '</span>' : ''}</div>
      </div>`;
  }).join('');
}

/* ─── DONNÉES UTILISATEUR ──────────────────────────── */
async function renderUserData(body) {
  const [sessions, measurements] = await Promise.all([
    loadSessions(selClient.id),
    loadBodyMeasurements(selClient.id),
  ]);

  const createdAt = selClient.created_at
    ? new Date(selClient.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  const latestPoids = measurements.find(m => m.poids !== null && m.poids !== undefined)?.poids ?? '';

  // Identité (compact — une ligne de tags)
  body.innerHTML = `
    <div class="bo-compact-section">
      <p class="section-title">Identité</p>
      <div class="bo-id-row">
        <span class="bo-id-tag"><span class="bo-id-label">Prénom</span> ${escapeHtml(selClient.prenom || '—')}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Nom</span> ${escapeHtml(selClient.nom || '—')}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Email</span> ${escapeHtml(selClient.email || '—')}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Statut</span> <span class="bo-state bo-state--${selClient.state || 'new'}">${stateLabel(selClient.state)}</span></span>
        <span class="bo-id-tag"><span class="bo-id-label">Inscrit</span> ${createdAt}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Séances</span> <span class="bo-num">${sessions.filter(s => s.duration > 0).length}</span></span>
      </div>
    </div>
    <div class="bo-compact-section" style="margin-top:12px">
      <p class="section-title">Mesures</p>
      <div class="bo-id-row" style="gap:12px">
        <label class="bo-id-tag" style="display:flex;align-items:center;gap:6px">
          <span class="bo-id-label">Taille (cm)</span>
          <input type="number" id="bo-taille" min="50" max="250" step="1" value="${selClient.taille_cm ?? ''}" style="width:80px" />
        </label>
        <label class="bo-id-tag" style="display:flex;align-items:center;gap:6px">
          <span class="bo-id-label">Poids (kg)</span>
          <input type="number" id="bo-poids" min="20" max="400" step="0.1" value="${latestPoids}" style="width:80px" />
        </label>
        <button class="btn-primary btn-sm" id="bo-save-mesures">Enregistrer</button>
        <span id="bo-save-msg" class="bo-save-msg"></span>
      </div>
    </div>`;

  document.getElementById('bo-save-mesures').addEventListener('click', saveMesures);

  // Stats
  const sorted = sessions.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return;

  body.appendChild(boStatsProgression(sorted));
}

async function saveMesures() {
  const tailleEl = document.getElementById('bo-taille');
  const poidsEl  = document.getElementById('bo-poids');
  const msgEl    = document.getElementById('bo-save-msg');
  const btn      = document.getElementById('bo-save-mesures');

  const taille = tailleEl.value ? parseInt(tailleEl.value, 10) : null;
  const poids  = poidsEl.value  ? parseFloat(poidsEl.value)    : null;

  btn.disabled = true;
  msgEl.style.color = 'var(--mut)';
  msgEl.textContent = 'Enregistrement…';

  try {
    if (taille !== (selClient.taille_cm ?? null)) {
      const { error } = await db.from('profiles').update({ taille_cm: taille }).eq('id', selClient.id);
      if (error) throw error;
      selClient.taille_cm = taille;
    }

    if (poids !== null) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await db.from('body_measurements')
        .select('id').eq('client_id', selClient.id).eq('date', today).maybeSingle();

      const payload = existing
        ? { id: existing.id, client_id: selClient.id, date: today, poids }
        : { id: crypto.randomUUID(), client_id: selClient.id, date: today, poids };
      const { error } = await db.from('body_measurements').upsert(payload);
      if (error) throw error;
    }

    msgEl.style.color = 'var(--done)';
    msgEl.textContent = '✓ Enregistré';
  } catch (e) {
    msgEl.style.color = 'var(--alert)';
    msgEl.textContent = e.message || 'Erreur';
  } finally {
    btn.disabled = false;
    setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
  }
}

/* ─── SUIVI CORPOREL (lecture seule) ──────────────────── */
function leanMassKg(m) {
  if (m.poids == null) return null;
  if (m.graisse_kg != null) return m.poids - m.graisse_kg;
  if (m.img != null) return m.poids * (1 - m.img / 100);
  return null;
}

function fmtDateFr(iso) {
  const [, mo, d] = iso.split('-');
  return `${d}/${mo}`;
}

function linearTrend(values) {
  const n = values.length;
  if (n < 2) return null;
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return values.slice();
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  return xs.map(x => slope * x + intercept);
}

async function renderBodyTracking(body) {
  const measurements = await loadBodyMeasurements(selClient.id);

  if (!measurements.length) {
    body.innerHTML = '<p class="bo-note">Aucune mesure enregistrée.</p>';
    return;
  }

  const sorted = measurements.slice().sort((a, b) => a.date.localeCompare(b.date));

  // Première mesure avec masse maigre calculable (référence pour "prise de muscle")
  const firstLean = sorted.map(m => ({ date: m.date, lean: leanMassKg(m) })).find(x => x.lean != null);

  const metrics = [
    {
      label: 'Poids', unit: 'kg',
      extract: m => m.poids ?? null,
    },
    {
      label: 'Masse grasse', unit: '%',
      extract: m => m.img ?? null,
    },
    {
      label: 'Prise de muscle', unit: 'kg',
      extract: m => {
        if (!firstLean) return null;
        const lean = leanMassKg(m);
        return lean == null ? null : +(lean - firstLean.lean).toFixed(2);
      },
    },
  ];

  body.innerHTML = '';

  // Cartes résumé
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'stats-cards-grid';
  metrics.forEach(m => {
    const points = sorted.map(s => ({ date: s.date, value: m.extract(s) })).filter(p => p.value != null);
    if (!points.length) return;
    const first = points[0].value;
    const last  = points[points.length - 1].value;
    const delta = last - first;
    const deltaClass = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
    const deltaStr = delta === 0 ? '=' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${m.unit}`;

    const card = document.createElement('div');
    card.className = 'stats-exo-card';
    card.innerHTML = `
      <span class="stats-exo-name">${m.label}</span>
      <div class="stats-exo-values">
        <span class="stats-exo-start">${first.toFixed(1)}\u202F${m.unit}</span>
        <span class="stats-exo-arrow">→</span>
        <span class="stats-exo-end">${last.toFixed(1)}\u202F${m.unit}</span>
        <span class="stats-exo-delta ${deltaClass}">${deltaStr}</span>
      </div>
    `;
    cardsGrid.appendChild(card);
  });
  body.appendChild(cardsGrid);

  // Courbes avec tendance linéaire
  metrics.forEach(m => {
    const points = sorted.map(s => ({ date: s.date, value: m.extract(s) })).filter(p => p.value != null);
    if (points.length < 2) return;

    const section = document.createElement('div');
    section.className = 'stats-section';
    section.innerHTML = `<h3 class="stats-section-title">${m.label} (${m.unit})</h3>`;

    const wrap = document.createElement('div');
    wrap.className = 'stats-chart-wrap';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    section.appendChild(wrap);
    body.appendChild(section);

    const values = points.map(p => p.value);
    const trend  = linearTrend(values);
    const ink = boColor('ink');

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: points.map(p => fmtDateFr(p.date)),
        datasets: [
          {
            label: m.label,
            data: values,
            borderColor: ink,
            backgroundColor: ink + '14',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: ink,
            tension: 0.3,
            fill: true,
          },
          {
            label: 'Tendance',
            data: trend,
            borderColor: boColor('mut'),
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0,
          },
        ],
      },
      options: boChartOptions(ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} ${m.unit}`),
    });
  });
}

/* ─── STATS HELPERS (backoffice) ──────────────────────── */

function boStatsSection(title) {
  const section = document.createElement('div');
  section.className = 'stats-section';
  const h = document.createElement('h3');
  h.className = 'stats-section-title';
  h.textContent = title;
  section.appendChild(h);
  return section;
}

function boExoMetrics(ex, session) {
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

// A Carnet colour, read from the CSS variables of backoffice.html.
function boColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
}

// Series i of a chart: ink, done, mut solid, then the same dashed (alert is kept for events).
function boSeriesStyle(i) {
  const tokens = ['ink', 'done', 'mut'];
  return { token: tokens[i % 3], dash: i % 6 >= 3 ? [6, 4] : [] };
}

// Shared Chart.js look: rule axes and grid, mut IBM Plex Mono 12 px labels, ink tooltip.
function boChartOptions(tooltipLabel, yTick) {
  const ink = boColor('ink');
  const paper = boColor('paper');
  const mut = boColor('mut');
  const rule = boColor('rule');
  const mono = { family: "'IBM Plex Mono', monospace", size: 12 };
  const axis = { grid: { color: rule, drawTicks: false }, border: { color: rule } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true, position: 'bottom',
        labels: { color: mut, font: mono, boxWidth: 24, boxHeight: 0, padding: 12 },
      },
      tooltip: {
        backgroundColor: ink,
        borderWidth: 0,
        titleColor: paper,
        bodyColor: paper,
        titleFont: { ...mono, weight: '600' },
        bodyFont: mono,
        cornerRadius: 6,
        padding: 10,
        callbacks: { label: tooltipLabel },
      },
    },
    scales: {
      x: { ...axis, ticks: { color: mut, font: mono, maxRotation: 45, padding: 8 } },
      y: { ...axis, ticks: { color: mut, font: mono, padding: 8, ...(yTick ? { callback: yTick } : {}) } },
    },
  };
}

function boStatsProgression(sessions) {
  const section = boStatsSection('Progression');

  // Collect distinct programmes
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
        return boExoMetrics(ex, s);
      }).filter(Boolean);
      return { name, points };
    }).filter(d => d.points.length >= 1);
  }

  function render() {
    const exoData = buildExoData(activeProg);
    const unit = activeMetric === 'volume' ? 'kg' : 'kg';

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
        <span class="stats-exo-name">${escapeHtml(exo.name)}</span>
        <div class="stats-exo-values">
          <span class="stats-exo-start">${fmt(first)}\u202F${unit}</span>
          <span class="stats-exo-arrow">→</span>
          <span class="stats-exo-end">${fmt(last)}\u202F${unit}</span>
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
      const style = boSeriesStyle(i);
      const color = boColor(style.token);
      const dateMap = {};
      exo.points.forEach(p => { dateMap[p.date] = p[activeMetric]; });
      return {
        label: exo.name,
        data: allDates.map(d => dateMap[d] ?? null),
        borderColor: color,
        backgroundColor: color + '22',
        borderDash: style.dash,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
        tension: 0.3,
        spanGaps: true,
      };
    });

    const fmtValue = v => activeMetric === 'volume' ? Math.round(v) : v.toFixed(1);
    chartInstance = new Chart(canvas, {
      type: 'line',
      data: { labels: allDates.map(d => d.slice(5).replace('-', '/')), datasets },
      options: {
        ...boChartOptions(ctx => `${ctx.dataset.label}: ${fmtValue(ctx.parsed.y)} ${unit}`, fmtValue),
        interaction: { mode: 'index', intersect: false },
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

/* ─── CONFIRM MODAL ─────────────────────────────────── */
function showConfirmModal(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <p class="bo-confirm-msg">${message}</p>
      <div class="flex-row" style="justify-content:flex-end">
        <button class="btn-secondary" id="cm-cancel">Annuler</button>
        <button class="btn-danger"    id="cm-ok">Supprimer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cm-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#cm-ok').addEventListener('click', () => { overlay.remove(); onConfirm(); });
}

async function sendInvite(client) {
  const btn = document.getElementById('send-invite');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    const redirectTo = window.location.origin + '/set-password.html';
    const { error } = await db.auth.resetPasswordForEmail(client.email, { redirectTo });
    if (error) throw new Error(error.message);
    await db.from('profiles').update({ state: 'invited' }).eq('id', client.id);
    client.state = 'invited';
    await renderClientDetail();
    showSuccessModal(client.email);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Envoyer l\'invitation';
    alert('Erreur : ' + err.message);
  }
}

function showSuccessModal(email) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <p class="bo-success-mark">✓</p>
      <h2>Compte créé !</h2>
      <p class="bo-note">
        Un email d'invitation a été envoyé à<br>
        <strong class="bo-strong">${escapeHtml(email)}</strong><br>
        pour que le client définisse son mot de passe.
      </p>
      <button class="btn-primary btn-full" id="sm-ok">Fermer</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#sm-ok').addEventListener('click', () => overlay.remove());
}

/* ─── ADD CLIENT MODAL ──────────────────────────────── */
function showAddClientModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Nouveau client</h2>
      <input type="text"  id="m-prenom" placeholder="Prénom" />
      <input type="text"  id="m-nom"    placeholder="Nom" />
      <input type="email" id="m-email"  placeholder="Email" />
      <p class="error-msg hidden" id="m-err"></p>
      <div class="flex-row">
        <button class="btn-primary" id="m-create">Créer le client</button>
        <button class="btn-secondary" id="m-cancel">Annuler</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('m-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('m-create').addEventListener('click', async () => {
    const prenom = document.getElementById('m-prenom').value.trim();
    const nom    = document.getElementById('m-nom').value.trim();
    const email  = document.getElementById('m-email').value.trim();
    const errEl  = document.getElementById('m-err');
    const btn    = document.getElementById('m-create');
    errEl.classList.add('hidden');

    if (!email) {
      errEl.textContent = 'L\'email est requis.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Création en cours…';

    try {
      // Mot de passe temporaire aléatoire (le client le remplacera via le lien)
      const tempPass = crypto.randomUUID().replace(/-/g, '').slice(0, 12) + 'Aa1!';
      const newUserId = await createClientAccount(email, tempPass);

      // Attendre que le trigger Supabase crée le profil
      await new Promise(r => setTimeout(r, 800));

      const { error: linkError } = await db.rpc('link_client_to_coach', {
        p_client_id: newUserId,
        p_coach_id:  coachId,
      });
      if (linkError) throw new Error(`Liaison échouée : ${linkError.message}`);

      await db.from('profiles').update({ nom, prenom, email }).eq('id', newUserId);

      overlay.remove();
      await loadClients();
      renderClientList();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Créer le client';
    }
  });
}

/* ─── DELETE CLIENT ─────────────────────────────────── */
async function deleteClient(id) {
  showConfirmModal('Supprimer ce client et toutes ses données ?<span class="bo-confirm-note">Programmes et séances seront définitivement supprimés.</span>', async () => {
    const { error } = await db.rpc('delete_client', { p_client_id: id, p_coach_id: coachId });
    if (error) { alert('Erreur : ' + error.message); return; }
    selClient = null;
    await loadClients();
    renderClientList();
    document.getElementById('bo-main').innerHTML = '<div class="bo-main-placeholder">← Sélectionnez un client</div>';
  });
}
