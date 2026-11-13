// Caja de recepción: cobros del día por medio de pago, citas por cobrar, total por
// profesional, comprobantes, anulaciones y cierre de caja.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCenter } from '../../CenterContext';
import {
  centerApi, hoyLocal, sumarDias, fechaLarga, pesos, nombreMedio, MEDIOS,
  type Cashbox, type CitaCaja, type Cobro,
} from '../../centerService';
import Modal, { campo, etiqueta, botonPrimario, botonSecundario, botonPeligro, tarjeta } from '../../components/centro/Modal';
import CobroModal from '../../components/centro/CobroModal';
import { imprimirComprobante } from '../../components/centro/Comprobante';
import { toast } from '../../lib/toast';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

const Caja: React.FC = () => {
  const { active } = useCenter();
  const centerId = active!.center.id;
  const [fecha, setFecha] = useState(hoyLocal());
  const [data, setData] = useState<Cashbox | null>(null);
  const [error, setError] = useState('');
  const [cobrar, setCobrar] = useState<CitaCaja | null>(null);
  const [anular, setAnular] = useState<Cobro | null>(null);
  const [motivo, setMotivo] = useState('');
  const [cerrar, setCerrar] = useState(false);
  const [contado, setContado] = useState('');
  const [notaCierre, setNotaCierre] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [errForm, setErrForm] = useState('');

  const cargar = useCallback(async () => {
    try { setData(await centerApi.cashbox(centerId, fecha)); setError(''); }
    catch (err) { setError((err as Error).message); }
  }, [centerId, fecha]);
  useEffect(() => { setData(null); cargar(); }, [cargar]);
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') cargar(); }, 30000);
    return () => window.clearInterval(id);
  }, [cargar]);

  const r = data?.resumen;
  const tarjetas = r ? r.porMedio.debito + r.porMedio.credito : 0;
  const porCobrarTotal = (data?.porCobrar || []).reduce((s, c) => s + (c.price || 0), 0);
  const vigentes = (data?.cobros || []).filter(c => !c.voidedAt);
  const maxPro = r ? Math.max(1, ...(Object.values(r.porProfesional) as { total: number }[]).map(p => p.total)) : 1;
  const contadoNum = Math.round(Number(contado.replace(/\D/g, '')) || 0);
  const diferencia = r && contado !== '' ? contadoNum - r.porMedio.efectivo : null;
  const esHoy = fecha === hoyLocal();

  const comprobante = (c: Cobro) => {
    if (!data) return;
    const ok = imprimirComprobante({
      centro: data.center, numero: c.id, fechaPago: c.createdAt, paciente: c.patientName, profesional: c.professionalName,
      servicio: c.serviceName, citaFecha: c.citaFecha, citaHora: c.citaHora, monto: c.amount, medio: c.method,
      referencia: c.reference, nota: c.note, recibidoPor: c.receivedBy,
    });
    if (!ok) toast.error('El navegador bloqueó la ventana del comprobante. Permite las ventanas emergentes para este sitio.');
  };

  const accion = async (fn: () => Promise<unknown>, ok: string, cerrarFn: () => void) => {
    setErrForm(''); setOcupado(true);
    try { await fn(); toast.success(ok); cerrarFn(); await cargar(); }
    catch (err) { setErrForm((err as Error).message); }
    finally { setOcupado(false); }
  };

  const descargarCSV = () => {
    if (!data) return;
    const cab = ['Hora', 'Paciente', 'Profesional', 'Servicio', 'Medio', 'Referencia', 'Monto', 'Recibido por', 'Estado', 'Nota'];
    const filas = data.cobros.map(c => [hora(c.createdAt), c.patientName, c.professionalName, c.serviceName, nombreMedio(c.method), c.reference, c.voidedAt ? 0 : c.amount, c.receivedBy, c.voidedAt ? `Anulado: ${c.voidReason}` : 'Vigente', c.note]);
    const csv = [cab, ...filas].map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `caja_${fecha}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const kpis = useMemo(() => r ? [
    { t: 'Total cobrado', v: pesos(r.total), s: `${r.cobros} cobro${r.cobros === 1 ? '' : 's'}${r.anulados ? ` · ${r.anulados} anulado${r.anulados === 1 ? '' : 's'}` : ''}`, icon: 'point_of_sale', grande: true },
    { t: 'Efectivo', v: pesos(r.porMedio.efectivo), s: data?.cierre ? `Contado ${pesos(data.cierre.countedCash)}` : 'En caja', icon: 'payments' },
    { t: 'Transferencias', v: pesos(r.porMedio.transferencia), s: 'Por confirmar en el banco', icon: 'account_balance' },
    { t: 'Tarjetas', v: pesos(tarjetas), s: `Débito ${pesos(r.porMedio.debito)} · Crédito ${pesos(r.porMedio.credito)}`, icon: 'credit_card' },
  ] : [], [r, data, tarjetas]);

  return (
    <div className="p-4 lg:p-8 space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-am-ink">Caja</h1>
          <p className="text-sm font-semibold text-am-muted">{fechaLarga(fecha)}</p>
        </div>
        <div className="flex items-center gap-2 lg:ml-6">
          <button type="button" aria-label="Día anterior" className={`${botonSecundario} !px-2.5`} onClick={() => setFecha(f => sumarDias(f, -1))}><span className="material-icons-round text-lg">chevron_left</span></button>
          <button type="button" className={botonSecundario} onClick={() => setFecha(hoyLocal())}>Hoy</button>
          <button type="button" aria-label="Día siguiente" className={`${botonSecundario} !px-2.5`} onClick={() => setFecha(f => sumarDias(f, 1))}><span className="material-icons-round text-lg">chevron_right</span></button>
          <input type="date" aria-label="Fecha" className={`${campo} !w-auto`} value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} />
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={botonSecundario} onClick={descargarCSV} disabled={!data || !data.cobros.length}>
            <span className="material-icons-round text-base">download</span>CSV
          </button>
          <button type="button" className={botonPrimario} disabled={!data || fecha > hoyLocal()}
            onClick={() => { setErrForm(''); setContado(data?.cierre ? String(data.cierre.countedCash) : ''); setNotaCierre(data?.cierre?.note || ''); setCerrar(true); }}>
            <span className="material-icons-round text-base">lock</span>{data?.cierre ? 'Volver a cerrar' : 'Cerrar caja'}
          </button>
        </div>
      </div>

      {/* Estado de la caja */}
      {data && (
        data.cierre ? (
          <div className={`${tarjeta} px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm`}>
            <span className="inline-flex items-center gap-1.5 font-black text-am-ink"><span className="material-icons-round text-lg text-am-600">lock</span>Caja cerrada</span>
            <span className="font-semibold text-am-muted">a las {hora(data.cierre.closedAt)}{data.cierre.closedBy ? ` por ${data.cierre.closedBy}` : ''}</span>
            <span className={`font-black ${data.cierre.difference === 0 ? 'text-emerald-700' : data.cierre.difference < 0 ? 'text-rose-700' : 'text-amber-700'}`}>
              {data.cierre.difference === 0 ? 'Cuadra exacto' : data.cierre.difference < 0 ? `Faltan ${pesos(-data.cierre.difference)}` : `Sobran ${pesos(data.cierre.difference)}`}
            </span>
            {data.cobros.some(c => c.afterClose && !c.voidedAt) && <span className="font-bold text-amber-700">Hay cobros registrados después del cierre</span>}
          </div>
        ) : (
          <div className={`${tarjeta} px-4 py-3 flex items-center gap-2 text-sm font-bold text-am-ink`}>
            <span className="relative flex w-2.5 h-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-emerald-500" /></span>
            Caja abierta{esHoy ? '' : ' · este día no se ha cerrado'}
          </div>
        )
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-rose-50/90 border border-rose-200 text-rose-700 rounded-2xl px-4 py-3 text-sm font-bold">
          <span>No se pudo cargar la caja: {error}</span><button type="button" className="underline" onClick={cargar}>Reintentar</button>
        </div>
      )}
      {!data && !error && <div className="flex justify-center py-20"><span className="material-icons-round animate-spin text-am-600 text-4xl">sync</span></div>}

      {data && r && (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map(k => (
              <div key={k.t} className={`${tarjeta} p-4 lg:p-5`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-am-muted">{k.t}</p>
                  <span className={`material-icons-round text-lg ${k.grande ? 'text-am-600' : 'text-am-400'}`}>{k.icon}</span>
                </div>
                <p className={`mt-1 font-black tabular-nums tracking-tight ${k.grande ? 'text-2xl lg:text-3xl am-text-gradient' : 'text-xl lg:text-2xl text-am-ink'}`}>{k.v}</p>
                <p className="text-[11px] font-semibold text-am-muted mt-0.5 truncate">{k.s}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              {/* Por cobrar */}
              <section className={`${tarjeta} p-4 lg:p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-black text-am-ink">Por cobrar</h2>
                  <span className="text-xs font-bold text-am-muted">{data.porCobrar.length} cita{data.porCobrar.length === 1 ? '' : 's'} · {pesos(porCobrarTotal)}</span>
                </div>
                {data.porCobrar.length === 0 ? (
                  <p className="text-sm text-am-muted py-4 text-center">No hay citas pendientes de pago este día.</p>
                ) : (
                  <ul className="divide-y divide-am-ink/[0.06]">
                    {data.porCobrar.map(c => (
                      <li key={c.id} className="flex items-center gap-3 py-2.5">
                        <span className="w-12 text-sm font-black tabular-nums text-am-ink shrink-0">{c.time}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-am-ink truncate">{c.patientName}</p>
                          <p className="text-xs font-semibold text-am-muted truncate">{c.professionalName} · {c.serviceName || 'Consulta'}</p>
                        </div>
                        <span className={`hidden lg:inline text-[11px] font-bold px-2 py-0.5 rounded-full ${c.status === 'Llegado' || c.status === 'En Sesión' ? 'bg-emerald-100 text-emerald-800' : c.status === 'Finalizado' ? 'bg-slate-200 text-slate-700' : 'bg-am-50 text-am-700'}`}>
                          {c.status === 'Llegado' ? 'Llegó' : c.status}
                        </span>
                        <span className="text-sm font-black tabular-nums text-am-ink w-20 text-right">{pesos(c.price || 0)}</span>
                        <button type="button" className={`${botonPrimario} !px-3 !py-2`} onClick={() => setCobrar(c)}>Cobrar</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Movimientos */}
              <section className={`${tarjeta} p-4 lg:p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-black text-am-ink">Movimientos del día</h2>
                  <span className="text-xs font-bold text-am-muted">{vigentes.length} vigente{vigentes.length === 1 ? '' : 's'}</span>
                </div>
                {data.cobros.length === 0 ? (
                  <p className="text-sm text-am-muted py-4 text-center">Aún no hay cobros registrados este día.</p>
                ) : (
                  <ul className="divide-y divide-am-ink/[0.06]">
                    {[...data.cobros].reverse().map(c => {
                      const medio = MEDIOS.find(m => m.value === c.method);
                      return (
                        <li key={c.id} className={`flex items-center gap-3 py-2.5 ${c.voidedAt ? 'opacity-60' : ''}`}>
                          <span className="w-11 text-xs font-bold tabular-nums text-am-muted shrink-0">{hora(c.createdAt)}</span>
                          <span className="w-9 h-9 rounded-xl bg-am-50 text-am-600 flex items-center justify-center shrink-0" title={medio?.label}>
                            <span className="material-icons-round text-lg">{medio?.icon || 'payments'}</span>
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-bold text-am-ink truncate ${c.voidedAt ? 'line-through' : ''}`}>{c.patientName}</p>
                            <p className="text-xs font-semibold text-am-muted truncate">
                              {nombreMedio(c.method)}{c.reference ? ` · ${c.reference}` : ''} · {c.professionalName}{c.receivedBy ? ` · cobró ${c.receivedBy}` : ''}
                            </p>
                            {c.voidedAt && <p className="text-xs font-bold text-rose-700 truncate">Anulado: {c.voidReason}</p>}
                            {!c.voidedAt && c.note && <p className="text-xs font-semibold text-amber-700 truncate">Nota: {c.note}</p>}
                          </div>
                          <span className={`text-sm font-black tabular-nums w-20 text-right ${c.voidedAt ? 'line-through text-am-muted' : 'text-am-ink'}`}>{pesos(c.amount)}</span>
                          {!c.voidedAt && (
                            <div className="flex gap-1 shrink-0">
                              <button type="button" aria-label={`Comprobante de ${c.patientName}`} title="Comprobante" className="w-9 h-9 rounded-xl hover:bg-am-50 text-am-muted hover:text-am-600 flex items-center justify-center" onClick={() => comprobante(c)}>
                                <span className="material-icons-round text-lg">receipt_long</span>
                              </button>
                              <button type="button" aria-label={`Anular cobro de ${c.patientName}`} title="Anular" className="w-9 h-9 rounded-xl hover:bg-rose-50 text-am-muted hover:text-rose-600 flex items-center justify-center" onClick={() => { setErrForm(''); setMotivo(''); setAnular(c); }}>
                                <span className="material-icons-round text-lg">block</span>
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <div className="space-y-5">
              {/* Por profesional */}
              <section className={`${tarjeta} p-4 lg:p-5`}>
                <h2 className="text-base font-black text-am-ink mb-3">Por profesional</h2>
                {Object.keys(r.porProfesional).length === 0 ? (
                  <p className="text-sm text-am-muted">Sin cobros todavía.</p>
                ) : (
                  <ul className="space-y-3">
                    {(Object.entries(r.porProfesional) as [string, { total: number; cobros: number }][]).sort((a, b) => b[1].total - a[1].total).map(([id, p]) => (
                      <li key={id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-am-ink truncate">{data.profesionales[id] || 'Profesional'}</span>
                          <span className="text-sm font-black tabular-nums text-am-ink">{pesos(p.total)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-am-ink/[0.06] mt-1.5 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-am-600 to-am-cyan" style={{ width: `${Math.max(4, (p.total / maxPro) * 100)}%` }} />
                        </div>
                        <p className="text-[11px] font-semibold text-am-muted mt-1">{p.cobros} cobro{p.cobros === 1 ? '' : 's'}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Pagos en línea */}
              <section className={`${tarjeta} p-4 lg:p-5`}>
                <h2 className="text-base font-black text-am-ink">Pagados en línea</h2>
                <p className="text-xs font-semibold text-am-muted mb-3">Reservas pagadas con MercadoPago. No pasan por la caja.</p>
                {data.enLinea.length === 0 ? <p className="text-sm text-am-muted">Ninguno este día.</p> : (
                  <ul className="space-y-2">
                    {data.enLinea.map(c => (
                      <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0"><span className="font-bold text-am-ink tabular-nums">{c.time}</span> <span className="font-semibold text-am-ink truncate">{c.patientName}</span></span>
                        <span className="font-black tabular-nums text-am-ink">{pesos(c.paymentAmount ?? c.price ?? 0)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}

      {/* Cobrar */}
      {cobrar && (
        <CobroModal centerId={centerId} cita={cobrar} onClose={() => setCobrar(null)}
          onDone={() => { setCobrar(null); cargar(); }} />
      )}

      {/* Anular */}
      {anular && (
        <Modal titulo="Anular cobro" subtitulo={`${anular.patientName} · ${pesos(anular.amount)} · ${nombreMedio(anular.method)}`} onClose={() => setAnular(null)} ancho="max-w-md">
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); accion(() => centerApi.voidPayment(centerId, { paymentId: anular.id, reason: motivo }), 'Cobro anulado', () => setAnular(null)); }}>
            <p className="text-sm text-am-muted">El cobro no se borra: queda anulado con su motivo y la cita vuelve a "Por cobrar".</p>
            <div>
              <label className={etiqueta} htmlFor="an-motivo">Motivo</label>
              <input id="an-motivo" className={campo} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: medio de pago equivocado" autoFocus />
            </div>
            {errForm && <p role="alert" className="text-sm font-bold text-rose-700">{errForm}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={botonSecundario} onClick={() => setAnular(null)}>Volver</button>
              <button type="submit" className={botonPeligro} disabled={ocupado || motivo.trim().length < 3}>{ocupado ? 'Anulando…' : 'Anular cobro'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Cierre */}
      {cerrar && r && (
        <Modal titulo="Cierre de caja" subtitulo={fechaLarga(fecha)} onClose={() => setCerrar(false)} ancho="max-w-md">
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); accion(() => centerApi.closeCash(centerId, fecha, contadoNum, notaCierre.trim()), 'Caja cerrada', () => setCerrar(false)); }}>
            <dl className="rounded-2xl bg-white/70 border border-am-ink/[0.06] divide-y divide-am-ink/[0.06] text-sm">
              {MEDIOS.map(m => (
                <div key={m.value} className="flex items-center justify-between px-4 py-2">
                  <dt className="font-semibold text-am-muted flex items-center gap-2"><span className="material-icons-round text-base text-am-400">{m.icon}</span>{m.label}</dt>
                  <dd className="font-black tabular-nums text-am-ink">{pesos(r.porMedio[m.value])}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-2.5 bg-am-50/70 rounded-b-2xl">
                <dt className="font-black text-am-ink">Total del día</dt><dd className="font-black tabular-nums text-am-ink">{pesos(r.total)}</dd>
              </div>
            </dl>
            <div>
              <label className={etiqueta} htmlFor="ci-contado">Efectivo contado en caja</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-am-muted">$</span>
                <input id="ci-contado" inputMode="numeric" className={`${campo} pl-7 text-lg font-black tabular-nums`} value={contado} onChange={e => setContado(e.target.value.replace(/[^\d]/g, ''))} autoFocus />
              </div>
              {diferencia !== null && (
                <p className={`text-sm font-black mt-1.5 ${diferencia === 0 ? 'text-emerald-700' : diferencia < 0 ? 'text-rose-700' : 'text-amber-700'}`}>
                  {diferencia === 0 ? 'Cuadra exacto con el efectivo esperado' : diferencia < 0 ? `Faltan ${pesos(-diferencia)}` : `Sobran ${pesos(diferencia)}`}
                </p>
              )}
            </div>
            <div>
              <label className={etiqueta} htmlFor="ci-nota">Nota (opcional)</label>
              <input id="ci-nota" className={campo} value={notaCierre} onChange={e => setNotaCierre(e.target.value)} placeholder="Ej: se retiró efectivo para el banco" />
            </div>
            {errForm && <p role="alert" className="text-sm font-bold text-rose-700">{errForm}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={botonSecundario} onClick={() => setCerrar(false)}>Cancelar</button>
              <button type="submit" className={botonPrimario} disabled={ocupado || contado === ''}>{ocupado ? 'Guardando…' : 'Confirmar cierre'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Caja;
