import { describe, it, expect } from 'vitest';
import { textoParaVoz, mensajeErrorVoz } from '../lib/voz';

describe('voz del asistente', () => {
  it('lee las respuestas sin emojis, viñetas, markdown ni links', () => {
    const t = textoParaVoz('✅ Cita agendada para **Ana** el 2026-09-30.\n• 10:00 — Juan\n⚠️ Ver [agenda](https://x.cl/a) https://y.cl');
    expect(t).not.toMatch(/[✅⚠*•]|https?:/);
    expect(t).toContain('Cita agendada para Ana el 2026-09-30.');
    expect(t).toContain('10:00 — Juan');
    expect(t).toContain('Ver agenda');
  });

  it('no avisa por silencio o cancelación, sí por permiso denegado', () => {
    expect(mensajeErrorVoz('no-speech')).toBeNull();
    expect(mensajeErrorVoz('aborted')).toBeNull();
    expect(mensajeErrorVoz('not-allowed')).toMatch(/permiso/);
    expect(mensajeErrorVoz('audio-capture')).toMatch(/micrófono/);
    expect(mensajeErrorVoz('raro')).toBeTruthy();
  });
});
