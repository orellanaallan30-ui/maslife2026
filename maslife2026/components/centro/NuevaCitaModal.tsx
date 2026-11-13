// Agendar una hora desde recepción: profesional, servicio, fecha, hora libre y paciente
// (buscado entre los del centro o nuevo, solo con datos de contacto).

import React, { useEffect, useMemo, useState } from 'react';
import Modal, { campo, etiqueta, botonPrimario, botonSecundario } from './Modal';
import { useDia } from './useDia';
import {
  centerApi, CenterError, slotsLibres, boxParaCita, fechaLarga, pesos,
  type CenterRange, type PatientContact,
} from '../../centerService';
import { toast } from '../../lib/toast';

interface Props {
  centerId: string;
  data: CenterRange;
  rango: { from: string; to: string };
  inicial: { professionalId: string; fecha: string; hora?: string };
  onClose: () => void;
  /** La cita se creó: refrescar y cerrar. */
  onDone: () => void;
  /** Solo refrescar la grilla (p. ej. la hora se tomó mientras se llenaba el formulario). */
  onRefresh: () => void;
}

const DURACIONES = [15, 30, 45, 60, 90, 120];

const NuevaCitaModal: React.FC<Props> = ({ centerId, data, rango, inicial, onClose, onDone, onRefresh }) => {
  const [proId, setProId] = useState(inicial.professionalId);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [servicio, setServicio] = useState(0);              // índice en pro.services; -1 = consulta sin servicio
  const [duracionLibre, setDuracionLibre] = useState(60);
  const [hora, setHora] = useState(inicial.hora || '');
  const [fueraHorario, setFueraHorario] = useState(false);
  const [modo, setModo] = useState<'buscar' | 'nuevo'>('buscar');
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<PatientContact[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [paciente, setPaciente] = useState<PatientContact | null>(null);
  const [nuevo, setNuevo] = useState({ name: '', rut: '', phone: '', email: '', prevision: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const pro = data.professionals.find(p => p.id === proId) || data.professionals[0];
  const sv = servicio >= 0 ? pro?.services[servicio] : undefined;
  const duracion = sv ? sv.duration : duracionLibre;
  const dia = useDia(centerId, fecha, data, rango);

  // Al cambiar de profesional: su primer servicio (o consulta sin servicio si no tiene).
  useEffect(() => { setServicio(pro && pro.services.length ? 0 : -1); }, [proId]); // eslint-disable-line react-hooks/exhaustive-deps

  const libres = useMemo(() => !pro ? [] : slotsLibres({
    schedule: pro.schedule, fecha, duracion, paso: duracion % 30 === 0 ? 30 : 15, ahora: data.ahora,
    citas: dia.citas.filter(c => c.professionalId === pro.id),
  }), [pro, fecha, duracion, dia.citas, data.ahora]);

  // Mantener la hora elegida si sigue libre; si no, proponer la primera.
  useEffect(() => {
    if (fueraHorario) return;
    if (!libres.includes(hora)) setHora(libres[0] || '');
  }, [libres]); // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda de pacientes con espera breve.
  useEffect(() => {
    if (modo !== 'buscar' || paciente) return;
    const t = q.trim();
    if (t.length < 2) { setResultados(null); return; }
    let vigente = true;
    setBuscando(true);
    const id = window.setTimeout(() => {
      centerApi.searchPatients(centerId, t)
        .then(r => { if (vigente) setResultados(r.patients); })
        .catch(e => { if (vigente) { setResultados([]); setError((e as Error).message); } })
        .finally(() => { if (vigente) setBuscando(false); });
    }, 300);
    return () => { vigente = false; window.clearTimeout(id); };
  }, [q, modo, paciente, centerId]);

  const boxId = pro && hora ? boxParaCita(dia.asignaciones, pro.id, fecha, hora, duracion) : null;
  const box = boxId ? data.boxes.find(b => b.id === boxId) : null;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!pro) { setError('Elige un profesional.'); return; }
    if (!hora) { setError('Elige una hora.'); return; }
    if (modo === 'buscar' && !paciente) { setError('Busca y elige un paciente, o usa "Paciente nuevo".'); return; }
    if (modo === 'nuevo' && nuevo.name.trim().length < 3) { setError('Escribe el nombre del paciente.'); return; }
    setGuardando(true);
    try {
      await centerApi.book(centerId, {
        professionalId: pro.id, date: fecha, time: hora,
        serviceName: sv ? sv.name : 'Consulta', duration: sv ? undefined : duracionLibre, fueraHorario,
        patient: modo === 'buscar' ? { id: paciente!.id } : nuevo,
      });
      toast.success(`Hora agendada: ${fechaLarga(fecha)} a las ${hora}`);
      onDone();
    } catch (err) {
      const ce = err as CenterError;
      setError(ce.message);
      if (ce.reason === 'SLOT_TAKEN') onRefresh();   // el formulario queda abierto para elegir otra hora
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Agendar hora" onClose={onClose}>
      <form onSubmit={guardar} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="lg:col-span-2">
            <label className={etiqueta} htmlFor="nc-pro">Profesional</label>
            <select id="nc-pro" className={campo} value={pro?.id || ''} onChange={e => setProId(e.target.value)}>
              {data.professionals.map(p => <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` · ${p.specialty}` : ''}</option>)}
            </select>
          </div>
          <div className={servicio === -1 ? '' : 'lg:col-span-2'}>
            <label className={etiqueta} htmlFor="nc-serv">Servicio</label>
            <select id="nc-serv" className={campo} value={servicio} onChange={e => setServicio(Number(e.target.value))}>
              {pro?.services.map((s, i) => <option key={s.name} value={i}>{s.name} · {s.duration} min · {pesos(s.price)}</option>)}
              <option value={-1}>Consulta (sin servicio definido)</option>
            </select>
          </div>
          {servicio === -1 && (
            <div>
              <label className={etiqueta} htmlFor="nc-dur">Duración</label>
              <select id="nc-dur" className={campo} value={duracionLibre} onChange={e => setDuracionLibre(Number(e.target.value))}>
                {DURACIONES.map(d => <option key={d} value={d}>{d} minutos</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={etiqueta} htmlFor="nc-fecha">Fecha</label>
            <input id="nc-fecha" type="date" className={campo} value={fecha} min={data.ahora.fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="nc-hora">Hora</label>
            {fueraHorario ? (
              <input id="nc-hora" type="time" className={campo} value={hora} onChange={e => setHora(e.target.value)} />
            ) : (
              <select id="nc-hora" className={campo} value={hora} onChange={e => setHora(e.target.value)} disabled={dia.cargando || !libres.length}>
                {dia.cargando && <option value="">Cargando horas…</option>}
                {!dia.cargando && !libres.length && <option value="">Sin horas libres ese día</option>}
                {libres.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-am-muted">
          <span className="inline-flex items-center gap-1">
            <span className="material-icons-round text-base text-slate-400">meeting_room</span>
            {hora ? (box ? box.name : 'Sin box asignado a esa hora') : 'Elige una hora para ver el box'}
          </span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" className="accent-am-600 w-4 h-4" checked={fueraHorario} onChange={e => setFueraHorario(e.target.checked)} />
            Agendar fuera del horario del profesional
          </label>
        </div>
        {dia.error && <p className="text-xs font-bold text-rose-600">{dia.error}</p>}

        <div className="border-t border-am-ink/[0.07] pt-4">
          <div className="flex gap-2 mb-3">
            {(['buscar', 'nuevo'] as const).map(m => (
              <button key={m} type="button" onClick={() => { setModo(m); setError(''); }}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border ${modo === m ? 'bg-am-50 border-am-500 text-am-600' : 'bg-white border-am-ink/15 text-am-muted'}`}>
                {m === 'buscar' ? 'Paciente del centro' : 'Paciente nuevo'}
              </button>
            ))}
          </div>

          {modo === 'buscar' && (paciente ? (
            <div className="flex items-center justify-between gap-3 bg-white/60 border border-am-ink/[0.07] rounded-xl p-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-am-ink truncate">{paciente.name}</p>
                <p className="text-xs font-semibold text-am-muted truncate">{[paciente.rut, paciente.phone, paciente.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</p>
              </div>
              <button type="button" className="text-xs font-bold text-am-600 shrink-0" onClick={() => { setPaciente(null); setQ(''); setResultados(null); }}>Cambiar</button>
            </div>
          ) : (
            <div>
              <label className={etiqueta} htmlFor="nc-q">Buscar por nombre, RUT o teléfono</label>
              <input id="nc-q" className={campo} value={q} onChange={e => setQ(e.target.value)} placeholder="Ej: María Pérez" autoComplete="off" />
              {buscando && <p className="text-xs text-am-muted mt-2">Buscando…</p>}
              {resultados && !buscando && (resultados.length ? (
                <ul className="mt-2 border border-am-ink/[0.07] rounded-xl divide-y divide-am-ink/[0.06] max-h-44 overflow-y-auto">
                  {resultados.map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setPaciente(p)} className="w-full text-left px-3 py-2 hover:bg-am-50/70">
                        <span className="block text-sm font-bold text-am-ink">{p.name}</span>
                        <span className="block text-xs text-am-muted">{[p.rut, p.phone].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-am-muted mt-2">Sin resultados. Usa "Paciente nuevo" para registrarlo.</p>
              ))}
            </div>
          ))}

          {modo === 'nuevo' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="lg:col-span-2">
                <label className={etiqueta} htmlFor="nc-nombre">Nombre completo</label>
                <input id="nc-nombre" className={campo} value={nuevo.name} onChange={e => setNuevo({ ...nuevo, name: e.target.value })} />
              </div>
              <div>
                <label className={etiqueta} htmlFor="nc-rut">RUT</label>
                <input id="nc-rut" className={campo} value={nuevo.rut} onChange={e => setNuevo({ ...nuevo, rut: e.target.value })} placeholder="12.345.678-9" />
              </div>
              <div>
                <label className={etiqueta} htmlFor="nc-tel">Teléfono</label>
                <input id="nc-tel" type="tel" className={campo} value={nuevo.phone} onChange={e => setNuevo({ ...nuevo, phone: e.target.value })} placeholder="+56 9 ..." />
              </div>
              <div>
                <label className={etiqueta} htmlFor="nc-mail">Correo</label>
                <input id="nc-mail" type="email" className={campo} value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })} />
              </div>
              <div>
                <label className={etiqueta} htmlFor="nc-prev">Previsión</label>
                <select id="nc-prev" className={campo} value={nuevo.prevision} onChange={e => setNuevo({ ...nuevo, prevision: e.target.value })}>
                  <option value="">Sin especificar</option>
                  <option>Fonasa</option><option>Isapre</option><option>Particular</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex flex-col-reverse lg:flex-row lg:justify-end gap-2 pt-1">
          <button type="button" className={botonSecundario} onClick={onClose}>Cancelar</button>
          <button type="submit" className={botonPrimario} disabled={guardando}>
            {guardando ? 'Agendando…' : `Agendar${hora ? ` a las ${hora}` : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default NuevaCitaModal;
