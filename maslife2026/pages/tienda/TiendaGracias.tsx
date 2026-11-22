import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { trackShopPurchase } from '../../analytics';
import { estadoPedido, guardarCarrito, clp, type EstadoPedido } from '../../lib/tienda';
import { LayoutTienda, C, SERIF } from './LayoutTienda';

// Página a la que vuelve MercadoPago. No confía en los parámetros de la URL: el
// servidor verifica el pago contra MercadoPago antes de marcar el pedido como pagado.

type Estado = 'verificando' | 'pendiente' | 'pagado' | 'error';

/** Informa la compra al píxel una sola vez por pedido (además Meta deduplica por eventID). */
function informarCompra(orderId: string, e: EstadoPedido) {
  const clave = `tienda_purchase_${orderId}`;
  try { if (sessionStorage.getItem(clave)) return; sessionStorage.setItem(clave, '1'); } catch { /* sin storage: Meta deduplica igual */ }
  trackShopPurchase(orderId, (e.items || []).map(i => ({ sku: i.sku, cantidad: i.cantidad, precio: i.precio })), e.amount || 0);
}

const TiendaGracias: React.FC = () => {
  const [params] = useSearchParams();
  const orderId = params.get('order') || '';
  const paymentId = params.get('payment_id') || params.get('collection_id') || undefined;
  const [estado, setEstado] = useState<Estado>('verificando');
  const [pedido, setPedido] = useState<EstadoPedido | null>(null);
  const intentos = useRef(0);

  usePageMeta({ title: 'Tu compra | Tienda Mas Life', description: 'Estado de tu compra.', canonicalPath: '/tienda/gracias' });

  const verificar = async (): Promise<boolean> => {
    try {
      const r = await estadoPedido(orderId, paymentId);
      if (r.status === 'pagado') {
        guardarCarrito([]);
        setPedido(r);
        informarCompra(orderId, r);
        setEstado('pagado');
        return true;
      }
      setEstado('pendiente');
      return false;
    } catch (e) {
      console.error('[tienda-gracias] no se pudo verificar', e);
      setEstado('error');
      return false;
    }
  };

  useEffect(() => {
    if (!orderId) { setEstado('error'); return; }
    let vivo = true;
    const ciclo = async () => {
      const listo = await verificar();
      intentos.current += 1;
      if (vivo && !listo && intentos.current < 8) setTimeout(ciclo, 4000);
    };
    ciclo();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  return (
    <LayoutTienda fondo={C.crema}>
      <div className="px-4 py-12 lg:py-16">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg shadow-slate-200/60">
          {estado === 'verificando' && (<>
            <span className="material-icons-round animate-spin text-4xl" style={{ color: C.petroleo }}>sync</span>
            <p className="mt-3 text-2xl font-extrabold text-slate-900">Verificando tu pago…</p>
            <p className="mt-2 text-slate-600">Un momento, no cierres esta página.</p>
          </>)}
          {estado === 'pendiente' && (<>
            <p className="text-2xl font-extrabold text-slate-900">Tu pago aún se está procesando</p>
            <p className="mt-3 text-slate-600">Cuando MercadoPago lo apruebe, preparamos tu pedido. Esta página se actualiza sola.</p>
            <button onClick={() => { intentos.current = 0; setEstado('verificando'); verificar(); }}
              className="mt-6 rounded-full px-6 py-3 font-extrabold text-white" style={{ background: C.petroleo }}>Verificar de nuevo</button>
          </>)}
          {estado === 'pagado' && pedido && (<>
            <span className="material-icons-round rounded-full p-3 text-4xl text-white" style={{ background: C.teal }}>check</span>
            <p className="mt-4 text-3xl text-slate-900" style={{ ...SERIF, fontWeight: 400 }}>¡Gracias por tu compra!</p>
            <p className="mt-2 text-sm text-slate-500">Pedido {orderId.slice(0, 8).toUpperCase()}</p>
            <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-left text-sm">
              {(pedido.items || []).map(i => (
                <div key={i.sku} className="flex justify-between py-1"><span>{i.cantidad} × {i.nombre}</span><span className="font-bold">{clp(i.precio * i.cantidad)}</span></div>
              ))}
              <div className="flex justify-between py-1 text-slate-500"><span>Envío</span><span>{clp(pedido.envio || 0)}</span></div>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold"><span>Total pagado</span><span>{clp(pedido.amount || 0)}</span></div>
            </div>
            <ol className="mt-6 space-y-2 text-left text-sm text-slate-700">
              <li className="flex gap-3"><span className="material-icons-round text-base" style={{ color: C.teal }}>inventory_2</span>Preparamos tu pedido.</li>
              <li className="flex gap-3"><span className="material-icons-round text-base" style={{ color: C.teal }}>mail</span>Cuando salga, te enviamos por correo el número de seguimiento.</li>
            </ol>
            <Link to="/tienda" className="mt-6 inline-block rounded-full px-6 py-3 font-extrabold text-white" style={{ background: C.petroleo }}>Volver a la tienda</Link>
          </>)}
          {estado === 'error' && (<>
            <p className="text-2xl font-extrabold text-slate-900">No pudimos verificar tu compra</p>
            <p className="mt-3 text-slate-600">Si ya pagaste, no te preocupes: escríbenos a maslife@clinicamaslife.cl con tu correo y lo revisamos.</p>
          </>)}
        </div>
      </div>
    </LayoutTienda>
  );
};

export default TiendaGracias;
