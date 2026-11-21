-- Temas que los visitantes y compradores proponen para próximas guías.
-- Se escribe solo desde el servidor (acción guide-suggestion de /api/book-appointment)
-- y se lee desde el panel admin. Sin políticas: el navegador no lee ni escribe directo.
create table if not exists public.guide_suggestions (
  id uuid primary key default gen_random_uuid(),
  tema text not null check (char_length(tema) between 3 and 400),
  email text check (email is null or char_length(email) <= 200),
  product_slug text check (product_slug is null or char_length(product_slug) <= 80),
  origen text check (origen is null or char_length(origen) <= 40),
  created_at timestamptz not null default now()
);
alter table public.guide_suggestions enable row level security;
revoke all on public.guide_suggestions from anon, authenticated;
create index if not exists guide_suggestions_created_idx on public.guide_suggestions (created_at desc);
