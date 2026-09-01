// Mediciones angulares sobre puntos anatómicos detectados en una fotografía.
//
// QUÉ SE PUEDE Y QUÉ NO, que es lo que decide todo lo demás:
//
// Un ángulo es adimensional. Si se conocen las posiciones en píxeles de hombro,
// cadera y rodilla, el ángulo entre esos tres puntos es una medida real y no
// necesita ninguna calibración. Por eso aquí se mide en GRADOS.
//
// Una distancia, en cambio, sí necesita escala. Sin un objeto de referencia en la
// escena, "2 cm de obliquidad pélvica" es indeterminable: la misma diferencia en
// píxeles significa centímetros distintos según lo lejos que estuviera la cámara.
// Por eso las diferencias entre lados se expresan como PORCENTAJE de un segmento
// del propio paciente (el ancho de hombros), que sí es una razón adimensional.
//
// Todo esto mide sobre el PLANO DE LA IMAGEN. Si el paciente está rotado respecto
// a la cámara, o la cámara no está perpendicular y a la altura adecuada, el ángulo
// medido no es el ángulo anatómico. `evaluarCalidad` detecta los casos más gruesos
// y por eso ninguna medición se entrega sin su aviso de validez.

/** Punto en coordenadas de imagen: x a la derecha, y HACIA ABAJO. */
export interface Punto {
  x: number;
  y: number;
  /** Confianza del detector, 0-1. Ausente en puntos marcados a mano. */
  visibilidad?: number;
}

/** Índices de los 33 puntos de MediaPipe Pose. Izquierda/derecha son del paciente. */
export const PUNTO = {
  nariz: 0,
  orejaIzq: 7, orejaDer: 8,
  hombroIzq: 11, hombroDer: 12,
  codoIzq: 13, codoDer: 14,
  munecaIzq: 15, munecaDer: 16,
  caderaIzq: 23, caderaDer: 24,
  rodillaIzq: 25, rodillaDer: 26,
  tobilloIzq: 27, tobilloDer: 28,
  talonIzq: 29, talonDer: 30,
  puntaPieIzq: 31, puntaPieDer: 32,
} as const;

const grados = (rad: number) => (rad * 180) / Math.PI;

/** Punto medio entre dos puntos. */
export function medio(a: Punto, b: Punto): Punto {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distancia(a: Punto, b: Punto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Ángulo interno en `vertice`, entre los segmentos que van a `a` y a `c`.
 * Devuelve 0-180. Es el goniómetro: tres puntos, un ángulo.
 */
export function anguloEn(a: Punto, vertice: Punto, c: Punto): number {
  const v1x = a.x - vertice.x, v1y = a.y - vertice.y;
  const v2x = c.x - vertice.x, v2y = c.y - vertice.y;
  const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return grados(Math.acos(cos));
}

/**
 * Inclinación de la línea a→b respecto a la HORIZONTAL, en grados.
 * Signo: positivo si el extremo derecho de la imagen queda más BAJO.
 * 0 = línea perfectamente horizontal.
 */
export function inclinacionHorizontal(a: Punto, b: Punto): number {
  const izq = a.x <= b.x ? a : b;
  const der = a.x <= b.x ? b : a;
  // El eje y crece hacia abajo, así que un dy positivo significa "el derecho baja".
  return grados(Math.atan2(der.y - izq.y, Math.abs(der.x - izq.x)));
}

/**
 * Desviación de la línea a→b respecto a la VERTICAL, en grados.
 * Signo: positivo si el extremo superior se desplaza hacia la derecha de la imagen.
 */
export function desviacionVertical(a: Punto, b: Punto): number {
  const sup = a.y <= b.y ? a : b;
  const inf = a.y <= b.y ? b : a;
  return grados(Math.atan2(sup.x - inf.x, Math.abs(inf.y - sup.y)));
}

/**
 * Diferencia de altura entre dos puntos homólogos, como porcentaje del ancho de
 * hombros. Es la alternativa honesta a dar centímetros: una razón entre dos
 * medidas del propio paciente, que no depende de la distancia de la cámara.
 */
export function asimetriaRelativa(izq: Punto, der: Punto, referencia: number): number | null {
  if (!referencia) return null;
  return ((der.y - izq.y) / referencia) * 100;
}

// ── Umbrales ────────────────────────────────────────────────────────────────
// No son puntos de corte diagnósticos: son el umbral a partir del cual conviene
// que el profesional lo mire. La decisión clínica es suya.
export interface Umbral {
  atencion: number;
  riesgo: number;
  unidad: '°' | '%';
}

export const UMBRALES: Record<string, Umbral> = {
  inclinacionHombros: { atencion: 2, riesgo: 4, unidad: '°' },
  inclinacionPelvis: { atencion: 2, riesgo: 4, unidad: '°' },
  inclinacionCabeza: { atencion: 3, riesgo: 6, unidad: '°' },
  desviacionTronco: { atencion: 3, riesgo: 6, unidad: '°' },
  valgoRodilla: { atencion: 7, riesgo: 12, unidad: '°' },
  cabezaAdelantada: { atencion: 10, riesgo: 18, unidad: '°' },
  hiperextensionRodilla: { atencion: 5, riesgo: 10, unidad: '°' },
  alineacionSagital: { atencion: 6, riesgo: 12, unidad: '°' },
};

export type Severidad = 'normal' | 'atencion' | 'riesgo';

export function severidad(valor: number, u: Umbral): Severidad {
  const v = Math.abs(valor);
  if (v >= u.riesgo) return 'riesgo';
  if (v >= u.atencion) return 'atencion';
  return 'normal';
}

export interface Medicion {
  id: string;
  etiqueta: string;
  valor: number;
  unidad: '°' | '%';
  severidad: Severidad;
  /** Lo que significa el signo, para que no haya que adivinarlo. */
  lectura: string;
  /** Puntos que definen la medida, para dibujarla sobre la foto. */
  puntos: Punto[];
}

// ── Calidad de la captura ───────────────────────────────────────────────────

export interface AvisoCalidad {
  nivel: 'ok' | 'aviso' | 'invalido';
  mensajes: string[];
}

/**
 * Comprueba si la foto permite medir. Un ángulo en el plano de la imagen solo
 * equivale al ángulo anatómico si el paciente está de frente y sin rotar; si no,
 * la cifra es precisa pero no significa lo que parece.
 */
export function evaluarCalidad(pts: Punto[], plano: 'frontal' | 'sagital'): AvisoCalidad {
  const mensajes: string[] = [];
  let nivel: AvisoCalidad['nivel'] = 'ok';

  const requeridos = plano === 'frontal'
    ? [PUNTO.hombroIzq, PUNTO.hombroDer, PUNTO.caderaIzq, PUNTO.caderaDer]
    : [PUNTO.hombroIzq, PUNTO.caderaIzq, PUNTO.rodillaIzq, PUNTO.tobilloIzq];

  const pocoVisibles = requeridos.filter(i => (pts[i]?.visibilidad ?? 1) < 0.6);
  if (pocoVisibles.length) {
    mensajes.push('Hay puntos anatómicos que no se detectan con claridad. Repite la foto con ropa ajustada y el cuerpo completo en el encuadre.');
    nivel = 'invalido';
  }

  // ¿Está la persona de pie y erguida? Sin esta comprobación, una foto de alguien
  // sentado o agachado produce cifras perfectamente calculadas y clínicamente
  // absurdas —valgos de 100°, todo en rojo— y el profesional no tiene forma de
  // saber que el problema es la postura de la foto y no el paciente.
  const hIzq = pts[PUNTO.hombroIzq], hDer = pts[PUNTO.hombroDer];
  const cIzq = pts[PUNTO.caderaIzq], cDer = pts[PUNTO.caderaDer];
  if (hIzq && hDer && cIzq && cDer) {
    const tronco = Math.abs(desviacionVertical(medio(hIzq, hDer), medio(cIzq, cDer)));
    if (tronco > 20) {
      mensajes.push('El tronco no aparece vertical: la persona no está de pie y erguida. Las mediciones posturales necesitan bipedestación relajada, de frente o de perfil a la cámara.');
      nivel = 'invalido';
    }
  }

  // Rodillas: en bipedestación el ángulo cadera-rodilla-tobillo ronda los 180°.
  // Una desviación grande significa pierna flexionada, no una alteración del eje.
  for (const [iC, iR, iT] of [
    [PUNTO.caderaIzq, PUNTO.rodillaIzq, PUNTO.tobilloIzq],
    [PUNTO.caderaDer, PUNTO.rodillaDer, PUNTO.tobilloDer],
  ] as const) {
    const c = pts[iC], r = pts[iR], t = pts[iT];
    if (!c || !r || !t) continue;
    if (Math.abs(180 - anguloEn(c, r, t)) > 30) {
      mensajes.push('Hay una rodilla claramente flexionada. En esa posición no se puede valorar el eje de la extremidad.');
      nivel = 'invalido';
      break;
    }
  }

  if (plano === 'frontal') {
    const anchoHombros = Math.abs(pts[PUNTO.hombroDer]?.x - pts[PUNTO.hombroIzq]?.x);
    const anchoCaderas = Math.abs(pts[PUNTO.caderaDer]?.x - pts[PUNTO.caderaIzq]?.x);
    // De frente, los hombros son claramente más anchos que las caderas. Si la
    // proporción se aplana, lo más probable es que el paciente esté girado.
    if (anchoHombros && anchoCaderas && anchoHombros / anchoCaderas < 0.9) {
      mensajes.push('El paciente parece girado respecto a la cámara. En esa posición los ángulos medidos no representan el plano frontal.');
      if (nivel === 'ok') nivel = 'aviso';
    }
  }

  return { nivel, mensajes };
}

// ── Mediciones por plano ────────────────────────────────────────────────────

/** Vista anterior o posterior: simetrías y ejes en el plano frontal. */
export function medicionesFrontales(pts: Punto[]): Medicion[] {
  const m: Medicion[] = [];
  const hIzq = pts[PUNTO.hombroIzq], hDer = pts[PUNTO.hombroDer];
  const cIzq = pts[PUNTO.caderaIzq], cDer = pts[PUNTO.caderaDer];
  if (!hIzq || !hDer || !cIzq || !cDer) return m;

  const anchoHombros = distancia(hIzq, hDer);

  const incHombros = inclinacionHorizontal(hIzq, hDer);
  m.push({
    id: 'inclinacionHombros', etiqueta: 'Inclinación de hombros',
    valor: round1(incHombros), unidad: '°',
    severidad: severidad(incHombros, UMBRALES.inclinacionHombros),
    lectura: descenso(incHombros, hIzq, hDer, 'hombro'),
    puntos: [hIzq, hDer],
  });

  const incPelvis = inclinacionHorizontal(cIzq, cDer);
  m.push({
    id: 'inclinacionPelvis', etiqueta: 'Inclinación pélvica',
    valor: round1(incPelvis), unidad: '°',
    severidad: severidad(incPelvis, UMBRALES.inclinacionPelvis),
    lectura: descenso(incPelvis, cIzq, cDer, 'hemipelvis'),
    puntos: [cIzq, cDer],
  });

  const oIzq = pts[PUNTO.orejaIzq], oDer = pts[PUNTO.orejaDer];
  if (oIzq && oDer) {
    const incCabeza = inclinacionHorizontal(oIzq, oDer);
    m.push({
      id: 'inclinacionCabeza', etiqueta: 'Inclinación de la cabeza',
      valor: round1(incCabeza), unidad: '°',
      severidad: severidad(incCabeza, UMBRALES.inclinacionCabeza),
      lectura: descenso(incCabeza, oIzq, oDer, 'lado'),
      puntos: [oIzq, oDer],
    });
  }

  // Eje del tronco: punto medio de hombros sobre punto medio de caderas. Es la
  // referencia que se usa para sospechar desviación lateral del raquis.
  const mHombros = medio(hIzq, hDer), mCaderas = medio(cIzq, cDer);
  const desvTronco = desviacionVertical(mHombros, mCaderas);
  m.push({
    id: 'desviacionTronco', etiqueta: 'Desviación lateral del tronco',
    valor: round1(desvTronco), unidad: '°',
    severidad: severidad(desvTronco, UMBRALES.desviacionTronco),
    lectura: desvTronco > 0 ? 'Tronco desplazado hacia la derecha de la imagen' : 'Tronco desplazado hacia la izquierda de la imagen',
    puntos: [mHombros, mCaderas],
  });

  // Valgo/varo por lado: ángulo cadera-rodilla-tobillo. 180° es alineación
  // perfecta; se informa la desviación respecto a esa recta.
  for (const [lado, iC, iR, iT] of [
    ['Izquierda', PUNTO.caderaIzq, PUNTO.rodillaIzq, PUNTO.tobilloIzq],
    ['Derecha', PUNTO.caderaDer, PUNTO.rodillaDer, PUNTO.tobilloDer],
  ] as const) {
    const c = pts[iC], r = pts[iR], t = pts[iT];
    if (!c || !r || !t) continue;
    const desviacion = 180 - anguloEn(c, r, t);
    // La rodilla por dentro de la línea cadera-tobillo es valgo; por fuera, varo.
    const haciaLinea = (r.x - c.x) * (t.y - c.y) - (r.y - c.y) * (t.x - c.x);
    const esIzquierda = lado === 'Izquierda';
    const tipo = (haciaLinea > 0) === esIzquierda ? 'Valgo' : 'Varo';
    m.push({
      id: `valgoRodilla${lado}`, etiqueta: `Eje de rodilla ${lado.toLowerCase()}`,
      valor: round1(desviacion), unidad: '°',
      severidad: severidad(desviacion, UMBRALES.valgoRodilla),
      lectura: desviacion < UMBRALES.valgoRodilla.atencion ? 'Eje alineado' : `${tipo} aparente de ${round1(desviacion)}°`,
      puntos: [c, r, t],
    });
  }

  // Asimetría de altura como razón del propio cuerpo, en vez de centímetros.
  const asimHombros = asimetriaRelativa(hIzq, hDer, anchoHombros);
  if (asimHombros !== null) {
    m.push({
      id: 'asimetriaHombros', etiqueta: 'Desnivel de hombros',
      valor: round1(asimHombros), unidad: '%',
      severidad: severidad(asimHombros, { atencion: 3, riesgo: 6, unidad: '%' }),
      lectura: 'Diferencia de altura expresada como % del ancho de hombros (no son centímetros)',
      puntos: [hIzq, hDer],
    });
  }

  return m;
}

/** Vista lateral: alineación sagital. */
export function medicionesSagitales(pts: Punto[], lado: 'Izq' | 'Der' = 'Izq'): Medicion[] {
  const m: Medicion[] = [];
  const oreja = pts[lado === 'Izq' ? PUNTO.orejaIzq : PUNTO.orejaDer];
  const hombro = pts[lado === 'Izq' ? PUNTO.hombroIzq : PUNTO.hombroDer];
  const cadera = pts[lado === 'Izq' ? PUNTO.caderaIzq : PUNTO.caderaDer];
  const rodilla = pts[lado === 'Izq' ? PUNTO.rodillaIzq : PUNTO.rodillaDer];
  const tobillo = pts[lado === 'Izq' ? PUNTO.tobilloIzq : PUNTO.tobilloDer];

  if (oreja && hombro) {
    // Cabeza adelantada: desviación de la línea oreja-hombro respecto a la
    // vertical. Es el equivalente fotográfico del ángulo craneovertebral.
    const adelantada = Math.abs(desviacionVertical(oreja, hombro));
    m.push({
      id: 'cabezaAdelantada', etiqueta: 'Adelantamiento de la cabeza',
      valor: round1(adelantada), unidad: '°',
      severidad: severidad(adelantada, UMBRALES.cabezaAdelantada),
      lectura: 'Desviación de la línea oreja-hombro respecto a la vertical',
      puntos: [oreja, hombro],
    });
  }

  if (oreja && hombro && cadera) {
    // Alineación sagital global. Es un indicador de superficie: NO es un ángulo
    // de Cobb ni mide la curvatura de la columna, que requiere radiografía.
    const alineacion = 180 - anguloEn(oreja, hombro, cadera);
    m.push({
      id: 'alineacionSagital', etiqueta: 'Alineación sagital oreja-hombro-cadera',
      valor: round1(alineacion), unidad: '°',
      severidad: severidad(alineacion, UMBRALES.alineacionSagital),
      lectura: 'Indicador de superficie de la actitud postural. No mide la curvatura vertebral: eso requiere radiografía.',
      puntos: [oreja, hombro, cadera],
    });
  }

  if (cadera && rodilla && tobillo) {
    const anguloRodilla = anguloEn(cadera, rodilla, tobillo);
    const recurvatum = 180 - anguloRodilla;
    // Con la rodilla en extensión el ángulo ronda los 180°. Por debajo hay flexión
    // residual; por encima no puede pasar, así que el recurvatum se detecta por la
    // posición de la rodilla por delante de la línea cadera-tobillo.
    const rodillaAdelante = (rodilla.x - cadera.x) * (tobillo.y - cadera.y) - (rodilla.y - cadera.y) * (tobillo.x - cadera.x);
    const hiper = Math.abs(recurvatum) > 3 && rodillaAdelante !== 0;
    m.push({
      id: 'anguloRodillaSagital', etiqueta: 'Ángulo de rodilla (sagital)',
      valor: round1(anguloRodilla), unidad: '°',
      severidad: severidad(recurvatum, UMBRALES.hiperextensionRodilla),
      lectura: hiper
        ? 'Desviación respecto a la extensión completa: valorar recurvatum o flexo'
        : 'Rodilla en extensión',
      puntos: [cadera, rodilla, tobillo],
    });
  }

  return m;
}

/**
 * Profundidad de sentadilla a partir de los fotogramas de un vídeo.
 * Es la medida más defendible que se puede sacar de un vídeo sin sincronizar,
 * porque solo necesita el instante de máxima flexión y no la fase del ciclo.
 *
 * Relevante para sospechar restricción de dorsiflexión de tobillo: cuando el
 * Aquiles está acortado, la sentadilla no baja y el tronco se inclina más.
 */
export function analizarSentadilla(fotogramas: Punto[][], lado: 'Izq' | 'Der' = 'Izq'): {
  flexionMaxima: number;
  inclinacionTroncoEnMaxima: number;
  fotogramaMaximo: number;
} | null {
  const iC = lado === 'Izq' ? PUNTO.caderaIzq : PUNTO.caderaDer;
  const iR = lado === 'Izq' ? PUNTO.rodillaIzq : PUNTO.rodillaDer;
  const iT = lado === 'Izq' ? PUNTO.tobilloIzq : PUNTO.tobilloDer;
  const iH = lado === 'Izq' ? PUNTO.hombroIzq : PUNTO.hombroDer;

  let mejor: { flexion: number; tronco: number; idx: number } | null = null;
  fotogramas.forEach((pts, idx) => {
    const c = pts[iC], r = pts[iR], t = pts[iT], h = pts[iH];
    if (!c || !r || !t || !h) return;
    const flexion = 180 - anguloEn(c, r, t);
    if (!mejor || flexion > mejor.flexion) {
      mejor = { flexion, tronco: Math.abs(desviacionVertical(h, c)), idx };
    }
  });

  if (!mejor) return null;
  const m = mejor as { flexion: number; tronco: number; idx: number };
  return {
    flexionMaxima: round1(m.flexion),
    inclinacionTroncoEnMaxima: round1(m.tronco),
    fotogramaMaximo: m.idx,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function descenso(inclinacion: number, izq: Punto, der: Punto, que: string): string {
  if (Math.abs(inclinacion) < 1) return 'Sin desnivel apreciable';
  // El punto "izquierdo" del paciente aparece a la derecha en una vista anterior,
  // así que se describe por posición en la imagen y no por lado anatómico: quién
  // es izquierda depende de si la foto es anterior o posterior.
  const ladoImagen = (der.y > izq.y) === (der.x > izq.x) ? 'derecho' : 'izquierdo';
  return `El ${que} del lado ${ladoImagen} de la imagen aparece descendido ${Math.abs(round1(inclinacion))}°`;
}
