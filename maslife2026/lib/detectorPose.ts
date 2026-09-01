// Detección de puntos anatómicos sobre una fotografía, en el navegador.
//
// La imagen NUNCA sale del dispositivo para esto: el modelo se ejecuta en local
// con WebAssembly. Es una foto clínica de un paciente (Ley 21.719) y no hay
// ninguna razón para mandarla a un tercero solo para localizar un hombro.
//
// Los recursos (~18 MB) se cargan bajo demanda, la primera vez que el
// profesional pide una medición, y se reutilizan durante toda la sesión. No
// pesan en el arranque de la plataforma.

import type { Punto } from './biomecanica';

const BASE = '/mediapipe';

let cargando: Promise<any> | null = null;
let detector: any = null;

/** Falso mientras no se haya intentado cargar; útil para avisar en la interfaz. */
export let recursosDisponibles: boolean | null = null;

/**
 * Carga el modelo una sola vez. Las llamadas concurrentes comparten la misma
 * promesa: sin esto, pulsar dos veces descargaba 18 MB dos veces.
 */
async function obtenerDetector(): Promise<any> {
  if (detector) return detector;
  if (cargando) return cargando;

  cargando = (async () => {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(BASE);
    detector = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}/pose_landmarker_lite.task` },
      runningMode: 'IMAGE',
      numPoses: 1,
      // Umbrales por encima del valor por defecto: en una evaluación clínica es
      // preferible no detectar a detectar mal, porque un punto mal puesto se
      // convierte en un ángulo con dos decimales que parece de fiar.
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
    });
    recursosDisponibles = true;
    return detector;
  })().catch(e => {
    cargando = null;
    recursosDisponibles = false;
    throw e;
  });

  return cargando;
}

export interface ResultadoDeteccion {
  /** 33 puntos en píxeles de la imagen original. */
  puntos: Punto[];
  ancho: number;
  alto: number;
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Las fotos vienen de URLs firmadas de Supabase: sin CORS el canvas queda
    // contaminado y el detector no puede leer los píxeles.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen. Puede que el enlace haya caducado.'));
    img.src = url;
  });
}

/**
 * Localiza los puntos anatómicos de una fotografía.
 * Devuelve null si no encuentra a nadie: es un resultado legítimo, no un fallo.
 */
export async function detectarPuntos(urlImagen: string): Promise<ResultadoDeteccion | null> {
  const det = await obtenerDetector();
  const img = await cargarImagen(urlImagen);
  const res = det.detect(img);

  const landmarks = res?.landmarks?.[0];
  if (!landmarks?.length) return null;

  // MediaPipe entrega coordenadas normalizadas 0-1. Se pasan a píxeles porque
  // los ángulos solo son correctos si ambos ejes comparten escala: normalizando
  // por separado se deforma la imagen y un ángulo de 45° deja de serlo.
  const puntos: Punto[] = landmarks.map((l: any) => ({
    x: l.x * img.naturalWidth,
    y: l.y * img.naturalHeight,
    visibilidad: l.visibility ?? l.presence ?? 1,
  }));

  return { puntos, ancho: img.naturalWidth, alto: img.naturalHeight };
}

/** Libera el modelo. Útil al cerrar la ficha para no retener 18 MB. */
export function liberarDetector(): void {
  try { detector?.close?.(); } catch { /* ya cerrado */ }
  detector = null;
  cargando = null;
}
