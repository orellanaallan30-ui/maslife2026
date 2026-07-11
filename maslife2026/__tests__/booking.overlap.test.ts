import { describe, it, expect } from 'vitest';
import { rangesOverlap } from '../../api/_lib/overlap';

describe('rangesOverlap (bloqueo de horarios en el servidor)', () => {
  it('una cita de 120 min a las 13:00 bloquea las 14:00 (el caso del bug)', () => {
    // existente: 13:00 (780) por 120 min → ocupa hasta 15:00
    // nueva: 14:00 (840) por 60 min → DEBE chocar
    expect(rangesOverlap(840, 60, 780, 120)).toBe(true);
  });

  it('misma hora exacta choca', () => {
    expect(rangesOverlap(600, 60, 600, 60)).toBe(true);
  });

  it('horarios contiguos NO chocan (fin exclusivo)', () => {
    // existente 10:00-11:00, nueva 11:00-12:00
    expect(rangesOverlap(660, 60, 600, 60)).toBe(false);
    // y al revés
    expect(rangesOverlap(600, 60, 660, 60)).toBe(false);
  });

  it('nueva cita larga que envuelve a una corta choca', () => {
    // nueva 09:00 por 180 min envuelve a existente 10:00 por 30 min
    expect(rangesOverlap(540, 180, 600, 30)).toBe(true);
  });

  it('horarios separados no chocan', () => {
    expect(rangesOverlap(540, 60, 720, 60)).toBe(false);
  });
});
