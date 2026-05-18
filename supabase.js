/* ═══════════════════════════════════════════════════════
   SUPABASE — client partagé (app + backoffice)
═══════════════════════════════════════════════════════ */
const SUPABASE_URL  = 'https://ukhekyabqeyhkanwgpfx.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVraGVreWFicWV5aGthbndncGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTgxMjAsImV4cCI6MjA5MDI3NDEyMH0.2j415bJ7jVoh8gRHmLj2QV_-tELSRJzzghtXrr51Ipc';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* Récupère le profil de l'utilisateur connecté */
async function getMyProfile() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db.from('profiles').select('*').eq('id', user.id).single();
  return data;
}

/* Charge les programmes depuis Supabase */
async function loadProgrammesDB() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];
  const { data } = await db.from('programmes').select('*').eq('client_id', user.id).order('ordre');
  return (data || []).map(row => ({ id: row.id, name: row.name, category: row.category || 'fonte', exercises: row.exercises || [] }));
}

/* Charge les séances depuis Supabase
   Fait 2 queries (sessions + session_exercises) puis recompose côté JS. */
async function loadSessionsDB() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];

  const { data: sessions, error: sErr } = await db.from('sessions')
    .select('*')
    .eq('client_id', user.id)
    .order('date', { ascending: false });
  if (sErr) { console.error('loadSessionsDB sessions:', sErr); return []; }
  if (!sessions || sessions.length === 0) return [];

  const ids = sessions.map(s => s.id);
  const { data: exos, error: eErr } = await db.from('session_exercises')
    .select('*')
    .in('session_id', ids);
  if (eErr) { console.error('loadSessionsDB exos:', eErr); return []; }

  // Group exo rows by session_id
  const exosBySession = new Map();
  for (const row of (exos || [])) {
    if (!exosBySession.has(row.session_id)) exosBySession.set(row.session_id, []);
    exosBySession.get(row.session_id).push(row);
  }

  return sessions.map(s => recomposeSession(s, exosBySession.get(s.id) || []));
}

/* Upsert un programme (créé ou modifié par le client) */
async function upsertProgrammeDB(programme) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const profile = await getMyProfile();
  const payload = {
    id:        programme.id,
    client_id: user.id,
    coach_id:  profile?.coach_id || user.id,
    name:      programme.name,
    category:  programme.category || 'fonte',
    exercises: programme.exercises,
    ordre:     programme.ordre ?? 0,
  };
  const { error } = await db.from('programmes').upsert(payload);
  if (error) console.error('upsertProgrammeDB error:', error);
}

/* Supprime un programme */
async function deleteProgrammeDB(id) {
  await db.from('programmes').delete().eq('id', id);
}

/* Supprime une séance */
async function deleteSessionDB(id) {
  await db.from('sessions').delete().eq('id', id);
}

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

/* Met à jour name + exercises d'un programme existant (client) */
async function updateProgrammeDB(programme) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const { error } = await db.from('programmes')
    .update({ name: programme.name, category: programme.category || 'fonte', exercises: programme.exercises })
    .eq('id', programme.id)
    .eq('client_id', user.id);
  if (error) console.error('updateProgrammeDB error:', error);
}

/* Met à jour l'ordre de tous les programmes */
async function reorderProgrammesDB(programmes) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const results = await Promise.all(programmes.map((p, i) =>
    db.from('programmes').update({ ordre: i }).eq('id', p.id).eq('client_id', user.id)
  ));
  const err = results.find(r => r.error);
  if (err) console.error('reorderProgrammesDB error:', err.error);
}

/* Envoie une séance (en cours ou terminée) vers Supabase
   en passant par la RPC atomique qui met à jour sessions + session_exercises. */
async function pushSession(session) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;

  // Construit le payload jsonb attendu par la RPC.
  // Chaque exercice est dé-composé en (activities, execution) — execution
  // contient tout ce qui n'est pas template (séries exécutées pour fonte,
  // état + done pour cardio).
  const exercises = (session.exercises || []).map(ex => {
    const isCardio = (ex.type === 'cardio') || (session.category === 'cardio');
    const execution = isCardio
      ? {
          type:     'cardio',
          duration: ex.duration ?? 0,
          power:    ex.power    ?? 0,
          done:     ex.done     ?? null,
          state:    ex.state    ?? 'pending',
        }
      : { series: ex.series };

    return {
      name:            ex.name || '',
      normalized_name: normalizeExerciseName(ex.name || ''),
      comment:         ex.comment || '',
      activities:      ex.activities || [],
      execution,
    };
  });

  const payload = {
    id:             session.id,
    programme_name: session.programmeName,
    programme_id:   session.programmeId || null,
    date:           session.date,
    started_at:     session.startedAt,
    duration:       session.duration,
    category:       session.category || 'fonte',
    sync:           session.sync || null,
    exercises,
  };

  const { error } = await db.rpc('upsert_session_with_exercises', { p_session: payload });
  if (error) {
    console.error('pushSession RPC error:', error);
    throw error;  // propagé pour que pushSessionSafe attrape et tombe en localStorage
  }
}

/* Pour chaque nom normalisé fourni, retourne la dernière exécution
   toutes séances confondues. Utilisé par attachPrevValues.
   Retourne un Map<normalized_name, { name, category, activities, execution }>. */
async function loadLastExercisesByNamesDB(normalizedNames) {
  if (!normalizedNames || normalizedNames.length === 0) return new Map();
  const { data, error } = await db.rpc('load_last_exercises_by_names', { p_names: normalizedNames });
  if (error) { console.error('loadLastExercisesByNamesDB:', error); return new Map(); }
  const map = new Map();
  for (const row of (data || [])) {
    map.set(row.normalized_name, row);
  }
  return map;
}

/* ── Composition corporelle ──────────────────────────────── */

async function loadBodyMeasurementsDB() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];
  const { data } = await db.from('body_measurements')
    .select('*').eq('client_id', user.id).order('date', { ascending: false });
  return data || [];
}

async function pushBodyMeasurementDB(m) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const { error } = await db.from('body_measurements').upsert({
    id:          m.id ?? crypto.randomUUID(),
    client_id:   user.id,
    date:        m.date,
    poids:          m.poids          ?? null,
    graisse_kg:     m.graisseKg      ?? null,
    eau:            m.eau            ?? null,
    muscle:         m.muscle         ?? null,
    img:            m.img            ?? null,
    os:             m.os             ?? null,
    tour_de_ventre: m.tourDeVentre   ?? null,
  });
  if (error) console.error('pushBodyMeasurementDB error:', error);
}

async function deleteBodyMeasurementDB(id) {
  await db.from('body_measurements').delete().eq('id', id);
}

/* ── Food entries (suivi alimentaire) ────────────────── */
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

/* ── Meal presets (petit-dej avant/après salle) ──────── */
async function loadMealPresets() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];
  const { data, error } = await db.from('meal_presets')
    .select('*')
    .eq('client_id', user.id)
    .order('slot');
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

/* Met à jour le profil (nom, prénom) */
async function updateProfileDB(fields) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const { error } = await db.from('profiles').update(fields).eq('id', user.id);
  if (error) console.error('updateProfileDB error:', error);
}

/* Sauvegarde la clé API Claude (chiffrée côté serveur) */
async function setClaudeApiKeyDB(apiKey) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const { error } = await db.rpc('set_claude_api_key', { p_user_id: user.id, p_api_key: apiKey });
  if (error) console.error('setClaudeApiKeyDB error:', error);
}

/* Lit la clé API Claude (déchiffrée côté serveur) */
async function getClaudeApiKeyDB() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data, error } = await db.rpc('get_claude_api_key', { p_user_id: user.id });
  if (error) { console.error('getClaudeApiKeyDB error:', error); return null; }
  return data;
}

/* Crée un compte client sans écraser la session du coach */
async function createClientAccount(email, password) {
  const tempClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await tempClient.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('Compte non créé — vérifiez "Disable email confirmations" dans Supabase.');
  return data.user.id;
}
