# Refonte ergonomie "À la salle" — Plan d'implémentation (Lot E)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox syntax. **Ne pas push** : commits locaux uniquement.

**Goal:** Refondre `renderLiveSession` en 3 états (Liste / Activité focus / Repos+récap) + agrandir les inputs du modal d'édition.

**Architecture:** Variables d'état module-level (`liveFocus`, `liveRest`) + 3 fonctions de rendu. Le countdown sticky existant est masqué quand on est en repos-split. Auto-save / sync / suggestion IA / propagation template restent inchangés.

**Tech Stack:** vanilla JS, CSS custom.

---

### Task 1 — Inputs élargis du modal d'édition

**Files:**
- Modify: `style.css`

- [ ] **Step 1 : Agrandir les inputs**

Dans `/home/lsecousse/WebstormProjects/Micky/style.css`, localiser la règle `.live-edit-modal-body input[type="number"]` (autour de la ligne 1583). Remplacer le bloc :

```css
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
```

par :

```css
.live-edit-modal-body input[type="number"] {
  width: 100%;
  padding: 14px 10px;
  text-align: center;
  font-size: 22px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: var(--font);
}
```

Et dans la règle `.live-edit-modal-body label`, augmenter `min-width` de 90px à 110px pour laisser plus de place :

```css
.live-edit-modal-body label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  flex: 1;
  min-width: 110px;
}
```

- [ ] **Step 2 : Commit (sans push)**

```bash
git add style.css
git commit -m "style(modal-édition): agrandir inputs poids/reps pour lecture des décimales"
```

---

### Task 2 — Refondre `renderLiveSession` en 3 états

**Files:**
- Modify: `app.js`
- Modify: `style.css` (ajout de classes `.live-exo-list`, `.live-focus`, `.live-rest-split`)

#### Vue d'ensemble

L'ancien `renderLiveSession` (`app.js` autour de ligne 770) construit toute la liste détaillée. On le remplace par un dispatcher qui rend selon l'état :

- `liveFocus === null && liveRest === null` → état A (liste)
- `liveFocus !== null && liveRest === null` → état B (focus activité)
- `liveRest !== null` → état C (split repos+récap)

#### Step 1 — Ajouter les variables d'état

Dans `app.js`, juste après la déclaration de `let liveSession = null;` (autour ligne 507), AJOUTER :

```js
let liveFocus = null; // { exIdx, sIdx, actIdx } : activité actuellement en focus dans state B
let liveRest  = null; // { exIdx, sIdx, actIdx } : activité juste validée, en cours de repos (state C)
```

Et un helper `nextUndoneActivity(exIdx)` à placer après ces déclarations :

```js
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
```

#### Step 2 — Remplacer `renderLiveSession` (cardio inchangé)

Localiser `function renderLiveSession(tab)` autour de ligne 770. La fonction actuelle :

```js
function renderLiveSession(tab) {
  const header = document.createElement('div');
  // ... header avec titre + bouton Terminer ...
  if (liveSession.category === 'cardio') {
    renderLiveCardio(tab);
  } else {
    liveSession.exercises.forEach((ex, exIdx) => {
      // ... gros bloc qui rend tous les exercices/séries/activités ...
    });
  }
}
```

Remplacer par :

```js
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
  document.getElementById('finish-session')?.addEventListener('click', finishSession);

  if (liveSession.category === 'cardio') {
    renderLiveCardio(tab);
    return;
  }

  // Toggle bandeau countdown sticky / mode split-repos
  const cdBar = document.getElementById('countdown-bar');
  if (cdBar) cdBar.classList.toggle('in-rest-split', liveRest !== null);

  if (liveRest)        renderRestSplit(tab);
  else if (liveFocus)  renderActivityFocus(tab);
  else                 renderExerciseList(tab);
}
```

Note : `finishSession` est l'ancien nom du handler attaché au bouton Terminer. Si dans le code actuel ce n'est pas une fonction nommée mais un inline, **localiser le handler actuel** dans l'ancien `renderLiveSession` et le préserver (probablement `showConfirm('Terminer …', async () => { await endLiveSession(); })` ou similaire). Recopier exactement la logique existante du bouton Terminer dans le nouveau handler.

**Étape de découverte** : avant de commit, faire `grep -n "finish-session" app.js` pour trouver le handler actuel et l'adapter.

#### Step 3 — Implémenter `renderExerciseList(tab)` (état A)

Dans `app.js`, AJOUTER après le nouveau `renderLiveSession` :

```js
function renderExerciseList(tab) {
  liveSession.exercises.forEach((ex, exIdx) => {
    const totalSets = ex.series.length;
    const doneSets = ex.series.filter(s =>
      ex.activities.every((_, a) => s.activityStates?.[a] === 'done')
    ).length;
    const startedSets = ex.series.filter(s =>
      ex.activities.some((_, a) => s.activityStates?.[a])
    ).length;

    let badge = '○ À faire';
    let badgeCls = 'pending';
    if (doneSets === totalSets) { badge = '✓ Fait'; badgeCls = 'done'; }
    else if (startedSets > 0)   { badge = '▶ En cours'; badgeCls = 'partial'; }

    const card = document.createElement('div');
    card.className = `live-exo-row live-exo-row--${badgeCls}`;
    card.innerHTML = `
      <div class="live-exo-row-main">
        <div class="live-exo-row-name">${ex.name}</div>
        <div class="live-exo-row-meta">${doneSets}/${totalSets} séries</div>
      </div>
      <div class="live-exo-row-badge">${badge}</div>
    `;
    card.addEventListener('click', () => {
      const next = nextUndoneActivity(exIdx);
      if (!next) return; // tout est fait, rien à faire
      liveFocus = next;
      renderSeanceScreen();
    });
    tab.appendChild(card);
  });
}
```

#### Step 4 — Implémenter `renderActivityFocus(tab)` (état B)

```js
function renderActivityFocus(tab) {
  const { exIdx, sIdx, actIdx } = liveFocus;
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const v = ex.series[sIdx].values?.[actIdx] || {};
  const totalSets = ex.series.length;

  // Header retour
  const back = document.createElement('button');
  back.className = 'live-focus-back';
  back.textContent = '← Retour à la liste';
  back.addEventListener('click', () => { liveFocus = null; renderSeanceScreen(); });
  tab.appendChild(back);

  // Bloc focus
  const wrap = document.createElement('div');
  wrap.className = 'live-focus';

  const subParts = [`Série ${sIdx + 1} / ${totalSets}`];
  if (ex.activities.length > 1) subParts.push(act.label || act.name || `Activité ${actIdx + 1}`);
  else if (act.name) subParts.push(act.name);

  let valuesHtml;
  if (act.type === 'weight') {
    const reps = v.reps ?? act.reps ?? 0;
    const kg   = v.weight ?? act.weight ?? 0;
    valuesHtml = `<b>${reps}</b> reps × <b>${kg}</b> kg`;
  } else if (act.type === 'countdown') {
    const dur = v.duration ?? act.duration ?? 0;
    valuesHtml = `<b>${dur}</b> s`;
  } else {
    valuesHtml = `<b>Chrono</b>`;
  }

  let prevHtml = '';
  const prevVal = ex.prevSeries?.[sIdx]?.values?.[actIdx];
  if (act.type === 'weight' && (prevVal?.reps || prevVal?.weight)) {
    prevHtml = `<div class="live-focus-prev">Préc : ${prevVal.reps ?? '—'} × ${prevVal.weight ?? '—'} kg</div>`;
  } else if (act.type === 'countdown' && prevVal?.duration) {
    prevHtml = `<div class="live-focus-prev">Préc : ${prevVal.duration} s</div>`;
  }

  wrap.innerHTML = `
    <div class="live-focus-name">${ex.name}</div>
    <div class="live-focus-sub">${subParts.join(' · ')}</div>
    <div class="live-focus-target">${valuesHtml}</div>
    ${prevHtml}
    <div class="live-focus-actions">
      <button class="btn-secondary live-focus-edit" id="focus-edit">✎ Modifier</button>
      <button class="btn-primary live-focus-validate" id="focus-validate">✓ Valider</button>
    </div>
  `;
  tab.appendChild(wrap);

  // Modifier : ouvre le modal existant pour CETTE activité
  document.getElementById('focus-edit').addEventListener('click', () => {
    openEditModalForActivity(exIdx, sIdx, actIdx);
  });

  // Valider : marque done + déclenche repos
  document.getElementById('focus-validate').addEventListener('click', () => {
    completeFocusedActivity();
  });

  // Stopwatch / countdown timer : ouvrir overlay automatiquement (comportement existant)
  if (act.type === 'stopwatch' || act.type === 'countdown') {
    // On garde le bouton Valider mais on lance aussi l'overlay
    // L'overlay, à la fin, appellera completeFocusedActivity() via doneActivity équivalent
    // Note : la branche stopwatch est traitée par openChronoOverlay; voir Step 5 pour l'intégration.
  }
}
```

#### Step 5 — Implémenter `completeFocusedActivity()` et `renderRestSplit(tab)` (état C)

```js
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

  if (restSecs > 0) {
    liveRest = { exIdx, sIdx, actIdx };
    liveFocus = null;
    renderSeanceScreen();
    // Démarre le countdown intégré au split (utilise startCountdown existant
    // mais cache le bandeau sticky via la classe in-rest-split posée dans renderLiveSession)
    const next = nextUndoneActivity(exIdx) || nextExerciseFirst(exIdx);
    const nextLabel = next ? labelOfActivity(next) : '';
    startCountdown(restSecs, nextLabel, () => {
      liveRest = null;
      liveFocus = next;
      renderSeanceScreen();
    });
  } else {
    // Pas de repos : enchaîner direct
    const next = nextUndoneActivity(exIdx) || nextExerciseFirst(exIdx);
    liveFocus = next;
    renderSeanceScreen();
  }
}

function nextExerciseFirst(currentExIdx) {
  for (let i = 0; i < liveSession.exercises.length; i++) {
    if (i === currentExIdx) continue;
    const cand = nextUndoneActivity(i);
    if (cand) return cand;
  }
  return null;
}

function labelOfActivity({ exIdx, sIdx, actIdx }) {
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const parts = [ex.name, `Série ${sIdx + 1}`];
  if (ex.activities.length > 1) parts.push(act.label || act.name || `Activité ${actIdx + 1}`);
  return parts.join(' · ');
}

function renderRestSplit(tab) {
  const { exIdx, sIdx, actIdx } = liveRest;
  const ex = liveSession.exercises[exIdx];
  const act = ex.activities[actIdx];
  const v = ex.series[sIdx].values?.[actIdx] || {};

  // Header retour
  const back = document.createElement('button');
  back.className = 'live-focus-back';
  back.textContent = '← Retour à la liste';
  back.addEventListener('click', () => {
    liveRest = null;
    renderSeanceScreen();
    // countdown continue à tourner et le bandeau sticky reprend (classe in-rest-split retirée)
  });
  tab.appendChild(back);

  const split = document.createElement('div');
  split.className = 'live-rest-split';

  let valHtml;
  if (act.type === 'weight') {
    valHtml = `<b>${v.reps ?? 0}</b> × <b>${v.weight ?? 0}</b> kg`;
  } else {
    valHtml = `<b>${v.duration ?? 0}</b> s`;
  }

  split.innerHTML = `
    <div class="live-rest-split-top" id="rest-split-top">
      <div class="live-rest-split-label">Repos</div>
      <div class="live-rest-split-time" id="rest-split-time">--:--</div>
      <div class="live-rest-split-next" id="rest-split-next"></div>
    </div>
    <div class="live-rest-split-bottom">
      <div class="live-rest-split-recap">
        <div class="live-rest-split-exo">${ex.name} · Série ${sIdx + 1} ✓</div>
        <div class="live-rest-split-val">${valHtml}</div>
      </div>
      <button class="btn-secondary" id="rest-edit">✎ Modifier</button>
    </div>
  `;
  tab.appendChild(split);

  // Mirror du countdown du bandeau sticky : on lit la valeur affichée toutes les secondes
  // (le bandeau est masqué via la classe in-rest-split, mais le timer tourne)
  const sync = () => {
    const cdDisplay = document.getElementById('countdown-display');
    const splitTime = document.getElementById('rest-split-time');
    const nextLabel = document.getElementById('countdown-exercise-name');
    const splitNext = document.getElementById('rest-split-next');
    if (cdDisplay && splitTime) splitTime.textContent = cdDisplay.textContent;
    if (nextLabel && splitNext) splitNext.textContent = nextLabel.textContent;
  };
  sync();
  const restSyncId = setInterval(sync, 200);
  // Stocker pour clear quand on quitte
  if (window.__restSyncId) clearInterval(window.__restSyncId);
  window.__restSyncId = restSyncId;

  document.getElementById('rest-edit').addEventListener('click', () => {
    openEditModalForActivity(exIdx, sIdx, actIdx);
  });
}
```

#### Step 6 — Helper `openEditModalForActivity` (DRY)

Le code d'ouverture du modal était déjà extrait dans le handler `editBtn.addEventListener('click', ...)` du row builder. On l'extrait en fonction réutilisable.

Localiser dans `app.js` le handler weight/countdown du bouton ✎ (autour de ligne 1083 — la branche `if (act.type === 'weight')` et `if (act.type === 'countdown')`). Extraire le contenu en :

```js
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
      updateProgrammeTemplate(exIdx, actIdx, 'rest', restVal);

      closeLiveEditModal();
      pushSession(liveSessionSnapshot()).catch(() => {});
      renderSeanceScreen(); // re-render pour refléter dans state B / C
    };

    openLiveEditModal({
      title, bodyHTML, focusSelector: '.live-weight', suggestionFor: ex.name,
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
      title, bodyHTML, focusSelector: '.live-duration',
      onOk: () => {
        const dI = document.querySelector('#live-edit-modal-body .live-duration');
        const restI = document.querySelector('#live-edit-modal-body .live-rest');
        const dur = parseInt(dI.value) || 0;
        const restVal = parseInt(restI.value) || 0;
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
```

L'ancien handler `editBtn.addEventListener('click', ...)` n'est plus appelé (il vivait dans le row builder qu'on a supprimé). On peut soit le laisser orphelin, soit le purger. Plus simple : supprimer l'ancien `function makeSeriesRow(...)` ou ce qui équivaut, devenu inutile.

Après cette refonte, **toute la logique row-builder + propagateLiveValue + advanceActivityState devient inutilisée**. Les supprimer pour éviter du code mort. Garder en revanche `propagateLiveValue` car il est toujours appelé depuis `openEditModalForActivity`. `advanceActivityState`/`doneActivity` deviennent obsolètes (remplacés par `completeFocusedActivity`).

**Étape de découverte** : `grep -n "advanceActivityState\|doneActivity\|makeSeriesRow\|refreshRowDisplay" app.js` pour lister les usages avant de supprimer.

#### Step 7 — Sync montre & overlays chrono

Le sync montre (`syncFromDB`) lit `liveSession.exercises[].series[].activityStates`. Comme on garde la même structure, le sync continue de fonctionner. Les overlays `openChronoOverlay` / `openMinuterieOverlay` doivent maintenant appeler `completeFocusedActivity()` au lieu de `doneActivity(...)` à la fin du chrono.

Dans `app.js`, localiser les `doneActivity(exIdx, sIdx, actIdx, row)` dans `openChronoOverlay` et `openMinuterieOverlay` (chercher "stopBtn" et "minuterie-stop"). Remplacer ces appels par `completeFocusedActivity()`.

**Étape de découverte** : `grep -n "doneActivity\|chrono-stop\|minuterie-stop" app.js` pour identifier précisément.

#### Step 8 — CSS

Dans `style.css`, ajouter à la fin :

```css
/* ── Live — état A : liste exercices ─────────────────── */
.live-exo-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
}
.live-exo-row:active { background: rgba(255,107,0,0.08); }
.live-exo-row-main { flex: 1; min-width: 0; }
.live-exo-row-name { font-size: 16px; font-weight: 600; }
.live-exo-row-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.live-exo-row-badge {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  flex-shrink: 0;
  background: rgba(255,255,255,0.05);
}
.live-exo-row--done .live-exo-row-badge   { color: #5abe78; background: rgba(90,190,120,0.12); }
.live-exo-row--partial .live-exo-row-badge { color: var(--accent); background: rgba(255,107,0,0.12); }

/* ── Live — état B : focus activité ──────────────────── */
.live-focus-back {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 14px;
  padding: 6px 0;
  cursor: pointer;
  text-align: left;
}
.live-focus {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: center;
}
.live-focus-name { font-size: 26px; font-weight: 700; color: var(--accent); }
.live-focus-sub  { font-size: 13px; color: var(--text-muted); }
.live-focus-target {
  font-size: 32px;
  margin: 16px 0;
  line-height: 1.2;
}
.live-focus-target b { color: var(--text); }
.live-focus-prev { font-size: 13px; color: #b9d4ff; font-style: italic; }
.live-focus-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.live-focus-actions button { padding: 14px; font-size: 16px; }

/* ── Live — état C : split repos + récap ─────────────── */
.live-rest-split {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 140px);
}
.live-rest-split-top {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--surface);
  border-radius: var(--radius);
  margin-bottom: 12px;
}
.live-rest-split-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.15em; }
.live-rest-split-time { font-size: 64px; font-weight: 700; color: var(--accent); line-height: 1; }
.live-rest-split-next { font-size: 13px; color: var(--text-muted); }
.live-rest-split-bottom {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
}
.live-rest-split-recap { text-align: center; }
.live-rest-split-exo { font-size: 14px; color: var(--text-muted); margin-bottom: 6px; }
.live-rest-split-val { font-size: 28px; font-weight: 600; }

/* Quand on est en split repos, masquer le bandeau countdown sticky du Lot A */
#countdown-bar.in-rest-split { display: none !important; }
```

#### Step 9 — Sanity check

```bash
node -c app.js
grep -n "renderExerciseList\|renderActivityFocus\|renderRestSplit\|completeFocusedActivity\|liveFocus\|liveRest\|nextUndoneActivity" app.js
```

Toutes les fonctions doivent être définies et appelées au bon endroit. La sortie du grep doit montrer les défs + ≥ 1 appel par fonction.

#### Step 10 — Validation manuelle

Hard-refresh le navigateur (cache PWA). Tester :
1. Démarrer une séance fonte (par ex. Pectoraux/Bras).
2. Voir la liste des exercices, chacun avec "0/4 séries · ○ À faire".
3. Tap "Chest press" → focus sur Série 1, valeur "12 reps × 28 kg".
4. Tap Modifier → modal s'ouvre, focus sur Poids, inputs grands (29.3 visible). Modifier, OK → focus mis à jour.
5. Tap Valider → split repos haut/bas avec countdown au centre haut + récap "Chest press · Série 1 ✓ · 12 × 28 kg" en bas.
6. Pendant le countdown, tap "Modifier" → modal sur l'activité juste validée.
7. Fin du countdown → bascule auto vers focus Série 2.
8. Tap ← Retour pendant focus → liste, "Chest press : 1/4 · ▶ En cours".
9. Reprendre un autre exercice (Pec fly) → focus, valider, etc.
10. Multi-activité (Gainage Planche+Parachutiste) : Set 1 Planche (chrono overlay) → repos → Set 1 Parachutiste (chrono) → repos → Set 2 Planche…
11. Fonctionnalités préservées : suggestion IA dans le modal, valeurs précédentes, propagation au template, sync montre, auto-save.
12. Fin de toutes les séries → bouton Terminer fonctionne identique.

#### Step 11 — Commit (sans push)

```bash
git add app.js style.css
git commit -m "feat(séance): refonte ergonomie live (liste → focus → split repos+récap)"
```

**NE PAS PUSHER** : l'utilisateur teste en local avant.

---

## Checks finaux

- [ ] Inputs modal : "29.3" visible en entier
- [ ] Liste exercices : badges, progression
- [ ] Focus : Modifier + Valider, valeurs précédentes
- [ ] Repos split : countdown au centre, récap, modifier rétroactif
- [ ] Auto-advance après repos
- [ ] Retour à la liste sans perte
- [ ] Multi-activités exercices (stopwatch/countdown overlays branchés)
- [ ] Cardio inchangé
- [ ] Reprise séance : la liste s'affiche, les progressions sont là
- [ ] Sync montre fonctionne
- [ ] Pas de code mort qui interfère (advanceActivityState orphelin, etc.)
