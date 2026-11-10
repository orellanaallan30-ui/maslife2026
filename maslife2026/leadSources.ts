// Origen del paciente (medición de campañas) y texto de consentimiento para
// informar ventas de anuncios a Meta (Conversions API). Ley 19.628 / 21.719:
// solo se envía con autorización explícita del paciente.
import type { LeadSource } from './types';

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'meta_ads', label: 'Anuncio de Instagram/Facebook' },
  { value: 'instagram_organico', label: 'Instagram (sin anuncio)' },
  { value: 'recomendacion', label: 'Recomendación' },
  { value: 'google', label: 'Google' },
  { value: 'otro', label: 'Otro' },
];

export const AD_CONSENT_TEXT =
  'El paciente autoriza usar su teléfono y correo, cifrados, solo para medir si el anuncio funcionó (Meta). ' +
  'No se comparte información clínica.';
