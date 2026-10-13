-- ============================================================================
-- Venta de productos digitales propios (programa de ejercicios en PDF).
--
-- `orders`: un pedido por intento de compra. Solo el servidor (service_role)
-- lee y escribe: RLS queda activada SIN políticas, así que ni el cliente anónimo
-- ni un profesional logueado pueden ver correos ni enlaces de otros compradores.
-- El enlace de descarga se guarda como hash (sha256): en la base nunca queda el
-- token en claro.
--
-- Bucket `ebook-files`: PRIVADO, solo PDF. Sin políticas sobre storage.objects,
-- solo service_role puede leer; el comprador recibe una URL firmada de pocos
-- segundos generada en el servidor tras validar su token.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug        text        NOT NULL,
  buyer_name          text        NOT NULL,
  buyer_email         text        NOT NULL,
  amount              integer     NOT NULL CHECK (amount > 0),
  currency            text        NOT NULL DEFAULT 'CLP',
  status              text        NOT NULL DEFAULT 'pendiente'
                                  CHECK (status IN ('pendiente','pagado','cancelado','reembolsado')),
  mp_preference_id    text,
  mp_payment_id       text,
  download_token_hash text,
  expires_at          timestamptz,
  download_count      integer     NOT NULL DEFAULT 0,
  max_downloads       integer     NOT NULL DEFAULT 5,
  delivered_at        timestamptz,
  paid_at             timestamptz,
  accepted_terms_at   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Un mismo pago de MercadoPago no puede acreditar dos pedidos.
CREATE UNIQUE INDEX IF NOT EXISTS orders_mp_payment_id_uq
  ON public.orders (mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_buyer_email_idx ON public.orders (lower(buyer_email));
CREATE INDEX IF NOT EXISTS orders_token_hash_idx ON public.orders (download_token_hash) WHERE download_token_hash IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ebook-files', 'ebook-files', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
