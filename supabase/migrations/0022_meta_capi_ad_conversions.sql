-- Medición de ventas de anuncios (Meta Conversions API).
-- Aplicada en producción el 2026-11-10; se deja aquí para que el repositorio
-- refleje la base de datos.
alter table public.patients add column if not exists lead_source text
  check (lead_source is null or lead_source in ('meta_ads','instagram_organico','recomendacion','google','otro'));
alter table public.patients add column if not exists ad_consent boolean not null default false;
alter table public.transactions add column if not exists patient_id uuid;

create table if not exists public.ad_conversions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null,
  patient_id uuid,
  transaction_id uuid,
  amount integer not null,
  event_id text not null unique,
  event_time timestamptz not null,
  status text not null check (status in ('sent','error')),
  meta_response jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ad_conversions_pro_idx on public.ad_conversions (professional_id, created_at desc);
alter table public.ad_conversions enable row level security;
-- El profesional solo lee las suyas; solo el servidor (service role) escribe.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ad_conversions' and policyname = 'ad_conversions_select_own') then
    create policy ad_conversions_select_own on public.ad_conversions for select using (professional_id = auth.uid());
  end if;
end $$;
