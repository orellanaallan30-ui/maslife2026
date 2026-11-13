// Grilla horaria del panel de recepción: una columna por profesional (vista día)
// o por día (vista semana de un profesional). Las citas se ubican por minuto,
// así una cita de 13:30 o de 90 minutos se ve donde corresponde.

import React, { useMemo } from 'react';
import {
  aMin, aHora, diaSemana, horarioDelDia,
  type Assignment, type Box, type CenterAppointment, type CenterPro,
} from '../../centerService';

export interface Columna { key: string; titulo: string; subtitulo?: string; fecha: string; pro: CenterPro }

interface Props {
  columnas: Columna[];
  citas: CenterAppointment[];
  asignaciones: Assignment[];
  boxes: Box[];
  ahora: { fecha: string; minutos: number };
  paso?: number;
  onSlot: (col: Columna, hora: string) => void;
  onCita: (cita: CenterAppointment) => void;
}

const PX_MIN = 1;            // 1 px por minuto → 60 px por hora
export const COLORES_BOX = ['#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#22c55e', '#ef4444', '#14b8a6', '#6366f1'];
export const colorBox = (boxes: Box[], id: string): string => {
  const i = boxes.findIndex(b => b.id === id);
  return (i >= 0 && boxes[i].color) || COLORES_BOX[Math.max(0, i) % COLORES_BOX.length];
};

function estiloCita(c: CenterAppointment): string {
  if (c.ajena) return 'bg-slate-200 border-slate-300 text-slate-500';
  if (c.esBloqueo) return 'bg-slate-100 border-slate-300 text-slate-500';
  switch (c.status) {
    case 'Llegado': return 'bg-emerald-100 border-emerald-400 text-emerald-900';
    case 'En Sesión': return 'bg-sky-100 border-sky-400 text-sky-900';
    case 'Finalizado': return 'bg-slate-100 border-slate-300 text-slate-500';
    case 'Pendiente': return 'bg-amber-100 border-amber-400 text-amber-900';
    default: return 'bg-teal-50 border-teal-500 text-teal-900';
  }
}

const DayGrid: React.FC<Props> = ({ columnas, citas, asignaciones, boxes, ahora, paso = 30, onSlot, onCita }) => {
  // Rango visible: desde la primera hora de atención hasta la última, cubriendo
  // también citas y boxes que queden fuera del horario.
  const [t0, t1] = useMemo(() => {
    let ini = Infinity, fin = -Infinity;
    for (const col of columnas) {
      const h = horarioDelDia(col.pro.schedule, diaSemana(col.fecha));
      if (h.active) { ini = Math.min(ini, aMin(h.start)); fin = Math.max(fin, aMin(h.end)); }
      for (const c of citas) if (c.professionalId === col.pro.id && c.date === col.fecha) {
        ini = Math.min(ini, aMin(c.time)); fin = Math.max(fin, aMin(c.time) + c.duration);
      }
      for (const a of asignaciones) if (a.professionalId === col.pro.id && a.date === col.fecha) {
        ini = Math.min(ini, aMin(a.start)); fin = Math.max(fin, aMin(a.end));
      }
    }
    if (!isFinite(ini)) { ini = 9 * 60; fin = 18 * 60; }
    return [Math.floor(ini / 60) * 60, Math.ceil(fin / 60) * 60];
  }, [columnas, citas, asignaciones]);

  const alto = (t1 - t0) * PX_MIN;
  const filas: number[] = [];
  for (let t = t0; t < t1; t += paso) filas.push(t);

  if (!columnas.length) {
    return <p className="text-sm text-slate-500 p-6">Aún no hay profesionales en este centro. Agrégalos en la pestaña Equipo.</p>;
  }

  return (
    <div className="overflow-auto max-h-[calc(100vh-250px)] min-h-[320px] rounded-2xl border border-slate-200 bg-white">
      <div className="grid" style={{ gridTemplateColumns: `52px repeat(${columnas.length}, minmax(150px, 1fr))`, minWidth: 52 + columnas.length * 150 }}>
        {/* Encabezado */}
        <div className="sticky top-0 left-0 z-30 bg-white border-b border-slate-200" />
        {columnas.map(col => {
          const boxesDia = asignaciones.filter(a => a.professionalId === col.pro.id && a.date === col.fecha);
          return (
            <div key={col.key} className="sticky top-0 z-20 bg-white border-b border-l border-slate-200 px-2 py-2 text-center">
              <p className="text-sm font-black text-slate-800 truncate">{col.titulo}</p>
              {col.subtitulo && <p className="text-[11px] font-semibold text-slate-500 truncate">{col.subtitulo}</p>}
              <div className="flex flex-wrap justify-center gap-1 mt-1 min-h-[18px]">
                {boxesDia.length === 0 && <span className="text-[10px] font-bold text-slate-400">Sin box</span>}
                {boxesDia.map(a => {
                  const color = colorBox(boxes, a.boxId);
                  return (
                    <span key={a.id} className="text-[10px] font-black px-1.5 py-px rounded tabular-nums whitespace-nowrap" style={{ color, boxShadow: `inset 0 0 0 1px ${color}` }}>
                      {boxes.find(x => x.id === a.boxId)?.name || 'Box'} · {a.start} a {a.end}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Columna de horas */}
        <div className="sticky left-0 z-10 bg-white relative" style={{ height: alto }}>
          {filas.filter(t => t % 60 === 0).map(t => (
            <span key={t} className="absolute right-1.5 -translate-y-1/2 text-[11px] font-bold text-slate-400 tabular-nums" style={{ top: (t - t0) * PX_MIN }}>
              {t === t0 ? '' : aHora(t)}
            </span>
          ))}
        </div>

        {/* Columnas */}
        {columnas.map(col => {
          const h = horarioDelDia(col.pro.schedule, diaSemana(col.fecha));
          const hIni = aMin(h.start), hFin = aMin(h.end);
          const delDia = citas.filter(c => c.professionalId === col.pro.id && c.date === col.fecha);
          const ocupan = delDia.filter(c => c.status !== 'Cancelado' && c.status !== 'Finalizado');
          const boxesDia = asignaciones.filter(a => a.professionalId === col.pro.id && a.date === col.fecha);
          const esHoy = col.fecha === ahora.fecha;
          const pasado = col.fecha < ahora.fecha;
          return (
            <div key={col.key} className="relative border-l border-slate-200" style={{ height: alto }}>
              {/* Fondo: horas libres clicables, fuera de horario sombreado */}
              {filas.map(t => {
                const enHorario = h.active && t >= hIni && t + paso <= hFin;
                const yaPaso = pasado || (esHoy && t <= ahora.minutos);
                const ocupado = ocupan.some(c => aMin(c.time) < t + paso && t < aMin(c.time) + c.duration);
                const libre = enHorario && !yaPaso && !ocupado;
                return libre ? (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onSlot(col, aHora(t))}
                    aria-label={`Agendar a las ${aHora(t)} con ${col.pro.name}`}
                    className={`group absolute inset-x-0 text-left hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-none ${t % 60 === 0 ? 'border-t border-slate-200' : 'border-t border-dashed border-slate-100'}`}
                    style={{ top: (t - t0) * PX_MIN, height: paso * PX_MIN }}
                  >
                    <span className="hidden group-hover:inline group-focus-visible:inline text-[11px] font-bold text-primary pl-3">+ {aHora(t)}</span>
                  </button>
                ) : (
                  <div
                    key={t}
                    className={`absolute inset-x-0 ${t % 60 === 0 ? 'border-t border-slate-200' : 'border-t border-dashed border-slate-100'} ${enHorario && !yaPaso ? '' : 'bg-slate-100/70'}`}
                    style={{ top: (t - t0) * PX_MIN, height: paso * PX_MIN }}
                  />
                );
              })}

              {/* Box asignado: franja de color al borde izquierdo */}
              {boxesDia.map(a => {
                const b = boxes.find(x => x.id === a.boxId);
                const color = colorBox(boxes, a.boxId);
                return (
                  <div key={a.id} className="absolute left-0 w-1.5 pointer-events-none rounded-r" title={`${b?.name || 'Box'} · ${a.start} a ${a.end}`}
                    style={{ top: (aMin(a.start) - t0) * PX_MIN, height: (aMin(a.end) - aMin(a.start)) * PX_MIN, background: color }} />
                );
              })}

              {/* Citas */}
              {delDia.map(c => {
                const top = (aMin(c.time) - t0) * PX_MIN;
                const altoCita = Math.max(22, c.duration * PX_MIN - 2);
                const pagada = c.paymentStatus === 'Pagado';
                const nombre = c.esBloqueo ? 'Bloqueado' : c.patientName || 'Sin nombre';
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onCita(c)}
                    className={`absolute left-3 right-1 rounded-lg border-l-4 border px-2 py-0.5 text-left overflow-hidden flex flex-col justify-center shadow-sm hover:shadow-md hover:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${estiloCita(c)}`}
                    style={{ top, height: altoCita }}
                  >
                    {altoCita < 40 ? (
                      <span className="flex items-center gap-1 text-xs leading-tight whitespace-nowrap">
                        <span className="font-bold tabular-nums">{c.time}</span>
                        {c.status === 'Llegado' && <span className="material-icons-round text-[13px]" aria-label="Llegó">how_to_reg</span>}
                        {pagada && <span className="material-icons-round text-[13px]" aria-label="Pagado">paid</span>}
                        <span className="font-black truncate">{nombre}</span>
                      </span>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-[11px] font-bold leading-tight tabular-nums">
                          {c.time}
                          {c.status === 'Llegado' && <span className="material-icons-round text-[13px]" aria-label="Llegó">how_to_reg</span>}
                          {pagada && <span className="material-icons-round text-[13px]" aria-label="Pagado">paid</span>}
                        </span>
                        <span className="block text-xs font-black leading-tight truncate">{nombre}</span>
                        {altoCita >= 56 && !c.ajena && !c.esBloqueo && (
                          <span className="block text-[11px] font-semibold opacity-75 leading-tight truncate">{c.serviceName}</span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}

              {/* Línea de "ahora" */}
              {esHoy && ahora.minutos >= t0 && ahora.minutos <= t1 && (
                <div className="absolute inset-x-0 h-0.5 bg-rose-500 pointer-events-none z-10" style={{ top: (ahora.minutos - t0) * PX_MIN }}>
                  <span className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-rose-500" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DayGrid;
