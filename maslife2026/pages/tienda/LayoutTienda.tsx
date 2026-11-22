import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  leerCarrito, cambiarCantidad, cargarCatalogo, catalogoEnCache, clp, MAX_UNIDADES,
  type Catalogo, type ItemCarrito,
} from '../../lib/tienda';

// Identidad de la clínica (la misma de la guía digital).
export const C = {
  petroleo: '#0B4F5C', petroleoClaro: '#0E6B6F', teal: '#00a89e', naranja: '#E8731C',
  crema: '#F7F4EF', tinta: '#0F172A',
};
export const SANS = { fontFamily: "'Manrope', system-ui, sans-serif" };
export const SERIF = { fontFamily: "'Fraunces', Georgia, serif" };

const WHATSAPP = 'https://wa.me/56965329974';

/** Logotipo en texto: evita cargar el PNG del logo (2 MB) en cada visita a la tienda. */
const Logotipo: React.FC = () => (
  <Link to="/tienda" className="flex items-center gap-2" aria-label="Tienda Mas Life, inicio">
    <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: C.petroleo }}>
      <span className="h-3.5 w-3.5 rounded-full" style={{ background: C.naranja }} />
    </span>
    <span className="leading-none">
      <span className="block text-lg font-semibold" style={{ ...SERIF, color: C.petroleo }}>Mas Life</span>
      <span className="block text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Tienda</span>
    </span>
  </Link>
);

const useUnidades = () => {
  const contar = () => leerCarrito().reduce((a, i) => a + i.cantidad, 0);
  const [n, setN] = useState(contar);
  useEffect(() => {
    const act = () => setN(contar());
    window.addEventListener('carrito', act);
    window.addEventListener('storage', act);
    return () => { window.removeEventListener('carrito', act); window.removeEventListener('storage', act); };
  }, []);
  return n;
};

/** Carrito lateral: se abre al agregar un producto, sin salir de la página. */
const CarritoLateral: React.FC<{ abierto: boolean; cerrar: () => void }> = ({ abierto, cerrar }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ItemCarrito[]>(leerCarrito);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(catalogoEnCache);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const act = () => setItems(leerCarrito());
    window.addEventListener('carrito', act);
    return () => window.removeEventListener('carrito', act);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    setItems(leerCarrito());
    cargarCatalogo().then(setCatalogo).catch(() => { /* se muestra lo que haya en caché */ });
    panel.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [abierto, cerrar]);

  const porSku = new Map((catalogo?.productos || []).map(p => [p.sku, p]));
  const lineas = items.map(i => ({ ...i, p: porSku.get(i.sku) })).filter(l => l.p);
  const subtotal = lineas.reduce((a, l) => a + l.p!.precio * l.cantidad, 0);

  return (
    // Cerrado queda invisible (no solo fuera de pantalla): sin sombra en el borde y fuera del orden de tabulación.
    <div className={`fixed inset-0 z-50 overflow-hidden transition-[visibility] duration-200 ${abierto ? 'visible' : 'invisible pointer-events-none'}`} aria-hidden={!abierto}>
      <div onClick={cerrar} className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${abierto ? 'opacity-100' : 'opacity-0'}`} />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Tu carrito"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white outline-none transition-transform duration-200 ${abierto ? 'translate-x-0 shadow-2xl' : 'translate-x-full'}`}
        style={SANS}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <p className="text-lg font-extrabold text-slate-900">Tu carrito</p>
          <button onClick={cerrar} aria-label="Cerrar carrito" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <span aria-hidden="true" className="material-icons-round">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          {lineas.length === 0 && (
            <div className="py-16 text-center">
              <span className="material-icons-round text-5xl text-slate-300">shopping_bag</span>
              <p className="mt-2 text-slate-500">Tu carrito está vacío.</p>
            </div>
          )}
          {lineas.map(l => (
            <div key={l.sku} className="flex gap-3 border-b border-slate-100 py-4 last:border-0">
              <div className="h-20 w-20 flex-none overflow-hidden rounded-xl bg-slate-100">
                {l.p!.imagenes[0] && <img src={l.p!.imagenes[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{l.p!.nombre}</p>
                <p className="text-sm text-slate-500">{clp(l.p!.precio)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-full border border-slate-200">
                    <button aria-label="Quitar uno" onClick={() => setItems(cambiarCantidad(l.sku, l.cantidad - 1))} className="h-8 w-8 text-lg font-bold text-slate-600">−</button>
                    <span className="w-6 text-center text-sm font-bold" aria-live="polite">{l.cantidad}</span>
                    <button aria-label="Agregar uno" disabled={l.cantidad >= MAX_UNIDADES} onClick={() => setItems(cambiarCantidad(l.sku, l.cantidad + 1))} className="h-8 w-8 text-lg font-bold text-slate-600 disabled:opacity-30">+</button>
                  </div>
                  <button onClick={() => setItems(cambiarCantidad(l.sku, 0))} className="text-xs font-bold text-slate-400 underline">Quitar</button>
                </div>
              </div>
              <p className="text-sm font-extrabold text-slate-900">{clp(l.p!.precio * l.cantidad)}</p>
            </div>
          ))}
        </div>
        {lineas.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-4">
            <div className="flex justify-between text-base"><span className="text-slate-600">Subtotal</span><span className="font-extrabold text-slate-900">{clp(subtotal)}</span></div>
            <p className="mt-1 text-xs text-slate-500">El envío se calcula según tu región en el siguiente paso.</p>
            <button onClick={() => { cerrar(); navigate('/tienda/checkout'); }}
              className="mt-4 w-full rounded-xl px-6 py-4 text-base font-extrabold text-white" style={{ background: C.petroleo }}>
              Ir a pagar
            </button>
            <button onClick={cerrar} className="mt-2 w-full py-2 text-sm font-bold text-slate-500">Seguir comprando</button>
          </div>
        )}
      </div>
    </div>
  );
};

/** Estructura común de la tienda: cabecera, carrito lateral y pie. */
export const LayoutTienda: React.FC<{ children: React.ReactNode; fondo?: string }> = ({ children, fondo = '#fff' }) => {
  const unidades = useUnidades();
  const [abierto, setAbierto] = useState(false);
  const { pathname } = useLocation();

  // Cada página de la tienda parte arriba (al abrir un producto desde la lista, por ejemplo).
  useEffect(() => {
    try { window.scrollTo(0, 0); document.querySelector('main')?.closest('[class*="overflow-y-auto"]')?.scrollTo(0, 0); } catch { /* */ }
  }, [pathname]);
  const cerrar = React.useCallback(() => setAbierto(false), []);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener('abrir-carrito', abrir);
    return () => window.removeEventListener('abrir-carrito', abrir);
  }, []);

  return (
    <div className="flex min-h-full w-full flex-col" style={{ ...SANS, background: fondo, color: C.tinta }}>
      <div className="px-4 py-2 text-center text-xs font-bold text-white" style={{ background: C.petroleo }}>
        Despacho a domicilio en Chile · Pago seguro con MercadoPago
      </div>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logotipo />
          <nav className="flex items-center gap-2">
            <Link to="/" className="hidden lg:inline-block rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Agenda tu hora</Link>
            <button onClick={() => setAbierto(true)} aria-label={`Abrir carrito, ${unidades} productos`}
              className="relative flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 font-bold text-slate-700 hover:border-slate-300">
              <span aria-hidden="true" className="material-icons-round text-xl">shopping_bag</span>
              <span className="hidden sm:inline text-sm">Carrito</span>
              {unidades > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-black text-white" style={{ background: C.naranja }}>{unidades}</span>
              )}
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-3 gap-6 px-4 py-10 text-sm text-slate-600">
          <div>
            <Logotipo />
            <p className="mt-3 max-w-xs">Productos de salud, rehabilitación y bienestar seleccionados por el equipo de Clínica Mas Life.</p>
          </div>
          <div>
            <p className="font-extrabold text-slate-900">Ayuda</p>
            <ul className="mt-2 space-y-1">
              <li><Link to="/tienda/terminos" className="hover:underline">Términos, despacho y devoluciones</Link></li>
              <li><Link to="/privacidad" className="hover:underline">Privacidad</Link></li>
              <li><a href="mailto:maslife@clinicamaslife.cl" className="hover:underline">maslife@clinicamaslife.cl</a></li>
            </ul>
          </div>
          <div>
            <p className="font-extrabold text-slate-900">¿Dudas antes de comprar?</p>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 font-bold text-slate-700 hover:border-slate-300">
              <span className="material-icons-round text-base" style={{ color: C.teal }}>chat</span> Escríbenos por WhatsApp
            </a>
            <p className="mt-3 text-xs text-slate-400">Los productos no reemplazan una evaluación profesional.</p>
          </div>
        </div>
      </footer>

      <CarritoLateral abierto={abierto} cerrar={cerrar} />
    </div>
  );
};

/** Bloque gris animado mientras carga (en vez de "Cargando…"). */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} />
);
