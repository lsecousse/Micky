/* ═══════════════════════════════════════════════════════
   EXERCISE NAME — normalization helper

   Source de vérité pour la clé de lookup historique
   "dernier exercice exécuté avec ce nom".
   Chargé dans index.html et backoffice.html via <script>.
═══════════════════════════════════════════════════════ */

function normalizeExerciseName(name) {
  if (name == null) return '';
  return String(name)
    .normalize('NFD')                    // décompose accents
    .replace(/[̀-ͯ]/g, '')               // supprime diacritiques (combining marks)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');               // collapse whitespace
}

// Exports : window global pour le browser + module.exports pour Node/vitest.
// Pas de `export` ESM ici parce que les <script> classiques ne supportent pas
// les directives ESM (syntax error sans type="module").
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeExerciseName };
}
if (typeof window !== 'undefined') {
  window.normalizeExerciseName = normalizeExerciseName;
}
