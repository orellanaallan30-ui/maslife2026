import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { getMetaIds, getUtms } from '../../analytics';
import {
  cargarCatalogo, leerCarrito, cambiarCantidad, clp, MAX_UNIDADES, type Catalogo, type ItemCarrito,
} from '../../lib/tienda';
import { BarraTienda } from './BarraTienda';

const FONT = { fontFamily: "'Manrope', system-ui, sans-serif" };
const campo = 'w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-[#00a89e]';

const TiendaCheckout: React.FC = () => {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [items, setItems] = useState<ItemCarrito[]>(leerCarrito);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [f, setF] = useState({ name: '', email: '', phone: '', region: '', comuna: '', address: '' });
  const [acepta, setAcepta] = useState(false);

  usePageMeta({ title: 'Carrito | Tienda Mas Life', description: 'Revisa tu carrito y completa tu compra.', canonicalPath: '/tienda/checkout' });

  useEffect(() => { cargarCatalogo().then(setCatalogo).catch(e => setError(e.message)); }, []);

  const porSku = useMemo(() => new Map((catalogo?.productos || []).map(p => [p.sku, p])), [catalogo]);
  const lineas = items.map(i => ({ ...i, p: porSku.get(i.sku) })).filter(l => l.p);
  const region = catalogo?.regiones.find(r => r.codigo === f.region);
  // Montos solo de referencia: el servidor recalcula todo al crear el pedido.
  const subtotal = lineas.reduce((a, l) => a + l.p!.precio * l.cantidad, 0);
  const total = subtotal + (region?.envio ?? 0);
  const hayAgotados = lineas.some(l => l.p!.agotado);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value, ...(k === 'region' ? { comuna: '' } : {}) }));

  const pagar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!acepta) { setError('Debes aceptar los términos para comprar.'); return; }
    setCargando(true);
    try {
      const r = await fetch('/api/process-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-shop-order', ...f, acceptedTerms: true,
          items: lineas.map(l => ({ sku: l.sku, cantidad: l.cantidad })),
          utm: getUtms(), ...getMetaIds(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.init_point) { window.location.href = j.init_point; return; }
      setError(j.error || 'No pudimos iniciar el pago. Intenta de nuevo.');
    } catch (err) {
      console.error('[tienda-checkout] error de red', err);
      setError('No pudimos conectar. Revisa tu internet e intenta de nuevo.');
    }
    setCargando(false);
  };

  return (
    <div className="w-full bg-slate-50" style={FONT}>
      <BarraTienda />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">Tu carrito</h1>
        {!catalogo && !error && <p className="mt-4 text-slate-500">Cargando…</p>}
        {catalogo && lineas.length === 0 && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-600">Tu carrito está vacío.</p>
            <Link to="/tienda" className="mt-4 inline-block rounded-xl bg-[#00a89e] px-6 py-3 font-extrabold text-white">Ver productos</Link>
          </div>
        )}

        {catalogo && lineas.length > 0 && (
          <form onSubmit={pagar} className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-start">
            <div className="space-y-6">
              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                {lineas.map(l => (
                  <div key={l.sku} className="flex items-center gap-4 border-b border-slate-100 py-3 last:border-0">
                    <div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-slate-100">
                      {l.p!.imagenes[0] && <img src={l.p!.imagenes[0]} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900">{l.p!.nombre}</p>
                      <p className="text-sm text-slate-500">{clp(l.p!.precio)} c/u{l.p!.agotado ? ' · Agotado' : ''}</p>
                    </div>
                    <select aria-label={`Cantidad de ${l.p!.nombre}`} value={l.cantidad}
                      onChange={e => setItems(cambiarCantidad(l.sku, Number(e.target.value)))}
                      className="rounded-xl border-2 border-slate-200 px-2 py-2">
                      {Array.from({ length: MAX_UNIDADES + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'Quitar' : n}</option>)}
                    </select>
                  </div>
                ))}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                <h2 className="text-lg font-extrabold text-slate-900">Datos de despacho</h2>
                <input className={campo} placeholder="Nombre y apellido" autoComplete="name" required value={f.name} onChange={set('name')} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <input className={campo} type="email" placeholder="Correo" autoComplete="email" required value={f.email} onChange={set('email')} />
                  <input className={campo} type="tel" placeholder="Teléfono (+56 9 ...)" autoComplete="tel" required value={f.phone} onChange={set('phone')} />
                </div>
                {catalogo.regiones.length === 0 ? (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Todavía no tenemos despacho habilitado. Escríbenos a maslife@clinicamaslife.cl.</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <select className={campo} required value={f.region} onChange={set('region')} aria-label="Región">
                      <option value="">Región</option>
                      {catalogo.regiones.map(r => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}
                    </select>
                    <select className={campo} required value={f.comuna} onChange={set('comuna')} disabled={!region} aria-label="Comuna o localidad">
                      <option value="">Comuna o localidad</option>
                      {(region?.localidades || []).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <input className={campo} placeholder="Dirección (calle, número, depto.)" autoComplete="street-address" required value={f.address} onChange={set('address')} />
              </section>
            </div>

            <aside className="rounded-3xl border border-slate-200 bg-white p-5 lg:sticky lg:top-20">
              <h2 className="text-lg font-extrabold text-slate-900">Resumen</h2>
              <dl className="mt-4 space-y-2 text-slate-700">
                <div className="flex justify-between"><dt>Productos</dt><dd>{clp(subtotal)}</dd></div>
                <div className="flex justify-between"><dt>Envío</dt><dd>{region ? clp(region.envio) : 'Elige tu región'}</dd></div>
                <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-extrabold text-slate-900"><dt>Total</dt><dd>{clp(total)}</dd></div>
              </dl>
              <label className="mt-5 flex items-start gap-3 text-sm text-slate-600">
                <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} className="mt-1 h-4 w-4 accent-[#00a89e]" />
                <span>Acepto los <Link to="/terminos" target="_blank" className="font-bold text-[#00a89e] underline">términos y condiciones</Link> de compra y despacho.</span>
              </label>
              {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
              <button type="submit" disabled={cargando || hayAgotados || catalogo.regiones.length === 0}
                className="mt-5 w-full rounded-xl bg-[#00a89e] px-6 py-4 text-base font-extrabold text-white disabled:opacity-60">
                {cargando ? 'Conectando con MercadoPago…' : hayAgotados ? 'Quita los productos agotados' : 'Pagar con MercadoPago'}
              </button>
              <p className="mt-3 text-xs text-slate-500">El total final se confirma en MercadoPago. Pago seguro; no guardamos datos de tu tarjeta.</p>
            </aside>
          </form>
        )}
        {error && !catalogo && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>}
      </div>
    </div>
  );
};

export default TiendaCheckout;
