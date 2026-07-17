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
        // Único color de la antigua paleta "orgánica" con uso real (selección de
        // texto en index.html). El resto (sage-deep, sand, ink, ink-soft, bone,
        // bone-deep) se retiró por no tener ningún uso en el código — código muerto.
        sage: '#5c8374',
        // Tokens semánticos de estado, documentan intención (vs. reachar
        // directamente a emerald/amber/rose/sky de la escala default de Tailwind).
        // Alias de una sola tonalidad, igual que `primary` — no reemplazan la
        // escala default (emerald-500 etc. sigue disponible y en uso).
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#f43f5e',
        info: '#0ea5e9',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      // Escala "blob" — los mismos 8 radios arbitrarios que ya se usaban sueltos
      // (rounded-[Xrem]) en la landing pública, ahora nombrados. Sin cambio visual.
      borderRadius: {
        'blob-xs': '1.2rem',
        'blob-sm': '1.8rem',
        'blob-md': '2rem',
        'blob-lg': '2.5rem',
        'blob-xl': '3rem',
        'blob-2xl': '3.5rem',
        'blob-3xl': '4rem',
        'blob-4xl': '5rem',
      },
      // Sombras arbitrarias (shadow-[...]) que se repetían sueltas, ahora nombradas.
      // Sin cambio visual.
      boxShadow: {
        pop: '0 10px 30px -10px rgba(0,0,0,0.5)',
        'card-ambient': '0 32px 64px -16px rgba(19,91,236,0.05)',
        'card-ambient-dark': '0 32px 64px -16px rgba(0,0,0,0.2)',
        'success-pop': '0 10px 20px -10px rgba(16,185,129,0.5)',
      },
    },
  },
  plugins: [forms],
};
