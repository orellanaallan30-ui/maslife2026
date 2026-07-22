-- ============================================================================
-- Biofeedback avanzado (Tanda A): sesiones de rutina con métricas clínicas.
-- Una "sesión" = una vez que el paciente hace la rutina completa: dolor EVA
-- antes/después, esfuerzo percibido (RPE Borg modificada) y timestamps para
-- calcular frecuencia y cumplimiento. El paciente anónimo escribe vía RPC
-- SECURITY DEFINER (el uuid de la rutina es la credencial); el profesional
-- dueño lee. Bloqueado si el paciente fue dado de alta.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

-- Frecuencia prescrita (veces por semana) para calcular el cumplimiento.
ALTER TABLE public.exercise_routines
  ADD COLUMN IF NOT EXISTS sessions_per_week SMALLINT;

CREATE TABLE IF NOT EXISTS public.routine_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id   UUID NOT NULL REFERENCES public.exercise_routines(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  pain_pre     SMALLINT CHECK (pain_pre  IS NULL OR pain_pre  BETWEEN 1 AND 10),
  pain_post    SMALLINT CHECK (pain_post IS NULL OR pain_post BETWEEN 1 AND 10),
  rpe          SMALLINT CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 4),  -- 1 Fácil … 4 Muy difícil
  symptom      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS routine_sessions_routine_idx ON public.routine_sessions (routine_id, session_date);

ALTER TABLE public.routine_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS routine_sessions_pro_read ON public.routine_sessions;
CREATE POLICY routine_sessions_pro_read ON public.routine_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exercise_routines r
    WHERE r.id = routine_id AND r.professional_id = auth.uid()
  ));

-- ── Helper: ¿la rutina pertenece a un paciente dado de alta? ─────────────────
CREATE OR REPLACE FUNCTION public.routine_patient_discharged(p_routine_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.status IN ('De alta', 'Alta Médica') OR p.archived, false)
  FROM public.exercise_routines r
  JOIN public.patients p ON p.id = r.patient_id
  WHERE r.id = p_routine_id;
$$;

-- ── Iniciar sesión: registra el dolor inicial, devuelve el id ────────────────
CREATE OR REPLACE FUNCTION public.start_routine_session(
  p_routine_id UUID,
  p_date       DATE,
  p_pain_pre   SMALLINT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exercise_routines WHERE id = p_routine_id) THEN
    RETURN json_build_object('error', 'Rutina no encontrada');
  END IF;
  IF public.routine_patient_discharged(p_routine_id) THEN
    RETURN json_build_object('error', 'Este plan ya no está activo.');
  END IF;
  IF p_date IS NULL OR p_date > (NOW() AT TIME ZONE 'America/Santiago')::date + 1
     OR p_date < (NOW() - INTERVAL '30 days')::date THEN
    RETURN json_build_object('error', 'Fecha fuera de rango');
  END IF;
  IF p_pain_pre IS NOT NULL AND (p_pain_pre < 1 OR p_pain_pre > 10) THEN
    RETURN json_build_object('error', 'Dolor fuera de rango');
  END IF;

  INSERT INTO public.routine_sessions (routine_id, session_date, pain_pre)
  VALUES (p_routine_id, p_date, p_pain_pre)
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'sessionId', v_id);
END;
$$;

-- ── Finalizar sesión: dolor final + esfuerzo + síntoma ───────────────────────
CREATE OR REPLACE FUNCTION public.finish_routine_session(
  p_session_id UUID,
  p_routine_id UUID,
  p_pain_post  SMALLINT DEFAULT NULL,
  p_rpe        SMALLINT DEFAULT NULL,
  p_symptom    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.routine_sessions
    WHERE id = p_session_id AND routine_id = p_routine_id
  ) THEN
    RETURN json_build_object('error', 'Sesión no válida para esta rutina');
  END IF;
  IF public.routine_patient_discharged(p_routine_id) THEN
    RETURN json_build_object('error', 'Este plan ya no está activo.');
  END IF;
  IF p_pain_post IS NOT NULL AND (p_pain_post < 1 OR p_pain_post > 10) THEN
    RETURN json_build_object('error', 'Dolor fuera de rango');
  END IF;
  IF p_rpe IS NOT NULL AND (p_rpe < 1 OR p_rpe > 4) THEN
    RETURN json_build_object('error', 'Esfuerzo fuera de rango');
  END IF;

  UPDATE public.routine_sessions
  SET finished_at = NOW(),
      pain_post   = COALESCE(p_pain_post, pain_post),
      rpe         = COALESCE(p_rpe, rpe),
      symptom     = COALESCE(NULLIF(TRIM(p_symptom), ''), symptom)
  WHERE id = p_session_id AND routine_id = p_routine_id;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_routine_session(UUID, DATE, SMALLINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finish_routine_session(UUID, UUID, SMALLINT, SMALLINT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_routine_session(UUID, DATE, SMALLINT) TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.finish_routine_session(UUID, UUID, SMALLINT, SMALLINT, TEXT) TO anon, authenticated;

-- ── get_routine_public: sumar frecuencia prescrita, fechas de sesión y la de hoy ──
CREATE OR REPLACE FUNCTION public.get_routine_public(p_routine_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_routine  exercise_routines%ROWTYPE;
  v_pro_name TEXT;
  v_pro_specialty TEXT;
  v_patient_name TEXT;
  v_patient_status TEXT;
  v_patient_archived BOOLEAN;
  v_items JSON;
  v_session_dates JSON;
  v_today_session JSON;
  v_today DATE := (NOW() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  SELECT * INTO v_routine FROM public.exercise_routines WHERE id = p_routine_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Rutina no encontrada');
  END IF;

  SELECT name, specialty INTO v_pro_name, v_pro_specialty
  FROM public.professionals WHERE id = v_routine.professional_id;

  SELECT name, status, archived INTO v_patient_name, v_patient_status, v_patient_archived
  FROM public.patients WHERE id = v_routine.patient_id;

  IF v_patient_status IN ('De alta', 'Alta Médica') OR COALESCE(v_patient_archived, false) THEN
    RETURN json_build_object(
      'finished', true,
      'message', 'Tu profesional finalizó este tratamiento, por eso el plan ya no está activo. Si tienes dudas, contáctale directamente.'
    );
  END IF;

  SELECT json_agg(
    json_build_object(
      'id',             ri.id,
      'nameEs',         e.name_es,
      'imageUrls',      e.image_urls,
      'instructionsEs', e.instructions_es,
      'sets',           ri.sets,
      'reps',           ri.reps,
      'restSeconds',    ri.rest_seconds,
      'notes',          ri.notes,
      'completedDates', COALESCE((
        SELECT json_agg(rc.completed_on ORDER BY rc.completed_on)
        FROM public.routine_completions rc WHERE rc.item_id = ri.id
      ), '[]'::json),
      'completions', COALESCE((
        SELECT json_agg(json_build_object('on', rc.completed_on, 'pain', rc.pain_level) ORDER BY rc.completed_on)
        FROM public.routine_completions rc WHERE rc.item_id = ri.id
      ), '[]'::json)
    ) ORDER BY ri.order_index
  ) INTO v_items
  FROM public.routine_items ri
  JOIN public.exercises e ON e.id = ri.exercise_id
  WHERE ri.routine_id = v_routine.id;

  -- Fechas (distintas) con sesión terminada, últimas 60 — el frontend calcula racha.
  SELECT COALESCE(json_agg(d ORDER BY d), '[]'::json) INTO v_session_dates
  FROM (
    SELECT DISTINCT session_date AS d
    FROM public.routine_sessions
    WHERE routine_id = v_routine.id AND finished_at IS NOT NULL
    ORDER BY session_date DESC
    LIMIT 60
  ) s;

  -- Sesión de hoy (la más reciente), para que la UI sepa en qué punto está.
  SELECT json_build_object('id', id, 'painPre', pain_pre, 'finished', finished_at IS NOT NULL)
  INTO v_today_session
  FROM public.routine_sessions
  WHERE routine_id = v_routine.id AND session_date = v_today
  ORDER BY started_at DESC
  LIMIT 1;

  RETURN json_build_object(
    'title',                 v_routine.title,
    'notes',                 v_routine.notes,
    'professionalName',      COALESCE(v_pro_name, 'Profesional'),
    'professionalSpecialty', COALESCE(v_pro_specialty, ''),
    'patientName',           COALESCE(v_patient_name, ''),
    'sessionsPerWeek',       v_routine.sessions_per_week,
    'sessionDates',          v_session_dates,
    'todaySession',          v_today_session,
    'items',                 COALESCE(v_items, '[]'::json)
  );
END;
$$;
