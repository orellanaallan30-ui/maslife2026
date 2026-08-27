import React, { useState, useEffect, useCallback } from 'react';

// Piezas compartidas de la ficha clínica.
//
// Antes cada sección escribía su propio marcado: el patrón de tarjeta estaba
// copiado literalmente 11 veces, el del título 10, y los campos tenían ~21
// combinaciones de clases distintas para 36 controles — dos alturas diferentes
// para el mismo tipo de campo y un color de foco que cambiaba según la
// especialidad en vez de según el control. De ahí la sensación de desorden.
//
// Con esto, cualquier ajuste visual se hace en un sitio y no vuelve a
// desalinearse a la primera modificación.

// ── Estilos únicos ──────────────────────────────────────────────────────────
// Un solo alto y un solo padding para todos los campos. El foco es siempre del
// color de marca: el anillo indica "estás escribiendo aquí", no a qué
// especialidad pertenece el formulario.
export const ETIQUETA =
  'text-[11px] font-black text-slate-600 uppercase tracking-widest block mb-1.5';

export const CAMPO =
  'w-full bg-slate-50/60 border border-slate-300 rounded-2xl py-3 px-4 ' +
  'text-sm font-semibold text-slate-900 shadow-input-inset ' +
  'focus:bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary ' +
  'transition-all placeholder:text-slate-400 print:bg-white';

export const CAMPO_SELECT = CAMPO + ' appearance-none';
export const CAMPO_AREA = CAMPO + ' resize-none leading-relaxed';

// Rejilla común: mismo número de columnas y mismo aire en todas las secciones.
export const REJILLA = 'grid grid-cols-1 lg:grid-cols-3 gap-4';
export const REJILLA_COMPACTA = 'grid grid-cols-2 lg:grid-cols-4 gap-4';

interface SeccionProps {
  titulo: string;
  /** Color del filete izquierdo; distingue bloques sin cambiar el resto. */
  color?: string;
  /** Cuántos datos tiene ya rellenos, para que plegada no signifique olvidada. */
  llenos?: number;
  total?: number;
  /** Si arranca abierta cuando el profesional aún no ha elegido nada. */
  abiertaPorDefecto?: boolean;
  /** Identificador estable para recordar su estado entre visitas. */
  id: string;
  /** Ámbito del recuerdo: normalmente el id del profesional. */
  ambito?: string;
  children: React.ReactNode;
}

/**
 * Sección plegable de la ficha.
 *
 * Recuerda si quedó abierta o cerrada, por profesional: quien siempre usa rangos
 * de movimiento se los encuentra desplegados la próxima vez, y quien no los usa
 * nunca deja de verlos. Es preferencia de interfaz, no dato clínico, así que vive
 * en localStorage y no en Supabase.
 */
export const SeccionFicha: React.FC<SeccionProps> = ({
  titulo, color = 'border-primary', llenos, total,
  abiertaPorDefecto = true, id, ambito = 'general', children,
}) => {
  const clave = `maslife_seccion_${ambito}_${id}`;

  const [abierta, setAbierta] = useState<boolean>(() => {
    try {
      const guardado = localStorage.getItem(clave);
      if (guardado === '1') return true;
      if (guardado === '0') return false;
    } catch { /* modo privado o almacenamiento bloqueado */ }
    return abiertaPorDefecto;
  });

  useEffect(() => {
    try { localStorage.setItem(clave, abierta ? '1' : '0'); } catch { /* ignorado */ }
  }, [abierta, clave]);

  const alternar = useCallback(() => setAbierta(v => !v), []);

  const hayContador = typeof llenos === 'number' && typeof total === 'number' && total > 0;

  return (
    <section className="bg-white rounded-2xl lg:rounded-blob-xl shadow-section border border-slate-200 overflow-hidden print:shadow-none print:border-slate-300">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        className="w-full flex items-center gap-3 p-4 lg:px-10 lg:py-6 text-left hover:bg-slate-50/70 transition-colors print:hidden"
      >
        <h2 className={`flex-1 text-xs font-black uppercase tracking-[0.06em] text-slate-700 border-l-4 ${color} pl-4`}>
          {titulo}
        </h2>
        {hayContador && (
          <span className={`text-[11px] font-black px-2.5 py-1 rounded-full shrink-0 ${
            llenos! > 0 ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400'
          }`}>
            {llenos} de {total}
          </span>
        )}
        <span className={`material-icons-round text-slate-400 shrink-0 transition-transform ${abierta ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {/* Al imprimir se muestra todo: una ficha en papel no se pliega. */}
      <div className={`${abierta ? 'block' : 'hidden'} print:block px-4 pb-4 lg:px-10 lg:pb-10`}>
        <h2 className={`hidden print:block text-xs font-black uppercase tracking-[0.06em] text-slate-700 border-l-4 ${color} pl-4 mb-4`}>
          {titulo}
        </h2>
        {children}
      </div>
    </section>
  );
};

/** Cuenta cuántos valores de un grupo tienen contenido, para el contador. */
export function contarLlenos(valores: unknown[]): number {
  return valores.filter(v => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'number') return v !== 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
}
