import { describe, it, expect } from 'vitest';
import { PUNTO, centroDeMasa, distribucionCarga, plomada, type Punto } from '../lib/biomecanica';

// Vista anterior: el lado izquierdo del paciente queda a la DERECHA de la imagen.
function frontal(): Punto[] {
  const p: Punto[] = Array.from({ length: 33 }, () => ({ x: 500, y: 0, visibilidad: 0 }));
  const set = (i: number, x: number, y: number) => { p[i] = { x, y, visibilidad: 1 }; };
  set(PUNTO.nariz, 500, 90);
  set(PUNTO.orejaIzq, 530, 100); set(PUNTO.orejaDer, 470, 100);
  set(PUNTO.hombroIzq, 580, 250); set(PUNTO.hombroDer, 420, 250);
  set(PUNTO.codoIzq, 600, 400); set(PUNTO.codoDer, 400, 400);
  set(PUNTO.munecaIzq, 605, 520); set(PUNTO.munecaDer, 395, 520);
  set(PUNTO.caderaIzq, 550, 550); set(PUNTO.caderaDer, 450, 550);
  set(PUNTO.rodillaIzq, 550, 800); set(PUNTO.rodillaDer, 450, 800);
  set(PUNTO.tobilloIzq, 550, 1050); set(PUNTO.tobilloDer, 450, 1050);
  return p;
}

describe('centro de masa y carga', () => {
  it('un cuerpo simétrico tiene el centro de masa en la línea media y carga 50/50', () => {
    const cm = centroDeMasa(frontal())!;
    expect(cm.x).toBeCloseTo(500, 5);
    expect(cm.y).toBeGreaterThan(400);
    expect(cm.y).toBeLessThan(650);
    expect(distribucionCarga(frontal())).toEqual({ izq: 50, der: 50, severidad: 'normal' });
  });

  it('si el tronco se desplaza hacia el lado derecho del paciente, carga más ese pie', () => {
    const p = frontal();
    // Lado derecho del paciente = izquierda de la imagen (x menor).
    for (const i of [PUNTO.hombroIzq, PUNTO.hombroDer, PUNTO.orejaIzq, PUNTO.orejaDer, PUNTO.codoIzq, PUNTO.codoDer, PUNTO.munecaIzq, PUNTO.munecaDer]) p[i] = { ...p[i], x: p[i].x - 40 };
    const c = distribucionCarga(p)!;
    expect(c.der).toBeGreaterThan(50);
    expect(c.izq + c.der).toBe(100);
  });

  it('sin tobillos no estima la carga', () => {
    const p = frontal();
    p[PUNTO.tobilloIzq] = { ...p[PUNTO.tobilloIzq], visibilidad: 0.1 };
    expect(distribucionCarga(p)).toBeNull();
    expect(centroDeMasa(p)).toBeNull();
  });
});

describe('plomada', () => {
  it('frontal: pasa por el medio de los tobillos', () => {
    const pl = plomada(frontal(), 'frontal')!;
    expect(pl.x).toBe(500);
    expect(pl.desviaciones.find(d => d.id === 'hombros')!.px).toBe(0);
  });

  it('sagital: la cabeza adelantada da desviación positiva de la oreja', () => {
    const p: Punto[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibilidad: 0 }));
    const set = (i: number, x: number, y: number) => { p[i] = { x, y, visibilidad: 1 }; };
    // Mira hacia la derecha de la imagen (nariz a la derecha de la oreja).
    set(PUNTO.nariz, 560, 95); set(PUNTO.orejaDer, 530, 100);
    set(PUNTO.hombroDer, 505, 250); set(PUNTO.caderaDer, 500, 550);
    set(PUNTO.rodillaDer, 505, 800); set(PUNTO.tobilloDer, 495, 1050);
    const pl = plomada(p, 'sagital')!;
    expect(pl.desviaciones.find(d => d.id === 'oreja')!.px).toBeGreaterThan(30);
  });
});

describe('vista posterior', () => {
  it('intercambia izquierda y derecha para que el rótulo corresponda al lado real', async () => {
    const { espejarLados } = await import('../lib/biomecanica');
    const p = frontal();
    const e = espejarLados(p);
    expect(e[PUNTO.hombroIzq]).toEqual(p[PUNTO.hombroDer]);
    expect(e[PUNTO.tobilloDer]).toEqual(p[PUNTO.tobilloIzq]);
    expect(e[PUNTO.nariz]).toEqual(p[PUNTO.nariz]);
  });
});
