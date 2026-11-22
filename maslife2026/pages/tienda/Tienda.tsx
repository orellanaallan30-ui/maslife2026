import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { trackShopAddToCart } from '../../analytics';
import {
  cargarCatalogo, catalogoEnCache, agregarAlCarrito, abrirCarrito, clp, CATEGORIAS,
  type Catalogo, type ProductoTienda,
} from '../../lib/tienda';
import { LayoutTienda, Skeleton, C, SERIF } from './LayoutTienda';

const CONFIANZA = [
  { icono: 'verified_user', titulo: 'Pago seguro', texto: 'Con MercadoPago. No guardamos datos de tu tarjeta.' },
  { icono: 'local_shipping', titulo: 'Despacho a domicilio', texto: 'Enviamos a tu región con seguimiento.' },
  { icono: 'medical_services', titulo: 'Elegidos por kinesiólogos', texto: 'Productos que usamos y recomendamos en la clínica.' },
];

const Tarjeta: React.FC<{ p: ProductoTienda; prioridad: boolean }> = ({ p, prioridad }) => {
  const [agregado, setAgregado] = useState(false);
  const agregar = () => {
    agregarAlCarrito(p.sku);
    trackShopAddToCart({ sku: p.sku, cantidad: 1, precio: p.precio });
    setAgregado(true);
    abrirCarrito();
    setTimeout(() => setAgregado(false), 1500);
  };
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition-shadow hover:shadow-xl hover:shadow-slate-200/70">
      <Link to={`/tienda/${p.sku}`} className="relative block aspect-square overflow-hidden bg-slate-100">
        {p.imagenes[0]
          ? <img src={p.imagenes[0]} alt={p.nombre} loading={prioridad ? 'eager' : 'lazy'} decoding="async" width={600} height={600}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <span className="flex h-full items-center justify-center material-icons-round text-5xl text-slate-300">inventory_2</span>}
        {p.agotado && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-extrabold text-slate-700">Agotado</span>}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.teal }}>{CATEGORIAS[p.categoria]}</span>
        <Link to={`/tienda/${p.sku}`} className="mt-1 font-extrabold leading-snug text-slate-900 hover:underline">{p.nombre}</Link>
        <p className="mt-auto pt-4 text-2xl font-extrabold text-slate-900">{clp(p.precio)}</p>
        <button disabled={p.agotado} onClick={agregar}
          className="mt-3 rounded-xl px-4 py-3 font-extrabold text-white transition-opacity hover:opacity-90 disabled:bg-slate-300"
          style={p.agotado ? undefined : { background: C.petroleo }}>
          {p.agotado ? 'Agotado' : agregado ? 'Agregado ✓' : 'Agregar al carrito'}
        </button>
      </div>
    </article>
  );
};

const Tienda: React.FC = () => {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(catalogoEnCache);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<'todas' | ProductoTienda['categoria']>('todas');

  usePageMeta({
    title: 'Tienda de salud y bienestar | Clínica Mas Life',
    description: 'Suplementos, rehabilitación y bienestar seleccionados por kinesiólogos de Clínica Mas Life. Pago seguro y despacho a domicilio en Chile.',
    canonicalPath: '/tienda',
  });

  useEffect(() => { cargarCatalogo().then(setCatalogo).catch(e => { if (!catalogo) setError(e.message); }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const categorias = useMemo(() => [...new Set((catalogo?.productos || []).map(p => p.categoria))], [catalogo]);
  const productos = (catalogo?.productos || []).filter(p => filtro === 'todas' || p.categoria === filtro);

  return (
    <LayoutTienda fondo={C.crema}>
      <section className="pb-10 pt-10 lg:pb-14 lg:pt-16" style={{ background: `linear-gradient(160deg, ${C.petroleo}, ${C.petroleoClaro})` }}>
        <div className="mx-auto max-w-6xl px-4 text-white">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/70">Clínica Mas Life</p>
          <h1 className="mt-3 max-w-2xl text-4xl lg:text-5xl leading-tight" style={{ ...SERIF, fontWeight: 400 }}>
            Salud y bienestar, <em style={{ color: '#FFB27A' }}>elegidos por kinesiólogos</em>
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/85">Suplementos y productos de rehabilitación que usamos en la consulta, con despacho a tu casa.</p>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-3 gap-4 px-4 py-5">
          {CONFIANZA.map(c => (
            <div key={c.titulo} className="flex items-start gap-3">
              <span className="material-icons-round rounded-full p-2 text-xl" style={{ color: C.petroleo, background: '#E6F2F1' }}>{c.icono}</span>
              <div><p className="font-extrabold text-slate-900">{c.titulo}</p><p className="text-sm text-slate-600">{c.texto}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-10">
        <div className="mx-auto max-w-6xl px-4">
          {error && <p className="rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>}
          {catalogo && !catalogo.activa && (
            <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
              <p className="text-2xl" style={SERIF}>Muy pronto</p>
              <p className="mt-2 text-slate-600">Estamos preparando la tienda. Vuelve en unos días.</p>
            </div>
          )}

          {catalogo?.activa && categorias.length > 1 && (
            <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Categorías">
              {(['todas', ...categorias] as const).map(c => (
                <button key={c} role="tab" aria-selected={filtro === c} onClick={() => setFiltro(c)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${filtro === c ? 'text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                  style={filtro === c ? { background: C.petroleo } : undefined}>
                  {c === 'todas' ? 'Todo' : CATEGORIAS[c]}
                </button>
              ))}
            </div>
          )}

          {catalogo?.activa && productos.length === 0 && <p className="text-slate-500">Aún no hay productos en esta categoría.</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {!catalogo && !error && Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <Skeleton className="aspect-square rounded-none" />
                <div className="space-y-3 p-5"><Skeleton className="h-3 w-24" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-11" /></div>
              </div>
            ))}
            {productos.map((p, i) => <Tarjeta key={p.sku} p={p} prioridad={i < 3} />)}
          </div>
        </div>
      </section>
    </LayoutTienda>
  );
};

export default Tienda;
