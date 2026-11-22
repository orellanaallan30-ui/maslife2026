import { describe, it, expect } from 'vitest';
import { htmlImpresionPedido } from '../components/tienda/imprimirPedido';

const pedido = {
  id: 'abcd1234-0000-4000-8000-000000000000', created_at: '2026-11-22T15:00:00Z',
  buyer_name: 'Ana <img src=x onerror=alert(1)>', buyer_email: 'ana@mail.cl', telefono: '+56912345678',
  direccion: 'Av. Siempre Viva 123', comuna: 'PROVIDENCIA', region: 'RM', amount: 1000, envio_monto: 0, es_prueba: true,
  items: [{ nombre: 'Melena de león', cantidad: 1, precio_unitario: 1000 }],
};

describe('impresión del pedido', () => {
  it('arma etiqueta y detalle con los datos del cliente escapados', () => {
    const html = htmlImpresionPedido(pedido);
    expect(html).toContain('Pedido ABCD1234');
    expect(html).toContain('Destinatario');
    expect(html).toContain('PROVIDENCIA, RM');
    expect(html).toContain('+56912345678');
    expect(html).toContain('Melena de león');
    expect(html).toContain('$1.000');
    expect(html).toContain('PEDIDO DE PRUEBA');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
