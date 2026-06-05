-- ============================================================================
-- Portal de Pacientes: tokens de acceso temporal
-- CENS RCE — Cumplimiento Ley 20.584 (derecho del paciente a acceder a su ficha)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

-- ── Tabla de tokens ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_access_tokens (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  token        TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  patient_id   UUID        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id TEXT     NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.patient_access_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tokens_select_own ON public.patient_access_tokens;
DROP POLICY IF EXISTS tokens_insert_own ON public.patient_access_tokens;
DROP POLICY IF EXISTS tokens_delete_own ON public.patient_access_tokens;

CREATE POLICY tokens_select_own ON public.patient_access_tokens
  FOR SELECT TO authenticated
  USING (professional_id = auth.uid()::text);

CREATE POLICY tokens_insert_own ON public.patient_access_tokens
  FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid()::text);

CREATE POLICY tokens_delete_own ON public.patient_access_tokens
  FOR DELETE TO authenticated
  USING (professional_id = auth.uid()::text);

-- ── RPC pública: get_patient_by_token ────────────────────────────────────────
-- SECURITY DEFINER: se ejecuta con privilegios del dueño de la función
-- No requiere autenticación del llamador — el token es la credencial
CREATE OR REPLACE FUNCTION public.get_patient_by_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok  patient_access_tokens%ROWTYPE;
  v_pat  patients%ROWTYPE;
  v_pro_name TEXT;
  v_pro_specialty TEXT;
BEGIN
  SELECT * INTO v_tok
  FROM public.patient_access_tokens
  WHERE token = p_token
    AND expires_at > NOW()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Token inválido o expirado');
  END IF;

  SELECT * INTO v_pat
  FROM public.patients
  WHERE id = v_tok.patient_id
    AND professional_id::text = v_tok.professional_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Registro no disponible');
  END IF;

  SELECT name, specialty INTO v_pro_name, v_pro_specialty
  FROM public.professionals
  WHERE id::text = v_tok.professional_id;

  RETURN json_build_object(
    'patient', json_build_object(
      'name',         v_pat.name,
      'rut',          v_pat.rut,
      'birthDate',    v_pat.birth_date,
      'gender',       v_pat.gender,
      'prevision',    v_pat.prevision,
      'allergies',    v_pat.allergies,
      'diagnoses',    v_pat.diagnoses,
      'medicalHistory', v_pat.medical_history,
      'soap',         v_pat.soap,
      'lastVisit',    v_pat.last_visit
    ),
    'professionalName',    COALESCE(v_pro_name, 'Profesional'),
    'professionalSpecialty', COALESCE(v_pro_specialty, ''),
    'expiresAt',     v_tok.expires_at
  );
END;
$$;

-- Revocar ejecución pública por defecto, luego otorgar a anon
REVOKE EXECUTE ON FUNCTION public.get_patient_by_token(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_patient_by_token(TEXT) TO anon, authenticated;
