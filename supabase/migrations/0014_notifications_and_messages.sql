-- ============================================================================
-- Tanda D: notificaciones al profesional + hilo de mensajes/tareas en el enlace.
--  · pro_notifications: le llega a la campana del panel cuando el paciente sube
--    evidencia, completa su rutina del día, o responde un mensaje.
--  · routine_messages: el profesional deja mensajes/tareas al paciente en el
--    enlace y el paciente responde o marca tareas — sin WhatsApp.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

-- ── Notificaciones del profesional ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pro_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL,
  patient_id      UUID,
  routine_id      UUID,
  kind            TEXT NOT NULL,   -- 'evidence' | 'session' | 'message'
  body            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  read_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pro_notifications_pro_idx ON public.pro_notifications (professional_id, created_at DESC);

ALTER TABLE public.pro_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pro_notifications_own ON public.pro_notifications;
CREATE POLICY pro_notifications_own ON public.pro_notifications
  FOR ALL TO authenticated
  USING (professional_id = auth.uid())
  WITH CHECK (professional_id = auth.uid());

-- ── Mensajes / tareas por rutina ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.routine_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES public.exercise_routines(id) ON DELETE CASCADE,
  sender     TEXT NOT NULL DEFAULT 'pro',   -- 'pro' | 'patient'
  kind       TEXT NOT NULL DEFAULT 'message', -- 'message' | 'task'
  body       TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS routine_messages_routine_idx ON public.routine_messages (routine_id, created_at);

ALTER TABLE public.routine_messages ENABLE ROW LEVEL SECURITY;

-- El profesional dueño gestiona el hilo de su rutina.
DROP POLICY IF EXISTS routine_messages_pro ON public.routine_messages;
CREATE POLICY routine_messages_pro ON public.routine_messages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercise_routines r WHERE r.id = routine_id AND r.professional_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercise_routines r WHERE r.id = routine_id AND r.professional_id = auth.uid()));

-- ── Helper: notifica al profesional dueño de una rutina ─────────────────────
CREATE OR REPLACE FUNCTION public.notify_pro_of_routine(
  p_routine_id UUID, p_kind TEXT, p_body TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro UUID;
  v_pat UUID;
BEGIN
  SELECT professional_id, patient_id INTO v_pro, v_pat
  FROM public.exercise_routines WHERE id = p_routine_id;
  IF v_pro IS NULL THEN RETURN; END IF;
  INSERT INTO public.pro_notifications (professional_id, patient_id, routine_id, kind, body)
  VALUES (v_pro, v_pat, p_routine_id, p_kind, p_body);
END;
$$;

-- ── add_routine_evidence: además de registrar, notifica ─────────────────────
CREATE OR REPLACE FUNCTION public.add_routine_evidence(
  p_routine_id UUID, p_item_id UUID, p_path TEXT, p_type TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pat TEXT;
  v_title TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exercise_routines WHERE id = p_routine_id) THEN
    RETURN json_build_object('error', 'Rutina no encontrada');
  END IF;
  IF public.routine_patient_discharged(p_routine_id) THEN
    RETURN json_build_object('error', 'Este plan ya no está activo.');
  END IF;
  IF p_path IS NULL OR split_part(p_path, '/', 1) <> p_routine_id::text THEN
    RETURN json_build_object('error', 'Ruta inválida');
  END IF;
  IF p_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.routine_items WHERE id = p_item_id AND routine_id = p_routine_id
  ) THEN
    RETURN json_build_object('error', 'Ejercicio no válido para esta rutina');
  END IF;

  INSERT INTO public.routine_evidence (routine_id, item_id, storage_path, media_type)
  VALUES (p_routine_id, p_item_id, p_path, NULLIF(p_type, ''));

  SELECT p.name, r.title INTO v_pat, v_title
  FROM public.exercise_routines r JOIN public.patients p ON p.id = r.patient_id
  WHERE r.id = p_routine_id;
  PERFORM public.notify_pro_of_routine(p_routine_id, 'evidence',
    'Nueva evidencia de ' || COALESCE(v_pat, 'un paciente') || ' · ' || COALESCE(v_title, 'rutina'));

  RETURN json_build_object('ok', true);
END;
$$;

-- ── finish_routine_session: notifica (deduplicado a 1 por rutina por día) ────
CREATE OR REPLACE FUNCTION public.finish_routine_session(
  p_session_id UUID, p_routine_id UUID, p_pain_post SMALLINT DEFAULT NULL,
  p_rpe SMALLINT DEFAULT NULL, p_symptom TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pat TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.routine_sessions WHERE id = p_session_id AND routine_id = p_routine_id
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

  -- Notificar una sola vez por rutina por día.
  IF NOT EXISTS (
    SELECT 1 FROM public.pro_notifications
    WHERE routine_id = p_routine_id AND kind = 'session'
      AND created_at::date = (NOW() AT TIME ZONE 'America/Santiago')::date
  ) THEN
    SELECT p.name INTO v_pat
    FROM public.exercise_routines r JOIN public.patients p ON p.id = r.patient_id
    WHERE r.id = p_routine_id;
    PERFORM public.notify_pro_of_routine(p_routine_id, 'session',
      COALESCE(v_pat, 'Un paciente') || ' completó su rutina de hoy');
  END IF;

  RETURN json_build_object('ok', TRUE);
END;
$$;

-- ── Paciente responde un mensaje (anon) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_routine_message(p_routine_id UUID, p_body TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pat TEXT;
  v_text TEXT := NULLIF(TRIM(p_body), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exercise_routines WHERE id = p_routine_id) THEN
    RETURN json_build_object('error', 'Rutina no encontrada');
  END IF;
  IF public.routine_patient_discharged(p_routine_id) THEN
    RETURN json_build_object('error', 'Este plan ya no está activo.');
  END IF;
  IF v_text IS NULL THEN RETURN json_build_object('error', 'Mensaje vacío'); END IF;

  INSERT INTO public.routine_messages (routine_id, sender, kind, body)
  VALUES (p_routine_id, 'patient', 'message', LEFT(v_text, 800));

  SELECT p.name INTO v_pat
  FROM public.exercise_routines r JOIN public.patients p ON p.id = r.patient_id
  WHERE r.id = p_routine_id;
  PERFORM public.notify_pro_of_routine(p_routine_id, 'message',
    COALESCE(v_pat, 'Un paciente') || ' te respondió un mensaje');

  RETURN json_build_object('ok', true);
END;
$$;

-- ── Paciente marca una tarea hecha (anon) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_routine_message_done(
  p_routine_id UUID, p_message_id UUID, p_done BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.routine_patient_discharged(p_routine_id) THEN
    RETURN json_build_object('error', 'Este plan ya no está activo.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.routine_messages
    WHERE id = p_message_id AND routine_id = p_routine_id AND kind = 'task'
  ) THEN
    RETURN json_build_object('error', 'Tarea no válida para esta rutina');
  END IF;

  UPDATE public.routine_messages SET done = COALESCE(p_done, false)
  WHERE id = p_message_id AND routine_id = p_routine_id;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_routine_message(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_routine_message_done(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_routine_message(UUID, TEXT) TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.toggle_routine_message_done(UUID, UUID, BOOLEAN) TO anon, authenticated;

-- ── get_routine_public: sumar el hilo de mensajes ───────────────────────────
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
  v_messages JSON;
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
      ), '[]'::json),
      'evidenceCount', COALESCE((
        SELECT count(*) FROM public.routine_evidence re WHERE re.item_id = ri.id
      ), 0)
    ) ORDER BY ri.order_index
  ) INTO v_items
  FROM public.routine_items ri
  JOIN public.exercises e ON e.id = ri.exercise_id
  WHERE ri.routine_id = v_routine.id;

  SELECT COALESCE(json_agg(d ORDER BY d), '[]'::json) INTO v_session_dates
  FROM (
    SELECT DISTINCT session_date AS d
    FROM public.routine_sessions
    WHERE routine_id = v_routine.id AND finished_at IS NOT NULL
    ORDER BY session_date DESC
    LIMIT 60
  ) s;

  SELECT json_build_object('id', id, 'painPre', pain_pre, 'finished', finished_at IS NOT NULL)
  INTO v_today_session
  FROM public.routine_sessions
  WHERE routine_id = v_routine.id AND session_date = v_today
  ORDER BY started_at DESC
  LIMIT 1;

  SELECT COALESCE(json_agg(
    json_build_object('id', m.id, 'sender', m.sender, 'kind', m.kind, 'body', m.body,
                      'done', m.done, 'createdAt', m.created_at) ORDER BY m.created_at
  ), '[]'::json) INTO v_messages
  FROM public.routine_messages m WHERE m.routine_id = v_routine.id;

  RETURN json_build_object(
    'title',                 v_routine.title,
    'notes',                 v_routine.notes,
    'professionalName',      COALESCE(v_pro_name, 'Profesional'),
    'professionalSpecialty', COALESCE(v_pro_specialty, ''),
    'patientName',           COALESCE(v_patient_name, ''),
    'sessionsPerWeek',       v_routine.sessions_per_week,
    'sessionDates',          v_session_dates,
    'todaySession',          v_today_session,
    'messages',              v_messages,
    'items',                 COALESCE(v_items, '[]'::json)
  );
END;
$$;
