import { describe, it, expect } from 'vitest';
import { PUNTO, escalaPorEstatura, distanciasCm, evaluarCalidad, cuerpoCompleto, type Punto } from '../lib/biomecanica';

// Persona de 170 cm: ojos en y=100 y talones en y=100+1000 → 1000 px de
// talón a ojos = 170·0,936 cm → 0,1591 cm/px.
function cuerpo(): Punto[] {
  const p: Punto[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibilidad: 1 }));
  p[PUNTO.ojoIzq] = { x: 490, y: 100, visibilidad: 1 };
  p[PUNTO.ojoDer] = { x: 510, y: 100, visibilidad: 1 };
  p[PUNTO.orejaIzq] = { x: 480, y: 110, visibilidad: 1 };
  p[PUNTO.orejaDer] = { x: 520, y: 110, visibilidad: 1 };
  p[PUNTO.hombroIzq] = { x: 420, y: 260, visibilidad: 1 };
  p[PUNTO.hombroDer] = { x: 580, y: 260, visibilidad: 1 };
  p[PUNTO.caderaIzq] = { x: 450, y: 560, visibilidad: 1 };
  p[PUNTO.caderaDer] = { x: 550, y: 560, visibilidad: 1 };
  p[PUNTO.rodillaIzq] = { x: 450, y: 820, visibilidad: 1 };
  p[PUNTO.rodillaDer] = { x: 550, y: 820, visibilidad: 1 };
  p[PUNTO.tobilloIzq] = { x: 450, y: 1070, visibilidad: 1 };
  p[PUNTO.tobilloDer] = { x: 550, y: 1070, visibilidad: 1 };
  p[PUNTO.talonIzq] = { x: 450, y: 1100, visibilidad: 1 };
  p[PUNTO.talonDer] = { x: 550, y: 1100, visibilidad: 1 };
  return p;
}

describe('escala por estatura', () => {
  it('convierte píxeles a cm con la talla del paciente', () => {
    expect(escalaPorEstatura(cuerpo(), 170)).toBeCloseTo((170 * 0.936) / 1000, 5);
  });

  it('no da escala sin talla, con talla absurda o sin pies visibles', () => {
    expect(escalaPorEstatura(cuerpo(), null)).toBeNull();
    expect(escalaPorEstatura(cuerpo(), 20)).toBeNull();
    const p = cuerpo();
    for (const i of [PUNTO.talonIzq, PUNTO.talonDer, PUNTO.tobilloIzq, PUNTO.tobilloDer]) p[i] = { ...p[i], visibilidad: 0.1 };
    expect(escalaPorEstatura(p, 170)).toBeNull();
    expect(cuerpoCompleto(p)).toBe(false);
  });

  it('un desnivel de hombros de 20 px en una persona de 170 cm son ≈ 3 cm', () => {
    const p = cuerpo();
    p[PUNTO.hombroDer] = { ...p[PUNTO.hombroDer], y: 280 };
    const ds = distanciasCm(p, 'frontal', escalaPorEstatura(p, 170));
    const h = ds.find(d => d.id === 'desnivelHombrosCm')!;
    expect(h.cm).toBe(3); // 20 px · 0,1591 = 3,18 → redondeado a 0,5
    expect(h.lectura).toMatch(/derecho más bajo/);
    expect(h.severidad).toBe('riesgo');
  });

  it('sin escala no inventa centímetros', () => {
    expect(distanciasCm(cuerpo(), 'frontal', null)).toEqual([]);
  });

  it('avisa (sin invalidar) cuando la foto no muestra el cuerpo completo', () => {
    const p = cuerpo();
    for (const i of [PUNTO.talonIzq, PUNTO.talonDer, PUNTO.tobilloIzq, PUNTO.tobilloDer]) p[i] = { ...p[i], visibilidad: 0.1 };
    const r = evaluarCalidad(p, 'frontal');
    expect(r.mensajes.join(' ')).toMatch(/Cuerpo incompleto/);
  });
});
