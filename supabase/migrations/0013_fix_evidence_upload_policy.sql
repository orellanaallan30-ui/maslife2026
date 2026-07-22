-- ============================================================================
-- Fix: la subida de evidencia fallaba siempre para el paciente anónimo.
-- La política INSERT del bucket validaba la rutina con un EXISTS sobre
-- exercise_routines/patients, pero esas tablas tienen RLS que solo permite
-- al profesional dueño — el anónimo no las puede leer, así que el EXISTS daba
-- falso y se rechazaba la subida. Se reemplaza por una función SECURITY DEFINER
-- que valida la rutina saltando RLS (de forma acotada), sin exponer datos.
-- También se sube el límite de tamaño (videos de iPhone) y se quita la lista
-- de tipos (iOS a veces manda content-type inconsistente; se valida en cliente).
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

-- Límite 60 MB, sin whitelist de tipos (el bucket es privado y acotado por uuid).
UPDATE storage.buckets
SET file_size_limit = 62914560, allowed_mime_types = NULL
WHERE id = 'routine-evidence';

-- Valida (como owner) que la rutina exista y su paciente esté activo. Recibe
-- texto para no fallar si el folder no es un uuid.
CREATE OR REPLACE FUNCTION public.routine_accepts_evidence(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.exercise_routines r
    JOIN public.patients p ON p.id = r.patient_id
    WHERE r.id::text = p_id
      AND NOT COALESCE(p.status IN ('De alta','Alta Médica') OR p.archived, false)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.routine_accepts_evidence(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.routine_accepts_evidence(TEXT) TO anon, authenticated;

-- Reemplazar la política de subida para que use la función (funciona con anon).
DROP POLICY IF EXISTS routine_evidence_insert ON storage.objects;
CREATE POLICY routine_evidence_insert ON storage.objects
  FOR INSERT TO public
  WITH CHECK (
    bucket_id = 'routine-evidence'
    AND public.routine_accepts_evidence((storage.foldername(name))[1])
  );
