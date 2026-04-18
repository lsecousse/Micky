# Suggestion IA à la saisie du poids — Plan d'implémentation (Lot C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Afficher une suggestion IA Claude dans le modal d'édition du poids, basée sur la première et les N=5 dernières séances de l'exercice concerné, avec cache en mémoire.

**Architecture:** Purement frontend. Une fonction asynchrone `generateWeightSuggestion(exerciseName)` appelle Claude, un cache `Map` évite les appels redondants, et le modal `#live-edit-modal` gagne un bloc `#live-edit-suggestion` rendu en haut de la carte.

**Tech Stack:** vanilla JS, API Anthropic, aucune infra de test.

---

### Task 1 — Markup + CSS du bloc suggestion

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1 : Ajouter le div suggestion dans le modal d'édition**

Dans `/home/lsecousse/WebstormProjects/Micky/index.html`, trouver le bloc `<!-- MODAL ÉDITION ACTIVITÉ (live) -->` (autour de la ligne 188). Remplacer entièrement ce bloc par :

```html
  <!-- MODAL ÉDITION ACTIVITÉ (live) -->
  <div id="live-edit-modal" class="live-edit-modal hidden">
    <div class="live-edit-modal-overlay"></div>
    <div class="live-edit-modal-card">
      <div class="live-edit-modal-title" id="live-edit-modal-title">Activité</div>
      <div class="live-edit-suggestion hidden" id="live-edit-suggestion"></div>
      <div class="live-edit-modal-body" id="live-edit-modal-body"></div>
      <div class="live-edit-modal-actions">
        <button class="btn-secondary" id="live-edit-modal-cancel">Annuler</button>
        <button class="btn-primary" id="live-edit-modal-ok">OK</button>
      </div>
    </div>
  </div>
```

(Seul changement : ajout d'une ligne `<div class="live-edit-suggestion hidden" id="live-edit-suggestion"></div>` entre le titre et le body.)

- [ ] **Step 2 : Ajouter le CSS**

Dans `/home/lsecousse/WebstormProjects/Micky/style.css`, ajouter à la fin :

```css
/* Suggestion IA inline dans le modal d'édition */
.live-edit-suggestion {
  background: rgba(255, 107, 0, 0.08);
  border: 1px solid rgba(255, 107, 0, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text);
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 8px;
}
.live-edit-suggestion.hidden { display: none; }
.live-edit-suggestion-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 107, 0, 0.3);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
```

(Vérifier que l'animation `@keyframes spin` existe déjà — elle est utilisée par `.feedback-ia-spinner`. Si présente, pas besoin de la redéclarer.)

- [ ] **Step 3 : Vérifier `@keyframes spin`**

```bash
grep -n "@keyframes spin" /home/lsecousse/WebstormProjects/Micky/style.css
```

Si aucune occurrence, ajouter en fin de fichier :

```css
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 4 : Commit**

```bash
git add index.html style.css
git commit -m "feat(suggestion-poids): markup + CSS du bloc suggestion IA dans modal d'édition"
```

---

### Task 2 — Logique JS : generateWeightSuggestion + intégration au modal

**Files:**
- Modify: `app.js`

- [ ] **Step 1 : Ajouter prompt, cache et fonction de génération**

Dans `/home/lsecousse/WebstormProjects/Micky/app.js`, localiser la constante `COACH_PROMPT` (vers ligne 2185). Juste APRÈS, ajouter :

```js
const SUGGESTION_PROMPT = `Coach sportif. L'utilisateur ouvre son éditeur de poids pour un exercice. Donne UNE phrase courte (max 25 mots, français, droit au but) : tendance récente (progression/stagnation/régression), et un poids ou objectif concret pour aujourd'hui. Pas de compliment creux.`;

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
  // Si la promesse rejette, on retire du cache pour permettre un retry ultérieur
  promise.catch(() => suggestionCache.delete(exerciseName));
  return promise;
}
```

- [ ] **Step 2 : Modifier `openLiveEditModal` pour supporter une suggestion**

Dans `app.js`, localiser la fonction `function openLiveEditModal({ title, bodyHTML, focusSelector, onOk })` (autour de la ligne 707). Remplacer entièrement par :

```js
function openLiveEditModal({ title, bodyHTML, focusSelector, onOk, suggestionFor }) {
  const modal = document.getElementById('live-edit-modal');
  const titleEl = document.getElementById('live-edit-modal-title');
  const bodyEl  = document.getElementById('live-edit-modal-body');
  const sugEl   = document.getElementById('live-edit-suggestion');

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHTML;
  sugEl.classList.add('hidden');
  sugEl.innerHTML = '';
  modal.classList.remove('hidden');

  requestAnimationFrame(() => {
    const el = bodyEl.querySelector(focusSelector);
    if (el) { el.focus(); el.select?.(); }
  });

  const escHandler = (e) => { if (e.key === 'Escape') closeLiveEditModal(); };
  document.addEventListener('keydown', escHandler);

  const ctx = { onOk, escHandler, canceled: false };
  liveEditModalCtx = ctx;

  if (suggestionFor) {
    sugEl.innerHTML = `<div class="live-edit-suggestion-spinner"></div><span>Suggestion…</span>`;
    sugEl.classList.remove('hidden');
    generateWeightSuggestion(suggestionFor).then(text => {
      if (ctx.canceled) return;
      if (!text) { sugEl.classList.add('hidden'); return; }
      sugEl.innerHTML = `💡 ${text}`;
    }).catch(() => {
      if (!ctx.canceled) sugEl.classList.add('hidden');
    });
  }
}
```

Et modifier `closeLiveEditModal` pour marquer `canceled: true` :

```js
function closeLiveEditModal() {
  const modal = document.getElementById('live-edit-modal');
  modal.classList.add('hidden');
  document.getElementById('live-edit-modal-body').innerHTML = '';
  const sugEl = document.getElementById('live-edit-suggestion');
  if (sugEl) { sugEl.classList.add('hidden'); sugEl.innerHTML = ''; }
  if (liveEditModalCtx?.escHandler) {
    document.removeEventListener('keydown', liveEditModalCtx.escHandler);
  }
  if (liveEditModalCtx) liveEditModalCtx.canceled = true;
  liveEditModalCtx = null;
}
```

- [ ] **Step 3 : Passer `suggestionFor` depuis le caller weight**

Dans `app.js`, localiser le handler `editBtn.addEventListener('click', ...)` créé dans le row builder (la branche `if (act.type === 'weight')`, autour de la ligne 1080–1125). Trouver l'appel :

```js
      openLiveEditModal({
        title,
        bodyHTML,
        focusSelector: '.live-weight',
        onOk: () => { /* ... */ },
      });
```

Ajouter `suggestionFor: ex.name,` en argument :

```js
      openLiveEditModal({
        title,
        bodyHTML,
        focusSelector: '.live-weight',
        suggestionFor: ex.name,
        onOk: () => { /* ... */ },
      });
```

Ne PAS ajouter cette option pour la branche `countdown` — on ne suggère que sur le poids.

- [ ] **Step 4 : Syntax check**

```bash
node -c /home/lsecousse/WebstormProjects/Micky/app.js
```

Exit 0.

- [ ] **Step 5 : Validation manuelle**

Démarrer le serveur :

```bash
cd /home/lsecousse/WebstormProjects/Micky && python3 -m http.server 8000
```

Tests :
1. Démarrer une séance `Pectoraux / Bras`. Tap ✎ sur une série de `Chest press`. Attendu : bloc "Suggestion…" avec spinner, puis remplacé par "💡 <une phrase>" en ~2-3s.
2. Fermer et rouvrir le modal sur le même exercice → suggestion affichée instantanément (cachée).
3. Tap ✎ sur un exercice qui n'a qu'une seule séance passée → pas de bloc.
4. Retirer la clé API dans Profil, rouvrir le modal sur un exercice → pas de bloc.
5. Ouvrir le modal puis fermer IMMÉDIATEMENT avant la fin du fetch → pas d'erreur, pas de DOM bizarre (le résultat arrive dans le vide).
6. Activité `countdown` (rare) → pas de bloc suggestion (car on ne passe pas `suggestionFor`).

- [ ] **Step 6 : Commit**

```bash
git add app.js
git commit -m "feat(suggestion-poids): suggestion IA au moment d'éditer le poids (cache mémoire)"
```

(Hook bumpe `service-worker.js`.)

## Auto-check

- [ ] Suggestion apparaît sur un exercice avec ≥2 séances
- [ ] Cache : pas de deuxième appel pour le même exercice dans le tab
- [ ] Pas de suggestion si <2 séances ou pas de clé API
- [ ] Erreur silencieuse (bloc caché)
- [ ] Fermeture modal avant réponse : rien ne casse
- [ ] Post-séance feedback IA (Lot B) reste inchangé visuellement
