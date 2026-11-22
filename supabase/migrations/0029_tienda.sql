-- ============================================================================
-- Tienda MasLife (dropshipping con Dropi Chile) — etapa 2: catálogo, precios y checkout.
--
-- Todas las tablas nuevas tienen RLS ACTIVADA y SIN políticas: solo el servidor
-- (service_role) las lee y escribe, igual que `orders` (0020).
-- Los compradores van en `shop_customers`, NUNCA en `patients` (ficha clínica,
-- Ley 20.584).
-- La cola de pedidos a Dropi, el seguimiento y la conciliación van en una
-- migración posterior (etapas 3 a 5).
-- ============================================================================

-- ── Ajustes (una sola fila) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id                  boolean     PRIMARY KEY DEFAULT true CHECK (id),
  margen              numeric(5,4) NOT NULL DEFAULT 0.35   CHECK (margen >= 0 AND margen < 0.9),
  comision_pct        numeric(5,4) NOT NULL DEFAULT 0.0399 CHECK (comision_pct >= 0 AND comision_pct < 0.2),
  umbral_stock        integer     NOT NULL DEFAULT 5  CHECK (umbral_stock >= 0),
  retencion_min       integer     NOT NULL DEFAULT 15 CHECK (retencion_min BETWEEN 0 AND 1440),
  contra_entrega      boolean     NOT NULL DEFAULT false,
  -- Interruptor general: mientras sea false, ningún pedido sale hacia Dropi.
  envio_dropi_activo  boolean     NOT NULL DEFAULT false,
  -- Código de región Dropi (RM, VS, ...) → tarifa de envío en CLP.
  tarifas_region      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  tienda_activa       boolean     NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (margen + comision_pct < 0.9)
);
INSERT INTO public.shop_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

-- ── Productos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shop_products (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                   text        NOT NULL UNIQUE CHECK (sku ~ '^[A-Z0-9-]{3,40}$'),
  dropi_product_id      bigint      NOT NULL,
  dropi_variation_id    bigint,
  supplier_id           bigint,
  nombre                text        NOT NULL CHECK (length(nombre) BETWEEN 2 AND 200),
  descripcion           text        NOT NULL DEFAULT '',
  imagenes              text[]      NOT NULL DEFAULT '{}',
  categoria             text        NOT NULL CHECK (categoria IN ('salud','suplementos','rehabilitacion','bienestar')),
  costo                 integer     NOT NULL CHECK (costo > 0),
  envio_estimado        integer     NOT NULL DEFAULT 0 CHECK (envio_estimado >= 0),
  precio_venta          integer     NOT NULL CHECK (precio_venta > 0),
  stock                 integer     NOT NULL DEFAULT 0 CHECK (stock >= 0),
  estado                text        NOT NULL DEFAULT 'borrador'
                                    CHECK (estado IN ('borrador','publicado','agotado','pausado')),
  consumible            boolean     NOT NULL DEFAULT false,
  dias_recompra         integer     NOT NULL DEFAULT 23 CHECK (dias_recompra BETWEEN 1 AND 365),
  resolucion_sanitaria  text,
  aprobado_por          text,
  aprobado_at           timestamptz,
  sincronizado_at       timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- Nada se publica sin el visto bueno de Rodrigo.
  CONSTRAINT shop_products_publicado_aprobado
    CHECK (estado NOT IN ('publicado','agotado') OR aprobado_at IS NOT NULL),
  -- Un suplemento no se publica sin su resolución sanitaria (SEREMI).
  CONSTRAINT shop_products_suplemento_resolucion
    CHECK (categoria <> 'suplementos' OR estado IN ('borrador','pausado')
           OR coalesce(btrim(resolucion_sanitaria), '') <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS shop_products_dropi_uq
  ON public.shop_products (dropi_product_id, coalesce(dropi_variation_id, 0));
CREATE INDEX IF NOT EXISTS shop_products_estado_idx ON public.shop_products (estado);
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;

-- ── Clientes de la tienda (no pacientes) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shop_customers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text        NOT NULL CHECK (length(nombre) BETWEEN 2 AND 120),
  email       text        NOT NULL,
  telefono    text        NOT NULL CHECK (telefono ~ '^\+?[0-9]{8,15}$'),
  rut         text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shop_customers_email_uq ON public.shop_customers (lower(email));
ALTER TABLE public.shop_customers ENABLE ROW LEVEL SECURITY;

-- ── Pedidos: la tabla de la guía digital se amplía sin cambiar lo existente ─
ALTER TABLE public.orders ALTER COLUMN product_slug DROP NOT NULL;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tipo         text NOT NULL DEFAULT 'ebook' CHECK (tipo IN ('ebook','tienda')),
  ADD COLUMN IF NOT EXISTS customer_id  uuid REFERENCES public.shop_customers(id),
  ADD COLUMN IF NOT EXISTS region       text,
  ADD COLUMN IF NOT EXISTS comuna       text,
  ADD COLUMN IF NOT EXISTS direccion    text,
  ADD COLUMN IF NOT EXISTS envio_monto  integer CHECK (envio_monto IS NULL OR envio_monto >= 0),
  ADD COLUMN IF NOT EXISTS transportista text,
  ADD COLUMN IF NOT EXISTS metodo_pago  text NOT NULL DEFAULT 'online' CHECK (metodo_pago IN ('online','contra_entrega'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tipo_datos;
ALTER TABLE public.orders ADD CONSTRAINT orders_tipo_datos CHECK (
  (tipo = 'ebook'  AND product_slug IS NOT NULL) OR
  (tipo = 'tienda' AND customer_id IS NOT NULL AND region IS NOT NULL
                   AND comuna IS NOT NULL AND direccion IS NOT NULL AND envio_monto IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS orders_tipo_idx ON public.orders (tipo, status);

-- ── Líneas del pedido: precio y costo congelados al momento de comprar ─────
CREATE TABLE IF NOT EXISTS public.order_items (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid    NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id       uuid    NOT NULL REFERENCES public.shop_products(id),
  sku              text    NOT NULL,
  nombre           text    NOT NULL,
  cantidad         integer NOT NULL CHECK (cantidad BETWEEN 1 AND 10),
  precio_unitario  integer NOT NULL CHECK (precio_unitario > 0),
  costo_unitario   integer NOT NULL CHECK (costo_unitario > 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items (order_id);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ── Tareas programadas (Vercel Hobby solo permite cron diario) ─────────────
-- Igual que ig_mcp_cron (0025): pg_cron + pg_net, con el secreto en Vault
-- (nombre `shop_cron_secret`, el mismo valor que SHOP_CRON_SECRET en Vercel).
-- Mientras el secreto no exista, la función no hace nada.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.tienda_cron(tarea text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  secreto text;
BEGIN
  IF tarea NOT IN ('stock') THEN
    RETURN;
  END IF;
  SELECT decrypted_secret INTO secreto
    FROM vault.decrypted_secrets
   WHERE name = 'shop_cron_secret'
   LIMIT 1;
  IF secreto IS NULL OR length(secreto) < 16 THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'https://clinicamaslife.cl/api/book-appointment',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secreto, 'Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'shop-cron', 'task', tarea),
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tienda_cron(text) FROM public, anon, authenticated;

SELECT cron.unschedule('tienda-stock') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tienda-stock');
SELECT cron.schedule('tienda-stock', '17 */6 * * *', $$select public.tienda_cron('stock')$$);
