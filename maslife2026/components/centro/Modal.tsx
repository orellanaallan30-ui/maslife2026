// Ventana modal y estilos compartidos del panel del centro (AgendaMas · Aurora).
import React, { useEffect } from 'react';

const Modal: React.FC<{ titulo: string; onClose: () => void; children: React.ReactNode; ancho?: string; subtitulo?: string }> = ({ titulo, onClose, children, ancho = 'max-w-lg', subtitulo }) => {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 !m-0 z-[200] flex items-end lg:items-center justify-center bg-am-ink/30 backdrop-blur-[3px] p-0 lg:p-6"
      role="dialog" aria-modal="true" aria-label={titulo}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`am-glass-strong w-full ${ancho} rounded-t-[28px] lg:rounded-[28px] flex flex-col max-h-[92vh]`}>
        <div className="flex items-start justify-between gap-3 px-5 lg:px-7 pt-5 pb-4 border-b border-am-ink/[0.06] shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-am-ink tracking-tight truncate">{titulo}</h2>
            {subtitulo && <p className="text-xs font-semibold text-am-muted mt-0.5 truncate">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 shrink-0 rounded-xl hover:bg-am-ink/5 flex items-center justify-center text-am-muted">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-5 lg:p-7 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export default Modal;

// Estilos compartidos de los formularios y botones del centro.
export const campo = 'w-full bg-white/80 border border-am-ink/10 rounded-xl py-2.5 px-3 text-sm font-semibold text-am-ink placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-am-500/15 focus:border-am-500 disabled:opacity-60';
export const etiqueta = 'block text-xs font-bold text-am-muted mb-1.5';
export const botonPrimario = 'am-btn-primary inline-flex items-center justify-center gap-2 font-bold text-sm rounded-xl px-4 py-2.5 transition active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed';
export const botonSecundario = 'inline-flex items-center justify-center gap-2 bg-white/70 border border-am-ink/10 text-am-ink font-bold text-sm rounded-xl px-4 py-2.5 hover:bg-white transition disabled:opacity-50';
export const botonPeligro = 'inline-flex items-center justify-center gap-2 bg-rose-600 text-white font-bold text-sm rounded-xl px-4 py-2.5 hover:bg-rose-700 shadow-[0_8px_20px_-8px_rgba(225,29,72,0.6)] disabled:opacity-50';
/** Tarjeta de vidrio estándar. */
export const tarjeta = 'am-glass rounded-[22px]';
