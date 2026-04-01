/* ═══════════════════════════════════════════════════════
   COACH MIKE — Backoffice
═══════════════════════════════════════════════════════ */

let coachId   = null;
let clients   = [];
let selClient = null; // client complet sélectionné
let selTab    = 'programmes';

const root = document.getElementById('bo-root');

/* ─── INIT ─────────────────────────────────────────── */
(async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { renderLogin(); return; }
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

/* ─── DASHBOARD ─────────────────────────────────────── */
function renderDashboard() {
  root.innerHTML = `
    <div class="bo-layout">
      <div class="bo-sidebar">
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
  renderClientList();
}

function renderClientList() {
  const el = document.getElementById('bo-clients-list');
  if (!el) return;
  if (!clients.length) {
    el.innerHTML = '<p class="bo-empty">Aucun client.<br>Ajoutez-en un !</p>';
    return;
  }
  el.innerHTML = clients.map(c => `
    <div class="bo-client-item ${selClient?.id === c.id ? 'active' : ''}" data-id="${c.id}">
      <div class="bo-client-name">${c.prenom || ''} ${c.nom || ''}</div>
      <div class="bo-client-email">${c.email || ''}</div>
    </div>`).join('');
  el.querySelectorAll('.bo-client-item').forEach(el => {
    el.addEventListener('click', () => selectClient(el.dataset.id));
  });
}

async function selectClient(id) {
  selClient = clients.find(c => c.id === id) || null;
  selTab = 'programmes';
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
          <button class="btn-danger btn-sm" id="del-client">Supprimer</button>
        </div>
        <div class="bo-tabs">
          <button class="bo-tab ${selTab === 'programmes' ? 'active' : ''}" data-tab="programmes">Programmes</button>
          <button class="bo-tab ${selTab === 'sessions' ? 'active' : ''}" data-tab="sessions">Séances</button>
        </div>
      </div>
      <div class="bo-detail-body" id="bo-detail-body">
        <p style="color:var(--muted)">Chargement…</p>
      </div>
    </div>`;

  document.getElementById('del-client').addEventListener('click', () => deleteClient(selClient.id));
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
  else await renderSessionList(body);
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
        <button class="btn-primary" id="m-create">Créer et envoyer l'invitation</button>
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

      // Envoyer le mail d'invitation avec lien pour définir le mot de passe
      const redirectTo = window.location.origin + '/set-password.html';
      const { error: mailError } = await db.auth.resetPasswordForEmail(email, { redirectTo });
      if (mailError) throw new Error(`Mail non envoyé : ${mailError.message}`);

      overlay.remove();
      await loadClients();
      renderClientList();
      showSuccessModal(email);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Créer et envoyer l\'invitation';
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
