import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { trackShopView, trackShopAddToCart } from '../../analytics';
import {
  cargarProducto, catalogoEnCache, agregarAlCarrito, abrirCarrito, clp, CATEGORIAS, MAX_UNIDADES,
  type ProductoTienda,
} from '../../lib/tienda';
import { LayoutTienda, Skeleton, C, SERIF } from './LayoutTienda';

const TiendaProducto: React.FC = () => {
  const { sku = '' } = useParams();
  // Si viene desde la lista, se pinta al instante con el catálogo en caché.
  const [p, setP] = useState<ProductoTienda | null>(() => catalogoEnCache()?.productos.find(x => x.sku === sku) || null);
  const [error, setError] = useState('');
  const [foto, setFoto] = useState(0);
  const [cantidad, setCantidad] = useState(1);
  const vista = useRef('');

  usePageMeta({
    title: p ? `${p.nombre} | Tienda Mas Life` : 'Tienda | Clínica Mas Life',
    description: p ? p.descripcion.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 155) || p.nombre : 'Producto de la tienda Mas Life.',
    canonicalPath: `/tienda/${sku}`,
  });

  useEffect(() => {
    setFoto(0);
    cargarProducto(sku).then(setP).catch(e => { if (!p) setError(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku]);

  useEffect(() => {
    if (p && vista.current !== p.sku) { vista.current = p.sku; trackShopView(p.sku, p.nombre, p.precio); }
  }, [p]);

  const agregar = () => {
    if (!p) return;
    agregarAlCarrito(p.sku, cantidad);
    trackShopAddToCart({ sku: p.sku, cantidad, precio: p.precio });
    abrirCarrito();
  };

  // La descripción puede traer HTML (Dropi): se muestra como texto plano.
  const descripcion = (p?.descripcion || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

  return (
    <LayoutTienda>
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 lg:pb-16">
        <nav className="text-sm text-slate-500" aria-label="Ruta">
          <Link to="/tienda" className="font-bold hover:underline" style={{ color: C.petroleo }}>Tienda</Link>
          {p && <> / <span>{CATEGORIAS[p.categoria]}</span></>}
        </nav>
        {error && <p className="mt-6 rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>}

        {!p && !error && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-10">
            <Skeleton className="aspect-square" />
            <div className="space-y-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-3/4" /><Skeleton className="h-8 w-32" /><Skeleton className="h-14" /><Skeleton className="h-32" /></div>
          </div>
        )}

        {p && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14">
            <div>
              <div className="aspect-square overflow-hidden rounded-3xl bg-slate-100">
                {p.imagenes[foto]
                  ? <img src={p.imagenes[foto]} alt={p.nombre} decoding="async" width={800} height={800} {...{ fetchpriority: 'high' }} className="h-full w-full object-cover" />
                  : <span className="flex h-full items-center justify-center material-icons-round text-6xl text-slate-300">inventory_2</span>}
              </div>
              {p.imagenes.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {p.imagenes.map((src, i) => (
                    <button key={src} onClick={() => setFoto(i)} aria-label={`Ver foto ${i + 1}`} aria-pressed={i === foto}
                      className="h-16 w-16 flex-none overflow-hidden rounded-xl border-2" style={{ borderColor: i === foto ? C.petroleo : 'transparent' }}>
                      <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.teal }}>{CATEGORIAS[p.categoria]}</span>
              <h1 className="mt-2 text-3xl lg:text-4xl leading-tight text-slate-900" style={{ ...SERIF, fontWeight: 400 }}>{p.nombre}</h1>
              <p className="mt-4 text-3xl font-extrabold text-slate-900">{clp(p.precio)}</p>
              <p className="mt-1 text-sm text-slate-500">IVA incluido. El envío se calcula según tu región.</p>
              {p.registro && (
                <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  <span className="material-icons-round text-sm">verified</span> Registro sanitario: {p.registro}
                </p>
              )}

              {!p.agotado ? (
                <div className="mt-6 hidden lg:flex items-center gap-3">
                  <div className="flex items-center rounded-xl border-2 border-slate-200">
                    <button aria-label="Quitar uno" onClick={() => setCantidad(c => Math.max(1, c - 1))} className="h-12 w-12 text-xl font-bold text-slate-600">−</button>
                    <span className="w-8 text-center font-extrabold" aria-live="polite">{cantidad}</span>
                    <button aria-label="Agregar uno" onClick={() => setCantidad(c => Math.min(MAX_UNIDADES, c + 1))} className="h-12 w-12 text-xl font-bold text-slate-600">+</button>
                  </div>
                  <button onClick={agregar} className="flex-1 rounded-xl px-6 py-4 font-extrabold text-white transition-opacity hover:opacity-90" style={{ background: C.petroleo }}>
                    Agregar al carrito · {clp(p.precio * cantidad)}
                  </button>
                </div>
              ) : (
                <p className="mt-6 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-600">Agotado por ahora. Escríbenos y te avisamos cuando vuelva.</p>
              )}

              <ul className="mt-6 space-y-3 rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                <li className="flex gap-3"><span className="material-icons-round text-base" style={{ color: C.teal }}>local_shipping</span>Despacho a domicilio con seguimiento. Te avisamos por correo cuando sale tu pedido.</li>
                <li className="flex gap-3"><span className="material-icons-round text-base" style={{ color: C.teal }}>lock</span>Pago seguro con MercadoPago: tarjeta de crédito, débito o saldo.</li>
                <li className="flex gap-3"><span className="material-icons-round text-base" style={{ color: C.teal }}>support_agent</span>¿Dudas sobre el uso? Te orientamos por WhatsApp antes de comprar.</li>
              </ul>

              {descripcion && (
                <section className="mt-8">
                  <h2 className="text-lg font-extrabold text-slate-900">Descripción</h2>
                  <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-700">{descripcion}</p>
                </section>
              )}
              <p className="mt-8 text-xs text-slate-500">
                Este producto no reemplaza una evaluación profesional ni un tratamiento médico. Si tienes una condición de salud, estás embarazada o tomas medicamentos, consulta antes de usarlo.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Barra fija de compra en móvil */}
      {p && !p.agotado && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl border-2 border-slate-200">
              <button aria-label="Quitar uno" onClick={() => setCantidad(c => Math.max(1, c - 1))} className="h-11 w-10 text-xl font-bold text-slate-600">−</button>
              <span className="w-6 text-center font-extrabold">{cantidad}</span>
              <button aria-label="Agregar uno" onClick={() => setCantidad(c => Math.min(MAX_UNIDADES, c + 1))} className="h-11 w-10 text-xl font-bold text-slate-600">+</button>
            </div>
            <button onClick={agregar} className="flex-1 rounded-xl py-3 font-extrabold text-white" style={{ background: C.petroleo }}>
              Agregar · {clp(p.precio * cantidad)}
            </button>
          </div>
        </div>
      )}
    </LayoutTienda>
  );
};

export default TiendaProducto;
