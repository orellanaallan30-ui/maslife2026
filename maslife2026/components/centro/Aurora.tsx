// Identidad visual de AgendaMas (panel de centros): fondo "Aurora" y logotipo.
import React from 'react';

/** Fondo fijo con brillos desenfocados. Va una sola vez, detrás del panel. */
export const AuroraBackground: React.FC = () => <div className="am-aurora" aria-hidden="true" />;

/** Logotipo de AgendaMas: calendario con un "+" y el nombre. */
export const AgendaMasLogo: React.FC<{ className?: string; soloIcono?: boolean }> = ({ className = '', soloIcono = false }) => (
  <span className={`inline-flex items-center gap-2 ${className}`}>
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="am-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <rect x="2" y="4" width="28" height="26" rx="8" fill="url(#am-logo-g)" />
      <rect x="2" y="4" width="28" height="9" rx="8" fill="#fff" fillOpacity=".18" />
      <rect x="9" y="1.5" width="3" height="7" rx="1.5" fill="#312E81" />
      <rect x="20" y="1.5" width="3" height="7" rx="1.5" fill="#312E81" />
      <path d="M16 15.5v9M11.5 20h9" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
    {!soloIcono && (
      <span className="font-black text-[19px] tracking-tight text-am-ink leading-none">
        Agenda<span className="am-text-gradient">Mas</span>
      </span>
    )}
  </span>
);
