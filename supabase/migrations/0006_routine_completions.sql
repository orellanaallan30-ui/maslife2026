-- ============================================================================
-- Adherencia de rutinas: el paciente marca ejercicios realizados por día
-- desde /rutina/:id (anónimo, uuid de la rutina como credencial) y el
-- profesional dueño ve el progreso en la ficha.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.routine_completions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id   UUID NOT NULL REFERENCES public.exercise_routines(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES public.routine_items(id) ON DELETE CASCADE,
  completed_on DATE NOT NULL,          -- fecha local del paciente (YYYY-MM-DD)
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, completed_on)       -- un check por ejercicio por día
);

ALTER TABLE public.routine_completions ENABLE ROW LEVEL SECURITY;

-- El profesional dueño de la rutina puede leer el progreso.
DROP POLICY IF EXISTS routine_completions_pro_read ON public.routine_completions;
CREATE POLICY routine_completions_pro_read ON public.routine_completions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exercise_routines r
    WHERE r.id = routine_id AND r.professional_id = auth.uid()
  ));

-- El paciente anónimo escribe SOLO vía esta RPC (SECURITY DEFINER); el uuid
-- de la rutina es la credencial, mismo modelo que get_routine_public.
CREATE OR REPLACE FUNCTION public.toggle_routine_item(
  p_routine_id UUID,
  p_item_id    UUID,
  p_date       DATE,
  p_done       BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- El ítem debe pertenecer a la rutina indicada (la credencial de la URL).
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

  IF p_done THEN
    INSERT INTO public.routine_completions (routine_id, item_id, completed_on)
    VALUES (p_routine_id, p_item_id, p_date)
    ON CONFLICT (item_id, completed_on) DO NOTHING;
  ELSE
    DELETE FROM public.routine_completions
    WHERE item_id = p_item_id AND completed_on = p_date;
  END IF;

  RETURN json_build_object('ok', TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_routine_item(UUID, UUID, DATE, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.toggle_routine_item(UUID, UUID, DATE, BOOLEAN) TO anon, authenticated;

-- get_routine_public ahora incluye el id de cada ítem y sus fechas realizadas,
-- para que la página pinte el estado sin una segunda consulta.
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
