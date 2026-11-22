-- ============================================================================
-- Tienda: checkout sin pedidos duplicados.
--
-- - orders.checkout_key: UUID que el navegador genera por intento de pago. Si la
--   misma solicitud llega dos veces (doble clic, reintento de red), el servidor
--   devuelve el mismo link de pago en vez de crear otro pedido.
-- - orders.mp_init_point: link de pago de MercadoPago guardado para reutilizarlo.
-- Las órdenes existentes (guía digital) no cambian: ambas columnas quedan NULL.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_key  uuid,
  ADD COLUMN IF NOT EXISTS mp_init_point text CHECK (mp_init_point IS NULL OR mp_init_point ~ '^https://');

CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_key_uq
  ON public.orders (checkout_key) WHERE checkout_key IS NOT NULL;
