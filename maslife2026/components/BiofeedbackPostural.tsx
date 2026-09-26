import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prepararDetectorVideo, detectarEnVideo } from '../lib/detectorPose';
import { dibujarAnalisisPostural } from '../lib/dibujoPostural';
import {
  medicionesFrontales, medicionesSagitales, distribucionCarga, evaluarCalidad, cuerpoCompleto, espejarLados,
  type Medicion, type DistribucionCarga, type Punto,
} from '../lib/biomecanica';

// Biofeedback postural en vivo: el paciente se ve con el esqueleto, la plomada y
// la carga en tiempo real, y cada indicador cambia de color al corregir. Todo se
// procesa en el dispositivo (MediaPipe local); el video no se envía a ningún lado.
// "Capturar" guarda el cuadro actual (sin dibujo) en la vista elegida de la ficha.

const VISTAS = [
  { label: 'Anterior', plano: 'frontal' },
  { label: 'Posterior', plano: 'frontal' },
  { label: 'Lateral Der.', plano: 'sagital' },
  { label: 'Lateral Izq.', plano: 'sagital' },
] as const;

const COLOR = { normal: 'bg-emerald-500', atencion: 'bg-amber-500', riesgo: 'bg-rose-500' } as const;

interface Props {
  /** Qué vistas ya tienen foto (para marcarlas y avanzar a la siguiente). */
  ocupadas: boolean[];
  onCapturar: (archivo: File, slot: number) => Promise<void>;
  onClose: () => void;
}

const BiofeedbackPostural: React.FC<Props> = ({ ocupadas, onCapturar, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const ultimoRef = useRef(0);
  const [camara, setCamara] = useState<'environment' | 'user'>('environment');
  const [estado, setEstado] = useState<'iniciando' | 'listo' | 'error'>('iniciando');
  const [error, setError] = useState('');
  const [vista, setVista] = useState(() => Math.max(0, ocupadas.findIndex(o => !o)));
  const [indicadores, setIndicadores] = useState<{ ms: Medicion[]; carga: DistribucionCarga | null; aviso: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardadas, setGuardadas] = useState<boolean[]>(ocupadas.slice(0, 4));
  const [temporizador, setTemporizador] = useState(false);
  const [cuenta, setCuenta] = useState(0);

  const plano = VISTAS[vista].plano;
  const planoRef = useRef(plano);
  planoRef.current = plano;
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  const camaraRef = useRef(camara);
  camaraRef.current = camara;

  const detener = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // Cámara
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setEstado('iniciando');
      setError('');
      detener();
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado('error');
        setError('Este navegador no permite usar la cámara. Abre clinicamaslife.cl en Safari o Chrome.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: camara, width: { ideal: 1280 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        await prepararDetectorVideo();
        if (cancelado) return;
        setEstado('listo');
        const bucle = (t: number) => {
          rafRef.current = requestAnimationFrame(bucle);
          if (t - ultimoRef.current < 66) return; // ~15 fps
          ultimoRef.current = t;
          const vid = videoRef.current, cv = lienzoRef.current;
          if (!vid || !cv || vid.readyState < 2) return;
          if (cv.width !== vid.videoWidth) { cv.width = vid.videoWidth; cv.height = vid.videoHeight; }
          const ctx = cv.getContext('2d');
          if (!ctx) return;
          ctx.clearRect(0, 0, cv.width, cv.height);
          let pts: Punto[] | null = null;
          try { pts = detectarEnVideo(vid, t); } catch { pts = null; }
          if (!pts) { setIndicadores({ ms: [], carga: null, aviso: 'Colócate frente a la cámara, de cuerpo entero.' }); return; }
          // De espaldas, MediaPipe invierte los lados.
          if (vistaRef.current === 1) pts = espejarLados(pts);
          const pl = planoRef.current;
          // Cámara frontal: se ve en espejo. Se reflejan los puntos (no el lienzo)
          // para que los textos no queden al revés.
          const ptsDibujo = camaraRef.current === 'user' ? pts.map(p => ({ ...p, x: cv.width - p.x })) : pts;
          dibujarAnalisisPostural(ctx, ptsDibujo, { ancho: cv.width, alto: cv.height, plano: pl, capas: { cuadricula: true } });
          const cal = evaluarCalidad(pts, pl);
          const ms = cal.nivel === 'invalido' ? [] : (pl === 'frontal' ? medicionesFrontales(pts) : medicionesSagitales(pts));
          setIndicadores({
            ms: ms.filter(m => ['inclinacionHombros', 'inclinacionPelvis', 'desviacionTronco', 'inclinacionCabeza', 'cabezaAdelantada', 'alineacionSagital'].includes(m.id)),
            carga: pl === 'frontal' ? distribucionCarga(pts) : null,
            aviso: !cuerpoCompleto(pts) ? 'Aléjate: deben verse la cabeza y los pies.' : cal.mensajes[0] || '',
          });
        };
        rafRef.current = requestAnimationFrame(bucle);
      } catch (e: any) {
        setEstado('error');
        const enApp = /GSA\/|FBAN|FBAV|Instagram/.test(navigator.userAgent);
        setError(
          e?.name === 'NotAllowedError'
            ? `No hay permiso para usar la cámara. ${enApp ? 'Abre clinicamaslife.cl en Safari y permite la cámara.' : 'Actívalo en los ajustes del navegador (ícono junto a la dirección) e intenta de nuevo.'}`
            : e?.name === 'NotFoundError'
              ? 'No se encontró una cámara en este dispositivo.'
              : `No se pudo iniciar la cámara${enApp ? ': dentro de la app de Google puede estar bloqueada; abre clinicamaslife.cl en Safari' : ''}.`,
        );
      }
    })();
    return () => { cancelado = true; detener(); };
  }, [camara, detener]);

  const capturar = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || guardando) return;
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext('2d')!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) return;
    setGuardando(true);
    try {
      await onCapturar(new File([blob], `postura-${VISTAS[vista].label}.jpg`, { type: 'image/jpeg' }), vista);
      setGuardadas(g => { const n = [...g]; n[vista] = true; return n; });
      const siguiente = [0, 1, 2, 3].find(i => i !== vista && !guardadas[i]);
      if (siguiente !== undefined) setVista(siguiente);
    } catch {
      // La ficha ya avisó del error; se queda en la misma vista para reintentar.
    } finally {
      setGuardando(false);
    }
  }, [guardando, onCapturar, vista, guardadas]);

  // Temporizador de 5 s para que el profesional pueda alejarse o el paciente acomodarse.
  useEffect(() => {
    if (cuenta <= 0) return;
    const t = setTimeout(() => { if (cuenta === 1) { setCuenta(0); capturar(); } else setCuenta(cuenta - 1); }, 1000);
    return () => clearTimeout(t);
  }, [cuenta, capturar]);

  const espejo = camara === 'user' ? 'scale-x-[-1]' : '';

  return createPortal(
    <div className="fixed inset-0 z-[150] bg-slate-950 text-white flex flex-col" style={{ height: '100dvh' }} role="dialog" aria-modal="true" aria-label="Biofeedback postural en vivo">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <p className="font-black text-sm">Biofeedback postural</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCamara(c => (c === 'environment' ? 'user' : 'environment'))}
            className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center" aria-label="Cambiar cámara" title="Cambiar cámara">
            <span className="material-icons-round">cameraswitch</span>
          </button>
          <button type="button" onClick={() => { detener(); onClose(); }}
            className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center" aria-label="Cerrar" title="Cerrar">
            <span className="material-icons-round">close</span>
          </button>
        </div>
      </div>

      {/* Video + dibujo */}
      <div className="relative flex-1 min-h-0">
        <video ref={videoRef} playsInline muted autoPlay className={`absolute inset-0 w-full h-full object-contain ${espejo}`} />
        <canvas ref={lienzoRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />

        {estado === 'iniciando' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-sm font-bold">Preparando cámara y detector…</p>
          </div>
        )}
        {estado === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm bg-white text-slate-800 rounded-2xl p-5 text-sm font-bold text-center">{error}</div>
          </div>
        )}
        {cuenta > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-8xl font-black drop-shadow-lg">{cuenta}</span>
          </div>
        )}

        {/* Indicadores en vivo */}
        {estado === 'listo' && indicadores && (
          <div className="absolute left-2 right-2 top-2 flex flex-col items-start gap-1.5 pointer-events-none">
            {indicadores.aviso && (
              <span className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black">{indicadores.aviso}</span>
            )}
            <div className="flex flex-wrap gap-1.5">
              {indicadores.ms.map(m => (
                <span key={m.id} className={`px-3 py-1.5 rounded-xl text-xs font-black text-white ${COLOR[m.severidad]}`}>
                  {m.etiqueta}: {String(m.valor).replace('.', ',')}{m.unidad}
                </span>
              ))}
              {indicadores.carga && (
                <span className={`px-3 py-1.5 rounded-xl text-xs font-black text-white ${COLOR[indicadores.carga.severidad]}`}>
                  Carga I {indicadores.carga.izq}% · D {indicadores.carga.der}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="shrink-0 px-3 pt-2 space-y-2 bg-slate-950" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="grid grid-cols-4 gap-1.5">
          {VISTAS.map((v, i) => (
            <button key={v.label} type="button" onClick={() => setVista(i)} aria-pressed={vista === i}
              className={`py-2 rounded-xl text-[11px] font-black uppercase tracking-wide flex items-center justify-center gap-1 ${
                vista === i ? 'bg-white text-slate-900' : 'bg-white/10 text-white'
              }`}>
              {guardadas[i] && <span className="material-icons-round text-sm text-emerald-500">check_circle</span>}
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setTemporizador(t => !t)} aria-pressed={temporizador}
            className={`h-14 px-4 rounded-2xl text-xs font-black flex items-center gap-1.5 ${temporizador ? 'bg-white text-slate-900' : 'bg-white/10 text-white'}`}>
            <span className="material-icons-round text-base">timer</span>5 s
          </button>
          <button type="button" disabled={estado !== 'listo' || guardando || cuenta > 0}
            onClick={() => (temporizador ? setCuenta(5) : capturar())}
            className="flex-1 h-14 rounded-2xl bg-teal-500 text-white font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
            <span className="material-icons-round">{guardando ? 'sync' : 'photo_camera'}</span>
            {guardando ? 'Guardando…' : `Capturar ${VISTAS[vista].label}`}
          </button>
        </div>
        <p className="text-[11px] text-white/60 text-center">
          Verde = dentro de lo esperado · Amarillo = atención · Rojo = revisar. El video no sale del dispositivo.
        </p>
      </div>
    </div>,
    document.body,
  );
};

export default BiofeedbackPostural;
