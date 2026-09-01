-- ============================================================================
-- Bucket de fotografías clínicas (posturales, fotogramas de vídeo, vídeos).
--
-- Este bucket ya existe y está en uso desde hace tiempo, pero se creó a mano en
-- el panel de Supabase: no había ninguna migración que lo definiera. Eso
-- significa que sus políticas de acceso no se podían revisar en el repositorio,
-- ni reproducir en otro entorno, ni comparar con lo que el código da por hecho.
-- Para datos de salud (Ley 21.719) eso es justo lo que no puede pasar.
--
-- Esta migración lo deja declarado. Es idempotente y NO borra nada: si el bucket
-- ya está con la configuración correcta, no cambia nada.
--
-- La ruta de cada archivo es `<professional_id>/<archivo>`, y ese primer nivel
-- es lo que acota el acceso.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

-- Bucket PRIVADO. 60 MB es el tope que ya aplica el cliente para vídeo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-images', 'clinical-images', false, 62914560,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Subir: solo en la carpeta propia. `auth.uid()` es el id del profesional.
DROP POLICY IF EXISTS clinical_images_insert ON storage.objects;
CREATE POLICY clinical_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'clinical-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Leer: solo la carpeta propia. Es lo que permite firmar la URL de la foto.
DROP POLICY IF EXISTS clinical_images_select ON storage.objects;
CREATE POLICY clinical_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'clinical-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Reemplazar una foto (el cliente sube con upsert).
DROP POLICY IF EXISTS clinical_images_update ON storage.objects;
CREATE POLICY clinical_images_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'clinical-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Borrar: el profesional puede eliminar sus propias imágenes.
DROP POLICY IF EXISTS clinical_images_delete ON storage.objects;
CREATE POLICY clinical_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'clinical-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Nota sobre las URLs firmadas: son credenciales al portador. Quien tenga el
-- enlace ve la imagen aunque no tenga sesión, y el enlace queda guardado en
-- claro en specialty_data. El cliente las emite con 30 días de vigencia
-- (TTL_FIRMA_SEG en ClinicalRecord.tsx); antes eran 5 años. Estas políticas
-- acotan quién puede EMITIR una firma nueva, no quién puede usar una ya emitida.
