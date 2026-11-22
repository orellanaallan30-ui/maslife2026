import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import {
  contenidoConDefectos, MENSAJE_EDITOR, FUENTES, CONTENIDO_POR_DEFECTO,
  type ContenidoTienda, type ContenidoBanner, type TemaTienda,
} from '../../lib/tienda';

// Editor de la portada de la tienda con vista previa en tiempo real. A la izquierda,
// pestañas (textos, logo, estilo, imágenes, secciones, asistente IA); a la derecha, la
// tienda real (vista previa admin) en un iframe del mismo origen que recibe cada cambio
// por postMessage. Nada se publica hasta presionar "Guardar".

type AdminFetch = (method: string, body?: object, action?: string) => Promise<Response>;
type Pestana = 'textos' | 'logo' | 'estilo' | 'imagenes' | 'secciones' | 'ia';

const PESTANAS: Array<{ id: Pestana; label: string }> = [
  { id: 'textos', label: 'Textos' }, { id: 'logo', label: 'Logo' }, { id: 'estilo', label: 'Estilo' },
  { id: 'imagenes', label: 'Imágenes' }, { id: 'secciones', label: 'Secciones' }, { id: 'ia', label: 'Asistente IA' },
];
const CAMPOS: Array<{ k: keyof ContenidoBanner; label: string; max: number; largo?: boolean }> = [
  { k: 'titulo', label: 'Título', max: 80 },
  { k: 'destacado', label: 'Frase destacada (en color)', max: 80 },
  { k: 'bajada', label: 'Texto de apoyo', max: 240, largo: true },
  { k: 'boton', label: 'Texto del botón', max: 30 },
];
const PALETAS: Array<{ nombre: string; primario: string; acento: string; suave: string }> = [
  { nombre: 'Mas Life', primario: '#0B4F5C', acento: '#E8731C', suave: '#E6F2F1' },
  { nombre: 'Bosque', primario: '#14532D', acento: '#F59E0B', suave: '#ECFDF5' },
  { nombre: 'Océano', primario: '#0C4A6E', acento: '#F97316', suave: '#E0F2FE' },
  { nombre: 'Ciruela', primario: '#4C1D95', acento: '#F472B6', suave: '#F5F3FF' },
  { nombre: 'Tierra', primario: '#78350F', acento: '#65A30D', suave: '#FEF3C7' },
  { nombre: 'Grafito', primario: '#1F2937', acento: '#10B981', suave: '#F3F4F6' },
];
const input = 'w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500';
const chip = (activo: boolean) => `rounded-xl px-3 py-2 text-xs font-bold ${activo ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`;

export const EditorTienda: React.FC<{ adminFetch: AdminFetch; inicial?: Partial<ContenidoTienda>; alGuardar: () => void }> = ({ adminFetch, inicial, alGuardar }) => {
  const [original, setOriginal] = useState(() => contenidoConDefectos(inicial));
  const [c, setC] = useState<ContenidoTienda>(original);
  const [pestana, setPestana] = useState<Pestana>('textos');
  const [vista, setVista] = useState<'movil' | 'escritorio'>('escritorio');
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState('');
  const [pedidoIa, setPedidoIa] = useState('');
  const [notaIa, setNotaIa] = useState('');
  const [json, setJson] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const cambiado = JSON.stringify(c) !== JSON.stringify(original);

  // Envía el borrador a la vista previa en cada cambio y cuando el iframe avisa que cargó.
  const enviar = () => { try { frame.current?.contentWindow?.postMessage({ tipo: MENSAJE_EDITOR, contenido: c }, window.location.origin); } catch { /* */ } };
  useEffect(enviar, [c]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const listo = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.tipo === `${MENSAJE_EDITOR}-listo`) enviar(); };
    window.addEventListener('message', listo);
    return () => window.removeEventListener('message', listo);
  });

  const setTexto = (b: 'banner' | 'banner2', k: keyof ContenidoBanner, v: string) => setC(prev => ({ ...prev, [b]: { ...prev[b], [k]: v } }));
  const setTema = (t: Partial<TemaTienda>) => setC(prev => ({ ...prev, tema: { ...prev.tema, ...t } }));
  const aviso = (tipo: 'ok' | 'error', texto: string) => setEstado({ tipo, texto });

  const llamar = async (body: object, action: string) => {
    const r = await adminFetch('POST', body, action);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    return j;
  };

  /** Sube una imagen al bucket público de la tienda (URL firmada del servidor). */
  const subir = async (file: File): Promise<string | null> => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { aviso('error', 'La imagen debe ser JPG, PNG o WebP.'); return null; }
    if (file.size > 5 * 1024 * 1024) { aviso('error', 'La imagen pesa más de 5 MB.'); return null; }
    setOcupado('subiendo');
    try {
      const j = await llamar({ tipo: file.type }, 'shop-image-upload-url');
      const { error } = await supabase.storage.from('shop-images').uploadToSignedUrl(j.path, j.token, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      return j.publicUrl as string;
    } catch (e: any) { aviso('error', e?.message || 'No se pudo subir la imagen'); return null; }
    finally { setOcupado(''); }
  };

  const guardar = async () => {
    setOcupado('guardando'); setEstado(null);
    try {
      await llamar({ contenido: c }, 'shop-settings');
      setOriginal(c);
      aviso('ok', 'Guardado. La tienda pública puede tardar hasta 1 minuto en mostrarlo.');
      alGuardar();
    } catch (e: any) { aviso('error', e?.message || 'No se pudo guardar'); }
    setOcupado('');
  };

  const pedirIa = async () => {
    setOcupado('ia'); setNotaIa(''); setEstado(null);
    try {
      const j = await llamar({ pedido: pedidoIa, contenido: c }, 'shop-ai-design');
      setC(contenidoConDefectos(j.contenido));
      setNotaIa(j.nota || 'Listo. Revisa la vista previa; si te gusta, presiona Guardar.');
    } catch (e: any) { aviso('error', e?.message || 'El asistente no respondió'); }
    setOcupado('');
  };

  const campoImagen = (etiqueta: string, valor: string, poner: (url: string) => void, ayuda: string) => (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-black text-slate-800">{etiqueta}</p>
      <p className="text-xs text-slate-500">{ayuda}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {valor && <img src={valor} alt="" className="h-16 w-24 rounded-lg border border-slate-200 object-contain bg-slate-50" />}
        <label className={`${chip(false)} cursor-pointer`}>
          {valor ? 'Cambiar' : 'Subir imagen'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const url = await subir(f); if (url) poner(url); }} />
        </label>
        {valor && <button onClick={() => poner('')} className="text-xs font-bold text-slate-500 underline">Quitar</button>}
      </div>
    </div>
  );

  const bloqueTextos = (b: 'banner' | 'banner2', titulo: string) => (
    <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-black text-slate-800">{titulo}</legend>
      {CAMPOS.map(f => (
        <label key={f.k} className="block text-xs font-bold text-slate-600">
          {f.label} <span className="font-normal text-slate-400">({c[b][f.k].length}/{f.max})</span>
          {f.largo
            ? <textarea rows={3} maxLength={f.max} className={`${input} mt-1`} value={c[b][f.k]} onChange={e => setTexto(b, f.k, e.target.value)} />
            : <input maxLength={f.max} className={`${input} mt-1`} value={c[b][f.k]} onChange={e => setTexto(b, f.k, e.target.value)} />}
        </label>
      ))}
    </fieldset>
  );

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-black text-slate-800">Diseño de la tienda</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { if (window.confirm('¿Volver al diseño original de Mas Life? (no se guarda hasta presionar Guardar)')) setC({ ...CONTENIDO_POR_DEFECTO }); }}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500">Restablecer</button>
          <button onClick={() => setC(original)} disabled={!cambiado || !!ocupado} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700 disabled:opacity-50">Descartar</button>
          <button onClick={guardar} disabled={!cambiado || !!ocupado} className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">{ocupado === 'guardando' ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
      {estado && <p className={`mt-3 rounded-xl p-3 text-sm font-bold ${estado.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{estado.texto}</p>}
      {cambiado && !estado && <p className="mt-3 text-xs font-bold text-amber-700">Tienes cambios sin guardar.</p>}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5">
        <div className="min-w-0 space-y-4">
          <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1" aria-label="Partes del diseño">
            {PESTANAS.map(t => (
              <button key={t.id} onClick={() => setPestana(t.id)}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${pestana === t.id ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>{t.label}</button>
            ))}
          </nav>

          {pestana === 'textos' && (<>
            {bloqueTextos('banner', 'Banner principal')}
            {bloqueTextos('banner2', 'Banner secundario')}
            <p className="text-xs text-slate-400">Si dejas un campo vacío se usa el texto por defecto.</p>
          </>)}

          {pestana === 'logo' && (<>
            {campoImagen('Logo', c.marca.logoUrl, url => setC(p => ({ ...p, marca: { ...p.marca, logoUrl: url } })),
              'PNG con fondo transparente se ve mejor. Si no subes uno, se usa el logotipo en texto "Mas Life".')}
            <label className="block text-xs font-bold text-slate-600">Tamaño del logo: {c.marca.logoAltura}px
              <input type="range" min={24} max={96} value={c.marca.logoAltura} onChange={e => setC(p => ({ ...p, marca: { ...p.marca, logoAltura: Number(e.target.value) } }))} className="mt-2 w-full accent-teal-500" />
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
              <input type="checkbox" checked={c.marca.mostrarNombre} onChange={e => setC(p => ({ ...p, marca: { ...p.marca, mostrarNombre: e.target.checked } }))} className="accent-teal-500" />
              Mostrar la palabra "Tienda" junto al logo
            </label>
          </>)}

          {pestana === 'estilo' && (<>
            <div>
              <p className="text-xs font-bold text-slate-600">Paletas sugeridas</p>
              <div className="mt-2 grid grid-cols-2 lg:grid-cols-3 gap-2">
                {PALETAS.map(p => (
                  <button key={p.nombre} onClick={() => setTema({ colorPrimario: p.primario, colorAcento: p.acento, colorSuave: p.suave })}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 p-2 text-xs font-bold text-slate-700 hover:border-slate-400">
                    <span className="flex">{[p.primario, p.acento, p.suave].map(col => <span key={col} className="h-5 w-5 rounded-full border border-white" style={{ background: col }} />)}</span>
                    {p.nombre}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([['colorPrimario', 'Principal'], ['colorAcento', 'Acento'], ['colorSuave', 'Fondo suave']] as const).map(([k, l]) => (
                <label key={k} className="block text-xs font-bold text-slate-600">{l}
                  <input type="color" value={c.tema[k]} onChange={e => setTema({ [k]: e.target.value.toUpperCase() } as Partial<TemaTienda>)} className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-slate-200" />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {([['fuenteTitulos', 'Fuente de títulos'], ['fuenteTexto', 'Fuente del texto']] as const).map(([k, l]) => (
                <label key={k} className="block text-xs font-bold text-slate-600">{l}
                  <select className={`${input} mt-1`} value={c.tema[k]} onChange={e => setTema({ [k]: e.target.value } as Partial<TemaTienda>)}>
                    {FUENTES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {([
              ['radio', 'Bordes', [['recto', 'Rectos'], ['suave', 'Suaves'], ['redondeado', 'Redondeados']]],
              ['espaciado', 'Márgenes entre secciones', [['compacto', 'Compacto'], ['normal', 'Normal'], ['amplio', 'Amplio']]],
              ['ancho', 'Ancho de la página', [['normal', 'Normal'], ['amplio', 'Amplio']]],
            ] as const).map(([k, l, ops]) => (
              <div key={k}>
                <p className="text-xs font-bold text-slate-600">{l}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {ops.map(([v, t]) => <button key={v} onClick={() => setTema({ [k]: v } as Partial<TemaTienda>)} className={chip(c.tema[k] === v)}>{t}</button>)}
                </div>
              </div>
            ))}
          </>)}

          {pestana === 'imagenes' && (<>
            {campoImagen('Imagen del banner principal', c.imagenes.banner, url => setC(p => ({ ...p, imagenes: { ...p.imagenes, banner: url } })),
              'Horizontal, ideal 1200×900 px. Si no subes una, se arma con las fotos de tus productos.')}
            {campoImagen('Imagen del banner secundario', c.imagenes.banner2, url => setC(p => ({ ...p, imagenes: { ...p.imagenes, banner2: url } })),
              'Horizontal. Si no subes una, se muestran fotos de tus productos.')}
            {ocupado === 'subiendo' && <p className="text-xs text-slate-500">Subiendo imagen…</p>}
          </>)}

          {pestana === 'secciones' && (
            <div className="space-y-2">
              {([['categorias', 'Categorías en círculos'], ['banner2', 'Banner secundario'], ['beneficios', 'Beneficios'], ['preguntas', 'Preguntas frecuentes']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-700">
                  {l}
                  <input type="checkbox" checked={c.secciones[k]} onChange={e => setC(p => ({ ...p, secciones: { ...p.secciones, [k]: e.target.checked } }))} className="h-5 w-5 accent-teal-500" />
                </label>
              ))}
              <p className="text-xs text-slate-400">El banner principal y los productos siempre se muestran.</p>
            </div>
          )}

          {pestana === 'ia' && (<>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-black text-slate-800">Pídele cambios al asistente de diseño</p>
              <p className="text-xs text-slate-500">Ej.: "más elegante y minimalista, tonos verdes", "textos más cercanos para personas mayores". Propone colores, fuentes, textos y márgenes; no cambia tus fotos. Nada se publica hasta que presiones Guardar.</p>
              <textarea rows={3} maxLength={600} className={`${input} mt-3`} value={pedidoIa} onChange={e => setPedidoIa(e.target.value)} placeholder="¿Qué quieres cambiar?" />
              <button onClick={pedirIa} disabled={pedidoIa.trim().length < 3 || !!ocupado} className="mt-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
                {ocupado === 'ia' ? 'Pensando…' : 'Proponer diseño'}
              </button>
              {notaIa && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notaIa}</p>}
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-black text-slate-800">Usar otra IA (ChatGPT, Gemini…)</p>
              <p className="text-xs text-slate-500">Copia tu diseño, pégalo en la otra IA junto con lo que quieres, y pega aquí lo que te devuelva.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => { const t = JSON.stringify(c, null, 2); setJson(t); try { navigator.clipboard?.writeText(t); aviso('ok', 'Diseño copiado al portapapeles.'); } catch { /* se ve en el cuadro */ } }} className={chip(false)}>Copiar diseño</button>
                <button onClick={() => { try { setC(contenidoConDefectos(JSON.parse(json))); aviso('ok', 'Diseño aplicado en la vista previa. Revisa y guarda.'); } catch { aviso('error', 'El texto pegado no es un diseño válido (JSON).'); } }} disabled={!json.trim()} className={chip(false)}>Aplicar lo pegado</button>
              </div>
              <textarea rows={5} className={`${input} mt-2 font-mono text-[11px]`} value={json} onChange={e => setJson(e.target.value)} placeholder='{"tema": {"colorPrimario": "#14532D", ...}}' />
              <p className="mt-1 text-xs text-slate-400">Al guardar, el servidor revisa todo: solo acepta colores, fuentes y opciones válidas.</p>
            </div>
          </>)}
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-500">Vista previa en vivo</span>
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
              {(['movil', 'escritorio'] as const).map(v => (
                <button key={v} onClick={() => setVista(v)} className={`rounded-lg px-3 py-1 ${vista === v ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>{v === 'movil' ? 'Móvil' : 'Escritorio'}</button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 lg:sticky lg:top-4">
            <iframe ref={frame} title="Vista previa de la tienda" src="/tienda?vista=previa" onLoad={enviar}
              className="mx-auto block h-[560px] bg-white transition-all lg:h-[720px]" style={{ width: vista === 'movil' ? 390 : '100%', maxWidth: '100%' }} />
          </div>
        </div>
      </div>
    </section>
  );
};
