-- ============================================================================
-- Evidencia de ejercicios (Tanda B): el paciente adjunta foto/video corto por
-- ejercicio desde el link. Bucket PRIVADO (Ley 21.719): solo el profesional
-- dueño lo ve vía signed URL, y lo elimina al revisarlo. El paciente anónimo
-- sube con la anon key (el uuid de la rutina, en la ruta, es la credencial).
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

-- Bucket privado con límites (30 MB, imagen + video corto).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'routine-evidence', 'routine-evidence', false, 31457280,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Subir: solo a una rutina real y activa (el 1er folder de la ruta = routine_id).
DROP POLICY IF EXISTS routine_evidence_insert ON storage.objects;
CREATE POLICY routine_evidence_insert ON storage.objects
  FOR INSERT TO public
  WITH CHECK (
    bucket_id = 'routine-evidence'
    AND EXISTS (
      SELECT 1 FROM public.exercise_routines r
      JOIN public.patients p ON p.id = r.patient_id
      WHERE r.id::text = (storage.foldername(name))[1]
        AND NOT COALESCE(p.status IN ('De alta','Alta Médica') OR p.archived, false)
    )
  );

-- Leer: solo el profesional dueño de la rutina (genera signed URL).
DROP POLICY IF EXISTS routine_evidence_select ON storage.objects;
CREATE POLICY routine_evidence_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'routine-evidence'
    AND EXISTS (
      SELECT 1 FROM public.exercise_routines r
      WHERE r.id::text = (storage.foldername(name))[1] AND r.professional_id = auth.uid()
    )
  );

-- Borrar: el profesional dueño, al revisar.
DROP POLICY IF EXISTS routine_evidence_delete ON storage.objects;
CREATE POLICY routine_evidence_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'routine-evidence'
    AND EXISTS (
      SELECT 1 FROM public.exercise_routines r
      WHERE r.id::text = (storage.foldername(name))[1] AND r.professional_id = auth.uid()
    )
  );

-- ── Metadatos de cada evidencia ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.routine_evidence (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id   UUID NOT NULL REFERENCES public.exercise_routines(id) ON DELETE CASCADE,
  item_id      UUID REFERENCES public.routine_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  media_type   TEXT,   -- 'image' | 'video'
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS routine_evidence_routine_idx ON public.routine_evidence (routine_id);

ALTER TABLE public.routine_evidence ENABLE ROW LEVEL SECURITY;

-- El profesional dueño lee y borra sus evidencias.
DROP POLICY IF EXISTS routine_evidence_pro_read ON public.routine_evidence;
CREATE POLICY routine_evidence_pro_read ON public.routine_evidence
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exercise_routines r
    WHERE r.id = routine_id AND r.professional_id = auth.uid()
  ));

DROP POLICY IF EXISTS routine_evidence_pro_delete ON public.routine_evidence;
CREATE POLICY routine_evidence_pro_delete ON public.routine_evidence
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exercise_routines r
    WHERE r.id = routine_id AND r.professional_id = auth.uid()
  ));

-- ── RPC pública: registrar la evidencia recién subida ───────────────────────
CREATE OR REPLACE FUNCTION public.add_routine_evidence(
  p_routine_id UUID,
  p_item_id    UUID,
  p_path       TEXT,
  p_type       TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exercise_routines WHERE id = p_routine_id) THEN
    RETURN json_build_object('error', 'Rutina no encontrada');
  END IF;
  IF public.routine_patient_discharged(p_routine_id) THEN
    RETURN json_build_object('error', 'Este plan ya no está activo.');
  END IF;
  -- La ruta debe pertenecer a esta rutina (mismo criterio que la política de storage).
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

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_routine_evidence(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_routine_evidence(UUID, UUID, TEXT, TEXT) TO anon, authenticated;

-- ── get_routine_public: sumar evidenceCount por ítem ────────────────────────
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
