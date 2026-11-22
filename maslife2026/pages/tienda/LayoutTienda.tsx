import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useContenidoTienda, useEscucharEditor } from './useContenido';
import {
  leerCarrito, cambiarCantidad, cargarCatalogo, catalogoEnCache, clp, MAX_UNIDADES, enVistaPrevia, salirDeVistaPrevia,
  CATEGORIAS, type Catalogo, type ItemCarrito,
} from '../../lib/tienda';

// Identidad de la clínica (la misma de la guía digital).
// Los colores y fuentes salen de variables CSS que fija el layout con el diseño que
// Rodrigo eligió en el editor del panel (Apariencia). Los valores de respaldo son
// la identidad Mas Life.
export const C = {
  petroleo: 'var(--t-primario, #0B4F5C)',
  petroleoClaro: 'color-mix(in srgb, var(--t-primario, #0B4F5C) 80%, white)',
  petroleoOscuro: 'color-mix(in srgb, var(--t-primario, #0B4F5C) 80%, black)',
  teal: '#00a89e',
  naranja: 'var(--t-acento, #E8731C)',
  menta: 'var(--t-suave, #E6F2F1)',
  mentaClara: 'color-mix(in srgb, var(--t-suave, #E6F2F1) 50%, white)',
  crema: '#F7F4EF', tinta: '#0F172A',
};
export const SANS = { fontFamily: "var(--t-texto, 'Manrope'), system-ui, sans-serif" };
export const SERIF = { fontFamily: "var(--t-titulos, 'Fraunces'), Georgia, serif" };

// Ajustes globales del diseño, limitados a la tienda (bordes, márgenes y ancho).
const ESTILOS_TEMA = `
.tienda-raiz[data-radio=suave] .rounded-3xl { border-radius: 1rem; }
.tienda-raiz[data-radio=recto] .rounded-3xl, .tienda-raiz[data-radio=recto] .rounded-2xl { border-radius: .375rem; }
.tienda-raiz[data-radio=recto] .rounded-full:not(.material-icons-round) { border-radius: .5rem; }
.tienda-raiz[data-espaciado=compacto] .t-sec { padding-top: 1.75rem; }
.tienda-raiz[data-espaciado=amplio] .t-sec { padding-top: 5rem; }
.tienda-raiz[data-ancho=amplio] .max-w-6xl { max-width: 80rem; }
`;
const FUENTES_CARGADAS = new Set(['Fraunces', 'Manrope', 'Inter']); // ya vienen en index.html

/** Carga desde Google Fonts las fuentes elegidas que aún no están en la página. */
function cargarFuentes(fuentes: string[]) {
  const faltan = fuentes.filter(f => f && !FUENTES_CARGADAS.has(f));
  if (!faltan.length) return;
  try {
    const href = `https://fonts.googleapis.com/css2?${faltan.map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700;800`).join('&')}&display=swap`;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    document.head.appendChild(link);
    faltan.forEach(f => FUENTES_CARGADAS.add(f));
  } catch { /* sin document */ }
}

const WHATSAPP = 'https://wa.me/56965329974';
const REDES = [
  { nombre: 'Instagram', href: 'https://www.instagram.com/clinicamaslife/' },
  { nombre: 'Facebook', href: 'https://www.facebook.com/106841074135065' },
  { nombre: 'WhatsApp', href: WHATSAPP },
];

/** Logotipo en texto: evita cargar el PNG del logo (2 MB) en cada visita a la tienda. */
const Logotipo: React.FC<{ claro?: boolean }> = ({ claro = false }) => {
  const { marca } = useContenidoTienda();
  if (marca.logoUrl) {
    return (
      <Link to="/tienda" className="flex items-center gap-2" aria-label="Tienda Mas Life, inicio">
        <img src={marca.logoUrl} alt="Mas Life" style={{ height: marca.logoAltura, width: 'auto', maxWidth: 200 }} className="object-contain" />
        {marca.mostrarNombre && <span className={`text-[10px] font-extrabold uppercase tracking-[0.18em] ${claro ? 'text-white/60' : 'text-slate-500'}`}>Tienda</span>}
      </Link>
    );
  }
  return (
  <Link to="/tienda" className="flex items-center gap-2" aria-label="Tienda Mas Life, inicio">
    <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: claro ? '#fff' : C.petroleo }}>
      <span className="h-3.5 w-3.5 rounded-full" style={{ background: C.naranja }} />
    </span>
    <span className="leading-none">
      <span className="block text-xl font-semibold" style={{ ...SERIF, color: claro ? '#fff' : C.petroleo }}>Mas Life</span>
      <span className={`block text-[10px] font-extrabold uppercase tracking-[0.18em] ${claro ? 'text-white/60' : 'text-slate-500'}`}>Tienda</span>
    </span>
  </Link>
  );
};

/** Buscador y selector de categorías: llevan a /tienda?q=… o /tienda?cat=…, donde se filtra. */
const Buscador: React.FC<{ className?: string }> = ({ className = '' }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  useEffect(() => { setQ(params.get('q') || ''); }, [params]);
  return (
    <form role="search" className={`flex min-w-0 items-center gap-2 ${className}`}
      onSubmit={e => { e.preventDefault(); navigate(q.trim() ? `/tienda?q=${encodeURIComponent(q.trim())}` : '/tienda'); }}>
      <select aria-label="Categorías" value={params.get('cat') || ''}
        onChange={e => navigate(e.target.value ? `/tienda?cat=${e.target.value}` : '/tienda')}
        className="hidden lg:block appearance-none rounded-full border-0 bg-white py-2.5 pl-4 pr-9 text-sm font-bold text-slate-700 outline-none" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%230B4F5C' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}>
        <option value="">Todas las categorías</option>
        {Object.entries(CATEGORIAS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2.5 focus-within:bg-white/20">
        <span aria-hidden="true" className="material-icons-round text-lg text-white/80">search</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar productos…" aria-label="Buscar productos"
          className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm text-white shadow-none outline-none ring-0 placeholder:text-white/70 focus:border-0 focus:outline-none focus:ring-0" />
      </label>
    </form>
  );
};

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
              className="mt-4 w-full rounded-full px-6 py-4 text-base font-extrabold text-white" style={{ background: C.petroleo }}>
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
  useEscucharEditor();
  const { tema } = useContenidoTienda();
  useEffect(() => { cargarFuentes([tema.fuenteTitulos, tema.fuenteTexto]); }, [tema.fuenteTitulos, tema.fuenteTexto]);
  const variables = {
    '--t-primario': tema.colorPrimario, '--t-acento': tema.colorAcento, '--t-suave': tema.colorSuave,
    '--t-titulos': `'${tema.fuenteTitulos}'`, '--t-texto': `'${tema.fuenteTexto}'`,
  } as React.CSSProperties;

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
    <div className="tienda-raiz flex min-h-full w-full flex-col" data-radio={tema.radio} data-espaciado={tema.espaciado} data-ancho={tema.ancho}
      style={{ ...variables, ...SANS, background: fondo, color: C.tinta }}>
      <style>{ESTILOS_TEMA}</style>
      {enVistaPrevia() && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-400 px-4 py-2 text-center text-sm font-extrabold text-amber-950" role="status">
          <span>Vista previa: solo tú ves esto. La tienda está cerrada al público.</span>
          <span className="flex gap-3">
            <Link to="/admin/management" className="underline">Volver al panel</Link>
            <button onClick={() => { salirDeVistaPrevia(); window.location.assign('/tienda'); }} className="underline">Salir de la vista previa</button>
          </span>
        </div>
      )}
      <div className="px-4 py-2 text-center text-xs font-bold" style={{ background: C.menta, color: C.petroleo }}>
        Despacho a domicilio en Chile · Pago seguro con MercadoPago
      </div>

      <header className="sticky top-0 z-30 px-2 pt-2 lg:px-4" style={{ background: fondo }}>
        <div className="mx-auto max-w-6xl">
          {/* Bloque petróleo con el logo "recortado" en una pestaña clara, como en la referencia. */}
          <div className="flex items-stretch">
            <div className="flex items-center rounded-tl-3xl bg-white pr-6 pl-4 lg:pr-10" style={{ borderTopRightRadius: '1.5rem' }}>
              <Logotipo />
            </div>
            <div className="flex flex-1 items-center gap-3 rounded-t-3xl px-3 py-3 lg:px-5" style={{ background: C.petroleo, borderTopLeftRadius: '1.5rem' }}>
              <Buscador className="hidden lg:flex flex-1" />
              <button onClick={() => setAbierto(true)} aria-label={`Abrir carrito, ${unidades} productos`}
                className="relative ml-auto flex items-center gap-2 rounded-full bg-white px-4 py-2.5 font-bold" style={{ color: C.petroleo }}>
                <span aria-hidden="true" className="material-icons-round text-xl">shopping_bag</span>
                <span className="hidden sm:inline text-sm">Carrito</span>
                {unidades > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-black text-white" style={{ background: C.naranja }}>{unidades}</span>
                )}
              </button>
            </div>
          </div>
          <div className="rounded-b-3xl px-3 pb-3 lg:hidden" style={{ background: C.petroleo }}>
            <Buscador />
          </div>
          <div className="hidden lg:block h-3 rounded-b-3xl" style={{ background: C.petroleo }} />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto px-2 pb-2 lg:px-4 lg:pb-4">
        <div className="mx-auto max-w-6xl rounded-3xl px-6 py-10 text-sm text-white/80 lg:px-10" style={{ background: C.petroleo }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div>
              <Logotipo claro />
              <p className="mt-4 max-w-xs text-white/80">Bienestar para todos los días, con despacho a tu casa.</p>
            </div>
            <div>
              <p className="font-extrabold text-white">Ayuda</p>
              <ul className="mt-3 space-y-2">
                <li><Link to="/tienda/terminos" className="hover:underline">Términos, despacho y devoluciones</Link></li>
                <li><Link to="/privacidad" className="hover:underline">Privacidad</Link></li>
                <li><a href="mailto:maslife@clinicamaslife.cl" className="hover:underline">maslife@clinicamaslife.cl</a></li>
              </ul>
            </div>
            <div>
              <p className="font-extrabold text-white">¿Dudas antes de comprar?</p>
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-bold" style={{ color: C.petroleo }}>
                <span aria-hidden="true" className="material-icons-round text-base">chat</span> Escríbenos por WhatsApp
              </a>
              <ul className="mt-4 flex flex-wrap gap-4">
                {REDES.map(r => <li key={r.nombre}><a href={r.href} target="_blank" rel="noopener noreferrer" className="hover:underline">{r.nombre}</a></li>)}
              </ul>
            </div>
          </div>
          <p className="mt-10 border-t border-white/15 pt-6 text-xs text-white/60">© {new Date().getFullYear()} Clínica Mas Life · Todos los derechos reservados.</p>
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
