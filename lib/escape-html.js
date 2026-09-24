/* ═══════════════════════════════════════════════════════
   ESCAPE HTML — source unique d'échappement pour toute
   donnée non fiable (base, saisie, IA) interpolée dans
   innerHTML. Chargé dans index.html et backoffice.html.
═══════════════════════════════════════════════════════ */

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, ch => HTML_ENTITIES[ch]);
}

// Exports : window global pour le browser + module.exports pour Node/vitest.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml };
}
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
}
