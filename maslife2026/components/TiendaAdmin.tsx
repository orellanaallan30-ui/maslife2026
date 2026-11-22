import React, { useEffect, useState } from 'react';

// Pestaña "Tienda" del panel admin: ajustes, búsqueda e importación desde Dropi,
// aprobación de productos y pedidos. Todo pasa por /api/admin-auth?action=shop-*.

type AdminFetch = (method: string, body?: object, action?: string) => Promise<Response>;

const CATEGORIAS = [
  { id: 'rehabilitacion', label: 'Rehabilitación' },
  { id: 'salud', label: 'Salud' },
  { id: 'bienestar', label: 'Bienestar' },
  { id: 'suplementos', label: 'Suplementos' },
];
const ESTADO_COLOR: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-600', publicado: 'bg-emerald-50 text-emerald-700',
  agotado: 'bg-amber-50 text-amber-700', pausado: 'bg-slate-200 text-slate-700',
};
const clp = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-CL')}`);
const caja = 'bg-white rounded-3xl border border-slate-200 shadow-sm p-5 lg:p-6';
const input = 'rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500';
const boton = 'rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-50';

export const TiendaAdmin: React.FC<{ adminFetch: AdminFetch }> = ({ adminFetch }) => {
  const [datos, setDatos] = useState<any>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ajustes, setAjustes] = useState<any>(null);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<any[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [importar, setImportar] = useState<Record<number, { categoria: string; variacion: string }>>({});
  const [ocupado, setOcupado] = useState('');

  const llamar = async (method: string, body: object | undefined, action: string) => {
    const r = await adminFetch(method, body, action);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    return j;
  };

  const cargar = async () => {
    try {
      const j = await llamar('GET', undefined, 'shop-admin');
      setDatos(j);
      setAjustes({
        tiendaActiva: j.ajustes.tiendaActiva, margen: Math.round(j.ajustes.margen * 10000) / 100, comisionPct: Math.round(j.ajustes.comisionPct * 10000) / 100,
        umbralStock: j.ajustes.umbralStock, tarifasRegion: { ...j.ajustes.tarifasRegion },
      });
    } catch (e: any) { setAviso({ tipo: 'error', texto: e.message }); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const ok = (texto: string) => setAviso({ tipo: 'ok', texto });
  const fallo = (e: any) => setAviso({ tipo: 'error', texto: e?.message || 'Error' });

  const guardarAjustes = async () => {
    setOcupado('ajustes');
    try {
      const j = await llamar('POST', {
        tiendaActiva: ajustes.tiendaActiva, margen: Number(ajustes.margen) / 100, comisionPct: Number(ajustes.comisionPct) / 100,
        umbralStock: Number(ajustes.umbralStock), tarifasRegion: ajustes.tarifasRegion,
      }, 'shop-settings');
      ok(`Ajustes guardados${j.actualizados ? ` · ${j.actualizados} precios recalculados` : ''}.`);
      await cargar();
    } catch (e) { fallo(e); }
    setOcupado('');
  };

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuscando(true); setResultados(null);
    try {
      const j = await llamar('GET', undefined, `shop-dropi-search&q=${encodeURIComponent(busqueda)}`);
      setResultados(j.productos || []);
    } catch (err) { fallo(err); }
    setBuscando(false);
  };

  const importarProducto = async (p: any) => {
    const sel = importar[p.dropiId] || { categoria: '', variacion: '' };
    if (!sel.categoria) { setAviso({ tipo: 'error', texto: 'Elige la categoría antes de importar.' }); return; }
    setOcupado(`imp-${p.dropiId}`);
    try {
      const j = await llamar('POST', { dropiId: p.dropiId, variationId: sel.variacion || null, categoria: sel.categoria }, 'shop-import');
      ok(`Importado como borrador: ${j.sku}. Revísalo abajo y apruébalo para publicarlo.`);
      await cargar();
    } catch (e) { fallo(e); }
    setOcupado('');
  };

  const editar = async (id: string, cambios: object, aprobar = false, mensaje = 'Producto actualizado.') => {
    setOcupado(id);
    try { await llamar('POST', { id, cambios, aprobar }, 'shop-product'); ok(mensaje); await cargar(); } catch (e) { fallo(e); }
    setOcupado('');
  };

  const sincronizar = async () => {
    setOcupado('sync');
    try {
      const j = await llamar('POST', {}, 'shop-sync');
      ok(`Stock sincronizado: ${j.revisados} revisados, ${j.cambios} con cambios, ${j.errores} errores.`);
      await cargar();
    } catch (e) { fallo(e); }
    setOcupado('');
  };

  if (!datos || !ajustes) {
    return aviso ? <p className="rounded-2xl bg-red-50 p-4 text-red-700">{aviso.texto}</p>
      : <span className="material-icons-round text-slate-300 animate-spin">sync</span>;
  }

  return (
    <div className="space-y-5">
      {aviso && (
        <div className={`rounded-2xl p-4 text-sm font-bold ${aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {aviso.texto}
          <button onClick={() => setAviso(null)} className="ml-3 underline">cerrar</button>
        </div>
      )}

      {/* Ajustes */}
      <section className={caja}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <h3 className="font-black text-slate-800">Ajustes de la tienda</h3>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={ajustes.tiendaActiva} onChange={e => setAjustes({ ...ajustes, tiendaActiva: e.target.checked })} className="h-4 w-4 accent-teal-500" />
            Tienda abierta al público (/tienda)
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
          <label className="flex flex-col gap-1 font-bold text-slate-600">Margen (%)
            <input type="number" min={0} max={80} step={1} className={input} value={ajustes.margen} onChange={e => setAjustes({ ...ajustes, margen: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 font-bold text-slate-600">Comisión pasarela (%)
            <input type="number" min={0} max={15} step={0.01} className={input} value={ajustes.comisionPct} onChange={e => setAjustes({ ...ajustes, comisionPct: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 font-bold text-slate-600">Agotado bajo (unidades)
            <input type="number" min={0} max={100} className={input} value={ajustes.umbralStock} onChange={e => setAjustes({ ...ajustes, umbralStock: e.target.value })} />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">Precio = costo Dropi ÷ (1 − margen − comisión), terminado en 990. Al cambiar margen o comisión se recalculan todos los precios.</p>

        <h4 className="mt-6 font-black text-slate-700 text-sm">Envío por región (CLP) — vacío = sin despacho a esa región</h4>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {datos.regiones.map((r: any) => (
            <label key={r.codigo} className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              {r.nombre}
              <input type="number" min={0} step={10} className={input} placeholder="sin despacho"
                value={ajustes.tarifasRegion[r.codigo] ?? ''}
                onChange={e => setAjustes({ ...ajustes, tarifasRegion: { ...ajustes.tarifasRegion, [r.codigo]: e.target.value } })} />
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <button onClick={guardarAjustes} disabled={ocupado === 'ajustes'} className={`${boton} bg-teal-500 text-white`}>Guardar ajustes</button>
          <span className="text-xs text-slate-500">Envío automático a Dropi: <b>{datos.ajustes.envioDropiActivo ? 'activo' : 'apagado'}</b> (se habilita en la etapa 3).</span>
        </div>
      </section>

      {/* Buscar en Dropi */}
      <section className={caja}>
        <h3 className="font-black text-slate-800">Agregar productos desde Dropi</h3>
        <form onSubmit={buscar} className="mt-3 flex flex-col sm:flex-row gap-3">
          <input className={`${input} flex-1`} placeholder="Ej: rodillera, banda elástica, masajeador" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <button disabled={buscando} className={`${boton} bg-slate-800 text-white`}>{buscando ? 'Buscando…' : 'Buscar'}</button>
        </form>
        {resultados && resultados.length === 0 && <p className="mt-3 text-sm text-slate-500">Sin resultados.</p>}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {(resultados || []).map(p => {
            const sel = importar[p.dropiId] || { categoria: '', variacion: '' };
            const setSel = (c: Partial<typeof sel>) => setImportar({ ...importar, [p.dropiId]: { ...sel, ...c } });
            return (
              <div key={p.dropiId} className="flex gap-3 rounded-2xl border border-slate-200 p-3">
                <div className="h-20 w-20 flex-none overflow-hidden rounded-xl bg-slate-100">{p.imagenes[0] && <img src={p.imagenes[0]} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-bold text-slate-800">{p.nombre}</p>
                  <p className="text-xs text-slate-500">Costo {clp(p.costo)} · venta sugerida {clp(p.precioSugerido)} · stock {p.stock}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select className={input} value={sel.categoria} onChange={e => setSel({ categoria: e.target.value })} aria-label="Categoría">
                      <option value="">Categoría</option>
                      {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    {p.tipo === 'VARIABLE' && (
                      <select className={input} value={sel.variacion} onChange={e => setSel({ variacion: e.target.value })} aria-label="Variación">
                        <option value="">Variación</option>
                        {p.variaciones.map((v: any) => <option key={v.id} value={v.id}>{v.atributos || v.sku} · stock {v.stock}</option>)}
                      </select>
                    )}
                    <button onClick={() => importarProducto(p)} disabled={ocupado === `imp-${p.dropiId}`} className={`${boton} bg-teal-500 text-white`}>Importar</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Productos */}
      <section className={caja}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <h3 className="font-black text-slate-800">Productos ({datos.productos.length})</h3>
          <button onClick={sincronizar} disabled={ocupado === 'sync'} className={`${boton} bg-slate-100 text-slate-700`}>Sincronizar stock ahora</button>
        </div>
        {datos.productos.length === 0 && <p className="mt-3 text-sm text-slate-500">Aún no hay productos. Búscalos arriba en Dropi.</p>}
        <div className="mt-4 space-y-3">
          {datos.productos.map((p: any) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800">{p.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {p.sku} · costo {clp(p.costo)} · venta <b>{clp(p.precio_venta)}</b> · stock {p.stock}
                    {p.aprobado_at ? ` · aprobado ${new Date(p.aprobado_at).toLocaleDateString('es-CL')}` : ' · sin aprobar'}
                  </p>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest ${ESTADO_COLOR[p.estado] || ''}`}>{p.estado}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <select className={input} value={p.categoria} onChange={e => editar(p.id, { categoria: e.target.value })} aria-label="Categoría">
                  {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {p.categoria === 'suplementos' && (
                  <input className={input} placeholder="Resolución sanitaria (SEREMI)" defaultValue={p.resolucion_sanitaria || ''}
                    onBlur={e => e.target.value !== (p.resolucion_sanitaria || '') && editar(p.id, { resolucion_sanitaria: e.target.value || null })} />
                )}
                <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
                  <input type="checkbox" checked={p.consumible} onChange={e => editar(p.id, { consumible: e.target.checked })} className="accent-teal-500" /> Consumible (recompra)
                </label>
                {p.estado === 'borrador' || p.estado === 'pausado' ? (
                  <button disabled={ocupado === p.id} onClick={() => editar(p.id, { estado: 'publicado' }, !p.aprobado_at, 'Producto publicado.')}
                    className={`${boton} bg-teal-500 text-white`}>{p.aprobado_at ? 'Publicar' : 'Aprobar y publicar'}</button>
                ) : (
                  <button disabled={ocupado === p.id} onClick={() => editar(p.id, { estado: 'pausado' }, false, 'Producto pausado.')}
                    className={`${boton} bg-slate-100 text-slate-700`}>Pausar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pedidos */}
      <section className={caja}>
        <h3 className="font-black text-slate-800">Pedidos de la tienda ({datos.pedidos.length})</h3>
        {datos.pedidos.length === 0 && <p className="mt-3 text-sm text-slate-500">Todavía no hay pedidos.</p>}
        <div className="mt-3 space-y-2">
          {datos.pedidos.map((o: any) => (
            <div key={o.id} className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-4 rounded-xl border border-slate-100 p-3 text-sm">
              <span className="text-slate-500">{new Date(o.created_at).toLocaleString('es-CL')}</span>
              <span className="flex-1 font-bold text-slate-800">{o.buyer_name} · {o.comuna}</span>
              <span>{clp(o.amount)} <span className="text-xs text-slate-500">(envío {clp(o.envio_monto)})</span></span>
              <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-black uppercase ${o.status === 'pagado' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{o.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
