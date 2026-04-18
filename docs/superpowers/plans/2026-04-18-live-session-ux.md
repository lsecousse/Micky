# Refonte UX séance live — Plan d'implémentation (Lot A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la séance live utilisable pendant le repos (bandeau compact haut), proposer une modification d'activité via modal centré avec focus Poids, et rétablir l'affichage des valeurs de séance précédente sur les séances reprises.

**Architecture:**
Refonte purement frontend, aucun changement de schéma DB. On convertit l'overlay plein écran `#countdown-bar` en bandeau sticky compact, on remplace la zone d'édition inline (`.live-edit-zone`) par un modal centré (pattern déjà présent pour `#dialog` et `#modal`), et on extrait dans une fonction utilitaire la logique de calcul des valeurs précédentes pour la partager entre `startSession` et `resumeSessionFromHistory`.

**Tech Stack:** vanilla JS (pas de framework), CSS custom, PWA. Aucune infra de test unitaire — chaque tâche se valide manuellement dans le navigateur (voir étape `Validation manuelle` de chaque task).

---

## Pré-requis — servir l'app en local

Si ce n'est pas déjà fait :

```bash
cd /home/lsecousse/WebstormProjects/Micky
python3 -m http.server 8000
```

Ouvrir `http://localhost:8000` dans le navigateur, se connecter, puis laisser cet onglet ouvert pour tester chaque task.

---

### Task 1 — Extraire `attachPrevValues` et fixer la régression "Préc:" sur séance reprise

**Files:**
- Modify: `app.js` — `startSession` (640–687) et `resumeSessionFromHistory` (2011–2036)

- [ ] **Step 1 : Repérer le bug avant correction**

Dans l'app, démarrer une séance sur un programme "fonte" pour lequel il existe au moins une séance passée (ex. `Dos / Abdominaux`). Vérifier qu'on voit bien "Préc: X × Y kg" sous chaque série. Terminer sans enregistrer (bouton retour / rafraîchir). Rouvrir l'app et "Reprendre la séance" : la ligne "Préc:" a disparu. C'est le bug à fixer.

- [ ] **Step 2 : Ajouter la fonction utilitaire `attachPrevValues`**

Dans `app.js`, juste avant `async function startSession(programme)` (ligne 636), ajouter :

```js
async function attachPrevValues(exercises, programmeId, category) {
  const sessions   = await loadSessions();
  const prevSession = sessions
    .filter(s => s.programmeId === programmeId)
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
```

- [ ] **Step 3 : Refactor `startSession` pour utiliser `attachPrevValues`**

Dans `app.js`, remplacer intégralement la fonction `startSession` (636–688) par :

```js
async function startSession(programme) {
  requestWakeLock();
  const isCardio = programme.category === 'cardio';

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
          done:     { duration: ex.duration || 0, power: ex.power || 0 },
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
  await attachPrevValues(liveSession.exercises, programme.id, liveSession.category);
  pushSession(liveSessionSnapshot()).catch(() => {});
  startSyncPolling();
  renderSeanceScreen();
}
```

- [ ] **Step 4 : Appeler `attachPrevValues` dans `resumeSessionFromHistory`**

Dans `app.js`, remplacer `resumeSessionFromHistory` (2011–2036) par :

```js
async function resumeSessionFromHistory(session) {
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
  await attachPrevValues(liveSession.exercises, liveSession.programmeId, liveSession.category);
  closeModal();
  startSyncPolling();
  showScreen('seance');
}
```

Noter le `async` et le `await` avant `closeModal`.

- [ ] **Step 5 : Validation manuelle**

Hard-refresh (`Ctrl+Shift+R`) le navigateur. Reproduire le scénario du Step 1 (démarrer, quitter sans terminer, reprendre). Attendu : la ligne "Préc: X × Y kg" est visible sous chaque série après reprise, comme pour une séance neuve.

- [ ] **Step 6 : Commit**

```bash
git add app.js
git commit -m "fix(séance): restaurer valeurs précédentes sur reprise de séance"
```

---

### Task 2 — Countdown : overlay plein écran → bandeau sticky compact en haut

**Files:**
- Modify: `index.html` (150–161)
- Modify: `style.css` (713–804)
- Modify: `app.js` — `RING_CIRCUMFERENCE` (1447) et `updateCountdownUI` si nécessaire

- [ ] **Step 1 : Nouveau markup du bandeau**

Dans `index.html`, remplacer le bloc `<!-- COUNTDOWN FULLSCREEN -->` (149–161) par :

```html
  <!-- COUNTDOWN STICKY TOP BAR -->
  <div id="countdown-bar" class="hidden">
    <div class="countdown-ring-wrap">
      <svg class="countdown-ring" viewBox="0 0 100 100">
        <circle class="ring-bg" cx="50" cy="50" r="42" />
        <circle id="ring-progress" class="ring-progress" cx="50" cy="50" r="42" />
      </svg>
      <span id="countdown-display">00:00</span>
    </div>
    <div class="countdown-info">
      <span class="countdown-label">Repos</span>
      <span id="countdown-exercise-name" class="overlay-exercise-name"></span>
    </div>
    <button id="countdown-skip" title="Passer">⏭</button>
  </div>
```

Explication : le ring est passé de `viewBox="0 0 200 200"` / `r=85` à `viewBox="0 0 100 100"` / `r=42` pour être dessiné petit. La circonférence passe de `534` à `~264`. On déplace aussi le label et le nom à droite du ring (layout horizontal).

- [ ] **Step 2 : Mettre à jour `RING_CIRCUMFERENCE` dans `app.js`**

Dans `app.js` ligne 1447, remplacer :

```js
const RING_CIRCUMFERENCE = 2 * Math.PI * 85; // ≈ 534
```

par :

```js
const RING_CIRCUMFERENCE = 2 * Math.PI * 42; // ≈ 264 (ring compact)
```

Puis dans le CSS du ring-progress (Step 3), on ajustera `stroke-dasharray` à `264`.

- [ ] **Step 3 : Nouveau CSS du bandeau**

Dans `style.css`, remplacer les règles 713–804 (de `/* ── Countdown fullscreen ─────────────────────────────── */` jusqu'à la fin du bloc `#countdown-skip`) par :

```css
/* ── Countdown sticky top bar ─────────────────────────── */
#countdown-bar {
  position: sticky;
  top: 0;
  z-index: 150;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  padding-top: calc(env(safe-area-inset-top) + 8px);
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

#countdown-bar.hidden { display: none; }

.countdown-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

.countdown-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.2;
}

.overlay-exercise-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.countdown-ring-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.countdown-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: #222;
  stroke-width: 6;
}

.ring-progress {
  fill: none;
  stroke: var(--accent);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 264;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 0.9s linear, stroke 0.3s ease;
}

#countdown-bar.urgent .ring-progress { stroke: var(--danger); }

#countdown-display {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
  line-height: 1;
  transition: color 0.3s;
  z-index: 1;
}

#countdown-bar.urgent #countdown-display { color: var(--danger); }

@keyframes tick-pulse {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.15); }
  100% { transform: scale(1); }
}

#countdown-display.pulse { animation: tick-pulse 0.35s ease-out; }

#countdown-skip {
  background: none;
  border: 1px solid #333;
  color: var(--text-muted);
  font-family: var(--font);
  font-size: 16px;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
}
```

Note : `z-index: 150` reste au-dessus de la plupart des overlays locaux, mais on choisira `z-index` du modal à 120 pour que le bandeau reste au-dessus (Task 4).

- [ ] **Step 4 : Validation manuelle**

Hard-refresh. Démarrer une séance, finir une série pour déclencher un repos. Attendu :
- Le bandeau s'affiche en haut, compact, avec le ring mini à gauche, "Repos" + "À suivre : …" au milieu, bouton ⏭ à droite.
- Le ring se vide bien de sa circonférence au fil du décompte (si non : la circonférence n'est pas alignée, revérifier Step 2).
- On peut scroller la liste en dessous pendant que le décompte tourne.
- On peut taper sur ✎ d'une ligne (édition inline, changera à la Task 4) → les inputs sont accessibles.
- À 5s restantes, le bandeau passe en rouge.
- Beeps et vibrations inchangés.

- [ ] **Step 5 : Commit**

```bash
git add index.html style.css app.js
git commit -m "feat(séance): bandeau de repos compact sticky en haut"
```

---

### Task 3 — Squelette HTML + CSS du modal d'édition d'activité

**Files:**
- Modify: `index.html` (ajouter le modal juste après `#modal` vers la ligne 183)
- Modify: `style.css` (ajouter règles à la fin, ou après le bloc `.dialog`)

- [ ] **Step 1 : Ajouter le markup du modal**

Dans `index.html`, après le bloc `<!-- MODAL DÉTAIL SÉANCE -->` (175–183) et avant `<script src="…chart.js…">`, ajouter :

```html
  <!-- MODAL ÉDITION ACTIVITÉ (live) -->
  <div id="live-edit-modal" class="live-edit-modal hidden">
    <div class="live-edit-modal-overlay"></div>
    <div class="live-edit-modal-card">
      <div class="live-edit-modal-title" id="live-edit-modal-title">Activité</div>
      <div class="live-edit-modal-body" id="live-edit-modal-body"></div>
      <div class="live-edit-modal-actions">
        <button class="btn-secondary" id="live-edit-modal-cancel">Annuler</button>
        <button class="btn-primary" id="live-edit-modal-ok">OK</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2 : Ajouter le CSS**

Dans `style.css`, ajouter à la fin du fichier :

```css
/* ── Live edit modal ─────────────────────────────────── */
.live-edit-modal {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.live-edit-modal.hidden { display: none; }

.live-edit-modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
}

.live-edit-modal-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.live-edit-modal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent);
}

.live-edit-modal-body {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.live-edit-modal-body label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  flex: 1;
  min-width: 90px;
}

.live-edit-modal-body input[type="number"] {
  width: 100%;
  padding: 10px 8px;
  text-align: center;
  font-size: 18px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: var(--font);
}

.live-edit-modal-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.live-edit-modal-actions button { flex: 1; }
```

Le modal est à `z-index: 120`, le countdown bar à `z-index: 150` → le countdown reste visible par-dessus le modal (critère d'acceptation du spec).

- [ ] **Step 3 : Validation manuelle**

Dans la DevTools console, taper :

```js
document.getElementById('live-edit-modal').classList.remove('hidden');
```

Attendu : modal centré vide (body vide), bouton Annuler / OK en bas, fond assombri. Le bandeau countdown, si actif, reste visible au-dessus.

Puis :

```js
document.getElementById('live-edit-modal').classList.add('hidden');
```

Attendu : le modal disparaît.

- [ ] **Step 4 : Commit**

```bash
git add index.html style.css
git commit -m "feat(séance): squelette du modal d'édition d'activité"
```

---

### Task 4 — Logique JS du modal + remplacement de la zone d'édition inline

**Files:**
- Modify: `app.js` — la section `// ── Edit mode …` autour de 1028–1113

- [ ] **Step 1 : Ajouter les fonctions `openLiveEditModal` / `closeLiveEditModal`**

Dans `app.js`, juste avant `function renderLiveSession(tab)` (ligne 690), ajouter :

```js
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

  // Focus + select after DOM paint
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
```

- [ ] **Step 2 : Remplacer la zone d'édition inline par l'ouverture du modal**

Dans `app.js`, localiser la section qui commence à `// ── Edit mode (hidden by default) ──` (vers 1028) et se termine à `editBtn.addEventListener('click', () => { …firstInput.select(); });` (vers 1113). Remplacer l'ensemble de ce bloc par :

```js
  // ── Edit mode : open centered modal ──
  editBtn.addEventListener('click', () => {
    if (act.type === 'stopwatch') return;

    const actLabel = act.label || act.name || '';
    const title = actLabel ? `${ex.name} — ${actLabel}` : ex.name;

    if (act.type === 'weight') {
      const currentReps   = v.reps   ?? act.reps   ?? 0;
      const currentWeight = v.weight ?? act.weight ?? 0;
      const currentRest   = act.rest ?? 0;
      const originalWeight = currentWeight;

      const bodyHTML = `
        <label>Reps<input type="number" inputmode="decimal" class="live-reps" value="${currentReps}" min="1"></label>
        <label>Poids<input type="number" inputmode="decimal" class="live-weight" value="${currentWeight}" min="0" step="0.5"></label>
        <label>Repos<input type="number" inputmode="numeric" class="live-rest" value="${currentRest}" min="0">s</label>
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
        document.querySelectorAll(`.live-rest[data-ex="${exIdx}"][data-act="${actIdx}"]`)
          .forEach(inp => { inp.value = restVal; });
        updateProgrammeTemplate(exIdx, actIdx, 'rest', restVal);

        valuesSpan.innerHTML = `<b>${r}</b> <span class="live-x">×</span> <b>${w}</b> <span class="live-kg">kg</span>`
          + (restVal ? `<span class="live-rest-display">repos ${restVal}s</span>` : '');

        closeLiveEditModal();
        pushSession(liveSessionSnapshot()).catch(() => {});
      };

      openLiveEditModal({
        title,
        bodyHTML,
        focusSelector: '.live-weight',
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
        <label>Durée<input type="number" inputmode="numeric" class="live-duration" value="${currentDur}" min="1">s</label>
        <label>Repos<input type="number" inputmode="numeric" class="live-rest" value="${currentRest}" min="0">s</label>
      `;

      openLiveEditModal({
        title,
        bodyHTML,
        focusSelector: '.live-duration',
        onOk: () => {
          const dI = document.querySelector('#live-edit-modal-body .live-duration');
          const restI = document.querySelector('#live-edit-modal-body .live-rest');
          const dur = parseInt(dI.value) || 0;
          const restVal = parseInt(restI.value) || 0;

          liveSession.exercises[exIdx].series[sIdx].values[actIdx].duration = dur;
          liveSession.exercises[exIdx].activities[actIdx].rest = restVal;
          document.querySelectorAll(`.live-rest[data-ex="${exIdx}"][data-act="${actIdx}"]`)
            .forEach(inp => { inp.value = restVal; });
          updateProgrammeTemplate(exIdx, actIdx, 'rest', restVal);

          valuesSpan.innerHTML = `<b>${dur}</b><span class="live-x">s</span>`
            + (restVal ? `<span class="live-rest-display">repos ${restVal}s</span>` : '');

          closeLiveEditModal();
          pushSession(liveSessionSnapshot()).catch(() => {});
        },
      });
    }
  });
```

Points d'attention :
- On lit les inputs via `document.querySelector('#live-edit-modal-body …')` (ils n'existent plus dans `row`).
- On garde `valuesSpan`, `propagateLiveValue`, `updateProgrammeTemplate`, `pushSession` inchangés.
- Les lignes inline `.live-rest[data-ex=…]` d'autres séries continuent d'être mises à jour via `querySelectorAll` pour propager le nouveau repos. On garde donc `data-ex` / `data-act` sur l'affichage des autres lignes — vérifier qu'ils sont toujours ajoutés ; si ce n'est pas le cas, c'est sans effet, pas bloquant.

- [ ] **Step 3 : Supprimer les styles inline devenus inutiles (laisse en place pour l'instant)**

On laisse `.live-edit-zone`, `.live-edit-confirm` dans le CSS tant qu'aucun autre endroit de l'app ne les référence : la DOM ne les crée plus. On les purgera en Task 5 si rien ne casse.

- [ ] **Step 4 : Validation manuelle**

Hard-refresh. Tester :
1. Démarrer une séance `Dos / Abdominaux`.
2. Taper ✎ sur une série type `weight` : modal centré, titre = nom d'exercice, focus sur champ Poids (curseur dedans, valeur sélectionnée).
3. Changer le poids à la hausse, OK → ligne mise à jour, modal fermé.
4. Re-taper ✎, baisser le poids : confirm dialog "Réduire …", si OK → appliqué, si Annuler → modal reste… (comportement actuel : `showConfirm` se superpose, `applyEdit` ne s'exécute qu'après OK).
5. Taper ✎, puis Échap → modal fermé, pas de modif.
6. Taper ✎, puis clic sur le fond sombre → idem.
7. Taper ✎, puis Annuler → idem.
8. Terminer une série pour déclencher un repos. Pendant le décompte, taper ✎ d'une autre série → modal s'ouvre, bandeau countdown reste visible au-dessus, on édite, OK → la valeur est bien sauvée, le décompte continue.
9. Série type `countdown` (si présente dans un programme) : modal ouvre avec focus sur Durée.
10. Série type `stopwatch` (Gainage, Planche/Parachutiste) : le bouton ✎ ne déclenche rien de spécial (retour immédiat, pas de modal) — comme avant.

- [ ] **Step 5 : Commit**

```bash
git add app.js
git commit -m "feat(séance): modal centré pour l'édition d'activité avec focus Poids"
```

---

### Task 5 — Nettoyage des styles et DOM de l'édition inline

**Files:**
- Modify: `style.css` (661–699, le bloc `.live-edit-zone`, `.live-edit-confirm`)

- [ ] **Step 1 : Vérifier qu'aucun JS ne référence plus ces classes**

```bash
grep -n "live-edit-zone\|live-edit-confirm" /home/lsecousse/WebstormProjects/Micky/app.js /home/lsecousse/WebstormProjects/Micky/exercise-editor.js
```

Attendu : aucune occurrence (la Task 4 les a retirées). Si une occurrence subsiste dans `app.js`, c'est qu'une partie du code inline n'a pas été supprimée — revenir à la Task 4 Step 2.

- [ ] **Step 2 : Supprimer les règles CSS**

Dans `style.css`, supprimer le bloc :

```css
/* Edit zone */
.live-edit-zone { … }
.live-edit-zone label { … }
.live-edit-zone input[type="number"] { … }
.live-edit-confirm { … }
```

(lignes 661–699 avant toute autre modification ; utiliser la recherche par contenu pour trouver les bornes exactes au moment de la task).

- [ ] **Step 3 : Validation manuelle**

Hard-refresh. Rejouer la validation Task 4 Step 4 points 1–3 pour vérifier qu'aucun style ne dépendait encore de ces classes.

- [ ] **Step 4 : Commit**

```bash
git add style.css
git commit -m "chore(séance): supprimer styles de la zone d'édition inline"
```

---

## Auto-check des critères d'acceptation

À faire en fin d'implémentation, dans une session browser unique :

- [ ] Pendant un décompte de repos, tap sur ✎ d'une autre série ouvre le modal (critère 1).
- [ ] Le bouton OK du modal est visible quelle que soit la ligne cliquée, même en bas de liste (critère 2).
- [ ] À l'ouverture d'une activité `weight`, le curseur est dans Poids avec la valeur sélectionnée (critère 3).
- [ ] Décompte compact : beep à 5s, vibration, classe urgent, sync montre OK, bouton skip fonctionne (critère 4).
- [ ] Échap / clic fond / Annuler ferment le modal sans modif (critère 5).
- [ ] Séance reprise : ligne "Préc: X × Y kg" présente (critère 6).
