import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { leerCarrito } from '../../lib/tienda';

/** Barra superior de la tienda con el acceso al carrito. */
export const BarraTienda: React.FC = () => {
  const contar = () => leerCarrito().reduce((a, i) => a + i.cantidad, 0);
  const [unidades, setUnidades] = useState(contar);

  useEffect(() => {
    const actualizar = () => setUnidades(contar());
    window.addEventListener('carrito', actualizar);
    window.addEventListener('storage', actualizar);
    return () => { window.removeEventListener('carrito', actualizar); window.removeEventListener('storage', actualizar); };
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/tienda" className="flex items-center gap-2 font-extrabold text-slate-900">
          <span className="material-icons-round text-[#00a89e]">storefront</span>
          Tienda Mas Life
        </Link>
        <Link to="/tienda/checkout" aria-label={`Carrito, ${unidades} productos`}
          className="relative flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 font-bold text-slate-700">
          <span className="material-icons-round text-xl">shopping_cart</span>
          <span className="hidden sm:inline">Carrito</span>
          {unidades > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#00a89e] px-1 text-[11px] font-black text-white">{unidades}</span>
          )}
        </Link>
      </div>
    </header>
  );
};
