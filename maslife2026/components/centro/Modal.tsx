// Ventana modal simple y accesible para el panel del centro.
import React, { useEffect } from 'react';

const Modal: React.FC<{ titulo: string; onClose: () => void; children: React.ReactNode; ancho?: string }> = ({ titulo, onClose, children, ancho = 'max-w-lg' }) => {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 !m-0 z-[200] flex items-end lg:items-center justify-center bg-slate-900/60 p-0 lg:p-6" role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-white w-full ${ancho} rounded-t-3xl lg:rounded-3xl shadow-2xl flex flex-col max-h-[92vh]`}>
        <div className="flex items-center justify-between px-5 lg:px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-black text-slate-900">{titulo}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-5 lg:p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export default Modal;

// Estilos compartidos de los formularios del centro.
export const campo = 'w-full bg-white border border-slate-300 rounded-xl py-2.5 px-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';
export const etiqueta = 'block text-xs font-bold text-slate-600 mb-1';
export const botonPrimario = 'inline-flex items-center justify-center gap-2 bg-primary text-white font-bold text-sm rounded-xl px-4 py-2.5 hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed';
export const botonSecundario = 'inline-flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 font-bold text-sm rounded-xl px-4 py-2.5 hover:bg-slate-50 disabled:opacity-50';
export const botonPeligro = 'inline-flex items-center justify-center gap-2 bg-rose-600 text-white font-bold text-sm rounded-xl px-4 py-2.5 hover:bg-rose-700 disabled:opacity-50';
