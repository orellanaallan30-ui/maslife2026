import { describe, it, expect, vi, beforeAll } from 'vitest';
import { normalizarTelefonoCL, linkWhatsApp, fechaLarga, estadoPago, detectarReagendamiento } from '../../api/_lib/correoCita';

describe('correo de cita: utilidades', () => {
  it('normaliza teléfonos chilenos', () => {
    expect(normalizarTelefonoCL('+56 9 8792 5188')).toBe('56987925188');
    expect(normalizarTelefonoCL('987925188')).toBe('56987925188');
    expect(normalizarTelefonoCL('56987925188')).toBe('56987925188');
    expect(normalizarTelefonoCL('abc')).toBeNull();
    expect(normalizarTelefonoCL('')).toBeNull();
  });

  it('arma el link de WhatsApp con el texto codificado', () => {
    expect(linkWhatsApp('56987925188', 'Hola Ana, ¿confirmas?')).toBe('https://wa.me/56987925188?text=Hola%20Ana%2C%20%C2%BFconfirmas%3F');
  });

  it('escribe la fecha en español', () => {
    expect(fechaLarga('2026-09-25')).toBe('viernes 25 de septiembre');
    expect(fechaLarga('no-es-fecha')).toBe('no-es-fecha');
  });

  it('estado de pago según la cita guardada', () => {
    expect(estadoPago({ payment_status: 'Pagado', payment_amount: 25000, booking_source: 'web' }, true)).toEqual({ tipo: 'pagado', monto: 25000, via: 'MercadoPago' });
    expect(estadoPago({ payment_status: 'Pendiente' }, true)).toEqual({ tipo: 'pendiente' });
    expect(estadoPago({ payment_status: 'Pendiente' }, false)).toEqual({ tipo: 'en-consulta' });
    expect(estadoPago(null, true)).toEqual({ tipo: 'desconocido' });
  });

  it('detecta reagendamiento, recurrencia y primera cita', () => {
    const ahora = Date.parse('2026-09-28T12:00:00Z');
    const hace = (d: number) => new Date(ahora - d * 86400000).toISOString();
    expect(detectarReagendamiento([{ id: 'a', date: '2026-09-20', time: '10:00', status: 'Cancelado', created_at: hace(10) }], '2026-09-28', ahora))
      .toMatchObject({ tipo: 'reagendamiento', anterior: { estado: 'cancelada', date: '2026-09-20' } });
    expect(detectarReagendamiento([{ id: 'a', date: '2026-07-20', time: '10:00', status: 'Cancelado', created_at: hace(60) }], '2026-09-28', ahora))
      .toEqual({ tipo: 'primera' });
    expect(detectarReagendamiento([{ id: 'a', date: '2026-10-02', time: '09:00', status: 'Confirmado', created_at: hace(3) }], '2026-09-28', ahora))
      .toMatchObject({ tipo: 'reagendamiento', anterior: { estado: 'activa' } });
    expect(detectarReagendamiento([
      { id: 'a', date: '2026-08-01', time: '09:00', status: 'Finalizado', created_at: hace(70) },
      { id: 'b', date: '2026-08-15', time: '09:00', status: 'Finalizado', created_at: hace(50) },
    ], '2026-09-28', ahora)).toEqual({ tipo: 'recurrente', previas: 2 });
    expect(detectarReagendamiento([], '2026-09-28', ahora)).toEqual({ tipo: 'primera' });
  });
});

describe('plantilla del correo al profesional', () => {
  let plantilla: (p: any) => string;
  beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x');
    plantilla = (await import('../../api/notify')).professionalNewBookingHtml;
  });

  const base = {
    professionalName: 'Nicolas Olivares', patientName: 'Sandra <b>Bravo</b>', patientRut: '123456789',
    patientPhone: '+56 9 8792 5188', patientEmail: 'sandra@mail.cl', serviceName: 'Consulta Inicial',
    date: '2026-09-25', time: '15:00:00', duration: 45, type: 'Presencial', price: 25000,
    notes: 'Dolor <script>lumbar</script>',
  };

  it('incluye WhatsApp, llamada, correo y el estado de pago, escapando el HTML', () => {
    const html = plantilla({ ...base, pago: { tipo: 'pagado', monto: 25000, via: 'MercadoPago' }, historial: { tipo: 'primera' } });
    expect(html).toContain('https://wa.me/56987925188?text=');
    expect(html).toContain('tel:+56987925188');
    expect(html).toContain('mailto:sandra@mail.cl');
    expect(html).toContain('Pagado $25.000');
    expect(html).toContain('Primera cita');
    expect(html).toContain('viernes 25 de septiembre');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Bravo</b>');
  });

  it('marca reagendamiento con la hora anterior y sin teléfono no muestra botón', () => {
    const html = plantilla({ ...base, patientPhone: null, pago: { tipo: 'en-consulta' }, historial: null, reagendadaDesde: { date: '2026-09-22', time: '10:00' } });
    expect(html).toContain('Cita reagendada');
    expect(html).toContain('martes 22 de septiembre');
    expect(html).toContain('Paga en la consulta');
    expect(html).not.toContain('wa.me');
    expect(html).toContain('No informado');
  });
});

describe('formato legible', () => {
  it('teléfono y RUT', async () => {
    const { telefonoLegible, rutLegible } = await import('../../api/_lib/correoCita');
    expect(telefonoLegible('56987925188')).toBe('+56 9 8792 5188');
    expect(rutLegible('123456789')).toBe('12.345.678-9');
    expect(rutLegible('12345678k')).toBe('12.345.678-K');
  });
});
