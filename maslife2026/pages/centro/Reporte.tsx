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
        <h1 className="text-2xl font-black tracking-tight text-am-ink">Horas de box por profesional</h1>
        <div className="flex-1" />
        <div className="flex rounded-xl bg-white/60 border border-am-ink/10 p-1 gap-1 self-start" role="group" aria-label="Período">
          {(['dia', 'semana', 'mes'] as const).map(p => (
            <button key={p} type="button" aria-pressed={periodo === p} onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${periodo === p ? 'bg-am-ink text-white shadow' : 'text-am-muted hover:text-am-ink'}`}>
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
        <span className="text-base font-black text-am-ink ml-1">{titulo}</span>
        <div className="flex-1" />
        <button type="button" className={botonSecundario} onClick={descargarCSV} disabled={!rows || !rows.length}>
          <span className="material-icons-round text-base">download</span>Descargar CSV
        </button>
      </div>

      {error && <p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl px-4 py-3 text-sm font-bold">{error}</p>}
      {rows === null && <div className="flex justify-center py-20"><span className="material-icons-round animate-spin text-am-600 text-4xl">sync</span></div>}

      {rows && rows.length === 0 && !error && (
        <div className="am-glass rounded-[22px] p-8 text-center">
          <p className="text-base font-black text-am-ink">Sin horas de box en este período</p>
          <p className="text-sm text-am-muted mt-1">Las horas se cuentan desde los horarios asignados en la pestaña Boxes.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="am-glass rounded-[22px] px-4 py-3">
              <p className="text-2xl font-black text-am-ink tabular-nums">{horasTexto(total)}</p>
              <p className="text-xs font-bold text-am-muted">Total asignado</p>
            </div>
            <div className="am-glass rounded-[22px] px-4 py-3">
              <p className="text-2xl font-black text-am-ink tabular-nums">{rows.length}</p>
              <p className="text-xs font-bold text-am-muted">Profesionales con box</p>
            </div>
          </div>
          <div className="overflow-x-auto am-glass rounded-[22px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-am-ink/[0.07] text-xs font-bold text-am-muted">
                  <th scope="col" className="text-left px-4 py-2.5">Profesional</th>
                  {columnas.map(c => <th key={c.key} scope="col" className="text-right px-3 py-2.5 whitespace-nowrap">{c.titulo}</th>)}
                  <th scope="col" className="text-right px-4 py-2.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.professionalId} className="border-b border-am-ink/[0.05] last:border-0">
                    <th scope="row" className="text-left px-4 py-3">
                      <span className="block font-black text-am-ink">{r.name}</span>
                      {r.specialty && <span className="block text-xs font-semibold text-am-muted">{r.specialty}</span>}
                    </th>
                    {columnas.map(c => {
                      const min = r[c.de][c.key] || 0;
                      return <td key={c.key} className={`text-right px-3 py-3 tabular-nums ${min ? 'font-bold text-am-ink' : 'text-slate-300'}`}>{min ? horasTexto(min) : '–'}</td>;
                    })}
                    <td className="text-right px-4 py-3 font-black text-am-ink tabular-nums whitespace-nowrap">{horasTexto(r.totalMin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-am-ink/[0.07] bg-am-50/60">
                  <th scope="row" className="text-left px-4 py-3 font-black text-am-ink">Total</th>
                  {columnas.map(c => {
                    const min = rows.reduce((s, r) => s + (r[c.de][c.key] || 0), 0);
                    return <td key={c.key} className="text-right px-3 py-3 font-bold text-am-ink tabular-nums">{min ? horasTexto(min) : '–'}</td>;
                  })}
                  <td className="text-right px-4 py-3 font-black text-am-ink tabular-nums whitespace-nowrap">{horasTexto(total)}</td>
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
