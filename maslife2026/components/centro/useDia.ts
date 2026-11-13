// Citas y boxes de un día para calcular horas libres en los formularios.
// Si el día ya está cargado en la grilla se reutiliza; si no, se pide al servidor.
import { useEffect, useState } from 'react';
import { centerApi, type Assignment, type CenterAppointment, type CenterRange } from '../../centerService';

export interface Dia { citas: CenterAppointment[]; asignaciones: Assignment[]; cargando: boolean; error: string }

export function useDia(centerId: string, fecha: string, base: CenterRange | null, rango: { from: string; to: string }): Dia {
  const dentro = !!base && fecha >= rango.from && fecha <= rango.to;
  const [remoto, setRemoto] = useState<{ fecha: string; citas: CenterAppointment[]; asignaciones: Assignment[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (dentro || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    let vigente = true;
    setError('');
    centerApi.range(centerId, fecha, fecha)
      .then(r => { if (vigente) setRemoto({ fecha, citas: r.appointments, asignaciones: r.assignments }); })
      .catch(e => { if (vigente) setError((e as Error).message); });
    return () => { vigente = false; };
  }, [centerId, fecha, dentro]);

  if (dentro) return { citas: base!.appointments.filter(c => c.date === fecha), asignaciones: base!.assignments.filter(a => a.date === fecha), cargando: false, error: '' };
  if (remoto?.fecha === fecha) return { citas: remoto.citas, asignaciones: remoto.asignaciones, cargando: false, error };
  return { citas: [], asignaciones: [], cargando: !error, error };
}
