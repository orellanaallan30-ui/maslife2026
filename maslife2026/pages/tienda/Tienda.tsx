import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { cargarCatalogo, agregarAlCarrito, clp, CATEGORIAS, type Catalogo, type ProductoTienda } from '../../lib/tienda';
import { BarraTienda } from './BarraTienda';

const FONT = { fontFamily: "'Manrope', system-ui, sans-serif" };

const Tienda: React.FC = () => {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<'todas' | ProductoTienda['categoria']>('todas');
  const [agregado, setAgregado] = useState('');

  usePageMeta({
    title: 'Tienda de salud y bienestar | Clínica Mas Life',
    description: 'Productos de rehabilitación, salud y bienestar seleccionados por kinesiólogos. Despacho a domicilio en Chile.',
    canonicalPath: '/tienda',
  });

  useEffect(() => {
    cargarCatalogo().then(setCatalogo).catch(e => setError(e.message));
  }, []);

  const categorias = useMemo(
    () => [...new Set((catalogo?.productos || []).map(p => p.categoria))],
    [catalogo],
  );
  const productos = (catalogo?.productos || []).filter(p => filtro === 'todas' || p.categoria === filtro);

  const agregar = (sku: string) => {
    agregarAlCarrito(sku);
    setAgregado(sku);
    setTimeout(() => setAgregado(a => (a === sku ? '' : a)), 1500);
  };

  return (
    <div className="w-full bg-slate-50" style={FONT}>
      <BarraTienda />
      <section className="pt-8 pb-6 lg:pt-12">
        <div className="mx-auto max-w-6xl px-4">
          <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-900">Tienda de salud y bienestar</h1>
          <p className="mt-2 max-w-2xl text-slate-600">Productos de rehabilitación y bienestar seleccionados por nuestro equipo. Despacho a domicilio en Chile.</p>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-6xl px-4">
          {error && <p className="rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>}
          {!catalogo && !error && <p className="text-slate-500">Cargando productos…</p>}
          {catalogo && !catalogo.activa && (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-xl font-extrabold text-slate-900">Muy pronto</p>
              <p className="mt-2 text-slate-600">Estamos preparando la tienda. Vuelve en unos días.</p>
            </div>
          )}

          {catalogo?.activa && categorias.length > 1 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {(['todas', ...categorias] as const).map(c => (
                <button key={c} onClick={() => setFiltro(c)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${filtro === c ? 'bg-[#00a89e] text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                  {c === 'todas' ? 'Todas' : CATEGORIAS[c]}
                </button>
              ))}
            </div>
          )}

          {catalogo?.activa && productos.length === 0 && <p className="text-slate-500">Aún no hay productos en esta categoría.</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {productos.map(p => (
              <article key={p.sku} className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <Link to={`/tienda/${p.sku}`} className="block aspect-square bg-slate-100">
                  {p.imagenes[0]
                    ? <img src={p.imagenes[0]} alt={p.nombre} loading="lazy" className="h-full w-full object-cover" />
                    : <span className="flex h-full items-center justify-center material-icons-round text-5xl text-slate-300">inventory_2</span>}
                </Link>
                <div className="flex flex-1 flex-col p-5">
                  <span className="text-[11px] font-black uppercase tracking-widest text-[#00a89e]">{CATEGORIAS[p.categoria]}</span>
                  <Link to={`/tienda/${p.sku}`} className="mt-1 font-extrabold text-slate-900 hover:underline">{p.nombre}</Link>
                  <p className="mt-auto pt-4 text-xl font-extrabold text-slate-900">{clp(p.precio)}</p>
                  <button disabled={p.agotado} onClick={() => agregar(p.sku)}
                    className="mt-3 rounded-xl bg-[#00a89e] px-4 py-3 font-extrabold text-white disabled:bg-slate-300">
                    {p.agotado ? 'Agotado' : agregado === p.sku ? 'Agregado ✓' : 'Agregar al carrito'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Tienda;
