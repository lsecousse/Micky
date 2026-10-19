/* ═══════════════════════════════════════════════════════
   EXERCISE EDITOR — partagé entre app.js et backoffice.js
   Carnet : Newsreader (noms) + IBM Plex Sans (texte) + IBM Plex Mono (chiffres),
   cartes sheet / contour ink, « Suppr » en texte alert
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
// Underlined field (mock .card .nm): the bottom rule turns ink on focus
const _FIELD_LINE = 'border-0 border-solid border-b border-rule focus-within:border-ink transition';
const _INPUT_TXT  = 'w-full bg-transparent border-0 border-solid border-b border-rule rounded-none focus:border-ink focus:ring-0 font-sans text-[15px] text-ink placeholder:text-mut px-0 py-2 outline-none transition';
const _INPUT_LABEL = 'w-full bg-transparent border-0 border-solid border-b border-rule rounded-none focus:border-ink focus:ring-0 font-display italic font-bold text-[17px] text-ink placeholder:text-mut px-0 py-2 outline-none transition';
const _INPUT_NUM  = 'flex-1 min-w-0 bg-transparent border-0 rounded-none focus:ring-0 font-mono font-semibold text-[18px] num-stat text-ink placeholder:text-mut px-0 py-1.5 outline-none';
const _LABEL_EYE  = 'm-0 mb-1.5 text-[13px] text-mut';
const _UNIT       = 'text-[13px] text-mut shrink-0';
const _BTN_GHOST  = 'w-9 h-9 flex items-center justify-center border-[1.5px] border-solid border-ink rounded text-[14px] text-ink active:bg-ink/10 transition shrink-0';
const _BTN_DEL    = 'h-9 px-1 text-[13px] font-medium text-alert active:opacity-60 transition shrink-0';
const _BTN_BORDER = 'h-10 px-4 border-[1.5px] border-solid border-ink rounded text-[13px] font-medium text-ink active:bg-ink/10 transition';
const _CARD       = 'exercise-card bg-sheet border-[1.5px] border-solid border-ink rounded px-3.5 py-3 space-y-4';
const _NAME_INPUT = 'exercise-name flex-1 min-w-0 bg-transparent border-0 border-solid border-b border-rule rounded-none focus:border-ink focus:ring-0 font-display font-bold italic text-[19px] text-ink placeholder:text-mut px-0 pt-1 pb-1 outline-none transition';
const _COMMENT    = 'exercise-comment w-full bg-paper border border-solid border-rule rounded focus:border-ink focus:ring-0 font-sans text-[14px] leading-normal text-ink placeholder:text-mut p-3 outline-none transition resize-y';

/* ── Éditeur d'activité (sous-bloc d'un exercice) ──────── */
const ACTIVITY_TYPES  = ['weight', 'countdown', 'stopwatch'];
const ACTIVITY_LABELS = { weight: 'Poids', countdown: 'Minuterie', stopwatch: 'Chrono' };

function updateActivityFields(row, type, initial = {}) {
  const fieldsDiv = row.querySelector('.activity-fields');
  if (type === 'weight') {
    fieldsDiv.innerHTML = `
      <div class="flex-1 flex items-baseline gap-2 ${_FIELD_LINE}">
        <input type="number" inputmode="decimal" min="1" placeholder="0" value="${initial.reps ?? ''}"
          class="activity-reps ${_INPUT_NUM} text-center" />
        <span class="${_UNIT}">×</span>
        <input type="number" inputmode="decimal" min="0" step="0.5" placeholder="0" value="${initial.weight ?? ''}"
          class="activity-weight ${_INPUT_NUM} text-center" />
        <span class="${_UNIT}">kg</span>
      </div>`;
  } else if (type === 'countdown') {
    fieldsDiv.innerHTML = `
      <div class="flex-1 flex items-baseline gap-2 ${_FIELD_LINE}">
        <input type="number" inputmode="numeric" min="1" placeholder="0" value="${initial.duration ?? ''}"
          class="activity-duration ${_INPUT_NUM} text-center" />
        <span class="${_UNIT}">s</span>
      </div>`;
  } else {
    fieldsDiv.innerHTML = `
      <p class="flex-1 m-0 text-[13px] text-mut py-2 border-0 border-solid border-b border-rule">Temps enregistré au chrono</p>`;
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
  // bg-transparent / rounded-none / px-0 pb-0 override backoffice.html's dark .activity-row rule
  row.className = 'activity-row flex flex-col gap-3 bg-transparent rounded-none border-0 border-solid border-t border-rule px-0 pt-3 pb-0';

  // Ligne 0 : nom de l'activité (caché si une seule activité)
  const labelRow = document.createElement('div');
  labelRow.className = 'activity-row-label flex items-center gap-3';
  labelRow.innerHTML = `
    <input type="text" maxlength="60" placeholder="Nom de l'activité" value="${escapeHtml(label)}"
      class="activity-label ${_INPUT_LABEL}" />
    <button type="button" class="activity-remove-btn shrink-0 w-9 h-9 flex items-center justify-center text-[18px] text-mut active:text-ink transition" aria-label="Retirer l'activité">×</button>
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
  topRow.className = 'flex items-center gap-3';

  const typeBtn = document.createElement('button');
  typeBtn.type = 'button';
  typeBtn.className = 'activity-type-btn shrink-0 ' + _BTN_BORDER;
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
  restWrap.className = `activity-rest-wrap flex items-baseline gap-2 ${_FIELD_LINE} shrink-0 w-[132px]`;
  restWrap.innerHTML = `
    <span class="${_UNIT}">repos</span>
    <input type="number" inputmode="numeric" min="0" placeholder="0" value="${rest}"
      class="activity-rest ${_INPUT_NUM} text-center" />
    <span class="${_UNIT}">s</span>
  `;

  bottomRow.append(fieldsDiv, restWrap);

  row.append(labelRow, topRow, bottomRow);
  updateActivityFields(row, type, { reps, weight, duration });
  return row;
}

/* ── Éditeur d'exercice ────────────────────────────────── */
// `source` = programme exercise shown by the card: saving keeps what the card does not edit
// (_shown = what the card and its rows displayed when built, to tell which fields changed).
// `member` = super set member: no « Séries » line, no rest per activity (the group sets them), no ↑ ↓.
// `onMove(dir)` / `onDelete()` replace the in-place DOM move / removal (programme editor).
function makeExerciseCard({ name = '', sets = 3, activities = null, comment = '', source = null,
  member = false, onMove = null, onDelete = null } = {}) {
  const card = document.createElement('div');
  // Member: the hidden rest wraps stay in the DOM so the card still reads them back
  card.className = member ? `${_CARD} [&_.activity-rest-wrap]:hidden` : _CARD;

  card.appendChild(_makeExerciseHeader(card, name, { member, onMove, onDelete }));

  // Nombre de séries (hidden, still read back, for a member)
  const setsRow = document.createElement('div');
  setsRow.className = member ? 'hidden' : 'flex items-baseline gap-3';
  setsRow.innerHTML = `
    <p class="text-[13px] text-mut m-0 shrink-0">Séries</p>
    <div class="w-[72px] flex items-baseline gap-2 ${_FIELD_LINE}">
      <input type="number" inputmode="numeric" min="1" value="${sets}"
        class="exercise-sets ${_INPUT_NUM} text-center" />
    </div>
  `;
  card.appendChild(setsRow);

  // Activités
  const actLabel = document.createElement('p');
  actLabel.className = 'm-0 text-[13px] text-mut';
  actLabel.textContent = 'Activités';
  card.appendChild(actLabel);

  const activitiesList = document.createElement('div');
  activitiesList.className = 'activities-list space-y-4';
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
  card.appendChild(_makeCommentInput(comment));

  if (source) Object.assign(card, { _shown: _readExerciseFields(card), _source: source });
  return card;
}

// Header (mock .card .ch): name + reorder (not for a member) + delete
function _makeExerciseHeader(card, name, { member, onMove, onDelete }) {
  const header = document.createElement('div');
  header.className = 'flex items-center gap-2';
  const moves = member ? '' : `
    <button type="button" class="exercise-move-btn ${_BTN_GHOST}" data-dir="up" title="Monter" aria-label="Monter">↑</button>
    <button type="button" class="exercise-move-btn ${_BTN_GHOST}" data-dir="down" title="Descendre" aria-label="Descendre">↓</button>`;
  header.innerHTML = `
    <input type="text" maxlength="60" placeholder="Nom de l'exercice" value="${escapeHtml(name)}"
      class="${_NAME_INPUT}" />${moves}
    <button type="button" class="exercise-del-btn ${_BTN_DEL}">Suppr</button>
  `;
  header.querySelectorAll('.exercise-move-btn').forEach(btn => btn.addEventListener('click', () => {
    const dir = btn.dataset.dir === 'up' ? -1 : 1;
    if (onMove) onMove(dir);
    else _moveCardInPlace(card, dir);
  }));
  header.querySelector('.exercise-del-btn').addEventListener('click', () => (onDelete ? onDelete() : card.remove()));
  return header;
}

function _moveCardInPlace(card, dir) {
  const sibling = dir < 0 ? card.previousElementSibling : card.nextElementSibling;
  if (!sibling) return;
  if (dir < 0) card.parentNode.insertBefore(card, sibling);
  else card.parentNode.insertBefore(sibling, card);
}

function _makeCommentInput(comment) {
  const input = document.createElement('textarea');
  input.className = _COMMENT;
  input.placeholder = 'Commentaire (visible à la salle)';
  input.rows = 2;
  input.value = comment;
  return input;
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
  card.className = _CARD + ' cardio-card';

  // Header
  const header = document.createElement('div');
  header.className = 'flex items-center gap-2';
  header.innerHTML = `
    <input type="text" maxlength="60" placeholder="Nom de la machine" value="${escapeHtml(name)}"
      class="${_NAME_INPUT}" />
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
      <div class="flex items-baseline gap-2 ${_FIELD_LINE}">
        <input type="number" inputmode="numeric" min="1" placeholder="0" value="${duration}"
          class="cardio-duration ${_INPUT_NUM}" />
        <span class="${_UNIT}">min</span>
      </div>
    </div>
    <div>
      <p class="${_LABEL_EYE}">Puissance</p>
      <div class="flex items-baseline gap-2 ${_FIELD_LINE}">
        <input type="number" inputmode="numeric" min="0" placeholder="0" value="${power}"
          class="cardio-power ${_INPUT_NUM}" />
        <span class="${_UNIT}">W</span>
      </div>
    </div>
  `;
  card.appendChild(fields);

  card.appendChild(_makeCommentInput(comment));

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
