import React, { useState } from 'react';

// ── Tipos del informe estructurado que entrega la IA ──────────────────────────
export interface BiomechMetric {
  nombre: string;
  /** Lo observado, en palabras. Sustituye a valor/unidad/rango/umbral. */
  hallazgo?: string;
  severidad: 'normal' | 'atencion' | 'riesgo';
  zona?: string;
  comentario?: string;
  // Campos del esquema anterior. Se conservan OPCIONALES solo para no romper los
  // informes ya guardados en specialty_data de pacientes existentes; no se piden
  // al modelo ni se muestran como medición.
  valor?: number;
  unidad?: string;
  rango_normal?: [number, number];
  umbral_riesgo?: number;
}
export interface BiomechSimetria {
  zona: string;
  izquierda: string;
  derecha: string;
  diferencia: string;
  severidad: 'normal' | 'atencion' | 'riesgo';
}
export interface BiomechReportData {
  metricas: BiomechMetric[];
  simetrias: BiomechSimetria[];
  impresion_global?: string;
  diagnostico?: string;
  cie10?: string;
  objetivos?: string[];
  plan?: string[];
  generado?: string;
  tipo?: string;
}

interface Props {
  report: BiomechReportData;
  images: string[];
  patientName: string;
  rom: Record<string, string>;
  romDefs?: Array<{ id: string; label: string; normal: string }>;
  anthro: { weight?: string; height?: string; reach?: string; legR?: string; legL?: string };
  imc: string | null;
  discrep: string | null;
  onClose: () => void;
}

// Normales por articulación (mismos valores de referencia de la ficha)
const ROM_NORMALS: Record<string, { label: string; normal: number }> = {
  CueFlex: { label: 'Cuello Flexión', normal: 45 },  CueExt: { label: 'Cuello Extensión', normal: 45 },
  CueRotD: { label: 'Cuello Rot. Der.', normal: 80 }, CueRotI: { label: 'Cuello Rot. Izq.', normal: 80 },
  HomFlex: { label: 'Hombro Flexión', normal: 180 },  HomAbd: { label: 'Hombro Abducción', normal: 180 },
  ColFlex: { label: 'Columna Flexión', normal: 90 },  ColExt: { label: 'Columna Extensión', normal: 30 },
  CadFlex: { label: 'Cadera Flexión', normal: 120 },  CadExt: { label: 'Cadera Extensión', normal: 30 },
  RodFlex: { label: 'Rodilla Flexión', normal: 135 }, RodExt: { label: 'Rodilla Extensión', normal: 0 },
  TobFlex: { label: 'Tobillo Flexión', normal: 20 },  TobExt: { label: 'Tobillo Extensión', normal: 50 },
};

const SEV_COLOR = { normal: '#34d399', atencion: '#fbbf24', riesgo: '#fb7185' } as const;
const SEV_LABEL = { normal: 'Normal', atencion: 'Atención', riesgo: 'Riesgo' } as const;

const TABS = ['POSTURA', 'SIMETRÍAS', 'ROM', 'ANTROPOMETRÍA', 'CONCLUSIÓN'] as const;

// Aquí había un medidor con escala normal→atención→riesgo y un marcador situado
// en el valor numérico devuelto por el modelo. Ese número no procedía de ninguna
// medición: la IA lo estimaba mirando una foto sin calibración, sin escala de
// referencia y sin marcadores anatómicos. Presentarlo con umbrales y unidades
// hacía creer que había un instrumento detrás.
//
// Los medidores se mantienen donde los números son reales —la pestaña de ROM,
// que se alimenta de lo que el profesional midió con goniómetro—, y aquí se
// muestra lo observado con su nivel de alerta.

const BiomechReport: React.FC<Props> = ({ report, images, patientName, rom, romDefs, anthro, imc, discrep, onClose }) => {
  const [tab, setTab] = useState<typeof TABS[number]>('POSTURA');
  const [imgIdx, setImgIdx] = useState(0);
  const validImages = images.filter(Boolean);

  // Usa las definiciones personalizadas del profesional si existen (labels y
  // normales editados); si no, los valores de referencia estándar.
  const romSource: Array<[string, { label: string; normal: number }]> = romDefs?.length
    ? romDefs.map(d => [d.id, { label: d.label || d.id, normal: parseFloat(d.normal) || 0 }])
    : Object.entries(ROM_NORMALS);

  const romEntries = romSource
    .map(([key, def]) => {
      const raw = rom[key];
      if (!raw) return null;
      const val = parseFloat(raw);
      if (Number.isNaN(val)) return null;
      // Normal 0 (ej. extensión de rodilla): 0 es perfecto, cada grado resta
      const pctVal = def.normal === 0
        ? Math.max(0, 100 - Math.abs(val) * 10)
        : Math.min(100, (val / def.normal) * 100);
      const color = pctVal >= 90 ? SEV_COLOR.normal : pctVal >= 70 ? SEV_COLOR.atencion : SEV_COLOR.riesgo;
      return { key, label: def.label, normal: def.normal, val, pct: Math.round(pctVal), color };
    })
    .filter(Boolean) as Array<{ key: string; label: string; normal: number; val: number; pct: number; color: string }>;

  const discrepVal = discrep ? parseFloat(discrep) : null;

  return (
    <div className="biomech-report-modal fixed inset-0 z-[200] bg-slate-950 overflow-y-auto">
      <style>{`@media print {
        body * { visibility: hidden; }
        .biomech-report-modal, .biomech-report-modal * { visibility: visible; }
        .biomech-report-modal { position: absolute !important; inset: 0 !important; overflow: visible !important; }
        .biomech-no-print { display: none !important; }
      }`}</style>

      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 lg:px-10 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-amber-400">Informe Biomecánico</p>
            <h2 className="text-lg lg:text-2xl font-black text-white leading-tight">{patientName || 'Paciente'}</h2>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              {report.tipo ? `Análisis ${report.tipo} · ` : ''}{report.generado ? new Date(report.generado).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 biomech-no-print">
            <button onClick={() => window.print()} title="Imprimir / PDF"
              className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center transition-all">
              <span className="material-icons-round text-lg">print</span>
            </button>
            <button onClick={onClose} title="Cerrar"
              className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all">
              <span className="material-icons-round text-lg">close</span>
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-4 overflow-x-auto hide-scrollbar biomech-no-print">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                tab === t ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 lg:px-10 py-6 max-w-7xl mx-auto space-y-6">

        {/* ══ POSTURA ══ */}
        {tab === 'POSTURA' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Foto con grilla y cruz de referencia */}
            {validImages.length > 0 && (
              <div className="lg:col-span-2">
                <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-slate-900">
                  <img src={validImages[imgIdx]} alt="Evaluación postural" className="w-full object-contain max-h-[70vh]" />
                  <div className="absolute inset-0 pointer-events-none" style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)',
                    backgroundSize: '10% 10%',
                  }} />
                  {/* Aquí había una cruz roja fija al 50% del contenedor que
                      parecía una plomada. No se alineaba con el paciente ni con
                      ningún punto anatómico: caía donde cayera el encuadre. Un eje
                      que aparenta medir y no mide es peor que no tener ninguno. */}
                </div>
                <p className="text-[11px] text-slate-500 mt-2 text-center">
                  La cuadrícula es una ayuda visual sin calibrar: no permite medir distancias ni ángulos.
                </p>
                {validImages.length > 1 && (
                  <div className="flex gap-2 mt-3 biomech-no-print">
                    {validImages.map((_, i) => (
                      <button key={i} onClick={() => setImgIdx(i)}
                        className={`w-8 h-8 rounded-lg text-[11px] font-black transition-all ${
                          i === imgIdx ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-400'}`}>{i + 1}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Métricas con medidor */}
            <div className={`${validImages.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5'} grid grid-cols-1 lg:grid-cols-2 gap-4 content-start`}>
              {(report.metricas || []).map((m, i) => (
                <div key={i} className="bg-slate-900 rounded-3xl border border-slate-800 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{m.zona || 'Postura'}</p>
                      <h4 className="text-sm font-black text-white mt-0.5">{m.nombre}</h4>
                    </div>
                    <span className="shrink-0 text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                      style={{ color: SEV_COLOR[m.severidad], background: `${SEV_COLOR[m.severidad]}18` }}>
                      {SEV_LABEL[m.severidad] || m.severidad}
                    </span>
                  </div>
                  {/* El hallazgo descrito ocupa el lugar de la cifra inventada. Los
                      informes guardados con el esquema antiguo traen `valor`; se
                      muestra como estimación visual, nunca como medición. */}
                  {(m.hallazgo || m.valor !== undefined) && (
                    <p className="text-sm font-bold text-white leading-snug mt-3">
                      {m.hallazgo || `Estimación visual: ${m.valor}${m.unidad || ''}`}
                    </p>
                  )}
                  {m.comentario && <p className="text-xs text-slate-400 leading-relaxed mt-2">{m.comentario}</p>}
                </div>
              ))}
              {(report.metricas || []).length === 0 && (
                <p className="text-slate-500 text-sm italic col-span-full py-10 text-center">El análisis no entregó métricas posturales.</p>
              )}
            </div>
          </div>
        )}

        {/* ══ SIMETRÍAS ══ */}
        {tab === 'SIMETRÍAS' && (
          <div className="space-y-4">
            {(report.simetrias || []).map((s, i) => (
              <div key={i} className="bg-slate-900 rounded-3xl border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-black text-white uppercase tracking-widest">{s.zona}</h4>
                  <span className="text-[11px] font-black uppercase tracking-widest px-2 py-1 rounded-full"
                    style={{ color: SEV_COLOR[s.severidad] || '#94a3b8', background: `${SEV_COLOR[s.severidad] || '#94a3b8'}18` }}>
                    {SEV_LABEL[s.severidad] || s.severidad} · Δ {s.diferencia}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800">
                    <p className="text-[11px] font-black uppercase tracking-widest text-sky-400 mb-1">Izquierda</p>
                    <p className="text-sm font-bold text-slate-200">{s.izquierda}</p>
                  </div>
                  <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800">
                    <p className="text-[11px] font-black uppercase tracking-widest text-violet-400 mb-1">Derecha</p>
                    <p className="text-sm font-bold text-slate-200">{s.derecha}</p>
                  </div>
                </div>
              </div>
            ))}
            {(report.simetrias || []).length === 0 && (
              <p className="text-slate-500 text-sm italic py-10 text-center">El análisis no entregó comparación de simetrías.</p>
            )}
          </div>
        )}

        {/* ══ ROM (calculado local desde la ficha) ══ */}
        {tab === 'ROM' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {romEntries.map(r => (
              <div key={r.key} className="bg-slate-900 rounded-3xl border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-black text-white uppercase tracking-widest">{r.label}</h4>
                  <p className="text-xl font-black" style={{ color: r.color }}>{r.val}° <span className="text-[11px] text-slate-500 font-bold">/ {r.normal}°</span></p>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, r.pct)}%`, background: r.color }} />
                </div>
                <p className="text-[11px] font-bold text-slate-500 mt-1">{r.pct}% del rango normal</p>
              </div>
            ))}
            {romEntries.length === 0 && (
              <p className="text-slate-500 text-sm italic py-10 text-center col-span-full">Registra los ROM en la Evaluación Kinesiológica para ver esta vista.</p>
            )}
          </div>
        )}

        {/* ══ ANTROPOMETRÍA ══ */}
        {tab === 'ANTROPOMETRÍA' && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { l: 'Peso', v: anthro.weight, u: 'kg' },
              { l: 'Talla', v: anthro.height, u: 'cm' },
              { l: 'IMC', v: imc, u: '' },
              { l: 'Envergadura', v: anthro.reach, u: 'cm' },
              { l: 'MMII Derecho', v: anthro.legR, u: 'cm' },
              { l: 'MMII Izquierdo', v: anthro.legL, u: 'cm' },
            ].filter(c => c.v).map(c => (
              <div key={c.l} className="bg-slate-900 rounded-3xl border border-slate-800 p-5 text-center">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{c.l}</p>
                <p className="text-3xl font-black text-white mt-1">{c.v}<span className="text-sm text-slate-500 font-bold ml-1">{c.u}</span></p>
              </div>
            ))}
            {discrepVal !== null && !Number.isNaN(discrepVal) && (
              <div className="bg-slate-900 rounded-3xl border border-slate-800 p-5 text-center col-span-2 md:col-span-1">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Discrepancia MMII</p>
                <p className="text-3xl font-black mt-1" style={{ color: Math.abs(discrepVal) >= 1.5 ? SEV_COLOR.riesgo : Math.abs(discrepVal) >= 0.7 ? SEV_COLOR.atencion : SEV_COLOR.normal }}>
                  {discrep}<span className="text-sm text-slate-500 font-bold ml-1">cm</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ══ CONCLUSIÓN ══ */}
        {tab === 'CONCLUSIÓN' && (
          <div className="space-y-4 max-w-4xl">
            {report.impresion_global && (
              <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-400 mb-2">Impresión Biomecánica Global</p>
                <p className="text-sm text-slate-200 leading-relaxed">{report.impresion_global}</p>
              </div>
            )}
            {report.diagnostico && (
              <div className="bg-slate-900 rounded-3xl border border-amber-400/30 p-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-400 mb-2">Diagnóstico Postural Kinesiológico</p>
                <p className="text-base font-black text-white">{report.diagnostico}</p>
                {report.cie10 && <p className="text-xs font-bold text-slate-400 mt-1">CIE-10 sugerido: {report.cie10}</p>}
              </div>
            )}
            {(report.objetivos?.length || 0) > 0 && (
              <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-teal-400 mb-3">Objetivos de Tratamiento</p>
                <ol className="space-y-2">
                  {report.objetivos!.map((o, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-200">
                      <span className="w-5 h-5 rounded-full bg-teal-400/15 text-teal-400 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {o}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {(report.plan?.length || 0) > 0 && (
              <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-sky-400 mb-3">Plan Kinesiológico Sugerido</p>
                <ul className="space-y-2">
                  {report.plan!.map((p, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-200">
                      <span className="material-icons-round text-sky-400 text-sm mt-0.5">check_circle</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-slate-600 italic pt-2">
              Informe generado con asistencia de IA a partir de las imágenes y datos registrados. Debe ser validado por el profesional tratante.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BiomechReport;
