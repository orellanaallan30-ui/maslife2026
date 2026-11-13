// Reporte de horas de box asignadas por profesional: por día, semana o mes.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCenter } from '../../CenterContext';
import {
  centerApi, hoyLocal, sumarDias, lunesDe, fechaCorta, fechaLarga, horasTexto,
  type ReportRow,
} from '../../centerService';
import { botonSecundario, campo } from '../../components/centro/Modal';

type Periodo = 'dia' | 'semana' | 'mes';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Último día del mes de una fecha YYYY-MM-DD. */
const finDeMes = (fecha: string): string => {
  const [y, m] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

const Reporte: React.FC = () => {
  const { active } = useCenter();
  const centerId = active!.center.id;
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [fecha, setFecha] = useState(hoyLocal());
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState('');

  const rango = useMemo(() => {
    if (periodo === 'dia') return { from: fecha, to: fecha };
    if (periodo === 'semana') return { from: lunesDe(fecha), to: sumarDias(lunesDe(fecha), 6) };
    return { from: `${fecha.slice(0, 7)}-01`, to: finDeMes(fecha) };
  }, [periodo, fecha]);

  const cargar = useCallback(async () => {
    setRows(null);
    try { setRows((await centerApi.report(centerId, rango.from, rango.to)).rows); setError(''); }
    catch (err) { setError((err as Error).message); setRows([]); }
  }, [centerId, rango.from, rango.to]);
  useEffect(() => { cargar(); }, [cargar]);

  // Columnas de detalle: días de la semana, o semanas del mes.
  const columnas = useMemo(() => {
    if (periodo === 'semana') return Array.from({ length: 7 }, (_, i) => { const f = sumarDias(rango.from, i); return { key: f, titulo: fechaCorta(f), de: 'porDia' as const }; });
    if (periodo === 'mes') {
      const cols: { key: string; titulo: string; de: 'porSemana' }[] = [];
      for (let l = lunesDe(rango.from); l <= rango.to; l = sumarDias(l, 7)) cols.push({ key: l, titulo: `Sem. ${fechaCorta(l).split(' ')[1]}`, de: 'porSemana' });
      return cols;
    }
    return [];
  }, [periodo, rango]);

  const titulo = periodo === 'dia' ? fechaLarga(fecha)
    : periodo === 'semana' ? `Semana del ${fechaCorta(rango.from)} al ${fechaCorta(rango.to)}`
    : `${MESES[Number(fecha.slice(5, 7)) - 1]} ${fecha.slice(0, 4)}`;

  const mover = (dir: number) => {
    if (periodo === 'dia') setFecha(f => sumarDias(f, dir));
    else if (periodo === 'semana') setFecha(f => sumarDias(f, dir * 7));
    else setFecha(f => { const [y, m] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10); });
  };

  const total = (rows || []).reduce((s, r) => s + r.totalMin, 0);
  const horasDec = (min: number) => (min / 60).toFixed(2).replace('.', ',');

  const descargarCSV = () => {
    if (!rows) return;
    const cab = ['Profesional', 'Especialidad', ...columnas.map(c => c.titulo), 'Total horas'];
    const filas = rows.map(r => [r.name, r.specialty, ...columnas.map(c => horasDec(r[c.de][c.key] || 0)), horasDec(r.totalMin)]);
    const csv = [cab, ...filas].map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `horas-box_${rango.from}_${rango.to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-8 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <h1 className="text-xl font-black text-slate-900">Horas de box por profesional</h1>
        <div className="flex-1" />
        <div className="flex rounded-xl border border-slate-300 overflow-hidden self-start" role="group" aria-label="Período">
          {(['dia', 'semana', 'mes'] as const).map(p => (
            <button key={p} type="button" aria-pressed={periodo === p} onClick={() => setPeriodo(p)}
              className={`px-3 py-2 text-sm font-bold ${periodo === p ? 'bg-primary text-white' : 'bg-white text-slate-600'}`}>
              {p === 'dia' ? 'Día' : p === 'semana' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Anterior" className={`${botonSecundario} !px-2.5`} onClick={() => mover(-1)}><span className="material-icons-round text-lg">chevron_left</span></button>
        <button type="button" className={botonSecundario} onClick={() => setFecha(hoyLocal())}>Hoy</button>
        <button type="button" aria-label="Siguiente" className={`${botonSecundario} !px-2.5`} onClick={() => mover(1)}><span className="material-icons-round text-lg">chevron_right</span></button>
        <input type="date" aria-label="Fecha" className={`${campo} !w-auto`} value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} />
        <span className="text-base font-black text-slate-800 ml-1">{titulo}</span>
        <div className="flex-1" />
        <button type="button" className={botonSecundario} onClick={descargarCSV} disabled={!rows || !rows.length}>
          <span className="material-icons-round text-base">download</span>Descargar CSV
        </button>
      </div>

      {error && <p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl px-4 py-3 text-sm font-bold">{error}</p>}
      {rows === null && <div className="flex justify-center py-20"><span className="material-icons-round animate-spin text-primary text-4xl">sync</span></div>}

      {rows && rows.length === 0 && !error && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <p className="text-base font-black text-slate-800">Sin horas de box en este período</p>
          <p className="text-sm text-slate-500 mt-1">Las horas se cuentan desde los horarios asignados en la pestaña Boxes.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
              <p className="text-2xl font-black text-slate-900 tabular-nums">{horasTexto(total)}</p>
              <p className="text-xs font-bold text-slate-500">Total asignado</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
              <p className="text-2xl font-black text-slate-900 tabular-nums">{rows.length}</p>
              <p className="text-xs font-bold text-slate-500">Profesionales con box</p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-500">
                  <th scope="col" className="text-left px-4 py-2.5">Profesional</th>
                  {columnas.map(c => <th key={c.key} scope="col" className="text-right px-3 py-2.5 whitespace-nowrap">{c.titulo}</th>)}
                  <th scope="col" className="text-right px-4 py-2.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.professionalId} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="text-left px-4 py-3">
                      <span className="block font-black text-slate-800">{r.name}</span>
                      {r.specialty && <span className="block text-xs font-semibold text-slate-500">{r.specialty}</span>}
                    </th>
                    {columnas.map(c => {
                      const min = r[c.de][c.key] || 0;
                      return <td key={c.key} className={`text-right px-3 py-3 tabular-nums ${min ? 'font-bold text-slate-700' : 'text-slate-300'}`}>{min ? horasTexto(min) : '–'}</td>;
                    })}
                    <td className="text-right px-4 py-3 font-black text-slate-900 tabular-nums whitespace-nowrap">{horasTexto(r.totalMin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <th scope="row" className="text-left px-4 py-3 font-black text-slate-800">Total</th>
                  {columnas.map(c => {
                    const min = rows.reduce((s, r) => s + (r[c.de][c.key] || 0), 0);
                    return <td key={c.key} className="text-right px-3 py-3 font-bold text-slate-700 tabular-nums">{min ? horasTexto(min) : '–'}</td>;
                  })}
                  <td className="text-right px-4 py-3 font-black text-slate-900 tabular-nums whitespace-nowrap">{horasTexto(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default Reporte;
