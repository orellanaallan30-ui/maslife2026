// Dibujo clínico del análisis postural sobre una foto o sobre la cámara en vivo:
// cuadrícula, esqueleto completo, líneas de hombros y pelvis, eje del tronco,
// plomada, centro de masa, carga izquierda/derecha y ángulos de rodilla.
// La misma función se usa en MedicionPostural (foto) y en BiofeedbackPostural
// (video), para que ambas vistas se vean igual.

import {
  PUNTO, medio, anguloEn, centroDeMasa, distribucionCarga, plomada, cuerpoCompleto,
  type Punto,
} from './biomecanica';

export interface CapasPostural {
  cuadricula?: boolean;
  esqueleto?: boolean;
  lineas?: boolean;
  plomada?: boolean;
  carga?: boolean;
  angulos?: boolean;
}

const TODAS: Required<CapasPostural> = { cuadricula: true, esqueleto: true, lineas: true, plomada: true, carga: true, angulos: true };

const AMARILLO = '#facc15', NARANJO = '#f97316', CIAN = '#22d3ee', VERDE = '#10b981', ROJO = '#ef4444', AZUL = '#2563eb';

const SUPERIORES: Array<[number, number]> = [
  [PUNTO.hombroIzq, PUNTO.codoIzq], [PUNTO.codoIzq, PUNTO.munecaIzq],
  [PUNTO.hombroDer, PUNTO.codoDer], [PUNTO.codoDer, PUNTO.munecaDer],
  [PUNTO.hombroIzq, PUNTO.caderaIzq], [PUNTO.hombroDer, PUNTO.caderaDer],
];
const INFERIORES: Array<[number, number]> = [
  [PUNTO.caderaIzq, PUNTO.rodillaIzq], [PUNTO.rodillaIzq, PUNTO.tobilloIzq],
  [PUNTO.caderaDer, PUNTO.rodillaDer], [PUNTO.rodillaDer, PUNTO.tobilloDer],
  [PUNTO.tobilloIzq, PUNTO.talonIzq], [PUNTO.talonIzq, PUNTO.puntaPieIzq], [PUNTO.tobilloIzq, PUNTO.puntaPieIzq],
  [PUNTO.tobilloDer, PUNTO.talonDer], [PUNTO.talonDer, PUNTO.puntaPieDer], [PUNTO.tobilloDer, PUNTO.puntaPieDer],
];
const ARTICULACIONES = [
  PUNTO.hombroIzq, PUNTO.hombroDer, PUNTO.codoIzq, PUNTO.codoDer, PUNTO.munecaIzq, PUNTO.munecaDer,
  PUNTO.caderaIzq, PUNTO.caderaDer, PUNTO.rodillaIzq, PUNTO.rodillaDer, PUNTO.tobilloIzq, PUNTO.tobilloDer,
  PUNTO.talonIzq, PUNTO.talonDer, PUNTO.puntaPieIzq, PUNTO.puntaPieDer,
];

const ve = (p?: Punto) => !!p && (p.visibilidad ?? 1) >= 0.5;

export function dibujarAnalisisPostural(
  ctx: CanvasRenderingContext2D,
  pts: Punto[],
  opts: { ancho: number; alto: number; plano: 'frontal' | 'sagital'; capas?: CapasPostural },
): void {
  const { ancho, alto, plano } = opts;
  const c = { ...TODAS, ...(opts.capas || {}) };
  const k = Math.max(ancho, alto) / 700; // escala de trazos y textos
  const linea = (a: Punto, b: Punto, color: string, w = 3, guiones?: number[]) => {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = w * k; ctx.lineCap = 'round';
    if (guiones) ctx.setLineDash(guiones.map(g => g * k));
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  };
  const rotulo = (texto: string, x: number, y: number, alinear: 'left' | 'right' | 'center' = 'left', fondo = 'rgba(15,23,42,.82)', color = '#fff') => {
    ctx.save();
    ctx.font = `700 ${Math.round(13 * k)}px system-ui, -apple-system, sans-serif`;
    const w = ctx.measureText(texto).width + 12 * k, h = 20 * k;
    const x0 = alinear === 'right' ? x - w : alinear === 'center' ? x - w / 2 : x;
    ctx.fillStyle = fondo; ctx.fillRect(x0, y - h / 2, w, h);
    ctx.fillStyle = color; ctx.textBaseline = 'middle';
    ctx.fillText(texto, x0 + 6 * k, y + 0.5 * k);
    ctx.restore();
  };

  const hI = pts[PUNTO.hombroIzq], hD = pts[PUNTO.hombroDer];
  const cI = pts[PUNTO.caderaIzq], cD = pts[PUNTO.caderaDer];
  const pl = plomada(pts, plano);

  // Cuadrícula: celdas de 1/8 de la altura de la persona, anclada a la plomada.
  if (c.cuadricula) {
    const ojos = [pts[PUNTO.ojoIzq], pts[PUNTO.ojoDer], pts[PUNTO.nariz]].filter(ve);
    const pies = [pts[PUNTO.talonIzq], pts[PUNTO.talonDer], pts[PUNTO.tobilloIzq], pts[PUNTO.tobilloDer]].filter(ve);
    const altoPersona = ojos.length && pies.length
      ? Math.max(...pies.map(p => p.y)) - Math.min(...ojos.map(p => p.y)) : alto * 0.8;
    const celda = Math.max(20, altoPersona / 8);
    const x0 = pl?.x ?? ancho / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,.55)'; ctx.lineWidth = Math.max(1, 1.2 * k);
    for (let x = x0 % celda; x < ancho; x += celda) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, alto); ctx.stroke(); }
    const yBase = pies.length ? Math.max(...pies.map(p => p.y)) : alto;
    for (let y = yBase % celda; y < alto; y += celda) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ancho, y); ctx.stroke(); }
    ctx.restore();
  }

  // Plomada
  if (c.plomada && pl) {
    linea({ x: pl.x, y: 0 }, { x: pl.x, y: alto }, ROJO, 2, [8, 7]);
    if (plano === 'sagital') {
      for (const d of pl.desviaciones) {
        linea(d.punto, { x: pl.x, y: d.punto.y }, 'rgba(239,68,68,.8)', 2);
      }
    }
  }

  // Esqueleto
  if (c.esqueleto) {
    for (const [a, b] of SUPERIORES) if (ve(pts[a]) && ve(pts[b])) linea(pts[a], pts[b], AMARILLO, 4);
    for (const [a, b] of INFERIORES) if (ve(pts[a]) && ve(pts[b])) linea(pts[a], pts[b], NARANJO, 4);
  }

  // Líneas de hombros y pelvis + eje del tronco (plano frontal)
  if (c.lineas && plano === 'frontal') {
    if (ve(hI) && ve(hD)) {
      linea(hI, hD, NARANJO, 4);
      // I / D del paciente
      ctx.save();
      ctx.font = `800 ${Math.round(16 * k)}px system-ui, sans-serif`; ctx.fillStyle = NARANJO; ctx.textAlign = 'center';
      ctx.fillText('I', hI.x, hI.y - 12 * k); ctx.fillText('D', hD.x, hD.y - 12 * k);
      ctx.restore();
    }
    if (ve(cI) && ve(cD)) linea(cI, cD, CIAN, 4);
    if (ve(hI) && ve(hD) && ve(cI) && ve(cD)) linea(medio(hI, hD), medio(cI, cD), VERDE, 3);
  }

  // Articulaciones
  if (c.esqueleto) {
    for (const i of ARTICULACIONES) {
      const p = pts[i];
      if (!ve(p)) continue;
      ctx.save();
      ctx.beginPath(); ctx.arc(p.x, p.y, 6 * k, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3 * k; ctx.strokeStyle = AZUL; ctx.stroke();
      ctx.restore();
    }
  }

  // Ángulos de rodilla
  if (c.angulos) {
    for (const [iC, iR, iT] of [[PUNTO.caderaIzq, PUNTO.rodillaIzq, PUNTO.tobilloIzq], [PUNTO.caderaDer, PUNTO.rodillaDer, PUNTO.tobilloDer]]) {
      const ca = pts[iC], r = pts[iR], t = pts[iT];
      if (!ve(ca) || !ve(r) || !ve(t)) continue;
      const a1 = Math.atan2(ca.y - r.y, ca.x - r.x), a2 = Math.atan2(t.y - r.y, t.x - r.x);
      ctx.save();
      ctx.strokeStyle = ROJO; ctx.lineWidth = 2.5 * k;
      ctx.beginPath(); ctx.arc(r.x, r.y, 26 * k, a1, a2, ((a2 - a1 + 2 * Math.PI) % (2 * Math.PI)) > Math.PI); ctx.stroke();
      ctx.restore();
      rotulo(`${Math.round(anguloEn(ca, r, t))}°`, r.x + 30 * k, r.y, 'left', 'rgba(239,68,68,.9)');
    }
  }

  // Centro de masa y carga (plano frontal)
  if (c.carga && plano === 'frontal') {
    const cm = centroDeMasa(pts);
    if (cm) {
      if (pl) linea({ x: cm.x, y: cm.y }, { x: cm.x, y: Math.max(...[pts[PUNTO.tobilloIzq], pts[PUNTO.tobilloDer]].filter(ve).map(p => p.y), cm.y) }, 'rgba(239,68,68,.55)', 2, [4, 5]);
      ctx.save();
      ctx.beginPath(); ctx.arc(cm.x, cm.y, 9 * k, 0, Math.PI * 2);
      ctx.fillStyle = ROJO; ctx.fill(); ctx.lineWidth = 3 * k; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
    }
    const carga = distribucionCarga(pts);
    if (carga && ve(hI) && ve(hD)) {
      // El lado izquierdo del paciente puede quedar a la derecha de la imagen (vista anterior).
      const izqALaDerecha = hI.x > hD.x;
      const y = ve(cI) ? cI.y : alto / 2;
      const margen = 12 * k;
      rotulo(`Carga Izq: ${carga.izq}%`, izqALaDerecha ? ancho - margen : margen, y, izqALaDerecha ? 'right' : 'left');
      rotulo(`Carga Der: ${carga.der}%`, izqALaDerecha ? margen : ancho - margen, y, izqALaDerecha ? 'left' : 'right');
    }
  }

  if (!cuerpoCompleto(pts)) {
    rotulo('Cuerpo incompleto: aléjate para que se vean cabeza y pies', ancho / 2, 22 * k, 'center', 'rgba(217,119,6,.92)');
  }
}

/** Compone la imagen con el dibujo en un JPEG (para el PDF). */
export function componerImagenAnotada(
  img: HTMLImageElement | HTMLVideoElement,
  pts: Punto[],
  plano: 'frontal' | 'sagital',
  anchoMax = 1000,
): string | null {
  const w0 = img instanceof HTMLVideoElement ? img.videoWidth : img.naturalWidth;
  const h0 = img instanceof HTMLVideoElement ? img.videoHeight : img.naturalHeight;
  if (!w0 || !h0) return null;
  const s = Math.min(1, anchoMax / w0);
  const cv = document.createElement('canvas');
  cv.width = Math.round(w0 * s); cv.height = Math.round(h0 * s);
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  ctx.save(); ctx.scale(s, s);
  dibujarAnalisisPostural(ctx, pts, { ancho: w0, alto: h0, plano });
  ctx.restore();
  try { return cv.toDataURL('image/jpeg', 0.85); } catch { return null; }
}
