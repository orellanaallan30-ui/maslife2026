-- MCP de Instagram de Clínica Mas Life (proyecto Vercel maslife-instagram-mcp, carpeta ig-mcp/).
-- Tablas con RLS activado y sin políticas: solo el service role (el servidor) lee y escribe.

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
create index if not exists processed_comments_rule_idx on public.processed_comments (rule_id);

alter table public.scheduled_posts enable row level security;
alter table public.keyword_rules enable row level security;
alter table public.processed_comments enable row level security;

-- Publicaciones programadas: Vercel Hobby no permite cron cada 10 minutos, así que
-- lo dispara pg_cron. El CRON_SECRET vive en Vault (nombre ig_mcp_cron_secret);
-- mientras no exista, la función no hace nada.
create extension if not exists pg_net with schema extensions;

create or replace function public.ig_mcp_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secreto text;
begin
  select decrypted_secret into secreto
    from vault.decrypted_secrets
   where name = 'ig_mcp_cron_secret'
   limit 1;
  if secreto is null or length(secreto) < 16 then
    return;
  end if;
  perform net.http_get(
    url := 'https://maslife-instagram-mcp.vercel.app/api/cron/publish',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secreto),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.ig_mcp_cron() from public, anon, authenticated;

select cron.unschedule('ig-publicar') where exists (select 1 from cron.job where jobname = 'ig-publicar');
select cron.schedule('ig-publicar', '*/10 * * * *', 'select public.ig_mcp_cron()');
