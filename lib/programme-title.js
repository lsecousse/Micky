/* ═══════════════════════════════════════════════════════
   PROGRAMME TITLE — split a programme name on its first
   " / ", " & " or " - " separator for a two-line title.
   Returns raw text: the caller escapes each part once.
   Chargé dans index.html via <script>.
═══════════════════════════════════════════════════════ */

function splitProgrammeTitle(raw) {
  const s = (raw || '').trim();
  const m = s.match(/^(.+?)\s+([\/&\-])\s+(.+)$/);
  if (!m) return { line1: s, sep: null, rest: '' };
  const sepDisplay = m[2] === '-' ? '—' : m[2];
  return { line1: m[1], sep: sepDisplay, rest: m[3] };
}

// Exports : window global pour le browser + module.exports pour Node/vitest.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { splitProgrammeTitle };
}
if (typeof window !== 'undefined') {
  window.splitProgrammeTitle = splitProgrammeTitle;
}
