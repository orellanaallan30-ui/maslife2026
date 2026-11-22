import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { trackShopAddToCart } from '../../analytics';
import {
  cargarCatalogo, catalogoEnCache, agregarAlCarrito, abrirCarrito, clp, CATEGORIAS, enVistaPrevia,
  type Catalogo, type ProductoTienda,
} from '../../lib/tienda';
import { LayoutTienda, Skeleton, C, SERIF } from './LayoutTienda';
import { useContenidoTienda } from './useContenido';

type Categoria = ProductoTienda['categoria'];
const SUBTITULO: Record<Categoria, string> = {
  suplementos: 'Tu rutina diaria', rehabilitacion: 'Movimiento y apoyo', salud: 'Cuidado en casa', bienestar: 'Para sentirte bien',
};
const ICONO: Record<Categoria, string> = { suplementos: 'medication', rehabilitacion: 'accessibility_new', salud: 'favorite', bienestar: 'spa' };

const BENEFICIOS = [
  { icono: 'lock', titulo: 'Pago seguro', texto: 'Pagas con MercadoPago. No guardamos los datos de tu tarjeta.' },
  { icono: 'local_shipping', titulo: 'Despacho con seguimiento', texto: 'Te enviamos por correo el número de seguimiento.' },
  { icono: 'verified', titulo: 'Registro sanitario visible', texto: 'En cada suplemento verás su registro antes de comprar.' },
];

// Respuestas basadas en los términos de la tienda (/tienda/terminos).
const PREGUNTAS = [
  { p: '¿Cuánto demora el despacho?', r: 'Depende de tu comuna y de la empresa de transporte. Cuando tu pedido sale, te enviamos por correo el número de seguimiento para que veas cuándo llega.' },
  { p: '¿Qué pasa si un producto se agota después de pagar?', r: 'Te contactamos para ofrecerte una alternativa o la devolución total de tu dinero.' },
  { p: '¿Necesito receta?', r: 'No. En esta tienda no vendemos medicamentos: solo suplementos y productos de salud y bienestar de venta libre.' },
  { p: '¿Puedo cambiar o devolver un producto?', r: 'Tienes 10 días desde que lo recibes para retractarte, con el producto sin uso y sellado. Los suplementos y productos de uso personal abiertos no tienen retracto por higiene. Si viene con falla, aplica la garantía legal.' },
  { p: '¿Cómo puedo pagar?', r: 'Con tarjeta de crédito, débito o saldo de MercadoPago. El pago se confirma en el momento.' },
];

const Tarjeta: React.FC<{ p: ProductoTienda; prioridad: boolean }> = ({ p, prioridad }) => {
  const [agregado, setAgregado] = useState(false);
  const agregar = () => {
    agregarAlCarrito(p.sku);
    if (!enVistaPrevia()) trackShopAddToCart({ sku: p.sku, cantidad: 1, precio: p.precio });
    setAgregado(true);
    abrirCarrito();
    setTimeout(() => setAgregado(false), 1500);
  };
  return (
    <article className="group flex flex-col">
      <Link to={`/tienda/${p.sku}`} className="relative block aspect-square overflow-hidden rounded-3xl" style={{ background: C.mentaClara }}>
        {p.imagenes[0]
          ? <img src={p.imagenes[0]} alt={p.nombre} loading={prioridad ? 'eager' : 'lazy'} decoding="async" width={600} height={600}
              className="h-full w-full object-contain p-6 transition-transform duration-300 group-hover:scale-105" />
          : <span className="flex h-full items-center justify-center material-icons-round text-5xl text-slate-300">inventory_2</span>}
        {p.agotado && <span className="absolute right-3 top-3 rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-extrabold text-white">Agotado</span>}
      </Link>
      <div className="flex flex-1 flex-col px-1 pt-3">
        <span className="text-xs font-bold text-slate-500">{CATEGORIAS[p.categoria]}</span>
        <Link to={`/tienda/${p.sku}`} className="mt-1 font-bold leading-snug text-slate-900 hover:underline">{p.nombre}</Link>
        <p className="mt-auto pt-2 text-xl font-extrabold" style={{ color: C.teal }}>{clp(p.precio)}</p>
        <button disabled={p.agotado} onClick={agregar}
          className="mt-3 w-fit rounded-full border-2 px-5 py-2 text-sm font-bold transition-colors disabled:border-slate-200 disabled:text-slate-400"
          style={p.agotado ? undefined : { borderColor: C.petroleo, color: C.petroleo }}>
          {p.agotado ? 'Agotado' : agregado ? 'Agregado ✓' : 'Agregar al carrito'}
        </button>
      </div>
    </article>
  );
};

/** Composición del banner con las fotos de los productos (o una ilustración si no hay). */
const Composicion: React.FC<{ fotos: string[] }> = ({ fotos }) => (
  <div className="relative h-72 overflow-hidden rounded-3xl lg:h-full lg:min-h-[340px]" style={{ background: C.menta }}>
    <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full" style={{ background: '#fff', opacity: 0.6 }} />
    <div className="absolute -bottom-12 -left-12 h-56 w-56 rounded-full" style={{ background: C.naranja, opacity: 0.12 }} />
    {fotos.length === 0 ? (
      <span className="absolute inset-0 flex items-center justify-center material-icons-round text-8xl" style={{ color: C.petroleo, opacity: 0.25 }}>spa</span>
    ) : (
      <div className="absolute inset-0 flex items-end justify-center gap-2 px-6 pb-6">
        {fotos.slice(0, 3).map((src, i) => (
          <img key={src} src={src} alt="" decoding="async"
            className={`min-w-0 rounded-2xl bg-white object-contain p-3 shadow-xl shadow-slate-900/10 ${i === 1 ? 'z-10 h-52 w-[38%] lg:h-64' : 'h-36 w-[28%] lg:h-44'}`} />
        ))}
      </div>
    )}
  </div>
);

const Tienda: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [catalogo, setCatalogo] = useState<Catalogo | null>(catalogoEnCache);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<number | null>(0);
  const txt = useContenidoTienda(); // diseño guardado o borrador en vivo del editor
  const filtro = (params.get('cat') || '') as Categoria | '';
  const busqueda = (params.get('q') || '').trim();

  usePageMeta({
    title: 'Tienda de salud y bienestar | Clínica Mas Life',
    description: 'Suplementos y productos de salud y bienestar con pago seguro y despacho a domicilio en todo Chile.',
    canonicalPath: '/tienda',
  });

  useEffect(() => { cargarCatalogo().then(setCatalogo).catch(e => { if (!catalogo) setError(e.message); }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const todos = catalogo?.productos || [];
  const categorias = useMemo(() => (Object.keys(CATEGORIAS) as Categoria[]).filter(c => todos.some(p => p.categoria === c)), [todos]);
  const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const productos = todos
    .filter(p => !filtro || p.categoria === filtro)
    .filter(p => !busqueda || normal(`${p.nombre} ${CATEGORIAS[p.categoria]}`).includes(normal(busqueda)));
  const fotosBanner = todos.filter(p => !p.agotado && p.imagenes[0]).map(p => p.imagenes[0]);
  // Con pocos productos se repiten los del banner principal antes que mostrar uno solo.
  const fotosSecundario = fotosBanner.length >= 5 ? fotosBanner.slice(3, 6) : fotosBanner.slice(0, 3);
  const elegirCategoria = (c: Categoria | '') => { setParams(c ? { cat: c } : {}); document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <LayoutTienda>
      {/* 1. Banner principal */}
      <section className="px-2 pt-3 lg:px-4">
        <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-2 gap-6 rounded-3xl p-6 lg:p-10" style={{ background: C.petroleo }}>
          <div className="flex flex-col justify-center text-white">
            <h1 className="text-4xl lg:text-6xl leading-[1.05]" style={{ ...SERIF, fontWeight: 400 }}>
              {txt.banner.titulo} <em style={{ color: '#FFB27A' }}>{txt.banner.destacado}</em>
            </h1>
            <p className="mt-5 max-w-md text-base text-white/85">{txt.banner.bajada}</p>
            <a href="#productos" className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3 font-bold" style={{ color: C.petroleo }}>
              {txt.banner.boton} <span aria-hidden="true" className="material-icons-round text-lg">arrow_forward</span>
            </a>
          </div>
          {txt.imagenes.banner
            ? <div className="h-72 overflow-hidden rounded-3xl lg:h-full lg:min-h-[340px]"><img src={txt.imagenes.banner} alt="" className="h-full w-full object-cover" /></div>
            : <Composicion fotos={fotosBanner} />}
        </div>
      </section>

      {/* 2. Categorías */}
      {txt.secciones.categorias && catalogo?.activa && categorias.length > 0 && (
        <section className="t-sec px-4 pt-12">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-6 lg:gap-14">
            {categorias.map(c => {
              const foto = todos.find(p => p.categoria === c && p.imagenes[0])?.imagenes[0];
              const activa = filtro === c;
              return (
                <button key={c} onClick={() => elegirCategoria(activa ? '' : c)} aria-pressed={activa} className="group flex w-32 flex-col items-center text-center lg:w-40">
                  <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full ring-2 transition-transform group-hover:scale-105 lg:h-32 lg:w-32"
                    style={{ background: C.menta, ['--tw-ring-color' as any]: activa ? C.petroleo : 'transparent' }}>
                    {foto ? <img src={foto} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-3" />
                      : <span aria-hidden="true" className="material-icons-round text-4xl" style={{ color: C.petroleo }}>{ICONO[c]}</span>}
                  </span>
                  <span className="mt-3 font-extrabold" style={{ color: C.petroleo }}>{CATEGORIAS[c]}</span>
                  <span className="text-sm italic text-slate-500" style={SERIF}>{SUBTITULO[c]}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Productos */}
      <section id="productos" className="t-sec scroll-mt-28 px-4 pt-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-3xl font-extrabold" style={{ color: C.petroleo }}>
              {busqueda ? `Resultados para “${busqueda}”` : filtro ? CATEGORIAS[filtro] : 'Nuestros productos'}
            </h2>
            {(filtro || busqueda) && <Link to="/tienda" className="text-sm font-bold underline" style={{ color: C.petroleo }}>Ver todos</Link>}
          </div>

          {error && <p className="mt-6 rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>}
          {catalogo && !catalogo.activa && (
            <div className="mt-6 rounded-3xl p-10 text-center" style={{ background: C.mentaClara }}>
              <p className="text-2xl" style={SERIF}>Muy pronto</p>
              <p className="mt-2 text-slate-600">Estamos preparando la tienda. Vuelve en unos días.</p>
            </div>
          )}
          {catalogo?.activa && productos.length === 0 && <p className="mt-6 text-slate-500">No encontramos productos{busqueda ? ` para “${busqueda}”` : ' en esta categoría'}.</p>}

          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-8 lg:gap-x-6">
            {!catalogo && !error && Array.from({ length: 4 }, (_, i) => (
              <div key={i}><Skeleton className="aspect-square rounded-3xl" /><Skeleton className="mt-3 h-3 w-20" /><Skeleton className="mt-2 h-5 w-3/4" /><Skeleton className="mt-3 h-9 w-32 rounded-full" /></div>
            ))}
            {productos.map((p, i) => <Tarjeta key={p.sku} p={p} prioridad={i < 4} />)}
          </div>
        </div>
      </section>

      {/* 4. Banner secundario */}
      {txt.secciones.banner2 && catalogo?.activa && (fotosSecundario.length > 0 || txt.imagenes.banner2) && (
        <section className="t-sec px-2 pt-14 lg:px-4">
          <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-2 items-center gap-6 overflow-hidden rounded-3xl p-6 lg:p-10" style={{ background: C.menta }}>
            <div>
              <h2 className="text-3xl lg:text-4xl leading-tight" style={{ ...SERIF, color: C.petroleo }}>{txt.banner2.titulo} <em>{txt.banner2.destacado}</em></h2>
              <p className="mt-3 max-w-md text-slate-600">{txt.banner2.bajada}</p>
              <a href="#productos" className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold text-white" style={{ background: C.petroleo }}>
                {txt.banner2.boton} <span aria-hidden="true" className="material-icons-round text-lg">arrow_forward</span>
              </a>
            </div>
            <div className="flex items-end justify-center gap-3">
              {txt.imagenes.banner2
                ? <img src={txt.imagenes.banner2} alt="" loading="lazy" decoding="async" className="max-h-64 w-full rounded-2xl object-cover" />
                : fotosSecundario.map(src => <img key={src} src={src} alt="" loading="lazy" decoding="async" className="h-36 w-28 rounded-2xl bg-white object-contain p-3 shadow-lg shadow-slate-900/10 lg:h-48 lg:w-36" />)}
            </div>
          </div>
        </section>
      )}

      {/* 5. Beneficios */}
      {txt.secciones.beneficios && (
      <section className="t-sec px-4 pt-14">
        <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-3 gap-6">
          {BENEFICIOS.map(b => (
            <div key={b.titulo} className="flex items-start gap-4">
              <span aria-hidden="true" className="material-icons-round rounded-full p-3 text-2xl" style={{ color: C.petroleo, background: C.menta }}>{b.icono}</span>
              <div><p className="font-extrabold" style={{ color: C.petroleo }}>{b.titulo}</p><p className="mt-1 text-sm italic text-slate-500" style={SERIF}>{b.texto}</p></div>
            </div>
          ))}
        </div>
      </section>

      )}

      {/* 6. Preguntas frecuentes */}
      {txt.secciones.preguntas ? (
      <section className="t-sec px-4 py-14">
        <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
          <div>
            <h2 className="text-3xl font-extrabold" style={{ color: C.petroleo }}>Preguntas frecuentes</h2>
            <p className="mt-2 text-slate-600">Sobre despacho, pagos y devoluciones.</p>
            <Link to="/tienda/terminos" className="mt-3 inline-block text-sm font-bold underline" style={{ color: C.petroleo }}>Ver términos completos</Link>
          </div>
          <div className="space-y-3">
            {PREGUNTAS.map((q, i) => {
              const abiertaEsta = abierta === i;
              return (
                <div key={q.p} className="overflow-hidden rounded-2xl" style={{ background: abiertaEsta ? C.petroleo : C.mentaClara }}>
                  <button onClick={() => setAbierta(abiertaEsta ? null : i)} aria-expanded={abiertaEsta}
                    className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-bold ${abiertaEsta ? 'text-white' : ''}`} style={abiertaEsta ? undefined : { color: C.petroleo }}>
                    <span>{i + 1}. {q.p}</span>
                    <span aria-hidden="true" className="material-icons-round">{abiertaEsta ? 'remove' : 'add'}</span>
                  </button>
                  {abiertaEsta && <p className="px-5 pb-5 text-sm leading-relaxed text-white/85">{q.r}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      ) : <div className="h-14" />}
    </LayoutTienda>
  );
};

export default Tienda;
