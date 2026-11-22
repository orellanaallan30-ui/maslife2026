import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { estadoPedido, guardarCarrito } from '../../lib/tienda';

// Página a la que vuelve MercadoPago. No confía en los parámetros de la URL: el
// servidor verifica el pago contra MercadoPago antes de marcar el pedido como pagado.

type Estado = 'verificando' | 'pendiente' | 'pagado' | 'error';
const FONT = { fontFamily: "'Manrope', system-ui, sans-serif" };

const TiendaGracias: React.FC = () => {
  const [params] = useSearchParams();
  const orderId = params.get('order') || '';
  const paymentId = params.get('payment_id') || params.get('collection_id') || undefined;
  const [estado, setEstado] = useState<Estado>('verificando');
  const intentos = useRef(0);

  usePageMeta({ title: 'Tu compra | Tienda Mas Life', description: 'Estado de tu compra.', canonicalPath: '/tienda/gracias' });

  const verificar = async (): Promise<boolean> => {
    try {
      const r = await estadoPedido(orderId, paymentId);
      if (r.status === 'pagado') { guardarCarrito([]); setEstado('pagado'); return true; }
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
    <div className="w-full bg-white px-4 py-16" style={FONT}>
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 p-8 text-center shadow-lg shadow-slate-200/60">
        {estado === 'verificando' && (<><p className="text-2xl font-extrabold text-slate-900">Verificando tu pago…</p><p className="mt-3 text-slate-600">Un momento, no cierres esta página.</p></>)}
        {estado === 'pendiente' && (<>
          <p className="text-2xl font-extrabold text-slate-900">Tu pago aún se está procesando</p>
          <p className="mt-3 text-slate-600">Cuando MercadoPago lo apruebe, preparamos tu pedido. Esta página se actualiza sola.</p>
          <button onClick={() => { intentos.current = 0; setEstado('verificando'); verificar(); }}
            className="mt-6 rounded-xl bg-[#00a89e] px-6 py-3 font-extrabold text-white">Verificar de nuevo</button>
        </>)}
        {estado === 'pagado' && (<>
          <p className="text-2xl font-extrabold text-slate-900">¡Gracias por tu compra!</p>
          <p className="mt-3 text-slate-600">Recibimos tu pago y estamos preparando el despacho. Te avisaremos por correo cuando salga tu pedido.</p>
          <Link to="/tienda" className="mt-6 inline-block rounded-xl bg-[#00a89e] px-6 py-3 font-extrabold text-white">Volver a la tienda</Link>
        </>)}
        {estado === 'error' && (<>
          <p className="text-2xl font-extrabold text-slate-900">No pudimos verificar tu compra</p>
          <p className="mt-3 text-slate-600">Si ya pagaste, no te preocupes: escríbenos a maslife@clinicamaslife.cl con tu correo y lo revisamos.</p>
        </>)}
      </div>
    </div>
  );
};

export default TiendaGracias;
