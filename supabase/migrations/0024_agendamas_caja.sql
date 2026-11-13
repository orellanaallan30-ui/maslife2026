-- AgendaMas: caja de recepción (cobros a pacientes y cierre de caja diario).
--
-- Aditiva. Como el resto de las tablas de centro: RLS activada y SIN políticas,
-- solo escribe y lee el servidor (api/_lib/center.ts) tras verificar rol.

-- ── Cobros de recepción ──────────────────────────────────────────────────
create table if not exists public.center_payments (
  id               uuid primary key default gen_random_uuid(),
  center_id        uuid not null references public.centers(id) on delete cascade,
  appointment_id   uuid not null,
  professional_id  uuid not null,
  patient_id       uuid,
  amount           integer not null check (amount >= 0),
  method           text not null check (method in ('efectivo', 'transferencia', 'debito', 'credito', 'otro')),
  reference        text,
  note             text,
  received_by      uuid not null,
  after_close      boolean not null default false,
  created_at       timestamptz not null default now(),
  -- Un cobro no se borra: se anula, con motivo y quién lo hizo.
  voided_at        timestamptz,
  voided_by        uuid,
  void_reason      text
);
-- Un solo cobro vigente por cita.
create unique index if not exists center_payments_una_vigente
  on public.center_payments (appointment_id) where voided_at is null;
create index if not exists center_payments_center_fecha_idx
  on public.center_payments (center_id, created_at desc);
alter table public.center_payments enable row level security;

-- ── Cierre de caja diario ────────────────────────────────────────────────
create table if not exists public.center_cash_closings (
  id            uuid primary key default gen_random_uuid(),
  center_id     uuid not null references public.centers(id) on delete cascade,
  date          date not null,
  expected      jsonb not null,           -- total esperado por medio de pago
  counted_cash  integer not null check (counted_cash >= 0),
  difference    integer not null,         -- efectivo contado - efectivo esperado
  note          text,
  closed_by     uuid not null,
  closed_at     timestamptz not null default now(),
  unique (center_id, date)
);
alter table public.center_cash_closings enable row level security;
