import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { getMetaIds, getUtms, trackShopCheckout } from '../../analytics';
import {
  cargarCatalogo, catalogoEnCache, leerCarrito, cambiarCantidad, clp, MAX_UNIDADES, nuevaClaveCheckout, enVistaPrevia,
  type Catalogo, type ItemCarrito,
} from '../../lib/tienda';
import { LayoutTienda, Skeleton, C } from './LayoutTienda';

const campo = 'w-full rounded-xl border-2 bg-white px-4 py-3 text-base text-slate-900 outline-none transition-colors focus:border-[#0B4F5C]';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Campos = { name: string; email: string; phone: string; region: string; comuna: string; address: string };
type Errores = Partial<Record<keyof Campos | 'terminos', string>>;

/** Validación en el navegador solo para ayudar a la persona: el servidor valida todo de nuevo. */
function validar(f: Campos, acepta: boolean): Errores {
  const e: Errores = {};
  if (f.name.trim().length < 2) e.name = 'Ingresa tu nombre y apellido';
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Revisa tu correo';
  if (f.phone.replace(/\D/g, '').length < 8) e.phone = 'Ingresa un teléfono de contacto';
  if (!f.region) e.region = 'Elige tu región';
  if (!f.comuna) e.comuna = 'Elige tu comuna';
  if (f.address.trim().length < 5) e.address = 'Ingresa calle y número';
  if (!acepta) e.terminos = 'Debes aceptar los términos para comprar';
  return e;
}

const Paso: React.FC<{ n: number; titulo: string; children: React.ReactNode }> = ({ n, titulo, children }) => (
  <section className="rounded-3xl border border-slate-200 bg-white p-5 lg:p-6">
    <h2 className="flex items-center gap-3 text-lg font-extrabold text-slate-900">
      <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm text-white" style={{ background: C.petroleo }}>{n}</span>
      {titulo}
    </h2>
    <div className="mt-4 space-y-4">{children}</div>
  </section>
);

const ErrorCampo: React.FC<{ id: string; texto?: string }> = ({ id, texto }) =>
  texto ? <p id={id} className="mt-1 text-sm font-bold text-red-600">{texto}</p> : null;

const TiendaCheckout: React.FC = () => {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(catalogoEnCache);
  const [items, setItems] = useState<ItemCarrito[]>(leerCarrito);
  const [error, setError] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [cargando, setCargando] = useState(false);
  const [f, setF] = useState<Campos>({ name: '', email: '', phone: '', region: '', comuna: '', address: '' });
  const [acepta, setAcepta] = useState(false);
  const [empresa, setEmpresa] = useState(''); // campo trampa para bots
  const clave = useRef(nuevaClaveCheckout());

  usePageMeta({ title: 'Finalizar compra | Tienda Mas Life', description: 'Completa tus datos de despacho y paga con MercadoPago.', canonicalPath: '/tienda/checkout' });

  useEffect(() => { cargarCatalogo().then(setCatalogo).catch(e => { if (!catalogo) setError(e.message); }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    const act = () => setItems(leerCarrito());
    window.addEventListener('carrito', act);
    return () => window.removeEventListener('carrito', act);
  }, []);

  const porSku = useMemo(() => new Map((catalogo?.productos || []).map(p => [p.sku, p])), [catalogo]);
  const lineas = items.map(i => ({ ...i, p: porSku.get(i.sku) })).filter(l => l.p);
  const region = catalogo?.regiones.find(r => r.codigo === f.region);
  // Montos solo de referencia: el servidor recalcula todo al crear el pedido.
  const subtotal = lineas.reduce((a, l) => a + l.p!.precio * l.cantidad, 0);
  const total = subtotal + (region?.envio ?? 0);
  const hayAgotados = lineas.some(l => l.p!.agotado);
  const sinDespacho = !!catalogo && catalogo.regiones.length === 0;
  const previa = !!catalogo?.preview; // vista previa de Rodrigo: se ve todo, pero no se paga

  const set = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF(prev => ({ ...prev, [k]: e.target.value, ...(k === 'region' ? { comuna: '' } : {}) }));
    if (errores[k]) setErrores(prev => ({ ...prev, [k]: undefined }));
  };
  const borde = (k: keyof Errores) => ({ className: `${campo} ${errores[k] ? 'border-red-400' : 'border-slate-200'}`, 'aria-invalid': !!errores[k], 'aria-describedby': errores[k] ? `err-${k}` : undefined });

  const pagar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cargando || previa || enVistaPrevia()) return;
    setError('');
    const errs = validar(f, acepta);
    setErrores(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`campo-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setCargando(true);
    trackShopCheckout(lineas.map(l => ({ sku: l.sku, cantidad: l.cantidad, precio: l.p!.precio })), total);
    try {
      const r = await fetch('/api/process-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-shop-order', ...f, acceptedTerms: true, empresa, checkoutKey: clave.current,
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
    clave.current = nuevaClaveCheckout(); // un nuevo intento es una solicitud nueva
    setCargando(false);
  };

  return (
    <LayoutTienda fondo={C.crema}>
      <div className="mx-auto max-w-6xl px-4 py-8 lg:py-10">
        <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">Finalizar compra</h1>

        {!catalogo && !error && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6"><Skeleton className="h-96" /><Skeleton className="h-72" /></div>
        )}
        {error && !catalogo && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>}

        {catalogo && lineas.length === 0 && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-10 text-center">
            <span className="material-icons-round text-5xl text-slate-300">shopping_bag</span>
            <p className="mt-2 text-slate-600">Tu carrito está vacío.</p>
            <Link to="/tienda" className="mt-4 inline-block rounded-full px-6 py-3 font-extrabold text-white" style={{ background: C.petroleo }}>Ver productos</Link>
          </div>
        )}

        {catalogo && lineas.length > 0 && (
          <form onSubmit={pagar} noValidate className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-start">
            <div className="space-y-5">
              <Paso n={1} titulo="Tus datos">
                <div>
                  <input id="campo-name" placeholder="Nombre y apellido" autoComplete="name" value={f.name} onChange={set('name')} {...borde('name')} />
                  <ErrorCampo id="err-name" texto={errores.name} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <input id="campo-email" type="email" inputMode="email" placeholder="Correo" autoComplete="email" value={f.email} onChange={set('email')} {...borde('email')} />
                    <ErrorCampo id="err-email" texto={errores.email} />
                  </div>
                  <div>
                    <input id="campo-phone" type="tel" inputMode="tel" placeholder="Teléfono (+56 9 ...)" autoComplete="tel" value={f.phone} onChange={set('phone')} {...borde('phone')} />
                    <ErrorCampo id="err-phone" texto={errores.phone} />
                  </div>
                </div>
                {/* Campo trampa: invisible para personas y lectores de pantalla. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>Empresa<input tabIndex={-1} autoComplete="off" value={empresa} onChange={e => setEmpresa(e.target.value)} /></label>
                </div>
              </Paso>

              <Paso n={2} titulo="Despacho">
                {sinDespacho ? (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Todavía no tenemos despacho habilitado. Escríbenos a maslife@clinicamaslife.cl.</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <select id="campo-region" value={f.region} onChange={set('region')} aria-label="Región" {...borde('region')}>
                        <option value="">Región</option>
                        {catalogo.regiones.map(r => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}
                      </select>
                      <ErrorCampo id="err-region" texto={errores.region} />
                    </div>
                    <div>
                      <select id="campo-comuna" value={f.comuna} onChange={set('comuna')} disabled={!region} aria-label="Comuna o localidad" {...borde('comuna')}>
                        <option value="">Comuna o localidad</option>
                        {(region?.localidades || []).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ErrorCampo id="err-comuna" texto={errores.comuna} />
                    </div>
                  </div>
                )}
                <div>
                  <input id="campo-address" placeholder="Dirección (calle, número, depto.)" autoComplete="street-address" value={f.address} onChange={set('address')} {...borde('address')} />
                  <ErrorCampo id="err-address" texto={errores.address} />
                </div>
              </Paso>

              <Paso n={3} titulo="Pago">
                <p className="text-sm text-slate-600">Al confirmar te llevamos a MercadoPago para pagar con tarjeta de crédito, débito o saldo. Tus datos de pago quedan solo en MercadoPago.</p>
                <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                  {['Visa', 'Mastercard', 'Débito', 'MercadoPago'].map(m => <span key={m} className="rounded-lg border border-slate-200 px-3 py-1.5">{m}</span>)}
                </div>
              </Paso>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-24">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 lg:p-6">
                <h2 className="text-lg font-extrabold text-slate-900">Resumen</h2>
                <div className="mt-3">
                  {lineas.map(l => (
                    <div key={l.sku} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0">
                      <div className="relative h-14 w-14 flex-none overflow-hidden rounded-xl bg-slate-100">
                        {l.p!.imagenes[0] && <img src={l.p!.imagenes[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900">{l.p!.nombre}</p>
                        <p className="text-xs text-slate-500">{clp(l.p!.precio)} c/u{l.p!.agotado ? ' · Agotado' : ''}</p>
                      </div>
                      <select aria-label={`Cantidad de ${l.p!.nombre}`} value={l.cantidad}
                        onChange={e => setItems(cambiarCantidad(l.sku, Number(e.target.value)))}
                        className="rounded-lg border-2 border-slate-200 px-2 py-1 text-sm">
                        {Array.from({ length: MAX_UNIDADES + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'Quitar' : n}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <dl className="mt-3 space-y-2 text-slate-700">
                  <div className="flex justify-between"><dt>Productos</dt><dd>{clp(subtotal)}</dd></div>
                  <div className="flex justify-between"><dt>Envío</dt><dd>{region ? clp(region.envio) : <span className="text-slate-400">Elige tu región</span>}</dd></div>
                  <div className="flex justify-between border-t border-slate-100 pt-3 text-xl font-extrabold text-slate-900"><dt>Total</dt><dd>{clp(total)}</dd></div>
                </dl>

                <label className="mt-5 flex items-start gap-3 text-sm text-slate-600">
                  <input id="campo-terminos" type="checkbox" checked={acepta} onChange={e => { setAcepta(e.target.checked); setErrores(prev => ({ ...prev, terminos: undefined })); }}
                    aria-describedby={errores.terminos ? 'err-terminos' : undefined} className="mt-1 h-4 w-4" style={{ accentColor: C.petroleo }} />
                  <span>Acepto los <Link to="/tienda/terminos" target="_blank" className="font-bold underline" style={{ color: C.petroleo }}>términos de compra, despacho y devoluciones</Link>. Los suplementos y productos de uso personal abiertos no tienen derecho a retracto.</span>
                </label>
                <ErrorCampo id="err-terminos" texto={errores.terminos} />
                {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

                <button type="submit" disabled={cargando || hayAgotados || sinDespacho || previa}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: C.petroleo }}>
                  <span aria-hidden="true" className="material-icons-round text-lg">lock</span>
                  {previa ? 'El pago se activa al abrir la tienda' : cargando ? 'Conectando con MercadoPago…' : hayAgotados ? 'Quita los productos agotados' : `Pagar ${clp(total)}`}
                </button>
                <p className="mt-3 text-center text-xs text-slate-500">Conexión cifrada · El total final se confirma en MercadoPago</p>
              </div>
            </aside>
          </form>
        )}
      </div>
    </LayoutTienda>
  );
};

export default TiendaCheckout;
