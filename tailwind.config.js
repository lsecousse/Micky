/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './backoffice.html',
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
        'a-ink':    '#0A0A0A',
        'a-inkAlt': '#141414',
        'a-paper':  '#F5F4F0',
        'a-muted':  '#888888',
        'a-border': '#2A2A2A',
        'a-todo':   '#444444',
        // Semantic accents
        'a-cyan':   '#06B6D4',
        'a-acid':   '#84CC16',
        'a-racing': '#FACC15',
        'a-blood':  '#DC2626',
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
