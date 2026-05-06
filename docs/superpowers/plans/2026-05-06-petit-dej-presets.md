# Presets petit-dej — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ajouter deux boutons "Petit-dej avant salle" / "Petit-dej après salle" sur l'écran Alimentation, basés sur des presets stockés en DB. Premier tap = définition (saisie + Claude), taps suivants = insertion instantanée sans appel API.

**Architecture:** Nouvelle table `meal_presets` Supabase (1 ligne par slot/utilisateur), 3 fonctions DAL dans `supabase.js`, nouveau modal HTML dédié `meal-preset-modal`, nouvelles fonctions JS dans `app.js` intégrées dans `renderAlimentation()`.

**Tech Stack:** vanilla JS, Supabase JS, API Anthropic, aucune infra de test (smoke manuel sur PWA).

**Spec :** `docs/superpowers/specs/2026-05-06-petit-dej-presets-design.md`

---

### Task 1 — Migration SQL `meal_presets`

**Files:**
- Modify: `supabase-schema.sql` (ajout en fin de fichier, après la section food_entries)
- Apply: migration via MCP `apply_migration`

- [ ] **Step 1 : Appliquer la migration sur Supabase distant**

Exécute via l'outil MCP `mcp__supabase__apply_migration` :

- name : `meal_presets`
- query :

```sql
create table if not exists public.meal_presets (
  id            uuid default gen_random_uuid() primary key,
  client_id     uuid references public.profiles(id) on delete cascade,
  slot          text not null check (slot in ('pre_gym', 'post_gym')),
  description   text not null,
  kcal          numeric,
  proteines_g   numeric,
  glucides_g    numeric,
  lipides_g     numeric,
  updated_at    timestamptz default now(),
  unique (client_id, slot)
);

alter table public.meal_presets enable row level security;

create policy "Client gère ses presets repas" on public.meal_presets
  for all using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

create policy "Coach lit les presets repas de ses clients" on public.meal_presets
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = meal_presets.client_id and p.coach_id = auth.uid()
    )
  );
```

- [ ] **Step 2 : Vérifier que la table existe**

Via MCP `mcp__supabase__list_tables` (schema `public`) — confirmer que `meal_presets` apparaît avec les colonnes attendues.

- [ ] **Step 3 : Mettre à jour `supabase-schema.sql`**

Ouvrir `supabase-schema.sql`, repérer la fin de la section food_entries (après la policy "Coach lit les entrées alimentaires de ses clients"). Insérer juste avant le commentaire `-- Bucket Storage food-photos` :

```sql
-- 5b. Table meal_presets (presets repas — petit-dej avant/après salle)
create table if not exists public.meal_presets (
  id            uuid default gen_random_uuid() primary key,
  client_id     uuid references public.profiles(id) on delete cascade,
  slot          text not null check (slot in ('pre_gym', 'post_gym')),
  description   text not null,
  kcal          numeric,
  proteines_g   numeric,
  glucides_g    numeric,
  lipides_g     numeric,
  updated_at    timestamptz default now(),
  unique (client_id, slot)
);

alter table public.meal_presets enable row level security;

create policy "Client gère ses presets repas" on public.meal_presets
  for all using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

create policy "Coach lit les presets repas de ses clients" on public.meal_presets
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = meal_presets.client_id and p.coach_id = auth.uid()
    )
  );

```

- [ ] **Step 4 : Commit**

```bash
git add supabase-schema.sql
git commit -m "feat(alim): table meal_presets (presets repas)"
```

---

### Task 2 — Data layer dans `supabase.js`

**Files:**
- Modify: `supabase.js` (insérer après `deleteFoodEntryDB`, avant la section "Food photos")

- [ ] **Step 1 : Ajouter les 3 fonctions DAL**

Dans `supabase.js`, repérer la ligne contenant `async function deleteFoodEntryDB(id)` (ligne 177) et la ligne suivante `if (error) console.error('deleteFoodEntryDB error:', error);` puis la `}` de fermeture, puis le commentaire `/* ── Food photos (Supabase Storage) ──────────────────── */`.

Insérer **entre la `}` de `deleteFoodEntryDB` et le commentaire `/* ── Food photos`** le bloc suivant :

```js

/* ── Meal presets (petit-dej avant/après salle) ──────── */
async function loadMealPresets() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];
  const { data, error } = await db.from('meal_presets')
    .select('*')
    .eq('client_id', user.id);
  if (error) { console.error('loadMealPresets error:', error); return []; }
  return data || [];
}

async function loadMealPreset(slot) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data, error } = await db.from('meal_presets')
    .select('*')
    .eq('client_id', user.id)
    .eq('slot', slot)
    .maybeSingle();
  if (error) { console.error('loadMealPreset error:', error); return null; }
  return data;
}

async function upsertMealPreset(slot, payload) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const row = {
    client_id: user.id,
    slot,
    description: payload.description,
    kcal:        payload.kcal        ?? null,
    proteines_g: payload.proteines_g ?? null,
    glucides_g:  payload.glucides_g  ?? null,
    lipides_g:   payload.lipides_g   ?? null,
    updated_at:  new Date().toISOString(),
  };
  const { data, error } = await db.from('meal_presets')
    .upsert(row, { onConflict: 'client_id,slot' })
    .select()
    .single();
  if (error) { console.error('upsertMealPreset error:', error); return null; }
  return data;
}
```

- [ ] **Step 2 : Vérifier dans le navigateur**

Lancer un serveur local rapide :

```bash
cd /home/lsecousse/WebstormProjects/Micky && python3 -m http.server 8000
```

Ouvrir `http://localhost:8000`, se connecter, puis dans la console DevTools :

```js
await loadMealPresets();          // → []
await loadMealPreset('pre_gym');  // → null
await upsertMealPreset('pre_gym', { description: 'test', kcal: 100 });  // → row
await loadMealPreset('pre_gym');  // → row avec description "test"
```

Si le 4ᵉ retourne bien la ligne, OK. Nettoyer ensuite (depuis SQL editor Supabase ou via un autre upsert).

- [ ] **Step 3 : Commit**

```bash
git add supabase.js
git commit -m "feat(alim): DAL meal_presets (load/upsert)"
```

---

### Task 3 — Modal HTML `meal-preset-modal`

**Files:**
- Modify: `index.html`

- [ ] **Step 1 : Ajouter le modal après `add-meal-modal`**

Dans `index.html`, repérer la ligne `</div>` qui ferme `<div id="add-meal-modal">` (autour de la ligne 223). Insérer **immédiatement après** ce `</div>` (juste avant les balises `<script>`) :

```html

  <!-- MODAL PRESET PETIT-DEJ -->
  <div id="meal-preset-modal" class="live-edit-modal hidden">
    <div class="live-edit-modal-overlay"></div>
    <div class="live-edit-modal-card">
      <div class="live-edit-modal-title" id="meal-preset-title">Définir petit-dej</div>
      <textarea id="meal-preset-text" placeholder="3 weetabix, miel, banane…" rows="3"
                style="width:100%;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:15px;resize:vertical"></textarea>
      <p id="meal-preset-error" class="error-msg hidden"></p>
      <div class="live-edit-modal-actions">
        <button class="btn-secondary" id="meal-preset-cancel">Annuler</button>
        <button class="btn-primary"   id="meal-preset-save">Estimer & sauvegarder</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2 : Vérifier le markup en navigateur**

Recharger `http://localhost:8000`. Dans la console :

```js
document.getElementById('meal-preset-modal');     // → <div>
document.getElementById('meal-preset-text');      // → <textarea>
document.getElementById('meal-preset-save');      // → <button>
```

- [ ] **Step 3 : Commit**

```bash
git add index.html
git commit -m "feat(alim): modal meal-preset-modal"
```

---

### Task 4 — CSS ligne preset

**Files:**
- Modify: `style.css`

- [ ] **Step 1 : Ajouter le CSS en fin de fichier**

Dans `style.css`, ajouter à la fin :

```css
/* Boutons preset petit-dej dans l'écran alim */
.alim-preset-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.alim-preset-row .alim-preset-btn {
  flex: 1;
  min-width: 0;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.alim-preset-row .alim-preset-edit {
  flex: 0 0 auto;
  width: 44px;
  padding: 0;
  font-size: 16px;
}
.alim-preset-edit.hidden { display: none; }
```

- [ ] **Step 2 : Commit**

```bash
git add style.css
git commit -m "feat(alim): CSS boutons preset petit-dej"
```

---

### Task 5 — Logique JS `openMealPresetEditModal`

**Files:**
- Modify: `app.js`

- [ ] **Step 1 : Ajouter la fonction après `openAddMealModal`**

Dans `app.js`, repérer la fonction `openAddMealModal` (commence ligne 3071, se termine vers la ligne 3159 par `setTimeout(() => textEl.focus(), 50);` puis `}`). Insérer **immédiatement après la `}` de fermeture** de `openAddMealModal` (donc juste avant `async function estimateMealMacros(text)`) :

```js

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
        await addMealFromPreset(dateIso, slot);
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
```

- [ ] **Step 2 : Commit**

```bash
git add app.js
git commit -m "feat(alim): modal édition preset petit-dej"
```

---

### Task 6 — Logique JS `addMealFromPreset`

**Files:**
- Modify: `app.js`

- [ ] **Step 1 : Ajouter la fonction juste après `openMealPresetEditModal`**

Dans `app.js`, **immédiatement après la `}` de `openMealPresetEditModal`** ajoutée à la Task 5 (et avant `async function estimateMealMacros`), insérer :

```js

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
```

- [ ] **Step 2 : Commit**

```bash
git add app.js
git commit -m "feat(alim): addMealFromPreset (insert sans Claude)"
```

---

### Task 7 — Intégration `renderMealPresetButtons` dans `renderAlimentation`

**Files:**
- Modify: `app.js`

- [ ] **Step 1 : Ajouter la fonction `renderMealPresetButtons` avant `renderAlimentation`**

Dans `app.js`, juste **avant la ligne** `async function renderAlimentation() {` (ligne 2896, sous le commentaire `ALIMENTATION`), insérer :

```js

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
    row.className = 'alim-preset-row';

    const mainBtn = document.createElement('button');
    mainBtn.className = 'btn-secondary alim-preset-btn';
    mainBtn.textContent = `${emoji} ${label}`;

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-secondary alim-preset-edit';
    editBtn.textContent = '⚙️';
    if (!preset) editBtn.classList.add('hidden');

    mainBtn.addEventListener('click', async () => {
      if (mainBtn.disabled) return;
      const fresh = await loadMealPreset(slot);
      if (!fresh || !fresh.description) {
        openMealPresetEditModal(slot, 'define', dateIso, onChanged);
      } else {
        mainBtn.disabled = true;
        try {
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
```

- [ ] **Step 2 : Appeler `renderMealPresetButtons` dans `renderAlimentation`**

Toujours dans `app.js`, dans `renderAlimentation()`, repérer la séquence (autour des lignes 2922-2928) :

```js
  // ── Bilan card ───────────────────────────────────────
  const bilanCard = document.createElement('div');
  bilanCard.className = 'alim-bilan';
  body.appendChild(bilanCard);

  // ── Action buttons ───────────────────────────────────
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-primary btn-full';
  addBtn.textContent = '+ Ajouter un repas';
  body.appendChild(addBtn);
```

Insérer entre `body.appendChild(bilanCard);` et le commentaire `// ── Action buttons` un nouveau bloc, de sorte que le résultat final soit :

```js
  // ── Bilan card ───────────────────────────────────────
  const bilanCard = document.createElement('div');
  bilanCard.className = 'alim-bilan';
  body.appendChild(bilanCard);

  // ── Preset buttons (petit-dej avant/après salle) ─────
  const presetContainer = document.createElement('div');
  body.appendChild(presetContainer);

  // ── Action buttons ───────────────────────────────────
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-primary btn-full';
  addBtn.textContent = '+ Ajouter un repas';
  body.appendChild(addBtn);
```

- [ ] **Step 3 : Remplacer la fin de `renderAlimentation` par un wiring `refreshAll`**

Repérer en fin de `renderAlimentation()` (autour des lignes 3056-3062) le bloc :

```js
  dateInput.addEventListener('change', refresh);
  addBtn.addEventListener('click', () => openAddMealModal(dateInput.value, refresh));
  adviceBtn.addEventListener('click', () => openEveningAdviceModal(dateInput.value));
  askBtn.addEventListener('click', () => openAskQuestionModal(dateInput.value));

  await refresh();
}
```

Le remplacer **intégralement** par :

```js
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
```

`refreshAll` re-render les presets puis les entrées. Tous les listeners pointent dessus pour rester cohérents quand un preset est créé/modifié.

- [ ] **Step 4 : Commit**

```bash
git add app.js
git commit -m "feat(alim): boutons preset petit-dej dans renderAlimentation"
```

---

### Task 8 — Smoke test manuel

**Files:** aucun (test fonctionnel sur la PWA).

- [ ] **Step 1 : Lancer le serveur local**

```bash
cd /home/lsecousse/WebstormProjects/Micky && python3 -m http.server 8000
```

Ouvrir `http://localhost:8000` dans Chrome (ou Safari iOS via tunnel). Se connecter.

- [ ] **Step 2 : Tester scénario "premier tap = définition"**

1. Aller sur l'onglet Alimentation.
2. Vérifier la présence des deux nouveaux boutons "☕ Petit-dej avant salle" et "🥛 Petit-dej après salle". Le bouton ⚙️ doit être **caché** sur les deux.
3. Tap sur "☕ Petit-dej avant salle".
4. Modal s'ouvre, titre = "Définir petit-dej avant salle".
5. Saisir "3 weetabix, miel, banane".
6. Cliquer "Estimer & sauvegarder".
7. Modal se ferme. La timeline contient une nouvelle entrée meal avec macros estimées et heure courante. Le ⚙️ à côté du bouton "☕" est désormais visible.

- [ ] **Step 3 : Tester scénario "tap suivant = ajout instant"**

1. Tap à nouveau sur "☕ Petit-dej avant salle".
2. Pas de modal. Toast "Petit-dej ajouté à HH:MM".
3. Une 2ᵉ entrée meal identique apparaît dans la timeline.
4. **Important :** vérifier dans DevTools Network que **aucun appel à `api.anthropic.com`** n'a été émis pendant cette étape.

- [ ] **Step 4 : Tester scénario "édition via ⚙️"**

1. Tap ⚙️ à côté de "☕".
2. Modal s'ouvre, titre = "Modifier petit-dej avant salle", textarea pré-remplie avec "3 weetabix, miel, banane".
3. Modifier en "2 œufs, café, banane".
4. Cliquer "Estimer & sauvegarder".
5. Modal se ferme. **Aucune nouvelle entrée** dans la timeline (le preset est mis à jour, mais pas d'insertion).
6. Tap sur "☕ Petit-dej avant salle" → nouvelle entrée avec description "2 œufs, café, banane".

- [ ] **Step 5 : Tester scénario "post-salle"**

Répéter Steps 2-3 avec le bouton "🥛 Petit-dej après salle" pour valider que les deux slots sont indépendants.

- [ ] **Step 6 : Tester scénario "preset vide après réinitialisation"**

Dans le SQL editor Supabase :

```sql
delete from public.meal_presets where client_id = auth.uid();
```

Recharger la PWA, aller sur Alimentation. Les deux ⚙️ doivent être cachés, et un tap sur un bouton principal doit rouvrir le modal "Définir…".

- [ ] **Step 7 : Tester scénario "Claude indispo"**

Dans DevTools Network → bloquer `api.anthropic.com`. Tap sur un bouton preset vide → modal s'ouvre → save → message d'erreur dans le modal, pas de preset créé. Débloquer.

- [ ] **Step 8 : Commit final si nécessaire**

Si des correctifs ont été apportés pendant le smoke test :

```bash
git add -A
git commit -m "fix(alim): correctifs smoke test presets petit-dej"
```

Sinon, rien à committer.

---

## Récap fichiers touchés

| Fichier | Type |
|---|---|
| `supabase-schema.sql` | Modify (ajout section meal_presets) |
| `supabase.js` | Modify (3 fonctions DAL) |
| `index.html` | Modify (modal `meal-preset-modal`) |
| `style.css` | Modify (CSS preset row) |
| `app.js` | Modify (`renderMealPresetButtons`, `openMealPresetEditModal`, `addMealFromPreset`, intégration `renderAlimentation`) |

Migration Supabase appliquée via MCP (Task 1 Step 1).
