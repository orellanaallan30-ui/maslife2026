-- ============================================================================
-- Tienda: panel completo.
-- - shop_settings.contenido: textos editables de la portada (banners), desde el
--   editor con vista previa del panel admin. Texto plano; lo valida el servidor.
-- - shop_products.precio_manual: precio fijo que reemplaza a la fórmula
--   (costo / (1 − margen − comisión)) cuando Rodrigo quiere un precio exacto.
-- - orders.es_prueba: pedidos hechos en modo prueba desde la vista previa del
--   admin (no se informan a Meta y se marcan en el panel).
-- ============================================================================

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS contenido jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS precio_manual integer CHECK (precio_manual IS NULL OR precio_manual > 0);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS es_prueba boolean NOT NULL DEFAULT false;
