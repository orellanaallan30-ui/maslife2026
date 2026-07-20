-- ============================================================================
-- Plan alimentario enviable (nutrición): mismo modelo que las rutinas de
-- ejercicios — el plan se guarda al enviar, el paciente lo ve en una página
-- pública /plan/:id (uuid no adivinable como credencial) y el PDF se genera
-- al momento en su navegador.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID REFERENCES public.patients(id),
  professional_id UUID REFERENCES public.professionals(id),
  title           TEXT NOT NULL DEFAULT 'Plan alimentario',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  sent_via        TEXT  -- 'whatsapp' | 'email'
);

CREATE TABLE IF NOT EXISTS public.meal_plan_rows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  meal        TEXT,   -- Desayuno, Almuerzo...
  food        TEXT,   -- preparación / alimento
  quantity    TEXT,
  kcal        TEXT,
  notes       TEXT,
  order_index INT NOT NULL DEFAULT 0
);

ALTER TABLE public.meal_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meal_plans_own ON public.meal_plans;
CREATE POLICY meal_plans_own ON public.meal_plans
  FOR ALL USING (professional_id = auth.uid())
  WITH CHECK (professional_id = auth.uid());

DROP POLICY IF EXISTS meal_plan_rows_own ON public.meal_plan_rows;
CREATE POLICY meal_plan_rows_own ON public.meal_plan_rows
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.meal_plans p
    WHERE p.id = meal_plan_rows.plan_id AND p.professional_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meal_plans p
    WHERE p.id = meal_plan_rows.plan_id AND p.professional_id = auth.uid()
  ));

-- Página pública: mismo modelo que get_routine_public.
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
  v_rows JSON;
BEGIN
  SELECT * INTO v_plan FROM public.meal_plans WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Plan no encontrado');
  END IF;

  SELECT name, specialty INTO v_pro_name, v_pro_specialty
  FROM public.professionals WHERE id = v_plan.professional_id;

  SELECT name INTO v_patient_name
  FROM public.patients WHERE id = v_plan.patient_id;

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

REVOKE EXECUTE ON FUNCTION public.get_meal_plan_public(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_meal_plan_public(UUID) TO anon, authenticated;
