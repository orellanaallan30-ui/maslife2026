-- ============================================================================
-- Página pública de rutina de ejercicios (/rutina/:id)
-- El id de exercise_routines (UUID no adivinable) se usa como credencial de
-- acceso, igual que /consent/:id — sin tabla de tokens nueva.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

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
      'nameEs',         e.name_es,
      'imageUrls',      e.image_urls,
      'instructionsEs', e.instructions_es,
      'sets',           ri.sets,
      'reps',           ri.reps,
      'restSeconds',    ri.rest_seconds,
      'notes',          ri.notes
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

REVOKE EXECUTE ON FUNCTION public.get_routine_public(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_routine_public(UUID) TO anon, authenticated;
