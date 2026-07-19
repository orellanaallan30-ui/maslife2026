-- ============================================================================
-- Biofeedback de dolor en rutinas (escala EVA 1-10 con semáforo):
--   verde 1-3: tolerable, permitido · amarillo 4-5: precaución (menos
--   intensidad, más descanso) · rojo 6-10: no realizar el ejercicio.
-- El paciente registra el dolor junto con la marca de "realizado" del día.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

ALTER TABLE public.routine_completions
  ADD COLUMN IF NOT EXISTS pain_level SMALLINT
  CHECK (pain_level IS NULL OR pain_level BETWEEN 1 AND 10);

-- La firma cambia (nuevo parámetro opcional): se elimina la versión anterior
-- para no dejar una sobrecarga ambigua en PostgREST. Los clientes ya
-- desplegados que llaman con 4 argumentos siguen funcionando (p_pain tiene
-- DEFAULT NULL).
DROP FUNCTION IF EXISTS public.toggle_routine_item(UUID, UUID, DATE, BOOLEAN);

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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.routine_items
    WHERE id = p_item_id AND routine_id = p_routine_id
  ) THEN
    RETURN json_build_object('error', 'Ejercicio no válido para esta rutina');
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
    -- Si ya existía la marca del día, solo actualiza el dolor cuando viene
    -- un valor nuevo (no lo borra al re-marcar sin dolor).
    DO UPDATE SET pain_level = COALESCE(EXCLUDED.pain_level, routine_completions.pain_level);
  ELSE
    DELETE FROM public.routine_completions
    WHERE item_id = p_item_id AND completed_on = p_date;
  END IF;

  RETURN json_build_object('ok', TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_routine_item(UUID, UUID, DATE, BOOLEAN, SMALLINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.toggle_routine_item(UUID, UUID, DATE, BOOLEAN, SMALLINT) TO anon, authenticated;

-- get_routine_public incluye ahora, por ítem, las marcas con su dolor:
-- 'completions': [{"on": "YYYY-MM-DD", "pain": n|null}, ...]
-- (se mantiene 'completedDates' por compatibilidad con clientes ya cargados).
CREATE OR REPLACE FUNCTION public.get_routine_public(p_routine_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_routine  exercise_routines%ROWTYPE;
  v_pro_name TEXT;
  v_patient_name TEXT;
  v_items JSON;
BEGIN
  SELECT * INTO v_routine
  FROM public.exercise_routines
  WHERE id = p_routine_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Rutina no encontrada');
  END IF;

  SELECT name INTO v_pro_name
  FROM public.professionals
  WHERE id = v_routine.professional_id;

  SELECT name INTO v_patient_name
  FROM public.patients
  WHERE id = v_routine.patient_id;

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
    'title',            v_routine.title,
    'notes',            v_routine.notes,
    'professionalName', COALESCE(v_pro_name, 'Profesional'),
    'patientName',      COALESCE(v_patient_name, ''),
    'items',            COALESCE(v_items, '[]'::json)
  );
END;
$$;
