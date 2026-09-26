import React, { useCallback, useEffect, useRef, useState } from 'react';
import { detectarPuntos } from '../lib/detectorPose';
import { dibujarAnalisisPostural, componerImagenAnotada } from '../lib/dibujoPostural';
import {
  medicionesFrontales, medicionesSagitales, evaluarCalidad, anguloEn,
  longitudTronco, razonNormalizada, interpretarCharpy, escalaPorEstatura, distanciasCm,
  distribucionCarga, plomada, espejarLados,
  type Medicion, type Punto, type AvisoCalidad, type DistanciaCm, type DistribucionCarga,
} from '../lib/biomecanica';

// Medición angular sobre una fotografía clínica.
//
// Aquí sí se mide. Los puntos anatómicos los localiza un modelo de visión que
// corre en el navegador, y los ángulos salen de esos puntos con trigonometría.
// Lo que NO se puede dar son distancias: sin un objeto de referencia en la
// escena no hay escala, así que las diferencias entre lados se expresan como
// porcentaje del ancho de hombros del propio paciente.
//
// El goniómetro manual existe porque el detector solo conoce el cuerpo completo:
// para el test de Adams, un pie o una radiografía no sirve. Ahí el profesional
// pone los tres puntos y el ángulo se calcula igual de bien.

interface Props {
  imagen: string;
  plano: 'frontal' | 'sagital';
  /** Se llama al medir para que la ficha lo guarde. */
  onMediciones?: (m: Medicion[]) => void;
  /** Diámetro torácico capturado, ya normalizado por la longitud del tronco. */
  onDiametroTorax?: (cual: 'transverso' | 'ap', razon: number) => void;
  /** Talla del paciente en cm: con ella las distancias salen en cm (aproximados). */
  estaturaCm?: number | null;
  /** Guarda la talla escrita aquí en la ficha. */
  onEstatura?: (cm: number) => void;
  /** Distancias en cm calculadas con la escala por talla. */
  onDistancias?: (d: DistanciaCm[]) => void;
  /** Reparto de carga izquierda/derecha estimado (solo plano frontal). */
  onCarga?: (c: DistribucionCarga | null) => void;
  /** Foto con el dibujo clínico, en JPEG, para el PDF. */
  onImagenAnotada?: (dataUrl: string | null) => void;
  /** Foto de espalda: se corrigen los lados que MediaPipe asume de frente. */
  posterior?: boolean;
}

const COLOR_SEV = { normal: '#10b981', atencion: '#f59e0b', riesgo: '#f43f5e' } as const;
const ETIQUETA_SEV = { normal: 'Normal', atencion: 'Atención', riesgo: 'Revisar' } as const;

const MedicionPostural: React.FC<Props> = ({ imagen, plano, onMediciones, onDiametroTorax, estaturaCm, onEstatura, onDistancias, onCarga, onImagenAnotada, posterior }) => {
  const [vista, setVista] = useState<'clinica' | 'mediciones'>('clinica');
  const [puntos, setPuntos] = useState<Punto[] | null>(null);
  const [tallaEscrita, setTallaEscrita] = useState('');
  const [estado, setEstado] = useState<'inicial' | 'midiendo' | 'listo' | 'error'>('inicial');
  const [error, setError] = useState('');
  const [mediciones, setMediciones] = useState<Medicion[]>([]);
  const [calidad, setCalidad] = useState<AvisoCalidad | null>(null);
  const [dimensiones, setDimensiones] = useState<{ ancho: number; alto: number } | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  // Goniómetro manual: tres clics sobre la foto.
  const [modoGoniometro, setModoGoniometro] = useState(false);
  const [modoManual, setModoManual] = useState<'angulo' | 'distancia'>('angulo');
  const [puntosManuales, setPuntosManuales] = useState<Punto[]>([]);
  // Referencia de la propia foto para poder dar distancias como razón: sola, una
  // distancia en píxeles no significa nada.
  const [tronco, setTronco] = useState<number | null>(null);

  const lienzo = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const medir = useCallback(async () => {
    setEstado('midiendo');
    setError('');
    try {
      const r0 = await detectarPuntos(imagen);
      const r = r0 && posterior ? { ...r0, puntos: espejarLados(r0.puntos) } : r0;
      if (!r) {
        setEstado('error');
        setError('No se detectó una persona completa en la imagen. Comprueba que se vea el cuerpo entero, con ropa ajustada y buena iluminación.');
        return;
      }
      const cal = evaluarCalidad(r.puntos, plano);
      setCalidad(cal);
      setPuntos(cal.nivel === 'invalido' ? null : r.puntos);
      setTronco(longitudTronco(r.puntos));
      setDimensiones({ ancho: r.ancho, alto: r.alto });

      // Con la captura inválida no se muestran cifras. Una medición precisa
      // sobre una foto mal tomada es peor que ninguna: parece de fiar.
      if (cal.nivel === 'invalido') {
        setMediciones([]);
        setEstado('listo');
        return;
      }

      const ms = plano === 'frontal' ? medicionesFrontales(r.puntos) : medicionesSagitales(r.puntos);
      setMediciones(ms);
      onMediciones?.(ms);
      onCarga?.(plano === 'frontal' ? distribucionCarga(r.puntos) : null);
      setEstado('listo');
      // Imagen anotada para el PDF (se carga con CORS para poder exportarla).
      if (onImagenAnotada) {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => onImagenAnotada(componerImagenAnotada(im, r.puntos, plano));
        im.onerror = () => onImagenAnotada(null);
        im.src = imagen;
      }
    } catch (e: any) {
      setEstado('error');
      setError(e?.message || 'No se pudo ejecutar la medición.');
    }
  }, [imagen, plano, onMediciones, posterior]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dibuja sobre la imagen a tamaño real; el CSS la escala al ancho disponible,
  // así que la geometría no depende de cómo se vea en pantalla.
  useEffect(() => {
    const c = lienzo.current;
    if (!c || !dimensiones) return;
    c.width = dimensiones.ancho;
    c.height = dimensiones.alto;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);

    // Vista clínica: cuadrícula, esqueleto, plomada, centro de masa y carga.
    if (vista === 'clinica' && puntos && !modoGoniometro && !puntosManuales.length) {
      dibujarAnalisisPostural(ctx, puntos, { ancho: dimensiones.ancho, alto: dimensiones.alto, plano });
      return;
    }

    const escala = Math.max(dimensiones.ancho, dimensiones.alto) / 700;
    const grosor = Math.max(2, 3 * escala);
    const radio = Math.max(4, 6 * escala);

    const dibujarMedicion = (m: Medicion, destacada: boolean) => {
      const color = COLOR_SEV[m.severidad];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = destacada ? grosor * 1.8 : grosor;
      ctx.globalAlpha = destacada ? 1 : 0.55;

      ctx.beginPath();
      m.puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      m.puntos.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, escala);
        ctx.stroke();
        ctx.strokeStyle = color;
      });

      if (destacada) {
        const centro = m.puntos.length === 3 ? m.puntos[1] : {
          x: (m.puntos[0].x + m.puntos[m.puntos.length - 1].x) / 2,
          y: (m.puntos[0].y + m.puntos[m.puntos.length - 1].y) / 2,
        };
        const texto = `${m.valor}${m.unidad}`;
        ctx.font = `bold ${Math.round(22 * escala)}px system-ui, sans-serif`;
        const ancho = ctx.measureText(texto).width;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(centro.x + 10 * escala, centro.y - 18 * escala, ancho + 14 * escala, 26 * escala);
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.fillText(texto, centro.x + 17 * escala, centro.y);
      }
      ctx.globalAlpha = 1;
    };

    if (!modoGoniometro) {
      mediciones.forEach(m => dibujarMedicion(m, seleccionada === m.id));
      if (!seleccionada && mediciones.length) {
        // Sin selección se destaca el hallazgo más relevante, para que la imagen
        // diga algo de entrada en vez de mostrar solo líneas de colores.
        const peor = [...mediciones].sort((a, b) =>
          (b.severidad === 'riesgo' ? 2 : b.severidad === 'atencion' ? 1 : 0) -
          (a.severidad === 'riesgo' ? 2 : a.severidad === 'atencion' ? 1 : 0))[0];
        if (peor.severidad !== 'normal') dibujarMedicion(peor, true);
      }
    }

    // Goniómetro manual
    if (puntosManuales.length) {
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = '#38bdf8';
      ctx.lineWidth = grosor;
      ctx.beginPath();
      puntosManuales.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      puntosManuales.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
        ctx.fill();
      });
      if (puntosManuales.length === (modoManual === 'angulo' ? 3 : 2)) {
        const razon = tronco ? razonNormalizada(puntosManuales[0], puntosManuales[1], tronco) : null;
        const texto = modoManual === 'angulo'
          ? `${Math.round(anguloEn(puntosManuales[0], puntosManuales[1], puntosManuales[2]) * 10) / 10}°`
          : razon !== null ? `${razon.toFixed(2)} × tronco` : 'sin referencia';
        ctx.font = `bold ${Math.round(26 * escala)}px system-ui, sans-serif`;
        const v = puntosManuales[modoManual === 'angulo' ? 1 : 0];
        const ancho = ctx.measureText(texto).width;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(v.x + 12 * escala, v.y - 20 * escala, ancho + 16 * escala, 30 * escala);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(texto, v.x + 20 * escala, v.y + 2 * escala);
      }
    }
  }, [mediciones, seleccionada, dimensiones, puntosManuales, modoGoniometro, modoManual, tronco, vista, puntos, plano]);

  const clicEnImagen = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!modoGoniometro || !dimensiones) return;
    const caja = imgRef.current?.getBoundingClientRect();
    if (!caja) return;
    // De coordenadas de pantalla a coordenadas de la imagen original.
    const x = ((e.clientX - caja.left) / caja.width) * dimensiones.ancho;
    const y = ((e.clientY - caja.top) / caja.height) * dimensiones.alto;
    const tope = modoManual === 'angulo' ? 3 : 2;
    setPuntosManuales(prev => (prev.length >= tope ? [{ x, y }] : [...prev, { x, y }]));
  };

  // Distancias en cm: solo con talla, foto válida y cuerpo completo.
  const distancias = React.useMemo(
    () => (puntos ? distanciasCm(puntos, plano, escalaPorEstatura(puntos, estaturaCm)) : []),
    [puntos, plano, estaturaCm],
  );
  useEffect(() => { if (puntos) onDistancias?.(distancias); }, [distancias]); // eslint-disable-line react-hooks/exhaustive-deps

  const anguloManual = modoManual === 'angulo' && puntosManuales.length === 3
    ? Math.round(anguloEn(puntosManuales[0], puntosManuales[1], puntosManuales[2]) * 10) / 10
    : null;
  const razonManual = modoManual === 'distancia' && puntosManuales.length === 2 && tronco
    ? razonNormalizada(puntosManuales[0], puntosManuales[1], tronco)
    : null;
  const charpy = anguloManual !== null ? interpretarCharpy(anguloManual) : null;

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900">
        <div className="relative" onClick={clicEnImagen} style={{ cursor: modoGoniometro ? 'crosshair' : 'default' }}>
          <img ref={imgRef} src={imagen} alt="Fotografía clínica" className="w-full block" />
          <canvas ref={lienzo} className="absolute inset-0 w-full h-full pointer-events-none" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={medir}
          disabled={estado === 'midiendo'}
          className="px-4 py-2.5 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest disabled:opacity-50"
        >
          {estado === 'midiendo' ? 'Detectando puntos…' : estado === 'listo' ? 'Volver a medir' : 'Medir ángulos'}
        </button>
        <button
          type="button"
          onClick={() => { setModoGoniometro(v => !v); setPuntosManuales([]); }}
          className={`px-4 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest border ${
            modoGoniometro ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-700 border-slate-300'
          }`}
        >
          Goniómetro manual
        </button>
        {puntosManuales.length > 0 && (
          <button type="button" onClick={() => setPuntosManuales([])}
            className="px-4 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest border border-slate-300 text-slate-600">
            Borrar puntos
          </button>
        )}
        {puntos && (
          <div className="flex rounded-2xl border border-slate-300 overflow-hidden ml-auto">
            {(['clinica', 'mediciones'] as const).map(v => (
              <button key={v} type="button" onClick={() => { setVista(v); setSeleccionada(null); }}
                aria-pressed={vista === v}
                className={`px-3 py-2.5 font-black text-[11px] uppercase tracking-widest ${vista === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>
                {v === 'clinica' ? 'Vista clínica' : 'Mediciones'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Carga y plomada: resumen de la vista clínica */}
      {puntos && (() => {
        const carga = plano === 'frontal' ? distribucionCarga(puntos) : null;
        const pl = plomada(puntos, plano);
        const cmPx = escalaPorEstatura(puntos, estaturaCm);
        const fmt = (px: number) => cmPx ? `${px >= 0 ? '+' : '−'}${String(Math.round(Math.abs(px) * cmPx * 2) / 2).replace('.', ',')} cm` : `${Math.round(px)} px`;
        if (!carga && !pl) return null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {carga && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2">Distribución de carga</p>
                <div className="flex h-8 rounded-xl overflow-hidden text-xs font-black text-white">
                  <div className="flex items-center justify-center bg-sky-500" style={{ width: `${carga.izq}%` }}>Izq {carga.izq}%</div>
                  <div className="flex items-center justify-center bg-indigo-500" style={{ width: `${carga.der}%` }}>Der {carga.der}%</div>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Estimación por imagen a partir del centro de masa; no reemplaza una plataforma de presión.</p>
              </div>
            )}
            {pl && pl.desviaciones.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2">
                  Plomada {plano === 'sagital' ? '(+ = por delante)' : '(desvío lateral)'}
                </p>
                <div className="space-y-1">
                  {pl.desviaciones.map(d => (
                    <div key={d.id} className="flex justify-between text-xs"><span className="text-slate-600">{d.etiqueta}</span><span className="font-black text-slate-900">{fmt(d.px)}</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {modoGoniometro && (
        <div className="rounded-2xl bg-sky-50 border border-sky-200 px-4 py-3 space-y-2">
          <div className="flex gap-1.5">
            {(['angulo', 'distancia'] as const).map(m => (
              <button key={m} type="button"
                onClick={() => { setModoManual(m); setPuntosManuales([]); }}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                  modoManual === m ? 'bg-sky-600 text-white' : 'bg-white text-sky-700 border border-sky-200'
                }`}>{m === 'angulo' ? 'Ángulo (3 puntos)' : 'Distancia (2 puntos)'}</button>
            ))}
          </div>

          <p className="text-xs font-bold text-sky-900">
            {modoManual === 'angulo' ? (<>
              {puntosManuales.length === 0 && 'Marca el primer extremo del ángulo.'}
              {puntosManuales.length === 1 && 'Marca el vértice del ángulo.'}
              {puntosManuales.length === 2 && 'Marca el segundo extremo.'}
              {anguloManual !== null && `Ángulo medido: ${anguloManual}°`}
            </>) : (<>
              {puntosManuales.length < 2 && 'Marca los dos extremos de la distancia.'}
              {razonManual !== null && `Distancia: ${razonManual.toFixed(2)} veces la longitud del tronco`}
              {puntosManuales.length === 2 && razonManual === null && 'Ejecuta primero "Medir ángulos": hace falta el tronco como referencia.'}
            </>)}
          </p>

          {/* El ángulo de Charpy es la aplicación directa del goniómetro al tórax:
              se marcan los dos rebordes costales y el xifoides. */}
          {charpy && anguloManual !== null && anguloManual > 30 && anguloManual < 160 && (
            <p className="text-[11px] text-sky-800">
              Si acabas de medir el ángulo infraesternal (de Charpy): {charpy.etiqueta.toLowerCase()}. Referencia habitual 70°-90°.
            </p>
          )}

          {razonManual !== null && onDiametroTorax && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[11px] font-bold text-sky-800 w-full">Guardar este diámetro para el índice torácico:</span>
              <button type="button" onClick={() => onDiametroTorax('transverso', razonManual)}
                className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-white text-sky-700 border border-sky-300">
                Transverso (foto frontal)
              </button>
              <button type="button" onClick={() => onDiametroTorax('ap', razonManual)}
                className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-white text-sky-700 border border-sky-300">
                Anteroposterior (foto lateral)
              </button>
            </div>
          )}

          <p className="text-[11px] text-sky-700">
            Sirve sobre cualquier fotografía —test de Adams, un pie, una huella plantar— porque los puntos los pones tú.
            Las distancias van como razón respecto al tronco del propio paciente, nunca en centímetros: sin un objeto de
            referencia en la escena no hay escala. Y son medidas en el plano de la imagen: si el paciente está girado, no
            equivalen a la medida anatómica.
          </p>
        </div>
      )}

      {estado === 'error' && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3">
          <p className="text-xs font-bold text-rose-800">{error}</p>
        </div>
      )}

      {calidad && calidad.nivel !== 'ok' && (
        <div className={`rounded-2xl px-4 py-3 border ${calidad.nivel === 'invalido' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
          {calidad.mensajes.map((m, i) => (
            <p key={i} className={`text-xs font-bold ${calidad.nivel === 'invalido' ? 'text-rose-800' : 'text-amber-800'}`}>{m}</p>
          ))}
        </div>
      )}

      {mediciones.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {mediciones.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setVista('mediciones'); setSeleccionada(s => (s === m.id ? null : m.id)); }}
                className={`text-left rounded-2xl border p-4 transition-all ${
                  seleccionada === m.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">{m.etiqueta}</span>
                  <span className="text-[11px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0"
                    style={{ color: COLOR_SEV[m.severidad], background: `${COLOR_SEV[m.severidad]}1a` }}>
                    {ETIQUETA_SEV[m.severidad]}
                  </span>
                </div>
                <p className="text-2xl font-black mt-1" style={{ color: COLOR_SEV[m.severidad] }}>
                  {m.valor}<span className="text-base ml-0.5">{m.unidad}</span>
                </p>
                <p className="text-xs text-slate-500 leading-relaxed mt-1">{m.lectura}</p>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Ángulos calculados sobre los puntos detectados en el plano de la imagen. No son distancias: sin un objeto de
            referencia en la escena no hay escala, por eso los desniveles se expresan como porcentaje del ancho de hombros.
            Los umbrales orientan la revisión y no constituyen diagnóstico.
          </p>

          {/* Distancias en cm por escala de talla */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Distancias estimadas (cm)</h4>
              {estaturaCm ? <span className="text-[11px] font-bold text-slate-500">Talla {estaturaCm} cm</span> : null}
            </div>
            {!estaturaCm ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[140px]">
                  <span className="text-[11px] font-bold text-slate-600 block mb-1">Talla del paciente (cm)</span>
                  <input
                    type="number" inputMode="numeric" min={50} max={250} value={tallaEscrita}
                    onChange={e => setTallaEscrita(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-base font-bold"
                    placeholder="Ej: 165"
                  />
                </label>
                <button
                  type="button"
                  disabled={!(Number(tallaEscrita) >= 50 && Number(tallaEscrita) <= 250)}
                  onClick={() => onEstatura?.(Number(tallaEscrita))}
                  className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[11px] uppercase tracking-widest disabled:opacity-40"
                >Usar talla</button>
                <p className="w-full text-[11px] text-slate-500">Con la talla, la foto se calibra y los desniveles se muestran en centímetros aproximados.</p>
              </div>
            ) : distancias.length ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {distancias.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-700">{d.etiqueta}</p>
                      <p className="text-[11px] text-slate-500">{d.lectura}</p>
                    </div>
                    <p className="text-lg font-black shrink-0" style={{ color: COLOR_SEV[d.severidad] }}>≈ {String(d.cm).replace('.', ',')} cm</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-bold text-amber-700">
                No se puede calibrar esta foto: se necesita el cuerpo completo, de la cabeza a los pies. Revisa la guía de captura.
              </p>
            )}
            {estaturaCm && distancias.length > 0 && (
              <p className="text-[11px] text-slate-500">Estimado con la talla y la altura de los ojos en la foto. Margen aproximado ±1 cm; exige cámara a la altura de la cadera y sin zoom.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MedicionPostural;
