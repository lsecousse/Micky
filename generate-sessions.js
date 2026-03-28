const crypto = require('crypto');
const id = () => crypto.randomBytes(7).toString('hex');

const programmes = [
  {
    id: 'mn4tv8jzvsc0g', name: 'Séance N°3',
    exercises: [
      { name: 'Seated row',   series: { reps: 20, weight: 13.3, rest: 75, count: 4 } },
      { name: 'Convergente',  series: { reps: 20, weight: 30,   rest: 75, count: 4 } },
      { name: 'Shoulder press',series:{ reps: 16, weight: 4.5,  rest: 75, count: 4 } },
      { name: 'Latéral raise', series:{ reps: 20, weight: 4.5,  rest: 75, count: 4 } },
      { name: 'Rear delt',    series: { reps: 20, weight: 11,   rest: 75, count: 4 } },
    ]
  },
  {
    id: 'mn4tz5hqw49fb', name: 'Séance N°1',
    exercises: [
      { name: 'Chest press',               series: { reps: 20, weight: 6.8,  rest: 75, count: 4 } },
      { name: 'Pec fly',                   series: { reps: 20, weight: 18,   rest: 75, count: 4 } },
      { name: 'Curl barre',                series: { reps: 12, weight: 10,   rest: 75, count: 4 } },
      { name: 'Arm Curl',                  series: { reps: 12, weight: 4.5,  rest: 75, count: 4 } },
      { name: 'Seated dip',                series: { reps: 20, weight: 18,   rest: 75, count: 4 } },
      { name: 'Triceps à la poulie haute corde', series: { reps: 20, weight: 4.5, rest: 75, count: 4 } },
    ]
  },
  {
    id: 'mn4u26r7324yu', name: 'Séance N°2',
    exercises: [
      { name: 'Climb box',     series: { reps: 12, weight: 0,  rest: 75, count: 4 } },
      { name: 'Leg extension', series: { reps: 20, weight: 18, rest: 75, count: 4 } },
      { name: 'Hip abduction', series: { reps: 20, weight: 18, rest: 75, count: 4 } },
      { name: 'Hip adduction', series: { reps: 20, weight: 11, rest: 75, count: 4 } },
      { name: 'Rotary hip',    series: { reps: 20, weight: 39, rest: 75, count: 4 } },
      { name: 'Press',         series: { reps: 20, weight: 32, rest: 75, count: 4 } },
    ]
  },
];

// Jours de séance : lundi, mercredi, vendredi sur 2 mois
const dates = [];
const start = new Date('2026-01-19');
for (let d = new Date(start); d <= new Date('2026-03-21'); d.setDate(d.getDate() + 1)) {
  const day = d.getDay(); // 1=lun, 3=mer, 5=ven
  if (day === 1 || day === 3 || day === 5) {
    dates.push(d.toISOString().slice(0, 10));
  }
}

// Progression par paliers toutes les 2 semaines (~6 séances)
// Chaque exercice progresse différemment selon le groupe musculaire
const progressionFactors = (sessionIdx) => {
  if (sessionIdx < 6)  return 1.00;
  if (sessionIdx < 12) return 1.05;
  if (sessionIdx < 18) return 1.08;
  if (sessionIdx < 24) return 1.12;
  return 1.15;
};

// Arrondit au 0.5 le plus proche (comme les poids de salle)
const round05 = (v) => v === 0 ? 0 : Math.round(v * 2) / 2;

// Petite variation aléatoire déterministe sur les reps (±1)
const jitter = (val, seed) => val + (seed % 3) - 1;

const sessions = dates.map((date, i) => {
  const prog = programmes[i % 3];
  const factor = progressionFactors(i);
  const startedAt = `${date}T09:${String(15 + (i % 10)).padStart(2, '0')}:00.000Z`;
  const duration = 3300 + (i % 7) * 120; // ~55-70 min

  return {
    id: id(),
    programmeId: prog.id,
    programmeName: prog.name,
    date,
    startedAt,
    duration,
    exercises: prog.exercises.map((ex, exIdx) => ({
      name: ex.name,
      series: Array.from({ length: ex.series.count }, (_, sIdx) => ({
        reps:   jitter(ex.series.reps, i + exIdx + sIdx),
        weight: round05(ex.series.weight * factor),
        rest:   ex.series.rest,
        done:   true,
      })),
    })),
  };
});

const fs = require('fs');
const exportedProgrammes = [
  {
    "id": "mn4tv8jzvsc0g",
    "name": "Séance N°3",
    "exercises": [
      { "name": "Seated row",    "muscle": "Dos",     "reps": 20, "weight": 13.3, "rest": 75, "count": 4, "comment": "" },
      { "name": "Convergente",   "muscle": "Dos",     "reps": 20, "weight": 30,   "rest": 75, "count": 4, "comment": "" },
      { "name": "Shoulder press","muscle": "Epaules", "reps": 16, "weight": 4.5,  "rest": 75, "count": 4, "comment": "" },
      { "name": "Latéral raise", "muscle": "Epaules", "reps": 20, "weight": 4.5,  "rest": 75, "count": 4, "comment": "" },
      { "name": "Rear delt",     "muscle": "Epaules", "reps": 20, "weight": 11,   "rest": 75, "count": 4, "comment": "Réglage 1" }
    ]
  },
  {
    "id": "mn4tz5hqw49fb",
    "name": "Séance N°1",
    "exercises": [
      { "name": "Chest press",                     "muscle": "Pectoraux", "reps": 20, "weight": 6.8,  "rest": 75, "count": 4, "comment": "" },
      { "name": "Pec fly",                         "muscle": "Pectoraux", "reps": 20, "weight": 18,   "rest": 75, "count": 4, "comment": "" },
      { "name": "Curl barre",                      "muscle": "Biceps",    "reps": 12, "weight": 10,   "rest": 75, "count": 4, "comment": "" },
      { "name": "Arm Curl",                        "muscle": "Biceps",    "reps": 12, "weight": 4.5,  "rest": 75, "count": 4, "comment": "" },
      { "name": "Seated dip",                      "muscle": "Biceps",    "reps": 20, "weight": 18,   "rest": 75, "count": 4, "comment": "" },
      { "name": "Triceps à la poulie haute corde", "muscle": "Triceps",   "reps": 20, "weight": 4.5,  "rest": 75, "count": 4, "comment": "" }
    ]
  },
  {
    "id": "mn4u26r7324yu",
    "name": "Séance N°2",
    "exercises": [
      { "name": "Climb box",     "muscle": "Cuisses", "reps": 12, "weight": 0,  "rest": 75, "count": 4, "comment": "" },
      { "name": "Leg extension", "muscle": "Cuisses", "reps": 20, "weight": 18, "rest": 75, "count": 4, "comment": "Réglage dossier 6" },
      { "name": "Hip abduction", "muscle": "Cuisses", "reps": 20, "weight": 18, "rest": 75, "count": 4, "comment": "" },
      { "name": "Hip adduction", "muscle": "Cuisses", "reps": 20, "weight": 11, "rest": 75, "count": 4, "comment": "" },
      { "name": "Rotary hip",    "muscle": "Cuisses", "reps": 20, "weight": 39, "rest": 75, "count": 4, "comment": "" },
      { "name": "Press",         "muscle": "Cuisses", "reps": 20, "weight": 32, "rest": 75, "count": 4, "comment": "" }
    ]
  }
];

fs.writeFileSync('gym-sessions-simulated.json', JSON.stringify({ programmes: exportedProgrammes, sessions }, null, 2));
console.log(`✅ ${sessions.length} séances générées dans gym-sessions-simulated.json`);
sessions.forEach((s, i) => console.log(`  ${i + 1}. ${s.date} — ${s.programmeName}`));
