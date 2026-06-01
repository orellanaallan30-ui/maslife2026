-- ============================================================================
-- FASE 1 de seguridad RLS — aislar pacientes y transacciones por profesional
-- ============================================================================
--
-- Contexto:
--   Hoy la app usa la anon key de Supabase desde el navegador. Sin Row Level
--   Security, cualquiera que tenga la anon key (visible en el frontend) puede
--   leer TODOS los pacientes (incl. historial médico) y transacciones de todos
--   los profesionales desde la consola del navegador.
--
--   Los profesionales se autentican con Supabase Auth y su professionals.id
--   coincide con auth.uid(), por lo que las políticas basadas en auth.uid()
--   funcionan. Estas tablas SOLO se acceden con el profesional logueado
--   (ver supabaseService.ts), así que activar RLS de solo-dueño no rompe la app.
--
-- Idempotente: se puede ejecutar varias veces sin error.
-- Ejecutar en: Supabase Dashboard → SQL Editor.
-- ============================================================================

-- ── Tabla: patients ─────────────────────────────────────────────────────────
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patients_select_own ON public.patients;
DROP POLICY IF EXISTS patients_insert_own ON public.patients;
DROP POLICY IF EXISTS patients_update_own ON public.patients;
DROP POLICY IF EXISTS patients_delete_own ON public.patients;

CREATE POLICY patients_select_own ON public.patients
  FOR SELECT TO authenticated
  USING (professional_id::text = auth.uid()::text);

CREATE POLICY patients_insert_own ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (professional_id::text = auth.uid()::text);

CREATE POLICY patients_update_own ON public.patients
  FOR UPDATE TO authenticated
  USING (professional_id::text = auth.uid()::text)
  WITH CHECK (professional_id::text = auth.uid()::text);

CREATE POLICY patients_delete_own ON public.patients
  FOR DELETE TO authenticated
  USING (professional_id::text = auth.uid()::text);

-- ── Tabla: transactions ─────────────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_select_own ON public.transactions;
DROP POLICY IF EXISTS transactions_insert_own ON public.transactions;
DROP POLICY IF EXISTS transactions_update_own ON public.transactions;
DROP POLICY IF EXISTS transactions_delete_own ON public.transactions;

CREATE POLICY transactions_select_own ON public.transactions
  FOR SELECT TO authenticated
  USING (professional_id::text = auth.uid()::text);

CREATE POLICY transactions_insert_own ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (professional_id::text = auth.uid()::text);

CREATE POLICY transactions_update_own ON public.transactions
  FOR UPDATE TO authenticated
  USING (professional_id::text = auth.uid()::text)
  WITH CHECK (professional_id::text = auth.uid()::text);

CREATE POLICY transactions_delete_own ON public.transactions
  FOR DELETE TO authenticated
  USING (professional_id::text = auth.uid()::text);

-- ============================================================================
-- Verificación posterior (opcional, ejecutar por separado):
--
--   -- Debe devolver rowsecurity = true para ambas tablas:
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('patients', 'transactions');
--
--   -- Debe listar 8 políticas (4 por tabla):
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename IN ('patients', 'transactions') ORDER BY tablename, cmd;
-- ============================================================================
