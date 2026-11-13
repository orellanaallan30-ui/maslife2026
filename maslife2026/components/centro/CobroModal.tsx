// Cobrar una cita en recepción: medio de pago, monto (por defecto el precio de la
// cita), referencia, nota y comprobante.

import React, { useState } from 'react';
import Modal, { campo, etiqueta, botonPrimario, botonSecundario } from './Modal';
import { centerApi, MEDIOS, pesos, fechaLarga, type CenterAppointment, type MedioPago } from '../../centerService';
import { toast } from '../../lib/toast';

interface Props {
  centerId: string;
  cita: Pick<CenterAppointment, 'id' | 'patientName' | 'patientEmail' | 'serviceName' | 'price' | 'date' | 'time'> & { professionalName?: string };
  onClose: () => void;
  onDone: (r: { paymentId: string; amount: number; method: MedioPago; reference: string; note: string }) => void;
}

const CobroModal: React.FC<Props> = ({ centerId, cita, onClose, onDone }) => {
  const precio = cita.price || 0;
  const [method, setMethod] = useState<MedioPago>('efectivo');
  const [monto, setMonto] = useState(String(precio || ''));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [recibido, setRecibido] = useState('');
  const [enviar, setEnviar] = useState(!!cita.patientEmail);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const montoNum = Math.round(Number(monto.replace(/\D/g, '')) || 0);
  const distinto = montoNum !== precio;
  const vuelto = method === 'efectivo' && recibido ? Math.round(Number(recibido.replace(/\D/g, '')) || 0) - montoNum : null;

  const cobrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (distinto && !note.trim()) { setError('El monto es distinto al precio: escribe una nota (descuento, abono, convenio…).'); return; }
    setOcupado(true);
    try {
      const r = await centerApi.charge(centerId, {
        appointmentId: cita.id, method, amount: montoNum, reference: reference.trim() || undefined,
        note: note.trim() || undefined, sendReceipt: enviar && !!cita.patientEmail,
      });
      toast.success(`Cobro registrado: ${pesos(r.amount)}${r.afterClose ? ' (después del cierre de caja)' : ''}`);
      onDone({ paymentId: r.paymentId, amount: r.amount, method, reference: reference.trim(), note: note.trim() });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal titulo="Cobrar" subtitulo={`${cita.patientName} · ${cita.serviceName || 'Consulta'} · ${fechaLarga(cita.date)} ${cita.time}`} onClose={onClose} ancho="max-w-md">
      <form onSubmit={cobrar} className="space-y-4" noValidate>
        <div>
          <span className={etiqueta}>Medio de pago</span>
          <div className="grid grid-cols-3 lg:grid-cols-5 gap-2" role="radiogroup" aria-label="Medio de pago">
            {MEDIOS.map(m => (
              <button key={m.value} type="button" role="radio" aria-checked={method === m.value} onClick={() => setMethod(m.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-bold transition ${
                  method === m.value ? 'border-am-500 bg-am-50 text-am-700 ring-4 ring-am-500/10' : 'border-am-ink/10 bg-white/70 text-am-muted hover:bg-white'}`}>
                <span className="material-icons-round text-xl">{m.icon}</span>{m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={etiqueta} htmlFor="cb-monto">Monto</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-am-muted">$</span>
              <input id="cb-monto" inputMode="numeric" className={`${campo} pl-7 text-lg font-black tabular-nums`} value={monto}
                onChange={e => setMonto(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
            <p className="text-[11px] font-semibold text-am-muted mt-1">Precio del servicio: {pesos(precio)}</p>
          </div>
          {method === 'efectivo' ? (
            <div>
              <label className={etiqueta} htmlFor="cb-recibido">Recibido (opcional)</label>
              <input id="cb-recibido" inputMode="numeric" className={`${campo} tabular-nums`} value={recibido}
                onChange={e => setRecibido(e.target.value.replace(/[^\d]/g, ''))} placeholder="Para calcular el vuelto" />
              {vuelto !== null && (
                <p className={`text-xs font-black mt-1 ${vuelto < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {vuelto < 0 ? `Faltan ${pesos(-vuelto)}` : `Vuelto: ${pesos(vuelto)}`}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className={etiqueta} htmlFor="cb-ref">{method === 'transferencia' ? 'N.º de operación' : 'Referencia'} (opcional)</label>
              <input id="cb-ref" className={campo} value={reference} onChange={e => setReference(e.target.value)} placeholder={method === 'transferencia' ? 'Ej: 004512' : 'Ej: últimos 4 dígitos'} />
            </div>
          )}
        </div>

        <div>
          <label className={etiqueta} htmlFor="cb-nota">Nota {distinto ? '(obligatoria: el monto es distinto al precio)' : '(opcional)'}</label>
          <input id="cb-nota" className={campo} value={note} onChange={e => setNote(e.target.value)} placeholder="Ej: descuento convenio, abono, cortesía" />
        </div>

        {cita.patientEmail ? (
          <label className="flex items-center gap-2 text-sm font-semibold text-am-ink cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded accent-am-600" checked={enviar} onChange={e => setEnviar(e.target.checked)} />
            Enviar comprobante a {cita.patientEmail}
          </label>
        ) : (
          <p className="text-xs font-semibold text-am-muted">El paciente no tiene correo: podrás imprimir el comprobante.</p>
        )}

        {error && <p role="alert" className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex flex-col-reverse lg:flex-row lg:justify-end gap-2 pt-1">
          <button type="button" className={botonSecundario} onClick={onClose}>Cancelar</button>
          <button type="submit" className={botonPrimario} disabled={ocupado || (montoNum <= 0 && precio > 0 && !note.trim())}>
            <span className="material-icons-round text-base">point_of_sale</span>
            {ocupado ? 'Registrando…' : `Cobrar ${pesos(montoNum)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CobroModal;
