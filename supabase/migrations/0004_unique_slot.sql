-- C1: Prevent double-booking race condition
-- Ensures no two appointments can share the same professional + date + time slot.
-- Status 'Cancelado' is excluded so cancelled slots can be re-booked.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS recurrence_id   UUID,
  ADD COLUMN IF NOT EXISTS recurrence_type TEXT CHECK (recurrence_type IN ('none','weekly','monthly','permanent')),
  ADD COLUMN IF NOT EXISTS block_mode      TEXT CHECK (block_mode IN ('blocked','remote_only','presential_only'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_slot_active
  ON appointments (professional_id, date, time)
  WHERE status <> 'Cancelado';
