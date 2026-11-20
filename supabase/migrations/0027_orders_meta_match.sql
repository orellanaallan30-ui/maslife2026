-- Identificadores del navegador del comprador, para que la venta informada a Meta
-- desde el servidor (Conversions API) calce con el anuncio. No son datos de salud.
alter table public.orders
  add column if not exists client_ua text,
  add column if not exists meta_fbp  text,
  add column if not exists meta_fbc  text;

comment on column public.orders.client_ua is 'User agent del navegador al crear el pedido (Meta lo exige en eventos de sitio web).';
comment on column public.orders.meta_fbp  is 'Cookie _fbp del píxel de Meta, si existía.';
comment on column public.orders.meta_fbc  is 'Cookie _fbc (clic en un anuncio), si existía.';
