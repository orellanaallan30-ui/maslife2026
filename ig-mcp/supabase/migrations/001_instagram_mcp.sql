-- Tablas del MCP de Instagram de Más Life.
-- RLS activado y sin políticas: solo el service role (el servidor) puede leer y escribir.

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'reel', 'carousel', 'story')),
  payload jsonb not null,
  publish_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'published', 'error', 'cancelled')),
  creation_id text,
  media_id text,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scheduled_posts_due_idx on public.scheduled_posts (status, publish_at);

create table if not exists public.keyword_rules (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  dm_message text,
  public_reply text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.processed_comments (
  comment_id text primary key,
  rule_id uuid references public.keyword_rules (id) on delete set null,
  error text,
  created_at timestamptz not null default now()
);

alter table public.scheduled_posts enable row level security;
alter table public.keyword_rules enable row level security;
alter table public.processed_comments enable row level security;

-- OPCIONAL: si tu plan de Vercel solo permite cron diario (Hobby),
-- usa pg_cron + pg_net de Supabase para llamar al endpoint cada 10 minutos.
-- Activa las extensiones pg_cron y pg_net en el panel y reemplaza los valores:
--
-- select cron.schedule('ig-publicar', '*/10 * * * *', $$
--   select net.http_get(
--     url := 'https://TU-PROYECTO.vercel.app/api/cron/publish',
--     headers := jsonb_build_object('Authorization', 'Bearer TU_CRON_SECRET')
--   );
-- $$);
