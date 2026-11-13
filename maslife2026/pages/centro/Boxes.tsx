// Boxes del centro y su horario semanal: qué profesional ocupa cada box y cuándo.
// Estas asignaciones son la base del reporte de horas.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCenter } from '../../CenterContext';
import {
  centerApi, hoyLocal, sumarDias, lunesDe, fechaCorta, fechaLarga, aMin, horasTexto,
  type Assignment, type Box, type CenterRange,
} from '../../centerService';
import Modal, { campo, etiqueta, botonPrimario, botonSecundario, botonPeligro } from '../../components/centro/Modal';
import { COLORES_BOX, colorBox } from '../../components/centro/DayGrid';
import { toast } from '../../lib/toast';

const SEMANAS = [
  { v: 1, t: 'Solo ese día' }, { v: 4, t: 'Cada semana, por 4 semanas' }, { v: 8, t: 'Cada semana, por 8 semanas' },
  { v: 12, t: 'Cada semana, por 12 semanas' }, { v: 26, t: 'Cada semana, por 6 meses' },
];

const Boxes: React.FC = () => {
  const { active } = useCenter();
  const centerId = active!.center.id;
  const [lunes, setLunes] = useState(lunesDe(hoyLocal()));
  const [data, setData] = useState<CenterRange | null>(null);
  const [error, setError] = useState('');
  const [editBox, setEditBox] = useState<Partial<Box> | null>(null);
  const [nuevaAsig, setNuevaAsig] = useState<{ boxId: string; professionalId: string; date: string; start: string; end: string; weeks: number } | null>(null);
  const [verAsig, setVerAsig] = useState<Assignment | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [errForm, setErrForm] = useState('');

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)), [lunes]);

  const cargar = useCallback(async () => {
    try { setData(await centerApi.range(centerId, lunes, sumarDias(lunes, 6))); setError(''); }
    catch (err) { setError((err as Error).message); }
  }, [centerId, lunes]);
  useEffect(() => { cargar(); }, [cargar]);

  const boxes = data?.boxes || [];
  const pros = data?.professionals || [];
  const nombrePro = (id: string) => pros.find(p => p.id === id)?.name || 'Profesional';

  const accion = async (fn: () => Promise<unknown>, ok: string, cerrar: () => void) => {
    setErrForm(''); setOcupado(true);
    try { await fn(); toast.success(ok); cerrar(); await cargar(); }
    catch (err) { setErrForm((err as Error).message); }
    finally { setOcupado(false); }
  };

  const abrirAsignacion = (boxId: string, date: string) => {
    setErrForm('');
    setNuevaAsig({ boxId, professionalId: pros[0]?.id || '', date, start: '09:00', end: '13:00', weeks: 1 });
  };

  return (
    <div className="p-4 lg:p-8 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <h1 className="text-xl font-black text-slate-900">Boxes</h1>
        <div className="flex items-center gap-2 lg:ml-4">
          <button type="button" aria-label="Semana anterior" className={`${botonSecundario} !px-2.5`} onClick={() => setLunes(l => sumarDias(l, -7))}>
            <span className="material-icons-round text-lg">chevron_left</span>
          </button>
          <button type="button" className={botonSecundario} onClick={() => setLunes(lunesDe(hoyLocal()))}>Esta semana</button>
          <button type="button" aria-label="Semana siguiente" className={`${botonSecundario} !px-2.5`} onClick={() => setLunes(l => sumarDias(l, 7))}>
            <span className="material-icons-round text-lg">chevron_right</span>
          </button>
          <span className="text-sm font-bold text-slate-600">{fechaCorta(lunes)} al {fechaCorta(sumarDias(lunes, 6))}</span>
        </div>
        <div className="flex-1" />
        <button type="button" className={botonPrimario} onClick={() => { setErrForm(''); setEditBox({ name: '', color: COLORES_BOX[boxes.length % COLORES_BOX.length], active: true }); }}>
          <span className="material-icons-round text-base">add</span>Nuevo box
        </button>
      </div>

      {error && <p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl px-4 py-3 text-sm font-bold">{error}</p>}
      {!data && !error && <div className="flex justify-center py-20"><span className="material-icons-round animate-spin text-primary text-4xl">sync</span></div>}

      {data && boxes.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <p className="text-base font-black text-slate-800">Aún no hay boxes</p>
          <p className="text-sm text-slate-500 mt-1">Crea el primero con "Nuevo box" y luego asigna qué profesional lo ocupa cada día.</p>
        </div>
      )}

      {data && boxes.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm" style={{ minWidth: 860 }}>
            <thead>
              <tr className="border-b border-slate-200">
                <th scope="col" className="text-left px-3 py-2.5 text-xs font-bold text-slate-500 w-36">Box</th>
                {dias.map(d => (
                  <th key={d} scope="col" className={`text-left px-2 py-2.5 text-xs font-bold ${d === data.ahora.fecha ? 'text-primary' : 'text-slate-500'}`}>{fechaCorta(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {boxes.map(b => {
                const color = colorBox(boxes, b.id);
                return (
                  <tr key={b.id} className="border-b border-slate-100 last:border-0 align-top">
                    <th scope="row" className="text-left px-3 py-3">
                      <button type="button" className="flex items-center gap-2 font-black text-slate-800 hover:text-primary" onClick={() => { setErrForm(''); setEditBox(b); }}>
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                        <span className={b.active ? '' : 'line-through text-slate-400'}>{b.name}</span>
                      </button>
                      {!b.active && <span className="text-[11px] font-bold text-slate-400">Desactivado</span>}
                    </th>
                    {dias.map(d => {
                      const asigs = data.assignments.filter(a => a.boxId === b.id && a.date === d);
                      return (
                        <td key={d} className="px-1.5 py-2">
                          <div className="space-y-1">
                            {asigs.map(a => (
                              <button key={a.id} type="button" onClick={() => { setErrForm(''); setVerAsig(a); }}
                                className="w-full text-left rounded-lg px-2 py-1 border-l-4 bg-slate-50 hover:bg-slate-100" style={{ borderColor: color }}>
                                <span className="block text-[11px] font-bold text-slate-500 tabular-nums">{a.start} a {a.end}</span>
                                <span className="block text-xs font-black text-slate-800 truncate">{nombrePro(a.professionalId)}</span>
                              </button>
                            ))}
                            {b.active && (
                              <button type="button" onClick={() => abrirAsignacion(b.id, d)} aria-label={`Asignar ${b.name} el ${fechaLarga(d)}`}
                                className="w-full rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-primary hover:text-primary text-xs font-bold py-1">
                                + Asignar
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Crear / editar box */}
      {editBox && (
        <Modal titulo={editBox.id ? 'Editar box' : 'Nuevo box'} onClose={() => setEditBox(null)} ancho="max-w-md">
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); accion(() => centerApi.saveBox(centerId, { id: editBox.id, name: editBox.name || '', color: editBox.color, active: editBox.active !== false, sort: editBox.sort }), 'Box guardado', () => setEditBox(null)); }}>
            <div>
              <label className={etiqueta} htmlFor="bx-nombre">Nombre</label>
              <input id="bx-nombre" className={campo} value={editBox.name || ''} onChange={e => setEditBox({ ...editBox, name: e.target.value })} placeholder="Ej: Box 1" autoFocus />
            </div>
            <div>
              <span className={etiqueta}>Color</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color del box">
                {COLORES_BOX.map(c => (
                  <button key={c} type="button" role="radio" aria-checked={editBox.color === c} aria-label={`Color ${c}`} onClick={() => setEditBox({ ...editBox, color: c })}
                    className={`w-8 h-8 rounded-full border-2 ${editBox.color === c ? 'border-slate-900' : 'border-transparent'}`} style={{ background: c }} />
                ))}
              </div>
            </div>
            {editBox.id && (
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" className="accent-primary w-4 h-4" checked={editBox.active !== false} onChange={e => setEditBox({ ...editBox, active: e.target.checked })} />
                Box activo (se puede asignar)
              </label>
            )}
            {errForm && <p role="alert" className="text-sm font-bold text-rose-600">{errForm}</p>}
            <div className="flex flex-col-reverse lg:flex-row lg:justify-between gap-2">
              {editBox.id
                ? <button type="button" className={`${botonSecundario} !text-rose-600 !border-rose-200`} disabled={ocupado}
                    onClick={() => accion(() => centerApi.deleteBox(centerId, editBox.id!), 'Box eliminado', () => setEditBox(null))}>Eliminar box</button>
                : <span />}
              <button type="submit" className={botonPrimario} disabled={ocupado || !(editBox.name || '').trim()}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Asignar horario */}
      {nuevaAsig && (
        <Modal titulo="Asignar box" onClose={() => setNuevaAsig(null)} ancho="max-w-md">
          {pros.length === 0 ? (
            <p className="text-sm text-slate-600">Aún no hay profesionales activos en el centro. Invítalos en la pestaña Equipo.</p>
          ) : (
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); accion(() => centerApi.saveAssignment(centerId, nuevaAsig), 'Horario de box asignado', () => setNuevaAsig(null)); }}>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={etiqueta} htmlFor="as-box">Box</label>
                  <select id="as-box" className={campo} value={nuevaAsig.boxId} onChange={e => setNuevaAsig({ ...nuevaAsig, boxId: e.target.value })}>
                    {boxes.filter(b => b.active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={etiqueta} htmlFor="as-pro">Profesional</label>
                  <select id="as-pro" className={campo} value={nuevaAsig.professionalId} onChange={e => setNuevaAsig({ ...nuevaAsig, professionalId: e.target.value })}>
                    {pros.map(p => <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` · ${p.specialty}` : ''}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={etiqueta} htmlFor="as-fecha">Fecha</label>
                  <input id="as-fecha" type="date" className={campo} value={nuevaAsig.date} onChange={e => setNuevaAsig({ ...nuevaAsig, date: e.target.value })} />
                </div>
                <div>
                  <label className={etiqueta} htmlFor="as-ini">Desde</label>
                  <input id="as-ini" type="time" step={900} className={campo} value={nuevaAsig.start} onChange={e => setNuevaAsig({ ...nuevaAsig, start: e.target.value })} />
                </div>
                <div>
                  <label className={etiqueta} htmlFor="as-fin">Hasta</label>
                  <input id="as-fin" type="time" step={900} className={campo} value={nuevaAsig.end} onChange={e => setNuevaAsig({ ...nuevaAsig, end: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className={etiqueta} htmlFor="as-rep">Repetir</label>
                  <select id="as-rep" className={campo} value={nuevaAsig.weeks} onChange={e => setNuevaAsig({ ...nuevaAsig, weeks: Number(e.target.value) })}>
                    {SEMANAS.map(s => <option key={s.v} value={s.v}>{s.t}</option>)}
                  </select>
                </div>
              </div>
              {aMin(nuevaAsig.end) > aMin(nuevaAsig.start) && (
                <p className="text-xs font-semibold text-slate-500">
                  {horasTexto(aMin(nuevaAsig.end) - aMin(nuevaAsig.start))} por día{nuevaAsig.weeks > 1 ? ` · ${horasTexto((aMin(nuevaAsig.end) - aMin(nuevaAsig.start)) * nuevaAsig.weeks)} en total` : ''}.
                </p>
              )}
              {errForm && <p role="alert" className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{errForm}</p>}
              <div className="flex flex-col-reverse lg:flex-row lg:justify-end gap-2">
                <button type="button" className={botonSecundario} onClick={() => setNuevaAsig(null)}>Cancelar</button>
                <button type="submit" className={botonPrimario} disabled={ocupado || !nuevaAsig.professionalId || aMin(nuevaAsig.end) <= aMin(nuevaAsig.start)}>
                  {ocupado ? 'Guardando…' : 'Asignar'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* Ver / quitar horario */}
      {verAsig && (
        <Modal titulo="Horario de box" onClose={() => setVerAsig(null)} ancho="max-w-md">
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-xs font-bold text-slate-500">Box</dt><dd className="font-bold text-slate-800">{boxes.find(b => b.id === verAsig.boxId)?.name}</dd></div>
              <div><dt className="text-xs font-bold text-slate-500">Profesional</dt><dd className="font-bold text-slate-800">{nombrePro(verAsig.professionalId)}</dd></div>
              <div><dt className="text-xs font-bold text-slate-500">Fecha</dt><dd className="font-bold text-slate-800">{fechaLarga(verAsig.date)}</dd></div>
              <div><dt className="text-xs font-bold text-slate-500">Horario</dt><dd className="font-bold text-slate-800 tabular-nums">{verAsig.start} a {verAsig.end}</dd></div>
            </dl>
            {errForm && <p role="alert" className="text-sm font-bold text-rose-600">{errForm}</p>}
            <div className="flex flex-col gap-2">
              <button type="button" className={botonPeligro} disabled={ocupado}
                onClick={() => accion(() => centerApi.deleteAssignment(centerId, verAsig.id, 'one'), 'Horario quitado', () => setVerAsig(null))}>
                Quitar solo este día
              </button>
              {verAsig.recurrenceId && (
                <button type="button" className={`${botonSecundario} !text-rose-600 !border-rose-200`} disabled={ocupado}
                  onClick={() => accion(() => centerApi.deleteAssignment(centerId, verAsig.id, 'future'), 'Horarios quitados', () => setVerAsig(null))}>
                  Quitar este y los siguientes de la repetición
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Boxes;
