// Impresión de un pedido de la tienda: hoja 1 = etiqueta de despacho (para pegar en
// el paquete), hoja 2 = detalle de compra (para incluir o archivar). Todo dato del
// cliente se escapa antes de armar el HTML.

export interface PedidoImpresion {
  id: string; created_at: string; buyer_name: string; buyer_email: string; telefono?: string | null;
  direccion?: string | null; comuna?: string | null; region?: string | null;
  amount: number; envio_monto?: number | null; es_prueba?: boolean;
  items?: Array<{ nombre: string; cantidad: number; precio_unitario: number }>;
}

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clp = (n: unknown) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;

export function htmlImpresionPedido(o: PedidoImpresion): string {
  const numero = o.id.slice(0, 8).toUpperCase();
  const fecha = new Date(o.created_at).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' });
  const items = o.items || [];
  const subtotal = items.reduce((a, i) => a + i.precio_unitario * i.cantidad, 0);
  const prueba = o.es_prueba ? '<p class="prueba">PEDIDO DE PRUEBA</p>' : '';
  const filas = items.map(i => `<tr><td>${esc(i.cantidad)}</td><td>${esc(i.nombre)}</td><td class="n">${clp(i.precio_unitario)}</td><td class="n">${clp(i.precio_unitario * i.cantidad)}</td></tr>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pedido ${numero}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; }
  .hoja { page-break-after: always; }
  .hoja:last-child { page-break-after: auto; }
  .etiqueta { border: 3px solid #0f172a; border-radius: 10px; padding: 18px 22px; max-width: 150mm; }
  .tit { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #475569; margin: 0 0 4px; }
  .dest { font-size: 26px; font-weight: 700; margin: 0 0 8px; }
  .dir { font-size: 20px; margin: 0 0 4px; }
  .tel { font-size: 18px; margin: 8px 0 0; }
  .rem { border-top: 1px dashed #94a3b8; margin-top: 16px; padding-top: 10px; font-size: 13px; }
  .num { font-size: 16px; font-weight: 700; margin-top: 10px; }
  .prueba { display: inline-block; background: #fde68a; padding: 4px 10px; font-weight: 700; border-radius: 6px; }
  h1 { font-size: 22px; margin: 0 0 4px; } .meta { color: #475569; font-size: 13px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e2e8f0; } .n { text-align: right; }
  .tot td { font-weight: 700; font-size: 16px; border-bottom: 0; }
  .cli { margin-top: 18px; font-size: 13px; color: #334155; }
</style></head><body>
<section class="hoja">
  ${prueba}
  <div class="etiqueta">
    <p class="tit">Destinatario</p>
    <p class="dest">${esc(o.buyer_name)}</p>
    <p class="dir">${esc(o.direccion)}</p>
    <p class="dir">${esc(o.comuna)}, ${esc(o.region)}</p>
    <p class="tel">Tel: ${esc(o.telefono || '—')}</p>
    <p class="num">Pedido ${numero}</p>
    <div class="rem"><strong>Remitente:</strong> Clínica Mas Life · clinicamaslife.cl · maslife@clinicamaslife.cl</div>
  </div>
</section>
<section class="hoja">
  ${prueba}
  <h1>Detalle de compra · Pedido ${numero}</h1>
  <p class="meta">${esc(fecha)} · Pagado con MercadoPago</p>
  <table>
    <thead><tr><th>Cant.</th><th>Producto</th><th class="n">Precio</th><th class="n">Total</th></tr></thead>
    <tbody>${filas}
      <tr><td></td><td>Subtotal</td><td></td><td class="n">${clp(subtotal)}</td></tr>
      <tr><td></td><td>Envío</td><td></td><td class="n">${clp(o.envio_monto)}</td></tr>
      <tr class="tot"><td></td><td>Total pagado</td><td></td><td class="n">${clp(o.amount)}</td></tr>
    </tbody>
  </table>
  <div class="cli">
    <strong>Cliente:</strong> ${esc(o.buyer_name)} · ${esc(o.buyer_email)} · ${esc(o.telefono || '—')}<br>
    <strong>Despacho:</strong> ${esc(o.direccion)}, ${esc(o.comuna)}, ${esc(o.region)}
  </div>
</section>
<script>window.onload = function () { window.print(); };</script>
</body></html>`;
}

/** Abre la ventana de impresión con la etiqueta y el detalle. */
export function imprimirPedido(o: PedidoImpresion): boolean {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false; // el navegador bloqueó la ventana emergente
  w.document.open();
  w.document.write(htmlImpresionPedido(o));
  w.document.close();
  return true;
}
