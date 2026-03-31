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
  return (data || []).map(row => ({ id: row.id, name: row.name, exercises: row.exercises || [] }));
}

/* Charge les séances depuis Supabase */
async function loadSessionsDB() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];
  const { data } = await db.from('sessions').select('*').eq('client_id', user.id).order('date', { ascending: false });
  return (data || []).map(row => ({
    id:            row.id,
    programmeName: row.programme_name,
    programmeId:   row.programme_id || null,
    date:          row.date,
    startedAt:     row.started_at,
    duration:      row.duration,
    exercises:     row.exercises || [],
  }));
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
    exercises: programme.exercises,
    ordre:     programme.ordre ?? 0,
  };
  await db.from('programmes').upsert(payload);
}

/* Supprime un programme */
async function deleteProgrammeDB(id) {
  await db.from('programmes').delete().eq('id', id);
}

/* Supprime une séance */
async function deleteSessionDB(id) {
  await db.from('sessions').delete().eq('id', id);
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

/* Envoie une séance terminée vers Supabase */
async function pushSession(session) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  await db.from('sessions').upsert({
    id:             session.id,
    client_id:      user.id,
    programme_name: session.programmeName,
    programme_id:   session.programmeId || null,
    date:           session.date,
    started_at:     session.startedAt,
    duration:       session.duration,
    exercises:      session.exercises,
  });
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
