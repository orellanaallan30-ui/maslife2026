-- 0015 — Arreglar la eliminación permanente de pacientes.
--
-- Causa raíz: la tabla soap_versions (historial inmutable de versiones SOAP)
-- tenía dos reglas `DO INSTEAD NOTHING` (soap_versions_no_delete / _no_update)
-- para hacerla append-only. Efecto colateral: al eliminar un paciente, el
-- ON DELETE CASCADE de patients disparaba un DELETE interno sobre soap_versions
-- que la regla reescribía a "nada" (SPI_OK_REWRITTEN != SPI_OK_DELETE), lo que
-- Postgres reporta como:
--   "referential integrity query on patients from constraint
--    soap_versions_patient_id_fkey on soap_versions gave unexpected result".
-- Además, el DELETE explícito de soap_versions en _delete_patient_data era un
-- no-op silencioso por la misma regla. Resultado: el botón "Eliminar paciente"
-- fallaba siempre.
--
-- Solución: reemplazar las reglas globales por un trigger de inmutabilidad que
-- sigue bloqueando UPDATE/DELETE en operación normal, pero permite el DELETE
-- SÓLO durante la purga autorizada de un paciente (flag local a la transacción
-- que fija _delete_patient_data). La inmutabilidad clínica se mantiene; la
-- eliminación autorizada por el profesional dueño vuelve a funcionar.
-- RLS de soap_versions ya impedía UPDATE/DELETE a los clientes (sólo hay
-- políticas SELECT/INSERT), así que quitar las reglas no abre ninguna vía nueva.

-- 1) Quitar las reglas que también rompían la eliminación de pacientes.
drop rule if exists soap_versions_no_delete on public.soap_versions;
drop rule if exists soap_versions_no_update on public.soap_versions;

-- 2) Guardia de inmutabilidad como trigger (permite la purga autorizada).
create or replace function public.soap_versions_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'soap_versions es inmutable: UPDATE no permitido';
  end if;
  -- DELETE: sólo durante la purga autorizada de un paciente.
  if coalesce(current_setting('app.allow_soap_purge', true), '') <> 'on' then
    raise exception 'soap_versions es inmutable: DELETE no permitido';
  end if;
  return old;
end;
$$;

drop trigger if exists soap_versions_immutable on public.soap_versions;
create trigger soap_versions_immutable
  before update or delete on public.soap_versions
  for each row execute function public.soap_versions_guard();

-- 3) Asegurar la FK con ON DELETE CASCADE (idempotente).
alter table public.soap_versions
  drop constraint if exists soap_versions_patient_id_fkey;
alter table public.soap_versions
  add constraint soap_versions_patient_id_fkey
  foreign key (patient_id) references public.patients(id) on delete cascade;

-- 4) _delete_patient_data: fija el flag de purga y borra todo lo del paciente.
create or replace function public._delete_patient_data(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Habilita el DELETE de soap_versions sólo dentro de esta transacción.
  perform set_config('app.allow_soap_purge', 'on', true);

  delete from soap_entries       where patient_id = p_id;
  delete from soap_versions      where patient_id = p_id;
  delete from informed_consents  where patient_id = p_id;
  delete from appointments       where patient_id = p_id;
  -- Biofeedback: rutinas y planes referencian al paciente; sus hijas
  -- (items, sesiones, evidencia, mensajes, filas de plan) caen en cascada.
  delete from exercise_routines  where patient_id = p_id;
  delete from meal_plans         where patient_id = p_id;
  delete from pro_notifications  where patient_id = p_id;
  delete from patients           where id = p_id;
end;
$$;

-- 5) delete_patient_cascade: valida dueño y delega (sin cambios de lógica).
create or replace function public.delete_patient_cascade(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from patients where id = p_id and professional_id = auth.uid()) then
    raise exception 'No autorizado o paciente inexistente';
  end if;
  perform public._delete_patient_data(p_id);
end;
$$;
