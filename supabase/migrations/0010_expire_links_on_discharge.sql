-- ============================================================================
-- Vencimiento de enlaces públicos (rutina/plan) al dar de alta al paciente.
-- Cuando el profesional marca al paciente 'De alta' (o lo archiva), la vista
-- pública deja de mostrar el contenido y el paciente ya no puede marcar
-- ejercicios. Es automático y reversible (si vuelve a 'En sesiones', reviven).
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

-- Mensaje único para el paciente cuando su tratamiento finalizó.
-- (Se define inline en cada función porque Postgres no comparte constantes.)

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
BEGIN
  SELECT * INTO v_routine
  FROM public.exercise_routines
  WHERE id = p_routine_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Rutina no encontrada');
  END IF;

  SELECT name, specialty INTO v_pro_name, v_pro_specialty
  FROM public.professionals
  WHERE id = v_routine.professional_id;

  SELECT name, status, archived INTO v_patient_name, v_patient_status, v_patient_archived
  FROM public.patients
  WHERE id = v_routine.patient_id;

  -- Vencido si el paciente fue dado de alta o archivado.
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
        FROM public.routine_completions rc
        WHERE rc.item_id = ri.id
      ), '[]'::json),
      'completions', COALESCE((
        SELECT json_agg(json_build_object('on', rc.completed_on, 'pain', rc.pain_level) ORDER BY rc.completed_on)
        FROM public.routine_completions rc
        WHERE rc.item_id = ri.id
      ), '[]'::json)
    ) ORDER BY ri.order_index
  ) INTO v_items
  FROM public.routine_items ri
  JOIN public.exercises e ON e.id = ri.exercise_id
  WHERE ri.routine_id = v_routine.id;

  RETURN json_build_object(
    'title',                 v_routine.title,
    'notes',                 v_routine.notes,
    'professionalName',      COALESCE(v_pro_name, 'Profesional'),
    'professionalSpecialty', COALESCE(v_pro_specialty, ''),
    'patientName',           COALESCE(v_patient_name, ''),
    'items',                 COALESCE(v_items, '[]'::json)
  );
END;
$$;

-- El paciente dado de alta no puede seguir marcando ejercicios.
CREATE OR REPLACE FUNCTION public.toggle_routine_item(
  p_routine_id UUID,
  p_item_id    UUID,
  p_date       DATE,
  p_done       BOOLEAN,
  p_pain       SMALLINT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_archived BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.routine_items
    WHERE id = p_item_id AND routine_id = p_routine_id
  ) THEN
    RETURN json_build_object('error', 'Ejercicio no válido para esta rutina');
  END IF;

  -- Bloquear si el paciente de esta rutina fue dado de alta o archivado.
  SELECT p.status, p.archived INTO v_status, v_archived
  FROM public.exercise_routines r
  JOIN public.patients p ON p.id = r.patient_id
  WHERE r.id = p_routine_id;

  IF v_status IN ('De alta', 'Alta Médica') OR COALESCE(v_archived, false) THEN
    RETURN json_build_object('error', 'Este plan ya no está activo.');
  END IF;

  IF p_date IS NULL OR p_date > (NOW() AT TIME ZONE 'America/Santiago')::date + 1
     OR p_date < (NOW() - INTERVAL '30 days')::date THEN
    RETURN json_build_object('error', 'Fecha fuera de rango');
  END IF;

  IF p_pain IS NOT NULL AND (p_pain < 1 OR p_pain > 10) THEN
    RETURN json_build_object('error', 'Nivel de dolor fuera de rango');
  END IF;

  IF p_done THEN
    INSERT INTO public.routine_completions (routine_id, item_id, completed_on, pain_level)
    VALUES (p_routine_id, p_item_id, p_date, p_pain)
    ON CONFLICT (item_id, completed_on)
    DO UPDATE SET pain_level = COALESCE(EXCLUDED.pain_level, routine_completions.pain_level);
  ELSE
    DELETE FROM public.routine_completions
    WHERE item_id = p_item_id AND completed_on = p_date;
  END IF;

  RETURN json_build_object('ok', TRUE);
END;
$$;

-- Plan alimentario: mismo vencimiento al alta.
CREATE OR REPLACE FUNCTION public.get_meal_plan_public(p_plan_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan meal_plans%ROWTYPE;
  v_pro_name TEXT;
  v_pro_specialty TEXT;
  v_patient_name TEXT;
  v_patient_status TEXT;
  v_patient_archived BOOLEAN;
  v_rows JSON;
BEGIN
  SELECT * INTO v_plan FROM public.meal_plans WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Plan no encontrado');
  END IF;

  SELECT name, specialty INTO v_pro_name, v_pro_specialty
  FROM public.professionals WHERE id = v_plan.professional_id;

  SELECT name, status, archived INTO v_patient_name, v_patient_status, v_patient_archived
  FROM public.patients WHERE id = v_plan.patient_id;

  IF v_patient_status IN ('De alta', 'Alta Médica') OR COALESCE(v_patient_archived, false) THEN
    RETURN json_build_object(
      'finished', true,
      'message', 'Tu profesional finalizó este tratamiento, por eso el plan ya no está activo. Si tienes dudas, contáctale directamente.'
    );
  END IF;

  SELECT json_agg(
    json_build_object(
      'meal', r.meal, 'food', r.food, 'quantity', r.quantity,
      'kcal', r.kcal, 'notes', r.notes
    ) ORDER BY r.order_index
  ) INTO v_rows
  FROM public.meal_plan_rows r
  WHERE r.plan_id = v_plan.id;

  RETURN json_build_object(
    'title',                 v_plan.title,
    'notes',                 v_plan.notes,
    'professionalName',      COALESCE(v_pro_name, 'Profesional'),
    'professionalSpecialty', COALESCE(v_pro_specialty, ''),
    'patientName',           COALESCE(v_patient_name, ''),
    'rows',                  COALESCE(v_rows, '[]'::json)
  );
END;
$$;
