// Panel de recepción: agenda de todos los profesionales del centro en un día
// (o la semana de uno), con horas libres para agendar y gestión de cada cita.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCenter } from '../../CenterContext';
import {
  centerApi, hoyLocal, sumarDias, lunesDe, fechaLarga, fechaCorta, diaSemana, enDemo,
  type CenterAppointment, type CenterRange,
} from '../../centerService';
import DayGrid, { type Columna } from '../../components/centro/DayGrid';
import NuevaCitaModal from '../../components/centro/NuevaCitaModal';
import CitaModal from '../../components/centro/CitaModal';
import { botonPrimario, botonSecundario, campo } from '../../components/centro/Modal';

const REFRESCO_MS = 20000;

const Recepcion: React.FC = () => {
  const { active } = useCenter();
  const centerId = active!.center.id;
  // La demo abierta un domingo parte en lunes, para que no se vea vacía.
  const [fecha, setFecha] = useState(() => { const h = hoyLocal(); return enDemo() && diaSemana(h) === 0 ? sumarDias(h, 1) : h; });
  const [vista, setVista] = useState<'dia' | 'semana'>('dia');
  const [proSemana, setProSemana] = useState('');
  const [ocultos, setOcultos] = useState<string[]>([]);
  const [data, setData] = useState<CenterRange | null>(null);
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState<{ professionalId: string; fecha: string; hora?: string } | null>(null);
  const [citaId, setCitaId] = useState<string | null>(null);

  const rango = useMemo(() => vista === 'dia'
    ? { from: fecha, to: fecha }
    : { from: lunesDe(fecha), to: sumarDias(lunesDe(fecha), 6) }, [fecha, vista]);

  // Evita que una respuesta vieja (de otro día o centro) pise a la más reciente.
  const pedido = useRef(0);
  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    try {
      const r = await centerApi.range(centerId, rango.from, rango.to);
      if (n !== pedido.current) return;
      setData(r); setError('');
    } catch (err) {
      if (n !== pedido.current) return;
      setError((err as Error).message);
    }
  }, [centerId, rango.from, rango.to]);

  useEffect(() => { setData(null); cargar(); }, [cargar]);

  // Refresco automático mientras la pestaña está visible (otra recepcionista o el
  // propio profesional pueden estar agendando al mismo tiempo).
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') cargar(); }, REFRESCO_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar]);

  const pros = data?.professionals || [];
  const proDeSemana = pros.find(p => p.id === proSemana) || pros[0];

  const columnas: Columna[] = useMemo(() => {
    if (!data) return [];
    if (vista === 'dia') {
      return pros.filter(p => !ocultos.includes(p.id)).map(p => ({ key: p.id, titulo: p.name, subtitulo: p.specialty, fecha, pro: p }));
    }
    if (!proDeSemana) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const f = sumarDias(rango.from, i);
      return { key: f, titulo: fechaCorta(f), fecha: f, pro: proDeSemana };
    });
  }, [data, vista, pros, ocultos, fecha, proDeSemana, rango.from]);

  const citasDelDia = (data?.appointments || []).filter(c => c.date === fecha && !c.esBloqueo && !c.ajena);
  const resumen = {
    total: citasDelDia.length,
    llegaron: citasDelDia.filter(c => c.status === 'Llegado' || c.status === 'En Sesión' || c.status === 'Finalizado').length,
    porPagar: citasDelDia.filter(c => c.paymentStatus !== 'Pagado').length,
  };
  const cita: CenterAppointment | undefined = data?.appointments.find(c => c.id === citaId);
  const mover = (dias: number) => setFecha(f => sumarDias(f, dias * (vista === 'semana' ? 7 : 1)));

  return (
    <div className="p-4 lg:p-8 space-y-4">
      {/* Barra superior */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Anterior" className={`${botonSecundario} !px-2.5`} onClick={() => mover(-1)}>
            <span className="material-icons-round text-lg">chevron_left</span>
          </button>
          <button type="button" className={botonSecundario} onClick={() => setFecha(hoyLocal())}>Hoy</button>
          <button type="button" aria-label="Siguiente" className={`${botonSecundario} !px-2.5`} onClick={() => mover(1)}>
            <span className="material-icons-round text-lg">chevron_right</span>
          </button>
          <input type="date" aria-label="Fecha" className={`${campo} !w-auto`} value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} />
        </div>
        <h1 className="text-lg lg:text-xl font-black text-slate-900 lg:ml-2">
          {vista === 'dia' ? fechaLarga(fecha) : `Semana del ${fechaCorta(rango.from)} al ${fechaCorta(rango.to)}`}
        </h1>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-300 overflow-hidden" role="group" aria-label="Vista">
            {(['dia', 'semana'] as const).map(v => (
              <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v}
                className={`px-3 py-2 text-sm font-bold ${vista === v ? 'bg-primary text-white' : 'bg-white text-slate-600'}`}>
                {v === 'dia' ? 'Día' : 'Semana'}
              </button>
            ))}
          </div>
          <button type="button" className={botonPrimario} disabled={!pros.length}
            onClick={() => setNueva({ professionalId: (vista === 'semana' ? proDeSemana?.id : pros.find(p => !ocultos.includes(p.id))?.id) || pros[0]?.id || '', fecha })}>
            <span className="material-icons-round text-base">add</span>Agendar hora
          </button>
        </div>
      </div>

      {/* Resumen del día */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { n: resumen.total, t: 'Citas del día' },
          { n: resumen.llegaron, t: 'Ya llegaron' },
          { n: resumen.porPagar, t: 'Por pagar' },
        ].map(k => (
          <div key={k.t} className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
            <p className="text-2xl font-black text-slate-900 tabular-nums">{data ? k.n : '–'}</p>
            <p className="text-xs font-bold text-slate-500">{k.t}</p>
          </div>
        ))}
      </div>

      {/* Filtro de profesionales (día) o selector (semana) */}
      {data && pros.length > 0 && (vista === 'dia' ? (
        pros.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Profesionales visibles">
            {pros.map(p => {
              const visible = !ocultos.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={visible}
                  onClick={() => setOcultos(o => visible ? [...o, p.id] : o.filter(x => x !== p.id))}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border ${visible ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-slate-300 text-slate-400 line-through'}`}>
                  {p.name}
                </button>
              );
            })}
          </div>
        )
      ) : (
        <select aria-label="Profesional" className={`${campo} lg:!w-80`} value={proDeSemana?.id || ''} onChange={e => setProSemana(e.target.value)}>
          {pros.map(p => <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` · ${p.specialty}` : ''}</option>)}
        </select>
      ))}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl px-4 py-3 text-sm font-bold">
          <span>No se pudo actualizar la agenda: {error}</span>
          <button type="button" className="underline shrink-0" onClick={cargar}>Reintentar</button>
        </div>
      )}

      {!data && !error && (
        <div className="flex items-center justify-center py-20"><span className="material-icons-round animate-spin text-primary text-4xl">sync</span></div>
      )}

      {data && (
        <DayGrid
          columnas={columnas}
          citas={data.appointments}
          asignaciones={data.assignments}
          boxes={data.boxes}
          ahora={data.ahora}
          onSlot={(col, hora) => setNueva({ professionalId: col.pro.id, fecha: col.fecha, hora })}
          onCita={c => setCitaId(c.id)}
        />
      )}

      {data && (
        <p className="text-xs text-slate-500">
          Toca una hora libre para agendar o una cita para gestionarla. La franja de color indica el box asignado. Se actualiza sola cada 20 segundos.
        </p>
      )}

      {nueva && data && (
        <NuevaCitaModal centerId={centerId} data={data} rango={rango} inicial={nueva} onClose={() => setNueva(null)}
          onDone={() => { cargar(); setNueva(null); }} onRefresh={cargar} />
      )}
      {cita && data && (
        <CitaModal centerId={centerId} data={data} rango={rango} cita={cita} onClose={() => setCitaId(null)} onDone={cargar} />
      )}
    </div>
  );
};

export default Recepcion;
