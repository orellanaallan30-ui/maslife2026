import { describe, it, expect } from 'vitest';
import {
  redondear990, calcularPrecioVenta, stockDe, normalizarProductoDropi, puedePublicar,
  estadoTrasSincronizar, validarDestino, tarifaEnvio, calcularCarrito, proximoIntento,
  clasificarErrorDropi, esReintentable, debeEnviarAhora, separarNombre, construirPedidoDropi,
  conciliar, MAX_INTENTOS, ESTADO_BORRADOR_DROPI, type ProductoTienda,
} from '../../api/_lib/shopRules';

describe('precio de venta', () => {
  it('redondea al siguiente 990', () => {
    expect(redondear990(12340)).toBe(12990);
    expect(redondear990(12990)).toBe(12990);
    expect(redondear990(13000)).toBe(13990);
    expect(redondear990(100)).toBe(990);
  });

  it('pone la comisión en el denominador para que el margen quede limpio', () => {
    const r = calcularPrecioVenta(10000, 0, { margen: 0.35, comisionPct: 0.05 });
    expect(r).toEqual({ ok: true, precio: 16990 }); // 10000 / 0.60 = 16.667 → 16.990
    if (r.ok) {
      const margenReal = (r.precio - 10000 - r.precio * 0.05) / r.precio;
      expect(margenReal).toBeGreaterThanOrEqual(0.35);
    }
  });

  it('suma el envío estimado al costo', () => {
    expect(calcularPrecioVenta(8000, 2000, { margen: 0.35, comisionPct: 0.05 })).toEqual({ ok: true, precio: 16990 });
  });

  it('rechaza datos imposibles', () => {
    expect(calcularPrecioVenta(0, 0, { margen: 0.3, comisionPct: 0.04 }).ok).toBe(false);
    expect(calcularPrecioVenta(1000, -1, { margen: 0.3, comisionPct: 0.04 }).ok).toBe(false);
    expect(calcularPrecioVenta(1000, 0, { margen: 0.88, comisionPct: 0.05 }).ok).toBe(false);
  });
});

describe('producto de Dropi', () => {
  it('suma el stock por bodega como el plugin oficial', () => {
    expect(stockDe({ stock: 3 })).toBe(3);
    expect(stockDe({ stock: 99, warehouse_product: [{ stock: 4 }, { stock: '6' }] })).toBe(10);
    expect(stockDe({})).toBe(0);
  });

  it('normaliza un producto variable con imágenes', () => {
    const p = normalizarProductoDropi({
      id: 77, name: ' Rodillera ', type: 'VARIABLE', sale_price: '9000', suggested_price: 19990, user_id: 5,
      gallery: [{ urlS3: 'a/b.jpg' }, { url: '/img/c.jpg' }, {}],
      variations: [
        { id: 1, sku: 'R-S', stock: 2, attribute_values: [{ value: 'S' }] },
        { id: 2, sku: 'R-M', warehouse_product_variation: [{ stock: 4 }], sale_price: 9500 },
      ],
    });
    expect(p).toMatchObject({ dropiId: 77, nombre: 'Rodillera', tipo: 'VARIABLE', costo: 9000, stock: 6, supplierId: 5 });
    expect(p?.imagenes).toEqual(['https://d39ru7awumhhs2.cloudfront.net/a/b.jpg', 'https://api.dropi.cl/img/c.jpg']);
    expect(p?.variaciones[0]).toMatchObject({ id: 1, atributos: 'S', costo: null });
    expect(p?.variaciones[1]).toMatchObject({ id: 2, stock: 4, costo: 9500 });
  });

  it('descarta productos sin id o nombre', () => {
    expect(normalizarProductoDropi({ name: 'x' })).toBeNull();
    expect(normalizarProductoDropi({ id: 3 })).toBeNull();
  });
});

const base: ProductoTienda = {
  sku: 'ML-001', categoria: 'rehabilitacion', precio_venta: 19990, stock: 20, estado: 'publicado',
  resolucion_sanitaria: null, aprobado_at: '2026-11-22T10:00:00Z',
};

describe('publicación', () => {
  it('exige visto bueno', () => {
    expect(puedePublicar({ ...base, aprobado_at: null }, 5)).toEqual({ ok: false, motivo: 'Falta el visto bueno de Rodrigo' });
  });
  it('exige resolución SEREMI a los suplementos', () => {
    expect(puedePublicar({ ...base, categoria: 'suplementos' }, 5).ok).toBe(false);
    expect(puedePublicar({ ...base, categoria: 'suplementos', resolucion_sanitaria: 'Res. 1234/2026' }, 5).ok).toBe(true);
  });
  it('no publica con stock bajo 5', () => {
    expect(puedePublicar({ ...base, stock: 4 }, 5).ok).toBe(false);
    expect(puedePublicar({ ...base, stock: 5 }, 5).ok).toBe(true);
  });
  it('la sincronización marca agotado y vuelve a publicar, sin tocar borradores ni pausados', () => {
    expect(estadoTrasSincronizar({ ...base, stock: 4 }, 5)).toBe('agotado');
    expect(estadoTrasSincronizar({ ...base, estado: 'agotado', stock: 8 }, 5)).toBe('publicado');
    expect(estadoTrasSincronizar({ ...base, estado: 'borrador', stock: 1 }, 5)).toBe('borrador');
    expect(estadoTrasSincronizar({ ...base, estado: 'pausado', stock: 50 }, 5)).toBe('pausado');
  });
});

describe('destino y flete', () => {
  it('acepta comunas de la lista de Dropi sin importar tildes ni mayúsculas', () => {
    expect(validarDestino('RM', 'providencia')).toEqual({ ok: true, region: 'METROPOLITANA DE SANTIAGO', ciudad: 'PROVIDENCIA' });
    expect(validarDestino('VS', 'Viña del Mar')).toMatchObject({ ok: true, ciudad: 'VINA DEL MAR' });
  });
  it('rechaza región o comuna desconocidas', () => {
    expect(validarDestino('XX', 'Santiago').ok).toBe(false);
    expect(validarDestino('RM', 'Gotham').ok).toBe(false);
  });
  it('usa la tabla por región y bloquea regiones sin tarifa', () => {
    expect(tarifaEnvio({ RM: 3990, VS: 4990 }, 'RM')).toBe(3990);
    expect(tarifaEnvio({ RM: 3990 }, 'MA')).toBeNull();
  });
});

describe('carrito en el servidor', () => {
  const catalogo = [
    { ...base, nombre: 'Banda elástica', costo: 6000 },
    { ...base, sku: 'ML-002', nombre: 'Rodillera', precio_venta: 24990, costo: 11000, stock: 6 },
    { ...base, sku: 'ML-003', nombre: 'Pausado', estado: 'pausado' as const, costo: 1 },
  ];

  it('ignora el precio que manda el cliente', () => {
    const r = calcularCarrito([{ sku: 'ML-001', cantidad: 2, precio: 1 }], catalogo, 5);
    expect(r).toMatchObject({ ok: true, subtotal: 39980 });
  });
  it('junta líneas repetidas del mismo sku', () => {
    const r = calcularCarrito([{ sku: 'ML-001', cantidad: 1 }, { sku: 'ML-001', cantidad: 2 }], catalogo, 5);
    expect(r.ok && r.lineas).toEqual([{ sku: 'ML-001', cantidad: 3, precioUnitario: 19990, costoUnitario: 6000, nombre: 'Banda elástica' }]);
  });
  it('rechaza productos no publicados, cantidades inválidas y falta de stock', () => {
    expect(calcularCarrito([{ sku: 'ML-003', cantidad: 1 }], catalogo, 5).ok).toBe(false);
    expect(calcularCarrito([{ sku: 'ML-001', cantidad: 0 }], catalogo, 5).ok).toBe(false);
    expect(calcularCarrito([{ sku: 'ML-001', cantidad: 1.5 }], catalogo, 5).ok).toBe(false);
    expect(calcularCarrito([{ sku: 'ML-002', cantidad: 7 }], catalogo, 5).ok).toBe(false);
    expect(calcularCarrito([{ sku: 'ML-001', cantidad: 11 }], catalogo, 5).ok).toBe(false);
    expect(calcularCarrito([], catalogo, 5).ok).toBe(false);
  });
});

describe('cola de pedidos', () => {
  const ahora = new Date('2026-11-22T12:00:00Z');

  it('reintenta con backoff exponencial y se detiene al máximo', () => {
    expect(proximoIntento(1, ahora)?.toISOString()).toBe('2026-11-22T12:05:00.000Z');
    expect(proximoIntento(3, ahora)?.toISOString()).toBe('2026-11-22T12:20:00.000Z');
    expect(proximoIntento(MAX_INTENTOS, ahora)).toBeNull();
  });

  it('clasifica los errores de Dropi', () => {
    expect(clasificarErrorDropi(401, 'Access denied')).toBe('auth');
    expect(clasificarErrorDropi(400, 'Saldo insuficiente en la wallet')).toBe('saldo');
    expect(clasificarErrorDropi(400, 'Producto sin stock')).toBe('stock');
    expect(clasificarErrorDropi(503, 'upstream')).toBe('red');
    expect(clasificarErrorDropi(400, 'city is required')).toBe('datos');
    expect(esReintentable('red')).toBe(true);
    expect(esReintentable('saldo')).toBe(false);
  });

  it('respeta el interruptor, la retención de 15 min y el backoff', () => {
    const f = { estado: 'en_espera', retener_hasta: '2026-11-22T11:59:00Z', proximo_intento: null, intentos: 0 };
    expect(debeEnviarAhora(f, false, ahora)).toBe(false);
    expect(debeEnviarAhora(f, true, ahora)).toBe(true);
    expect(debeEnviarAhora({ ...f, retener_hasta: '2026-11-22T12:10:00Z' }, true, ahora)).toBe(false);
    expect(debeEnviarAhora({ ...f, estado: 'reintentar', proximo_intento: '2026-11-22T12:05:00Z' }, true, ahora)).toBe(false);
    expect(debeEnviarAhora({ ...f, estado: 'borrador_dropi' }, true, ahora)).toBe(false);
    expect(debeEnviarAhora({ ...f, estado: 'alerta_saldo' }, true, ahora)).toBe(false);
  });
});

describe('pedido para Dropi', () => {
  it('separa nombre y apellidos', () => {
    expect(separarNombre('Ana María Pérez Soto')).toEqual({ name: 'Ana', surname: 'María Pérez Soto' });
    expect(separarNombre('Ana')).toEqual({ name: 'Ana', surname: '.' });
  });

  it('siempre crea un borrador sin recaudo, con el formato del plugin', () => {
    const p = construirPedidoDropi({
      orderId: 'o-1', nombre: 'Ana Pérez', email: 'ana@mail.cl', telefono: '+56911111111',
      direccion: 'Av. Siempre Viva 123', region: 'METROPOLITANA DE SANTIAGO', ciudad: 'PROVIDENCIA',
      items: [
        { dropiProductId: 77, dropiVariationId: 2, supplierId: 5, nombre: 'Rodillera M', cantidad: 2, precioUnitario: 24990 },
        { dropiProductId: 80, dropiVariationId: null, supplierId: 5, nombre: 'Banda', cantidad: 1, precioUnitario: 19990 },
      ],
    });
    expect(p).toMatchObject({
      status: ESTADO_BORRADOR_DROPI, rate_type: 'SIN RECAUDO', type: 'FINAL_ORDER', country: 'CL',
      name: 'Ana', surname: 'Pérez', state: 'METROPOLITANA DE SANTIAGO', city: 'PROVIDENCIA',
      total_order: 69970, supplier_id: 5, shop_order_id: 'o-1', calculate_costs_and_shiping: true,
    });
    expect(p.products[0]).toEqual({ id: 77, name: 'Rodillera M', quantity: 2, price: 24990, type: 'VARIABLE', variation_id: 2 });
    expect(p.products[1]).not.toHaveProperty('variation_id');
  });
});

describe('conciliación', () => {
  it('calcula el margen neto con flete real', () => {
    expect(conciliar({ precioCobrado: 19990, envioCobrado: 3990, costoProducto: 9000, fleteReal: 3500, comisionPct: 0.04 }))
      .toEqual({ totalCobrado: 23980, comision: 959, flete: 3500, margenNeto: 10521, margenPct: 43.9, fleteEstimado: false });
  });
  it('sin flete real asume el cobrado y lo marca como estimado', () => {
    expect(conciliar({ precioCobrado: 10000, envioCobrado: 3000, costoProducto: 5000, fleteReal: null, comisionPct: 0 }))
      .toMatchObject({ flete: 3000, margenNeto: 5000, fleteEstimado: true });
  });
});
