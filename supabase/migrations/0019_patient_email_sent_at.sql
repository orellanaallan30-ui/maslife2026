-- Registra cuándo se envió con éxito el correo de confirmación/comprobante a la
-- paciente. notified_at solo indica que alguien reclamó el envío (antes de enviar),
-- por lo que no sirve para detectar correos que fallaron.
alter table public.appointments
  add column if not exists patient_email_sent_at timestamptz;

-- Citas ya notificadas: se asume enviado para no duplicar correos al desplegar.
update public.appointments
   set patient_email_sent_at = notified_at
 where notified_at is not null
   and patient_email_sent_at is null;
