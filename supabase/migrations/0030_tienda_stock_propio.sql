-- ============================================================================
-- Tienda: productos con stock propio (Rodrigo despacha) además de los de Dropi.
--
-- - shop_products.origen: 'dropi' (proveedor) o 'propio' (stock en la clínica).
-- - orders: estado del despacho manual, transportista y seguimiento.
-- - shop_descontar_stock(order): descuenta el stock propio UNA sola vez por
--   pedido pagado (marca stock_descontado_at de forma atómica) y lo deja
--   'por_despachar'. Solo la llama el servidor (service_role).
-- - Bucket público `shop-images` para las fotos de productos propios.
-- ============================================================================

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'dropi' CHECK (origen IN ('dropi','propio'));
ALTER TABLE public.shop_products ALTER COLUMN dropi_product_id DROP NOT NULL;
ALTER TABLE public.shop_products DROP CONSTRAINT IF EXISTS shop_products_origen_dropi;
ALTER TABLE public.shop_products ADD CONSTRAINT shop_products_origen_dropi CHECK (
  (origen = 'dropi'  AND dropi_product_id IS NOT NULL) OR
  (origen = 'propio' AND dropi_product_id IS NULL AND dropi_variation_id IS NULL)
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS despacho_estado     text CHECK (despacho_estado IN ('por_despachar','enviado','entregado')),
  ADD COLUMN IF NOT EXISTS tracking            text,
  ADD COLUMN IF NOT EXISTS url_seguimiento     text CHECK (url_seguimiento IS NULL OR url_seguimiento ~ '^https://'),
  ADD COLUMN IF NOT EXISTS despachado_at       timestamptz,
  ADD COLUMN IF NOT EXISTS stock_descontado_at timestamptz;

CREATE OR REPLACE FUNCTION public.shop_descontar_stock(p_order uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  umbral integer;
BEGIN
  -- Reclama el pedido: si ya se descontó (o no está pagado), no hace nada.
  UPDATE public.orders
     SET stock_descontado_at = now()
   WHERE id = p_order AND tipo = 'tienda' AND status = 'pagado' AND stock_descontado_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT umbral_stock INTO umbral FROM public.shop_settings WHERE id;

  UPDATE public.shop_products p
     SET stock = greatest(p.stock - i.cantidad, 0),
         estado = CASE WHEN p.estado = 'publicado' AND p.stock - i.cantidad < coalesce(umbral, 5)
                       THEN 'agotado' ELSE p.estado END,
         updated_at = now()
    FROM (SELECT product_id, sum(cantidad)::integer AS cantidad
            FROM public.order_items WHERE order_id = p_order GROUP BY product_id) i
   WHERE p.id = i.product_id AND p.origen = 'propio';

  UPDATE public.orders o
     SET despacho_estado = 'por_despachar'
   WHERE o.id = p_order AND EXISTS (
     SELECT 1 FROM public.order_items i JOIN public.shop_products p ON p.id = i.product_id
      WHERE i.order_id = p_order AND p.origen = 'propio');

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.shop_descontar_stock(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shop_descontar_stock(uuid) TO service_role;

-- Fotos de productos propios: lectura pública (son fotos de catálogo), escritura
-- solo con URL firmada que entrega el panel admin. Sin políticas en storage.objects.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shop-images', 'shop-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
