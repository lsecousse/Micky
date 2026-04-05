const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const SUPABASE_URL  = 'https://ukhekyabqeyhkanwgpfx.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVraGVreWFicWV5aGthbndncGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTgxMjAsImV4cCI6MjA5MDI3NDEyMH0.2j415bJ7jVoh8gRHmLj2QV_-tELSRJzzghtXrr51Ipc';
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

const CLIENT_ID = '19fe69a8-98bb-4ce8-a778-95e803da277e';

const raw = [
  ['17/03', 77.5,  17.7],
  ['18/03', 77.3,  18.0],
  ['19/03', 76.8,  17.2],
  ['20/03', 76.7,  17.1],
  ['21/03', 77.5,  17.5],
  ['22/03', 76.7,  17.1],
  ['23/03', 77.3,  17.7],
  ['24/03', 76.7,  17.2],
  ['27/03', 77.7,  17.3],
  ['28/03', 77.5,  17.2],
  ['29/03', 77.3,  17.4],
  ['30/03', 77.3,  16.9],
  ['31/03', 77.8,  17.3],
  ['01/04', 78.4,  17.1],
  ['02/04', 77.5,  17.0],
  ['03/04', 77.7,  17.3],
  ['04/04', 77.0,  16.9],
  ['05/04', 77.9,  17.1],
];

function toISO(d) {
  const [day, month] = d.split('/');
  const year = parseInt(month) >= 3 ? '2026' : '2027';
  return `${year}-${month}-${day}`;
}

(async () => {
  const rows = raw.map(([d, poids, masse_grasse]) => ({
    id:           randomUUID(),
    client_id:    CLIENT_ID,
    date:         toISO(d),
    poids,
    masse_grasse,
    graisse:      +(( masse_grasse / poids ) * 100).toFixed(1),
  }));

  const { error } = await db.from('body_measurements').insert(rows);
  if (error) { console.error('Erreur :', error.message); process.exit(1); }
  console.log(`✓ ${rows.length} mesures insérées`);
})();
