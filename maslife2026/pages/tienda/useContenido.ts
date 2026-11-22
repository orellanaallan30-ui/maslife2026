import { useEffect, useState } from 'react';
import {
  catalogoEnCache, cargarCatalogo, contenidoConDefectos, borradorEnVivo, fijarBorrador, enVistaPrevia,
  MENSAJE_EDITOR, type ContenidoTienda,
} from '../../lib/tienda';

/**
 * Diseño vigente de la portada: el guardado (desde el catálogo) o, en la vista
 * previa del panel, el borrador que el editor envía en vivo por postMessage.
 */
export function useContenidoTienda(): ContenidoTienda {
  const calcular = () => borradorEnVivo() || contenidoConDefectos(catalogoEnCache()?.contenido);
  const [c, setC] = useState<ContenidoTienda>(calcular);

  useEffect(() => {
    const act = () => setC(calcular());
    window.addEventListener('tienda-contenido', act);
    cargarCatalogo().then(act).catch(() => { /* se usa el diseño por defecto */ });
    return () => window.removeEventListener('tienda-contenido', act);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return c;
}

/** Escucha al editor del panel (solo en vista previa, mismo origen). Se monta una vez en el layout. */
export function useEscucharEditor(): void {
  useEffect(() => {
    if (!enVistaPrevia()) return;
    const recibir = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.tipo !== MENSAJE_EDITOR) return;
      fijarBorrador(contenidoConDefectos(e.data.contenido));
    };
    window.addEventListener('message', recibir);
    try { if (window.parent !== window) window.parent.postMessage({ tipo: `${MENSAJE_EDITOR}-listo` }, window.location.origin); } catch { /* */ }
    return () => window.removeEventListener('message', recibir);
  }, []);
}
