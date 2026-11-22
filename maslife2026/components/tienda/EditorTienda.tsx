import React, { useEffect, useRef, useState } from 'react';
import { contenidoConDefectos, MENSAJE_EDITOR, type ContenidoTienda, type ContenidoBanner } from '../../lib/tienda';

// Editor de la portada de la tienda con vista previa en tiempo real: a la izquierda
// los textos de los banners; a la derecha la tienda real (vista previa admin) en un
// iframe del mismo origen, que recibe los cambios por postMessage antes de guardar.

type AdminFetch = (method: string, body?: object, action?: string) => Promise<Response>;

const CAMPOS: Array<{ k: keyof ContenidoBanner; label: string; max: number; largo?: boolean }> = [
  { k: 'titulo', label: 'Título', max: 80 },
  { k: 'destacado', label: 'Frase destacada (en color)', max: 80 },
  { k: 'bajada', label: 'Texto de apoyo', max: 240, largo: true },
  { k: 'boton', label: 'Texto del botón', max: 30 },
];
const input = 'w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500';

export const EditorTienda: React.FC<{ adminFetch: AdminFetch; inicial?: Partial<ContenidoTienda>; alGuardar: () => void }> = ({ adminFetch, inicial, alGuardar }) => {
  const original = contenidoConDefectos(inicial);
  const [c, setC] = useState<ContenidoTienda>(original);
  const [vista, setVista] = useState<'movil' | 'escritorio'>('escritorio');
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const cambiado = JSON.stringify(c) !== JSON.stringify(original);

  // Envía el borrador a la vista previa en cada cambio y cuando el iframe avisa que cargó.
  const enviar = () => { try { frame.current?.contentWindow?.postMessage({ tipo: MENSAJE_EDITOR, contenido: c }, window.location.origin); } catch { /* */ } };
  useEffect(enviar, [c]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const listo = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.tipo === `${MENSAJE_EDITOR}-listo`) enviar(); };
    window.addEventListener('message', listo);
    return () => window.removeEventListener('message', listo);
  }); // se re-registra con el borrador actual

  const set = (b: keyof ContenidoTienda, k: keyof ContenidoBanner, v: string) => setC(prev => ({ ...prev, [b]: { ...prev[b], [k]: v } }));

  const guardar = async () => {
    setGuardando(true); setEstado(null);
    try {
      const r = await adminFetch('POST', { contenido: c }, 'shop-settings');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setEstado({ tipo: 'ok', texto: 'Guardado. La tienda pública puede tardar hasta 1 minuto en mostrarlo.' });
      alGuardar();
    } catch (e: any) { setEstado({ tipo: 'error', texto: e?.message || 'No se pudo guardar' }); }
    setGuardando(false);
  };

  const bloque = (b: keyof ContenidoTienda, titulo: string) => (
    <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-black text-slate-800">{titulo}</legend>
      {CAMPOS.map(f => (
        <label key={f.k} className="block text-xs font-bold text-slate-600">
          {f.label} <span className="font-normal text-slate-400">({c[b][f.k].length}/{f.max})</span>
          {f.largo
            ? <textarea rows={3} maxLength={f.max} className={`${input} mt-1`} value={c[b][f.k]} onChange={e => set(b, f.k, e.target.value)} />
            : <input maxLength={f.max} className={`${input} mt-1`} value={c[b][f.k]} onChange={e => set(b, f.k, e.target.value)} />}
        </label>
      ))}
    </fieldset>
  );

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-black text-slate-800">Apariencia de la portada</h3>
        <div className="flex gap-2">
          <button onClick={() => setC(original)} disabled={!cambiado || guardando} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700 disabled:opacity-50">Descartar</button>
          <button onClick={guardar} disabled={!cambiado || guardando} className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
      {estado && <p className={`mt-3 rounded-xl p-3 text-sm font-bold ${estado.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{estado.texto}</p>}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5">
        <div className="min-w-0 space-y-4">
          {bloque('banner', 'Banner principal')}
          {bloque('banner2', 'Banner secundario')}
          <p className="text-xs text-slate-400">Si dejas un campo vacío se usa el texto por defecto.</p>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-500">Vista previa en vivo (sin guardar)</span>
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
              {(['movil', 'escritorio'] as const).map(v => (
                <button key={v} onClick={() => setVista(v)} className={`rounded-lg px-3 py-1 ${vista === v ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>{v === 'movil' ? 'Móvil' : 'Escritorio'}</button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <iframe ref={frame} title="Vista previa de la tienda" src="/tienda?vista=previa" onLoad={enviar}
              className="mx-auto block h-[640px] bg-white transition-all" style={{ width: vista === 'movil' ? 390 : '100%', maxWidth: '100%' }} />
          </div>
        </div>
      </div>
    </section>
  );
};
