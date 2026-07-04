// tailwind.config.js — espejo EXACTO de la config que estaba inline en index.html.
// Migrado de la CDN Play a build compilado (Vite + PostCSS). Tailwind v3 = mismo
// motor que la CDN, por lo que las utilidades resuelven idénticas (el diseño no cambia).
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00a89e',
        teal: { 50: '#f0fdfa', 500: '#00a89e', 600: '#008c84' },
        slate: { 900: '#0f172a', 950: '#020617' },
        sage: '#5c8374',
        'sage-deep': '#3a5a4d',
        sand: '#c9a96a',
        ink: '#1c2b27',
        'ink-soft': '#44574f',
        bone: '#f4f1ea',
        'bone-deep': '#ebe6db',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [forms],
};
