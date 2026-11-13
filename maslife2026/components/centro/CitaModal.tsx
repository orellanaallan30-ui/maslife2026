// Ficha de una cita en recepción: contactar al paciente, marcar llegada y pago,
// reagendar o liberar la hora. Nunca muestra datos clínicos.

import React, { useEffect, useMemo, useState } from 'react';
import Modal, { campo, etiqueta, botonPrimario, botonSecundario, botonPeligro } from './Modal';
import { useDia } from './useDia';
import {
  centerApi, CenterError, slotsLibres, fechaLarga, pesos, telWhatsApp,
  type CenterAppointment, type CenterRange,
} from '../../centerService';
import { toast } from '../../lib/toast';

interface Props {
  centerId: string;
  data: CenterRange;
  rango: { from: string; to: string };
  cita: CenterAppointment;
  onClose: () => void;
  onDone: () => void;
}

const CitaModal: React.FC<Props> = ({ centerId, data, rango, cita, onClose, onDone }) => {
  const [panel, setPanel] = useState<'' | 'reagendar' | 'liberar'>('');
  const [fecha, setFecha] = useState(cita.date);
  const [hora, setHora] = useState('');
  const [avisar, setAvisar] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const pro = data.professionals.find(p => p.id === cita.professionalId);
  const box = cita.boxId ? data.boxes.find(b => b.id === cita.boxId) : null;
  const dia = useDia(centerId, fecha, data, rango);
  const soloLectura = cita.ajena || cita.esBloqueo;
  const cerrada = cita.status === 'Finalizado' || cita.status === 'Cancelado';

  const libres = useMemo(() => !pro ? [] : slotsLibres({
    schedule: pro.schedule, fecha, duracion: cita.duration, paso: cita.duration % 30 === 0 ? 30 : 15, ahora: data.ahora,
    citas: dia.citas.filter(c => c.professionalId === pro.id && c.id !== cita.id),
  }).filter(h => !(fecha === cita.date && h === cita.time)), [pro, fecha, dia.citas, cita, data.ahora]);

  useEffect(() => { if (!libres.includes(hora)) setHora(libres[0] || ''); }, [libres]); // eslint-disable-line react-hooks/exhaustive-deps

  const ejecutar = async (accion: () => Promise<unknown>, okMsg: string, cerrar = true) => {
    setError(''); setOcupado(true);
    try {
      await accion();
      toast.success(okMsg);
      onDone();
      if (cerrar) onClose();
    } catch (err) {
      const ce = err as CenterError;
      setError(ce.message);
      if (ce.reason === 'SLOT_TAKEN') onDone();
    } finally {
      setOcupado(false);
    }
  };

  const wa = telWhatsApp(cita.patientPhone || '');
  const mensaje = `Hola ${cita.patientName.split(' ')[0]}, te escribimos de ${data.center.name} por tu hora del ${fechaLarga(cita.date).toLowerCase()} a las ${cita.time}${pro ? ` con ${pro.name}` : ''}.`;
  const llego = cita.status === 'Llegado';
  const pagada = cita.paymentStatus === 'Pagado';

  return (
    <Modal titulo={cita.esBloqueo ? 'Horario bloqueado' : cita.ajena ? 'Hora ocupada' : cita.patientName || 'Cita'} onClose={onClose}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-xs font-bold text-slate-500">Fecha</dt><dd className="font-bold text-slate-800">{fechaLarga(cita.date)}</dd></div>
          <div><dt className="text-xs font-bold text-slate-500">Hora</dt><dd className="font-bold text-slate-800 tabular-nums">{cita.time} · {cita.duration} min</dd></div>
          <div><dt className="text-xs font-bold text-slate-500">Profesional</dt><dd className="font-bold text-slate-800">{pro?.name || '—'}</dd></div>
          <div><dt className="text-xs font-bold text-slate-500">Box</dt><dd className="font-bold text-slate-800">{box?.name || 'Sin box'}</dd></div>
          {!soloLectura && (
            <>
              <div><dt className="text-xs font-bold text-slate-500">Servicio</dt><dd className="font-bold text-slate-800">{cita.serviceName || 'Consulta'}</dd></div>
              <div><dt className="text-xs font-bold text-slate-500">Estado</dt><dd className="font-bold text-slate-800">{cita.status}{pagada ? ' · Pagado' : ''}</dd></div>
              {cita.patientRut && <div><dt className="text-xs font-bold text-slate-500">RUT</dt><dd className="font-bold text-slate-800">{cita.patientRut}</dd></div>}
              {cita.patientPhone && <div><dt className="text-xs font-bold text-slate-500">Teléfono</dt><dd className="font-bold text-slate-800">{cita.patientPhone}</dd></div>}
              {cita.patientEmail && <div className="col-span-2"><dt className="text-xs font-bold text-slate-500">Correo</dt><dd className="font-bold text-slate-800 break-all">{cita.patientEmail}</dd></div>}
            </>
          )}
        </dl>

        {cita.ajena && <p className="text-sm text-slate-600">El profesional tiene esta hora tomada en otro lugar. Recepción no puede verla ni modificarla.</p>}
        {cita.esBloqueo && <p className="text-sm text-slate-600">El profesional bloqueó este horario desde su agenda. Solo él puede quitar el bloqueo.</p>}

        {!soloLectura && (
          <>
            {/* Contactar */}
            <div className="flex flex-wrap gap-2">
              {wa && (
                <a className={botonSecundario} href={`https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noreferrer">
                  <span className="material-icons-round text-base text-emerald-600">chat</span>WhatsApp
                </a>
              )}
              {cita.patientPhone && (
                <a className={botonSecundario} href={`tel:${cita.patientPhone.replace(/[^\d+]/g, '')}`}>
                  <span className="material-icons-round text-base text-slate-500">call</span>Llamar
                </a>
              )}
              {cita.patientEmail && (
                <a className={botonSecundario} href={`mailto:${cita.patientEmail}?subject=${encodeURIComponent(`Tu hora en ${data.center.name}`)}&body=${encodeURIComponent(mensaje)}`}>
                  <span className="material-icons-round text-base text-slate-500">mail</span>Correo
                </a>
              )}
              {!wa && !cita.patientPhone && !cita.patientEmail && <p className="text-sm text-slate-500">Este paciente no tiene datos de contacto.</p>}
            </div>

            {/* Llegada y pago */}
            {!cerrada && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <button type="button" disabled={ocupado || !['Confirmado', 'Pendiente', 'Llegado'].includes(cita.status)}
                  className={llego ? botonSecundario : botonPrimario}
                  onClick={() => ejecutar(() => centerApi.setStatus(centerId, cita.id, llego ? 'Confirmado' : 'Llegado'), llego ? 'Llegada quitada' : 'Paciente recepcionado', false)}>
                  <span className="material-icons-round text-base">how_to_reg</span>{llego ? 'Quitar llegada' : 'Marcar que llegó'}
                </button>
                <button type="button" disabled={ocupado} className={botonSecundario}
                  onClick={() => ejecutar(() => centerApi.setPaid(centerId, cita.id, !pagada), pagada ? 'Pago quitado' : 'Pago registrado', false)}>
                  <span className="material-icons-round text-base">paid</span>{pagada ? 'Quitar pago' : `Registrar pago${cita.price ? ` · ${pesos(cita.price)}` : ''}`}
                </button>
              </div>
            )}

            {/* Reagendar / liberar */}
            {!cerrada && panel === '' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 border-t border-slate-200 pt-4">
                <button type="button" className={botonSecundario} onClick={() => { setPanel('reagendar'); setError(''); }}>
                  <span className="material-icons-round text-base">event_repeat</span>Reagendar
                </button>
                <button type="button" className={`${botonSecundario} !text-rose-600 !border-rose-200`} onClick={() => { setPanel('liberar'); setError(''); }}>
                  <span className="material-icons-round text-base">event_busy</span>Liberar hora
                </button>
              </div>
            )}

            {panel === 'reagendar' && (
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <p className="text-sm font-black text-slate-800">Reagendar</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={etiqueta} htmlFor="cm-fecha">Nueva fecha</label>
                    <input id="cm-fecha" type="date" className={campo} value={fecha} min={data.ahora.fecha} onChange={e => setFecha(e.target.value)} />
                  </div>
                  <div>
                    <label className={etiqueta} htmlFor="cm-hora">Nueva hora</label>
                    <select id="cm-hora" className={campo} value={hora} onChange={e => setHora(e.target.value)} disabled={dia.cargando || !libres.length}>
                      {dia.cargando && <option value="">Cargando horas…</option>}
                      {!dia.cargando && !libres.length && <option value="">Sin horas libres</option>}
                      {libres.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Se avisará por correo al profesional y al paciente{cita.patientEmail ? '' : ' (este paciente no tiene correo)'}.</p>
                <div className="flex gap-2 justify-end">
                  <button type="button" className={botonSecundario} onClick={() => setPanel('')}>Volver</button>
                  <button type="button" className={botonPrimario} disabled={ocupado || !hora}
                    onClick={() => ejecutar(() => centerApi.reschedule(centerId, cita.id, fecha, hora), `Reagendada: ${fechaLarga(fecha)} a las ${hora}`)}>
                    {ocupado ? 'Guardando…' : 'Confirmar cambio'}
                  </button>
                </div>
              </div>
            )}

            {panel === 'liberar' && (
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <p className="text-sm font-black text-slate-800">¿Liberar esta hora?</p>
                <p className="text-sm text-slate-600">La cita quedará cancelada y el horario volverá a estar disponible.</p>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                  <input type="checkbox" className="accent-primary w-4 h-4" checked={avisar} onChange={e => setAvisar(e.target.checked)} />
                  Avisar por correo al profesional y al paciente
                </label>
                <div className="flex gap-2 justify-end">
                  <button type="button" className={botonSecundario} onClick={() => setPanel('')}>Volver</button>
                  <button type="button" className={botonPeligro} disabled={ocupado}
                    onClick={() => ejecutar(() => centerApi.cancel(centerId, cita.id, avisar), 'Hora liberada')}>
                    {ocupado ? 'Liberando…' : 'Liberar hora'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {(error || dia.error) && <p role="alert" className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error || dia.error}</p>}
      </div>
    </Modal>
  );
};

export default CitaModal;
