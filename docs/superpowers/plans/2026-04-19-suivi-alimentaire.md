# Suivi alimentaire — Plan d'implémentation (Lot F)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. **Ne pas push** : commits locaux, l'utilisateur teste avant.

**Goal:** Module Alimentation : timeline du jour avec apports (repas saisie + photo + estimation IA des macros) et dépenses (séance auto-injectée), + conseil du soir IA.

**Architecture:** Nouvelle table `food_entries` (Supabase), bucket Storage `food-photos`. Réorganisation navigation (footer 3 boutons, burger gagne Historique+Stats, perd Connecter montre). Module masqué si pas de clé API Claude.

**Tech Stack:** vanilla JS, Supabase (Postgres + Storage), API Claude.

---

### Task 1 — Migration BDD : table `food_entries`

**Files:**
- Modify: `supabase-schema.sql`

- [ ] **Step 1 : Créer la table via MCP Supabase**

```sql
CREATE TABLE IF NOT EXISTS public.food_entries (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  date          date NOT NULL,
  time          time NOT NULL,
  type          text NOT NULL CHECK (type IN ('meal', 'session_burn')),
  description   text NOT NULL,
  photo_path    text,
  kcal          numeric,
  proteines_g   numeric,
  glucides_g    numeric,
  lipides_g     numeric,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.food_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client gère ses entrées alimentaires" ON public.food_entries
  FOR ALL USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coach lit les entrées alimentaires de ses clients" ON public.food_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = food_entries.client_id AND p.coach_id = auth.uid())
  );
```

- [ ] **Step 2 : Créer le bucket Storage `food-photos`**

Via MCP, créer le bucket :

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('food-photos', 'food-photos', false)
ON CONFLICT (id) DO NOTHING;
```

Puis ajouter les policies RLS :

```sql
CREATE POLICY "User uploads to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'food-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "User reads own photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'food-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "User deletes own photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'food-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 3 : Reporter dans `supabase-schema.sql`**

Ajouter le `CREATE TABLE` (idempotent) à la fin de `supabase-schema.sql` pour que les futures réinstalls aient la table.

- [ ] **Step 4 : Commit local (no push)**

```bash
git add supabase-schema.sql
git commit -m "feat(db): table food_entries pour suivi alimentaire"
```

---

### Task 2 — Helpers Supabase pour `food_entries` + Storage

**Files:**
- Modify: `supabase.js`

- [ ] **Step 1 : Ajouter les CRUD à la fin de `supabase.js`**

```js
/* ── Food entries ────────────────────────────────────── */
async function loadFoodEntriesForDate(dateIso) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];
  const { data, error } = await db.from('food_entries')
    .select('*')
    .eq('client_id', user.id)
    .eq('date', dateIso)
    .order('time', { ascending: true });
  if (error) console.error('loadFoodEntriesForDate error:', error);
  return data || [];
}

async function insertFoodEntryDB(entry) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const payload = { ...entry, client_id: user.id };
  const { data, error } = await db.from('food_entries').insert(payload).select().single();
  if (error) { console.error('insertFoodEntryDB error:', error); return null; }
  return data;
}

async function deleteFoodEntryDB(id) {
  const { error } = await db.from('food_entries').delete().eq('id', id);
  if (error) console.error('deleteFoodEntryDB error:', error);
}

/* ── Food photos (Supabase Storage) ──────────────────── */
async function uploadFoodPhoto(file, entryId) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${user.id}/${entryId}.${ext}`;
  const { error } = await db.storage.from('food-photos').upload(path, file, { upsert: true });
  if (error) { console.error('uploadFoodPhoto error:', error); return null; }
  return path;
}

async function getFoodPhotoSignedUrl(path) {
  if (!path) return null;
  const { data, error } = await db.storage.from('food-photos').createSignedUrl(path, 3600);
  if (error) { console.error('getFoodPhotoSignedUrl error:', error); return null; }
  return data?.signedUrl || null;
}

async function deleteFoodPhoto(path) {
  if (!path) return;
  await db.storage.from('food-photos').remove([path]);
}
```

- [ ] **Step 2 : Sanity check**

```bash
node -c supabase.js
grep -n "loadFoodEntriesForDate\|insertFoodEntryDB\|deleteFoodEntryDB\|uploadFoodPhoto\|getFoodPhotoSignedUrl\|deleteFoodPhoto" supabase.js
```

Doit retourner 6 définitions exactement.

- [ ] **Step 3 : Commit**

```bash
git add supabase.js
git commit -m "feat(alim): helpers Supabase CRUD food_entries + Storage"
```

---

### Task 3 — Réorganiser navigation home : footer + burger

**Files:**
- Modify: `index.html`
- Modify: `app.js`

- [ ] **Step 1 : Footer home — 3 boutons**

Dans `/home/lsecousse/WebstormProjects/Micky/index.html`, localiser le footer home (vers ligne 38) :

```html
<div class="home-footer">
  <button class="home-footer-btn" id="go-corps"><span class="btn-icon">⚖️</span>Données corporelles</button>
  <button class="home-footer-btn" id="go-history"><span class="btn-icon">📋</span>Historique</button>
  <button class="home-footer-btn" id="go-stats"><span class="btn-icon">📈</span>Stats</button>
  <button class="home-footer-btn" id="go-params"><span class="btn-icon">⚙️</span>Programmes</button>
</div>
```

Remplacer par :

```html
<div class="home-footer">
  <button class="home-footer-btn" id="go-corps"><span class="btn-icon">⚖️</span>Données corporelles</button>
  <button class="home-footer-btn" id="go-alim"><span class="btn-icon">🍽️</span>Alimentation</button>
  <button class="home-footer-btn" id="go-params"><span class="btn-icon">⚙️</span>Programmes</button>
</div>
```

- [ ] **Step 2 : Burger menu — ajouter Historique + Stats, retirer Connecter la montre**

Dans `app.js`, localiser `function buildUserDropdown()` (vers ligne 343). Remplacer le tableau `items` par :

```js
  const items = [
    { label: 'Profil',          icon: '👤', action: () => { dropdown.classList.add('hidden'); showScreen('profil'); } },
    { label: 'Clé API Claude',  icon: '🔑', action: () => { dropdown.classList.add('hidden'); showScreen('claude-api'); } },
    { label: 'Historique',      icon: '📋', action: () => { dropdown.classList.add('hidden'); showScreen('history'); } },
    { label: 'Stats',           icon: '📈', action: () => { dropdown.classList.add('hidden'); showScreen('stats'); } },
    { label: 'Déconnexion',     icon: '🚪', danger: true, action: () => {
      dropdown.classList.add('hidden');
      showConfirm('Se déconnecter ?', async () => {
        await db.auth.signOut();
        currentUser = null;
        loginReady = false;
        showScreen('login');
      });
    }},
  ];
```

(Connecter la montre supprimé.)

- [ ] **Step 3 : Adapter les listeners dans `app.js`**

Trouver `document.getElementById('go-history').addEventListener(...)` et `document.getElementById('go-stats').addEventListener(...)` (vers ligne 159–161). Les supprimer.

Ajouter le listener du nouveau bouton Alimentation à la place :

```js
document.getElementById('go-alim').addEventListener('click',     () => showScreen('alim'));
```

- [ ] **Step 4 : Sanity**

```bash
node -c app.js
grep -n "go-history\|go-stats\|go-alim\|Connecter la montre" app.js index.html
```

Attendu :
- `go-history` 0 occurrence (supprimé)
- `go-stats` 0 occurrence (supprimé)
- `go-alim` : 1 dans index.html (button) + 1 dans app.js (listener)
- `Connecter la montre` 0 occurrence

- [ ] **Step 5 : Commit**

```bash
git add app.js index.html
git commit -m "feat(home): footer 3 boutons + burger gagne Historique/Stats, perd Connecter montre"
```

---

### Task 4 — Écran Alimentation : structure HTML + screen routing

**Files:**
- Modify: `index.html`
- Modify: `app.js`

- [ ] **Step 1 : Ajouter le screen dans `index.html`**

Dans `index.html`, après le screen `screen-stats` (vers ligne 95–101), ajouter :

```html
    <!-- ALIMENTATION -->
    <div id="screen-alim" class="screen">
      <div class="screen-header">
        <button class="screen-back" id="back-alim">←</button>
        <span class="screen-title">Alimentation</span>
      </div>
      <div class="screen-body" id="screen-alim-body"></div>
    </div>
```

- [ ] **Step 2 : Router le screen dans `showScreen`**

Dans `app.js`, dans la fonction `showScreen(name)` (vers ligne 144), ajouter une ligne pour le rendu de `alim` :

Trouver la séquence de `if (name === 'xxx') renderXxx();` autour de ligne 149-156. Ajouter :

```js
  if (name === 'alim')    renderAlimentation();
```

Et le bouton retour, près des autres `back-*` listeners (vers ligne 165–168) :

```js
document.getElementById('back-alim').addEventListener('click',     () => showScreen('home'));
```

- [ ] **Step 3 : Stub `renderAlimentation`**

Dans `app.js`, ajouter avant `renderStats` (ou n'importe où à un endroit logique) :

```js
async function renderAlimentation() {
  const body = document.getElementById('screen-alim-body');
  body.innerHTML = '<p class="empty-msg">Chargement…</p>';

  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) {
    body.innerHTML = `
      <p class="empty-msg">Configure ta clé API Claude dans Profil pour activer le suivi alimentaire.</p>
      <button class="btn-primary btn-full" id="alim-go-key">→ Configurer la clé Claude</button>
    `;
    document.getElementById('alim-go-key').addEventListener('click', () => showScreen('claude-api'));
    return;
  }

  // Stub à compléter en Task 5
  body.innerHTML = '<p class="empty-msg">À implémenter (Task 5)</p>';
}
```

- [ ] **Step 4 : Sanity**

```bash
node -c app.js
grep -n "screen-alim\|renderAlimentation\|back-alim" app.js index.html
```

- [ ] **Step 5 : Commit**

```bash
git add app.js index.html
git commit -m "feat(alim): screen Alimentation + routing + garde clé API"
```

---

### Task 5 — Render timeline + bilan + boutons d'action

**Files:**
- Modify: `app.js`
- Modify: `style.css`

- [ ] **Step 1 : Implémenter `renderAlimentation` complet**

Remplacer le stub par :

```js
async function renderAlimentation() {
  const body = document.getElementById('screen-alim-body');
  body.innerHTML = '<p class="empty-msg">Chargement…</p>';

  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) {
    body.innerHTML = `
      <p class="empty-msg">Configure ta clé API Claude dans Profil pour activer le suivi alimentaire.</p>
      <button class="btn-primary btn-full" id="alim-go-key">→ Configurer la clé Claude</button>
    `;
    document.getElementById('alim-go-key').addEventListener('click', () => showScreen('claude-api'));
    return;
  }

  body.innerHTML = '';

  // ── Date selector ────────────────────────────────────
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = todayIso();
  dateInput.className = 'alim-date-input';
  body.appendChild(dateInput);

  // ── Bilan card ───────────────────────────────────────
  const bilanCard = document.createElement('div');
  bilanCard.className = 'alim-bilan';
  body.appendChild(bilanCard);

  // ── Action buttons ───────────────────────────────────
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-primary btn-full';
  addBtn.textContent = '+ Ajouter un repas';
  body.appendChild(addBtn);

  const adviceBtn = document.createElement('button');
  adviceBtn.className = 'btn-secondary btn-full';
  adviceBtn.textContent = '🌙 Conseil pour ce soir';
  body.appendChild(adviceBtn);

  // ── Timeline container ───────────────────────────────
  const timeline = document.createElement('div');
  timeline.className = 'alim-timeline';
  body.appendChild(timeline);

  async function refresh() {
    const entries = await loadFoodEntriesForDate(dateInput.value);

    // Bilan
    let apports = 0, depenses = 0;
    entries.forEach(e => {
      const k = parseFloat(e.kcal) || 0;
      if (e.type === 'meal') apports += k;
      else if (e.type === 'session_burn') depenses += k;
    });
    const net = apports - depenses;
    bilanCard.innerHTML = `
      <div class="alim-bilan-row"><span>Apports</span><b>${Math.round(apports)} kcal</b></div>
      <div class="alim-bilan-row"><span>Dépenses</span><b>${Math.round(depenses)} kcal</b></div>
      <div class="alim-bilan-row alim-bilan-net"><span>Net</span><b>${net >= 0 ? '+' : ''}${Math.round(net)} kcal</b></div>
    `;

    // Timeline
    timeline.innerHTML = '';
    if (!entries.length) {
      timeline.innerHTML = '<p class="empty-msg">Aucune entrée pour ce jour.</p>';
      return;
    }

    for (const e of entries) {
      const card = document.createElement('div');
      card.className = `alim-entry alim-entry--${e.type}`;
      const isMeal = e.type === 'meal';
      const arrow  = isMeal ? '↑' : '↓';
      const icon   = isMeal ? '' : '🏋️ ';
      const macros = isMeal && e.proteines_g != null
        ? `<div class="alim-entry-macros">P ${e.proteines_g}g · G ${e.glucides_g}g · L ${e.lipides_g}g</div>`
        : '';

      card.innerHTML = `
        <div class="alim-entry-time">${(e.time || '').slice(0, 5)}</div>
        <div class="alim-entry-main">
          <div class="alim-entry-desc">${icon}${e.description}</div>
          ${macros}
        </div>
        <div class="alim-entry-kcal">${arrow} ${Math.round(e.kcal || 0)} kcal</div>
        <button class="btn-icon-danger alim-entry-del" data-id="${e.id}" data-photo="${e.photo_path || ''}">✕</button>
      `;

      // Tap sur la card avec photo : preview
      if (e.photo_path) {
        card.classList.add('alim-entry--with-photo');
        card.addEventListener('click', async (ev) => {
          if (ev.target.closest('.alim-entry-del')) return;
          const url = await getFoodPhotoSignedUrl(e.photo_path);
          if (url) showFoodPhotoModal(url);
        });
      }

      timeline.appendChild(card);
    }

    // Wire delete buttons
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

  dateInput.addEventListener('change', refresh);
  addBtn.addEventListener('click', () => openAddMealModal(dateInput.value, refresh));
  adviceBtn.addEventListener('click', () => openEveningAdviceModal(dateInput.value));

  await refresh();
}

function showFoodPhotoModal(url) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  body.innerHTML = `<img src="${url}" style="width:100%;height:auto;border-radius:8px" />`;
  modal.classList.remove('hidden');
}
```

`openAddMealModal` et `openEveningAdviceModal` seront ajoutés en Task 6 et 8.

- [ ] **Step 2 : CSS — timeline et bilan**

Append à `style.css` :

```css
/* ── Alimentation ─────────────────────────────────────── */
.alim-date-input {
  width: 100%;
  padding: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
}

.alim-bilan {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.alim-bilan-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: var(--text-muted);
}
.alim-bilan-row b { color: var(--text); font-weight: 600; }
.alim-bilan-net  { font-size: 16px; padding-top: 6px; border-top: 1px solid var(--border); margin-top: 4px; }
.alim-bilan-net b { color: var(--accent); }

.alim-timeline { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.alim-entry {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 10px;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.alim-entry--with-photo { cursor: pointer; }
.alim-entry-time { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.alim-entry-main { min-width: 0; }
.alim-entry-desc { font-size: 14px; }
.alim-entry-macros { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.alim-entry-kcal { font-size: 13px; font-weight: 600; color: var(--accent); white-space: nowrap; }
.alim-entry--session_burn .alim-entry-kcal { color: #5abe78; }
.alim-entry-del {
  background: rgba(255,60,60,0.12);
  border: none;
  color: var(--danger);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
```

- [ ] **Step 3 : Sanity**

```bash
node -c app.js
grep -n "renderAlimentation\|alim-bilan\|alim-entry" app.js style.css
```

- [ ] **Step 4 : Commit**

```bash
git add app.js style.css
git commit -m "feat(alim): timeline + bilan jour + bouton ajouter/conseil"
```

---

### Task 6 — Modal d'ajout de repas + estimation IA macros

**Files:**
- Modify: `index.html` (ajout modal)
- Modify: `style.css`
- Modify: `app.js`

- [ ] **Step 1 : Markup modal dans `index.html`**

Après le modal `live-edit-modal` (~ligne 199), ajouter :

```html
  <!-- MODAL AJOUTER REPAS -->
  <div id="add-meal-modal" class="live-edit-modal hidden">
    <div class="live-edit-modal-overlay"></div>
    <div class="live-edit-modal-card">
      <div class="live-edit-modal-title">Ajouter un repas</div>
      <textarea id="meal-text" placeholder="3 weetabix, miel, banane…" rows="3"
                style="width:100%;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:15px;resize:vertical"></textarea>
      <input type="file" id="meal-photo" accept="image/*" capture="environment" style="display:none" />
      <button type="button" id="meal-photo-btn" class="btn-secondary">📸 Joindre une photo</button>
      <div id="meal-photo-preview" class="hidden" style="text-align:center"></div>
      <p id="meal-error" class="error-msg hidden"></p>
      <div class="live-edit-modal-actions">
        <button class="btn-secondary" id="meal-cancel">Annuler</button>
        <button class="btn-primary"   id="meal-save">Estimer & sauvegarder</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2 : Logique `openAddMealModal` + estimation IA**

Dans `app.js`, ajouter :

```js
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
      preview.innerHTML = `<img src="${url}" style="max-width:100%;max-height:180px;border-radius:8px;margin-top:8px" />`;
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
```

- [ ] **Step 3 : Sanity**

```bash
node -c app.js
grep -n "openAddMealModal\|estimateMealMacros\|add-meal-modal" app.js index.html
```

- [ ] **Step 4 : Commit**

```bash
git add app.js index.html style.css
git commit -m "feat(alim): modal d'ajout de repas avec photo et estimation IA macros"
```

---

### Task 7 — Auto-injection session_burn à la fin de séance

**Files:**
- Modify: `app.js`

- [ ] **Step 1 : Ajouter `estimateSessionBurn`**

Dans `app.js`, ajouter (à côté des autres helpers IA, vers les autres `estimateXxx`) :

```js
async function estimateSessionBurn(session) {
  const apiKey = await getClaudeApiKeyDB();
  if (!apiKey) return null;

  const exercises = (session.exercises || []).map(e => e.name);
  const duration_min = session.duration ? Math.round(session.duration / 60) : null;
  const volume_kg = session.category === 'cardio' ? null : Math.round(totalVolume(session.exercises));
  const payload = {
    type: session.category || 'fonte',
    duree_min: duration_min,
    volume_kg,
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
```

- [ ] **Step 2 : Hook dans `finishSession`**

Localiser `function finishSession()` (vers ligne 1415) et trouver l'endroit où la session est marquée terminée et persistée. Après le `await pushSession(snapshot)` (ou équivalent qui marque la fin), AJOUTER (juste avant le `liveSession = null` final ou la transition vers home) :

```js
  // Auto-injection de la dépense calorique dans le suivi alimentaire (fire-and-forget)
  (async () => {
    const sn = liveSessionSnapshot(durationSecs);
    const burn = await estimateSessionBurn(sn);
    if (burn?.kcal) {
      const now = new Date();
      await insertFoodEntryDB({
        date: sn.date,
        time: now.toTimeString().slice(0, 8),
        type: 'session_burn',
        description: sn.programmeName || 'Séance',
        kcal: burn.kcal,
      });
    }
  })().catch(() => {});
```

**Étape de découverte préalable** : `grep -n "function finishSession\|durationSecs\|liveSessionSnapshot" app.js` pour trouver le contexte précis. Le nom `durationSecs` peut différer — adapter pour récupérer la durée de la session telle qu'elle est calculée à ce moment-là.

- [ ] **Step 3 : Sanity**

```bash
node -c app.js
grep -n "estimateSessionBurn\|insertFoodEntryDB" app.js
```

- [ ] **Step 4 : Commit**

```bash
git add app.js
git commit -m "feat(alim): auto-injection dépense calorique à la fin d'une séance"
```

---

### Task 8 — Modal "Conseil pour ce soir"

**Files:**
- Modify: `app.js`

- [ ] **Step 1 : Implémenter `openEveningAdviceModal`**

```js
async function openEveningAdviceModal(dateIso) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  body.innerHTML = `
    <div class="feedback-ia-modal">
      <div class="modal-title" style="color:#5abe78">🌙 Conseil pour ce soir</div>
      <div class="feedback-ia-loading">
        <div class="feedback-ia-spinner"></div>
        <p>Réflexion en cours…</p>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');

  try {
    const entries = await loadFoodEntriesForDate(dateIso);
    let apports = 0, depenses = 0;
    entries.forEach(e => {
      const k = parseFloat(e.kcal) || 0;
      if (e.type === 'meal') apports += k;
      else if (e.type === 'session_burn') depenses += k;
    });
    const net = apports - depenses;

    const apiKey = await getClaudeApiKeyDB();
    if (!apiKey) throw new Error('Clé API Claude manquante.');

    const payload = {
      net_kcal: Math.round(net),
      apports_kcal: Math.round(apports),
      depenses_kcal: Math.round(depenses),
      entries: entries.map(e => ({
        time: e.time, type: e.type, description: e.description,
        kcal: e.kcal, P: e.proteines_g, G: e.glucides_g, L: e.lipides_g,
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
        max_tokens: 250,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        system: `Coach nutrition bienveillant. L'utilisateur a fait sa journée alimentaire. Donne un conseil court (3-4 phrases, français, ton chaleureux) pour son repas du soir : type de plat, équilibre macros, taille de portion. Pas de recette détaillée. Pas de jugement sur ce qu'il a mangé.`,
      }),
    });
    if (!response.ok) throw new Error(`Erreur API ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text || 'Pas de réponse.';

    body.innerHTML = `
      <div class="feedback-ia-modal">
        <div class="modal-title" style="color:#5abe78">🌙 Conseil pour ce soir</div>
        <div class="corps-analysis-content">${formatFeedback(text)}</div>
      </div>
    `;
  } catch (e) {
    body.innerHTML = `
      <div class="feedback-ia-modal">
        <div class="modal-title" style="color:#ff5c5c">Erreur</div>
        <div class="corps-analysis-content">${e.message}</div>
      </div>
    `;
  }
}
```

- [ ] **Step 2 : Sanity**

```bash
node -c app.js
grep -n "openEveningAdviceModal" app.js
```

- [ ] **Step 3 : Validation manuelle (toute la chaîne)**

Démarrer le serveur, ouvrir l'app, hard-refresh.

1. Vérifier footer Home : 3 boutons.
2. Vérifier burger ☰ : 5 items, pas de Connecter la montre.
3. Tap Alimentation → si pas de clé : message d'invite.
4. Configurer la clé Claude → revenir : timeline vide + bilan 0/0/0 + 2 boutons.
5. + Ajouter un repas → modal s'ouvre, taper "3 weetabix banane miel", "Estimer & sauvegarder" → spinner court → entrée apparaît avec macros et kcal.
6. Recommencer avec photo → preview affichée, save → entrée avec icône photo, tap dessus = preview en grand.
7. Fin d'une séance → entrée `session_burn` apparaît dans la timeline du jour (vérifier en re-rentrant dans Alimentation).
8. 🌙 Conseil pour ce soir → spinner → texte bienveillant.
9. Suppression d'une entrée → confirm + entrée disparaît. Si photo : photo supprimée du Storage (vérifier dans Supabase UI).
10. Coach (backoffice) peut LIRE les entries d'un client (test SQL ou via UI si exposé).

- [ ] **Step 4 : Commit**

```bash
git add app.js
git commit -m "feat(alim): modal conseil du soir IA"
```

---

## Auto-check

- [ ] Footer 3 boutons + burger 5 items
- [ ] Module gardé derrière clé API
- [ ] CRUD `food_entries` + Storage RLS OK (test : insert/read/delete)
- [ ] Auto session_burn déclenché par finishSession
- [ ] Conseil du soir = appel Claude + modal
- [ ] Pas de push (commits locaux uniquement)
