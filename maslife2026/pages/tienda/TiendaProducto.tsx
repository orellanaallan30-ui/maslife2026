import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { cargarProducto, agregarAlCarrito, clp, CATEGORIAS, MAX_UNIDADES, type ProductoTienda } from '../../lib/tienda';
import { BarraTienda } from './BarraTienda';

const FONT = { fontFamily: "'Manrope', system-ui, sans-serif" };

const TiendaProducto: React.FC = () => {
  const { sku = '' } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState<ProductoTienda | null>(null);
  const [error, setError] = useState('');
  const [foto, setFoto] = useState(0);
  const [cantidad, setCantidad] = useState(1);

  usePageMeta({
    title: p ? `${p.nombre} | Tienda Mas Life` : 'Tienda | Clínica Mas Life',
    description: p ? p.descripcion.replace(/<[^>]+>/g, '').slice(0, 155) : 'Producto de la tienda Mas Life.',
    canonicalPath: `/tienda/${sku}`,
  });

  useEffect(() => {
    cargarProducto(sku).then(r => setP(r.producto)).catch(e => setError(e.message));
  }, [sku]);

  // La descripción de Dropi puede traer HTML: se muestra como texto plano.
  const descripcion = (p?.descripcion || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

  return (
    <div className="w-full bg-white" style={FONT}>
      <BarraTienda />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link to="/tienda" className="text-sm font-bold text-[#00a89e]">← Volver a la tienda</Link>
        {error && <p className="mt-6 rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>}
        {!p && !error && <p className="mt-6 text-slate-500">Cargando…</p>}
        {p && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div>
              <div className="aspect-square overflow-hidden rounded-3xl bg-slate-100">
                {p.imagenes[foto]
                  ? <img src={p.imagenes[foto]} alt={p.nombre} className="h-full w-full object-cover" />
                  : <span className="flex h-full items-center justify-center material-icons-round text-6xl text-slate-300">inventory_2</span>}
              </div>
              {p.imagenes.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {p.imagenes.map((src, i) => (
                    <button key={src} onClick={() => setFoto(i)} aria-label={`Foto ${i + 1}`}
                      className={`h-16 w-16 flex-none overflow-hidden rounded-xl border-2 ${i === foto ? 'border-[#00a89e]' : 'border-transparent'}`}>
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-widest text-[#00a89e]">{CATEGORIAS[p.categoria]}</span>
              <h1 className="mt-1 text-2xl lg:text-3xl font-extrabold text-slate-900">{p.nombre}</h1>
              <p className="mt-4 text-3xl font-extrabold text-slate-900">{clp(p.precio)}</p>
              <p className="mt-1 text-sm text-slate-500">Envío según tu región, se calcula en el checkout.</p>

              {!p.agotado ? (
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center gap-2 font-bold text-slate-700">
                    Cantidad
                    <select value={cantidad} onChange={e => setCantidad(Number(e.target.value))}
                      className="rounded-xl border-2 border-slate-200 px-3 py-2">
                      {Array.from({ length: MAX_UNIDADES }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <button onClick={() => { agregarAlCarrito(p.sku, cantidad); navigate('/tienda/checkout'); }}
                    className="flex-1 rounded-xl bg-[#00a89e] px-6 py-3 font-extrabold text-white">
                    Agregar y comprar
                  </button>
                </div>
              ) : (
                <p className="mt-6 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-600">Agotado por ahora</p>
              )}

              {descripcion && <p className="mt-8 whitespace-pre-line text-slate-700 leading-relaxed">{descripcion}</p>}
              <p className="mt-8 text-xs text-slate-500">
                Este producto no reemplaza una evaluación profesional. Si tienes dudas sobre su uso, consulta con tu kinesiólogo o médico.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TiendaProducto;
