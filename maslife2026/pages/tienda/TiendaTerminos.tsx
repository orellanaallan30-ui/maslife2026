import React from 'react';
import { usePageMeta } from '../../lib/seo';
import { LayoutTienda, C, SERIF } from './LayoutTienda';

// BORRADOR pendiente de revisión legal (abogado o contador) antes de abrir la tienda.
// Base: Ley 19.496 sobre Protección de los Derechos de los Consumidores.

const Seccion: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="mt-8">
    <h2 className="text-xl font-extrabold text-slate-900">{titulo}</h2>
    <div className="mt-2 space-y-2 leading-relaxed text-slate-700">{children}</div>
  </section>
);

const TiendaTerminos: React.FC = () => {
  usePageMeta({
    title: 'Términos de compra, despacho y devoluciones | Tienda Mas Life',
    description: 'Condiciones de compra, despacho, garantía y derecho a retracto de la tienda de Clínica Mas Life.',
    canonicalPath: '/tienda/terminos',
  });

  return (
    <LayoutTienda>
      <article className="mx-auto max-w-3xl px-4 py-10 lg:py-14">
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          Borrador pendiente de revisión legal. Este texto se publicará en su versión final antes de abrir la tienda.
        </p>
        <h1 className="mt-6 text-3xl lg:text-4xl text-slate-900" style={{ ...SERIF, fontWeight: 400 }}>Términos de compra, despacho y devoluciones</h1>

        <Seccion titulo="1. Quién vende">
          <p>Los productos de esta tienda los vende Clínica Mas Life (clinicamaslife.cl). Contacto: maslife@clinicamaslife.cl · WhatsApp +56 9 6532 9974.</p>
        </Seccion>

        <Seccion titulo="2. Precios y pago">
          <p>Los precios están en pesos chilenos e incluyen IVA. El costo de despacho se muestra antes de pagar, según la región de entrega.</p>
          <p>El pago se realiza a través de MercadoPago con tarjeta de crédito, débito o saldo. Clínica Mas Life no recibe ni guarda los datos de tu tarjeta. La compra se confirma cuando MercadoPago aprueba el pago; te avisamos por correo.</p>
        </Seccion>

        <Seccion titulo="3. Despacho">
          <p>Despachamos a domicilio a las regiones que aparecen en el checkout, mediante empresas de transporte (por ejemplo Blue Express o Starken). Cuando el pedido sale, te enviamos por correo el número de seguimiento.</p>
          <p>Los plazos de entrega dependen de la comuna de destino y de la empresa de transporte. Si un producto se agota después de tu pago, te contactamos para ofrecerte una alternativa o la devolución total del dinero.</p>
        </Seccion>

        <Seccion titulo="4. Derecho a retracto">
          <p>En las compras a distancia puedes retractarte dentro de los 10 días siguientes a la recepción del producto, devolviéndolo sin uso, en su envase original y con sus sellos intactos. Te devolvemos el monto pagado; el costo del envío de devolución es de cargo del comprador, salvo que el producto venga con falla.</p>
          <p><strong>No aplica el derecho a retracto</strong> a suplementos alimenticios, productos de higiene o de uso personal que hayan sido abiertos o cuyo sello de seguridad haya sido roto, por razones de salud e higiene. Esta exclusión se informa antes de la compra.</p>
        </Seccion>

        <Seccion titulo="5. Garantía legal">
          <p>Si un producto presenta fallas o defectos de fabricación, puedes optar entre su cambio, reparación o la devolución del dinero dentro del plazo que establece la ley, presentando la boleta o el comprobante de compra. Escríbenos con fotos del producto y del problema.</p>
        </Seccion>

        <Seccion titulo="6. Uso de los productos">
          <p>Los productos de esta tienda no son medicamentos ni reemplazan un tratamiento médico. Lee siempre la etiqueta. Si tienes una condición de salud, estás embarazada o en lactancia, o tomas medicamentos, consulta a tu médico antes de usarlos.</p>
        </Seccion>

        <Seccion titulo="7. Datos personales">
          <p>Usamos tus datos de contacto y despacho solo para procesar y enviar tu pedido y para informarte sobre él. No los vendemos ni los cedemos a terceros, salvo a la empresa de transporte para la entrega. Más detalles en nuestra política de privacidad.</p>
        </Seccion>

        <Seccion titulo="8. Contacto y reclamos">
          <p>Para cambios, devoluciones o reclamos escríbenos a maslife@clinicamaslife.cl indicando tu número de pedido. Respondemos dentro de 2 días hábiles.</p>
        </Seccion>

        <p className="mt-10 text-xs" style={{ color: C.petroleo }}>Última actualización: borrador de noviembre de 2026.</p>
      </article>
    </LayoutTienda>
  );
};

export default TiendaTerminos;
