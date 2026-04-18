# Feedback IA persistant — Plan d'implémentation (Lot B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persister le feedback IA post-séance en BDD et l'afficher dans le modal d'historique, avec un bouton "Générer l'analyse IA" sur les séances sans feedback existant.

**Architecture:**
Une colonne `feedback_ia text` sur `public.sessions` stocke le texte brut renvoyé par Claude. Une nouvelle fonction `updateSessionFeedbackDB(id, feedback)` écrit depuis le client. `loadSessionsDB` inclut le champ dans son mapping. Côté UI, `showPostSessionFeedback` écrit en DB juste après l'affichage, et `openModal` (détail séance) affiche soit le feedback stocké, soit un bouton de génération à la demande.

**Tech Stack:** vanilla JS, Supabase (Postgres + RLS), aucune infra de test unitaire. Validation manuelle en navigateur.

---

### Task 1 — Migration SQL : ajouter la colonne `feedback_ia`

**Files:**
- Modify: `supabase-schema.sql` (ajouter la colonne dans la définition pour futures réinstalls)

- [ ] **Step 1 : Exécuter la migration sur la DB de dev**

Via l'outil MCP Supabase (ou l'interface Supabase SQL Editor), lancer :

```sql
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS feedback_ia text;
```

Cette migration est idempotente (`IF NOT EXISTS`), les séances existantes auront `NULL` par défaut.

- [ ] **Step 2 : Vérifier le schéma**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'feedback_ia';
```

Attendu : 1 ligne, `text`.

- [ ] **Step 3 : Mettre à jour `supabase-schema.sql` pour les futurs setups**

Dans `/home/lsecousse/WebstormProjects/Micky/supabase-schema.sql`, trouver la définition de `create table if not exists public.sessions (...)` (ligne 63-73 environ), et ajouter une ligne avant `created_at` :

```
  feedback_ia    text,
```

Le bloc final doit ressembler à :

```sql
create table if not exists public.sessions (
  id             text primary key,
  client_id      uuid references public.profiles(id) on delete cascade,
  programme_name text,
  programme_id   text,
  date           text,
  started_at     text,
  duration       int,
  exercises      jsonb default '[]'::jsonb,
  feedback_ia    text,
  created_at     timestamptz default now()
);
```

- [ ] **Step 4 : Commit**

```bash
git add supabase-schema.sql
git commit -m "feat(db): colonne feedback_ia sur public.sessions"
```

---

### Task 2 — `supabase.js` : écrire et lire le feedback

**Files:**
- Modify: `supabase.js` — `loadSessionsDB` (26–41) et ajout d'une nouvelle fonction.

- [ ] **Step 1 : Ajouter `feedbackIa` au mapping de `loadSessionsDB`**

Dans `supabase.js`, remplacer le bloc `return (data || []).map(row => ({ ... }));` dans `loadSessionsDB` par :

```js
  return (data || []).map(row => ({
    id:            row.id,
    programmeName: row.programme_name,
    programmeId:   row.programme_id || null,
    category:      row.category || 'fonte',
    date:          row.date,
    startedAt:     row.started_at,
    duration:      row.duration,
    exercises:     row.exercises || [],
    sync:          row.sync || null,
    feedbackIa:    row.feedback_ia || null,
  }));
```

Le nom côté client est `feedbackIa` (camelCase) même si la colonne SQL est `feedback_ia`.

- [ ] **Step 2 : Ajouter la fonction `updateSessionFeedbackDB`**

Dans `supabase.js`, ajouter après `deleteSessionDB` (ligne 68 environ) :

```js
/* Persiste le feedback IA d'une séance */
async function updateSessionFeedbackDB(id, feedback) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const { error } = await db.from('sessions')
    .update({ feedback_ia: feedback })
    .eq('id', id)
    .eq('client_id', user.id);
  if (error) console.error('updateSessionFeedbackDB error:', error);
}
```

- [ ] **Step 3 : Vérifier l'exposition globale**

Le projet n'utilise pas de bundler : toutes les fonctions du fichier `supabase.js` sont globales. Vérifier que rien ne bloque l'accès :

```bash
grep -n "updateSessionFeedbackDB" /home/lsecousse/WebstormProjects/Micky/supabase.js
```

Attendu : 1 match (la définition).

- [ ] **Step 4 : Syntax check**

```bash
node -c /home/lsecousse/WebstormProjects/Micky/supabase.js
```

Exit 0 attendu.

- [ ] **Step 5 : Commit**

```bash
git add supabase.js
git commit -m "feat(feedback-ia): helpers Supabase pour lecture et écriture du feedback"
```

---

### Task 3 — Extraire la génération du feedback IA dans une fonction réutilisable

**Files:**
- Modify: `app.js` — `showPostSessionFeedback` (~2193) et helpers voisins.

- [ ] **Step 1 : Ajouter `generateAndPersistFeedback(session)` juste avant `showPostSessionFeedback`**

Dans `app.js`, localiser la section `/* FEEDBACK IA (Claude API) */` (ligne 2182 environ). Juste après la constante `COACH_PROMPT` et avant `async function showPostSessionFeedback(session)`, insérer :

```js
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
      system: COACH_PROMPT,
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
```

- [ ] **Step 2 : Refactorer `showPostSessionFeedback` pour utiliser le helper**

Dans `app.js`, remplacer intégralement la fonction `showPostSessionFeedback` (qui va de `async function showPostSessionFeedback(session)` jusqu'à sa `}` de clôture, vers ligne 2270 environ) par :

```js
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
```

Le flux est identique mais les ~40 lignes de construction du userMessage + fetch + parsing sont maintenant dans `generateAndPersistFeedback`. `session.feedbackIa` est maintenant peuplé en DB de manière transparente pour le caller.

- [ ] **Step 3 : Syntax check**

```bash
node -c /home/lsecousse/WebstormProjects/Micky/app.js
```

Exit 0.

- [ ] **Step 4 : Validation manuelle**

Démarrer le serveur dev :

```bash
cd /home/lsecousse/WebstormProjects/Micky && python3 -m http.server 8000
```

Ouvrir `http://localhost:8000`, démarrer une séance de test, la terminer. Attendu :
- Le modal "Analyse en cours…" puis "🤖 Feedback IA" s'affiche comme avant.
- En BDD, la séance finie a sa colonne `feedback_ia` peuplée. Vérifier via l'outil SQL Supabase :
  ```sql
  SELECT id, date, programme_name, LENGTH(feedback_ia) AS fb_len
  FROM public.sessions
  WHERE client_id = '<ton user.id>'
  ORDER BY started_at DESC LIMIT 3;
  ```

- [ ] **Step 5 : Commit**

```bash
git add app.js
git commit -m "feat(feedback-ia): persister le feedback en DB après génération post-séance"
```

---

### Task 4 — Afficher le feedback dans le modal d'historique + bouton générer

**Files:**
- Modify: `app.js` — `openModal` (~2104)
- Modify: `style.css` — ajout d'une règle pour le bouton "Générer l'analyse IA" si besoin

- [ ] **Step 1 : Modifier `openModal` pour inclure le bloc feedback**

Dans `app.js`, dans la fonction `openModal(session)` (~2104), juste AVANT la ligne `const isAbandoned = !session.duration;` (vers ligne 2152), ajouter le rendu du bloc feedback :

```js
  // Bloc feedback IA
  if (session.feedbackIa) {
    html += `
      <div class="feedback-ia-card">
        <div class="feedback-ia-title">🤖 Feedback IA</div>
        <div class="feedback-ia-content">${formatFeedback(session.feedbackIa)}</div>
      </div>
    `;
  } else if (!isAbandoned) {
    // Séance terminée sans feedback : proposer la génération
    html += `
      <div class="feedback-ia-generate" id="feedback-ia-generate-wrap">
        <button class="btn-primary" id="feedback-ia-generate">🤖 Générer l'analyse IA</button>
      </div>
    `;
  }
```

Note : le flag `isAbandoned` est défini juste après ce bloc dans l'ordre actuel. Pour que `isAbandoned` soit utilisable AVANT, déplacer sa déclaration JUSTE au début de `openModal`, après les lignes de calcul de `name`, `done`, `planned`, `volDisplay`. Le nouveau placement :

```js
function openModal(session) {
  const body = document.getElementById('modal-body');
  const done = totalVolume(session.exercises);
  const planned = plannedVolume(session.exercises);
  const name = session.programmeName || session.name || 'Séance';
  const volDisplay = planned > 0 && done !== planned
    ? `${done.toLocaleString('fr-FR')} kg / ${planned.toLocaleString('fr-FR')} kg`
    : `${done.toLocaleString('fr-FR')} kg`;
  const isAbandoned = !session.duration;

  const timeLine = /* ... */
  /* ... */
```

Puis supprimer la ligne dupliquée `const isAbandoned = !session.duration;` qui était en bas.

- [ ] **Step 2 : Câbler le bouton "Générer l'analyse IA"**

Dans la même fonction `openModal`, juste après l'assignation `body.innerHTML = html;` (vers 2158) et les `addEventListener` existants, ajouter :

```js
  const generateBtn = document.getElementById('feedback-ia-generate');
  if (generateBtn) {
    const apiKeyConfigured = await getClaudeApiKeyDB();
    if (!apiKeyConfigured) {
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
          session.feedbackIa = feedback; // mettre à jour l'objet in-memory
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
```

`openModal` devient donc `async function openModal(session)`. Vérifier et rendre async : remplacer `function openModal(session) {` par `async function openModal(session) {`.

Les callers actuels de `openModal` utilisent déjà le pattern `card.addEventListener('click', () => openModal(session));` — les handlers peuvent ignorer la promesse retournée, pas besoin de les `await`.

- [ ] **Step 3 : Styles pour le bouton et le wrapper**

Dans `style.css`, ajouter à la fin du fichier :

```css
/* Feedback IA — bouton de génération à la demande dans l'historique */
.feedback-ia-generate {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}
.feedback-ia-generate .btn-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--surface);
  color: var(--text-muted);
}
```

- [ ] **Step 4 : Validation manuelle**

Hard-refresh. Ouvrir l'historique :
1. Taper sur une séance **avec** un `feedback_ia` en DB → le bloc "🤖 Feedback IA" apparaît en bas du modal, pas de bouton.
2. Taper sur une séance **sans** `feedback_ia` (ancienne) **avec** clé API → bouton "Générer l'analyse IA" visible. Clic → loading → feedback affiché → bouton disparu.
3. Ouvrir le détail de cette même séance à nouveau → le feedback persiste sans nouvel appel API. Vérifier dans l'onglet Network : aucune requête vers `api.anthropic.com` à la deuxième ouverture.
4. Supprimer temporairement la clé API dans Profil, puis ouvrir une séance sans feedback → bouton désactivé avec le message "Configurez votre clé API Claude dans Profil".
5. Séance abandonnée (sans `duration`) → ni bloc ni bouton (seulement "Reprendre" + "Supprimer").

- [ ] **Step 5 : Commit**

```bash
git add app.js style.css
git commit -m "feat(feedback-ia): affichage dans historique + bouton de génération à la demande"
```

---

## Auto-check des critères d'acceptation

En fin d'implémentation :

- [ ] Séance terminée avec clé API → `feedback_ia` peuplée en DB (critère 1)
- [ ] Ouverture détail avec feedback stocké → bloc affiché, 0 appel API (critère 2)
- [ ] Ouverture détail sans feedback + avec clé API → bouton générer, clic sauvegarde et persiste (critère 3)
- [ ] Ouverture détail sans feedback + sans clé API → bouton désactivé avec message (critère 4)
- [ ] Flux post-séance visuellement inchangé (critère 5)
- [ ] Backoffice coach peut lire la colonne (tester en login coach) (critère 6)
