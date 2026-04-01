/* ═══════════════════════════════════════════════════════
   EXERCISE EDITOR — partagé entre app.js et backoffice.js
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

/* ── Éditeur de carte exercice ────────────────────────── */
const ACTIVITY_TYPES  = ['weight', 'countdown', 'stopwatch'];
const ACTIVITY_LABELS = { weight: '🏋️ Poids', countdown: '⏳ Minuterie', stopwatch: '⏱ Chrono' };

function updateActivityFields(row, type, initial = {}) {
  const fieldsDiv = row.querySelector('.activity-fields');
  if (type === 'weight') {
    fieldsDiv.innerHTML = `
      <input type="number" inputmode="decimal" class="activity-reps"   placeholder="reps" min="1"           value="${initial.reps   ?? ''}" />
      <span class="activity-sep">×</span>
      <input type="number" inputmode="decimal" class="activity-weight" placeholder="kg"   min="0" step="0.5" value="${initial.weight ?? ''}" />
      <span class="activity-sep">kg</span>`;
  } else if (type === 'countdown') {
    fieldsDiv.innerHTML = `
      <input type="number" inputmode="numeric" class="activity-duration" placeholder="sec" min="1" value="${initial.duration ?? ''}" />
      <span class="activity-sep">s</span>`;
  } else {
    // stopwatch : pas de durée à saisir, temps enregistré à la séance
    fieldsDiv.innerHTML = `<span class="activity-sep activity-chrono-hint">temps enregistré au chrono</span>`;
  }
}

function makeActivityRow({ type = 'weight', name = '', reps = '', weight = '', duration = '', rest = '' } = {}) {
  const row = document.createElement('div');
  row.className = 'activity-row';

  // Ligne 1 : type + nom + supprimer
  const topRow = document.createElement('div');
  topRow.className = 'activity-row-top';

  const typeBtn = document.createElement('button');
  typeBtn.type = 'button';
  typeBtn.className = 'activity-type-btn';
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
  nameInput.className = 'activity-name';
  nameInput.placeholder = 'Muscle sollicité';
  nameInput.maxLength = 60;
  nameInput.value = name;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'activity-remove-btn';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    const list = row.closest('.activities-list');
    if (list && list.querySelectorAll('.activity-row').length > 1) row.remove();
  });

  topRow.append(typeBtn, nameInput, removeBtn);

  // Ligne 2 : valeurs + repos
  const bottomRow = document.createElement('div');
  bottomRow.className = 'activity-row-bottom';

  const fieldsDiv = document.createElement('div');
  fieldsDiv.className = 'activity-fields';

  const restLabel = document.createElement('span');
  restLabel.className = 'activity-sep';
  restLabel.textContent = 'repos';

  const restInput = document.createElement('input');
  restInput.type = 'number';
  restInput.inputMode = 'numeric';
  restInput.className = 'activity-rest';
  restInput.placeholder = '0';
  restInput.min = '0';
  restInput.value = rest;

  const restUnit = document.createElement('span');
  restUnit.className = 'activity-sep';
  restUnit.textContent = 's';

  bottomRow.append(fieldsDiv, restLabel, restInput, restUnit);

  row.append(topRow, bottomRow);
  updateActivityFields(row, type, { reps, weight, duration });
  return row;
}

function makeExerciseCard({ name = '', sets = 3, activities = null, comment = '' } = {}) {
  const card = document.createElement('div');
  card.className = 'exercise-card';

  // Nom + suppression
  const nameRow = document.createElement('div');
  nameRow.className = 'exercise-name-row';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'exercise-name';
  nameInput.placeholder = 'Nom de l\'exercice';
  nameInput.maxLength = 60;
  nameInput.value = name;
  const removeExBtn = document.createElement('button');
  removeExBtn.className = 'btn-danger btn-sm';
  removeExBtn.textContent = 'Suppr.';
  removeExBtn.addEventListener('click', () => card.remove());
  nameRow.append(nameInput, removeExBtn);
  card.appendChild(nameRow);

  // Nombre de séries
  const setsRow = document.createElement('div');
  setsRow.className = 'exercise-sets-row';
  const setsLabel = document.createElement('label');
  setsLabel.textContent = 'Séries';
  const setsInput = document.createElement('input');
  setsInput.type = 'number';
  setsInput.inputMode = 'numeric';
  setsInput.className = 'exercise-sets';
  setsInput.min = '1';
  setsInput.value = sets;
  setsRow.append(setsLabel, setsInput);
  card.appendChild(setsRow);

  // Activités
  const actLabel = document.createElement('div');
  actLabel.className = 'activities-list-label';
  actLabel.textContent = 'Activités';
  card.appendChild(actLabel);

  const activitiesList = document.createElement('div');
  activitiesList.className = 'activities-list';
  const defaultActs = activities || [{ type: 'weight' }];
  defaultActs.forEach(act => activitiesList.appendChild(makeActivityRow(act)));
  card.appendChild(activitiesList);

  const addActBtn = document.createElement('button');
  addActBtn.type = 'button';
  addActBtn.className = 'btn-secondary btn-sm';
  addActBtn.textContent = '+ Activité';
  addActBtn.addEventListener('click', () => activitiesList.appendChild(makeActivityRow()));
  card.appendChild(addActBtn);

  // Commentaire
  const commentInput = document.createElement('textarea');
  commentInput.className = 'exercise-comment';
  commentInput.placeholder = 'Commentaire (visible à la salle)';
  commentInput.rows = 2;
  commentInput.value = comment;
  card.appendChild(commentInput);

  return card;
}

/* Lit une exercise-card DOM → objet exercise */
function readExerciseCard(card) {
  const activities = Array.from(card.querySelectorAll('.activity-row')).map(row => ({
    type:     row.querySelector('.activity-type-btn').dataset.type || 'weight',
    name:     row.querySelector('.activity-name').value.trim(),
    reps:     parseFloat(row.querySelector('.activity-reps')?.value)     || 0,
    weight:   parseFloat(row.querySelector('.activity-weight')?.value)   || 0,
    duration: parseFloat(row.querySelector('.activity-duration')?.value) || 0,
    rest:     parseInt(row.querySelector('.activity-rest')?.value)       || 0,
  }));
  return {
    name:       card.querySelector('.exercise-name').value.trim() || 'Sans nom',
    sets:       parseInt(card.querySelector('.exercise-sets').value) || 1,
    activities,
    comment:    card.querySelector('.exercise-comment').value.trim(),
  };
}
