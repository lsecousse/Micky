/* ═══════════════════════════════════════════════════════
   EXERCISE EDITOR — partagé entre app.js et backoffice.js
   Direction A : Fraunces + DM Sans + ink/paper/cyan/acid/racing/blood
═══════════════════════════════════════════════════════ */

/* Convertit un exercice ancien format → nouveau format activités */
function migrateExercise(ex) {
  if (ex.activities) return ex;
  const type = ex.type === 'calisthenics' ? 'countdown' : 'weight';
  const s0 = ex.series?.[0] || {};
  const activity = {
    type,
    name:     ex.muscle   || '',
    reps:     type === 'weight' ? (ex.reps     ?? s0.reps     ?? 0) : 0,
    weight:   type === 'weight' ? (ex.weight   ?? s0.weight   ?? 0) : 0,
    duration: type !== 'weight' ? (ex.duration ?? s0.duration ?? 0) : 0,
    rest:     ex.rest ?? s0.rest ?? 0,
  };
  const series = ex.series
    ? ex.series.map(s => ({
        done:   s.done ?? (s.state === 'done'),
        state:  s.state || (s.done ? 'done' : 'pending'),
        values: [type === 'weight' ? { reps: s.reps || 0, weight: s.weight || 0 } : { duration: s.duration || 0 }],
      }))
    : Array.from({ length: ex.count ?? 3 }, () => ({
        done: false, state: 'pending',
        values: [type === 'weight' ? { reps: activity.reps, weight: activity.weight } : { duration: activity.duration }],
      }));
  return { name: ex.name, comment: ex.comment || '', sets: ex.count ?? ex.series?.length ?? 3, activities: [activity], series };
}

/* ── Classes Tailwind partagées ────────────────────────── */
const _INPUT_TXT  = 'w-full bg-transparent border-b border-a-border focus:border-a-acid font-sans text-[15px] text-a-paper py-2 outline-none transition';
const _INPUT_NUM  = 'flex-1 min-w-0 bg-transparent font-display font-bold text-[18px] num-stat text-a-paper py-1.5 outline-none';
const _LABEL_EYE  = 'font-sans text-[9px] uppercase tracking-[0.40em] text-a-muted mb-1.5';
const _BTN_GHOST  = 'w-9 h-9 flex items-center justify-center border border-a-border text-a-paper text-[14px] active:border-a-acid active:text-a-acid transition shrink-0';
const _BTN_DEL    = 'px-3 py-2 border border-a-blood text-a-blood font-sans text-[10px] uppercase tracking-eyebrow active:bg-a-blood active:text-a-paper transition shrink-0';
const _BTN_BORDER = 'py-3 px-4 border border-a-border text-a-paper font-sans text-[11px] uppercase tracking-eyebrow active:border-a-acid active:text-a-acid transition';

/* ── Éditeur d'activité (sous-bloc d'un exercice) ──────── */
const ACTIVITY_TYPES  = ['weight', 'countdown', 'stopwatch'];
const ACTIVITY_LABELS = { weight: 'Poids', countdown: 'Minuterie', stopwatch: 'Chrono' };

function updateActivityFields(row, type, initial = {}) {
  const fieldsDiv = row.querySelector('.activity-fields');
  if (type === 'weight') {
    fieldsDiv.innerHTML = `
      <div class="flex-1 flex items-baseline gap-2 border-b border-a-border focus-within:border-a-acid transition">
        <input type="number" inputmode="decimal" min="1" placeholder="0" value="${initial.reps ?? ''}"
          class="activity-reps ${_INPUT_NUM} text-center" />
        <span class="font-display font-bold text-a-acid text-[16px] shrink-0">×</span>
        <input type="number" inputmode="decimal" min="0" step="0.5" placeholder="0" value="${initial.weight ?? ''}"
          class="activity-weight ${_INPUT_NUM} text-center" />
        <span class="font-sans text-[10px] uppercase tracking-eyebrow text-a-muted shrink-0">kg</span>
      </div>`;
  } else if (type === 'countdown') {
    fieldsDiv.innerHTML = `
      <div class="flex-1 flex items-baseline gap-2 border-b border-a-border focus-within:border-a-acid transition">
        <input type="number" inputmode="numeric" min="1" placeholder="0" value="${initial.duration ?? ''}"
          class="activity-duration ${_INPUT_NUM} text-center" />
        <span class="font-sans text-[10px] uppercase tracking-eyebrow text-a-muted shrink-0">sec</span>
      </div>`;
  } else {
    fieldsDiv.innerHTML = `
      <p class="flex-1 font-display italic text-[13px] text-a-muted py-2 border-b border-a-border">temps enregistré au chrono</p>`;
  }
}

function syncActivityLabels(activitiesList) {
  const rows = activitiesList.querySelectorAll('.activity-row');
  const multi = rows.length > 1;
  rows.forEach(r => {
    const labelRow = r.querySelector('.activity-row-label');
    if (labelRow) labelRow.style.display = multi ? '' : 'none';
  });
}

function makeActivityRow({ type = 'weight', label = '', name = '', reps = '', weight = '', duration = '', rest = '' } = {}) {
  const row = document.createElement('div');
  row.className = 'activity-row border border-a-border bg-a-inkAlt/30 px-4 py-4 space-y-4';

  // Ligne 0 : nom de l'activité (caché si une seule activité)
  const labelRow = document.createElement('div');
  labelRow.className = 'activity-row-label flex items-center gap-3';
  labelRow.innerHTML = `
    <input type="text" maxlength="60" placeholder="Nom de l'activité" value="${escapeHtml(label)}"
      class="activity-label ${_INPUT_TXT} font-display italic font-bold" />
    <button type="button" class="activity-remove-btn shrink-0 w-8 h-8 flex items-center justify-center text-a-muted active:text-a-blood transition">×</button>
  `;
  labelRow.querySelector('.activity-remove-btn').addEventListener('click', () => {
    const list = row.closest('.activities-list');
    if (list && list.querySelectorAll('.activity-row').length > 1) {
      row.remove();
      syncActivityLabels(list);
    }
  });

  // Ligne 1 : type + muscle
  const topRow = document.createElement('div');
  topRow.className = 'flex items-baseline gap-3';

  const typeBtn = document.createElement('button');
  typeBtn.type = 'button';
  typeBtn.className = 'activity-type-btn shrink-0 px-3 py-2 border border-a-border text-a-acid font-sans text-[10px] uppercase tracking-eyebrow font-semibold active:border-a-acid transition';
  typeBtn.dataset.type = type;
  typeBtn.textContent = ACTIVITY_LABELS[type] || ACTIVITY_LABELS.weight;
  typeBtn.addEventListener('click', () => {
    const next = ACTIVITY_TYPES[(ACTIVITY_TYPES.indexOf(typeBtn.dataset.type) + 1) % ACTIVITY_TYPES.length];
    typeBtn.dataset.type = next;
    typeBtn.textContent  = ACTIVITY_LABELS[next];
    updateActivityFields(row, next);
  });

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 60;
  nameInput.placeholder = 'Muscle sollicité';
  nameInput.value = name;
  nameInput.className = `activity-name ${_INPUT_TXT}`;

  topRow.append(typeBtn, nameInput);

  // Ligne 2 : valeurs + repos
  const bottomRow = document.createElement('div');
  bottomRow.className = 'flex items-baseline gap-3';

  const fieldsDiv = document.createElement('div');
  fieldsDiv.className = 'activity-fields flex-1 flex items-baseline gap-2';

  const restWrap = document.createElement('div');
  restWrap.className = 'flex items-baseline gap-2 border-b border-a-border focus-within:border-a-acid transition shrink-0 w-[160px] px-2';
  restWrap.innerHTML = `
    <span class="font-sans text-[10px] uppercase tracking-eyebrow text-a-muted shrink-0">repos</span>
    <input type="number" inputmode="numeric" min="0" placeholder="0" value="${rest}"
      class="activity-rest ${_INPUT_NUM} text-center text-[20px] py-2" />
    <span class="font-sans text-[11px] uppercase tracking-eyebrow text-a-muted shrink-0">s</span>
  `;

  bottomRow.append(fieldsDiv, restWrap);

  row.append(labelRow, topRow, bottomRow);
  updateActivityFields(row, type, { reps, weight, duration });
  return row;
}

/* ── Éditeur d'exercice ────────────────────────────────── */
// `source` = programme exercise shown by the card: saving keeps what the card does not edit
// (_shown = what the card and its rows displayed when built, to tell which fields changed).
function makeExerciseCard({ name = '', sets = 3, activities = null, comment = '', source = null } = {}) {
  const card = document.createElement('div');
  card.className = 'exercise-card border-l-[3px] border-l-a-acid border-y border-r border-a-border bg-a-inkAlt/30 px-5 py-5 space-y-5';

  // Header : nom + reorder + delete
  const header = document.createElement('div');
  header.className = 'flex items-baseline gap-2';
  header.innerHTML = `
    <input type="text" maxlength="60" placeholder="Nom de l'exercice" value="${escapeHtml(name)}"
      class="exercise-name flex-1 bg-transparent border-b border-a-border focus:border-a-acid font-display font-bold italic text-[18px] text-a-paper py-2 outline-none transition" />
    <button type="button" class="exercise-move-btn ${_BTN_GHOST}" data-dir="up" title="Monter">↑</button>
    <button type="button" class="exercise-move-btn ${_BTN_GHOST}" data-dir="down" title="Descendre">↓</button>
    <button type="button" class="exercise-del-btn ${_BTN_DEL}">Suppr</button>
  `;
  header.querySelector('[data-dir="up"]').addEventListener('click', () => {
    const prev = card.previousElementSibling;
    if (prev) card.parentNode.insertBefore(card, prev);
  });
  header.querySelector('[data-dir="down"]').addEventListener('click', () => {
    const next = card.nextElementSibling;
    if (next) card.parentNode.insertBefore(next, card);
  });
  header.querySelector('.exercise-del-btn').addEventListener('click', () => card.remove());
  card.appendChild(header);

  // Nombre de séries
  const setsRow = document.createElement('div');
  setsRow.className = 'flex items-baseline gap-3';
  setsRow.innerHTML = `
    <p class="${_LABEL_EYE} mb-0 shrink-0">Séries</p>
    <div class="w-[90px] flex items-baseline gap-2 border-b border-a-border focus-within:border-a-acid transition">
      <input type="number" inputmode="numeric" min="1" value="${sets}"
        class="exercise-sets ${_INPUT_NUM} text-center" />
    </div>
    <span class="flex-1 h-px bg-a-border"></span>
  `;
  card.appendChild(setsRow);

  // Activités
  const actLabel = document.createElement('p');
  actLabel.className = _LABEL_EYE + ' -mb-2';
  actLabel.textContent = 'Activités';
  card.appendChild(actLabel);

  const activitiesList = document.createElement('div');
  activitiesList.className = 'activities-list space-y-3';
  const defaultActs = activities || [{ type: 'weight' }];
  defaultActs.forEach((act, j) => {
    const row = makeActivityRow(act);
    if (source) Object.assign(row, { _shown: _readActivityFields(row), _sourceIndex: j });
    activitiesList.appendChild(row);
  });
  syncActivityLabels(activitiesList);
  card.appendChild(activitiesList);

  const addActBtn = document.createElement('button');
  addActBtn.type = 'button';
  addActBtn.className = 'w-full ' + _BTN_BORDER;
  addActBtn.textContent = '+ Activité';
  addActBtn.addEventListener('click', () => {
    activitiesList.appendChild(makeActivityRow());
    syncActivityLabels(activitiesList);
  });
  card.appendChild(addActBtn);

  // Commentaire
  const commentInput = document.createElement('textarea');
  commentInput.className = 'exercise-comment w-full bg-transparent border border-a-border focus:border-a-acid font-sans text-[13px] text-a-paper p-3 outline-none transition resize-y';
  commentInput.placeholder = 'Commentaire (visible à la salle)';
  commentInput.rows = 2;
  commentInput.value = comment;
  card.appendChild(commentInput);

  if (source) Object.assign(card, { _shown: _readExerciseFields(card), _source: source });
  return card;
}

function _readActivityFields(row) {
  return {
    type:     row.querySelector('.activity-type-btn').dataset.type || 'weight',
    label:    row.querySelector('.activity-label').value.trim(),
    name:     row.querySelector('.activity-name').value.trim(),
    reps:     parseFloat(row.querySelector('.activity-reps')?.value)     || 0,
    weight:   parseFloat(row.querySelector('.activity-weight')?.value)   || 0,
    duration: parseFloat(row.querySelector('.activity-duration')?.value) || 0,
    rest:     parseInt(row.querySelector('.activity-rest')?.value)       || 0,
  };
}

function _readExerciseFields(card) {
  return {
    name:    card.querySelector('.exercise-name').value.trim() || 'Sans nom',
    sets:    parseInt(card.querySelector('.exercise-sets').value) || 1,
    comment: card.querySelector('.exercise-comment').value.trim(),
  };
}

/* Lit une exercise-card DOM → objet exercise (l'exercice d'origine est conservé) */
function readExerciseCard(card) {
  const rows = Array.from(card.querySelectorAll('.activity-row')).map(row => ({
    sourceIndex: row._sourceIndex ?? null,
    shown:       row._shown || null,
    current:     _readActivityFields(row),
  }));
  return mergeEditedExercise(card._source || null, {
    shown: card._shown || null, current: _readExerciseFields(card), rows,
  });
}

/* ═══════════════════════════════════════════════════════
   CARDIO EXERCISE EDITOR
═══════════════════════════════════════════════════════ */

function makeCardioExerciseCard({ name = '', duration = '', power = '', comment = '', source = null } = {}) {
  const card = document.createElement('div');
  card.className = 'exercise-card cardio-card border-l-[3px] border-l-a-racing border-y border-r border-a-border bg-a-inkAlt/30 px-5 py-5 space-y-5';

  // Header
  const header = document.createElement('div');
  header.className = 'flex items-baseline gap-2';
  header.innerHTML = `
    <input type="text" maxlength="60" placeholder="Nom de la machine" value="${escapeHtml(name)}"
      class="exercise-name flex-1 bg-transparent border-b border-a-border focus:border-a-acid font-display font-bold italic text-[18px] text-a-paper py-2 outline-none transition" />
    <button type="button" class="exercise-del-btn ${_BTN_DEL}">Suppr</button>
  `;
  header.querySelector('.exercise-del-btn').addEventListener('click', () => card.remove());
  card.appendChild(header);

  // Fields : Temps + Puissance
  const fields = document.createElement('div');
  fields.className = 'grid grid-cols-2 gap-4';
  fields.innerHTML = `
    <div>
      <p class="${_LABEL_EYE}">Temps</p>
      <div class="flex items-baseline gap-2 border-b border-a-border focus-within:border-a-acid transition">
        <input type="number" inputmode="numeric" min="1" placeholder="0" value="${duration}"
          class="cardio-duration ${_INPUT_NUM}" />
        <span class="font-sans text-[10px] uppercase tracking-eyebrow text-a-muted shrink-0">min</span>
      </div>
    </div>
    <div>
      <p class="${_LABEL_EYE}">Puissance</p>
      <div class="flex items-baseline gap-2 border-b border-a-border focus-within:border-a-acid transition">
        <input type="number" inputmode="numeric" min="0" placeholder="0" value="${power}"
          class="cardio-power ${_INPUT_NUM}" />
        <span class="font-sans text-[10px] uppercase tracking-eyebrow text-a-muted shrink-0">W</span>
      </div>
    </div>
  `;
  card.appendChild(fields);

  const commentInput = document.createElement('textarea');
  commentInput.className = 'exercise-comment w-full bg-transparent border border-a-border focus:border-a-acid font-sans text-[13px] text-a-paper p-3 outline-none transition resize-y';
  commentInput.placeholder = 'Commentaire (visible à la salle)';
  commentInput.rows = 2;
  commentInput.value = comment;
  card.appendChild(commentInput);

  if (source) Object.assign(card, { _shown: _readCardioFields(card), _source: source });
  return card;
}

function _readCardioFields(card) {
  return {
    name:     card.querySelector('.exercise-name').value.trim() || 'Sans nom',
    type:     'cardio',
    duration: parseInt(card.querySelector('.cardio-duration').value) || 0,
    power:    parseInt(card.querySelector('.cardio-power').value)    || 0,
    comment:  card.querySelector('.exercise-comment').value.trim(),
  };
}

function readCardioExerciseCard(card) {
  return mergeEditedFields(card._source || null, card._shown || null, _readCardioFields(card));
}
