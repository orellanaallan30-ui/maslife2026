// Entrega de PDFs que funciona también en iPad/iPhone y navegadores internos.
//
// jsPDF.save() usa <a download> con un blob. En Safari de iOS y, sobre todo, en
// los navegadores internos (app de Google, Instagram, Facebook) eso no descarga
// nada, y como el PDF se genera de forma asíncrona tampoco se puede abrir una
// ventana: el navegador ya no lo considera un toque del usuario. La salida es
// mostrar un aviso "Tu PDF está listo" cuyo botón es un toque nuevo, y desde ahí
// compartir (Guardar en Archivos, WhatsApp, Mail…) o abrir el PDF.

export function esNavegadorRestringido(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
  const interno = /GSA\/|FBAN|FBAV|Instagram|Line\/|WhatsApp|; wv\)/.test(ua);
  return iOS || interno;
}

function descargaDirecta(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60_000);
}

function boton(texto: string, primario: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.style.cssText = `width:100%;padding:14px 16px;border-radius:14px;font:800 14px system-ui,-apple-system,sans-serif;border:0;cursor:pointer;${
    primario ? 'background:#0d9488;color:#fff;' : 'background:#f1f5f9;color:#334155;'
  }`;
  return b;
}

/** Muestra el aviso "Tu PDF está listo" con Compartir / Abrir / Cerrar. */
function dialogoPDF(blob: Blob, nombre: string) {
  document.getElementById('maslife-pdf-listo')?.remove();
  const url = URL.createObjectURL(blob);
  const fondo = document.createElement('div');
  fondo.id = 'maslife-pdf-listo';
  fondo.setAttribute('role', 'dialog');
  fondo.setAttribute('aria-modal', 'true');
  fondo.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px;';
  const caja = document.createElement('div');
  caja.style.cssText = 'background:#fff;width:100%;max-width:420px;border-radius:22px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:10px;margin-bottom:env(safe-area-inset-bottom);';
  const titulo = document.createElement('p');
  titulo.textContent = 'Tu PDF está listo';
  titulo.style.cssText = 'margin:0;font:900 17px system-ui,-apple-system,sans-serif;color:#0f172a;';
  const sub = document.createElement('p');
  sub.textContent = nombre;
  sub.style.cssText = 'margin:0 0 6px;font:600 12px system-ui,-apple-system,sans-serif;color:#64748b;word-break:break-all;';
  caja.append(titulo, sub);

  const cerrar = () => { fondo.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); };
  const archivo = typeof File !== 'undefined' ? new File([blob], nombre, { type: 'application/pdf' }) : null;
  const puedeCompartir = !!(archivo && navigator.canShare?.({ files: [archivo] }));

  if (puedeCompartir) {
    const bc = boton('Compartir o guardar en Archivos', true);
    bc.onclick = async () => {
      try { await navigator.share({ files: [archivo!], title: nombre }); cerrar(); }
      catch (e: any) { if (e?.name !== 'AbortError') window.open(url, '_blank'); }
    };
    caja.append(bc);
  }
  const ba = boton('Abrir PDF', !puedeCompartir);
  ba.onclick = () => {
    // Si el navegador bloquea la ventana nueva, se abre en la misma pestaña.
    const w = window.open(url, '_blank');
    if (!w) window.location.href = url;
  };
  const bx = boton('Cerrar', false);
  bx.onclick = cerrar;
  caja.append(ba, bx);
  fondo.onclick = e => { if (e.target === fondo) cerrar(); };
  fondo.append(caja);
  document.body.append(fondo);
}

/** Entrega un PDF: descarga directa en escritorio/Android; aviso con botones en iOS y apps. */
export function entregarPDF(blob: Blob, nombreOriginal: string) {
  // Sin tildes ni caracteres raros: algunos navegadores descartan el nombre
  // ("download") si trae caracteres fuera de ASCII.
  const nombre = nombreOriginal.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_');
  if (esNavegadorRestringido()) dialogoPDF(blob, nombre);
  else descargaDirecta(blob, nombre);
}
