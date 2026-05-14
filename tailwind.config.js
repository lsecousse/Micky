/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './backoffice.html',
    './watch.html',
    './set-password.html',
    './app.js',
    './backoffice.js',
    './exercise-editor.js',
    './supabase.js',
  ],
  darkMode: 'class',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // Base
        ink:    '#0A0A0A',
        inkAlt: '#141414',
        paper:  '#F5F4F0',
        muted:  '#888888',
        border: '#2A2A2A',
        todo:   '#444444',
        // Semantic accents
        cyan:   '#06B6D4',
        acid:   '#84CC16',
        racing: '#FACC15',
        blood:  '#DC2626',
      },
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans:    ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['"DM Mono"', 'ui-monospace', '"Courier New"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
      },
      letterSpacing: {
        eyebrow:      '0.28em',
        'eyebrow-wide': '0.40em',
      },
      spacing: {
        'safe-top':    'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
