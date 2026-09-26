// Modalidades de atención (Presencial / Domicilio / Online) por servicio.
// Regla única para el cliente (Ajustes y reserva) y el servidor (validateBooking).
// Sin dependencias: lo importan también maslife2026/pages/*.

export type ClaveModalidad = 'inPerson' | 'home' | 'online';
export type TipoCita = 'Presencial' | 'Domicilio' | 'Online';

export const MODALIDADES: ReadonlyArray<{ clave: ClaveModalidad; tipo: TipoCita; etiqueta: string; icono: string }> = [
  { clave: 'inPerson', tipo: 'Presencial', etiqueta: 'Presencial', icono: 'medical_information' },
  { clave: 'home',     tipo: 'Domicilio',  etiqueta: 'Domicilio',  icono: 'home_work' },
  { clave: 'online',   tipo: 'Online',     etiqueta: 'Online',     icono: 'videocam' },
];

type ModalidadesPro = Partial<Record<ClaveModalidad, boolean>> | null | undefined;

/** Modalidades activas del profesional, en orden fijo. Sin ninguna: presencial (default histórico). */
export function modalidadesDelPro(pro: ModalidadesPro): ClaveModalidad[] {
  const activas = MODALIDADES.map(m => m.clave).filter(c => !!pro?.[c]);
  return activas.length > 0 ? activas : ['inPerson'];
}

/**
 * Modalidades en que se ofrece un servicio. Sin lista propia = todas las del
 * profesional. Si la lista del servicio no coincide con ninguna activa del
 * profesional (p. ej. las desactivó después), se usan las del profesional para
 * que el servicio nunca quede imposible de reservar.
 */
export function modalidadesDeServicio(pro: ModalidadesPro, delServicio?: ReadonlyArray<string> | null): ClaveModalidad[] {
  const delPro = modalidadesDelPro(pro);
  if (!Array.isArray(delServicio) || delServicio.length === 0) return delPro;
  const cruce = delPro.filter(c => delServicio.includes(c));
  return cruce.length > 0 ? cruce : delPro;
}

export function claveDeTipo(tipo: string | undefined | null): ClaveModalidad {
  return MODALIDADES.find(m => m.tipo === tipo)?.clave ?? 'inPerson';
}

export function infoModalidad(clave: ClaveModalidad) {
  return MODALIDADES.find(m => m.clave === clave)!;
}
