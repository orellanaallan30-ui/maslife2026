import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { buildPurchaseEvent, eventIdFor, eventTimeFor, hasMatchKeys, sha256 } from '../../api/_lib/metaCapi';

const h = (s: string) => createHash('sha256').update(s).digest('hex');
const NOW = Math.floor(Date.UTC(2026, 10, 10, 18, 0, 0) / 1000); // 10-nov-2026

describe('Meta Conversions API: venta de anuncio', () => {
  const base = {
    transactionId: '11111111-2222-3333-4444-555555555555',
    patientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    amount: 25000, date: '2026-11-10',
    phone: '+56 9 8792 5188', email: '  Paciente@Gmail.COM ', fullName: 'José  Pérez Soto',
    nowSec: NOW,
  };

  it('cifra el teléfono normalizado a 569XXXXXXXX y el correo en minúsculas', () => {
    const ev = buildPurchaseEvent(base);
    expect(ev.user_data.ph).toEqual([h('56987925188')]);
    expect(ev.user_data.em).toEqual([h('paciente@gmail.com')]);
    expect(ev.user_data.fn).toEqual([h('jose')]);
    expect(ev.user_data.ln).toEqual([h('soto')]);
    expect(ev.user_data.country).toEqual([h('cl')]);
    expect(ev.user_data.external_id).toEqual([h(base.patientId)]);
    expect(sha256('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('envía solo Purchase con monto en CLP, sin datos clínicos ni texto libre', () => {
    const ev = buildPurchaseEvent(base);
    expect(ev.event_name).toBe('Purchase');
    expect(ev.action_source).toBe('physical_store');
    expect(ev.custom_data).toEqual({ currency: 'CLP', value: 25000 });
    const json = JSON.stringify(ev);
    expect(json).not.toMatch(/pérez|perez|josé|gmail|98792/i);
    expect(Object.keys(ev).sort()).toEqual(['action_source', 'custom_data', 'event_id', 'event_name', 'event_time', 'user_data']);
  });

  it('event_id estable por transacción (Meta descarta duplicados)', () => {
    expect(buildPurchaseEvent(base).event_id).toBe(eventIdFor(base.transactionId));
    expect(eventIdFor(base.transactionId)).toBe('tx_11111111-2222-3333-4444-555555555555');
  });

  it('la hora del evento no queda en el futuro ni a más de 7 días', () => {
    expect(eventTimeFor('2026-11-10', NOW)).toBe(Math.floor(Date.UTC(2026, 10, 10, 15) / 1000));
    expect(eventTimeFor('2026-12-01', NOW)).toBe(NOW);
    expect(eventTimeFor('2026-01-01', NOW)).toBe(NOW - 7 * 86400 + 60);
    expect(eventTimeFor('', NOW)).toBe(NOW);
  });

  it('sin teléfono ni correo no hay cómo reconocer a la persona', () => {
    const ev = buildPurchaseEvent({ ...base, phone: '', email: '' });
    expect(hasMatchKeys(ev)).toBe(false);
    expect(hasMatchKeys(buildPurchaseEvent(base))).toBe(true);
  });
});
