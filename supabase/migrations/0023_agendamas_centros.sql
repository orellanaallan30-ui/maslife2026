-- AgendaMas, etapa 1: centros con recepción, boxes y reporte de horas.
--
-- Migración ADITIVA: no cambia ninguna política existente de appointments,
-- patients ni professionals. Un profesional sin centro no nota diferencia.
--
-- Todas las tablas nuevas tienen RLS activada y NINGUNA política: el navegador
-- no puede leerlas ni escribirlas. Todo pasa por el servidor (api/_lib/center.ts,
-- con service role), que verifica la membresía y el rol y devuelve solo las
-- columnas permitidas (recepción nunca recibe datos clínicos).

create extension if not exists btree_gist;

-- ── Centro ───────────────────────────────────────────────────────────────
create table if not exists public.centers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  address     text,
  city        text,
  phone       text,
  logo_url    text,
  owner_id    uuid not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now()
);
alter table public.centers enable row level security;

-- ── Personas del centro y su rol ─────────────────────────────────────────
-- admin:       administra el centro (equipo, boxes, reporte, agenda).
-- recepcion:   agenda, contacto de pacientes, boxes y reporte. Sin ficha clínica.
-- profesional: atiende; su agenda queda visible para el centro solo si aceptó.
create table if not exists public.center_members (
  id               uuid primary key default gen_random_uuid(),
  center_id        uuid not null references public.centers(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null check (role in ('admin', 'recepcion', 'profesional')),
  -- Si la persona también atiende pacientes: su id en professionals (= user_id).
  professional_id  uuid,
  status           text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  name             text,
  email            text,
  created_at       timestamptz not null default now(),
  unique (center_id, user_id)
);
create index if not exists center_members_user_idx on public.center_members (user_id);
create index if not exists center_members_pro_idx on public.center_members (professional_id);
alter table public.center_members enable row level security;

-- ── Boxes ────────────────────────────────────────────────────────────────
create table if not exists public.boxes (
  id          uuid primary key default gen_random_uuid(),
  center_id   uuid not null references public.centers(id) on delete cascade,
  name        text not null,
  color       text,
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists boxes_center_idx on public.boxes (center_id);
alter table public.boxes enable row level security;

-- ── Horario de box asignado a un profesional ─────────────────────────────
create table if not exists public.box_assignments (
  id               uuid primary key default gen_random_uuid(),
  center_id        uuid not null references public.centers(id) on delete cascade,
  box_id           uuid not null references public.boxes(id) on delete cascade,
  professional_id  uuid not null,
  date             date not null,
  start_time       time not null,
  end_time         time not null,
  recurrence_id    uuid,
  notes            text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  check (end_time > start_time),
  -- La base de datos garantiza que un box no tenga dos profesionales a la vez…
  constraint box_sin_doble_uso exclude using gist (
    box_id with =,
    tsrange((date + start_time), (date + end_time)) with &&
  ),
  -- …y que un profesional no esté en dos boxes a la vez.
  constraint profesional_en_un_solo_box exclude using gist (
    professional_id with =,
    tsrange((date + start_time), (date + end_time)) with &&
  )
);
create index if not exists box_assignments_center_date_idx on public.box_assignments (center_id, date);
alter table public.box_assignments enable row level security;

-- ── Registro de acciones del centro (quién hizo qué) ─────────────────────
create table if not exists public.center_audit (
  id          uuid primary key default gen_random_uuid(),
  center_id   uuid not null references public.centers(id) on delete cascade,
  actor_id    uuid not null,
  actor_role  text,
  action      text not null,
  entity      text,
  entity_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists center_audit_center_idx on public.center_audit (center_id, created_at desc);
alter table public.center_audit enable row level security;

-- ── Citas: a qué centro y box pertenecen, y quién las creó ───────────────
alter table public.appointments add column if not exists center_id  uuid;
alter table public.appointments add column if not exists box_id     uuid;
alter table public.appointments add column if not exists created_by uuid;
create index if not exists appointments_center_date_idx on public.appointments (center_id, date) where center_id is not null;
