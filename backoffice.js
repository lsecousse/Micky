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
          <button class="bo-tab ${selTab === 'body' ? 'active' : ''}" data-tab="body">Suivi corporel</button>
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
  else if (selTab === 'body') await renderBodyTracking(body);
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
          <button class="btn-secondary btn-sm" data-copy="${p.id}">Copier</button>
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
        <h2>Copier "${prog.name}"</h2>
        <p style="color:var(--muted);font-size:13px">Aucun autre client à qui copier ce programme.</p>
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
      <h2>Copier "${prog.name}" vers :</h2>
      <div id="cp-targets" style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto">
        ${targets.map(c => `
          <button class="btn-secondary" data-target="${c.id}" style="text-align:left">
            ${(c.prenom || '') + ' ' + (c.nom || '')} <span style="color:var(--muted);font-size:12px">${c.email || ''}</span>
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
        <span class="bo-id-tag"><span class="bo-id-label">Prénom</span> ${selClient.prenom || '—'}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Nom</span> ${selClient.nom || '—'}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Email</span> ${selClient.email || '—'}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Statut</span> <span class="bo-state bo-state--${selClient.state || 'new'}">${stateLabel(selClient.state)}</span></span>
        <span class="bo-id-tag"><span class="bo-id-label">Inscrit</span> ${createdAt}</span>
        <span class="bo-id-tag"><span class="bo-id-label">Séances</span> ${sessions.filter(s => s.duration > 0).length}</span>
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
        <span id="bo-save-msg" style="font-size:12px;color:var(--muted)"></span>
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
  msgEl.style.color = 'var(--muted)';
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

    msgEl.style.color = '#4caf50';
    msgEl.textContent = '✓ Enregistré';
  } catch (e) {
    msgEl.style.color = 'var(--danger)';
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
    body.innerHTML = '<p style="color:var(--muted);font-size:13px">Aucune mesure enregistrée.</p>';
    return;
  }

  const sorted = measurements.slice().sort((a, b) => a.date.localeCompare(b.date));

  // Première mesure avec masse maigre calculable (référence pour "prise de muscle")
  const firstLean = sorted.map(m => ({ date: m.date, lean: leanMassKg(m) })).find(x => x.lean != null);

  const metrics = [
    {
      label: 'Poids', unit: 'kg', color: '#9A7A30',
      extract: m => m.poids ?? null,
    },
    {
      label: 'Masse grasse', unit: '%', color: '#e53e3e',
      extract: m => m.img ?? null,
    },
    {
      label: 'Prise de muscle', unit: 'kg', color: '#4caf50',
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
        <span class="stats-exo-start">${first.toFixed(1)} ${m.unit}</span>
        <span class="stats-exo-arrow">→</span>
        <span class="stats-exo-end">${last.toFixed(1)} ${m.unit}</span>
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

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: points.map(p => fmtDateFr(p.date)),
        datasets: [
          {
            label: m.label,
            data: values,
            borderColor: m.color,
            backgroundColor: m.color + '33',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: true,
          },
          {
            label: 'Tendance',
            data: trend,
            borderColor: m.color,
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true, position: 'bottom',
            labels: { color: '#888', font: { family: "'DM Mono', monospace", size: 11 }, boxWidth: 12, padding: 10 },
          },
          tooltip: {
            backgroundColor: '#1a1a1a',
            borderColor: '#2e2e2e',
            borderWidth: 1,
            titleColor: '#f0f0f0',
            bodyColor: '#f0f0f0',
            titleFont: { family: "'DM Mono', monospace" },
            bodyFont: { family: "'DM Mono', monospace" },
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} ${m.unit}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#888', font: { family: "'DM Mono', monospace", size: 10 } },
            grid:  { color: '#2e2e2e' },
          },
          y: {
            ticks: { color: '#888', font: { family: "'DM Mono', monospace", size: 10 } },
            grid:  { color: '#2e2e2e' },
          },
        },
      },
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

const CHART_COLORS = [
  '#9A7A30', '#4caf50', '#2196f3', '#e53e3e', '#ff9800',
  '#9c27b0', '#00bcd4', '#8bc34a', '#ff5722', '#607d8b',
];

function boStatsProgression(sessions) {
  const section = boStatsSection('Progression');

  // Collect distinct programmes
  const progNames = [...new Set(sessions.map(s => s.programme_name).filter(Boolean))].sort();
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
    const progSessions = sessions.filter(s => s.programme_name === progName);
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
        <span class="stats-exo-name">${exo.name}</span>
        <div class="stats-exo-values">
          <span class="stats-exo-start">${fmt(first)} ${unit}</span>
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
            labels: { color: '#888', font: { family: "'DM Mono', monospace", size: 11 }, boxWidth: 12, padding: 10 },
          },
          tooltip: {
            backgroundColor: '#1a1a1a',
            borderColor: '#2e2e2e',
            borderWidth: 1,
            titleColor: '#f0f0f0',
            bodyColor: '#f0f0f0',
            titleFont: { family: "'DM Mono', monospace" },
            bodyFont: { family: "'DM Mono', monospace" },
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${activeMetric === 'volume' ? Math.round(ctx.parsed.y) : ctx.parsed.y.toFixed(1)} ${unit}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#555', font: { family: "'DM Mono', monospace", size: 10 } },
            grid: { color: '#1a1a1a' },
          },
          y: {
            ticks: {
              color: '#555',
              font: { family: "'DM Mono', monospace", size: 10 },
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
