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
  password_created: { label: 'Mot de passe créé', icon: '🔑' },
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
        <h1>Coach Mike</h1>
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
  const { data } = await db.from('sessions')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
    .limit(50);
  return data || [];
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
    <div class="bo-sidebar-overlay" id="bo-sidebar-overlay"></div>
    <div class="bo-layout">
      <div class="bo-sidebar" id="bo-sidebar">
        <div class="bo-sidebar-header">
          <span class="bo-logo">Coach Mike</span>
          <button class="btn-ghost btn-sm" id="bo-logout">Déconnexion</button>
        </div>
        <div class="bo-clients" id="bo-clients-list"></div>
        <div class="bo-sidebar-footer">
          <button class="btn-primary btn-full" id="bo-add-client">+ Nouveau client</button>
        </div>
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
      <div class="bo-client-name">${c.prenom || ''} ${c.nom || ''} <span class="bo-state-dot bo-state--${c.state || 'new'}" title="${s.label}">${s.icon}</span></div>
      <div class="bo-client-email">${c.email || ''}</div>
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
          ${selClient.prenom || ''} ${selClient.nom || ''}
          <span style="font-size:12px;color:var(--muted);font-weight:normal">${selClient.email || ''}</span>
          <span class="bo-state bo-state--${selClient.state || 'new'}">${stateLabel(selClient.state)}</span>
          ${(selClient.state || 'new') === 'new' ? '<button class="btn-primary btn-sm" id="send-invite">✉ Envoyer l\'invitation</button>' : ''}
          <button class="btn-danger btn-sm" id="del-client">Supprimer</button>
        </div>
        <div class="bo-tabs">
          <button class="bo-tab ${selTab === 'userdata' ? 'active' : ''}" data-tab="userdata">Données utilisateur</button>
          <button class="bo-tab ${selTab === 'programmes' ? 'active' : ''}" data-tab="programmes">Programmes</button>
          <button class="bo-tab ${selTab === 'sessions' ? 'active' : ''}" data-tab="sessions">Séances</button>
        </div>
      </div>
      <div class="bo-detail-body" id="bo-detail-body">
        <p style="color:var(--muted)">Chargement…</p>
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
}

/* ─── PROGRAMMES ────────────────────────────────────── */
async function renderProgrammeList(body) {
  const progs = await loadProgrammes(selClient.id);
  let html = `<button class="btn-primary btn-sm" id="new-prog" style="margin-bottom:16px">+ Nouveau programme</button>`;
  if (!progs.length) {
    html += '<p style="color:var(--muted);font-size:13px">Aucun programme pour ce client.</p>';
  } else {
    html += progs.map(p => `
      <div class="prog-row">
        <div>
          <div class="prog-row-name">${p.name}</div>
          <div class="prog-row-count">${(p.exercises || []).length} exercice(s)</div>
        </div>
        <div class="prog-row-actions">
          <button class="btn-secondary btn-sm" data-edit="${p.id}">Modifier</button>
          <button class="btn-danger btn-sm" data-del="${p.id}">Suppr.</button>
        </div>
      </div>`).join('');
  }
  body.innerHTML = html;
  document.getElementById('new-prog').addEventListener('click', () => renderProgrammeEditor(null));
  body.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prog = progs.find(p => p.id === btn.dataset.edit);
      if (prog) renderProgrammeEditor(prog);
    });
  });
  body.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteProgramme(btn.dataset.del));
  });
}

function renderProgrammeEditor(existingProg) {
  const body = document.getElementById('bo-detail-body');

  body.innerHTML = `
    <div class="bo-editor">
      <div class="flex-row">
        <button class="btn-ghost btn-sm" id="ed-back">← Retour</button>
        <span class="bo-editor-title">${existingProg ? 'Modifier' : 'Nouveau'} programme</span>
      </div>
      <input type="text" id="ed-name" placeholder="Nom du programme" value="${existingProg?.name || ''}" />
      <p class="section-title">Exercices</p>
      <div id="ed-exos"></div>
      <button class="btn-secondary btn-sm" id="ed-add-ex">+ Exercice</button>
      <div class="flex-row" style="margin-top:8px">
        <button class="btn-primary" id="ed-save">Enregistrer</button>
      </div>
      <p class="error-msg hidden" id="ed-err"></p>
    </div>`;

  const exosContainer = document.getElementById('ed-exos');
  const exos = existingProg?.exercises || [{}];
  exos.forEach(ex => {
    const m    = migrateExercise(ex);
    const acts = m.activities.map(act => ({
      type:     act.type,
      name:     act.name     || '',
      reps:     act.type === 'weight' ? (act.reps     ?? '') : '',
      weight:   act.type === 'weight' ? (act.weight   ?? '') : '',
      duration: act.type !== 'weight' ? (act.duration ?? '') : '',
      rest:     act.rest ?? '',
    }));
    exosContainer.appendChild(makeExerciseCard({
      name:       ex.name    || '',
      sets:       ex.sets    || m.series?.length || ex.count || 3,
      activities: acts,
      comment:    ex.comment || '',
    }));
  });

  document.getElementById('ed-back').addEventListener('click', () => renderDetailBody());
  document.getElementById('ed-add-ex').addEventListener('click', () => exosContainer.appendChild(makeExerciseCard()));
  document.getElementById('ed-save').addEventListener('click', () => saveProgramme(existingProg?.id || null));
}

async function saveProgramme(existingId) {
  const name  = document.getElementById('ed-name').value.trim();
  const errEl = document.getElementById('ed-err');
  errEl.classList.add('hidden');
  if (!name) { errEl.textContent = 'Donne un nom au programme.'; errEl.classList.remove('hidden'); return; }

  const cards    = document.querySelectorAll('#ed-exos .exercise-card');
  const exercises = Array.from(cards).map(readExerciseCard);

  const payload = { name, exercises, client_id: selClient.id, coach_id: coachId };

  let error;
  if (existingId) {
    ({ error } = await db.from('programmes').update(payload).eq('id', existingId));
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
    body.innerHTML = '<p style="color:var(--muted);font-size:13px">Aucune séance enregistrée.</p>';
    return;
  }
  body.innerHTML = sessions.map(s => {
    const dur = s.duration ? `${Math.floor(s.duration / 60)}min` : '';
    const exCount = (s.exercises || []).length;
    return `
      <div class="session-row">
        <div class="session-row-header">
          <span class="session-prog">${s.programme_name || 'Séance libre'}</span>
          <span class="session-date">${s.date || ''}</span>
        </div>
        <div class="session-meta">${exCount} exercice(s)${dur ? ' · ' + dur : ''}</div>
      </div>`;
  }).join('');
}

/* ─── DONNÉES UTILISATEUR ──────────────────────────── */
async function renderUserData(body) {
  const sessions = await loadSessions(selClient.id);

  const createdAt = selClient.created_at
    ? new Date(selClient.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  // Identité (compact — une ligne de tags)
  body.innerHTML = `
    <div class="bo-compact-section">
      <p class="section-title">Identité</p>
      <div class="bo-id-row">
        <span class="bo-id-tag"><span class="bo-id-label">Prénom</span> ${selClient.prenom || '—'}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Nom</span> ${selClient.nom || '—'}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Email</span> ${selClient.email || '—'}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Statut</span> <span class="bo-state bo-state--${selClient.state || 'new'}">${stateLabel(selClient.state)}</span></span>
        <span class="bo-id-tag"><span class="bo-id-label">Inscrit</span> ${createdAt}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Séances</span> ${sessions.filter(s => s.duration > 0).length}</span>
      </div>
    </div>`;

  // Stats
  const sorted = sessions.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return;

  body.appendChild(boStatsSummary(sorted));
  body.appendChild(boStatsFrequency(sorted));
  body.appendChild(boStatsProgression(sorted));
}

/* ─── STATS HELPERS (backoffice) ──────────────────────── */

function boSessionVolume(session) {
  return (session.exercises || []).reduce((sum, ex) => {
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

function boStatsSection(title) {
  const section = document.createElement('div');
  section.className = 'stats-section';
  const h = document.createElement('h3');
  h.className = 'stats-section-title';
  h.textContent = title;
  section.appendChild(h);
  return section;
}

function boStatsSummary(sessions) {
  const section = boStatsSection('Résumé');
  const totalVol = sessions.reduce((s, se) => s + boSessionVolume(se), 0);
  const totalDur = sessions.reduce((s, se) => s + (se.duration || 0), 0);
  const best = sessions.reduce((b, s) => {
    const v = boSessionVolume(s);
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

function boIsoWeekKey(dateStr) {
  const d = new Date(dateStr);
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

function boStatsFrequency(sessions) {
  const section = boStatsSection('Fréquence');

  const weekMap = {};
  sessions.forEach(s => {
    const k = boIsoWeekKey(s.date);
    weekMap[k] = (weekMap[k] || 0) + 1;
  });

  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = boIsoWeekKey(d.toISOString().slice(0, 10));
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

function boStatsProgression(sessions) {
  const section = boStatsSection('Progression par exercice');

  const names = [...new Set(sessions.flatMap(s => (s.exercises || []).map(e => e.name)))].sort();
  if (!names.length) return section;

  const machineData = names.map(name => {
    let muscle = '';
    const points = sessions.map(s => {
      const ex = (s.exercises || []).find(e => e.name === name);
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

  // Muscle pills
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

  // Exercise swap selector (PC: arrows + keyboard)
  const swapBar = document.createElement('div');
  swapBar.className = 'stats-swap';
  const prevBtn = document.createElement('button');
  prevBtn.className = 'stats-swap-btn';
  prevBtn.textContent = '‹';
  prevBtn.title = 'Précédent (←)';
  const swapName = document.createElement('span');
  swapName.className = 'stats-swap-name';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'stats-swap-btn';
  nextBtn.textContent = '›';
  nextBtn.title = 'Suivant (→)';
  swapBar.appendChild(prevBtn);
  swapBar.appendChild(swapName);
  swapBar.appendChild(nextBtn);
  section.appendChild(swapBar);

  const swapCounter = document.createElement('div');
  swapCounter.className = 'stats-swap-counter';
  section.appendChild(swapCounter);

  // Metric toggle
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

    const gridLines = [minV, minV + range / 2, maxV];
    const gridSvg = gridLines.map(v =>
      `<line x1="${pad.l}" y1="${y(v).toFixed(1)}" x2="${W - pad.r}" y2="${y(v).toFixed(1)}" stroke="#1a1a1a" stroke-width="1"/>
       <text x="${pad.l - 6}" y="${y(v).toFixed(1)}" dy="3.5" text-anchor="end" font-size="10" fill="#555">${activeMetric === 'volume' ? Math.round(v) : v}</text>`
    ).join('');

    const areaPath = `M${x(0).toFixed(1)},${y(vals[0]).toFixed(1)} ` +
      vals.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') +
      ` L${x(vals.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;

    const linePath = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

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
          <linearGradient id="boAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#9A7A30" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#9A7A30" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" stroke="#2a2a2a" stroke-width="1"/>
        ${gridSvg}
        <path d="${areaPath}" fill="url(#boAreaGrad)"/>
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

  // Keyboard arrows (PC)
  section.setAttribute('tabindex', '0');
  section.style.outline = 'none';
  section.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' && currentIdx > 0) { currentIdx--; renderGraph(); e.preventDefault(); }
    if (e.key === 'ArrowRight' && currentIdx < filtered.length - 1) { currentIdx++; renderGraph(); e.preventDefault(); }
  });

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

/* ─── CONFIRM MODAL ─────────────────────────────────── */
function showConfirmModal(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <p style="font-size:14px;line-height:1.6">${message}</p>
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
    btn.textContent = '✉ Envoyer l\'invitation';
    alert('Erreur : ' + err.message);
  }
}

function showSuccessModal(email) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="text-align:center;gap:16px">
      <div style="font-size:40px">✓</div>
      <h2>Compte créé !</h2>
      <p style="color:var(--muted);font-size:13px;line-height:1.6">
        Un email d'invitation a été envoyé à<br>
        <strong style="color:var(--text)">${email}</strong><br>
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
  showConfirmModal('Supprimer ce client et toutes ses données ?<br><span style="color:var(--danger);font-size:12px">Programmes et séances seront définitivement supprimés.</span>', async () => {
    const { error } = await db.rpc('delete_client', { p_client_id: id, p_coach_id: coachId });
    if (error) { alert('Erreur : ' + error.message); return; }
    selClient = null;
    await loadClients();
    renderClientList();
    document.getElementById('bo-main').innerHTML = '<div class="bo-main-placeholder">← Sélectionnez un client</div>';
  });
}
