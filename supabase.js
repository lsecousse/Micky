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

/* Sync Supabase → localStorage : remplace les programmes locaux */
async function syncProgrammes() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return false;
  const { data, error } = await db
    .from('programmes')
    .select('*')
    .eq('client_id', user.id)
    .order('ordre');
  if (error || !data) return false;

  const programmes = data.map(row => ({
    id:        row.id,
    name:      row.name,
    exercises: row.exercises || [],
  }));
  localStorage.setItem('gym_programmes', JSON.stringify(programmes));
  return true;
}

/* Sync Supabase → localStorage : fusionne les sessions distantes */
async function syncSessions() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return false;
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('client_id', user.id)
    .order('date', { ascending: false });
  if (error || !data) return false;

  const sessions = data.map(row => ({
    id:            row.id,
    programmeName: row.programme_name,
    date:          row.date,
    startedAt:     row.started_at,
    duration:      row.duration,
    exercises:     row.exercises || [],
  }));
  localStorage.setItem('gym_sessions', JSON.stringify(sessions));
  return true;
}

/* Envoie une séance terminée vers Supabase */
async function pushSession(session) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  await db.from('sessions').upsert({
    id:             session.id,
    client_id:      user.id,
    programme_name: session.programmeName,
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
