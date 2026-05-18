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

// Export ESM pour vitest + globals pour <script> dans le navigateur
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeExerciseName };
}
if (typeof window !== 'undefined') {
  window.normalizeExerciseName = normalizeExerciseName;
}
export { normalizeExerciseName };
