-- Atribución de ventas: de qué anuncio/campaña llegó cada pedido (UTM del enlace).
-- Son datos de marketing, no personales; nullable y acotados en largo.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS utm_source   text CHECK (utm_source   IS NULL OR char_length(utm_source)   <= 100),
  ADD COLUMN IF NOT EXISTS utm_medium   text CHECK (utm_medium   IS NULL OR char_length(utm_medium)   <= 100),
  ADD COLUMN IF NOT EXISTS utm_campaign text CHECK (utm_campaign IS NULL OR char_length(utm_campaign) <= 100),
  ADD COLUMN IF NOT EXISTS utm_content  text CHECK (utm_content  IS NULL OR char_length(utm_content)  <= 100);
