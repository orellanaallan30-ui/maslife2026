import { describe, it, expect } from 'vitest';
import {
  PUNTO, anguloEn, inclinacionHorizontal, desviacionVertical, asimetriaRelativa,
  medicionesFrontales, medicionesSagitales, analizarSentadilla, evaluarCalidad,
  severidad, UMBRALES, type Punto,
} from '../lib/biomecanica';

// Tests de las mediciones angulares sobre fotografías.
//
// Contexto: el módulo biomecánico no medía nada — un modelo de lenguaje estimaba
// cifras mirando una foto. Estas funciones sí miden, y por eso hay que demostrar
// que miden bien: son lo único que separa una medición de una conjetura.
//
// Las coordenadas son de imagen: x hacia la derecha, y HACIA ABAJO. Ese detalle
// invierte el signo de casi todo y es donde es fácil equivocarse.

/** Esqueleto de pie, perfectamente simétrico y alineado. */
function cuerpoNeutro(): Punto[] {
  const p: Punto[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibilidad: 1 }));
  p[PUNTO.orejaIzq]   = { x: 480, y: 100, visibilidad: 1 };
  p[PUNTO.orejaDer]   = { x: 520, y: 100, visibilidad: 1 };
  p[PUNTO.hombroIzq]  = { x: 440, y: 200, visibilidad: 1 };
  p[PUNTO.hombroDer]  = { x: 560, y: 200, visibilidad: 1 };
  p[PUNTO.caderaIzq]  = { x: 460, y: 400, visibilidad: 1 };
  p[PUNTO.caderaDer]  = { x: 540, y: 400, visibilidad: 1 };
  p[PUNTO.rodillaIzq] = { x: 460, y: 600, visibilidad: 1 };
  p[PUNTO.rodillaDer] = { x: 540, y: 600, visibilidad: 1 };
  p[PUNTO.tobilloIzq] = { x: 460, y: 800, visibilidad: 1 };
  p[PUNTO.tobilloDer] = { x: 540, y: 800, visibilidad: 1 };
  return p;
}

const buscar = (ms: ReturnType<typeof medicionesFrontales>, id: string) => ms.find(m => m.id === id)!;

describe('geometría básica', () => {
  it('mide un ángulo recto', () => {
    expect(anguloEn({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90, 5);
  });

  it('mide una línea recta como 180°', () => {
    expect(anguloEn({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(180, 5);
  });

  it('no se rompe con puntos coincidentes', () => {
    expect(anguloEn({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(0);
  });

  it('da 0° para una línea horizontal', () => {
    expect(inclinacionHorizontal({ x: 0, y: 50 }, { x: 100, y: 50 })).toBeCloseTo(0, 5);
  });

  it('da inclinación POSITIVA cuando el extremo derecho de la imagen baja', () => {
    // y crece hacia abajo: el punto de la derecha con y mayor está más abajo.
    expect(inclinacionHorizontal({ x: 0, y: 0 }, { x: 100, y: 100 })).toBeCloseTo(45, 5);
  });

  it('da inclinación NEGATIVA cuando el extremo derecho sube', () => {
    expect(inclinacionHorizontal({ x: 0, y: 100 }, { x: 100, y: 0 })).toBeCloseTo(-45, 5);
  });

  it('no depende del orden en que se pasen los puntos', () => {
    const a = { x: 0, y: 0 }, b = { x: 100, y: 100 };
    expect(inclinacionHorizontal(a, b)).toBeCloseTo(inclinacionHorizontal(b, a), 5);
  });

  it('da 0° de desviación para una línea vertical', () => {
    expect(desviacionVertical({ x: 50, y: 0 }, { x: 50, y: 100 })).toBeCloseTo(0, 5);
  });

  it('expresa la asimetría como porcentaje de la referencia, no en píxeles', () => {
    // 12 px de diferencia sobre 120 px de ancho de hombros = 10%.
    expect(asimetriaRelativa({ x: 0, y: 100 }, { x: 120, y: 112 }, 120)).toBeCloseTo(10, 5);
  });

  it('devuelve null si no hay referencia, en vez de dividir por cero', () => {
    expect(asimetriaRelativa({ x: 0, y: 0 }, { x: 1, y: 1 }, 0)).toBeNull();
  });
});

describe('mediciones frontales', () => {
  it('no encuentra desniveles en un cuerpo simétrico', () => {
    const ms = medicionesFrontales(cuerpoNeutro());
    expect(buscar(ms, 'inclinacionHombros').valor).toBeCloseTo(0, 5);
    expect(buscar(ms, 'inclinacionPelvis').valor).toBeCloseTo(0, 5);
    expect(buscar(ms, 'desviacionTronco').valor).toBeCloseTo(0, 5);
    expect(ms.every(m => m.severidad === 'normal')).toBe(true);
  });

  it('detecta un hombro descendido', () => {
    const p = cuerpoNeutro();
    p[PUNTO.hombroDer] = { x: 560, y: 224, visibilidad: 1 };  // 24 px más abajo
    const m = buscar(medicionesFrontales(p), 'inclinacionHombros');
    expect(Math.abs(m.valor)).toBeGreaterThan(10);
    expect(m.severidad).toBe('riesgo');
    expect(m.lectura).toMatch(/descendido/);
  });

  it('detecta obliquidad pélvica', () => {
    const p = cuerpoNeutro();
    p[PUNTO.caderaIzq] = { x: 460, y: 385, visibilidad: 1 };
    const m = buscar(medicionesFrontales(p), 'inclinacionPelvis');
    expect(Math.abs(m.valor)).toBeGreaterThan(UMBRALES.inclinacionPelvis.atencion);
  });

  it('detecta desviación lateral del tronco', () => {
    const p = cuerpoNeutro();
    // Hombros desplazados 40 px a la derecha respecto a las caderas.
    p[PUNTO.hombroIzq] = { x: 480, y: 200, visibilidad: 1 };
    p[PUNTO.hombroDer] = { x: 600, y: 200, visibilidad: 1 };
    const m = buscar(medicionesFrontales(p), 'desviacionTronco');
    expect(m.valor).toBeGreaterThan(UMBRALES.desviacionTronco.atencion);
    expect(m.lectura).toMatch(/derecha/);
  });

  it('mide el eje de la rodilla y lo llama alineado cuando lo está', () => {
    const ms = medicionesFrontales(cuerpoNeutro());
    const izq = buscar(ms, 'valgoRodillaIzquierda');
    expect(izq.valor).toBeCloseTo(0, 1);
    expect(izq.lectura).toMatch(/alineado/);
  });

  it('distingue valgo de varo por el lado hacia el que cae la rodilla', () => {
    // Pierna izquierda del paciente: cadera y tobillo en x=460, línea media en 500.
    const dentro = cuerpoNeutro();
    dentro[PUNTO.rodillaIzq] = { x: 510, y: 600, visibilidad: 1 };  // rodilla hacia la línea media
    const mDentro = buscar(medicionesFrontales(dentro), 'valgoRodillaIzquierda');
    expect(mDentro.valor).toBeGreaterThan(UMBRALES.valgoRodilla.atencion);
    expect(mDentro.lectura).toMatch(/Valgo/);

    const fuera = cuerpoNeutro();
    fuera[PUNTO.rodillaIzq] = { x: 410, y: 600, visibilidad: 1 };   // rodilla hacia fuera
    const mFuera = buscar(medicionesFrontales(fuera), 'valgoRodillaIzquierda');
    expect(mFuera.lectura).toMatch(/Varo/);
  });

  it('expresa el desnivel de hombros en % y lo dice explícitamente', () => {
    const p = cuerpoNeutro();
    p[PUNTO.hombroDer] = { x: 560, y: 212, visibilidad: 1 };
    const m = buscar(medicionesFrontales(p), 'asimetriaHombros');
    expect(m.unidad).toBe('%');
    expect(m.lectura).toMatch(/no son cent/i);
  });

  it('no devuelve nada si faltan los puntos del tronco', () => {
    expect(medicionesFrontales([])).toEqual([]);
  });
});

describe('mediciones sagitales', () => {
  /** Perfil mirando a la derecha de la imagen, bien alineado. */
  function perfilNeutro(): Punto[] {
    const p = cuerpoNeutro();
    p[PUNTO.orejaIzq]   = { x: 500, y: 100, visibilidad: 1 };
    p[PUNTO.hombroIzq]  = { x: 500, y: 200, visibilidad: 1 };
    p[PUNTO.caderaIzq]  = { x: 500, y: 400, visibilidad: 1 };
    p[PUNTO.rodillaIzq] = { x: 500, y: 600, visibilidad: 1 };
    p[PUNTO.tobilloIzq] = { x: 500, y: 800, visibilidad: 1 };
    return p;
  }

  it('no detecta adelantamiento en un perfil alineado', () => {
    const ms = medicionesSagitales(perfilNeutro());
    expect(ms.find(m => m.id === 'cabezaAdelantada')!.valor).toBeCloseTo(0, 5);
    expect(ms.find(m => m.id === 'alineacionSagital')!.valor).toBeCloseTo(0, 5);
  });

  it('detecta la cabeza adelantada', () => {
    const p = perfilNeutro();
    p[PUNTO.orejaIzq] = { x: 540, y: 100, visibilidad: 1 };  // 40 px por delante
    const m = medicionesSagitales(p).find(x => x.id === 'cabezaAdelantada')!;
    expect(m.valor).toBeGreaterThan(UMBRALES.cabezaAdelantada.atencion);
  });

  it('aclara que la alineación sagital no mide la curvatura vertebral', () => {
    const m = medicionesSagitales(perfilNeutro()).find(x => x.id === 'alineacionSagital')!;
    expect(m.lectura).toMatch(/radiograf/i);
  });

  it('mide la rodilla en extensión como ~180°', () => {
    const m = medicionesSagitales(perfilNeutro()).find(x => x.id === 'anguloRodillaSagital')!;
    expect(m.valor).toBeCloseTo(180, 1);
    expect(m.lectura).toMatch(/extensión/);
  });

  it('marca la desviación cuando la rodilla se va de la línea', () => {
    const p = perfilNeutro();
    p[PUNTO.rodillaIzq] = { x: 470, y: 600, visibilidad: 1 };
    const m = medicionesSagitales(p).find(x => x.id === 'anguloRodillaSagital')!;
    expect(m.valor).toBeLessThan(180);
    expect(m.lectura).toMatch(/recurvatum|flexo/);
  });
});

describe('sentadilla a partir de fotogramas', () => {
  it('encuentra el fotograma de máxima flexión', () => {
    const arriba = cuerpoNeutro();
    const medio = cuerpoNeutro();
    medio[PUNTO.rodillaIzq] = { x: 400, y: 580, visibilidad: 1 };
    const abajo = cuerpoNeutro();
    abajo[PUNTO.caderaIzq]  = { x: 460, y: 560, visibilidad: 1 };
    abajo[PUNTO.rodillaIzq] = { x: 380, y: 600, visibilidad: 1 };

    const r = analizarSentadilla([arriba, medio, abajo])!;
    expect(r.fotogramaMaximo).toBe(2);
    expect(r.flexionMaxima).toBeGreaterThan(0);
    expect(typeof r.inclinacionTroncoEnMaxima).toBe('number');
  });

  it('devuelve null si ningún fotograma tiene los puntos necesarios', () => {
    expect(analizarSentadilla([[], []])).toBeNull();
  });
});

describe('calidad de la captura', () => {
  it('acepta una foto frontal correcta', () => {
    expect(evaluarCalidad(cuerpoNeutro(), 'frontal').nivel).toBe('ok');
  });

  it('invalida la medición si los puntos no se ven', () => {
    const p = cuerpoNeutro();
    p[PUNTO.caderaIzq] = { x: 460, y: 400, visibilidad: 0.2 };
    const r = evaluarCalidad(p, 'frontal');
    expect(r.nivel).toBe('invalido');
    expect(r.mensajes[0]).toMatch(/no se detectan/);
  });

  it('rechaza una foto donde la persona no está erguida', () => {
    // Caso real: al probar con una fotografía de una profesional inclinada sobre
    // una paciente, la detección funcionaba y devolvía valgos de 100° con todo en
    // rojo. La medición era correcta y el resultado, absurdo.
    const p = cuerpoNeutro();
    p[PUNTO.hombroIzq] = { x: 340, y: 260, visibilidad: 1 };
    p[PUNTO.hombroDer] = { x: 460, y: 260, visibilidad: 1 };
    const r = evaluarCalidad(p, 'frontal');
    expect(r.nivel).toBe('invalido');
    expect(r.mensajes.join(' ')).toMatch(/no está de pie|tronco no aparece vertical/i);
  });

  it('rechaza una foto con la rodilla flexionada', () => {
    const p = cuerpoNeutro();
    p[PUNTO.rodillaIzq] = { x: 300, y: 600, visibilidad: 1 };  // pierna doblada
    const r = evaluarCalidad(p, 'frontal');
    expect(r.nivel).toBe('invalido');
    expect(r.mensajes.join(' ')).toMatch(/rodilla/i);
  });

  it('avisa cuando el paciente parece girado', () => {
    const p = cuerpoNeutro();
    // Hombros estrechados respecto a las caderas: señal de rotación.
    p[PUNTO.hombroIzq] = { x: 495, y: 200, visibilidad: 1 };
    p[PUNTO.hombroDer] = { x: 525, y: 200, visibilidad: 1 };
    const r = evaluarCalidad(p, 'frontal');
    expect(r.nivel).toBe('aviso');
    expect(r.mensajes.join(' ')).toMatch(/girado/);
  });
});

describe('umbrales', () => {
  it('clasifica por severidad usando el valor absoluto', () => {
    const u = UMBRALES.inclinacionHombros;
    expect(severidad(0.5, u)).toBe('normal');
    expect(severidad(-3, u)).toBe('atencion');   // el signo es el lado, no la gravedad
    expect(severidad(9, u)).toBe('riesgo');
  });
});
